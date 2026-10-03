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
import path from 'path';

export default class S3CompatibleAdapter extends StorageAdapter {
    constructor(providerInstanceId, config, capabilities, deps = {}) {
        super(providerInstanceId, config, capabilities);
        
        if (!config.bucket) {
            throw new Error(`Bucket configuration is required for S3CompatibleAdapter [${providerInstanceId}]`);
        }

        this.bucket = config.bucket;
        this.pathPrefix = config.pathPrefix || '';
        this.s3Client = deps.s3Client;
        this.s3Presigner = deps.s3Presigner;
    }

    _resolveProviderKey(objectKey) {
        if (!objectKey || typeof objectKey !== 'string') {
            throw new InvalidObjectKeyError(this.providerInstanceId, objectKey, 'Key must be a non-empty string.');
        }

        if (objectKey.includes('../') || objectKey.includes('..\\') || objectKey.startsWith('/')) {
            throw new InvalidObjectKeyError(this.providerInstanceId, objectKey, 'Key contains invalid traversal or absolute path characters.');
        }

        if (/[\x00-\x1F\x7F]/.test(objectKey)) {
            throw new InvalidObjectKeyError(this.providerInstanceId, objectKey, 'Key contains invalid control characters.');
        }

        const normalizedPrefix = this.pathPrefix.endsWith('/') ? this.pathPrefix : (this.pathPrefix ? this.pathPrefix + '/' : '');
        return `${normalizedPrefix}${objectKey}`;
    }

    _translateError(error, operation, objectKey = null) {
        const errorName = error.name || error.code || '';
        
        if (errorName === 'NoSuchKey' || errorName === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return new ObjectNotFoundError(this.providerInstanceId, objectKey);
        }

        if (errorName === 'AccessDenied' || errorName === 'InvalidAccessKeyId' || errorName === 'SignatureDoesNotMatch' || errorName === 'NoSuchBucket') {
            return new ProviderConfigurationError(this.providerInstanceId, `Authentication or bucket access failed during ${operation}.`);
        }

        if (['NetworkingError', 'TimeoutError', 'EndpointConnectionError', 'SlowDown', 'Throttling', 'ThrottlingException'].includes(errorName)) {
            return new ProviderUnavailableError(this.providerInstanceId, `S3 network or throttling error during ${operation}`);
        }

        if (errorName === 'PreconditionFailed' || errorName === 'Conflict') {
            return new ObjectConflictError(this.providerInstanceId, objectKey, `Conflict during ${operation}`);
        }

        if (errorName === 'EntityTooLarge') {
            return new StorageError(`Payload exceeded maximum allowed size during ${operation}`);
        }

        return new StorageError(`Provider operation [${operation}] failed on instance ${this.providerInstanceId}`);
    }

    async _put(objectKey, data, options = {}) {
        const providerKey = this._resolveProviderKey(objectKey);
        
        try {
            const response = await this.s3Client.send('PutObjectCommand', {
                Bucket: this.bucket,
                Key: providerKey,
                Body: data,
                ContentType: options.mimeType
            });

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
            const response = await this.s3Client.send('GetObjectCommand', {
                Bucket: this.bucket,
                Key: providerKey
            });

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
            await this.s3Client.send('DeleteObjectCommand', {
                Bucket: this.bucket,
                Key: providerKey
            });

            return { success: true };
        } catch (err) {
            throw this._translateError(err, 'DELETE', objectKey);
        }
    }

    async _head(objectKey) {
        const providerKey = this._resolveProviderKey(objectKey);

        try {
            const response = await this.s3Client.send('HeadObjectCommand', {
                Bucket: this.bucket,
                Key: providerKey
            });

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
            const response = await this.s3Client.send('ListObjectsV2Command', {
                Bucket: this.bucket,
                Prefix: this.pathPrefix ? (this.pathPrefix.endsWith('/') ? this.pathPrefix : this.pathPrefix + '/') : '',
                MaxKeys: limit,
                ContinuationToken: paginationToken || undefined
            });

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
            const response = await this.s3Client.send('CopyObjectCommand', {
                Bucket: this.bucket,
                CopySource: `${this.bucket}/${providerSourceKey}`,
                Key: providerDestKey
            });

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

            let signedUrl = null;

            // Support V2 style client with built-in getSignedUrl, or injected presigner for V3
            if (this.s3Client && typeof this.s3Client.getSignedUrlPromise === 'function') {
                params.Expires = expiresInSeconds;
                signedUrl = await this.s3Client.getSignedUrlPromise('getObject', params);
            } else if (this.s3Presigner && typeof this.s3Presigner.getSignedUrl === 'function') {
                signedUrl = await this.s3Presigner.getSignedUrl(
                    this.s3Client,
                    { name: 'GetObjectCommand', input: params },
                    { expiresIn: expiresInSeconds }
                );
            } else {
                // Signer unavailable
                throw new ProviderUnavailableError(this.providerInstanceId, 'No compatible S3 signer available on this adapter.');
            }

            if (!signedUrl || typeof signedUrl !== 'string' || !signedUrl.startsWith('http')) {
                throw new StorageError('Signer returned an invalid or empty URL.');
            }
            
            // Validate that the signer didn't maliciously or mistakenly sign the wrong object
            // This is a sanity check against mocked/injected signers
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