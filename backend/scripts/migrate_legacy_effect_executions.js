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

    const args = process.argv.slice(2);
    const hasApply = args.includes('--apply');
    const hasDryRun = args.includes('--dry-run');
    const isApply = hasApply && !hasDryRun;

    console.log('[Migration] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[Migration] Connected to MongoDB');

    try {
        if (!isApply) {
            console.log('[Migration] 🛡️ DEFAULTING TO DRY-RUN MODE (Zero writes will be made). Pass --apply to persist changes.');
        } else {
            console.log('[Migration] ⚠️ RUNNING IN APPLY MODE: Executing writes to EffectExecution collection.');
        }

        const report = await backfillLegacyEffectExecutions({
            apply: isApply,
            dryRun: !isApply,
            logger: console
        });

        console.log('\n========================================');
        console.log(`[Migration] BACKFILL REPORT (${report.dryRun ? 'DRY-RUN' : 'APPLIED'})`);
        console.log('========================================');
        console.table({
            mode: report.dryRun ? 'DRY-RUN (No Writes)' : 'APPLIED (Writes Committed)',
            scanned: report.scanned,
            matchedTimeTrigger: report.matchedTimeTrigger,
            backfillable: report.backfillable,
            backfilled: report.backfilled,
            skippedAlreadyTagged: report.skippedAlreadyTagged,
            skippedNonTimeTrigger: report.skippedNonTimeTrigger,
            conflictsCount: report.conflicts.length,
            errorsCount: report.errors.length
        });

        if (report.conflicts.length > 0) {
            console.warn('\n⚠️ CONFLICTS DETECTED:');
            console.dir(report.conflicts, { depth: null });
        }

        if (report.errors.length > 0) {
            console.error('\n❌ ERRORS DETECTED:');
            console.dir(report.errors, { depth: null });
        }

        if (report.conflicts.length > 0 || report.errors.length > 0) {
            console.error('\n[Migration] ❌ Migration finished with unresolved conflicts or errors. Operator intervention required.');
            process.exitCode = 1;
        } else {
            console.log('\n[Migration] ✅ Migration completed safely with zero conflicts and zero errors.');
            process.exitCode = 0;
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
