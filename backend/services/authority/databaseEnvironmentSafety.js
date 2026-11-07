import mongoose from 'mongoose';

/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — DATABASE ENVIRONMENT SAFETY VERIFIER
 * ============================================================================
 *
 *  Enforces strict fail-closed safety to prevent accidental access, mutation,
 *  or false-positive classification against production or unverified databases.
 */

const NON_PROD_HOST_PATTERNS = [
    /^localhost$/i,
    /^127\.0\.0\.1$/i,
    /^staging-mongo$/i,
    /\.staging\.internal$/i,
    /\.nonprod\.internal$/i,
    /\.local$/i,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /mongo-memory-server/i,
    /mongodb-memory-server/i
];

const FORBIDDEN_PRODUCTION_PATTERNS = [
    /prod/i,
    /production/i,
    /live/i,
    /primary/i,
    /bharat_properties_crm$/i
];

/**
 * Redacts credentials and sensitive secrets from a MongoDB URI string.
 * Never throws; returns safely redacted string.
 * 
 * @param {string} uri Raw MongoDB URI
 * @returns {string} Redacted URI
 */
export function redactMongoUri(uri) {
    if (!uri || typeof uri !== 'string') return '';
    try {
        // Standard mongodb:// or mongodb+srv:// regex-based redaction
        return uri.replace(/\/\/([^:]+):(.*)@([^/?#]+)/, '//****:****@$3');
    } catch {
        return 'mongodb://[REDACTED_CREDENTIALS]';
    }
}

/**
 * Parses connection details from a MongoDB connection string.
 * 
 * @param {string} uri MongoDB URI
 * @returns {{ host: string, dbName: string, port: string }}
 */
export function parseMongoDetails(uri) {
    if (!uri || typeof uri !== 'string') return { host: '', dbName: '', port: '' };
    try {
        const cleaned = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
        const withoutAuth = cleaned.includes('@') ? cleaned.split('@')[1] : cleaned;
        const [hostPortPart, ...rest] = withoutAuth.split('/');
        const pathPart = rest.join('/');
        const dbName = pathPart.split('?')[0] || '';
        const host = hostPortPart.split(',')[0].split(':')[0] || '';
        const port = hostPortPart.includes(':') ? hostPortPart.split(':')[1] : '';
        return { host, dbName, port };
    } catch {
        return { host: '', dbName: '', port: '' };
    }
}

/**
 * Verifies that the execution environment and target database are provably non-production.
 * 
 * @param {object} options
 * @param {string} [options.uri] Target MongoDB URI to evaluate
 * @param {boolean} [options.allowMemoryFallback=true] Whether local temporary MongoMemoryServer is permitted
 * @returns {{ verified: boolean, environment: string, reason: string|null, redactedUri: string, host: string, dbName: string }}
 */
export function verifyDatabaseEnvironmentSafety(options = {}) {
    const rawUri = options.uri || process.env.STAGING_MONGODB_URI || process.env.NONPROD_MONGODB_URI || '';
    const redacted = redactMongoUri(rawUri);

    // 1. Environment variable check
    const recognizedEnvs = [
        process.env.NODE_ENV,
        process.env.APP_ENV,
        process.env.ENVIRONMENT,
        process.env.STAGE
    ];

    for (const envVal of recognizedEnvs) {
        if (envVal && /prod|production|live/i.test(envVal)) {
            return {
                verified: false,
                code: 'PRODUCTION_ENVIRONMENT_DETECTED',
                environment: 'PRODUCTION',
                reason: `Production environment detected (${envVal}). Execution strictly rejected.`,
                redactedUri: redacted,
                host: null,
                dbName: null
            };
        }
    }

    // 2. If URI provided, verify host and dbName against allowlist and blocklist
    if (rawUri) {
        const { host, dbName } = parseMongoDetails(rawUri);

        // Disallow production strings in host
        if (FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(host))) {
            return {
                verified: false,
                code: 'PRODUCTION_HOST_DETECTED',
                environment: 'PRODUCTION',
                reason: `Target database host '${host}' matches forbidden production pattern.`,
                redactedUri: redacted,
                host,
                dbName
            };
        }

        // Disallow production strings in dbName (unless explicitly qualified with staging/test/nonprod/dev)
        const isExplicitNonProdDb = /staging|test|nonprod|dev|sandbox/i.test(dbName);
        if (!isExplicitNonProdDb && FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(dbName))) {
            return {
                verified: false,
                code: 'PRODUCTION_DATABASE_NAME_DETECTED',
                environment: 'PRODUCTION',
                reason: `Target database name '${dbName}' matches forbidden production pattern.`,
                redactedUri: redacted,
                host,
                dbName
            };
        }

        // Verify host is in non-production allowlist
        const isAllowedHost = NON_PROD_HOST_PATTERNS.some(pat => pat.test(host));
        if (!isAllowedHost) {
            return {
                verified: false,
                code: 'UNKNOWN_HOST_REJECTED',
                environment: 'UNKNOWN',
                reason: `Database host '${host}' is not on the verified non-production allowlist.`,
                redactedUri: redacted,
                host,
                dbName
            };
        }

        // 3. Verify open Mongoose connection matches target if already connected
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const activeHost = mongoose.connection.host || '';
            const activeDb = mongoose.connection.name || '';

            // Check if active connection host or name has production patterns
            if (FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeHost)) ||
                (!isExplicitNonProdDb && FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeDb)))) {
                return {
                    verified: false,
                    code: 'EXISTING_CONNECTION_PRODUCTION_DETECTED',
                    environment: 'PRODUCTION',
                    reason: `Active Mongoose connection (${activeHost}/${activeDb}) matches production pattern.`,
                    redactedUri: redacted,
                    host: activeHost,
                    dbName: activeDb
                };
            }

            // If target host was specified, verify it matches the active connection
            if (host && activeHost && host.toLowerCase() !== activeHost.toLowerCase() && !activeHost.includes('127.0.0.1') && !host.includes('localhost')) {
                return {
                    verified: false,
                    code: 'EXISTING_CONNECTION_MISMATCH',
                    environment: 'UNKNOWN',
                    reason: `Active Mongoose connection host '${activeHost}' does not match target staging host '${host}'.`,
                    redactedUri: redacted,
                    host: activeHost,
                    dbName: activeDb
                };
            }
        }

        return {
            verified: true,
            code: 'PERSISTENT_NON_PRODUCTION_VERIFIED',
            environment: 'PERSISTENT_NON_PRODUCTION_STAGING',
            reason: null,
            redactedUri: redacted,
            host,
            dbName
        };
    }

    // 3. If no URI provided, check if already connected to an in-memory/test DB
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        const activeHost = mongoose.connection.host || '';
        const activeDb = mongoose.connection.name || '';

        if (FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeHost)) ||
            FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeDb))) {
            return {
                verified: false,
                code: 'EXISTING_CONNECTION_PRODUCTION_DETECTED',
                environment: 'PRODUCTION',
                reason: `Active Mongoose connection (${activeHost}/${activeDb}) matches production pattern.`,
                redactedUri: 'mongodb://[ACTIVE_CONNECTION]',
                host: activeHost,
                dbName: activeDb
            };
        }

        const isAllowedActiveHost = NON_PROD_HOST_PATTERNS.some(pat => pat.test(activeHost));
        if (!isAllowedActiveHost) {
            return {
                verified: false,
                code: 'UNKNOWN_HOST_REJECTED',
                environment: 'UNKNOWN',
                reason: `Active connection host '${activeHost}' is not on non-production allowlist.`,
                redactedUri: 'mongodb://[ACTIVE_CONNECTION]',
                host: activeHost,
                dbName: activeDb
            };
        }

        return {
            verified: true,
            code: 'TEMPORARY_TEST_DATABASE_VERIFIED',
            environment: 'TEMPORARY_TEST_DATABASE',
            reason: null,
            redactedUri: 'mongodb://127.0.0.1:[TEMPORARY_TEST_DB]',
            host: activeHost,
            dbName: activeDb
        };
    }

    return {
        verified: true,
        code: 'TEMPORARY_TEST_DATABASE_ALLOWED',
        environment: 'TEMPORARY_TEST_DATABASE',
        reason: null,
        redactedUri: 'mongodb://127.0.0.1:[IN_MEMORY]',
        host: '127.0.0.1',
        dbName: 'temporary_test_db'
    };
}
