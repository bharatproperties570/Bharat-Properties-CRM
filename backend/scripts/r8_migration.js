import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const MIGRATION_ID = 'R8_NORMALIZE';

export async function runMigration() {
    console.log("Starting R8 Migration...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    const db = mongoose.connection.db;
    const inventoryCol = db.collection('inventories');
    const journalCol = db.collection('inventory_migration_journal');
    const sysSettings = db.collection('system_settings');

    const lock = await sysSettings.findOne({ key: 'INVENTORY_WRITE_LOCK' });
    if (!lock || lock.value !== true) {
        throw new Error("ABORT: INVENTORY_WRITE_LOCK must be true before running migration.");
    }

    const batchSize = 1000;
    let processed = 0;
    let batchId = 1;

    while (true) {
        const query = {
            projectId: { $ne: null },
            $expr: {
                $or: [
                    { $ne: ["$block", { $toUpper: { $trim: { input: { $toString: { $ifNull: ["$block", ""] } } } } }] },
                    { $ne: ["$unitNo", { $toUpper: { $trim: { input: { $toString: { $ifNull: ["$unitNo", ""] } } } } }] }
                ]
            }
        };

        const batch = await inventoryCol.find(query).sort({ _id: 1 }).limit(batchSize).toArray();
        if (batch.length === 0) break;

        const session = mongoose.connection.startSession();
        try {
            session.startTransaction();

            const inventoryUpdates = [];
            const journalInserts = [];

            for (const doc of batch) {
                const cleanBlock = doc.block ? String(doc.block).trim().toUpperCase() : doc.block;
                const cleanUnit = doc.unitNo ? String(doc.unitNo).trim().toUpperCase() : doc.unitNo;

                inventoryUpdates.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: { block: cleanBlock, unitNo: cleanUnit } }
                    }
                });

                journalInserts.push({
                    insertOne: {
                        document: {
                            inventoryId: doc._id,
                            migrationId: MIGRATION_ID,
                            originalBlock: doc.block,
                            originalUnitNo: doc.unitNo,
                            migratedBlock: cleanBlock,
                            migratedUnitNo: cleanUnit,
                            operatorId: 'system',
                            batchId: batchId,
                            timestamp: new Date(),
                            state: 'MIGRATED'
                        }
                    }
                });
            }

            await inventoryCol.bulkWrite(inventoryUpdates, { session, ordered: false });
            await journalCol.bulkWrite(journalInserts, { session, ordered: false });

            await session.commitTransaction();
            processed += batch.length;
            batchId++;
            console.log(`Committed batch ${batchId-1}: ${batch.length} docs`);
        } catch (err) {
            await session.abortTransaction();
            console.error("Batch failed, transaction aborted:", err.message);
            throw err;
        } finally {
            session.endSession();
        }
    }

    console.log(`Migration Complete. Total processed: ${processed}`);
    process.exit(0);
}
if (process.argv[1].includes('r8_migration.js')) runMigration();
