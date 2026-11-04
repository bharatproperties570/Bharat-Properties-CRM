/**
 * BackupEncryptionVerifier.js
 * Phase 17: Backup Encryption, Integrity & KMS Key Rotation Policy Verifier
 * 
 * Verifies manifest checksums, backup envelope metadata, tamper protection,
 * and KMS customer-managed key (CMK) annual key rotation compliance.
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

class BackupEncryptionVerifier {
    /**
     * Validates that an archive filename is a safe relative basename without path traversal.
     * Rejects slashes, backslashes, directory traversal sequences (..), null bytes, and non-whitelisted characters.
     * @param {string} archiveFileName 
     * @returns {{ valid: boolean, fileName?: string, error?: string }}
     */
    static validateArchiveFileName(archiveFileName) {
        if (!archiveFileName || typeof archiveFileName !== 'string') {
            return { valid: false, error: 'Archive filename is required and must be a string' };
        }
        const trimmed = archiveFileName.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'Archive filename cannot be empty or whitespace' };
        }
        if (trimmed.includes('\0')) {
            return { valid: false, error: 'Archive filename contains illegal null byte' };
        }
        if (trimmed.includes('/') || trimmed.includes('\\')) {
            return { valid: false, error: `Archive filename cannot contain path separators: "${archiveFileName}"` };
        }
        if (trimmed.includes('..')) {
            return { valid: false, error: `Archive filename cannot contain directory traversal sequence (..): "${archiveFileName}"` };
        }
        if (trimmed.startsWith('.')) {
            return { valid: false, error: `Archive filename cannot be a hidden file: "${archiveFileName}"` };
        }
        // Allowed: alphanumeric, hyphens, underscores, dots (e.g. bharat-crm-backup-20261029.tar.gz)
        const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;
        if (!SAFE_FILENAME_REGEX.test(trimmed)) {
            return { valid: false, error: `Archive filename contains forbidden characters: "${archiveFileName}"` };
        }
        return { valid: true, fileName: trimmed };
    }

    /**
     * Safely resolves an archive filename within an allowed base directory,
     * guaranteeing no path traversal escape outside the base directory.
     * @param {string} baseDir - Directory path (e.g. /home/ubuntu/bharat-crm-backups/archives)
     * @param {string} archiveFileName - Basename of archive
     * @returns {{ valid: boolean, safePath?: string, error?: string }}
     */
    static resolveSafeArchivePath(baseDir, archiveFileName) {
        if (!baseDir || typeof baseDir !== 'string') {
            return { valid: false, error: 'Base directory path is required and must be a string' };
        }
        const fileCheck = this.validateArchiveFileName(archiveFileName);
        if (!fileCheck.valid) {
            return { valid: false, error: fileCheck.error };
        }

        const resolvedBase = path.resolve(baseDir);
        const resolvedTarget = path.resolve(resolvedBase, fileCheck.fileName);

        // Enforce boundary containment
        const normalizedBase = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
        if (!resolvedTarget.startsWith(normalizedBase)) {
            return { valid: false, error: `Path traversal detected: target "${archiveFileName}" escapes base directory` };
        }

        // Symlink verification if target exists on disk
        if (fs.existsSync(resolvedTarget)) {
            try {
                const lstat = fs.lstatSync(resolvedTarget);
                if (lstat.isSymbolicLink()) {
                    const realTarget = fs.realpathSync(resolvedTarget);
                    const realBase = fs.realpathSync(resolvedBase);
                    const normalizedRealBase = realBase.endsWith(path.sep) ? realBase : realBase + path.sep;
                    if (!realTarget.startsWith(normalizedRealBase)) {
                        return { valid: false, error: `Symlink escape detected: "${archiveFileName}" points outside base directory` };
                    }
                }
            } catch (err) {
                return { valid: false, error: `Filesystem resolution error for "${archiveFileName}": ${err.message}` };
            }
        }

        return { valid: true, safePath: resolvedTarget };
    }

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

        // Path traversal check on manifest.archive
        if (manifest.archive) {
            const fileCheck = this.validateArchiveFileName(manifest.archive);
            if (!fileCheck.valid) {
                errors.push(`Manifest archive path traversal or format violation: ${fileCheck.error}`);
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
     * Reads a manifest file from disk, verifies its contents and the referenced archive's cryptographic integrity.
     * Strictly verifies that the archive file resides safely within baseDir without traversal.
     * @param {string} manifestPath - Path to manifest.json file
     * @param {string} baseDir - Safe directory where archive must reside
     * @returns {{ valid: boolean, errors: string[], manifest?: object, computedSha256?: string, computedSize?: number }}
     */
    static verifyManifestFileOnDisk(manifestPath, baseDir) {
        if (!manifestPath || typeof manifestPath !== 'string') {
            return { valid: false, errors: ['Manifest path is required and must be a string'] };
        }
        if (!baseDir || typeof baseDir !== 'string') {
            return { valid: false, errors: ['Base directory is required and must be a string'] };
        }

        let manifestContent;
        try {
            manifestContent = fs.readFileSync(manifestPath, 'utf8');
        } catch (err) {
            return { valid: false, errors: [`Failed to read manifest file: ${err.message}`] };
        }

        let manifest;
        try {
            manifest = JSON.parse(manifestContent);
        } catch (err) {
            return { valid: false, errors: [`Malformed manifest JSON: ${err.message}`] };
        }

        const pathCheck = this.resolveSafeArchivePath(baseDir, manifest.archive);
        if (!pathCheck.valid) {
            return { valid: false, errors: [`Security rejection: ${pathCheck.error}`] };
        }

        let archiveBytes;
        try {
            archiveBytes = fs.readFileSync(pathCheck.safePath);
        } catch (err) {
            return { valid: false, errors: [`Failed to read archive file: ${err.message}`] };
        }

        const integrity = this.verifyManifestIntegrity(manifest, archiveBytes);
        return {
            ...integrity,
            manifest
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

        if (!keyMetadata || typeof keyMetadata !== 'object' || Object.keys(keyMetadata).length === 0) {
            return { compliant: false, issues: ['Key metadata descriptor is required and cannot be empty'] };
        }

        // 1. Key State
        const keyState = keyMetadata.KeyState || keyMetadata.keyState;
        if (keyState !== 'Enabled') {
            issues.push(`KMS Key is not in Enabled state (current: "${keyState || 'UNKNOWN'}")`);
        }

        // 2. Key Usage & Spec
        const keySpec = keyMetadata.KeySpec || keyMetadata.keySpec;
        if (keySpec !== 'SYMMETRIC_DEFAULT') {
            issues.push(`KMS Key spec is "${keySpec || 'MISSING'}". S3 SSE-KMS requires "SYMMETRIC_DEFAULT"`);
        }

        const keyUsage = keyMetadata.KeyUsage || keyMetadata.keyUsage;
        if (keyUsage !== 'ENCRYPT_DECRYPT') {
            issues.push(`KMS Key usage is "${keyUsage || 'MISSING'}". Expected "ENCRYPT_DECRYPT"`);
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
