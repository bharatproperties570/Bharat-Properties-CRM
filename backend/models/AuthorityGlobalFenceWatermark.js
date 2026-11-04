import mongoose from 'mongoose';

/**
 * AuthorityGlobalFenceWatermark
 *
 * Durable authority-wide monotonic fence watermark for authority portal distributed locks.
 * Strictly authority-global (keyed on authorityCode, NOT tenantId) to ensure cross-tenant
 * monotonic sequence validation. Stale workers holding older fence tokens cannot persist
 * snapshots after a newer worker has committed across ANY tenant.
 */
const AuthorityGlobalFenceWatermarkSchema = new mongoose.Schema({
    authorityCode: {
        type: String,
        required: true,
        enum: ['HSVP', 'CHD', 'GMADA'],
        unique: true,
        index: true
    },
    lastCommittedFenceToken: {
        type: Number,
        required: true,
        default: 0,
        index: true
    },
    highestIssuedFenceToken: {
        type: Number,
        default: 0,
        index: true
    },
    lastCommittedAt: {
        type: Date,
        default: Date.now
    },
    lastCommittedByTenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        default: null
    },
    lastWorkerId: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
    collection: 'authority_global_fence_watermarks'
});

/**
 * Atomically records an issued fence token before it is committed.
 * Enables detecting superseded tokens during the issued-but-not-yet-committed window.
 */
AuthorityGlobalFenceWatermarkSchema.statics.recordIssuedFenceToken = async function ({
    authorityCode,
    fenceToken
} = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const token = Number(fenceToken);
    if (!token || !Number.isInteger(token) || token < 1) return null;

    try {
        return await this.findOneAndUpdate(
            { authorityCode: code },
            {
                $max: { highestIssuedFenceToken: token },
                $setOnInsert: { authorityCode: code, lastCommittedFenceToken: 0 }
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        if (err.code !== 11000) throw err;
        return await this.findOneAndUpdate(
            { authorityCode: code },
            { $max: { highestIssuedFenceToken: token } },
            { new: true }
        );
    }
};

/**
 * Checks whether an issued fence token is already superseded by a higher issued or committed token.
 */
AuthorityGlobalFenceWatermarkSchema.statics.isFenceTokenSuperseded = async function ({
    authorityCode,
    fenceToken
} = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const token = Number(fenceToken);
    if (!token || !Number.isInteger(token) || token < 1) return true;

    const doc = await this.findOne({ authorityCode: code }).lean();
    if (!doc) return false;

    if (doc.highestIssuedFenceToken && doc.highestIssuedFenceToken > token) {
        return true;
    }
    if (doc.lastCommittedFenceToken && doc.lastCommittedFenceToken > token) {
        return true;
    }
    return false;
};

export const AuthorityGlobalFenceWatermark = mongoose.models.AuthorityGlobalFenceWatermark ||
    mongoose.model('AuthorityGlobalFenceWatermark', AuthorityGlobalFenceWatermarkSchema);

export default AuthorityGlobalFenceWatermark;
