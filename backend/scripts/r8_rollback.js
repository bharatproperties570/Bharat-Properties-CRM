import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const MIGRATION_ID = 'R8_NORMALIZE';

export async function runRollback() {
    console.log("Starting R8 Rollback...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    const db = mongoose.connection.db;
    const inventoryCol = db.collection('inventories');
    const journalCol = db.collection('inventory_migration_journal');
    const sysSettings = db.collection('system_settings');

    const lock = await sysSettings.findOne({ key: 'INVENTORY_WRITE_LOCK' });
    if (!lock || lock.value !== true) {
        throw new Error("ABORT: INVENTORY_WRITE_LOCK must be true before running rollback.");
    }

    const batchSize = 1000;
    let processed = 0;

    while (true) {
        // Find journal entries that are still in MIGRATED state
        const batch = await journalCol.find({ migrationId: MIGRATION_ID, state: 'MIGRATED' })
                                      .sort({ _id: 1 }).limit(batchSize).toArray();
        if (batch.length === 0) break;

        const session = mongoose.connection.startSession();
        try {
            session.startTransaction();

            const inventoryUpdates = [];
            const journalUpdates = [];

            for (const jDoc of batch) {
                // Fetch the actual current db record
                const dbDoc = await inventoryCol.findOne({ _id: jDoc.inventoryId }, { session });
                if (!dbDoc) continue; // Deleted? Or we can just restore fields anyway if it's soft deleted

                const updateSet = {};
                // Field-level safety rule
                if (dbDoc.block === jDoc.migratedBlock) {
                    updateSet.block = jDoc.originalBlock;
                }
                if (dbDoc.unitNo === jDoc.migratedUnitNo) {
                    updateSet.unitNo = jDoc.originalUnitNo;
                }

                if (Object.keys(updateSet).length > 0) {
                    inventoryUpdates.push({
                        updateOne: {
                            filter: { _id: dbDoc._id },
                            update: { $set: updateSet }
                        }
                    });
                }

                // Update journal state
                journalUpdates.push({
                    updateOne: {
                        filter: { _id: jDoc._id },
                        update: { $set: { state: 'ROLLED_BACK', rolledBackAt: new Date() } }
                    }
                });
            }

            if (inventoryUpdates.length > 0) {
                await inventoryCol.bulkWrite(inventoryUpdates, { session, ordered: false });
            }
            if (journalUpdates.length > 0) {
                await journalCol.bulkWrite(journalUpdates, { session, ordered: false });
            }

            await session.commitTransaction();
            processed += batch.length;
            console.log(`Rolled back batch of ${batch.length}`);
        } catch (err) {
            await session.abortTransaction();
            console.error("Batch rollback failed, transaction aborted:", err.message);
            throw err;
        } finally {
            session.endSession();
        }
    }

    console.log(`Rollback Complete. Total processed: ${processed}`);
    process.exit(0);
}
if (process.argv[1].includes('r8_rollback.js')) runRollback();
