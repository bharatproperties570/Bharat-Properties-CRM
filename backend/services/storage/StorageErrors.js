export class StorageError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'StorageError';
        this.originalError = originalError;
    }
}

export class ProviderUnavailableError extends StorageError {
    constructor(providerInstanceId, message) {
        super(`Provider ${providerInstanceId} is unavailable: ${message}`);
        this.name = 'ProviderUnavailableError';
        this.providerInstanceId = providerInstanceId;
    }
}

export class CapabilityNotSupportedError extends StorageError {
    constructor(providerInstanceId, capability) {
        super(`Provider ${providerInstanceId} does not support capability: ${capability}`);
        this.name = 'CapabilityNotSupportedError';
        this.providerInstanceId = providerInstanceId;
        this.capability = capability;
    }
}

export class ObjectNotFoundError extends StorageError {
    constructor(providerInstanceId, objectKey) {
        super(`Object ${objectKey} not found in provider ${providerInstanceId}`);
        this.name = 'ObjectNotFoundError';
        this.providerInstanceId = providerInstanceId;
        this.objectKey = objectKey;
    }
}

export class ObjectConflictError extends StorageError {
    constructor(providerInstanceId, objectKey) {
        super(`Object ${objectKey} already exists in provider ${providerInstanceId}`);
        this.name = 'ObjectConflictError';
        this.providerInstanceId = providerInstanceId;
        this.objectKey = objectKey;
    }
}

export class InvalidObjectKeyError extends StorageError {
    constructor(objectKey) {
        super(`Invalid object key format: ${objectKey}`);
        this.name = 'InvalidObjectKeyError';
        this.objectKey = objectKey;
    }
}

export class CredentialResolutionError extends StorageError {
    constructor(providerInstanceId) {
        super(`Failed to resolve credentials for provider ${providerInstanceId}`);
        this.name = 'CredentialResolutionError';
        this.providerInstanceId = providerInstanceId;
    }
}

export class ProviderConfigurationError extends StorageError {
    constructor(providerInstanceId, message) {
        super(`Provider Configuration Error on [${providerInstanceId}]: ${message}`);
        this.name = 'ProviderConfigurationError';
        this.providerInstanceId = providerInstanceId;
    }
}

export class PolicyViolationError extends StorageError {
    constructor(reason) {
        super(`Upload policy violation: ${reason}`);
        this.name = 'PolicyViolationError';
        this.reason = reason;
    }
}
