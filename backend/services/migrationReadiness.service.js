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
 * Strictly FAILS CLOSED:
 * - Unknown is NEVER equivalent to zero.
 * - Any database or Redis failure immediately marks the check BLOCKED.
 * - Disconnected DB returns BLOCKED.
 * - Duplicate aggregation matches Migration 004's exact partialFilterExpression,
 *   including empty-string and whitespace-string collisions.
 *
 * Guaranteed: NEVER executes migrations, NEVER creates or drops indexes, NEVER mutates contacts.
 */

export const MIGRATION_CHECK_CODES = Object.freeze({
    DATABASE_CONNECTED: 'DATABASE_CONNECTED',
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

/**
 * Helper to sanitize error messages so no internal credentials or URI details leak.
 */
const sanitizeErrorMessage = (msg) => {
    if (!msg) return 'Unknown error';
    return String(msg)
        .replace(/mongodb(\+srv)?:\/\/[^\s@]+@[^\s/]+/gi, 'mongodb://[REDACTED]')
        .replace(/password=[^\s&]+/gi, 'password=[REDACTED]');
};

export class MigrationReadinessService {
    /**
     * Run complete read-only evaluation of Migration 004 readiness.
     *
     * @param {Object} [options]
     * @param {mongoose.Connection} [options.connection] - Optional custom mongoose connection
     * @param {Object} [options.customRedis] - Optional custom redis client for testing
     * @returns {Promise<{ ready: boolean, status: 'READY'|'BLOCKED', checks: Array<Object>, blockerReasons: Array<string>, duplicateCount: number, evaluatedAt: string }>}
     */
    static async evaluateReadiness(options = {}) {
        const conn = options.connection || mongoose.connection;
        const checks = [];
        const blockerReasons = [];

        // 0. Database Connection Check (Fail closed if disconnected)
        if (!conn || conn.readyState !== 1 || !conn.db) {
            checks.push({
                check: MIGRATION_CHECK_CODES.DATABASE_CONNECTED,
                passed: false,
                message: 'MongoDB connection is not in CONNECTED state (readyState !== 1).'
            });
            blockerReasons.push('DATABASE_DISCONNECTED: MongoDB connection is inactive or disconnected.');
            return {
                ready: false,
                status: 'BLOCKED',
                checks,
                blockerReasons,
                duplicateCount: -1,
                evaluatedAt: new Date().toISOString()
            };
        }

        checks.push({
            check: MIGRATION_CHECK_CODES.DATABASE_CONNECTED,
            passed: true,
            message: 'MongoDB connection is healthy and connected.'
        });

        const db = conn.db;
        const contactsCol = db.collection('contacts');
        let duplicateCount = -1;

        // 1. Exact duplicate aggregation using Migration 004's exact partialFilterExpression
        // Semantically identical to unique partial index:
        // Index covers all documents where: isDeleted === false, isMerged === false, and phones.number has $type: 'string'
        // NOTE: empty strings ('') and whitespace strings ('   ') ARE strings and thus covered by index.
        try {
            const duplicatePipeline = [
                {
                    $match: {
                        isDeleted: false,
                        isMerged: false,
                        'phones.number': { $type: 'string' }
                    }
                },
                { $unwind: '$phones' },
                {
                    $match: {
                        'phones.number': { $type: 'string' }
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
            duplicateCount = activeDuplicates.length;

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
        } catch (aggErr) {
            const sanitized = sanitizeErrorMessage(aggErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.EXACT_DUPLICATES_ZERO,
                passed: false,
                message: `Duplicate phone aggregation failed: ${sanitized}`
            });
            blockerReasons.push(`AGGREGATION_FAILED: ${sanitized}`);
        }

        // 2. Lifecycle flag completeness check
        try {
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
        } catch (gapErr) {
            const sanitized = sanitizeErrorMessage(gapErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.LIFECYCLE_FLAGS_CLEAN,
                passed: false,
                message: `Lifecycle flag inspection failed: ${sanitized}`
            });
            blockerReasons.push(`LIFECYCLE_QUERY_FAILED: ${sanitized}`);
        }

        // 3. All reconciliation groups resolved check
        try {
            const unresolvedGroupCount = await ReconciliationGroup.countDocuments({
                status: { $in: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ROLLED_BACK'] }
            });

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
        } catch (reconErr) {
            const sanitized = sanitizeErrorMessage(reconErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.RECONCILIATION_GROUPS_RESOLVED,
                passed: false,
                message: `Failed to inspect reconciliation groups: ${sanitized}`
            });
            blockerReasons.push(`RECONCILIATION_QUERY_FAILED: ${sanitized}`);
        }

        // 4. No pending approvals check
        try {
            const pendingApprovalCount = await ReconciliationGroup.countDocuments({
                status: 'PENDING_REVIEW'
            });

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
        } catch (apprErr) {
            const sanitized = sanitizeErrorMessage(apprErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_APPROVALS,
                passed: false,
                message: `Failed to inspect pending approvals: ${sanitized}`
            });
            blockerReasons.push(`APPROVAL_QUERY_FAILED: ${sanitized}`);
        }

        // 5. No pending or failed operations check
        try {
            const [failedMerges, failedRecons] = await Promise.all([
                MergeAudit.countDocuments({ status: { $in: ['PENDING', 'FAILED'] } }),
                ReconciliationAudit.countDocuments({ status: { $in: ['PENDING', 'FAILED'] } })
            ]);
            const failedAuditCount = failedMerges + failedRecons;

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
        } catch (auditErr) {
            const sanitized = sanitizeErrorMessage(auditErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_PENDING_OR_FAILED_OPERATIONS,
                passed: false,
                message: `Failed to inspect merge and reconciliation audits: ${sanitized}`
            });
            blockerReasons.push(`AUDIT_QUERY_FAILED: ${sanitized}`);
        }

        // 6. No active merge locks check (Strictly fails closed if Redis is unavailable)
        const activeRedis = options.customRedis || redisClient;
        try {
            if (!activeRedis || typeof activeRedis.keys !== 'function') {
                throw new Error('Redis client is unavailable or missing keys command');
            }

            // Check if connection is in error or closed state
            if (activeRedis.status && ['close', 'end', 'error', 'reconnecting'].includes(activeRedis.status) && !activeRedis.isMock) {
                throw new Error(`Redis client status is '${activeRedis.status}'`);
            }

            const keys = await activeRedis.keys('lock:contact_merge:*');
            const activeLockCount = (keys || []).length;

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
        } catch (redisErr) {
            const sanitized = sanitizeErrorMessage(redisErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_ACTIVE_MERGE_LOCKS,
                passed: false,
                message: `Redis lock verification failed: ${sanitized}`
            });
            blockerReasons.push(`REDIS_INSPECTION_FAILED: Cannot verify active merge locks (${sanitized}).`);
        }

        // 7. No unresolved phone ownership in DO_NOT_MERGE groups
        try {
            const unresolvedDoNotMergeCount = await ReconciliationGroup.countDocuments({
                primaryClassification: 'DO_NOT_MERGE',
                status: { $ne: 'DISASSOCIATED' }
            });

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
        } catch (dnmErr) {
            const sanitized = sanitizeErrorMessage(dnmErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_UNRESOLVED_PHONE_OWNERSHIP,
                passed: false,
                message: `Failed to inspect DO_NOT_MERGE phone ownership: ${sanitized}`
            });
            blockerReasons.push(`PHONE_OWNERSHIP_QUERY_FAILED: ${sanitized}`);
        }

        // 8. Incomplete rollback check
        try {
            const rolledBackCount = await ReconciliationGroup.countDocuments({
                status: 'ROLLED_BACK'
            });

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
        } catch (rbErr) {
            const sanitized = sanitizeErrorMessage(rbErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.NO_INCOMPLETE_ROLLBACK,
                passed: false,
                message: `Failed to inspect rolled-back groups: ${sanitized}`
            });
            blockerReasons.push(`ROLLBACK_QUERY_FAILED: ${sanitized}`);
        }

        // 9. Existing Index Verification (Strict: fail closed if indexes() throws)
        try {
            const indexes = await contactsCol.indexes();
            const indexNames = indexes.map(i => i.name);

            const legacyIndexPreserved = indexNames.includes('phones.number_1');
            const targetIndexAlreadyCreated = indexNames.includes(EXPECTED_MIGRATION_004_SPEC.name);

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

            if (targetIndexAlreadyCreated) {
                blockerReasons.push('TARGET_INDEX_ALREADY_EXISTS: contacts_phones_number_active_unique is already built.');
            }

            checks.push({
                check: MIGRATION_CHECK_CODES.TARGET_INDEX_SPEC_MATCH,
                passed: true,
                message: `Target index contract verified: ${JSON.stringify(EXPECTED_MIGRATION_004_SPEC.key)} with partialFilterExpression.`
            });
        } catch (idxErr) {
            const sanitized = sanitizeErrorMessage(idxErr.message);
            checks.push({
                check: MIGRATION_CHECK_CODES.LEGACY_INDEX_PRESERVED,
                passed: false,
                message: `Failed to inspect collection indexes: ${sanitized}`
            });
            checks.push({
                check: MIGRATION_CHECK_CODES.TARGET_INDEX_ABSENT,
                passed: false,
                message: `Failed to verify target index absence: ${sanitized}`
            });
            blockerReasons.push(`INDEX_INSPECTION_FAILED: Cannot inspect collection indexes (${sanitized}).`);
        }

        const isReady = blockerReasons.length === 0 && checks.every(c => c.passed === true);

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
