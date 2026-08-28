import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const PROD_FLAG = process.env.ALLOW_PRODUCTION_MIGRATION === 'true';

const TIER_1_MODELS = ['contacts', 'leads', 'inventories', 'deals', 'bookings', 'projects', 'users', 'teams'];
const TIER_2_MODELS = ['conversations', 'leadforms', 'feedbackforms', 'dynamicforms'];
const MIGRATION_ID = "MIG_P4.4_001";

async function runMigration() {
    console.log(`[MIGRATION] Starting: 002-soft-delete-ownership-backfill`);
    console.log(`[MIGRATION] Dry Run Mode: ${DRY_RUN}`);

    const conn = await mongoose.connect(process.env.MONGODB_URI);
    const dbName = conn.connection.name;
    const db = conn.connection.db;
    
    console.log(`[MIGRATION] Target Database: ${dbName}`);

    if (dbName === 'bharatproperties1' && !PROD_FLAG) {
        console.error(`[MIGRATION] FATAL: Production migration requires ALLOW_PRODUCTION_MIGRATION=true`);
        process.exit(1);
    }

    const allTargetCollections = [...TIER_1_MODELS, ...TIER_2_MODELS];
    const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

    for (const colName of allTargetCollections) {
        if (!existingCollections.includes(colName)) continue;
        console.log(`\n--- Evaluating Collection: ${colName} ---`);
        const collection = db.collection(colName);
        
        // 1. Soft Delete Backfill (Idempotent)
        const total = await collection.countDocuments();
        const missingSoftDelete = await collection.countDocuments({ isDeleted: { $exists: false } });
        
        console.log(`Total Docs: ${total} | Missing isDeleted: ${missingSoftDelete}`);

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

        // 2. Ownership Backfill (Only Tier 1 & Safe logic)
        if (TIER_1_MODELS.includes(colName)) {
            // Find docs missing ownerId but having legacy owner/assignedTo
            let ownershipFilter = { ownerId: { $exists: false } };
            
            // Exclude deals with conflicts
            if (colName === 'deals') {
                ownershipFilter = {
                    ...ownershipFilter,
                    $or: [
                        { owner: { $exists: false } },
                        { assignedTo: { $exists: false } },
                        { $expr: { $eq: ["$owner", "$assignedTo"] } }
                    ]
                };
                
                const conflicts = await collection.countDocuments({
                    owner: { $exists: true, $ne: null },
                    assignedTo: { $exists: true, $ne: null },
                    $expr: { $ne: ["$owner", "$assignedTo"] }
                });
                console.log(`[WARNING] Skipping ${conflicts} Deal records due to owner != assignedTo conflict.`);
            }

            const docsNeedingOwnership = await collection.countDocuments(ownershipFilter);
            
            // To be genuinely safe, we only backfill where deterministic:
            // Since this is Phase 4.4, we add ownerId ONLY if we can determine it from a single source.
            // For now, mapping ownerId -> owner || assignedTo
            const deterministicFilter = {
                ...ownershipFilter,
                $or: [
                    { owner: { $exists: true, $ne: null } },
                    { assignedTo: { $exists: true, $ne: null } }
                ]
            };
            
            const docsToMigrate = await collection.countDocuments(deterministicFilter);
            console.log(`Ownership Review - Missing ownerId: ${docsNeedingOwnership} | Deterministic matches: ${docsToMigrate}`);

            if (docsToMigrate > 0) {
                if (DRY_RUN) {
                    console.log(`[DRY-RUN] Would backfill ownerId for ${docsToMigrate} documents.`);
                } else {
                    console.log(`[EXECUTION] Building ownership bulk operations...`);
                    // Cursor batching
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

runMigration().catch(console.error);
