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
 * Enterprise Google Drive Storage Adapter
 * 
 * Provides first-class, private-by-default document and media storage in Google Drive.
 * Complies strictly with Bharat Properties CRM Security and Provider Contract:
 * - Private by default: files remain private to the application / authorized service account.
 * - NEVER enables public "anyone with link" permissions automatically.
 * - Stores Google Drive file IDs, MIME types, checksums, and byte sizes.
 * - Normalizes Google API errors to canonical StorageErrors.
 * - Resilient exponential backoff retry for transient rate-limit (429) and backend (500/503) errors.
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
            message.includes('rateLimitExceeded') || message.includes('userRateLimitExceeded') ||
            message.includes('backendError') || message.includes('ECONNRESET') || message.includes('ETIMEDOUT')) {
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
     */
    async _executeWithRetry(operationFn, operationName, objectKey = null, maxRetries = 3, baseDelayMs = 150) {
        let attempt = 0;
        while (true) {
            attempt++;
            try {
                return await operationFn();
            } catch (err) {
                const status = err.code || err.status || err.response?.status;
                const message = err.message || '';
                const isTransient = status === 429 || status === 500 || status === 503 ||
                    message.includes('rateLimitExceeded') || message.includes('userRateLimitExceeded') ||
                    message.includes('backendError') || message.includes('ECONNRESET') || message.includes('ETIMEDOUT');

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

        // Search Drive files by appProperties or name
        const driveClient = await this._getDriveClient();
        try {
            const escapedKey = objectKey.replace(/'/g, "\\'");
            const res = await driveClient.files.list({
                q: `appProperties has { key='objectKey' and value='${escapedKey}' } and trashed = false`,
                fields: 'files(id, name, appProperties)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                pageSize: 1
            });
            if (res.data.files && res.data.files.length > 0) {
                const fileId = res.data.files[0].id;
                this._fileIdMap.set(objectKey, fileId);
                return fileId;
            }
        } catch (e) {
            // Ignore list failure and fall back
        }

        return objectKey;
    }

    // ==========================================
    // IMPLEMENTATION OF ABSTRACT STORAGE CONTRACT
    // ==========================================

    /**
     * Upload (PUT)
     * Stores file in Google Drive, maintains privacy (NO public sharing), and captures metadata.
     */
    async _put(objectKey, data, options = {}) {
        this._resolveProviderKey(objectKey);
        const driveClient = await this._getDriveClient();

        let mediaBody;
        if (Buffer.isBuffer(data)) {
            mediaBody = Readable.from(data);
        } else if (data && typeof data.pipe === 'function') {
            mediaBody = data;
        } else if (typeof data === 'string') {
            mediaBody = Readable.from(Buffer.from(data));
        } else {
            throw new StorageError('Invalid data payload for PUT. Expected Buffer or Stream.');
        }

        const folderId = options.folderId || this.config.parentFolderId || this.config.folderId || undefined;
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

        const result = await this._executeWithRetry(async () => {
            return await driveClient.files.create({
                requestBody,
                media: {
                    mimeType: options.mimeType || 'application/octet-stream',
                    body: mediaBody
                },
                fields: 'id, name, mimeType, size, md5Checksum, webViewLink, webContentLink, createdTime, modifiedTime',
                supportsAllDrives: true,
                supportsTeamDrives: true
            });
        }, 'PUT', objectKey);

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

        const fileId = await this._resolveFileId(objectKey, options);
        const expiresAt = Date.now() + Math.max(1, expiresInSeconds) * 1000;
        const secret = process.env.DOCUMENT_SIGNED_URL_SECRET || process.env.JWT_SECRET || 'crm-secure-document-sign-secret';

        const payload = {
            key: objectKey,
            fileId,
            provider: this.providerInstanceId,
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
     */
    static verifySignedToken(token, secret = (process.env.DOCUMENT_SIGNED_URL_SECRET || process.env.JWT_SECRET || 'crm-secure-document-sign-secret')) {
        if (!token || typeof token !== 'string' || !token.includes('.')) {
            return { valid: false, reason: 'MALFORMED_TOKEN' };
        }

        const [payloadB64, signature] = token.split('.');
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payloadB64);
        const expectedSignature = hmac.digest('base64url');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return { valid: false, reason: 'INVALID_SIGNATURE' };
        }

        try {
            const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
            if (!payload.exp || Date.now() > payload.exp) {
                return { valid: false, reason: 'EXPIRED' };
            }
            return { valid: true, payload };
        } catch (err) {
            return { valid: false, reason: 'INVALID_PAYLOAD' };
        }
    }
}
