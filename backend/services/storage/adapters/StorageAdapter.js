import { CapabilityNotSupportedError } from '../StorageErrors.js';
import { hasCapability, Capabilities } from '../Capabilities.js';

/**
 * Universal Storage Contract Interface using Template Method Pattern.
 * Concrete providers MUST extend this class and override the protected `_method` implementations.
 * The public methods enforce capability checks before delegating to subclasses.
 */
export default class StorageAdapter {
    constructor(providerInstanceId, config, capabilities = []) {
        this.providerInstanceId = providerInstanceId;
        this.config = config;
        this.capabilities = capabilities;
    }

    supports(capability) {
        return hasCapability(this.capabilities, capability);
    }

    requireCapability(capability) {
        if (!this.supports(capability)) {
            throw new CapabilityNotSupportedError(this.providerInstanceId, capability);
        }
    }

    // ==========================================
    // PUBLIC CONTRACT (ENFORCES CAPABILITIES)
    // ==========================================

    async put(objectKey, data, options = {}) {
        this.requireCapability(Capabilities.PUT);
        return this._put(objectKey, data, options);
    }

    async read(objectKey) {
        this.requireCapability(Capabilities.READ);
        return this._read(objectKey);
    }

    async delete(objectKey) {
        this.requireCapability(Capabilities.DELETE);
        return this._delete(objectKey);
    }

    async head(objectKey) {
        this.requireCapability(Capabilities.HEAD);
        return this._head(objectKey);
    }

    async enumerateObjects(paginationToken = null, limit = 1000) {
        this.requireCapability(Capabilities.ENUMERATE);
        return this._enumerateObjects(paginationToken, limit);
    }

    async copy(sourceKey, destKey) {
        this.requireCapability(Capabilities.COPY);
        return this._copy(sourceKey, destKey);
    }

    async getPresignedReadUrl(objectKey, expiresInSeconds = 300) {
        this.requireCapability(Capabilities.PRESIGNED_READ);
        return this._getPresignedReadUrl(objectKey, expiresInSeconds);
    }

    async getPresignedWriteUrl(objectKey, expiresInSeconds = 300, options = {}) {
        this.requireCapability(Capabilities.PRESIGNED_WRITE);
        return this._getPresignedWriteUrl(objectKey, expiresInSeconds, options);
    }

    // ==========================================
    // PROTECTED METHODS (OVERRIDDEN BY SUBCLASSES)
    // ==========================================

    async _put(objectKey, data, options = {}) {
        throw new Error("Method _put not implemented.");
    }

    async _read(objectKey) {
        throw new Error("Method _read not implemented.");
    }

    async _delete(objectKey) {
        throw new Error("Method _delete not implemented.");
    }

    async _head(objectKey) {
        throw new Error("Method _head not implemented.");
    }

    async _enumerateObjects(paginationToken, limit) {
        throw new Error("Method _enumerateObjects not implemented.");
    }

    async _copy(sourceKey, destKey) {
        throw new Error("Method _copy not implemented.");
    }

    async _getPresignedReadUrl(objectKey, expiresInSeconds) {
        throw new Error("Method _getPresignedReadUrl not implemented.");
    }

    async _getPresignedWriteUrl(objectKey, expiresInSeconds, options) {
        throw new Error("Method _getPresignedWriteUrl not implemented.");
    }
}
