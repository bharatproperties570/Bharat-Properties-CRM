import mongoose from 'mongoose';

const marketingTouchSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MarketingCampaign',
        required: true
    },
    campaignRunId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CampaignRun',
        required: true
    },
    deliveryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MarketingDelivery',
        required: true
    },
    subjectType: {
        type: String,
        enum: ['Lead', 'Contact', 'Deal'],
        required: true
    },
    subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    touchSource: {
        type: String,
        required: true
    },
    touchType: {
        type: String,
        enum: ['REPLY', 'CLICK', 'VIEW', 'CONVERSION'],
        required: true
    },
    timestamp: {
        type: Date,
        required: true
    },
    windowMatchedHrs: {
        type: Number,
        required: true
    },
    snapshot: {
        campaignName: { type: String, required: true },
        channel: { type: String, required: true }
    }
}, {
    timestamps: true,
    // IMMUTABILITY: Prevent any updates to this collection
    strict: true
});

// Enforce append-only / immutable in Mongoose layer
marketingTouchSchema.pre('updateOne', function(next) { next(new Error('MarketingTouch is append-only and immutable.')); });
marketingTouchSchema.pre('updateMany', function(next) { next(new Error('MarketingTouch is append-only and immutable.')); });
marketingTouchSchema.pre('findOneAndUpdate', function(next) { next(new Error('MarketingTouch is append-only and immutable.')); });
marketingTouchSchema.pre('replaceOne', function(next) { next(new Error('MarketingTouch is append-only and immutable.')); });
marketingTouchSchema.pre('save', function(next) {
    if (!this.isNew) {
        return next(new Error('MarketingTouch is append-only and immutable.'));
    }
    next();
});

// Step 4: Unique Idempotency Contract
marketingTouchSchema.index({ deliveryId: 1, subjectId: 1, touchType: 1 }, { unique: true, name: 'idx_idempotency' });
marketingTouchSchema.index({ subjectId: 1, subjectType: 1 }, { name: 'idx_subject_lookup' });
marketingTouchSchema.index({ campaignId: 1, touchType: 1, timestamp: -1 }, { name: 'idx_campaign_rollup' });

export default mongoose.model('MarketingTouch', marketingTouchSchema);
