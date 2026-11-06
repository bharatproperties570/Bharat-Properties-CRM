import mongoose from 'mongoose';

/**
 * Backfill existing eligible TimeTrigger EffectExecution records without stableKey
 * by deriving the stable identity from their associated OutboxEvent:
 * `time-trigger:${automationLogIdempotencyKey}:${actionId}`
 *
 * Requirements:
 * 1. Safe backward-compatible rollout
 * 2. Idempotent and restart-safe
 * 3. Never overwrite existing conflicting stableKey
 * 4. Detect and report conflicting records
 * 5. Preserve completed, failed, processing and ambiguous states correctly
 * 6. Safe with partial unique index on stableKey
 */
export const backfillLegacyEffectExecutions = async (options = {}) => {
    const logger = options.logger || console;
    const batchSize = options.batchSize || 100;

    const EffectExecution = mongoose.models.EffectExecution || (await import('../../models/EffectExecution.js')).default;
    const OutboxEvent = mongoose.models.OutboxEvent || (await import('../../models/OutboxEvent.js')).default;

    const report = {
        scanned: 0,
        matchedTimeTrigger: 0,
        backfilled: 0,
        skippedAlreadyTagged: 0,
        skippedNonTimeTrigger: 0,
        conflicts: [],
        errors: []
    };

    // Query all EffectExecution records where stableKey is null or missing
    const cursor = EffectExecution.find({
        $or: [
            { stableKey: null },
            { stableKey: { $exists: false } }
        ]
    }).cursor({ batchSize });

    for await (const record of cursor) {
        report.scanned++;

        if (!record.effectKey || !record.effectKey.startsWith('action-')) {
            report.skippedNonTimeTrigger++;
            continue;
        }

        const actionId = record.effectKey.replace(/^action-/, '');
        if (!actionId) {
            report.skippedNonTimeTrigger++;
            continue;
        }

        try {
            // Find corresponding OutboxEvent by eventId
            const outbox = await OutboxEvent.findOne({ eventId: record.eventId }).lean();
            if (!outbox || outbox.eventType !== 'TimeTriggerExecutionRequested') {
                report.skippedNonTimeTrigger++;
                continue;
            }

            const idempotencyKey = outbox.payload?.automationLogIdempotencyKey;
            if (!idempotencyKey) {
                report.skippedNonTimeTrigger++;
                continue;
            }

            report.matchedTimeTrigger++;
            const derivedStableKey = `time-trigger:${idempotencyKey}:${actionId}`;

            // Check if another EffectExecution document already possesses this derivedStableKey
            const existingWithKey = await EffectExecution.findOne({ stableKey: derivedStableKey }).lean();
            if (existingWithKey) {
                if (existingWithKey._id.toString() === record._id.toString()) {
                    report.skippedAlreadyTagged++;
                    continue;
                }

                // Conflict: Do not overwrite an existing conflicting stableKey!
                report.conflicts.push({
                    legacyId: record._id.toString(),
                    conflictingId: existingWithKey._id.toString(),
                    eventId: record.eventId,
                    effectKey: record.effectKey,
                    derivedStableKey,
                    legacyStatus: record.status,
                    conflictingStatus: existingWithKey.status,
                    reason: 'Derived stableKey already claimed by another EffectExecution document'
                });
                logger.warn(`[EffectMigration] Conflict detected for legacy record ${record._id}: stableKey ${derivedStableKey} already held by ${existingWithKey._id}`);
                continue;
            }

            // Atomic update: only update if stableKey is still unset/null
            // Status (COMPLETED, FAILED, PROCESSING, AMBIGUOUS) is strictly preserved!
            const updateResult = await EffectExecution.updateOne(
                {
                    _id: record._id,
                    $or: [
                        { stableKey: null },
                        { stableKey: { $exists: false } }
                    ]
                },
                {
                    $set: { stableKey: derivedStableKey }
                }
            );

            if (updateResult.modifiedCount > 0) {
                report.backfilled++;
            } else {
                report.skippedAlreadyTagged++;
            }
        } catch (err) {
            report.errors.push({
                id: record._id.toString(),
                error: err.message
            });
            logger.error(`[EffectMigration] Error backfilling record ${record._id}:`, err.message);
        }
    }

    return report;
};
