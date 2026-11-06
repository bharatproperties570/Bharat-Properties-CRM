import mongoose from 'mongoose';

/**
 * Verifies that the partial unique index on stableKey exists in EffectExecution collection
 * matching the complete index contract:
 * - Key exactly { stableKey: 1 }
 * - unique === true
 * - partialFilterExpression correctly restricts indexed documents to string stableKeys
 * - Rejects normal non-partial unique indexes
 * - Rejects missing, malformed or incompatible index definitions
 * - Does NOT create or alter production indexes automatically
 */
export const verifyEffectExecutionStableKeyIndex = async (EffectExecution) => {
    try {
        const indexes = await EffectExecution.collection.indexes();
        if (!Array.isArray(indexes)) {
            return { valid: false, reason: 'Unable to retrieve indexes list from collection' };
        }

        const matchingIndexes = indexes.filter(idx => idx.key && idx.key.stableKey !== undefined);
        if (matchingIndexes.length === 0) {
            return { valid: false, reason: 'Index on stableKey does not exist' };
        }

        for (const idx of matchingIndexes) {
            const keys = Object.keys(idx.key);
            // Key must be exactly { stableKey: 1 }
            if (keys.length !== 1 || idx.key.stableKey !== 1) {
                continue;
            }

            // Must be unique
            if (idx.unique !== true) {
                return { valid: false, reason: 'Index on { stableKey: 1 } exists but is not unique' };
            }

            // Must be a partial index (reject normal non-partial unique index)
            if (!idx.partialFilterExpression || typeof idx.partialFilterExpression !== 'object') {
                return { valid: false, reason: 'Index on { stableKey: 1 } is not a partial index (missing partialFilterExpression)' };
            }

            // partialFilterExpression must correctly restrict indexed documents to string stableKeys
            const pfe = idx.partialFilterExpression;
            if (!pfe.stableKey || typeof pfe.stableKey !== 'object') {
                return { valid: false, reason: 'Index on { stableKey: 1 } has malformed partialFilterExpression' };
            }

            const typeVal = pfe.stableKey.$type;
            if (typeVal !== 'string' && typeVal !== 2) {
                return { valid: false, reason: `Index on { stableKey: 1 } partialFilterExpression must restrict stableKey to string type (got: ${JSON.stringify(typeVal)})` };
            }

            // Exact partial unique index contract verified
            return { valid: true };
        }

        return { valid: false, reason: 'No index matching exact contract { stableKey: 1 } with unique: true and partialFilterExpression string restriction' };
    } catch (err) {
        return { valid: false, reason: err.message };
    }
};

/**
 * Backfill existing eligible TimeTrigger EffectExecution records without stableKey
 * by deriving the stable identity from their associated OutboxEvent:
 * `time-trigger:${automationLogIdempotencyKey}:${actionId}`
 *
 * Operational and Safety Requirements:
 * 1. Default to --dry-run (zero writes). Only write when options.apply === true.
 * 2. Return complete operator report: scanned, matched, backfillable, backfilled, skipped, conflicts, errors.
 * 3. Fail-closed on multiple legacy records: never arbitrarily pick one! Group by derived stableKey;
 *    if multiple match, fail closed with AMBIGUOUS_MULTIPLE_LEGACY_RECORDS.
 * 4. Verify unique partial index on stableKey before enabling migration.
 * 5. Catch duplicate key errors gracefully during concurrent backfills.
 * 6. Strictly preserve execution statuses: COMPLETED, FAILED, PROCESSING, AMBIGUOUS.
 */
export const backfillLegacyEffectExecutions = async (options = {}) => {
    const logger = options.logger || console;
    const batchSize = options.batchSize || 100;
    const isDryRun = options.dryRun ?? (options.apply !== true);

    const EffectExecution = mongoose.models.EffectExecution || (await import('../../models/EffectExecution.js')).default;
    const OutboxEvent = mongoose.models.OutboxEvent || (await import('../../models/OutboxEvent.js')).default;

    const report = {
        dryRun: isDryRun,
        scanned: 0,
        matchedTimeTrigger: 0,
        backfillable: 0,
        backfilled: 0,
        skippedAlreadyTagged: 0,
        skippedNonTimeTrigger: 0,
        conflicts: [],
        errors: []
    };

    // 1. Verify partial unique index on stableKey
    if (!options.skipIndexCheck) {
        const indexCheck = await verifyEffectExecutionStableKeyIndex(EffectExecution);
        if (!indexCheck.valid) {
            const errMsg = `Pre-migration index check failed: ${indexCheck.reason}. Run ensureIndexes first.`;
            report.errors.push(errMsg);
            logger.error(`[EffectMigration] ❌ ${errMsg}`);
            return report;
        }
    }

    if (isDryRun) {
        logger.log('[EffectMigration] 🔍 Running in DRY-RUN mode. No writes will be committed.');
    } else {
        logger.log('[EffectMigration] 🚀 Running in APPLY mode. Changes will be persisted.');
    }

    // 2. Scan legacy records without stableKey
    const cursor = EffectExecution.find({
        $or: [
            { stableKey: null },
            { stableKey: { $exists: false } }
        ]
    }).cursor({ batchSize });

    // Map: derivedStableKey -> Array of legacy records
    const candidatesByKey = new Map();

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

            if (!candidatesByKey.has(derivedStableKey)) {
                candidatesByKey.set(derivedStableKey, []);
            }
            candidatesByKey.get(derivedStableKey).push(record);
        } catch (err) {
            report.errors.push({
                id: record._id.toString(),
                error: err.message
            });
            logger.error(`[EffectMigration] Error scanning record ${record._id}:`, err.message);
        }
    }

    // 3. Process candidate mappings with fail-closed ambiguity and conflict checks
    for (const [derivedStableKey, records] of candidatesByKey.entries()) {
        // Fail closed: If multiple legacy records map to the identical derivedStableKey,
        // DO NOT arbitrarily select one. Fail closed and report conflict!
        if (records.length > 1) {
            logger.warn(`[EffectMigration] ⚠️ Ambiguity conflict: ${records.length} legacy records map to same stableKey: ${derivedStableKey}`);
            for (const rec of records) {
                report.conflicts.push({
                    legacyId: rec._id.toString(),
                    eventId: rec.eventId,
                    effectKey: rec.effectKey,
                    derivedStableKey,
                    legacyStatus: rec.status,
                    reason: 'AMBIGUOUS_MULTIPLE_LEGACY_RECORDS'
                });
            }
            continue;
        }

        const record = records[0];

        try {
            // Check if another EffectExecution document already possesses this derivedStableKey
            const existingWithKey = await EffectExecution.findOne({ stableKey: derivedStableKey }).lean();
            if (existingWithKey) {
                if (existingWithKey._id.toString() === record._id.toString()) {
                    report.skippedAlreadyTagged++;
                    continue;
                }

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

            report.backfillable++;

            if (!isDryRun) {
                // Atomic update: only update if stableKey is still unset/null
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
            }
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate key error: another worker or process set this stableKey concurrently
                report.conflicts.push({
                    legacyId: record._id.toString(),
                    derivedStableKey,
                    reason: 'CONCURRENT_DUPLICATE_KEY_E11000'
                });
            } else {
                report.errors.push({
                    id: record._id.toString(),
                    error: err.message
                });
                logger.error(`[EffectMigration] Error updating record ${record._id}:`, err.message);
            }
        }
    }

    return report;
};
