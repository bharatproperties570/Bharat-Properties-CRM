/**
 * BackupEncryptionVerifier.js
 * Phase 17: Backup Encryption, Integrity & KMS Key Rotation Policy Verifier
 * 
 * Verifies manifest checksums, backup envelope metadata, tamper protection,
 * and KMS customer-managed key (CMK) annual key rotation compliance.
 */

import crypto from 'crypto';

class BackupEncryptionVerifier {
    /**
     * Verifies cryptographic integrity of a backup archive against its manifest.
     * @param {object} manifest - Parsed manifest { timestamp, archive, sha256, size, status }
     * @param {Buffer|string} archiveData - Raw archive bytes or content
     * @returns {{ valid: boolean, errors: string[], computedSha256?: string, computedSize?: number }}
     */
    static verifyManifestIntegrity(manifest, archiveData) {
        const errors = [];

        if (!manifest || typeof manifest !== 'object') {
            return { valid: false, errors: ['Manifest is required and must be an object'] };
        }

        const requiredFields = ['timestamp', 'archive', 'sha256', 'size', 'status'];
        for (const field of requiredFields) {
            if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
                errors.push(`Manifest missing required field: "${field}"`);
            }
        }

        if (!archiveData) {
            errors.push('Archive data is required for integrity verification');
            return { valid: false, errors };
        }

        const buffer = Buffer.isBuffer(archiveData) ? archiveData : Buffer.from(archiveData);
        const computedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        const computedSize = buffer.length;

        if (manifest.sha256 && manifest.sha256.toLowerCase() !== computedSha256.toLowerCase()) {
            errors.push(`Cryptographic SHA-256 checksum mismatch. Manifest: ${manifest.sha256}, Actual: ${computedSha256}`);
        }

        if (typeof manifest.size === 'number' && manifest.size !== computedSize) {
            errors.push(`Archive byte size mismatch. Manifest: ${manifest.size}, Actual: ${computedSize}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            computedSha256,
            computedSize
        };
    }

    /**
     * Validates backup encryption envelope metadata (e.g. for AES-256-GCM or AWS KMS envelope encryption).
     * Enforces fail-closed: requires strong cipher, minimum 96-bit IV, 128-bit authentication tag,
     * and valid key identifier.
     * @param {object} envelope - { algorithm, keyId, iv, authTag, encryptedAt }
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static verifyEncryptionEnvelope(envelope) {
        const errors = [];

        if (!envelope || typeof envelope !== 'object') {
            return { valid: false, errors: ['Encryption envelope metadata is required'] };
        }

        const { algorithm, keyId, iv, authTag, encryptedAt } = envelope;

        // 1. Algorithm Check
        const allowedAlgorithms = ['AES-256-GCM', 'aws:kms'];
        if (!algorithm || !allowedAlgorithms.includes(algorithm)) {
            errors.push(`Invalid encryption algorithm: "${algorithm}". Expected one of: ${allowedAlgorithms.join(', ')}`);
        }

        // 2. Key Identifier Check
        if (!keyId || typeof keyId !== 'string' || keyId.trim().length === 0) {
            errors.push('Key identifier (keyId) is required in encryption envelope');
        }

        // 3. IV Check (for AES-256-GCM: minimum 12 bytes / 24 hex chars)
        if (algorithm === 'AES-256-GCM') {
            if (!iv || typeof iv !== 'string' || iv.length < 24) {
                errors.push('AES-256-GCM requires a hexadecimal IV of at least 12 bytes (24 hex characters)');
            }
            if (!authTag || typeof authTag !== 'string' || authTag.length < 32) {
                errors.push('AES-256-GCM requires an authentication tag (authTag) of at least 16 bytes (32 hex characters)');
            }
        }

        // 4. Encrypted Timestamp Check
        if (!encryptedAt || typeof encryptedAt !== 'string') {
            errors.push('encryptedAt ISO-8601 timestamp is required');
        } else {
            const parsedTime = Date.parse(encryptedAt);
            if (isNaN(parsedTime)) {
                errors.push(`Invalid encryptedAt timestamp format: "${encryptedAt}"`);
            } else if (parsedTime > Date.now() + 60000) {
                errors.push('encryptedAt timestamp cannot be in the future');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Evaluates KMS key metadata against the enterprise key rotation and security standard.
     * Enforces:
     * - Automated key rotation enabled (KeyRotationEnabled: true)
     * - KeySpec is SYMMETRIC_DEFAULT
     * - KeyUsage is ENCRYPT_DECRYPT
     * - KeyState is Enabled
     * @param {object} keyMetadata - Object matching AWS KMS DescribeKey & GetKeyRotationStatus response
     * @returns {{ compliant: boolean, issues: string[] }}
     */
    static verifyKmsKeyRotationPolicy(keyMetadata = {}) {
        const issues = [];

        if (!keyMetadata || typeof keyMetadata !== 'object') {
            return { compliant: false, issues: ['Key metadata descriptor is required'] };
        }

        // 1. Key State
        const keyState = keyMetadata.KeyState || keyMetadata.keyState;
        if (keyState !== 'Enabled') {
            issues.push(`KMS Key is not in Enabled state (current: "${keyState || 'UNKNOWN'}")`);
        }

        // 2. Key Usage & Spec
        const keySpec = keyMetadata.KeySpec || keyMetadata.keySpec;
        if (keySpec && keySpec !== 'SYMMETRIC_DEFAULT') {
            issues.push(`KMS Key spec is "${keySpec}". S3 SSE-KMS requires "SYMMETRIC_DEFAULT"`);
        }

        const keyUsage = keyMetadata.KeyUsage || keyMetadata.keyUsage;
        if (keyUsage && keyUsage !== 'ENCRYPT_DECRYPT') {
            issues.push(`KMS Key usage is "${keyUsage}". Expected "ENCRYPT_DECRYPT"`);
        }

        // 3. Key Rotation Check
        const rotationEnabled = keyMetadata.KeyRotationEnabled ?? keyMetadata.keyRotationEnabled;
        if (rotationEnabled !== true) {
            issues.push('AWS KMS automated annual key rotation is NOT enabled for this customer-managed key');
        }

        return {
            compliant: issues.length === 0,
            issues
        };
    }
}

export default BackupEncryptionVerifier;
