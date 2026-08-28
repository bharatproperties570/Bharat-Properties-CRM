import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// STRICT ENVIRONMENT LOADING
const nodeEnv = process.env.NODE_ENV;
if (!nodeEnv) {
    console.error("[MIGRATION] FATAL: NODE_ENV is missing. Migration must FAIL CLOSED.");
    process.exit(1);
}

let envFile = '.env';
if (nodeEnv === 'staging') {
    envFile = '.env.staging';
} else if (nodeEnv === 'production') {
    envFile = '.env';
} else {
    console.error(`[MIGRATION] FATAL: Unrecognized NODE_ENV=${nodeEnv}. Aborting.`);
    process.exit(1);
}

dotenv.config({ path: path.join(__dirname, '..', envFile) });

const DRY_RUN = process.argv.includes('--dry-run');
const PROD_FLAG = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';

const TIER_1_MODELS = ['contacts', 'leads', 'inventories', 'deals', 'bookings', 'projects', 'users', 'teams'];
const TIER_2_MODELS = ['conversations', 'leadforms', 'feedbackforms', 'dynamicforms'];
const MIGRATION_ID = "MIG_P4.4_001";

async function runMigration() {
    console.log(`[MIGRATION] Starting: 002-soft-delete-ownership-backfill`);
    console.log(`[MIGRATION] Environment: ${nodeEnv}`);
    console.log(`[MIGRATION] Dry Run Mode: ${DRY_RUN}`);

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("[MIGRATION] FATAL: MONGODB_URI is missing in the loaded environment.");
        process.exit(1);
    }

    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const dbName = conn.connection.name;
    const db = conn.connection.db;
    
    console.log(`[MIGRATION] Target Database: ${dbName}`);

    if (dbName === 'bharatproperties1') {
        if (nodeEnv !== 'production') {
            console.error(`[MIGRATION] FATAL: Connected to Production DB but NODE_ENV=${nodeEnv}. ABORTING to prevent accidental prod modification.`);
            process.exit(1);
        }
        if (!PROD_FLAG) {
            console.error(`[MIGRATION] FATAL: Attempting to run against Production without ALLOW_PRODUCTION_MIGRATION=true. Aborting.`);
            process.exit(1);
        }
    } else if (nodeEnv === 'staging' && dbName !== 'bharat-properties-staging') {
        console.error(`[MIGRATION] FATAL: Expected staging database but connected to ${dbName}. ABORTING.`);
        process.exit(1);
    }

    const allTargetCollections = [...TIER_1_MODELS, ...TIER_2_MODELS];
    const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

    for (const colName of allTargetCollections) {
        if (!existingCollections.includes(colName)) continue;
        console.log(`\n--- Evaluating Collection: ${colName} ---`);
        const collection = db.collection(colName);
        
        // 1. Soft Delete Backfill
        const missingSoftDelete = await collection.countDocuments({ isDeleted: { $exists: false } });
        if (missingSoftDelete > 0) {
            if (DRY_RUN) {
                console.log(`[DRY-RUN] Would backfill isDeleted=false for ${missingSoftDelete} documents.`);
            } else {
                console.log(`[EXECUTION] Executing Soft-Delete backfill...`);
                const res = await collection.updateMany(
                    { isDeleted: { $exists: false } },
                    { $set: { isDeleted: false, _migrationRef: MIGRATION_ID } }
                );
                console.log(`[EXECUTION] Modified ${res.modifiedCount} documents.`);
            }
        }

        // 2. Ownership Backfill
        if (TIER_1_MODELS.includes(colName)) {
            const deterministicFilter = {
                $and: [
                    { ownerId: { $exists: false } },
                    {
                        $or: [
                            { owner: { $exists: true, $ne: null } },
                            { assignedTo: { $exists: true, $ne: null } }
                        ]
                    }
                ]
            };
            
            if (colName === 'deals') {
                deterministicFilter.$and.push({
                    $or: [
                        { owner: { $exists: false } },
                        { owner: null },
                        { assignedTo: { $exists: false } },
                        { assignedTo: null },
                        { $expr: { $eq: ["$owner", "$assignedTo"] } }
                    ]
                });
            }
            
            const docsToMigrate = await collection.countDocuments(deterministicFilter);

            if (docsToMigrate > 0) {
                if (DRY_RUN) {
                    console.log(`[DRY-RUN] Would backfill ownerId for ${docsToMigrate} documents.`);
                } else {
                    console.log(`[EXECUTION] Building ownership bulk operations...`);
                    const cursor = collection.find(deterministicFilter).batchSize(500);
                    let bulkOps = [];
                    let processed = 0;
                    
                    while (await cursor.hasNext()) {
                        const doc = await cursor.next();
                        const canonicalOwner = doc.owner || doc.assignedTo;
                        
                        bulkOps.push({
                            updateOne: {
                                filter: { _id: doc._id },
                                update: { 
                                    $set: { 
                                        ownerId: canonicalOwner,
                                        _ownershipMigrationRef: MIGRATION_ID 
                                    } 
                                }
                            }
                        });

                        if (bulkOps.length >= 500) {
                            await collection.bulkWrite(bulkOps, { ordered: false });
                            processed += bulkOps.length;
                            bulkOps = [];
                        }
                    }
                    if (bulkOps.length > 0) {
                        await collection.bulkWrite(bulkOps, { ordered: false });
                        processed += bulkOps.length;
                    }
                    console.log(`[EXECUTION] Modified ${processed} documents with ownerId.`);
                }
            }
        }
    }

    console.log(`\n[MIGRATION] Script complete.`);
    process.exit(0);
}

runMigration().catch(err => {
    console.error("[MIGRATION] CRITICAL FAILURE:", err.message);
    process.exit(1);
});
