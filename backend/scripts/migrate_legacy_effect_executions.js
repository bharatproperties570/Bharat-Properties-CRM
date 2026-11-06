import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { backfillLegacyEffectExecutions } from '../src/migrations/backfillLegacyEffectExecutions.js';

dotenv.config();

export async function runMigration() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('Error: MONGODB_URI environment variable is required');
        process.exit(1);
    }

    console.log('[Migration] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[Migration] Connected to MongoDB');

    try {
        console.log('[Migration] Starting backfill of legacy EffectExecution stableKeys...');
        const report = await backfillLegacyEffectExecutions({ logger: console });
        console.log('[Migration] Backfill completed successfully. Report:');
        console.table({
            scanned: report.scanned,
            matchedTimeTrigger: report.matchedTimeTrigger,
            backfilled: report.backfilled,
            skippedAlreadyTagged: report.skippedAlreadyTagged,
            skippedNonTimeTrigger: report.skippedNonTimeTrigger,
            conflictsCount: report.conflicts.length,
            errorsCount: report.errors.length
        });

        if (report.conflicts.length > 0) {
            console.warn('[Migration] ⚠️ Conflicts detected during backfill:');
            console.dir(report.conflicts, { depth: null });
        }

        if (report.errors.length > 0) {
            console.error('[Migration] ❌ Errors encountered during backfill:');
            console.dir(report.errors, { depth: null });
        }

        return report;
    } finally {
        await mongoose.disconnect();
        console.log('[Migration] Disconnected from MongoDB');
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    runMigration().catch((err) => {
        console.error('[Migration] Fatal error:', err);
        process.exit(1);
    });
}
