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
 * Read-only phone duplicate detection on active contacts.
 * Active contacts: isDeleted: false, isMerged: false, phones.number is a non-empty string.
 *
 * @param {mongoose.Connection|mongoose.mongo.Db} targetDb
 * @returns {Promise<{
 *   totalActiveContacts: number,
 *   duplicateGroups: Array,
 *   crossContactDuplicates: Array,
 *   intraContactDuplicates: Array
 * }>}
 */
export async function detectActivePhoneDuplicates(targetDb) {
    const db = targetDb.db || targetDb;
    const collection = db.collection('contacts');

    const totalActiveContacts = await collection.countDocuments({
        isDeleted: { $ne: true },
        isMerged: { $ne: true }
    });

    const pipeline = [
        {
            $match: {
                isDeleted: { $ne: true },
                isMerged: { $ne: true },
                'phones.number': { $type: 'string', $nin: ['', null] }
            }
        },
        { $unwind: '$phones' },
        {
            $project: {
                contactId: '$_id',
                name: '$name',
                rawNumber: '$phones.number',
                cleanNumber: { $trim: { input: '$phones.number' } }
            }
        },
        {
            $match: {
                cleanNumber: { $nin: ['', null] }
            }
        },
        {
            $group: {
                _id: '$cleanNumber',
                count: { $sum: 1 },
                contacts: {
                    $addToSet: {
                        contactId: '$contactId',
                        name: '$name',
                        rawNumber: '$rawNumber'
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

    const duplicateGroups = await collection.aggregate(pipeline).toArray();

    // Cross-contact duplicates: distinct contact IDs sharing the exact same phone number
    const crossContactDuplicates = duplicateGroups.filter(g => g.contacts.length > 1);

    // Intra-contact duplicates: single contact containing the same phone number multiple times
    const intraContactDuplicates = duplicateGroups.filter(g => g.contacts.length === 1 && g.count > 1);

    return {
        totalActiveContacts,
        duplicateGroups,
        crossContactDuplicates,
        intraContactDuplicates
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
    const mode = opts.mode || (process.argv.includes('--execute') ? 'execute' : (process.argv.includes('--rollback') ? 'rollback' : 'dry-run'));
    const conn = opts.connection || mongoose.connection;
    const db = conn.db || conn;
    const dbName = db.databaseName || conn.name;
    const collection = db.collection('contacts');

    console.log(`[MIGRATION-004] Mode: ${mode.toUpperCase()}`);
    console.log(`[MIGRATION-004] Target Database: ${dbName}`);

    // Production safety check
    if (dbName === 'bharatproperties1') {
        const prodFlag = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';
        const dbaFlag = process.env.DBA_APPROVED_INDEX_MIGRATION === 'true';
        if (mode === 'execute' && (!prodFlag || !dbaFlag)) {
            const msg = `[MIGRATION-004] FATAL: Production index creation blocked. Requires explicit ALLOW_PRODUCTION_MIGRATION=true AND DBA_APPROVED_INDEX_MIGRATION=true. Aborting.`;
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
        duplicateGroupsFound: scanResult.duplicateGroups.length,
        crossContactDuplicateGroups: scanResult.crossContactDuplicates.length,
        intraContactDuplicateGroups: scanResult.intraContactDuplicates.length
    });

    if (scanResult.crossContactDuplicates.length > 0) {
        console.warn(`[MIGRATION-004] ⚠️ Duplicate phone numbers detected across active contacts:`);
        scanResult.crossContactDuplicates.slice(0, 10).forEach(g => {
            console.warn(`  - Phone: "${g._id}" | Active Contacts: ${g.contacts.map(c => `${c.contactId} (${c.name})`).join(', ')}`);
        });
        if (scanResult.crossContactDuplicates.length > 10) {
            console.warn(`  ... and ${scanResult.crossContactDuplicates.length - 10} more duplicate groups.`);
        }
    }

    if (mode === 'dry-run') {
        const buildFeasible = scanResult.crossContactDuplicates.length === 0;
        console.log(`[MIGRATION-004] [DRY RUN] Target Index Definition:`, {
            spec: TARGET_INDEX_SPEC,
            options: TARGET_INDEX_OPTIONS
        });
        console.log(`[MIGRATION-004] [DRY RUN] Build Feasible without E11000 collision: ${buildFeasible}`);
        console.log(`[MIGRATION-004] [DRY RUN] Legacy non-unique index 'phones.number_1' will be PRESERVED.`);
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
        if (scanResult.crossContactDuplicates.length > 0) {
            const err = new Error(`[MIGRATION-004] Preflight check failed: ${scanResult.crossContactDuplicates.length} active cross-contact duplicate phone groups exist. Unique index build would fail with E11000. Resolve duplicates via Contact Merge before running migration.`);
            console.error(err.message);
            throw err;
        }

        console.log(`[MIGRATION-004] Preflight passed with 0 cross-contact duplicates. Creating index ${TARGET_INDEX_NAME}...`);
        await collection.createIndex(TARGET_INDEX_SPEC, TARGET_INDEX_OPTIONS);

        // Verify post-build index status
        const postBuildIndexes = await collection.indexes();
        const createdIndex = postBuildIndexes.find(i => i.name === TARGET_INDEX_NAME);
        if (!createdIndex) {
            throw new Error(`[MIGRATION-004] Post-build verification failed: Index ${TARGET_INDEX_NAME} was not found in collection.indexes().`);
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
