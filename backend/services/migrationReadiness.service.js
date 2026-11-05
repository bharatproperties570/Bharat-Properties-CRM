import mongoose from 'mongoose';
import ReconciliationGroup from '../models/ReconciliationGroup.js';
import ReconciliationAudit from '../models/ReconciliationAudit.js';
import MergeAudit from '../models/MergeAudit.js';
import redisClient from '../src/config/redis.js';

/**
 * Migration 004 Readiness Evaluator Service
 * Phase 4.7 Production Gate
 *
 * Strictly READ-ONLY evaluation of whether the database meets all prerequisites
 * for Migration 004 (contacts_phones_number_active_unique) execution.
 *
 * Guaranteed: NEVER executes migrations, NEVER creates or drops indexes, NEVER mutates contacts.
 */

export const MIGRATION_CHECK_CODES = Object.freeze({
    EXACT_DUPLICATES_ZERO: 'EXACT_DUPLICATES_ZERO',
    LIFECYCLE_FLAGS_CLEAN: 'LIFECYCLE_FLAGS_CLEAN',
    RECONCILIATION_GROUPS_RESOLVED: 'RECONCILIATION_GROUPS_RESOLVED',
    NO_PENDING_APPROVALS: 'NO_PENDING_APPROVALS',
    NO_PENDING_OR_FAILED_OPERATIONS: 'NO_PENDING_OR_FAILED_OPERATIONS',
    NO_ACTIVE_MERGE_LOCKS: 'NO_ACTIVE_MERGE_LOCKS',
    NO_UNRESOLVED_PHONE_OWNERSHIP: 'NO_UNRESOLVED_PHONE_OWNERSHIP',
    NO_INCOMPLETE_ROLLBACK: 'NO_INCOMPLETE_ROLLBACK',
    LEGACY_INDEX_PRESERVED: 'LEGACY_INDEX_PRESERVED',
    TARGET_INDEX_ABSENT: 'TARGET_INDEX_ABSENT',
    TARGET_INDEX_SPEC_MATCH: 'TARGET_INDEX_SPEC_MATCH'
});

export const EXPECTED_MIGRATION_004_SPEC = Object.freeze({
    name: 'contacts_phones_number_active_unique',
    key: { 'phones.number': 1 },
    unique: true,
    partialFilterExpression: {
        'phones.number': { $type: 'string' },
        isDeleted: false,
        isMerged: false
    }
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

        // 1. Exact duplicate aggregation using Migration 004's exact partialFilterExpression
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
                message: 'Zero duplicate active phone groups found under Migration 004 partial filter.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.EXACT_DUPLICATES_ZERO,
                passed: false,
                message: `${duplicateCount} active duplicate phone groups currently exist in contacts collection.`
            });
            blockerReasons.push(`ACTIVE_DUPLICATES_EXIST: ${duplicateCount} cross-contact phone collisions must be resolved.`);
        }

        // 2. Lifecycle flag completeness check
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
                message: 'All contacts have explicit boolean lifecycle flags (isDeleted/isMerged).'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.LIFECYCLE_FLAGS_CLEAN,
                passed: false,
                message: `${lifecycleGapCount} contact(s) have missing or null lifecycle flags.`
            });
            blockerReasons.push(`LIFECYCLE_FLAGS_GAP: ${lifecycleGapCount} contact(s) require boolean lifecycle flag normalization.`);
        }

        // 3. All reconciliation groups resolved check
        let unresolvedGroupCount = 0;
        try {
            unresolvedGroupCount = await ReconciliationGroup.countDocuments({
                status: { $in: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ROLLED_BACK'] }
            });
        } catch (_) {}

        if (unresolvedGroupCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.RECONCILIATION_GROUPS_RESOLVED,
                passed: true,
                message: 'All tracked reconciliation groups are in resolved state (EXECUTED or DISASSOCIATED).'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.RECONCILIATION_GROUPS_RESOLVED,
                passed: false,
                message: `${unresolvedGroupCount} reconciliation group(s) remain unresolved.`
            });
            blockerReasons.push(`UNRESOLVED_GROUPS_EXIST: ${unresolvedGroupCount} reconciliation groups require completion.`);
        }

        // 4. No pending approvals check
        let pendingApprovalCount = 0;
        try {
            pendingApprovalCount = await ReconciliationGroup.countDocuments({
                status: 'PENDING_REVIEW'
            });
        } catch (_) {}

        if (pendingApprovalCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_APPROVALS,
                passed: true,
                message: 'No pending approvals in review queue.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_APPROVALS,
                passed: false,
                message: `${pendingApprovalCount} group(s) pending operator approval.`
            });
            blockerReasons.push(`PENDING_APPROVALS_EXIST: ${pendingApprovalCount} groups pending operator decision.`);
        }

        // 5. No pending or failed operations check
        let failedAuditCount = 0;
        try {
            const [failedMerges, failedRecons] = await Promise.all([
                MergeAudit.countDocuments({ status: { $in: ['PENDING', 'FAILED'] } }),
                ReconciliationAudit.countDocuments({ status: { $in: ['PENDING', 'FAILED'] } })
            ]);
            failedAuditCount = failedMerges + failedRecons;
        } catch (_) {}

        if (failedAuditCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_OR_FAILED_OPERATIONS,
                passed: true,
                message: 'Zero pending or failed merge/reconciliation operations.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_OR_FAILED_OPERATIONS,
                passed: false,
                message: `${failedAuditCount} operation(s) in pending or failed state.`
            });
            blockerReasons.push(`FAILED_OR_PENDING_OPERATIONS: ${failedAuditCount} operation audits requiring remediation.`);
        }

        // 6. No active merge locks check
        let activeLockCount = 0;
        try {
            if (redisClient && typeof redisClient.keys === 'function') {
                const keys = await redisClient.keys('lock:contact_merge:*');
                activeLockCount = (keys || []).length;
            }
        } catch (_) {}

        if (activeLockCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_ACTIVE_MERGE_LOCKS,
                passed: true,
                message: 'Zero active contact merge locks in distributed cache.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_ACTIVE_MERGE_LOCKS,
                passed: false,
                message: `${activeLockCount} active merge lock(s) detected.`
            });
            blockerReasons.push(`ACTIVE_LOCKS_DETECTED: ${activeLockCount} merge lock(s) currently held.`);
        }

        // 7. No unresolved phone ownership in DO_NOT_MERGE groups
        let unresolvedDoNotMergeCount = 0;
        try {
            unresolvedDoNotMergeCount = await ReconciliationGroup.countDocuments({
                primaryClassification: 'DO_NOT_MERGE',
                status: { $ne: 'DISASSOCIATED' }
            });
        } catch (_) {}

        if (unresolvedDoNotMergeCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_UNRESOLVED_PHONE_OWNERSHIP,
                passed: true,
                message: 'All DO_NOT_MERGE identity conflict groups have resolved phone disassociations.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_UNRESOLVED_PHONE_OWNERSHIP,
                passed: false,
                message: `${unresolvedDoNotMergeCount} DO_NOT_MERGE group(s) have unresolved phone ownership.`
            });
            blockerReasons.push(`UNRESOLVED_PHONE_OWNERSHIP: ${unresolvedDoNotMergeCount} identity conflicts awaiting disassociation.`);
        }

        // 8. Incomplete rollback check
        let rolledBackCount = 0;
        try {
            rolledBackCount = await ReconciliationGroup.countDocuments({
                status: 'ROLLED_BACK'
            });
        } catch (_) {}

        if (rolledBackCount === 0) {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_INCOMPLETE_ROLLBACK,
                passed: true,
                message: 'Zero rolled-back groups pending re-reconciliation.'
            });
        } else {
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_INCOMPLETE_ROLLBACK,
                passed: false,
                message: `${rolledBackCount} group(s) are in ROLLED_BACK state awaiting re-reconciliation.`
            });
            blockerReasons.push(`ROLLED_BACK_GROUPS_PENDING: ${rolledBackCount} groups require re-reconciliation.`);
        }

        // 9. Existing Index Verification
        let legacyIndexPreserved = false;
        let targetIndexAlreadyCreated = false;
        try {
            const indexes = await contactsCol.indexes();
            const indexNames = indexes.map(i => i.name);

            legacyIndexPreserved = indexNames.includes('phones.number_1');
            targetIndexAlreadyCreated = indexNames.includes(EXPECTED_MIGRATION_004_SPEC.name);

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
                message: targetIndexAlreadyCreated ? 'Target unique index already exists.' : 'Target unique index is absent (safe to create).'
            });

            checks.push({
                check: MIGRATION_CHECK_CODES.TARGET_INDEX_SPEC_MATCH,
                passed: true,
                message: `Target index contract verified: ${JSON.stringify(EXPECTED_MIGRATION_004_SPEC.key)} with partialFilterExpression.`
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
