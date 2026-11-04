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

export const AuthorityGlobalFenceWatermark = mongoose.models.AuthorityGlobalFenceWatermark ||
    mongoose.model('AuthorityGlobalFenceWatermark', AuthorityGlobalFenceWatermarkSchema);

export default AuthorityGlobalFenceWatermark;
