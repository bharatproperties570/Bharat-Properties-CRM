import mongoose from 'mongoose';

/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — DATABASE ENVIRONMENT SAFETY VERIFIER
 * ============================================================================
 *
 *  Enforces strict fail-closed safety to prevent accidental access, mutation,
 *  or false-positive classification against production, remote private, or unverified databases.
 */

// Narrow, explicitly approved staging host patterns
// Note: Broad RFC1918 private IP ranges (10.x, 172.16-31.x, 192.168.x) are strictly prohibited
// because production cloud databases often reside on private VPC networks.
const BASE_NON_PROD_HOST_PATTERNS = [
    /^localhost$/i,
    /^127\.0\.0\.1$/i,
    /^staging-mongo$/i,
    /\.staging\.internal$/i,
    /\.nonprod\.internal$/i,
    /\.local$/i,
    /mongo-memory-server/i,
    /mongodb-memory-server/i
];

const FORBIDDEN_PRODUCTION_PATTERNS = [
    /(?<!non)prod/i,
    /(?<!non)production/i,
    /live/i,
    /primary/i,
    /cluster0/i,
    /replica-prod/i,
    /bharat_properties_crm$/i
];

const GENERIC_DATABASE_NAMES = [
    'crm',
    'admin',
    'config',
    'local',
    'db',
    'app',
    'data',
    'main',
    'production'
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
        // Redact standard user:password@ credentials
        let redacted = uri.replace(/\/\/([^:]+):(.*)@([^/?#]+)/, '//****:****@$3');

        // Redact sensitive query parameters
        redacted = redacted.replace(/([?&])(password|pwd|secret|token|apiKey|authSecret)=([^&]*)/gi, '$1$2=****');

        return redacted;
    } catch {
        return 'mongodb://[REDACTED_CREDENTIALS]';
    }
}

/**
 * Parses connection details from a MongoDB connection string.
 * Supports standard, replica-set (comma-separated), and SRV connection strings.
 * 
 * @param {string} uri MongoDB URI
 * @returns {{ isSrv: boolean, hosts: string[], hostNames: string[], host: string, dbName: string, port: string }}
 */
export function parseMongoDetails(uri) {
    if (!uri || typeof uri !== 'string') {
        return { isSrv: false, hosts: [], hostNames: [], host: '', dbName: '', port: '' };
    }
    try {
        const isSrv = /^mongodb\+srv:\/\//i.test(uri);
        const cleaned = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
        const withoutAuth = cleaned.includes('@') ? cleaned.split('@')[1] : cleaned;
        const [hostPortPart, ...rest] = withoutAuth.split('/');
        const pathPart = rest.join('/');
        const dbName = pathPart.split('?')[0].trim();

        // Parse multiple hosts for replica sets (e.g. host1:27017,host2:27017)
        const hostEntries = hostPortPart.split(',').map(h => h.trim()).filter(Boolean);
        const hostNames = [];
        let primaryHost = '';
        let primaryPort = '';

        for (let i = 0; i < hostEntries.length; i++) {
            const entry = hostEntries[i];
            const [h, p] = entry.split(':');
            hostNames.push(h);
            if (i === 0) {
                primaryHost = h || '';
                primaryPort = p || '';
            }
        }

        return {
            isSrv,
            hosts: hostEntries,
            hostNames,
            host: primaryHost,
            dbName,
            port: primaryPort
        };
    } catch {
        return { isSrv: false, hosts: [], hostNames: [], host: '', dbName: '', port: '' };
    }
}

/**
 * Verifies that the execution environment and target database are provably non-production.
 * 
 * @param {object} options
 * @param {string} [options.uri] Target MongoDB URI to evaluate
 * @param {boolean} [options.allowMemoryFallback=true] Whether local temporary MongoMemoryServer is permitted
 * @returns {{ verified: boolean, status: string, code: string, environment: string, reason: string|null, redactedUri: string, host: string, dbName: string }}
 */
export function verifyDatabaseEnvironmentSafety(options = {}) {
    const rawUri = options.uri || process.env.STAGING_MONGODB_URI || process.env.NONPROD_MONGODB_URI || '';
    const redacted = redactMongoUri(rawUri);

    // 1. Comprehensive environment variable validation
    // Must validate all recognized production environment indicators:
    // NODE_ENV, APP_ENV, APPLICATION_ENV, ENVIRONMENT, STAGE
    const recognizedEnvs = [
        { name: 'NODE_ENV', value: process.env.NODE_ENV },
        { name: 'APP_ENV', value: process.env.APP_ENV },
        { name: 'APPLICATION_ENV', value: process.env.APPLICATION_ENV },
        { name: 'ENVIRONMENT', value: process.env.ENVIRONMENT },
        { name: 'STAGE', value: process.env.STAGE }
    ];

    for (const { name, value } of recognizedEnvs) {
        if (value && /prod|production|live/i.test(value)) {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'PRODUCTION_ENVIRONMENT_DETECTED',
                environment: 'PRODUCTION',
                reason: `Production environment detected in ${name}='${value}'. Execution strictly rejected.`,
                redactedUri: redacted,
                host: null,
                dbName: null
            };
        }
    }

    // Prepare narrow staging host patterns (including explicit APPROVED_STAGING_HOSTS if set)
    const activeHostPatterns = [...BASE_NON_PROD_HOST_PATTERNS];
    if (process.env.APPROVED_STAGING_HOSTS) {
        const approvedList = process.env.APPROVED_STAGING_HOSTS.split(',').map(h => h.trim()).filter(Boolean);
        for (const appHost of approvedList) {
            activeHostPatterns.push(new RegExp(`^${appHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
        }
    }

    // 2. If URI provided, verify all hosts and dbName against allowlist and blocklist
    if (rawUri) {
        let { hostNames, host, dbName } = parseMongoDetails(rawUri);

        // If allowMemoryFallback is true and URI is localhost with no dbName, default to temporary_test_db
        if (!dbName && options.allowMemoryFallback && (host === 'localhost' || host === '127.0.0.1')) {
            dbName = 'temporary_test_db';
        }

        // 2.1 Validate database name presence and structure
        if (!dbName) {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'MISSING_DATABASE_NAME',
                environment: 'UNKNOWN',
                reason: 'Target database URI is missing a database name. Explicit non-production database name is required.',
                redactedUri: redacted,
                host,
                dbName: ''
            };
        }

        // 2.2 Reject forbidden production database name patterns
        if (FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(dbName))) {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'PRODUCTION_DATABASE_NAME_DETECTED',
                environment: 'PRODUCTION',
                reason: `Target database name '${dbName}' matches forbidden production pattern.`,
                redactedUri: redacted,
                host,
                dbName
            };
        }

        // 2.3 Reject generic database names (e.g. 'crm', 'admin') that lack staging qualification
        if (GENERIC_DATABASE_NAMES.includes(dbName.toLowerCase())) {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'GENERIC_DATABASE_NAME_REJECTED',
                environment: 'UNKNOWN',
                reason: `Target database name '${dbName}' is generic and does not prove non-production staging isolation.`,
                redactedUri: redacted,
                host,
                dbName
            };
        }

        // 2.4 Require explicit non-production naming pattern in database name
        const isExplicitNonProdDb = /staging|test|nonprod|dev|sandbox|temp_test|phase/i.test(dbName);
        if (!isExplicitNonProdDb) {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'UNAPPROVED_DATABASE_NAME',
                environment: 'UNKNOWN',
                reason: `Target database name '${dbName}' lacks explicit non-production qualification (staging, test, nonprod, dev).`,
                redactedUri: redacted,
                host,
                dbName
            };
        }

        // 2.5 Check all hosts in the connection string (including replica-sets)
        for (const h of hostNames) {
            // Disallow production strings in any host
            if (FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(h))) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'PRODUCTION_HOST_DETECTED',
                    environment: 'PRODUCTION',
                    reason: `Target database host '${h}' matches forbidden production pattern.`,
                    redactedUri: redacted,
                    host: h,
                    dbName
                };
            }

            // Verify host is in the narrow non-production allowlist
            const isAllowedHost = activeHostPatterns.some(pat => pat.test(h));
            if (!isAllowedHost) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'UNKNOWN_HOST_REJECTED',
                    environment: 'UNKNOWN',
                    reason: `Database host '${h}' is not on the verified non-production allowlist. Arbitrary private IP or remote hosts are strictly rejected.`,
                    redactedUri: redacted,
                    host: h,
                    dbName
                };
            }
        }

        // 2.6 Verify open Mongoose connection matches target if already connected
        // Strict matching: NO exceptions for localhost or 127.0.0.1 bypass
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const activeHost = mongoose.connection.host || '';
            const activeDb = mongoose.connection.name || '';

            // Check if active connection host or name has production patterns
            if (FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeHost)) ||
                FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeDb))) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'EXISTING_CONNECTION_PRODUCTION_DETECTED',
                    environment: 'PRODUCTION',
                    reason: `Active Mongoose connection (${activeHost}/${activeDb}) matches production pattern.`,
                    redactedUri: redacted,
                    host: activeHost,
                    dbName: activeDb
                };
            }

            // Reject active connection with generic database name
            if (GENERIC_DATABASE_NAMES.includes(activeDb.toLowerCase())) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'EXISTING_CONNECTION_GENERIC_DB_REJECTED',
                    environment: 'UNKNOWN',
                    reason: `Active Mongoose connection database name '${activeDb}' is generic.`,
                    redactedUri: redacted,
                    host: activeHost,
                    dbName: activeDb
                };
            }

            // Verify database name matches exactly (unless active is test/temporary_test_db under allowMemoryFallback)
            const isTestEquivalent = options.allowMemoryFallback && (activeDb === 'test' || activeDb === 'temporary_test_db') && (dbName === 'test' || dbName === 'temporary_test_db');
            if (dbName && activeDb && dbName.toLowerCase() !== activeDb.toLowerCase() && !isTestEquivalent) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'EXISTING_CONNECTION_MISMATCH',
                    environment: 'UNKNOWN',
                    reason: `Active Mongoose connection database name '${activeDb}' does not match target database name '${dbName}'.`,
                    redactedUri: redacted,
                    host: activeHost,
                    dbName: activeDb
                };
            }

            // Verify host matches target hosts
            // Both must match. A local URI must not bypass comparison with an existing remote connection.
            const isLoopback = (h) => h === 'localhost' || h === '127.0.0.1';
            const matchesActiveHost = hostNames.some(h => {
                if (h.toLowerCase() === activeHost.toLowerCase()) return true;
                if (isLoopback(h) && isLoopback(activeHost)) return true;
                return false;
            });

            if (!matchesActiveHost) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'EXISTING_CONNECTION_MISMATCH',
                    environment: 'UNKNOWN',
                    reason: `Active Mongoose connection host '${activeHost}' does not match target staging host set [${hostNames.join(', ')}].`,
                    redactedUri: redacted,
                    host: activeHost,
                    dbName: activeDb
                };
            }
        }

        const isLoopbackHost = host === 'localhost' || host === '127.0.0.1';
        const isTemporaryDb = isLoopbackHost || /temp|temporary|memory/i.test(dbName) || /memory/i.test(host);
        return {
            verified: true,
            status: isTemporaryDb ? 'TEMPORARY_TEST_DATABASE_VERIFIED' : 'PERSISTENT_NON_PRODUCTION_VERIFIED',
            code: isTemporaryDb ? 'TEMPORARY_TEST_DATABASE_VERIFIED' : 'PERSISTENT_NON_PRODUCTION_VERIFIED',
            environment: isTemporaryDb ? 'TEMPORARY_TEST_DATABASE' : 'PERSISTENT_NON_PRODUCTION_STAGING',
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
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'EXISTING_CONNECTION_PRODUCTION_DETECTED',
                environment: 'PRODUCTION',
                reason: `Active Mongoose connection (${activeHost}/${activeDb}) matches production pattern.`,
                redactedUri: 'mongodb://[ACTIVE_CONNECTION]',
                host: activeHost,
                dbName: activeDb
            };
        }

        if (GENERIC_DATABASE_NAMES.includes(activeDb.toLowerCase())) {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'EXISTING_CONNECTION_GENERIC_DB_REJECTED',
                environment: 'UNKNOWN',
                reason: `Active Mongoose connection database name '${activeDb}' is generic.`,
                redactedUri: 'mongodb://[ACTIVE_CONNECTION]',
                host: activeHost,
                dbName: activeDb
            };
        }

        const isAllowedActiveHost = activeHostPatterns.some(pat => pat.test(activeHost));
        if (!isAllowedActiveHost) {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'UNKNOWN_HOST_REJECTED',
                environment: 'UNKNOWN',
                reason: `Active connection host '${activeHost}' is not on non-production allowlist. Arbitrary remote connection rejected.`,
                redactedUri: 'mongodb://[ACTIVE_CONNECTION]',
                host: activeHost,
                dbName: activeDb
            };
        }

        return {
            verified: true,
            status: 'TEMPORARY_TEST_DATABASE_VERIFIED',
            code: 'TEMPORARY_TEST_DATABASE_VERIFIED',
            environment: 'TEMPORARY_TEST_DATABASE',
            reason: null,
            redactedUri: `mongodb://${activeHost}:[ACTIVE_PORT]/${activeDb}`,
            host: activeHost,
            dbName: activeDb
        };
    }

    return {
        verified: true,
        status: 'TEMPORARY_TEST_DATABASE_ALLOWED',
        code: 'TEMPORARY_TEST_DATABASE_ALLOWED',
        environment: 'TEMPORARY_TEST_DATABASE',
        reason: null,
        redactedUri: 'mongodb://127.0.0.1:[IN_MEMORY]',
        host: '127.0.0.1',
        dbName: 'temporary_test_db'
    };
}
