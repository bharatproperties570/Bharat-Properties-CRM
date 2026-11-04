import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * AuthorityCanonicalPolicy
 *
 * Authority-global canonical rate and quota policy trust anchor.
 * Keyed ONLY by authorityCode, NOT tenantId.
 * Represents the official, independently reviewed terms and request quotas
 * established for an authority. Tenant-scoped settings can reference/consume this policy
 * but cannot overwrite, elevate, or modify it as a side effect of processing an item.
 */
const AuthorityCanonicalPolicySchema = new mongoose.Schema({
    authorityCode: {
        type: String,
        required: true,
        enum: ['HSVP', 'CHD', 'GMADA'],
        unique: true,
        index: true
    },
    policyReference: {
        type: String,
        required: true,
        trim: true
    },
    version: {
        type: Number,
        required: true,
        default: 1
    },
    contentHash: {
        type: String,
        required: true
    },
    minIntervalMs: {
        type: Number,
        required: true,
        min: 1
    },
    maxRequestsPerMinute: {
        type: Number,
        required: true,
        min: 1
    },
    maxRequestsPerHour: {
        type: Number,
        default: 0,
        min: 0
    },
    maxRequestsPerDay: {
        type: Number,
        required: true,
        min: 1
    },
    maxConcurrent: {
        type: Number,
        required: true,
        default: 1,
        validate: {
            validator: (v) => v === 1,
            message: 'maxConcurrent must be exactly 1 under Option A serial execution'
        }
    },
    effectiveFrom: {
        type: Date,
        required: true,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    },
    reviewedBy: {
        type: String,
        required: true,
        trim: true
    },
    reviewerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewerName: {
        type: String,
        default: null,
        trim: true
    },
    approvedBy: {
        type: String,
        required: true,
        trim: true
    },
    approverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approverName: {
        type: String,
        default: null,
        trim: true
    },
    redisSyncStatus: {
        type: String,
        enum: ['PENDING', 'SYNCED', 'FAILED'],
        default: 'PENDING',
        index: true
    },
    redisSyncError: {
        type: String,
        default: null
    },
    lastSyncedAt: {
        type: Date,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    collection: 'authority_canonical_policies'
});

/**
 * Computes deterministic SHA-256 canonical content hash for rate policy parameters
 */
AuthorityCanonicalPolicySchema.statics.computeContentHash = function ({ policyReference, minIntervalMs, maxRequestsPerMinute, maxRequestsPerHour = 0, maxRequestsPerDay }) {
    const ref = String(policyReference || '').trim();
    const minInterval = Number(minIntervalMs || 0);
    const maxPerMin = Number(maxRequestsPerMinute || 0);
    const maxPerHour = Number(maxRequestsPerHour || 0);
    const maxPerDay = Number(maxRequestsPerDay || 0);
    return crypto.createHash('sha256')
        .update(JSON.stringify({ ref, minIntervalMs: minInterval, maxPerMin, maxPerHour, maxPerDay }))
        .digest('hex');
};

export const AuthorityCanonicalPolicy = mongoose.models.AuthorityCanonicalPolicy ||
    mongoose.model('AuthorityCanonicalPolicy', AuthorityCanonicalPolicySchema);

export default AuthorityCanonicalPolicy;
