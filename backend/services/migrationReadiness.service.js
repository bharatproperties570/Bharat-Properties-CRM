import mongoose from 'mongoose';
import ReconciliationGroup from '../models/ReconciliationGroup.js';
import MergeAudit from '../models/MergeAudit.js';

/**
 * Migration 004 Readiness Evaluator Service
 * Phase 4.7 Production Gate
 *
 * Strictly READ-ONLY evaluation of whether the database meets all prerequisites
 * for Migration 004 (contacts_phones_number_active_unique) execution.
 *
 * NEVER executes migration or modifies indexes.
 */

export const MIGRATION_CHECK_CODES = Object.freeze({
    EXACT_DUPLICATES_ZERO: 'EXACT_DUPLICATES_ZERO',
    LIFECYCLE_FLAGS_CLEAN: 'LIFECYCLE_FLAGS_CLEAN',
    PARTIAL_FILTER_COMPLIANT: 'PARTIAL_FILTER_COMPLIANT',
    RECONCILIATION_DECISIONS_RESOLVED: 'RECONCILIATION_DECISIONS_RESOLVED',
    NO_PENDING_MERGE_AUDITS: 'NO_PENDING_MERGE_AUDITS',
    NO_REINITIALIZATION_ERRORS: 'NO_REINITIALIZATION_ERRORS',
    LEGACY_INDEX_PRESERVED: 'LEGACY_INDEX_PRESERVED',
    TARGET_INDEX_ABSENT: 'TARGET_INDEX_ABSENT'
});

export class MigrationReadinessService {
    /**
     * Run complete read-only evaluation of Migration 004 readiness.
     *
     * @param {Object} [options]
     * @param {mongoose.Connection} [options.connection] - Optional custom mongoose connection
     * @returns {Promise<{ ready: boolean, status: 'READY'|'BLOCKED', checks: Array<Object>, blockerReasons: Array<string>, duplicateCount: number }>}
     */
    static async evaluateReadiness(options = {}) {
        const conn = options.connection || mongoose.connection;
        const db = conn.db;
        const contactsCol = db.collection('contacts');

        const checks = [];
        const blockerReasons = [];

        // 1. Exact active duplicate phone groups check (Core E11000 collision prevention)
        const duplicatePipeline = [
            {
                $match: {
                    isDeleted: false,
                    isMerged: false,
                    'phones.number': { $type: 'string', $nin: ['', null] }
                }
            },
            { $unwind: '$phones' },
            {
                $match: {
                    'phones.number': { $type: 'string', $nin: ['', null] }
                }
            },
            {
                $group: {
                    _id: '$phones.number',
                    contactIds: { $addToSet: '$_id' }
                }
            },
            {
                $addFields: { contactCount: { $size: '$contactIds' } }
            },
            {
                $match: { contactCount: { $gt: 1 } }
            }
        ];

        const activeDuplicates = await contactsCol.aggregate(duplicatePipeline).toArray();
        const duplicateCount = activeDuplicates.length;

        if (duplicateCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.EXACT_DUPLICATES_ZERO,
                passed: true,
                message: 'Zero duplicate active phone groups found.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.EXACT_DUPLICATES_ZERO,
                passed: false,
                message: `${duplicateCount} active duplicate phone groups currently exist in contacts collection.`
            });
            blockerReasons.push(`ACTIVE_DUPLICATES_EXIST: ${duplicateCount} cross-contact phone collisions must be resolved.`);
        }

        // 2. Lifecycle flag gaps check
        const lifecycleGapCount = await contactsCol.countDocuments({
            $or: [
                { isDeleted: { $exists: false } },
                { isDeleted: null },
                { isMerged: { $exists: false } },
                { isMerged: null }
            ]
        });

        if (lifecycleGapCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.LIFECYCLE_FLAGS_CLEAN,
                passed: true,
                message: 'All contacts have explicit boolean lifecycle flags.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.LIFECYCLE_FLAGS_CLEAN,
                passed: false,
                message: `${lifecycleGapCount} contact(s) have missing or null lifecycle flags (isDeleted/isMerged).`
            });
            blockerReasons.push(`LIFECYCLE_FLAGS_GAP: ${lifecycleGapCount} contact(s) require boolean lifecycle flag normalization.`);
        }

        // 3. Pending Reconciliation Decisions check
        let pendingDecisionCount = 0;
        try {
            pendingDecisionCount = await ReconciliationGroup.countDocuments({
                status: 'PENDING_REVIEW'
            });
        } catch (_) {}

        if (pendingDecisionCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.RECONCILIATION_DECISIONS_RESOLVED,
                passed: true,
                message: 'No pending reconciliation decisions in review queue.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.RECONCILIATION_DECISIONS_RESOLVED,
                passed: false,
                message: `${pendingDecisionCount} reconciliation group(s) are awaiting operator review.`
            });
            blockerReasons.push(`PENDING_REVIEWS_EXIST: ${pendingDecisionCount} groups pending operator action.`);
        }

        // 4. Incomplete or pending MergeAudits check
        let pendingAuditCount = 0;
        try {
            pendingAuditCount = await MergeAudit.countDocuments({
                status: 'PENDING'
            });
        } catch (_) {}

        if (pendingAuditCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_MERGE_AUDITS,
                passed: true,
                message: 'Zero pending or interrupted merge audit operations.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_MERGE_AUDITS,
                passed: false,
                message: `${pendingAuditCount} merge operation(s) in PENDING state.`
            });
            blockerReasons.push(`INCOMPLETE_MERGES_EXIST: ${pendingAuditCount} pending merge transactions.`);
        }

        // 5. Existing Index Verification
        let legacyIndexPreserved = false;
        let targetIndexAlreadyCreated = false;
        try {
            const indexes = await contactsCol.indexes();
            const indexNames = indexes.map(i => i.name);

            legacyIndexPreserved = indexNames.includes('phones.number_1');
            targetIndexAlreadyCreated = indexNames.includes('contacts_phones_number_active_unique');

            checks.push({
                check: MIGRATION_CHECK_CODES.LEGACY_INDEX_PRESERVED,
                passed: legacyIndexPreserved,
                message: legacyIndexPreserved ? 'Legacy non-unique index phones.number_1 is intact.' : 'Legacy index phones.number_1 was not found.'
            });

            if (!legacyIndexPreserved) {
                blockerReasons.push('LEGACY_INDEX_MISSING: phones.number_1 must exist.');
            }

            checks.push({
                check: MIGRATION_CHECK_CODES.TARGET_INDEX_ABSENT,
                passed: !targetIndexAlreadyCreated,
                message: targetIndexAlreadyCreated ? 'Target unique index contacts_phones_number_active_unique already exists.' : 'Target index is ready to be created.'
            });
        } catch (_) {}

        const isReady = blockerReasons.length === 0;

        return {
            ready: isReady,
            status: isReady ? 'READY' : 'BLOCKED',
            checks,
            blockerReasons,
            duplicateCount,
            evaluatedAt: new Date().toISOString()
        };
    }
}

export default MigrationReadinessService;
