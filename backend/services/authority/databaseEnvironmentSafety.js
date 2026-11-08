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
    /^::1$/i,
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

const EXPLICIT_PRODUCTION_ENVS = new Set([
    'production',
    'prod',
    'live',
    'prod-live',
    'production-live'
]);

const EXPLICIT_NON_PRODUCTION_ENVS = new Set([
    'development',
    'dev',
    'staging',
    'stage',
    'test',
    'testing',
    'nonprod',
    'non-prod',
    'non_prod',
    'nonproduction',
    'non-production',
    'non_production',
    'local',
    'sandbox'
]);

/**
 * Explicitly normalizes and classifies an environment variable string.
 * Trims and lowercases. Distinguishes 'nonprod' from 'prod'.
 * 
 * @param {string|null|undefined} envValue
 * @returns {'PRODUCTION' | 'NON_PRODUCTION' | 'UNSET' | 'UNKNOWN_OR_UNSAFE'}
 */
export function classifyEnvironment(envValue) {
    if (envValue === null || envValue === undefined) return 'UNSET';
    const normalized = String(envValue).trim().toLowerCase();
    if (!normalized || normalized === 'undefined' || normalized === 'null') return 'UNSET';
    if (EXPLICIT_PRODUCTION_ENVS.has(normalized)) {
        return 'PRODUCTION';
    }
    if (EXPLICIT_NON_PRODUCTION_ENVS.has(normalized)) {
        return 'NON_PRODUCTION';
    }
    return 'UNKNOWN_OR_UNSAFE';
}

/**
 * Checks whether any recognized environment indicator identifies a production environment.
 * @returns {boolean}
 */
export function isProductionEnvironment() {
    const recognizedEnvs = [
        process.env.NODE_ENV,
        process.env.APP_ENV,
        process.env.APPLICATION_ENV,
        process.env.ENVIRONMENT,
        process.env.STAGE
    ];
    for (const val of recognizedEnvs) {
        if (classifyEnvironment(val) === 'PRODUCTION') {
            return true;
        }
    }
    return false;
}

/**
 * Checks whether any recognized environment indicator identifies a production or unverified/unknown/unset environment.
 * Enforces fail-closed safety for transactions and dangerous execution paths.
 * All unset, unknown labels, conflicting production/non-production indicators, and production labels fail closed as unsafe.
 * 
 * @param {string|null|undefined} [envOverride]
 * @returns {boolean}
 */
export function isEnvironmentProductionOrUnsafe(envOverride) {
    if (typeof envOverride === 'string') {
        const cls = classifyEnvironment(envOverride);
        return cls === 'PRODUCTION' || cls === 'UNKNOWN_OR_UNSAFE' || cls === 'UNSET';
    }

    const envSource = (envOverride && typeof envOverride === 'object') ? envOverride : process.env;
    const recognizedEnvs = [
        envSource.NODE_ENV,
        envSource.APP_ENV,
        envSource.APPLICATION_ENV,
        envSource.ENVIRONMENT,
        envSource.STAGE
    ];

    let hasNonProd = false;
    let hasProd = false;
    let hasUnsafeOrUnknown = false;
    let setVariablesCount = 0;

    for (const val of recognizedEnvs) {
        const cls = classifyEnvironment(val);
        if (cls === 'PRODUCTION') {
            hasProd = true;
            setVariablesCount++;
        } else if (cls === 'NON_PRODUCTION') {
            hasNonProd = true;
            setVariablesCount++;
        } else if (cls === 'UNKNOWN_OR_UNSAFE') {
            hasUnsafeOrUnknown = true;
            setVariablesCount++;
        }
    }

    // 1. All environment variables unset -> classified as unsafe (fail-closed)
    if (setVariablesCount === 0) {
        return true;
    }

    // 2. Any explicit production indicator -> unsafe
    if (hasProd) {
        return true;
    }

    // 3. Any unknown or unrecognized label -> unsafe
    if (hasUnsafeOrUnknown) {
        return true;
    }

    // 4. Conflicting indicators (e.g. prod + non-prod) -> unsafe
    if (hasProd && hasNonProd) {
        return true;
    }

    // 5. Only explicitly recognized non-production environments are considered safe
    return !hasNonProd;
}

/**
 * Returns environment decision matrix for standard environment labels.
 * Explains policy, transaction requirements, and live execution boundaries.
 */
export function getEnvironmentDecisionMatrix() {
    return [
        { label: 'production', classification: 'PRODUCTION', requiresTransactions: true, writesAllowed: false, stagingDbRequired: false },
        { label: 'prod', classification: 'PRODUCTION', requiresTransactions: true, writesAllowed: false, stagingDbRequired: false },
        { label: 'live', classification: 'PRODUCTION', requiresTransactions: true, writesAllowed: false, stagingDbRequired: false },
        { label: 'development', classification: 'NON_PRODUCTION', requiresTransactions: false, writesAllowed: false, stagingDbRequired: false },
        { label: 'dev', classification: 'NON_PRODUCTION', requiresTransactions: false, writesAllowed: false, stagingDbRequired: false },
        { label: 'test', classification: 'NON_PRODUCTION', requiresTransactions: false, writesAllowed: false, stagingDbRequired: false },
        { label: 'testing', classification: 'NON_PRODUCTION', requiresTransactions: false, writesAllowed: false, stagingDbRequired: false },
        { label: 'staging', classification: 'NON_PRODUCTION', requiresTransactions: false, writesAllowed: false, stagingDbRequired: false },
        { label: 'nonprod', classification: 'NON_PRODUCTION', requiresTransactions: false, writesAllowed: false, stagingDbRequired: false }
    ];
}

/**
 * Redacts credentials and sensitive secrets from a MongoDB URI string.
 * Never throws; returns safely redacted string. Handles username-only,
 * special characters, URL-encoded credentials, and mixed-case query parameters.
 * 
 * @param {string} uri Raw MongoDB URI
 * @returns {string} Redacted URI
 */
export function redactMongoUri(uri) {
    if (!uri || typeof uri !== 'string') return '';
    try {
        let redacted = uri;

        // Redact user-info before the '@' symbol
        // Handles standard username:password, username-only, URL-encoded, and special characters
        if (redacted.includes('@')) {
            redacted = redacted.replace(/^((?:mongodb(?:\+srv)?):\/\/)[^/?#]+@/i, '$1****:****@');
            if (redacted.includes('@') && /^[^/?#]+@/.test(redacted)) {
                redacted = redacted.replace(/^[^/?#]+@/, '****:****@');
            }
        }

        // Redact sensitive query parameters case-insensitively
        // Covers password, pwd, secret, token, apikey, authsecret, credential, key variants
        redacted = redacted.replace(/([?&])([a-z0-9_-]*(?:password|pwd|secret|token|key|credential|cred)[a-z0-9_-]*)=([^&#]*)/gi, '$1$2=****');

        return redacted;
    } catch {
        return 'mongodb://[REDACTED_CREDENTIALS]';
    }
}

/**
 * Safely parses a host entry (which may be IPv4, hostname, or bracketed IPv6 like [::1]:27017).
 * 
 * @param {string} entry
 * @returns {{ host: string, port: number, isIpv6: boolean }}
 */
export function parseHostEntry(entry) {
    let h = (entry || '').trim();
    let p = null;
    if (h.startsWith('[')) {
        const closeIdx = h.indexOf(']');
        if (closeIdx !== -1) {
            const rawHost = h.slice(1, closeIdx);
            const rest = h.slice(closeIdx + 1);
            if (rest.startsWith(':')) {
                p = Number(rest.slice(1)) || 27017;
            } else {
                p = 27017;
            }
            return { host: rawHost, port: p, isIpv6: true };
        }
    }
    const parts = h.split(':');
    if (parts.length > 1) {
        p = Number(parts[parts.length - 1]) || 27017;
        h = parts.slice(0, -1).join(':');
    } else {
        p = 27017;
    }
    return { host: h, port: p, isIpv6: h.includes(':') };
}

/**
 * Parses connection details from a MongoDB connection string.
 * Supports standard, replica-set (comma-separated), SRV, and IPv6 connection strings.
 * 
 * @param {string} uri MongoDB URI
 * @returns {{ isSrv: boolean, protocol: string, hosts: string[], hostNames: string[], hostPorts: Array<{host: string, port: number}>, host: string, dbName: string, port: string, effectivePort: number, queryOptions: object, replicaSetName: string|null }}
 */
export function parseMongoDetails(uri) {
    if (!uri || typeof uri !== 'string') {
        return { isSrv: false, protocol: '', hosts: [], hostNames: [], hostPorts: [], host: '', dbName: '', port: '', effectivePort: 27017, queryOptions: {}, replicaSetName: null };
    }
    try {
        const isSrv = /^mongodb\+srv:\/\//i.test(uri);
        const protocol = isSrv ? 'mongodb+srv' : 'mongodb';
        const cleaned = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
        const withoutAuth = cleaned.includes('@') ? cleaned.split('@')[1] : cleaned;
        const [hostPortPart, ...rest] = withoutAuth.split('/');
        const pathPart = rest.join('/');
        const [rawDbName, rawQuery] = pathPart.split('?');
        const dbName = (rawDbName || '').trim();

        const queryOptions = {};
        let replicaSetName = null;
        if (rawQuery) {
            const params = rawQuery.split('&');
            for (const param of params) {
                const [k, v] = param.split('=');
                if (k) {
                    const decK = decodeURIComponent(k);
                    const decV = v ? decodeURIComponent(v) : '';
                    queryOptions[decK] = decV;
                    if (decK.toLowerCase() === 'replicaset') {
                        replicaSetName = decV;
                    }
                }
            }
        }

        // Parse multiple hosts for replica sets (e.g. host1:27017,host2:27017)
        const hostEntries = hostPortPart.split(',').map(h => h.trim()).filter(Boolean);
        const hostNames = [];
        const hostPorts = [];
        let primaryHost = '';
        let primaryPort = '';

        for (let i = 0; i < hostEntries.length; i++) {
            const parsed = parseHostEntry(hostEntries[i]);
            hostNames.push(parsed.host);
            hostPorts.push(parsed);
            if (i === 0) {
                primaryHost = parsed.host;
                primaryPort = hostEntries[i].includes(':') ? String(parsed.port) : '';
            }
        }

        const effectivePort = primaryPort ? Number(primaryPort) : (isSrv ? 27017 : 27017);

        return {
            isSrv,
            protocol,
            hosts: hostEntries,
            hostNames,
            hostPorts,
            host: primaryHost,
            dbName,
            port: primaryPort,
            effectivePort,
            queryOptions,
            replicaSetName
        };
    } catch {
        return { isSrv: false, protocol: '', hosts: [], hostNames: [], hostPorts: [], host: '', dbName: '', port: '', effectivePort: 27017, queryOptions: {}, replicaSetName: null };
    }
}

/**
 * Extracts verifiable active Mongoose connection identity directly from the Mongoose connection and client topology.
 * 
 * @param {object} [conn=mongoose.connection]
 * @returns {object|null}
 */
export function getActiveMongooseConnectionIdentity(conn = mongoose.connection) {
    if (!conn || conn.readyState !== 1) {
        return null;
    }
    const host = conn.host || '';
    const rawPort = conn.port;
    const port = rawPort ? Number(rawPort) : null;
    const dbName = conn.name || '';

    const servers = [];
    const serverMap = conn.client?.topology?.description?.servers;
    if (serverMap) {
        const keys = typeof serverMap.keys === 'function' ? Array.from(serverMap.keys()) : Object.keys(serverMap);
        for (const k of keys) {
            servers.push(parseHostEntry(k));
        }
    }
    if (servers.length === 0 && host) {
        servers.push({ host, port: port || 27017, isIpv6: host.includes(':') });
    }

    const topologyType = conn.client?.topology?.description?.type || null;
    const replicaSetName = conn.client?.topology?.description?.setName || null;

    return {
        host,
        port: port || (servers[0]?.port ?? 27017),
        dbName,
        servers,
        topologyType,
        replicaSetName,
        readyState: conn.readyState
    };
}

/**
 * Compares complete verifiable active connection identity against requested target details.
 * Enforces exact port equality, host consistency, database name matching, and topology verification.
 * 
 * @param {object} activeIdentity Active identity from getActiveMongooseConnectionIdentity
 * @param {object} targetDetails Parsed target details from parseMongoDetails
 * @param {object} [options={}]
 * @returns {{ matches: boolean, code?: string, reason?: string }}
 */
export function compareConnectionIdentities(activeIdentity, targetDetails, options = {}) {
    if (!activeIdentity || activeIdentity.readyState !== 1) {
        return {
            matches: false,
            code: 'NO_ACTIVE_CONNECTION',
            reason: 'No active Mongoose connection found to compare.'
        };
    }

    // Fail closed if active connection topology cannot be verified sufficiently
    if (!activeIdentity.host || !activeIdentity.port) {
        return {
            matches: false,
            code: 'UNVERIFIABLE_ACTIVE_TOPOLOGY',
            reason: 'Active Mongoose connection topology could not be verified sufficiently (missing host or port).'
        };
    }

    // Handle SRV identity verification
    if (targetDetails.isSrv) {
        if (!activeIdentity.topologyType || activeIdentity.topologyType === 'Unknown') {
            return {
                matches: false,
                code: 'SRV_TOPOLOGY_UNVERIFIABLE',
                reason: 'SRV target connection identity could not be verified against active connection topology.'
            };
        }
    }

    // Database name matching
    // A database name match alone must NEVER authorize a connection, but a mismatch must fail
    const isTestEquivalent = options.allowMemoryFallback &&
        (activeIdentity.dbName === 'test' || activeIdentity.dbName === 'temporary_test_db') &&
        (targetDetails.dbName === 'test' || targetDetails.dbName === 'temporary_test_db');

    if (targetDetails.dbName && activeIdentity.dbName &&
        targetDetails.dbName.toLowerCase() !== activeIdentity.dbName.toLowerCase() && !isTestEquivalent) {
        return {
            matches: false,
            code: 'EXISTING_CONNECTION_DBNAME_MISMATCH',
            reason: `Active Mongoose connection database name '${activeIdentity.dbName}' does not match target database name '${targetDetails.dbName}'.`
        };
    }

    // Replica Set Seed mismatch check
    if (targetDetails.hostPorts && targetDetails.hostPorts.length > 1) {
        const activeServerMap = new Map(activeIdentity.servers.map(s => [`${s.host.toLowerCase()}:${s.port}`, true]));
        for (const targetHp of targetDetails.hostPorts) {
            const key = `${targetHp.host.toLowerCase()}:${targetHp.port}`;
            if (!activeServerMap.has(key)) {
                return {
                    matches: false,
                    code: 'EXISTING_CONNECTION_REPLICA_SET_MISMATCH',
                    reason: `Active replica set topology does not match target replica set seed configuration. Missing seed ${key}.`
                };
            }
        }
    }

    // Single host / Primary Host & Port equality
    const isLoopback = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1';
    const targetIsLoopback = isLoopback(targetDetails.host);
    const activeIsLoopback = isLoopback(activeIdentity.host);

    // Existing remote/private connection with requested localhost URI
    if (targetIsLoopback && !activeIsLoopback) {
        return {
            matches: false,
            code: 'EXISTING_CONNECTION_HOST_MISMATCH',
            reason: `Active Mongoose connection (${activeIdentity.host}) is remote/private, whereas target URI specifies loopback (${targetDetails.host}).`
        };
    }

    // Existing localhost connection with requested remote staging URI
    if (!targetIsLoopback && activeIsLoopback) {
        return {
            matches: false,
            code: 'EXISTING_CONNECTION_HOST_MISMATCH',
            reason: `Active Mongoose connection is loopback (${activeIdentity.host}), whereas target URI specifies remote staging host (${targetDetails.host}).`
        };
    }

    // Both are loopback aliases: localhost and 127.0.0.1 are aliases ONLY when ports match!
    if (targetIsLoopback && activeIsLoopback) {
        if (targetDetails.effectivePort !== activeIdentity.port) {
            return {
                matches: false,
                code: 'EXISTING_CONNECTION_PORT_MISMATCH',
                reason: `Active Mongoose connection port (${activeIdentity.port}) does not match target port (${targetDetails.effectivePort}) for loopback connection.`
            };
        }
    } else {
        // Both are non-loopback
        if (targetDetails.host.toLowerCase() !== activeIdentity.host.toLowerCase()) {
            return {
                matches: false,
                code: 'EXISTING_CONNECTION_HOST_MISMATCH',
                reason: `Active Mongoose connection host '${activeIdentity.host}' does not match target host '${targetDetails.host}'.`
            };
        }
        if (targetDetails.effectivePort !== activeIdentity.port) {
            return {
                matches: false,
                code: 'EXISTING_CONNECTION_PORT_MISMATCH',
                reason: `Active Mongoose connection port (${activeIdentity.port}) does not match target port (${targetDetails.effectivePort}).`
            };
        }
    }

    return { matches: true };
}

/**
 * Verifies that the execution environment and target database are provably non-production.
 * Enforces strict fail-closed identity verification across environment variables, hosts, ports,
 * database names, and active Mongoose connection state.
 * 
 * @param {object} options
 * @param {string} [options.uri] Target MongoDB URI to evaluate
 * @param {boolean} [options.allowMemoryFallback=true] Whether local temporary MongoMemoryServer is permitted
 * @returns {{ verified: boolean, status: string, code: string, environment: string, reason: string|null, redactedUri: string, host: string, dbName: string }}
 */
export function verifyDatabaseEnvironmentSafety(options = {}) {
    // Single permanent production database architecture: no staging URI is required
    const rawUri = options.uri || '';
    const redacted = redactMongoUri(rawUri);

    // 1. Comprehensive environment variable validation using normalized classification
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
        const classification = classifyEnvironment(value);
        if (classification === 'PRODUCTION') {
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
        if (classification === 'UNKNOWN_OR_UNSAFE') {
            return {
                verified: false,
                status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                code: 'UNRECOGNIZED_ENVIRONMENT_DETECTED',
                environment: 'UNKNOWN',
                reason: `Unrecognized or ambiguous environment value in ${name}='${value}'. Fail-closed policy rejects execution.`,
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
        let parsedTarget = parseMongoDetails(rawUri);
        let { hostNames, host, dbName } = parsedTarget;

        // If allowMemoryFallback is true and URI is localhost with no dbName, default to temporary_test_db
        if (!dbName && options.allowMemoryFallback && (host === 'localhost' || host === '127.0.0.1')) {
            dbName = 'temporary_test_db';
            parsedTarget.dbName = dbName;
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
        // Strict matching: Exact port, host, and database name comparison
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const activeIdentity = getActiveMongooseConnectionIdentity(mongoose.connection);

            if (!activeIdentity) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'UNVERIFIABLE_ACTIVE_TOPOLOGY',
                    environment: 'UNKNOWN',
                    reason: 'Mongoose is connected but active connection identity could not be verified.',
                    redactedUri: redacted,
                    host,
                    dbName
                };
            }

            // Check if active connection host or name has production patterns
            if (FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeIdentity.host)) ||
                FORBIDDEN_PRODUCTION_PATTERNS.some(pat => pat.test(activeIdentity.dbName))) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'EXISTING_CONNECTION_PRODUCTION_DETECTED',
                    environment: 'PRODUCTION',
                    reason: `Active Mongoose connection (${activeIdentity.host}/${activeIdentity.dbName}) matches production pattern.`,
                    redactedUri: redacted,
                    host: activeIdentity.host,
                    dbName: activeIdentity.dbName
                };
            }

            // Reject active connection with generic database name
            if (GENERIC_DATABASE_NAMES.includes(activeIdentity.dbName.toLowerCase())) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: 'EXISTING_CONNECTION_GENERIC_DB_REJECTED',
                    environment: 'UNKNOWN',
                    reason: `Active Mongoose connection database name '${activeIdentity.dbName}' is generic.`,
                    redactedUri: redacted,
                    host: activeIdentity.host,
                    dbName: activeIdentity.dbName
                };
            }

            // Perform complete connection identity comparison
            const comparison = compareConnectionIdentities(activeIdentity, parsedTarget, options);
            if (!comparison.matches) {
                return {
                    verified: false,
                    status: 'BLOCKED_DATABASE_ENVIRONMENT_NOT_VERIFIED',
                    code: comparison.code || 'EXISTING_CONNECTION_MISMATCH',
                    environment: 'UNKNOWN',
                    reason: comparison.reason || 'Active Mongoose connection does not match target URI identity.',
                    redactedUri: redacted,
                    host: activeIdentity.host,
                    dbName: activeIdentity.dbName
                };
            }
        }

        const isLoopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
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
        const activeIdentity = getActiveMongooseConnectionIdentity(mongoose.connection);
        const activeHost = activeIdentity?.host || mongoose.connection.host || '';
        const activeDb = activeIdentity?.dbName || mongoose.connection.name || '';

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
