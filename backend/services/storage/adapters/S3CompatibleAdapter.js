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
import { 
    PutObjectCommand, 
    GetObjectCommand, 
    DeleteObjectCommand, 
    HeadObjectCommand, 
    ListObjectsV2Command, 
    CopyObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export default class S3CompatibleAdapter extends StorageAdapter {
    constructor(providerInstanceId, configuration, capabilities, deps = {}) {
        super(providerInstanceId, configuration, capabilities);
        
        this.bucket = configuration.bucket;
        this.pathPrefix = configuration.pathPrefix || '';
        
        this.s3Client = deps.s3Client;
    }

    _resolveProviderKey(logicalKey) {
        if (!logicalKey || typeof logicalKey !== 'string') {
            throw new InvalidObjectKeyError(this.providerInstanceId, logicalKey);
        }
        if (logicalKey.includes('..') || logicalKey.startsWith('/')) {
            throw new InvalidObjectKeyError(this.providerInstanceId, logicalKey, 'Path traversal detected');
        }
        return this.pathPrefix ? `${this.pathPrefix}/${logicalKey}` : logicalKey;
    }

    _translateError(err, operation, objectKey = null) {
        if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
            return new ObjectNotFoundError(this.providerInstanceId, objectKey);
        }
        
        if (['CredentialsError', 'SignatureDoesNotMatch', 'InvalidAccessKeyId', 'AccessDenied'].includes(err.name)) {
            return new ProviderConfigurationError(this.providerInstanceId, `Authentication or bucket access failed during ${operation}.`);
        }

        if (['NetworkingError', 'TimeoutError', 'EndpointConnectionError', 'SlowDown', 'Throttling', 'ThrottlingException'].includes(err.name)) {
            return new ProviderUnavailableError(this.providerInstanceId, `S3 network or throttling error during ${operation}`);
        }

        if (err.name === 'PreconditionFailed' || err.name === 'Conflict') {
            return new ObjectConflictError(this.providerInstanceId, objectKey, `Conflict during ${operation}`);
        }

        if (err.name === 'EntityTooLarge') {
            return new StorageError(`Payload exceeded maximum allowed size during ${operation}`);
        }

        return new StorageError(`Provider operation [${operation}] failed on instance ${this.providerInstanceId}`);
    }

    async _put(objectKey, data, options = {}) {
        const providerKey = this._resolveProviderKey(objectKey);
        
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: providerKey,
                Body: data,
                ContentType: options.mimeType
            });
            const response = await this.s3Client.send(command);

            return {
                objectKey,
                sizeBytes: options.sizeBytes || null,
                etag: response.ETag ? response.ETag.replace(/"/g, '') : null,
                providerVersionId: response.VersionId || null,
                checksum: response.ChecksumSHA256 || null 
            };
        } catch (err) {
            throw this._translateError(err, 'PUT', objectKey);
        }
    }

    async _read(objectKey) {
        const providerKey = this._resolveProviderKey(objectKey);

        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: providerKey
            });
            const response = await this.s3Client.send(command);

            return {
                stream: response.Body,
                mimeType: response.ContentType || 'application/octet-stream',
                sizeBytes: response.ContentLength || 0,
                etag: response.ETag ? response.ETag.replace(/"/g, '') : null,
                providerVersionId: response.VersionId || null
            };
        } catch (err) {
            throw this._translateError(err, 'READ', objectKey);
        }
    }

    async _delete(objectKey) {
        const providerKey = this._resolveProviderKey(objectKey);

        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: providerKey
            });
            await this.s3Client.send(command);

            return { success: true };
        } catch (err) {
            throw this._translateError(err, 'DELETE', objectKey);
        }
    }

    async _head(objectKey) {
        const providerKey = this._resolveProviderKey(objectKey);

        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: providerKey
            });
            const response = await this.s3Client.send(command);

            return {
                objectKey,
                sizeBytes: response.ContentLength || 0,
                mimeType: response.ContentType || 'application/octet-stream',
                etag: response.ETag ? response.ETag.replace(/"/g, '') : null,
                providerVersionId: response.VersionId || null,
                checksum: response.ChecksumSHA256 || null
            };
        } catch (err) {
            throw this._translateError(err, 'HEAD', objectKey);
        }
    }

    async _enumerateObjects(paginationToken, limit) {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: this.pathPrefix ? (this.pathPrefix.endsWith('/') ? this.pathPrefix : this.pathPrefix + '/') : '',
                MaxKeys: limit,
                ContinuationToken: paginationToken || undefined
            });
            const response = await this.s3Client.send(command);

            const objects = (response.Contents || []).map(obj => {
                let logicalKey = obj.Key;
                const prefixMatch = this.pathPrefix ? (this.pathPrefix.endsWith('/') ? this.pathPrefix : this.pathPrefix + '/') : '';
                if (prefixMatch && logicalKey.startsWith(prefixMatch)) {
                    logicalKey = logicalKey.substring(prefixMatch.length);
                }
                return {
                    objectKey: logicalKey,
                    sizeBytes: obj.Size,
                    etag: obj.ETag ? obj.ETag.replace(/"/g, '') : null
                };
            });

            return {
                objects,
                nextPaginationToken: response.NextContinuationToken || null
            };
        } catch (err) {
            throw this._translateError(err, 'ENUMERATE');
        }
    }

    async _copy(sourceKey, destKey) {
        const providerSourceKey = this._resolveProviderKey(sourceKey);
        const providerDestKey = this._resolveProviderKey(destKey);

        try {
            const command = new CopyObjectCommand({
                Bucket: this.bucket,
                CopySource: `${this.bucket}/${providerSourceKey}`,
                Key: providerDestKey
            });
            const response = await this.s3Client.send(command);

            return {
                objectKey: destKey,
                providerVersionId: response.VersionId || null
            };
        } catch (err) {
            throw this._translateError(err, 'COPY', sourceKey);
        }
    }

    
    async _getPresignedReadUrl(objectKey, expiresInSeconds, options = {}) {
        const providerKey = this._resolveProviderKey(objectKey);
        try {
            const params = {
                Bucket: this.bucket,
                Key: providerKey,
            };

            if (options.originalFilename) {
                // Ensure safe encoding for header injection prevention
                const safeFilename = encodeURIComponent(options.originalFilename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
                params.ResponseContentDisposition = `attachment; filename="${safeFilename}"`;
            }
            if (options.mimeType) {
                params.ResponseContentType = options.mimeType;
            }

            if (!this.s3Client) {
                throw new ProviderUnavailableError(this.providerInstanceId, 'No compatible S3 signer available on this adapter.');
            }

            const command = new GetObjectCommand(params);
            const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });

            if (!signedUrl || typeof signedUrl !== 'string' || !signedUrl.startsWith('http')) {
                throw new StorageError('Signer returned an invalid or empty URL.');
            }
            
            // Validate that the signer didn't maliciously or mistakenly sign the wrong object
            if (!signedUrl.includes(encodeURIComponent(providerKey)) && !signedUrl.includes(providerKey)) {
                throw new StorageError('Signer returned a URL for the wrong object.');
            }

            return signedUrl;
        } catch (err) {
            if (err.name === 'ProviderUnavailableError' || err.name === 'StorageError') {
                throw err;
            }
            throw this._translateError(err, 'PRESIGN_READ', objectKey);
        }
    }
}
