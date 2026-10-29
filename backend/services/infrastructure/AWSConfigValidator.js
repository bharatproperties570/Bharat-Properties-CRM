/**
 * AWSConfigValidator.js
 * Phase 17: Credential-Independent AWS Infrastructure Configuration & Fail-Closed Preflight Validation
 * 
 * Enforces strict validation for AWS regions, S3 bucket names, KMS key identifiers,
 * server-side encryption requirements, and log credential sanitization.
 */

const AWS_REGION_REGEX = /^[a-z]{2}(-[a-z]+)+-[0-9]$/;
const S3_BUCKET_NAME_REGEX = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const IP_ADDRESS_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// KMS Identifier Patterns
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KMS_KEY_ARN_REGEX = /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KMS_ALIAS_NAME_REGEX = /^alias\/[a-zA-Z0-9/_-]+$/;
const KMS_ALIAS_ARN_REGEX = /^arn:aws:kms:[a-z0-9-]+:\d{12}:alias\/[a-zA-Z0-9/_-]+$/;

const SENSITIVE_KEY_PATTERN = /password|secret|token|passphrase|private|api_?key|access_?key|credential/i;
const EXCLUDED_SAFE_KEYS = ['kmsKeyId', 'keyId', 'keyType', 'credentialStrategy', 'authMode', 'identityMode'];

class AWSConfigValidator {
    /**
     * Validates an AWS region identifier per standard AWS naming conventions.
     * @param {string} region - e.g. "eu-north-1", "ap-south-1"
     * @returns {{ valid: boolean, error?: string }}
     */
    static validateRegion(region) {
        if (!region || typeof region !== 'string') {
            return { valid: false, error: 'AWS region is required and must be a string' };
        }
        const trimmed = region.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: 'AWS region cannot be empty or whitespace' };
        }
        if (!AWS_REGION_REGEX.test(trimmed)) {
            return { valid: false, error: `Invalid AWS region format: "${region}". Expected format like "eu-north-1" or "ap-south-1"` };
        }
        return { valid: true, region: trimmed };
    }

    /**
     * Validates an Amazon S3 bucket name per official AWS naming rules:
     * - Between 3 and 63 characters long
     * - Only lowercase letters, numbers, dots (.), and hyphens (-)
     * - Must begin and end with a letter or number
     * - Must not contain two consecutive periods
     * - Must not be formatted as an IP address
     * @param {string} bucket - S3 bucket name
     * @returns {{ valid: boolean, error?: string }}
     */
    static validateBucketName(bucket) {
        if (!bucket || typeof bucket !== 'string') {
            return { valid: false, error: 'S3 bucket name is required and must be a string' };
        }
        const trimmed = bucket.trim();
        if (trimmed.length < 3 || trimmed.length > 63) {
            return { valid: false, error: `S3 bucket name length must be between 3 and 63 characters (got ${trimmed.length})` };
        }
        if (trimmed !== trimmed.toLowerCase()) {
            return { valid: false, error: 'S3 bucket name must contain only lowercase characters' };
        }
        if (trimmed.includes('_')) {
            return { valid: false, error: 'S3 bucket name cannot contain underscores' };
        }
        if (trimmed.includes('..')) {
            return { valid: false, error: 'S3 bucket name cannot contain consecutive periods' };
        }
        if (trimmed.includes('.-') || trimmed.includes('-.')) {
            return { valid: false, error: 'S3 bucket name cannot contain adjacent period and dash' };
        }
        if (IP_ADDRESS_REGEX.test(trimmed)) {
            return { valid: false, error: 'S3 bucket name must not be formatted as an IPv4 address' };
        }
        if (!S3_BUCKET_NAME_REGEX.test(trimmed)) {
            return { valid: false, error: `Invalid S3 bucket name format: "${bucket}"` };
        }
        return { valid: true, bucket: trimmed };
    }

    /**
     * Validates a KMS Key ID, Key ARN, Alias, or Alias ARN.
     * @param {string} keyIdentifier 
     * @returns {{ valid: boolean, type?: string, error?: string }}
     */
    static validateKmsKeyIdentifier(keyIdentifier) {
        if (!keyIdentifier || typeof keyIdentifier !== 'string') {
            return { valid: false, error: 'KMS key identifier is required and must be a string' };
        }
        const trimmed = keyIdentifier.trim();
        if (UUID_REGEX.test(trimmed)) {
            return { valid: true, type: 'KEY_ID', identifier: trimmed };
        }
        if (KMS_KEY_ARN_REGEX.test(trimmed)) {
            return { valid: true, type: 'KEY_ARN', identifier: trimmed };
        }
        if (KMS_ALIAS_NAME_REGEX.test(trimmed)) {
            return { valid: true, type: 'ALIAS_NAME', identifier: trimmed };
        }
        if (KMS_ALIAS_ARN_REGEX.test(trimmed)) {
            return { valid: true, type: 'ALIAS_ARN', identifier: trimmed };
        }
        return {
            valid: false,
            error: `Invalid KMS key identifier: "${keyIdentifier}". Must be a valid UUID Key ID, Key ARN, Alias (e.g. "alias/name"), or Alias ARN`
        };
    }

    /**
     * Validates server-side encryption configuration for storage / backups.
     * Enforces fail-closed: unencrypted or unrecognized algorithms are rejected.
     * @param {object} config - { algorithm, kmsKeyId, bucketKeyEnabled }
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validateEncryptionConfig(config = {}) {
        const errors = [];
        const { algorithm, kmsKeyId, bucketKeyEnabled } = config;

        if (!algorithm || typeof algorithm !== 'string') {
            errors.push('Encryption algorithm is required (must be "aws:kms" or "AES256")');
        } else {
            const upper = algorithm.trim();
            if (upper !== 'aws:kms' && upper !== 'AES256') {
                errors.push(`Unsupported encryption algorithm: "${algorithm}". Only "aws:kms" and "AES256" are permitted.`);
            }

            if (upper === 'aws:kms') {
                if (!kmsKeyId) {
                    errors.push('KMS Key Identifier (kmsKeyId) is required when algorithm is "aws:kms"');
                } else {
                    const kmsCheck = this.validateKmsKeyIdentifier(kmsKeyId);
                    if (!kmsCheck.valid) {
                        errors.push(`KMS Key validation failed: ${kmsCheck.error}`);
                    }
                }
            }
        }

        if (bucketKeyEnabled !== undefined && typeof bucketKeyEnabled !== 'boolean') {
            errors.push('bucketKeyEnabled must be a boolean value if provided');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Sanitizes a string, redacting embedded credentials such as database passwords,
     * URI authentication tokens, AWS secret keys, and Bearer tokens.
     * @param {string} str
     * @returns {string} Sanitized string
     */
    static sanitizeString(str) {
        if (typeof str !== 'string') return str;
        let sanitized = str;

        // 1. URI Passwords: e.g. mongodb://user:pass123@host or redis://:pass123@host
        sanitized = sanitized.replace(/(:\/\/[^:]*:)[^@/]+(@)/g, '$1[REDACTED]$2');

        // 2. Bearer Tokens: e.g. Bearer eyJhb... -> Bearer [REDACTED]
        sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]');

        // 3. Key-Value secrets in strings: e.g. password=secret123, api_key: "abc"
        sanitized = sanitized.replace(/((?:password|secret|token|passphrase|private_?key|access_?key|api_?key)\s*[=:]\s*["']?)[^"'\s&,;]+/gi, '$1[REDACTED]');

        // 4. AWS Secret Access Key patterns (40 alphanumeric chars)
        sanitized = sanitized.replace(/(AWS_SECRET_ACCESS_KEY\s*[=:]\s*)[A-Za-z0-9/+=]{40}/gi, '$1[REDACTED]');

        return sanitized;
    }

    /**
     * Recursively sanitizes any config object, map, error, or array, redacting credentials and secrets.
     * Prevents call stack overflows by tracking visited objects to safely handle circular references.
     * Safe for printing to logs, CLI outputs, and debugging diagnostics.
     * @param {any} input 
     * @param {WeakSet<object>} [seen=new WeakSet()] - Set of visited objects for circular reference detection
     * @returns {any} Sanitized clone
     */
    static sanitizeConfigForLog(input, seen = new WeakSet()) {
        if (input === null || input === undefined) return input;

        if (typeof input === 'string') {
            return this.sanitizeString(input);
        }

        if (typeof input !== 'object') {
            return input;
        }

        // Circular reference defense
        if (seen.has(input)) {
            return '[CIRCULAR]';
        }
        seen.add(input);

        // Handle Error instances
        if (input instanceof Error) {
            const sanitizedError = {
                name: input.name,
                message: this.sanitizeString(input.message),
                stack: input.stack ? this.sanitizeString(input.stack) : undefined
            };
            for (const [key, value] of Object.entries(input)) {
                if (!['name', 'message', 'stack'].includes(key)) {
                    sanitizedError[key] = this.sanitizeConfigForLog(value, seen);
                }
            }
            return sanitizedError;
        }

        // Handle Arrays
        if (Array.isArray(input)) {
            return input.map(item => this.sanitizeConfigForLog(item, seen));
        }

        // Handle Objects
        const sanitized = {};
        for (const [key, value] of Object.entries(input)) {
            if (EXCLUDED_SAFE_KEYS.includes(key)) {
                sanitized[key] = typeof value === 'object' && value !== null
                    ? this.sanitizeConfigForLog(value, seen)
                    : value;
            } else if (typeof value !== 'object' && SENSITIVE_KEY_PATTERN.test(key)) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(value);
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeConfigForLog(value, seen);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    /**
     * Executes a dry-run validation of the entire AWS and backup environment configuration.
     * Fail-closed: returns valid=false if any configuration component is invalid or insecure.
     * @param {object} env - Environment map (e.g. process.env)
     * @returns {{ valid: boolean, errors: string[], warnings: string[], sanitizedConfig: object }}
     */
    static validateDryRun(env = {}) {
        const errors = [];
        const warnings = [];

        // 1. Region Validation
        const region = env.AWS_REGION || env.AWS_DEFAULT_REGION;
        if (!region) {
            errors.push('Missing required AWS region configuration (AWS_REGION or AWS_DEFAULT_REGION)');
        } else {
            const regCheck = this.validateRegion(region);
            if (!regCheck.valid) {
                errors.push(regCheck.error);
            }
        }

        // 2. Document S3 Storage Validation (if configured)
        const docBucket = env.S3_BUCKET_NAME || env.DOCUMENTS_S3_BUCKET;
        if (docBucket) {
            const bucketCheck = this.validateBucketName(docBucket);
            if (!bucketCheck.valid) {
                errors.push(`Document S3 bucket invalid: ${bucketCheck.error}`);
            }
        } else {
            warnings.push('S3_BUCKET_NAME not set; document storage will use mock/local fallback');
        }

        // 3. Backup Destination S3 Validation (if offsite configured)
        const backupBucket = env.BACKUP_S3_BUCKET;
        if (backupBucket) {
            const backupCheck = this.validateBucketName(backupBucket);
            if (!backupCheck.valid) {
                errors.push(`Backup S3 bucket invalid: ${backupCheck.error}`);
            }
        } else {
            warnings.push('BACKUP_S3_BUCKET not configured; backups are stored locally only');
        }

        // 4. Server-Side Encryption Configuration
        const encAlgorithm = env.AWS_SSE_ALGORITHM || 'AES256';
        const kmsKeyId = env.AWS_KMS_KEY_ID;
        const encCheck = this.validateEncryptionConfig({
            algorithm: encAlgorithm,
            kmsKeyId: kmsKeyId,
            bucketKeyEnabled: env.AWS_S3_BUCKET_KEY_ENABLED === 'true'
        });
        if (!encCheck.valid) {
            errors.push(...encCheck.errors);
        }

        // 5. Credential Strategy Inspection
        const hasStaticKeys = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
        const useInstanceProfile = env.AWS_USE_INSTANCE_PROFILE !== 'false';

        if (hasStaticKeys) {
            warnings.push('Static AWS credentials detected in environment. EC2 instance profile is recommended for production.');
        } else if (!useInstanceProfile) {
            errors.push('No AWS credentials provided and AWS_USE_INSTANCE_PROFILE is disabled.');
        }

        const sanitizedConfig = this.sanitizeConfigForLog({
            region,
            documentBucket: docBucket || null,
            backupBucket: backupBucket || null,
            encryption: {
                algorithm: encAlgorithm,
                kmsKeyId: kmsKeyId || null,
                bucketKeyEnabled: env.AWS_S3_BUCKET_KEY_ENABLED === 'true'
            },
            credentialStrategy: hasStaticKeys ? 'STATIC_KEYS' : (useInstanceProfile ? 'INSTANCE_PROFILE' : 'NONE')
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            sanitizedConfig
        };
    }
}

export default AWSConfigValidator;
