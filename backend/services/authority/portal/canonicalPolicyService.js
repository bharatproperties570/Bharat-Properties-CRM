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
    approvedBy,
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

    const reviewer = String(reviewedBy || '').trim();
    const approver = String(approvedBy || '').trim();
    if (!reviewer) {
        throw new CanonicalPolicyError('MISSING_REVIEWER', 'reviewedBy is mandatory for canonical policy registration.');
    }
    if (!approver) {
        throw new CanonicalPolicyError('MISSING_APPROVER', 'approvedBy is mandatory for canonical policy registration.');
    }
    if (reviewer === approver) {
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
        nextVersion = policyVersion !== null && policyVersion !== undefined ? Number(policyVersion) : 1;
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
        approvedBy: approver,
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
    }

    return savedDoc;
}

/**
 * Retrieves the currently active and valid canonical policy for an authority.
 * Fails closed if missing, inactive, or expired.
 */
export async function getCanonicalPolicy(authorityCode, { session = null } = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const doc = await AuthorityCanonicalPolicy.findOne({ authorityCode: code, isActive: true }).session(session);
    if (!doc) {
        return null;
    }
    if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
        return null; // Expired policy cannot be used
    }
    return doc;
}
