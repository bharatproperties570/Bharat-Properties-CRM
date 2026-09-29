import mongoose from 'mongoose';
import { DealMigrationJournal } from './migrate_deals_121.js';

async function rollbackDeals121(options = {}) {
    const migrationId = options.migrationId || 'GATE121_DEAL_SYNC';
    const Deal = mongoose.model('Deal');
    
    console.log(`Starting Rollback for Migration: ${migrationId}`);
    
    const cursor = DealMigrationJournal.find({ migrationId, state: 'APPLIED' }).sort({ _id: 1 }).cursor();
    
    let processed = 0, restored = 0, conflicts = 0, failed = 0;

    for await (const journal of cursor) {
        processed++;
        
        // Fetch raw to avoid default hydration conflicts
        const deal = await mongoose.connection.collection('deals').findOne({ _id: journal.dealId });
        if (!deal) {
            console.warn(`Deal not found for rollback: ${journal.dealId}`);
            failed++;
            continue;
        }

        if (
            deal.projectName !== journal.newProjectName ||
            deal.block !== journal.newBlock ||
            deal.unitNo !== journal.newUnitNo ||
            deal.isActiveDeal !== journal.newIsActiveDeal
        ) {
            await DealMigrationJournal.updateOne(
                { _id: journal._id },
                { $set: { error: 'Rollback conflict: Deal was mutated post-migration' } }
            );
            conflicts++;
            continue;
        }

        const session = await mongoose.connection.startSession();
        try {
            session.startTransaction();

            const updatePayload = {
                projectName: journal.originalProjectName,
                block: journal.originalBlock,
                unitNo: journal.originalUnitNo
            };

            if (journal.originalIsActiveDeal !== undefined && journal.originalIsActiveDeal !== null) {
                updatePayload.isActiveDeal = journal.originalIsActiveDeal;
            }

            const updateOp = { $set: updatePayload };

            if (journal.originalIsActiveDeal === undefined || journal.originalIsActiveDeal === null) {
                updateOp.$unset = { isActiveDeal: 1 };
            }

            // RAW DB UPDATE TO BYPASS MONGOOSE HOOKS WHICH WOULD RE-CANONICALIZE
            await mongoose.connection.collection('deals').updateOne(
                { _id: deal._id },
                updateOp,
                { session }
            );
            
            await DealMigrationJournal.updateOne(
                { _id: journal._id },
                { $set: { state: 'ROLLED_BACK' } },
                { session }
            );

            await session.commitTransaction();
            restored++;
        } catch (err) {
            await session.abortTransaction();
            console.error(`Rollback Transaction Error [Deal: ${deal._id}]:`, err);
            
            await DealMigrationJournal.updateOne(
                { _id: journal._id },
                { $set: { error: `Rollback transaction failed: ${err.message}` } }
            );
            
            failed++;
        } finally {
            session.endSession();
        }
    }
    
    const alreadyRolledBack = await DealMigrationJournal.countDocuments({ migrationId, state: 'ROLLED_BACK' });
    const totalRecords = await DealMigrationJournal.countDocuments({ migrationId });

    console.log(`\n=== ROLLBACK SUMMARY ===`);
    console.log(`Migration ID: ${migrationId}`);
    console.log(`Total Journal Records: ${totalRecords}`);
    console.log(`Already Rolled Back (Total): ${alreadyRolledBack}`);
    console.log(`Processed (Eligible APPLIED): ${processed}`);
    console.log(`Restored Successfully: ${restored}`);
    console.log(`Skipped due to Conflicts: ${conflicts}`);
    console.log(`Failed internally: ${failed}`);
    console.log(`========================\n`);

    return { processed, restored, conflicts, failed, totalRecords, alreadyRolledBack };
}

export { rollbackDeals121 };
