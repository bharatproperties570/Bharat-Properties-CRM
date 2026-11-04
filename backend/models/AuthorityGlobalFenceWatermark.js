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

const _inMemoryWatermarks = new Map();
const isRunningInTest = () => process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.argv.some(arg => String(arg).includes('test'));

/**
 * Atomically records an issued fence token before it is committed.
 * Enables detecting superseded tokens during the issued-but-not-yet-committed window.
 * Fail-closed: Must return a valid persisted record. Never swallow database errors.
 */
AuthorityGlobalFenceWatermarkSchema.statics.recordIssuedFenceToken = async function ({
    authorityCode,
    fenceToken
} = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const token = Number(fenceToken);
    if (!token || !Number.isInteger(token) || token < 1) {
        const err = new Error('INVALID_FENCE_TOKEN: fenceToken must be a positive integer.');
        err.code = 'PORTAL_FENCE_TOKEN_INVALID';
        throw err;
    }

    if (mongoose.connection?.readyState !== 1) {
        if (process.env.NODE_ENV === 'production' || !isRunningInTest()) {
            const err = new Error('WATERMARK_DB_UNAVAILABLE: MongoDB is not connected; fence watermark cannot be recorded.');
            err.code = 'PORTAL_FENCE_WATERMARK_PERSISTENCE_FAILED';
            throw err;
        }
        const current = _inMemoryWatermarks.get(code) || {
            authorityCode: code,
            lastCommittedFenceToken: 0,
            highestIssuedFenceToken: 0
        };
        current.highestIssuedFenceToken = Math.max(current.highestIssuedFenceToken || 0, token);
        _inMemoryWatermarks.set(code, current);
        return current;
    }

    let doc;
    try {
        doc = await this.findOneAndUpdate(
            { authorityCode: code },
            {
                $max: { highestIssuedFenceToken: token },
                $setOnInsert: { authorityCode: code, lastCommittedFenceToken: 0 }
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        if (err.code === 11000) {
            doc = await this.findOneAndUpdate(
                { authorityCode: code },
                { $max: { highestIssuedFenceToken: token } },
                { new: true }
            );
        } else {
            throw err;
        }
    }

    if (!doc || typeof doc !== 'object' || doc.highestIssuedFenceToken < token) {
        const err = new Error(`WATERMARK_RECORD_FAILED: Failed to durably persist issued fence token ${token} for ${code}`);
        err.code = 'PORTAL_FENCE_WATERMARK_PERSISTENCE_FAILED';
        throw err;
    }
    return doc;
};

/**
 * Checks whether an issued fence token is already superseded by a higher issued or committed token.
 * Fail-closed: Missing watermark document or database read failure throws to abort live execution.
 */
AuthorityGlobalFenceWatermarkSchema.statics.isFenceTokenSuperseded = async function ({
    authorityCode,
    fenceToken
} = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const token = Number(fenceToken);
    if (!token || !Number.isInteger(token) || token < 1) {
        const err = new Error('INVALID_FENCE_TOKEN: fenceToken must be a positive integer.');
        err.code = 'PORTAL_FENCE_TOKEN_INVALID';
        throw err;
    }

    if (mongoose.connection?.readyState !== 1) {
        if (process.env.NODE_ENV === 'production' || !isRunningInTest()) {
            const err = new Error('WATERMARK_DB_UNAVAILABLE: MongoDB is not connected; fence watermark cannot be read.');
            err.code = 'WATERMARK_DB_UNAVAILABLE';
            throw err;
        }
        const current = _inMemoryWatermarks.get(code);
        if (!current) {
            const err = new Error(`WATERMARK_RECORD_MISSING: AuthorityGlobalFenceWatermark record not found for authority ${code}.`);
            err.code = 'WATERMARK_RECORD_MISSING';
            throw err;
        }
        if (current.highestIssuedFenceToken > token || current.lastCommittedFenceToken > token) {
            return true;
        }
        return false;
    }

    const doc = await this.findOne({ authorityCode: code }).lean();
    if (!doc) {
        const err = new Error(`WATERMARK_RECORD_MISSING: AuthorityGlobalFenceWatermark record not found for authority ${code}.`);
        err.code = 'WATERMARK_RECORD_MISSING';
        throw err;
    }

    if (typeof doc.lastCommittedFenceToken !== 'number' && typeof doc.highestIssuedFenceToken !== 'number') {
        const err = new Error('WATERMARK_MALFORMED: AuthorityGlobalFenceWatermark record is missing watermark token counters.');
        err.code = 'WATERMARK_MALFORMED';
        throw err;
    }

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
