// Standard capability definitions for the capability resolver
export const Capabilities = Object.freeze({
    // Core CRUD
    PUT: 'PUT',
    READ: 'READ',
    DELETE: 'DELETE',
    HEAD: 'HEAD',
    
    // Advanced Operations
    ENUMERATE: 'ENUMERATE',
    COPY: 'COPY',
    MOVE: 'MOVE',
    
    // Vendor specific / extended
    VERSIONING: 'VERSIONING',
    PRESIGNED_READ: 'PRESIGNED_READ',
    PRESIGNED_WRITE: 'PRESIGNED_WRITE',
    STREAM_READ: 'STREAM_READ',
    STREAM_WRITE: 'STREAM_WRITE',
    RETENTION_LOCK: 'RETENTION_LOCK'
});

/**
 * Validates if an adapter supports a requested capability.
 */
export function hasCapability(adapterCapabilities, capability) {
    return Array.isArray(adapterCapabilities) && adapterCapabilities.includes(capability);
}
