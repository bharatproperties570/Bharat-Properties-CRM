import StorageAdapter from './StorageAdapter.js';
import { Capabilities } from '../Capabilities.js';
import {
    StorageError,
    ObjectNotFoundError,
    InvalidObjectKeyError,
    ProviderUnavailableError,
    ProviderConfigurationError,
    ObjectConflictError
} from '../StorageErrors.js';
import { Readable } from 'stream';
import crypto from 'crypto';

const DEFAULT_CAPABILITIES = [
    Capabilities.PUT,
    Capabilities.READ,
    Capabilities.DELETE,
    Capabilities.HEAD,
    Capabilities.COPY,
    Capabilities.ENUMERATE,
    Capabilities.PRESIGNED_READ
];

/**
 * Resolves the secret required to sign and verify document access tokens.
 * Strict security requirement:
 * - In production/staging: DOCUMENT_SIGNED_URL_SECRET is mandatory.
 * - In development/test: DOCUMENT_SIGNED_URL_SECRET or JWT_SECRET is accepted.
 * - Hardcoded fallbacks are strictly forbidden.
 * - Minimum secret length of 16 characters is enforced.
 */
export function resolveDocumentSigningSecret(explicitSecret = null) {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    const candidate = explicitSecret || process.env.DOCUMENT_SIGNED_URL_SECRET || (!isProduction ? process.env.JWT_SECRET : null);

    if (!candidate || typeof candidate !== 'string' || !candidate.trim()) {
        const message = isProduction
            ? 'CRITICAL SECURITY: DOCUMENT_SIGNED_URL_SECRET is strictly required in production/staging. Runtime fails closed.'
            : 'CRITICAL SECURITY: DOCUMENT_SIGNED_URL_SECRET or JWT_SECRET must be configured for signed URLs. Runtime fails closed.';
        const err = new ProviderConfigurationError('SIGNED_URL', message);
        err.code = 'SIGNING_SECRET_MISSING';
        throw err;
    }

    const trimmed = candidate.trim();
    if (trimmed.length < 16) {
        const err = new ProviderConfigurationError(
            'SIGNED_URL',
            'CRITICAL SECURITY: DOCUMENT_SIGNED_URL_SECRET is invalid or too weak (minimum 16 characters required). Runtime fails closed.'
        );
        err.code = 'SIGNING_SECRET_INVALID';
        throw err;
    }

    return trimmed;
}

/**
 * Enterprise Google Drive Storage Adapter
 * 
 * Provides first-class, private-by-default document and media storage in Google Drive.
 * Complies strictly with Bharat Properties CRM Security and Provider Contract:
 * - Private by default: files remain private to the application / authorized service account.
 * - NEVER enables public "anyone with link" permissions automatically.
 * - Stores Google Drive file IDs, MIME types, checksums, and byte sizes.
 * - Normalizes Google API errors to canonical StorageErrors.
 * - Resilient exponential backoff retry for transient rate-limit (429) and backend (500/503) errors.
 * - Guarantees fresh, unconsumed streams on every retry attempt.
 * - Uses deterministic object identity to prevent duplicate files on lost responses.
 * - Provides cryptographically signed, short-lived backend-mediated access URLs (PRESIGNED_READ).
 * - Never exposes OAuth tokens or service account credentials to client frontend.
 */
export default class GoogleDriveStorageAdapter extends StorageAdapter {
    constructor(providerInstanceId, configuration = {}, capabilities = DEFAULT_CAPABILITIES, deps = {}) {
        super(providerInstanceId, configuration, capabilities);

        this.driveClient = deps.driveClient || null;
        this.getDriveService = deps.getDriveService || null;
        this.tokenSigner = deps.tokenSigner || null;
        this._fileIdMap = new Map(); // Local in-memory cache for fast key -> fileId resolution
        this._inflightPuts = new Map(); // Mutex to prevent duplicate uploads during concurrent retries
    }

    /**
     * Resolves and verifies the active Google Drive API client.
     */
    async _getDriveClient() {
        if (this.driveClient) {
            return this.driveClient;
        }

        if (this.getDriveService) {
            this.driveClient = await this.getDriveService();
        } else {
            const { getDriveService } = await import('../../../utils/googleAuth.js');
            this.driveClient = await getDriveService();
        }

        if (!this.driveClient) {
            throw new ProviderUnavailableError(
                this.providerInstanceId,
                'Google Drive authentication failed or client is not configured'
            );
        }

        return this.driveClient;
    }

    /**
     * Validates logical object key to prevent directory traversal or empty keys.
     */
    _resolveProviderKey(logicalKey) {
        if (!logicalKey || typeof logicalKey !== 'string') {
            throw new InvalidObjectKeyError(logicalKey);
        }
        if (logicalKey.includes('..') || logicalKey.startsWith('/')) {
            throw new InvalidObjectKeyError(logicalKey, 'Path traversal detected');
        }
        return logicalKey;
    }

    /**
     * Translates Google Drive API errors to standard StorageError hierarchy.
     */
    _translateError(err, operation, objectKey = null) {
        if (err instanceof StorageError) return err;

        const status = err.code || err.status || err.response?.status;
        const message = err.message || '';

        if (status === 404 || message.includes('File not found') || message.includes('notFound')) {
            return new ObjectNotFoundError(this.providerInstanceId, objectKey);
        }

        if (status === 401 || (status === 403 && (message.includes('auth') || message.includes('credential') || message.includes('invalid_grant')))) {
            return new ProviderConfigurationError(
                this.providerInstanceId,
                `Google Drive authentication or configuration failed during ${operation}: ${message}`
            );
        }

        if (status === 429 || status === 500 || status === 503 ||
            status === 'ECONNRESET' || status === 'ETIMEDOUT' || status === 'ENOTFOUND' || status === 'EAI_AGAIN' ||
            message.includes('rateLimitExceeded') || message.includes('userRateLimitExceeded') ||
            message.includes('backendError') || message.includes('ECONNRESET') || message.includes('ETIMEDOUT') ||
            message.includes('timed out') || message.includes('timeout')) {
            return new ProviderUnavailableError(
                this.providerInstanceId,
                `Google Drive network or rate limit error during ${operation}: ${message}`
            );
        }

        if (status === 409 || message.includes('conflict')) {
            return new ObjectConflictError(
                this.providerInstanceId,
                objectKey,
                `Google Drive conflict during ${operation}: ${message}`
            );
        }

        return new StorageError(
            `Google Drive operation [${operation}] failed on instance ${this.providerInstanceId}: ${message}`,
            err
        );
    }

    /**
     * Executes an operation with exponential backoff retry for transient Google API errors.
     * Invokes onAttemptFailure callback if provided to allow cleanup of partial attempts.
     */
    async _executeWithRetry(operationFn, operationName, objectKey = null, maxRetries = 3, baseDelayMs = 150, onAttemptFailure = null) {
        let attempt = 0;
        while (true) {
            attempt++;
            try {
                return await operationFn(attempt);
            } catch (err) {
                if (onAttemptFailure && typeof onAttemptFailure === 'function') {
                    try {
                        await onAttemptFailure(err, attempt);
                    } catch (cleanupErr) {
                        // Cleanup error should not mask primary failure
                    }
                }

                // If search failure occurred during retry idempotency check, fail closed immediately
                if (err.isSearchFailure) {
                    throw this._translateError(err, operationName, objectKey);
                }

                const status = err.code || err.status || err.response?.status;
                const message = err.message || '';
                const isTransient = status === 429 || status === 500 || status === 503 ||
                    status === 'ECONNRESET' || status === 'ETIMEDOUT' ||
                    message.includes('rateLimitExceeded') || message.includes('userRateLimitExceeded') ||
                    message.includes('backendError') || message.includes('ECONNRESET') || message.includes('ETIMEDOUT') ||
                    message.includes('Connection reset') || message.includes('Premature close') || message.includes('stream interrupted');

                if (isTransient && attempt <= maxRetries) {
                    const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
                    await new Promise(res => setTimeout(res, delay));
                    continue;
                }
                throw this._translateError(err, operationName, objectKey);
            }
        }
    }

    /**
     * Checks if a file with the deterministic objectKey in appProperties already exists in Google Drive.
     * Prevents duplicate files when an upload succeeds on Google's servers but the client response is lost.
     * 
     * Fail-closed contract:
     * - Throws ProviderUnavailableError if driveClient.files.list is missing or not a function.
     * - Throws ProviderUnavailableError if response is malformed.
     * - Throws translated ProviderUnavailableError on 429, 500, 503, ECONNRESET, ETIMEDOUT.
     * - Only returns null when Google Drive successfully completed search and confirmed 0 results.
     */
    async _findExistingFileByObjectKey(objectKey, folderId = null) {
        const driveClient = await this._getDriveClient();
        if (!driveClient?.files?.list || typeof driveClient.files.list !== 'function') {
            const err = new ProviderUnavailableError(
                this.providerInstanceId,
                'Google Drive files.list capability is unavailable or not implemented by driveClient'
            );
            err.isSearchFailure = true;
            throw err;
        }

        try {
            const escapedKey = objectKey.replace(/'/g, "\\'");
            let q = `appProperties has { key='objectKey' and value='${escapedKey}' } and trashed = false`;
            if (folderId) {
                q += ` and '${folderId}' in parents`;
            }
            const res = await driveClient.files.list({
                q,
                fields: 'files(id, name, mimeType, size, md5Checksum, webViewLink, webContentLink, createdTime, modifiedTime)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                pageSize: 1
            });

            // Validate response shape: never return null unless search completed and confirmed 0 results
            if (!res || typeof res !== 'object' || !res.data || !Array.isArray(res.data.files)) {
                const malformedErr = new ProviderUnavailableError(
                    this.providerInstanceId,
                    'Google Drive files.list returned a malformed or non-array response'
                );
                malformedErr.isSearchFailure = true;
                throw malformedErr;
            }

            if (res.data.files.length > 0) {
                return res.data.files[0]; // Confirmed match
            }
            return null; // Confirmed zero results from valid search
        } catch (err) {
            // Search failure must fail closed: never silently treat search failure as a no-match
            if (err.isSearchFailure) {
                throw err;
            }
            const normErr = this._translateError(err, 'SEARCH_EXISTING', objectKey);
            normErr.isSearchFailure = true;
            throw normErr;
        }
    }

    /**
     * Normalizes payload into a deterministic streamFactory and payload identity.
     */
    async _normalizePayload(data, options = {}) {
        if (options.checksum) {
            const payloadIdentity = `chk:${options.checksum}`;
            let streamFactory;
            if (typeof data === 'function') {
                streamFactory = data;
            } else if (Buffer.isBuffer(data)) {
                const copy = Buffer.from(data);
                streamFactory = () => Readable.from(Buffer.from(copy));
            } else if (typeof data === 'string') {
                const buf = Buffer.from(data);
                streamFactory = () => Readable.from(Buffer.from(buf));
            } else if (data && typeof data.pipe === 'function') {
                const chunks = [];
                for await (const chunk of data) {
                    chunks.push(chunk);
                }
                const buf = Buffer.concat(chunks);
                streamFactory = () => Readable.from(Buffer.from(buf));
            } else {
                throw new StorageError('Invalid data payload for PUT. Expected Buffer, Stream, or Stream Factory.');
            }
            return { streamFactory, payloadIdentity };
        }

        if (options.contentHash) {
            const payloadIdentity = `hash:${options.contentHash}`;
            let streamFactory;
            if (typeof data === 'function') {
                streamFactory = data;
            } else if (Buffer.isBuffer(data)) {
                const copy = Buffer.from(data);
                streamFactory = () => Readable.from(Buffer.from(copy));
            } else if (typeof data === 'string') {
                const buf = Buffer.from(data);
                streamFactory = () => Readable.from(Buffer.from(buf));
            } else if (data && typeof data.pipe === 'function') {
                const chunks = [];
                for await (const chunk of data) {
                    chunks.push(chunk);
                }
                const buf = Buffer.concat(chunks);
                streamFactory = () => Readable.from(Buffer.from(buf));
            } else {
                throw new StorageError('Invalid data payload for PUT. Expected Buffer, Stream, or Stream Factory.');
            }
            return { streamFactory, payloadIdentity };
        }

        if (Buffer.isBuffer(data)) {
            const hash = crypto.createHash('sha256').update(data).digest('hex');
            const copy = Buffer.from(data);
            return {
                streamFactory: () => Readable.from(Buffer.from(copy)),
                payloadIdentity: `sha256:${hash}`
            };
        }

        if (typeof data === 'string') {
            const buf = Buffer.from(data);
            const hash = crypto.createHash('sha256').update(buf).digest('hex');
            return {
                streamFactory: () => Readable.from(Buffer.from(buf)),
                payloadIdentity: `sha256:${hash}`
            };
        }

        if (data && typeof data.pipe === 'function') {
            const chunks = [];
            for await (const chunk of data) {
                chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            const hash = crypto.createHash('sha256').update(buf).digest('hex');
            return {
                streamFactory: () => Readable.from(Buffer.from(buf)),
                payloadIdentity: `sha256:${hash}`
            };
        }

        if (typeof data === 'function') {
            const testStream = data();
            const chunks = [];
            for await (const chunk of testStream) {
                chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            const hash = crypto.createHash('sha256').update(buf).digest('hex');
            return {
                streamFactory: () => Readable.from(Buffer.from(buf)),
                payloadIdentity: `sha256:${hash}`
            };
        }

        throw new StorageError('Invalid data payload for PUT. Expected Buffer, Stream, or Stream Factory.');
    }

    /**
     * Resolves Google Drive fileId from objectKey, options, or metadata.
     */
    async _resolveFileId(objectKey, options = {}) {
        if (options && options.fileId) return options.fileId;
        if (options && options.providerVersionId) return options.providerVersionId;
        if (this._fileIdMap.has(objectKey)) return this._fileIdMap.get(objectKey);

        if (objectKey.startsWith('gdrive:')) {
            return objectKey.substring(7);
        }

        // If objectKey contains no slashes and is an alphanumeric Drive file ID (20+ chars)
        if (!objectKey.includes('/') && /^[a-zA-Z0-9_-]{20,}$/.test(objectKey)) {
            return objectKey;
        }

        // Search Drive files by appProperties
        try {
            const existing = await this._findExistingFileByObjectKey(objectKey, options.folderId);
            if (existing) {
                this._fileIdMap.set(objectKey, existing.id);
                return existing.id;
            }
        } catch (err) {
            // In resolution fallback for non-PUT operations, if search fails, continue to raw objectKey
        }

        return objectKey;
    }

    // ==========================================
    // IMPLEMENTATION OF ABSTRACT STORAGE CONTRACT
    // ==========================================

    /**
     * Upload (PUT)
     * Stores file in Google Drive, maintains privacy (NO public sharing), and captures metadata.
     * Guarantees fresh stream on every retry attempt and prevents duplicate files.
     * Mutex key includes provider, folder, objectKey, and payload identity.
     */
    async _put(objectKey, data, options = {}) {
        this._resolveProviderKey(objectKey);

        const folderId = options.folderId || this.config.parentFolderId || this.config.folderId || undefined;
        const normalizedFolder = folderId || 'default_folder';
        const providerId = this.providerInstanceId || 'google-drive-primary';

        // Normalize payload: compute cryptographic hash and deterministic streamFactory
        const { streamFactory, payloadIdentity } = await this._normalizePayload(data, options);

        // Composite concurrency mutex identity: provider + folder + objectKey + payloadIdentity
        const mutexKey = `${providerId}::${normalizedFolder}::${objectKey}::${payloadIdentity}`;

        // Concurrency mutex: join existing in-flight upload for the exact same logical upload
        if (this._inflightPuts.has(mutexKey)) {
            return await this._inflightPuts.get(mutexKey);
        }

        const putPromise = (async () => {
            const driveClient = await this._getDriveClient();
            const fileName = options.originalFilename || options.filename || objectKey;

            // PRIVATE BY DEFAULT: NO public permissions are created!
            const requestBody = {
                name: fileName,
                mimeType: options.mimeType,
                appProperties: {
                    objectKey: objectKey,
                    uploadedBy: options.userId ? String(options.userId) : 'crm',
                    documentId: options.documentId || '',
                    versionId: options.versionId || ''
                }
            };

            if (folderId) {
                requestBody.parents = [folderId];
            }

            let createdFileId = null;

            const result = await this._executeWithRetry(async (attempt) => {
                // Remote idempotency: if an earlier attempt succeeded remotely but response was lost, avoid duplicate
                if (attempt > 1) {
                    const existingFile = await this._findExistingFileByObjectKey(objectKey, folderId);
                    if (existingFile) {
                        return { data: existingFile };
                    }
                }

                // Generate fresh, unread readable stream for this specific attempt
                const freshMediaStream = streamFactory();

                const response = await driveClient.files.create({
                    requestBody,
                    media: {
                        mimeType: options.mimeType || 'application/octet-stream',
                        body: freshMediaStream
                    },
                    fields: 'id, name, mimeType, size, md5Checksum, webViewLink, webContentLink, createdTime, modifiedTime',
                    supportsAllDrives: true,
                    supportsTeamDrives: true
                });

                if (response?.data?.id) {
                    createdFileId = response.data.id;
                }

                return response;
            }, 'PUT', objectKey, 3, 150, async (err, attempt) => {
                // Partial upload cleanup: If this attempt created a file but threw before completion, clean it up safely
                if (createdFileId) {
                    try {
                        await driveClient.files.delete({ fileId: createdFileId, supportsAllDrives: true });
                    } catch (cleanupErr) {
                        // Ignore cleanup error
                    }
                    createdFileId = null;
                }
            });

            const file = result.data;
            const fileId = file.id;

            // Cache resolution mapping
            this._fileIdMap.set(objectKey, fileId);

            return {
                objectKey,
                fileId,
                providerVersionId: fileId,
                sizeBytes: file.size ? parseInt(file.size, 10) : (options.sizeBytes || null),
                mimeType: file.mimeType || options.mimeType,
                checksum: file.md5Checksum || null,
                etag: file.md5Checksum || null,
                isPrivate: true
            };
        })();

        this._inflightPuts.set(mutexKey, putPromise);

        try {
            return await putPromise;
        } finally {
            this._inflightPuts.delete(mutexKey);
        }
    }

    /**
     * Download / Read (READ)
     * Streams content directly from Google Drive.
     */
    async _read(objectKey, options = {}) {
        this._resolveProviderKey(objectKey);
        const fileId = await this._resolveFileId(objectKey, options);
        const driveClient = await this._getDriveClient();

        return await this._executeWithRetry(async () => {
            const response = await driveClient.files.get(
                { fileId, alt: 'media', supportsAllDrives: true },
                { responseType: 'stream' }
            );

            let metadata = null;
            try {
                const metaRes = await driveClient.files.get({
                    fileId,
                    fields: 'id, name, mimeType, size, md5Checksum',
                    supportsAllDrives: true
                });
                metadata = metaRes.data;
            } catch (metaErr) {
                // Secondary metadata lookup is best-effort
            }

            return {
                stream: response.data,
                mimeType: metadata?.mimeType || response.headers?.['content-type'] || 'application/octet-stream',
                sizeBytes: metadata?.size ? parseInt(metadata.size, 10) : (response.headers?.['content-length'] ? parseInt(response.headers['content-length'], 10) : 0),
                providerVersionId: fileId,
                etag: metadata?.md5Checksum || null
            };
        }, 'READ', objectKey);
    }

    /**
     * Delete (DELETE)
     * Deletes file from Google Drive.
     */
    async _delete(objectKey, options = {}) {
        this._resolveProviderKey(objectKey);
        const fileId = await this._resolveFileId(objectKey, options);
        const driveClient = await this._getDriveClient();

        await this._executeWithRetry(async () => {
            await driveClient.files.delete({
                fileId,
                supportsAllDrives: true,
                supportsTeamDrives: true
            });
        }, 'DELETE', objectKey);

        this._fileIdMap.delete(objectKey);
        return { success: true, fileId, objectKey };
    }

    /**
     * Metadata inspection (HEAD)
     * Retrieves file metadata, size, MIME type, and checksum.
     */
    async _head(objectKey, options = {}) {
        this._resolveProviderKey(objectKey);
        const fileId = await this._resolveFileId(objectKey, options);
        const driveClient = await this._getDriveClient();

        const result = await this._executeWithRetry(async () => {
            return await driveClient.files.get({
                fileId,
                fields: 'id, name, mimeType, size, md5Checksum, createdTime, modifiedTime, trashed, appProperties',
                supportsAllDrives: true,
                supportsTeamDrives: true
            });
        }, 'HEAD', objectKey);

        const data = result.data;
        if (data.trashed) {
            throw new ObjectNotFoundError(this.providerInstanceId, objectKey);
        }

        return {
            objectKey,
            fileId: data.id,
            sizeBytes: data.size ? parseInt(data.size, 10) : 0,
            mimeType: data.mimeType || 'application/octet-stream',
            etag: data.md5Checksum || null,
            providerVersionId: data.id,
            checksum: data.md5Checksum || null,
            createdTime: data.createdTime,
            modifiedTime: data.modifiedTime
        };
    }

    /**
     * Copy (COPY)
     * Creates a server-side copy of the file in Google Drive.
     */
    async _copy(sourceKey, destKey, options = {}) {
        this._resolveProviderKey(sourceKey);
        this._resolveProviderKey(destKey);
        const sourceFileId = await this._resolveFileId(sourceKey, options);
        const driveClient = await this._getDriveClient();

        const result = await this._executeWithRetry(async () => {
            return await driveClient.files.copy({
                fileId: sourceFileId,
                requestBody: {
                    name: options.originalFilename || destKey,
                    appProperties: {
                        objectKey: destKey,
                        copiedFrom: sourceKey
                    }
                },
                fields: 'id, name, mimeType, size, md5Checksum',
                supportsAllDrives: true
            });
        }, 'COPY', sourceKey);

        const newFileId = result.data.id;
        this._fileIdMap.set(destKey, newFileId);

        return {
            objectKey: destKey,
            fileId: newFileId,
            providerVersionId: newFileId
        };
    }

    /**
     * Enumerate (ENUMERATE)
     * Lists files from Google Drive with pagination.
     */
    async _enumerateObjects(paginationToken = null, limit = 100) {
        const driveClient = await this._getDriveClient();
        const folderId = this.config.parentFolderId || this.config.folderId;

        let q = "trashed = false";
        if (folderId) {
            q += ` and '${folderId}' in parents`;
        }

        const result = await this._executeWithRetry(async () => {
            return await driveClient.files.list({
                q,
                pageSize: Math.min(limit, 1000),
                pageToken: paginationToken || undefined,
                fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum, appProperties)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });
        }, 'ENUMERATE');

        const files = result.data.files || [];
        const objects = files.map(file => ({
            objectKey: file.appProperties?.objectKey || file.name,
            fileId: file.id,
            sizeBytes: file.size ? parseInt(file.size, 10) : 0,
            mimeType: file.mimeType,
            etag: file.md5Checksum || null
        }));

        return {
            objects,
            nextPaginationToken: result.data.nextPageToken || null
        };
    }

    /**
     * Presigned / Short-Lived Authorized Access Links (PRESIGNED_READ)
     * Produces a tamper-proof cryptographic signed download token URL.
     * Mediated by the CRM backend to enforce strict zero-credential-leakage and zero-public-sharing.
     */
    async _getPresignedReadUrl(objectKey, expiresInSeconds = 300, options = {}) {
        this._resolveProviderKey(objectKey);

        if (options.signer && typeof options.signer === 'function') {
            return await options.signer(objectKey, expiresInSeconds, options);
        }
        if (this.tokenSigner && typeof this.tokenSigner === 'function') {
            return await this.tokenSigner(objectKey, expiresInSeconds, options);
        }

        const secret = resolveDocumentSigningSecret(options.secret || this.config?.signedUrlSecret);
        const fileId = await this._resolveFileId(objectKey, options);
        const expiresAt = Date.now() + Math.max(1, expiresInSeconds) * 1000;

        const payload = {
            key: objectKey,
            fileId,
            provider: this.providerInstanceId,
            docId: options.documentId || (objectKey.includes('/') ? objectKey.split('/')[0] : null),
            verId: options.versionId || (objectKey.includes('/') ? objectKey.split('/')[1] : null),
            exp: expiresAt,
            op: 'READ'
        };

        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payloadB64);
        const signature = hmac.digest('base64url');
        const token = `${payloadB64}.${signature}`;

        const baseUrl = this.config.baseUrl || process.env.API_BASE_URL || process.env.BACKEND_URL || 'https://api.bharatproperties.co';
        const sanitizedBase = baseUrl.replace(/\/+$/, '');

        return `${sanitizedBase}/api/documents/download-signed/${encodeURIComponent(objectKey)}?token=${token}`;
    }

    /**
     * Static utility to verify a signed download token.
     * Enforces timing-safe comparison without throwing length exceptions,
     * validates expiration, and enforces binding checks (provider, document, version, objectKey).
     */
    static verifySignedToken(token, secretOption = null, expectedBindings = {}) {
        let secret;
        try {
            secret = resolveDocumentSigningSecret(secretOption);
        } catch (err) {
            return { valid: false, reason: 'SIGNING_SECRET_MISSING', error: err.message };
        }

        if (!token || typeof token !== 'string' || !token.includes('.')) {
            return { valid: false, reason: 'MALFORMED_TOKEN' };
        }

        const [payloadB64, signature] = token.split('.');
        if (!payloadB64 || !signature) {
            return { valid: false, reason: 'MALFORMED_TOKEN' };
        }

        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payloadB64);
        const expectedSignature = hmac.digest('base64url');

        const sigBuf = Buffer.from(signature);
        const expectedBuf = Buffer.from(expectedSignature);

        // Constant-time comparison: Length check first to prevent buffer length mismatch exceptions
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return { valid: false, reason: 'INVALID_SIGNATURE' };
        }

        let payload;
        try {
            payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        } catch (err) {
            return { valid: false, reason: 'INVALID_PAYLOAD' };
        }

        // Validate expiry
        if (!payload.exp || typeof payload.exp !== 'number' || Date.now() > payload.exp) {
            return { valid: false, reason: 'EXPIRED' };
        }

        // Validate provider ID binding
        if (expectedBindings.providerId && payload.provider !== expectedBindings.providerId) {
            return { valid: false, reason: 'PROVIDER_MISMATCH' };
        }

        // Validate document ID binding
        if (expectedBindings.documentId && payload.docId !== expectedBindings.documentId) {
            return { valid: false, reason: 'DOCUMENT_MISMATCH' };
        }

        // Validate version ID binding
        if (expectedBindings.versionId && payload.verId !== expectedBindings.versionId) {
            return { valid: false, reason: 'VERSION_MISMATCH' };
        }

        // Validate objectKey binding
        if (expectedBindings.objectKey && payload.key !== expectedBindings.objectKey) {
            return { valid: false, reason: 'KEY_MISMATCH' };
        }

        return { valid: true, payload };
    }
}
