import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATION_NAME = '004-contact-phone-unique-index-migration';
export const TARGET_INDEX_NAME = 'contacts_phones_number_active_unique';
export const TARGET_INDEX_SPEC = { 'phones.number': 1 };
export const TARGET_INDEX_OPTIONS = {
    name: TARGET_INDEX_NAME,
    unique: true,
    partialFilterExpression: {
        'phones.number': { $type: 'string' },
        isDeleted: false,
        isMerged: false
    },
    background: true
};

// Production Cluster Fingerprints / Allowlist
export const PRODUCTION_CLUSTER_FINGERPRINTS = Object.freeze([
    '7dehanz.mongodb.net',
    'cluster0.7dehanz.mongodb.net',
    'atlas-145yac-shard-0'
]);

export const PRODUCTION_CLUSTER_ID = 'production-atlas-7dehanz';

// Runtime Approval Configuration & Anti-Replay Nonce Store
export const MAX_APPROVAL_TOKEN_AGE_MS = 5 * 60 * 1000; // 5 minutes maximum token validity
export const consumedApprovalNonces = new Set();

/**
 * Creates an explicit, bound runtime operator approval token.
 * Contains migration name, target operation, cluster ID, issue timestamp, and a cryptographic nonce.
 *
 * @param {Object} [params]
 * @param {string} [params.migration]
 * @param {string} params.operation - 'EXECUTE' | 'ROLLBACK'
 * @param {string} [params.clusterId]
 * @param {number} [params.issuedAt]
 * @param {string} [params.nonce]
 * @returns {string}
 */
export function createRuntimeDbaApprovalToken({
    migration = MIGRATION_NAME,
    operation,
    clusterId = PRODUCTION_CLUSTER_ID,
    issuedAt = Date.now(),
    nonce = crypto.randomBytes(16).toString('hex')
} = {}) {
    if (!operation || typeof operation !== 'string') {
        throw new Error('Operation is required for approval token (EXECUTE or ROLLBACK)');
    }
    return `${migration}:${operation.toUpperCase()}:${clusterId}:${issuedAt}:${nonce}`;
}

/**
 * Sanitizes MongoDB URIs and host strings by removing credentials.
 * Ensures passwords and tokens are never printed to logs or error messages.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeMongoUri(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/gi, 'mongodb$1://$2:***@');
}

/**
 * Normalizes phone numbers for business deduplication analysis.
 * Strips formatting, whitespace, and standard Indian country code / trunk prefixes.
 *
 * NOTE: This is for forensic reporting only. Index creation NEVER mutates
 * or normalizes stored database values.
 *
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhoneForDeduplication(phone) {
    if (!phone || typeof phone !== 'string') return '';
    let cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+91')) {
        cleaned = cleaned.slice(3);
    } else if (cleaned.startsWith('91') && cleaned.length === 12) {
        cleaned = cleaned.slice(2);
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
        cleaned = cleaned.slice(1);
    }
    return cleaned;
}

/**
 * Resolves and validates connected MongoDB cluster identity.
 * Validates actual host and cluster topology; database name alone is NOT sufficient.
 *
 * @param {mongoose.Connection|mongoose.mongo.Db|Object} conn
 * @returns {Promise<{
 *   isValid: boolean,
 *   isProductionCluster: boolean,
 *   clusterType: string,
 *   clusterId: string,
 *   dbName: string,
 *   hosts: string[],
 *   replicaSetName: string|null,
 *   error?: string
 * }>}
 */
export async function resolveClusterIdentity(conn) {
    const db = conn?.db || conn;
    const dbName = String(db?.databaseName || conn?.name || '').trim();
    const rawHosts = new Set();

    if (conn?.host) {
        rawHosts.add(String(conn.host).toLowerCase());
    }

    const client = conn?.client || db?.client;
    if (client?.topology?.description?.servers) {
        for (const serverKey of client.topology.description.servers.keys()) {
            const hostOnly = serverKey.split(':')[0].toLowerCase();
            rawHosts.add(hostOnly);
        }
    }

    if (Array.isArray(client?.options?.hosts)) {
        client.options.hosts.forEach(h => {
            const hostOnly = String(h).split(':')[0].toLowerCase();
            rawHosts.add(hostOnly);
        });
    }

    let replicaSetName = null;
    try {
        if (typeof db?.command === 'function') {
            const hello = await db.command({ hello: 1 }).catch(() => db.command({ isMaster: 1 })).catch(() => null);
            if (hello) {
                if (hello.me) rawHosts.add(String(hello.me).split(':')[0].toLowerCase());
                if (Array.isArray(hello.hosts)) {
                    hello.hosts.forEach(h => rawHosts.add(String(h).split(':')[0].toLowerCase()));
                }
                if (hello.setName) replicaSetName = String(hello.setName).toLowerCase();
            }
        }
    } catch (_) {}

    const hosts = Array.from(rawHosts).map(h => sanitizeMongoUri(h));

    if (hosts.length === 0 || !dbName) {
        return {
            isValid: false,
            isProductionCluster: false,
            clusterType: 'UNKNOWN_UNVERIFIED',
            clusterId: 'unknown',
            dbName,
            hosts,
            replicaSetName,
            error: 'Database or cluster host identity cannot be established. Fail closed.'
        };
    }

    // Check against production Atlas fingerprint allowlist
    const isAtlasHost = hosts.some(h =>
        PRODUCTION_CLUSTER_FINGERPRINTS.some(fp => h.includes(fp.toLowerCase()))
    );
    const isAtlasReplSet = replicaSetName && PRODUCTION_CLUSTER_FINGERPRINTS.some(fp => replicaSetName.includes(fp.toLowerCase()));

    if (isAtlasHost || isAtlasReplSet) {
        return {
            isValid: true,
            isProductionCluster: true,
            clusterType: 'PRODUCTION_ATLAS',
            clusterId: PRODUCTION_CLUSTER_ID,
            dbName,
            hosts,
            replicaSetName
        };
    }

    // Check if host is strictly local / test
    const isLocalTestHost = hosts.every(h =>
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '::1' ||
        h.startsWith('127.0.0.1') ||
        h.includes('mongodb-memory-server') ||
        h.includes('local')
    );

    if (isLocalTestHost) {
        if (dbName === 'bharatproperties1') {
            return {
                isValid: true,
                isProductionCluster: false,
                clusterType: 'NON_PROD_CLUSTER_WITH_PROD_DB_NAME',
                clusterId: 'local-test-simulated-prod',
                dbName,
                hosts,
                replicaSetName
            };
        }
        return {
            isValid: true,
            isProductionCluster: false,
            clusterType: 'LOCAL_TEST',
            clusterId: 'local-test',
            dbName,
            hosts,
            replicaSetName
        };
    }

    // Unverified remote host -> fail closed
    return {
        isValid: false,
        isProductionCluster: false,
        clusterType: 'UNKNOWN_UNVERIFIED',
        clusterId: 'unknown-remote-cluster',
        dbName,
        hosts,
        replicaSetName,
        error: `Connected host(s) [${hosts.join(', ')}] do not match verified production allowlist or local test fingerprints. Fail closed.`
    };
}

/**
 * Validates operator approval.
 * Persistent .env values must NOT independently count as explicit DBA approval.
 * Requires controlled runtime confirmation token bound to migration name, operation and target cluster.
 *
 * @param {string} mode - 'dry-run' | 'execute' | 'rollback'
 * @param {Object} clusterInfo - Result from resolveClusterIdentity
 * @param {Object} opts - Migration options
 * @returns {{ approved: boolean, approvalSource: string, confirmedToken?: string }}
 */
export function verifyOperatorApproval(mode, clusterInfo, opts = {}) {
    if (mode === 'dry-run') {
        return { approved: true, approvalSource: 'DRY_RUN_READ_ONLY' };
    }

    if (!clusterInfo.isValid) {
        throw new Error(`[MIGRATION-004] FATAL: ${clusterInfo.error || 'Cluster identity is unverified. Fail closed.'}`);
    }

    // Production Cluster Guard: applies whenever connected to production Atlas, regardless of dbName
    if (clusterInfo.isProductionCluster) {
        const prodFlag = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';
        const dbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION === 'true';

        // 1. Baseline environment flags
        if (!prodFlag || !dbaFlag) {
            throw new Error(
                `[MIGRATION-004] FATAL: Production ${mode.toUpperCase()} blocked. Requires explicit ALLOW_PRODUCTION_MIGRATION=true AND DBA_APPROVED_INDEX_MIGRATION=true. Aborting.`
            );
        }

        // 2. Controlled Runtime Approval Token Check
        // Production approval must originate from an explicit operator interaction at execution time,
        // strictly NOT from persistent .env or environment variables.
        // process.env.DBA_CONFIRM_MIGRATION is intentionally REMOVED as an approval source.
        const runtimeToken = opts.runtimeDbaConfirmation ||
                             (process.argv.find(arg => arg.startsWith('--confirm-dba-approval='))?.split('=')[1]);

        if (!runtimeToken || typeof runtimeToken !== 'string' || runtimeToken.trim() === '') {
            throw new Error(
                `[MIGRATION-004] FATAL: Production ${mode.toUpperCase()} requires explicit runtime operator approval ` +
                `(--confirm-dba-approval or runtimeDbaConfirmation). ` +
                `Persistent .env variables or shell environments cannot authorize production execution.`
            );
        }

        const parts = runtimeToken.trim().split(':');

        if (parts.length !== 5) {
            throw new Error(
                `[MIGRATION-004] FATAL: Malformed runtime approval token. Expected format: "<migrationName>:<OPERATION>:<clusterId>:<issuedAtEpochMs>:<nonce>". ` +
                `Static or unversioned approval strings are strictly rejected.`
            );
        }

        const [tokenMigration, tokenOp, tokenCluster, tokenIssuedAtStr, tokenNonce] = parts;

        if (tokenMigration !== MIGRATION_NAME) {
            throw new Error(
                `[MIGRATION-004] FATAL: Mismatched migration approval. Expected approval for "${MIGRATION_NAME}".`
            );
        }

        if (tokenOp.toUpperCase() !== mode.toUpperCase()) {
            throw new Error(
                `[MIGRATION-004] FATAL: Stale or mismatched operation approval. Expected operation "${mode.toUpperCase()}".`
            );
        }

        if (tokenCluster !== clusterInfo.clusterId) {
            throw new Error(
                `[MIGRATION-004] FATAL: Mismatched target cluster approval. Expected cluster "${clusterInfo.clusterId}".`
            );
        }

        // Expiry verification
        const tokenIssuedAt = parseInt(tokenIssuedAtStr, 10);
        if (isNaN(tokenIssuedAt)) {
            throw new Error(
                `[MIGRATION-004] FATAL: Malformed runtime approval token. Issued timestamp is invalid.`
            );
        }

        const now = Date.now();
        if (now - tokenIssuedAt > MAX_APPROVAL_TOKEN_AGE_MS) {
            throw new Error(
                `[MIGRATION-004] FATAL: Runtime approval token has expired. Tokens are valid for at most 5 minutes. Re-issue fresh approval.`
            );
        }

        if (tokenIssuedAt - now > 60000) {
            throw new Error(
                `[MIGRATION-004] FATAL: Runtime approval token has invalid future timestamp.`
            );
        }

        // Nonce entropy verification
        if (!tokenNonce || tokenNonce.length < 16) {
            throw new Error(
                `[MIGRATION-004] FATAL: Runtime approval token nonce has insufficient entropy (minimum 16 characters required).`
            );
        }

        // Replay prevention / Single-use consumption
        if (consumedApprovalNonces.has(tokenNonce)) {
            throw new Error(
                `[MIGRATION-004] FATAL: Replay detected. Runtime approval token nonce has already been consumed. Approval tokens are strictly single-use.`
            );
        }
        consumedApprovalNonces.add(tokenNonce);

        return {
            approved: true,
            approvalSource: 'RUNTIME_OPERATOR_TOKEN',
            confirmedOperation: mode.toUpperCase(),
            clusterId: clusterInfo.clusterId,
            issuedAt: tokenIssuedAt
        };
    }

    // Non-production cluster using production database name: safely handled
    if (clusterInfo.clusterType === 'NON_PROD_CLUSTER_WITH_PROD_DB_NAME') {
        const devSimulateFlag = opts.allowNonProdSimulatedProd === true ||
                                process.env.ALLOW_NON_PROD_SIMULATED_PROD === 'true' ||
                                process.argv.includes('--allow-non-prod-simulated-prod');

        if (!devSimulateFlag) {
            throw new Error(
                `[MIGRATION-004] SAFETY GUARD: Connected to non-production host [${clusterInfo.hosts.join(', ')}] with production database name "${clusterInfo.dbName}". ` +
                `To execute on this local simulation target, explicitly set ALLOW_NON_PROD_SIMULATED_PROD=true or pass --allow-non-prod-simulated-prod.`
            );
        }

        return {
            approved: true,
            approvalSource: 'LOCAL_DEV_SIMULATION_FLAG'
        };
    }

    return {
        approved: true,
        approvalSource: 'LOCAL_TEST_ENVIRONMENT'
    };
}

/**
 * Read-only phone duplicate detection on active contacts.
 *
 * @param {mongoose.Connection|mongoose.mongo.Db} targetDb
 * @returns {Promise<Object>}
 */
export async function detectActivePhoneDuplicates(targetDb) {
    const db = targetDb.db || targetDb;
    const collection = db.collection('contacts');

    // 1. Total explicitly active contacts matching the index partialFilterExpression
    const totalActiveContacts = await collection.countDocuments({
        isDeleted: false,
        isMerged: false
    });

    // 2. Detect lifecycle flag gaps: contacts where isDeleted or isMerged is missing or null
    const lifecycleGapsQuery = {
        $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: null },
            { isMerged: { $exists: false } },
            { isMerged: null }
        ]
    };
    const totalLifecycleFlagGaps = await collection.countDocuments(lifecycleGapsQuery);
    const sampleLifecycleFlagGaps = await collection.find(lifecycleGapsQuery, {
        projection: { _id: 1, name: 1, isDeleted: 1, isMerged: 1 }
    }).limit(10).toArray();

    // 3. Exact String Duplicate Detection via Aggregation
    const exactPipeline = [
        {
            $match: {
                isDeleted: false,
                isMerged: false,
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        { $unwind: '$phones' },
        {
            $match: {
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        {
            $group: {
                _id: '$phones.number',
                count: { $sum: 1 },
                contactIds: { $addToSet: '$_id' },
                contacts: {
                    $push: {
                        contactId: '$_id',
                        name: '$name',
                        rawNumber: '$phones.number'
                    }
                }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        },
        {
            $sort: { count: -1 }
        }
    ];

    const exactDuplicateGroups = await collection.aggregate(exactPipeline).toArray();
    const crossContactExactDuplicates = exactDuplicateGroups.filter(g => g.contactIds.length > 1);
    const intraContactExactDuplicates = exactDuplicateGroups.filter(g => g.contactIds.length === 1 && g.count > 1);

    // 4. Normalized Phone Business Duplicate Scan
    const activePhonesDocs = await collection.aggregate([
        {
            $match: {
                isDeleted: false,
                isMerged: false,
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        { $unwind: '$phones' },
        {
            $match: {
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                rawNumber: '$phones.number'
            }
        }
    ]).toArray();

    const normalizedMap = new Map();
    for (const doc of activePhonesDocs) {
        const norm = normalizePhoneForDeduplication(doc.rawNumber);
        if (!norm) continue;
        if (!normalizedMap.has(norm)) {
            normalizedMap.set(norm, {
                normalizedNumber: norm,
                rawNumbers: new Set(),
                contactIds: new Set(),
                contacts: []
            });
        }
        const entry = normalizedMap.get(norm);
        entry.rawNumbers.add(doc.rawNumber);
        entry.contactIds.add(doc._id.toString());
        entry.contacts.push({
            contactId: doc._id,
            name: doc.name,
            rawNumber: doc.rawNumber
        });
    }

    const normalizedPhoneDuplicates = [];
    const normalizedVariantsAcrossContacts = [];

    for (const [norm, data] of normalizedMap.entries()) {
        if (data.contactIds.size > 1) {
            const group = {
                _id: norm,
                normalizedNumber: norm,
                distinctContactsCount: data.contactIds.size,
                rawNumbers: Array.from(data.rawNumbers),
                contacts: data.contacts
            };
            normalizedPhoneDuplicates.push(group);

            if (data.rawNumbers.size > 1) {
                normalizedVariantsAcrossContacts.push(group);
            }
        }
    }

    return {
        totalActiveContacts,
        totalLifecycleFlagGaps,
        lifecycleFlagGaps: sampleLifecycleFlagGaps,
        exactDuplicateGroups,
        duplicateGroups: exactDuplicateGroups,
        crossContactDuplicates: crossContactExactDuplicates,
        crossContactExactDuplicates,
        intraContactDuplicates: intraContactExactDuplicates,
        intraContactExactDuplicates,
        normalizedPhoneDuplicates,
        normalizedVariantsAcrossContacts
    };
}

/**
 * Safe Migration Runner for Contact Partial Unique Index
 *
 * @param {Object} opts
 * @param {'dry-run'|'execute'|'rollback'} [opts.mode='dry-run']
 * @param {mongoose.Connection} [opts.connection]
 * @param {string} [opts.runtimeDbaConfirmation]
 * @param {boolean} [opts.allowNonProdSimulatedProd]
 * @returns {Promise<Object>}
 */
export async function runMigration(opts = {}) {
    const allowedModes = ['dry-run', 'execute', 'rollback'];
    const mode = opts.mode || (process.argv.includes('--execute') ? 'execute' : (process.argv.includes('--rollback') ? 'rollback' : 'dry-run'));

    if (!allowedModes.includes(mode)) {
        throw new Error(`[MIGRATION-004] FATAL: Unknown migration mode "${mode}". Allowed modes are: ${allowedModes.join(', ')}.`);
    }

    const conn = opts.connection || mongoose.connection;
    const db = conn?.db || conn;

    // Resolve and validate connected cluster identity (fail closed on unknown cluster)
    const clusterInfo = await resolveClusterIdentity(conn);
    if (!clusterInfo.isValid) {
        throw new Error(`[MIGRATION-004] FATAL: ${clusterInfo.error}`);
    }

    // Verify explicit operator approval (binds migration name, operation, and target cluster)
    const approval = verifyOperatorApproval(mode, clusterInfo, opts);

    const collection = db.collection('contacts');

    console.log(`[MIGRATION-004] Mode: ${mode.toUpperCase()}`);
    console.log(`[MIGRATION-004] Target Database: ${clusterInfo.dbName}`);
    console.log(`[MIGRATION-004] Target Cluster: ${clusterInfo.clusterId} (${clusterInfo.clusterType})`);
    console.log(`[MIGRATION-004] Approval Source: ${approval.approvalSource}`);

    // Inspect existing indexes
    const existingIndexes = await collection.indexes();
    const existingIndexNames = existingIndexes.map(i => i.name);
    console.log(`[MIGRATION-004] Existing indexes on contacts:`, existingIndexNames);

    if (mode === 'rollback') {
        console.log(`[MIGRATION-004] Executing Rollback: Dropping index ${TARGET_INDEX_NAME}...`);
        const indexExists = existingIndexNames.includes(TARGET_INDEX_NAME);
        if (indexExists) {
            await collection.dropIndex(TARGET_INDEX_NAME);
            console.log(`[MIGRATION-004] ✅ Successfully dropped index ${TARGET_INDEX_NAME}.`);
        } else {
            console.log(`[MIGRATION-004] ℹ️ Index ${TARGET_INDEX_NAME} was not present. No drop needed.`);
        }

        const postRollbackIndexes = await collection.indexes();
        const targetStillExists = postRollbackIndexes.some(i => i.name === TARGET_INDEX_NAME);
        if (targetStillExists) {
            throw new Error(`[MIGRATION-004] Rollback verification failed: Index ${TARGET_INDEX_NAME} still exists after dropIndex.`);
        }

        const legacyIndexPreserved = postRollbackIndexes.some(i => i.name === 'phones.number_1');
        if (existingIndexNames.includes('phones.number_1') && !legacyIndexPreserved) {
            throw new Error(`[MIGRATION-004] Rollback verification failed: Legacy index phones.number_1 was unexpectedly dropped.`);
        }

        return {
            status: 'ROLLED_BACK',
            indexDropped: indexExists,
            currentIndexes: postRollbackIndexes.map(i => i.name),
            clusterInfo: { clusterId: clusterInfo.clusterId, clusterType: clusterInfo.clusterType }
        };
    }

    // Preflight Duplicate Scan
    console.log(`[MIGRATION-004] Running preflight duplicate scan on active contacts...`);
    const scanResult = await detectActivePhoneDuplicates(db);
    console.log(`[MIGRATION-004] Preflight Scan Summary:`, {
        totalActiveContacts: scanResult.totalActiveContacts,
        totalLifecycleFlagGaps: scanResult.totalLifecycleFlagGaps,
        exactDuplicateGroupsFound: scanResult.exactDuplicateGroups.length,
        crossContactExactDuplicates: scanResult.crossContactExactDuplicates.length,
        intraContactExactDuplicates: scanResult.intraContactExactDuplicates.length,
        normalizedPhoneDuplicateGroups: scanResult.normalizedPhoneDuplicates.length,
        normalizedVariantsAcrossContacts: scanResult.normalizedVariantsAcrossContacts.length
    });

    if (scanResult.totalLifecycleFlagGaps > 0) {
        console.warn(`[MIGRATION-004] ⚠️ ${scanResult.totalLifecycleFlagGaps} contacts have missing/null isDeleted or isMerged flags. These contacts are EXCLUDED from the partial index until normalized.`);
    }

    if (scanResult.crossContactExactDuplicates.length > 0) {
        console.warn(`[MIGRATION-004] ⚠️ Exact-string duplicate phone numbers detected across active contacts (WILL BLOCK INDEX BUILD):`);
        scanResult.crossContactExactDuplicates.slice(0, 10).forEach(g => {
            console.warn(`  - Phone: "${g._id}" | Active Contacts: ${g.contacts.map(c => `${c.contactId} (${c.name})`).join(', ')}`);
        });
        if (scanResult.crossContactExactDuplicates.length > 10) {
            console.warn(`  ... and ${scanResult.crossContactExactDuplicates.length - 10} more exact duplicate groups.`);
        }
    }

    if (scanResult.normalizedVariantsAcrossContacts.length > 0) {
        console.warn(`[MIGRATION-004] ℹ️ Business duplicate phone variants detected across active contacts (raw strings differ; will NOT block index build, but review is recommended):`);
        scanResult.normalizedVariantsAcrossContacts.slice(0, 10).forEach(g => {
            console.warn(`  - Normalized: "${g.normalizedNumber}" | Raw values: ${JSON.stringify(g.rawNumbers)} | Contacts: ${g.contacts.map(c => `${c.contactId} (${c.name})`).join(', ')}`);
        });
    }

    if (mode === 'dry-run') {
        const buildFeasible = scanResult.crossContactExactDuplicates.length === 0;
        console.log(`[MIGRATION-004] [DRY RUN] Target Index Definition:`, {
            spec: TARGET_INDEX_SPEC,
            options: TARGET_INDEX_OPTIONS
        });
        console.log(`[MIGRATION-004] [DRY RUN] Build Feasible without E11000 collision: ${buildFeasible}`);
        console.log(`[MIGRATION-004] [DRY RUN] Legacy non-unique index 'phones.number_1' will be PRESERVED.`);
        console.log(`[MIGRATION-004] [DRY RUN] NOTE: Index creation NEVER mutates or normalizes stored data.`);
        return {
            status: 'DRY_RUN_COMPLETED',
            buildFeasible,
            scanResult,
            targetIndex: {
                spec: TARGET_INDEX_SPEC,
                options: TARGET_INDEX_OPTIONS
            },
            clusterInfo: { clusterId: clusterInfo.clusterId, clusterType: clusterInfo.clusterType }
        };
    }

    if (mode === 'execute') {
        if (scanResult.crossContactExactDuplicates.length > 0) {
            const err = new Error(`[MIGRATION-004] Preflight check failed: ${scanResult.crossContactExactDuplicates.length} active cross-contact duplicate phone groups exist. Unique index build would fail with E11000. Resolve duplicates via Contact Merge before running migration.`);
            console.error(err.message);
            throw err;
        }

        console.log(`[MIGRATION-004] Preflight passed with 0 cross-contact exact duplicates. Creating index ${TARGET_INDEX_NAME}...`);

        try {
            await collection.createIndex(TARGET_INDEX_SPEC, TARGET_INDEX_OPTIONS);
        } catch (err) {
            if (err.code === 11000 || err.message?.includes('E11000')) {
                const abortMsg = `[MIGRATION-004] CONTROLLED ABORT: Unique index creation failed with E11000 duplicate key error. A duplicate active phone was inserted concurrently between preflight scan and index build. Collection state is untouched. Error: ${err.message}`;
                console.error(abortMsg);
                const controlledError = new Error(abortMsg);
                controlledError.code = 'E11000_CONCURRENT_INSERT';
                controlledError.originalError = err;
                throw controlledError;
            }
            throw err;
        }

        const postBuildIndexes = await collection.indexes();
        const createdIndex = postBuildIndexes.find(i => i.name === TARGET_INDEX_NAME);
        if (!createdIndex) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index ${TARGET_INDEX_NAME} was not found in collection.indexes().`);
        }

        const keyMatches = createdIndex.key && createdIndex.key['phones.number'] === 1 && Object.keys(createdIndex.key).length === 1;
        if (!keyMatches) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index key does not match expected { 'phones.number': 1 }. Found: ${JSON.stringify(createdIndex.key)}`);
        }

        if (createdIndex.unique !== true) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index is not unique. unique=${createdIndex.unique}`);
        }

        const pfe = createdIndex.partialFilterExpression;
        if (!pfe || pfe.isDeleted !== false || pfe.isMerged !== false) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: partialFilterExpression does not match expected { isDeleted: false, isMerged: false }. Found: ${JSON.stringify(pfe)}`);
        }

        console.log(`[MIGRATION-004] ✅ Index created and verified:`, createdIndex);
        return {
            status: 'EXECUTED_AND_VERIFIED',
            createdIndex,
            allIndexes: postBuildIndexes.map(i => i.name),
            clusterInfo: { clusterId: clusterInfo.clusterId, clusterType: clusterInfo.clusterType }
        };
    }
}

// Standalone CLI execution
if (process.argv[1] && process.argv[1].endsWith('004-contact-phone-unique-index-migration.js')) {
    (async () => {
        try {
            const nodeEnv = process.env.NODE_ENV;
            if (!nodeEnv) {
                console.error("[MIGRATION-004] FATAL: NODE_ENV is missing. Migration must FAIL CLOSED.");
                process.exit(1);
            }

            const envFile = nodeEnv === 'staging' ? '.env.staging' : '.env';
            dotenv.config({ path: path.join(__dirname, '..', envFile) });

            const uri = process.env.MONGODB_URI;
            if (!uri) {
                console.error("[MIGRATION-004] FATAL: MONGODB_URI is missing in the loaded environment.");
                process.exit(1);
            }

            console.log(`[MIGRATION-004] Connecting to target cluster: ${sanitizeMongoUri(uri)}`);
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
            await runMigration();
            await mongoose.disconnect();
            process.exit(0);
        } catch (err) {
            console.error("[MIGRATION-004] Migration failed:", err.message);
            await mongoose.disconnect();
            process.exit(1);
        }
    })();
}
