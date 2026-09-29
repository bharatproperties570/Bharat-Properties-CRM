import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Journal Schema
const DealMigrationJournalSchema = new mongoose.Schema({
    migrationId: { type: String, required: true },
    dealId: { type: mongoose.Schema.Types.ObjectId, required: true },
    runId: { type: String, required: true },
    operatorId: { type: String, required: true },
    executionSource: { type: String, default: 'cli' },
    batchId: { type: String },

    originalProjectName: String,
    originalBlock: String,
    originalUnitNo: String,
    originalStage: String,
    originalIsActiveDeal: Boolean,

    newProjectName: String,
    newBlock: String,
    newUnitNo: String,
    newIsActiveDeal: Boolean,

    timestamp: { type: Date, default: Date.now },
    state: { type: String, enum: ['PENDING', 'APPLIED', 'FAILED', 'ROLLED_BACK'], default: 'PENDING' },
    error: { type: String }
});

// Idempotency constraint
DealMigrationJournalSchema.index({ migrationId: 1, dealId: 1 }, { unique: true });

const DealMigrationJournal = mongoose.models.DealMigrationJournal || mongoose.model('DealMigrationJournal', DealMigrationJournalSchema);

async function migrateDeals121(options = {}) {
    const operatorId = options.operatorId || 'SYSTEM';
    const migrationId = options.migrationId || 'GATE121_DEAL_SYNC';
    const runId = uuidv4();
    const batchId = uuidv4(); // for this execution run
    
    console.log(`Starting Migration: ${migrationId} | RunId: ${runId}`);
    
    // Ensure index is created before running (needed for idempotency)
    await DealMigrationJournal.syncIndexes();

    const Deal = mongoose.model('Deal');
    
    // Memory-safe cursor over entire collection sorted deterministically
    const cursor = Deal.find({}).lean().sort({ _id: 1 }).cursor();
    let processed = 0, applied = 0, skipped = 0, failed = 0;

    for await (const deal of cursor) {
        processed++;
        
        const oProj = deal.projectName;
        const oBlock = deal.block;
        const oUnitNo = deal.unitNo;
        const oStage = deal.stage;
        const oIsActive = deal.isActiveDeal; // physical value
        
        let cProj = oProj ? String(oProj).trim().toUpperCase() : null;
        let cBlock = oBlock ? String(oBlock).trim().toUpperCase() : null;
        let cUnitNo = oUnitNo ? String(oUnitNo).trim().toUpperCase() : null;
        if (cProj === '') cProj = null;
        if (cBlock === '') cBlock = null;
        if (cUnitNo === '') cUnitNo = null;
        
        const isActiveDeal = !['Cancelled', 'Closed Lost', 'Closed', 'Closed Won', 'Sold Out'].includes(oStage);
        
        const needsMutation = (oProj !== cProj || oBlock !== cBlock || oUnitNo !== cUnitNo || oIsActive !== isActiveDeal);

        if (!needsMutation) {
            skipped++;
            continue;
        }

        // --- PENDING RECOVERY / IDEMPOTENCY PREFLIGHT ---
        let existingJournal = await DealMigrationJournal.findOne({ migrationId, dealId: deal._id });
        if (existingJournal) {
            if (existingJournal.state === 'APPLIED') {
                skipped++; // Already handled
                continue;
            }
            if (existingJournal.state === 'PENDING') {
                // If it's pending, let's check if the mutation actually succeeded but journal crashed before marking APPLIED.
                // We re-evaluate if the deal currently matches new expectations.
                if (oProj === existingJournal.newProjectName && 
                    oBlock === existingJournal.newBlock && 
                    oUnitNo === existingJournal.newUnitNo && 
                    oIsActive === existingJournal.newIsActiveDeal) {
                    
                    // Already applied, just fix journal
                    await DealMigrationJournal.updateOne(
                        { _id: existingJournal._id },
                        { $set: { state: 'APPLIED', runId } } // Update runId to mark it was recovered this run
                    );
                    applied++;
                    continue;
                }
                // If it differs, we can safely overwrite the journal and retry if it still matches original state.
                if (oProj !== existingJournal.originalProjectName || 
                    oBlock !== existingJournal.originalBlock ||
                    oStage !== existingJournal.originalStage) {
                    // It mutated independently!
                    await DealMigrationJournal.updateOne(
                        { _id: existingJournal._id },
                        { $set: { state: 'FAILED', error: 'Deal mutated independently while PENDING.' } }
                    );
                    failed++;
                    continue;
                }
            }
        }

        // Prepare new journal if not existing
        if (!existingJournal) {
            try {
                const journalDoc = new DealMigrationJournal({
                    migrationId,
                    dealId: deal._id,
                    runId,
                    operatorId,
                    batchId,
                    originalProjectName: oProj,
                    originalBlock: oBlock,
                    originalUnitNo: oUnitNo,
                    originalStage: oStage,
                    originalIsActiveDeal: oIsActive,
                    newProjectName: cProj,
                    newBlock: cBlock,
                    newUnitNo: cUnitNo,
                    newIsActiveDeal: isActiveDeal,
                    state: 'PENDING'
                });
                await journalDoc.save();
                existingJournal = journalDoc;
            } catch (err) {
                if (err.code === 11000) {
                    // Race condition, skip and let next run resolve
                    skipped++;
                    continue;
                }
                console.error('Journal Create Error:', err);
                failed++;
                continue;
            }
        } else {
             // Update the pending journal with this runId
             await DealMigrationJournal.updateOne(
                { _id: existingJournal._id },
                { $set: { runId, batchId, state: 'PENDING' } }
             );
        }

        // --- ATOMIC MUTATION ---
        const session = await mongoose.connection.startSession();
        try {
            session.startTransaction();

            await Deal.updateOne(
                { _id: deal._id },
                { $set: { projectName: cProj, block: cBlock, unitNo: cUnitNo, isActiveDeal } },
                { session }
            );
            
            await DealMigrationJournal.updateOne(
                { _id: existingJournal._id },
                { $set: { state: 'APPLIED' } },
                { session }
            );

            await session.commitTransaction();
            applied++;
        } catch (err) {
            await session.abortTransaction();
            
            // Log failure outside transaction
            await DealMigrationJournal.updateOne(
                { _id: existingJournal._id },
                { $set: { state: 'FAILED', error: err.message } }
            );
            
            failed++;
        } finally {
            session.endSession();
        }
    }
    
    console.log(`Migration ${migrationId} Finished. Processed: ${processed}, Applied: ${applied}, Skipped: ${skipped}, Failed: ${failed}`);
    return { processed, applied, skipped, failed };
}

export { migrateDeals121, DealMigrationJournal };
