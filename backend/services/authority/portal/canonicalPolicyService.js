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

import { AuthorityCanonicalPolicy } from '../../../models/AuthorityCanonicalPolicy.js';

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
    session = null
} = {}) {
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
        isActive: true,
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

    // Synchronize to Redis quota provider if supplied
    if (quotaProvider && typeof quotaProvider.setCanonicalPolicy === 'function') {
        try {
            await quotaProvider.setCanonicalPolicy({
                authorityCode: code,
                policy: {
                    policyReference: ref,
                    minIntervalMs,
                    maxRequestsPerMinute,
                    maxRequestsPerHour,
                    maxRequestsPerDay,
                    contentHash
                },
                approvedBy: approver,
                policyVersion: nextVersion
            });
            savedDoc.redisSyncStatus = 'SYNCED';
            savedDoc.lastSyncedAt = new Date();
            savedDoc.redisSyncError = null;
        } catch (syncErr) {
            savedDoc.redisSyncStatus = 'FAILED';
            savedDoc.redisSyncError = syncErr.message;
        }

        await AuthorityCanonicalPolicy.updateOne(
            { _id: savedDoc._id },
            {
                $set: {
                    redisSyncStatus: savedDoc.redisSyncStatus,
                    lastSyncedAt: savedDoc.lastSyncedAt,
                    redisSyncError: savedDoc.redisSyncError
                }
            }
        );
    }

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
 * Retrieves the currently active and valid canonical policy for an authority.
 * Fails closed if missing, inactive, future-effective, or expired.
 */
export async function getCanonicalPolicy(authorityCode, { session = null, now = Date.now() } = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const doc = await AuthorityCanonicalPolicy.findOne({ authorityCode: code, isActive: true }).session(session);
    if (!doc) {
        return null;
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
