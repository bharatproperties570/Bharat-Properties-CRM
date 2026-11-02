import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Read-only phone duplicate detection on active contacts.
 *
 * Detects:
 * 1. Exact string duplicates across distinct contacts (blocking E11000 errors for index creation).
 * 2. Intra-contact duplicate numbers (same contact document containing duplicate entries; does NOT block MongoDB multikey index).
 * 3. Normalized phone variants (e.g. whitespace, formatting, or country-code variants that represent business duplicates but not exact string collisions).
 * 4. Active-intent contacts with missing or null isDeleted / isMerged lifecycle flags.
 *
 * @param {mongoose.Connection|mongoose.mongo.Db} targetDb
 * @returns {Promise<{
 *   totalActiveContacts: number,
 *   totalLifecycleFlagGaps: number,
 *   lifecycleFlagGaps: Array,
 *   exactDuplicateGroups: Array,
 *   crossContactDuplicates: Array,
 *   crossContactExactDuplicates: Array,
 *   intraContactDuplicates: Array,
 *   intraContactExactDuplicates: Array,
 *   normalizedPhoneDuplicates: Array,
 *   normalizedVariantsAcrossContacts: Array
 * }>}
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
    // MongoDB's partialFilterExpression { isDeleted: false, isMerged: false } strictly matches boolean false.
    // Documents missing either field are excluded from the index and will not be protected against duplicates.
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

    // Cross-contact exact duplicates: distinct contact IDs sharing the exact same string
    // These DIRECTLY cause MongoDB unique index build failure (E11000)
    const crossContactExactDuplicates = exactDuplicateGroups.filter(g => g.contactIds.length > 1);

    // Intra-contact duplicates: same contact document containing the same phone number multiple times
    // MongoDB multikey unique indexes permit identical array elements within the SAME document
    const intraContactExactDuplicates = exactDuplicateGroups.filter(g => g.contactIds.length === 1 && g.count > 1);

    // 4. Normalized Phone Business Duplicate Scan
    // Scans active contacts for phone numbers that normalize to the same digits (e.g. "+91 9811122233" vs "9811122233")
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

            // If raw numbers differ, it's a normalized variant (e.g. country-code or whitespace difference)
            // These will NOT cause E11000 during index build, but are business duplicates requiring manual review/merge
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
        duplicateGroups: exactDuplicateGroups, // Backwards compatibility alias
        crossContactDuplicates: crossContactExactDuplicates, // Backwards compatibility alias
        crossContactExactDuplicates,
        intraContactDuplicates: intraContactExactDuplicates, // Backwards compatibility alias
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
    const dbName = db?.databaseName || conn?.name;

    if (!dbName || typeof dbName !== 'string' || dbName.trim() === '') {
        throw new Error('[MIGRATION-004] FATAL: Database identity cannot be established. Migration must FAIL CLOSED.');
    }

    const collection = db.collection('contacts');

    console.log(`[MIGRATION-004] Mode: ${mode.toUpperCase()}`);
    console.log(`[MIGRATION-004] Target Database: ${dbName}`);

    // Production safety check: BOTH execute and rollback require dual approval flags in production
    if (dbName === 'bharatproperties1') {
        const prodFlag = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';
        const dbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION === 'true';
        if ((mode === 'execute' || mode === 'rollback') && (!prodFlag || !dbaFlag)) {
            const msg = `[MIGRATION-004] FATAL: Production ${mode.toUpperCase()} blocked. Requires explicit ALLOW_PRODUCTION_MIGRATION=true AND DBA_APPROVED_INDEX_MIGRATION=true. Aborting.`;
            console.error(msg);
            throw new Error(msg);
        }
    }

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

        // Verify existing legacy index is preserved
        const legacyIndexPreserved = postRollbackIndexes.some(i => i.name === 'phones.number_1');
        if (existingIndexNames.includes('phones.number_1') && !legacyIndexPreserved) {
            throw new Error(`[MIGRATION-004] Rollback verification failed: Legacy index phones.number_1 was unexpectedly dropped.`);
        }

        return {
            status: 'ROLLED_BACK',
            indexDropped: indexExists,
            currentIndexes: postRollbackIndexes.map(i => i.name)
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
            }
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

        // Verify post-build index status and exact specifications
        const postBuildIndexes = await collection.indexes();
        const createdIndex = postBuildIndexes.find(i => i.name === TARGET_INDEX_NAME);
        if (!createdIndex) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index ${TARGET_INDEX_NAME} was not found in collection.indexes().`);
        }

        // Verify exact key specification
        const keyMatches = createdIndex.key && createdIndex.key['phones.number'] === 1 && Object.keys(createdIndex.key).length === 1;
        if (!keyMatches) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index key does not match expected { 'phones.number': 1 }. Found: ${JSON.stringify(createdIndex.key)}`);
        }

        // Verify unique constraint flag
        if (createdIndex.unique !== true) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index is not unique. unique=${createdIndex.unique}`);
        }

        // Verify partialFilterExpression
        const pfe = createdIndex.partialFilterExpression;
        if (!pfe || pfe.isDeleted !== false || pfe.isMerged !== false) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: partialFilterExpression does not match expected { isDeleted: false, isMerged: false }. Found: ${JSON.stringify(pfe)}`);
        }

        console.log(`[MIGRATION-004] ✅ Index created and verified:`, createdIndex);
        return {
            status: 'EXECUTED_AND_VERIFIED',
            createdIndex,
            allIndexes: postBuildIndexes.map(i => i.name)
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
