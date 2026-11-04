/**
 * Canonical Authority-Global Policy Service (Phase 4.4.4 / Finding B)
 *
 * Manages the privileged, audited authority-global canonical quota policy lifecycle.
 * Keyed strictly on authorityCode (never tenantId).
 * Enforces:
 * - Independent maker-checker review (reviewedBy !== approvedBy)
 * - Atomic compare-and-set version rotation
 * - Valid validity windows (future expiresAt)
 * - Option A serial concurrency (maxConcurrent === 1)
 * - Deterministic content hashing
 * - Synchronization with Redis quota provider
 */

import mongoose from 'mongoose';
import { AuthorityCanonicalPolicy } from '../../../models/AuthorityCanonicalPolicy.js';
import AuditLog from '../../../models/AuditLog.js';

const VALID_AUTHORITIES = new Set(['HSVP', 'CHD', 'GMADA']);

export class CanonicalPolicyError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

/**
 * Validates, registers or rotates an authority-global canonical rate policy.
 * Privileged operation — ordinary tenant item processing cannot invoke this.
 *
 * @param {object} params
 * @param {string} params.authorityCode
 * @param {object} params.policy
 * @param {string} params.reviewedBy
 * @param {string} params.approvedBy
 * @param {number} [params.policyVersion]
 * @param {number} [params.expectedPreviousVersion]
 * @param {object} [params.quotaProvider]
 * @param {object} [params.session]
 * @returns {Promise<object>} The persisted AuthorityCanonicalPolicy record
 */
export async function registerOrRotateCanonicalPolicy({
    authorityCode,
    policy,
    reviewedBy,
    reviewerId = null,
    reviewerName = null,
    approvedBy,
    approverId = null,
    approverName = null,
    policyVersion = null,
    expectedPreviousVersion = null,
    quotaProvider = null,
    session = null,
    isAudited,
    auditStatus,
    auditLogId
} = {}) {
    // P1-A Objective A: Activation parameters are strictly forbidden on policy registration/rotation.
    // Policies must always be initialized as inactive, un-audited, and pending without exception.
    if (isAudited !== undefined || auditStatus !== undefined || auditLogId !== undefined) {
        throw new CanonicalPolicyError(
            'CANONICAL_POLICY_AUDIT_PARAM_FORBIDDEN',
            'Cannot set isAudited, auditStatus, or auditLogId during policy registration/rotation. Activation requires markCanonicalPolicyAudited with durable AuditLog proof.'
        );
    }
    const code = String(authorityCode || '').trim().toUpperCase();
    if (!VALID_AUTHORITIES.has(code)) {
        throw new CanonicalPolicyError(
            'INVALID_AUTHORITY_CODE',
            `Authority code must be one of ${Array.from(VALID_AUTHORITIES).join(', ')}, got: ${authorityCode}`
        );
    }

    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
        throw new CanonicalPolicyError('INVALID_POLICY_OBJECT', 'Canonical policy must be a non-null plain object.');
    }

    const ref = String(policy.policyReference || policy.policySource || '').trim();
    if (!ref) {
        throw new CanonicalPolicyError('MISSING_POLICY_REFERENCE', 'policyReference is mandatory for canonical authority policy.');
    }

    const reviewer = String(reviewedBy || reviewerId || '').trim();
    const approver = String(approvedBy || approverId || '').trim();
    if (!reviewer) {
        throw new CanonicalPolicyError('MISSING_REVIEWER', 'reviewedBy is mandatory for canonical policy registration.');
    }
    if (!approver) {
        throw new CanonicalPolicyError('MISSING_APPROVER', 'approvedBy is mandatory for canonical policy registration.');
    }
    if (reviewer === approver || (reviewerId && approverId && String(reviewerId) === String(approverId))) {
        throw new CanonicalPolicyError(
            'CANONICAL_POLICY_SELF_APPROVAL',
            'Independent maker-checker separation required: reviewer and approver must be distinct individuals.'
        );
    }

    const minIntervalMs = Number(policy.minIntervalMs ?? policy.minimumIntervalMs);
    const maxRequestsPerMinute = Number(policy.maxRequestsPerMinute);
    const maxRequestsPerHour = policy.maxRequestsPerHour !== undefined && policy.maxRequestsPerHour !== null
        ? Number(policy.maxRequestsPerHour)
        : 0;
    const maxRequestsPerDay = Number(policy.maxRequestsPerDay);
    const maxConcurrent = Number(policy.maxConcurrent ?? 1);

    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 1) {
        throw new CanonicalPolicyError('INVALID_MIN_INTERVAL', 'minimumIntervalMs must be an integer >= 1.');
    }
    if (!Number.isInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1) {
        throw new CanonicalPolicyError('INVALID_MAX_PER_MINUTE', 'maxRequestsPerMinute must be an integer >= 1.');
    }
    if (!Number.isInteger(maxRequestsPerHour) || maxRequestsPerHour < 0) {
        throw new CanonicalPolicyError('INVALID_MAX_PER_HOUR', 'maxRequestsPerHour must be a non-negative integer.');
    }
    if (!Number.isInteger(maxRequestsPerDay) || maxRequestsPerDay < 1) {
        throw new CanonicalPolicyError('INVALID_MAX_PER_DAY', 'maxRequestsPerDay must be an integer >= 1.');
    }
    if (maxConcurrent !== 1) {
        throw new CanonicalPolicyError('PORTAL_CONCURRENCY_UNSUPPORTED', 'Canonical policy strictly enforces maxConcurrent === 1 under Option A.');
    }

    const effectiveFrom = policy.effectiveFrom ? new Date(policy.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) {
        throw new CanonicalPolicyError('INVALID_EFFECTIVE_DATE', 'effectiveFrom is not a valid date.');
    }

    if (!policy.expiresAt) {
        throw new CanonicalPolicyError('MISSING_EXPIRY_DATE', 'expiresAt is mandatory for canonical authority policy.');
    }
    const expiresAt = new Date(policy.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
        throw new CanonicalPolicyError('INVALID_EXPIRY_DATE', 'expiresAt must be a valid date.');
    }
    if (expiresAt.getTime() <= Date.now()) {
        throw new CanonicalPolicyError('CANONICAL_POLICY_EXPIRED', 'expiresAt must be in the future.');
    }
    if (expiresAt <= effectiveFrom) {
        throw new CanonicalPolicyError('INVALID_EXPIRY_DATE', 'expiresAt must be a valid future date after effectiveFrom.');
    }

    const contentHash = AuthorityCanonicalPolicy.computeContentHash({
        policyReference: ref,
        minIntervalMs,
        maxRequestsPerMinute,
        maxRequestsPerHour,
        maxRequestsPerDay
    });

    // Check existing canonical policy document
    const existing = await AuthorityCanonicalPolicy.findOne({ authorityCode: code }).session(session);

    let nextVersion = 1;
    if (existing) {
        if (expectedPreviousVersion !== null && expectedPreviousVersion !== undefined) {
            if (existing.version !== Number(expectedPreviousVersion)) {
                throw new CanonicalPolicyError(
                    'VERSION_CONFLICT',
                    `Expected previous version ${expectedPreviousVersion}, but current version is ${existing.version}.`
                );
            }
        }

        if (policyVersion !== null && policyVersion !== undefined) {
            const requestedVer = Number(policyVersion);
            if (!Number.isInteger(requestedVer) || requestedVer <= existing.version) {
                throw new CanonicalPolicyError(
                    'INVALID_VERSION_SEQUENCE',
                    `Rotated version (${requestedVer}) must be strictly greater than current version (${existing.version}).`
                );
            }
            nextVersion = requestedVer;
        } else {
            nextVersion = existing.version + 1;
        }
    } else {
        if (expectedPreviousVersion !== null && expectedPreviousVersion !== undefined) {
            throw new CanonicalPolicyError('VERSION_CONFLICT', 'Cannot assert expectedPreviousVersion on initial policy creation.');
        }
        if (policyVersion !== null && policyVersion !== undefined) {
            const requestedVer = Number(policyVersion);
            if (!Number.isInteger(requestedVer) || requestedVer < 1) {
                throw new CanonicalPolicyError('INVALID_VERSION', 'Policy version must be a positive integer >= 1.');
            }
            nextVersion = requestedVer;
        } else {
            nextVersion = 1;
        }
    }

    const recordData = {
        authorityCode: code,
        policyReference: ref,
        version: nextVersion,
        contentHash,
        minIntervalMs,
        maxRequestsPerMinute,
        maxRequestsPerHour,
        maxRequestsPerDay,
        maxConcurrent: 1,
        effectiveFrom,
        expiresAt,
        reviewedBy: reviewer,
        reviewerId: reviewerId || null,
        reviewerName: reviewerName || null,
        approvedBy: approver,
        approverId: approverId || null,
        approverName: approverName || null,
        redisSyncStatus: 'PENDING',
        redisSyncError: null,
        lastSyncedAt: null,
        // P1-A Objective A: Creation/rotation always starts un-audited, pending, and inactive with null auditLogId
        isAudited: false,
        auditStatus: 'PENDING',
        auditLogId: null,
        isActive: false,
        updatedAt: new Date()
    };

    let savedDoc;
    if (existing) {
        savedDoc = await AuthorityCanonicalPolicy.findOneAndUpdate(
            { authorityCode: code, version: existing.version },
            { $set: recordData },
            { new: true, session }
        );
        if (!savedDoc) {
            throw new CanonicalPolicyError('CONCURRENT_ROTATION_CONFLICT', 'Canonical policy was rotated by another concurrent operation.');
        }
    } else {
        const docs = await AuthorityCanonicalPolicy.create([recordData], { session });
        savedDoc = docs[0];
    }

    // P2-C: Redis publication is strictly decoupled from Mongo policy creation/rotation.
    // The controller or caller must invoke publishCanonicalPolicyToRedis only after durable Mongo commit and audit.

    return savedDoc;
}

/**
 * Reconciles and synchronizes an existing canonical policy to Redis.
 */
export async function syncCanonicalPolicyToRedis({ authorityCode, quotaProvider, session = null } = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    if (!quotaProvider || typeof quotaProvider.setCanonicalPolicy !== 'function') {
        throw new CanonicalPolicyError('NO_QUOTA_PROVIDER', 'Quota provider is required for synchronization.');
    }
    const policyDoc = await getCanonicalPolicy(code, { session });
    if (!policyDoc) {
        throw new CanonicalPolicyError('CANONICAL_POLICY_NOT_FOUND', `No active, valid canonical policy found for authority ${code}.`);
    }

    try {
        await quotaProvider.setCanonicalPolicy({
            authorityCode: code,
            policy: {
                policyReference: policyDoc.policyReference,
                minIntervalMs: policyDoc.minIntervalMs,
                maxRequestsPerMinute: policyDoc.maxRequestsPerMinute,
                maxRequestsPerHour: policyDoc.maxRequestsPerHour,
                maxRequestsPerDay: policyDoc.maxRequestsPerDay,
                contentHash: policyDoc.contentHash
            },
            approvedBy: policyDoc.approvedBy,
            policyVersion: policyDoc.version
        });

        policyDoc.redisSyncStatus = 'SYNCED';
        policyDoc.redisSyncError = null;
        policyDoc.lastSyncedAt = new Date();
        await AuthorityCanonicalPolicy.updateOne(
            { _id: policyDoc._id },
            { $set: { redisSyncStatus: 'SYNCED', redisSyncError: null, lastSyncedAt: policyDoc.lastSyncedAt } }
        );
        return { success: true, policy: policyDoc };
    } catch (syncErr) {
        policyDoc.redisSyncStatus = 'FAILED';
        policyDoc.redisSyncError = syncErr.message;
        await AuthorityCanonicalPolicy.updateOne(
            { _id: policyDoc._id },
            { $set: { redisSyncStatus: 'FAILED', redisSyncError: syncErr.message } }
        );
        return { success: false, reason: syncErr.message, policy: policyDoc };
    }
}

/**
 * Marks a newly rotated canonical policy as audited and active after durable AuditLog creation.
 * Enforces referential integrity with the durable AuditLog entry.
 */
export async function markCanonicalPolicyAudited({ policyId, auditLogId = null, session = null } = {}) {
    if (!policyId || !mongoose.Types.ObjectId.isValid(policyId)) {
        throw new CanonicalPolicyError('INVALID_POLICY_ID', 'policyId is required and must be a valid ObjectId.');
    }
    if (!auditLogId || !mongoose.Types.ObjectId.isValid(auditLogId)) {
        throw new CanonicalPolicyError('INVALID_AUDIT_LOG_ID', 'auditLogId is mandatory and must be a valid ObjectId.');
    }

    // P1-A Objective A: Verify the referenced AuditLog is the expected successful canonical_policy_rotated record
    const auditRecord = await AuditLog.findOne({
        _id: auditLogId,
        targetType: 'authority_canonical_policy',
        targetId: policyId,
        eventType: { $in: ['canonical_policy_rotated', 'authority_canonical_policy_rotated'] },
        status: 'success'
    }).session(session);

    if (!auditRecord) {
        throw new CanonicalPolicyError(
            'AUDIT_LOG_NOT_FOUND_OR_MISMATCHED',
            'Referenced AuditLog does not exist, is not successful, or does not match the target policy and event type.'
        );
    }

    // Update the policy ONLY from pending/inactive state and verify a document was actually updated
    const updatedDoc = await AuthorityCanonicalPolicy.findOneAndUpdate(
        {
            _id: policyId,
            $or: [
                { isAudited: false },
                { auditStatus: 'PENDING' },
                { isActive: false }
            ]
        },
        {
            $set: {
                isAudited: true,
                auditStatus: 'AUDITED',
                isActive: true,
                auditLogId: auditRecord._id
            }
        },
        { new: true, session }
    );

    if (!updatedDoc) {
        throw new CanonicalPolicyError(
            'POLICY_ACTIVATION_FAILED',
            'No matching pending/inactive canonical policy was found to activate with audit proof.'
        );
    }

    return updatedDoc;
}

/**
 * Publishes an audited, committed canonical policy to Redis quota provider.
 * Strictly separates Redis publication from Mongo persistence/audit.
 *
 * @param {object} params
 * @param {string} params.authorityCode
 * @param {object} params.quotaProvider
 * @param {object} [params.policyDoc]
 * @param {object} [params.session]
 * @returns {Promise<{ success: boolean, redisSyncStatus: string, reason?: string, policy: object }>}
 */
export async function publishCanonicalPolicyToRedis({ authorityCode, quotaProvider, policyDoc = null, session = null } = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    if (!quotaProvider || typeof quotaProvider.setCanonicalPolicy !== 'function') {
        throw new CanonicalPolicyError('NO_QUOTA_PROVIDER', 'Valid quota provider is required for Redis publication.');
    }

    const doc = policyDoc || await getCanonicalPolicy(code, { session });
    if (!doc) {
        throw new CanonicalPolicyError('CANONICAL_POLICY_NOT_FOUND', `No active, valid audited canonical policy found for authority ${code}.`);
    }

    try {
        await quotaProvider.setCanonicalPolicy({
            authorityCode: code,
            policy: {
                policyReference: doc.policyReference,
                minIntervalMs: doc.minIntervalMs,
                maxRequestsPerMinute: doc.maxRequestsPerMinute,
                maxRequestsPerHour: doc.maxRequestsPerHour,
                maxRequestsPerDay: doc.maxRequestsPerDay,
                contentHash: doc.contentHash
            },
            approvedBy: doc.approvedBy,
            policyVersion: doc.version
        });

        doc.redisSyncStatus = 'SYNCED';
        doc.redisSyncError = null;
        doc.lastSyncedAt = new Date();
        await AuthorityCanonicalPolicy.updateOne(
            { _id: doc._id },
            { $set: { redisSyncStatus: 'SYNCED', redisSyncError: null, lastSyncedAt: doc.lastSyncedAt } },
            { session }
        );
        return { success: true, redisSyncStatus: 'SYNCED', policy: doc };
    } catch (syncErr) {
        doc.redisSyncStatus = 'FAILED';
        doc.redisSyncError = syncErr.message;
        await AuthorityCanonicalPolicy.updateOne(
            { _id: doc._id },
            { $set: { redisSyncStatus: 'FAILED', redisSyncError: syncErr.message } },
            { session }
        );
        return { success: false, redisSyncStatus: 'FAILED', reason: syncErr.message, policy: doc };
    }
}

/**
 * Fails closed and disables a policy if mandatory audit log creation threw an error.
 */
export async function markCanonicalPolicyAuditFailed({ policyId, session = null } = {}) {
    return await AuthorityCanonicalPolicy.findByIdAndUpdate(
        policyId,
        {
            $set: {
                isAudited: false,
                auditStatus: 'FAILED',
                isActive: false
            }
        },
        { new: true, session }
    );
}

/**
 * Retrieves the currently active and valid canonical policy for an authority.
 * Fails closed if missing, inactive, unaudited, audit-failed, future-effective, expired,
 * or if durable AuditLog proof is missing or unverified.
 */
export async function getCanonicalPolicy(authorityCode, { session = null, now = Date.now(), verifyAuditLog = true } = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const doc = await AuthorityCanonicalPolicy.findOne({
        authorityCode: code,
        isActive: true,
        isAudited: true,
        auditStatus: 'AUDITED',
        auditLogId: { $ne: null }
    }).session(session);
    if (!doc || !doc.auditLogId) {
        return null;
    }

    // P1-A Objective A: Explicit referential check to verify durable AuditLog existence
    if (verifyAuditLog) {
        const auditRecord = await AuditLog.findOne({
            _id: doc.auditLogId,
            targetType: 'authority_canonical_policy',
            targetId: doc._id,
            eventType: { $in: ['canonical_policy_rotated', 'authority_canonical_policy_rotated'] },
            status: 'success'
        }).session(session);

        if (!auditRecord) {
            return null; // Audit log referential check failed — fail closed
        }
    }

    const currentMs = typeof now === 'number' ? now : (now instanceof Date ? now.getTime() : Date.now());
    if (doc.effectiveFrom && doc.effectiveFrom.getTime() > currentMs) {
        return null; // Future-effective policy cannot be used yet
    }
    if (doc.expiresAt && doc.expiresAt.getTime() <= currentMs) {
        return null; // Expired policy cannot be used
    }
    return doc;
}
