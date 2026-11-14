import mongoose from 'mongoose';

/**
 * SocialPostMetric.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise telemetry store for post performance across social channels:
 * Facebook, Instagram, LinkedIn, YouTube, and Google Business Profile.
 *
 * Ingested by: SocialAnalyticsSyncService
 * Consumed by: Metrics Manager (Google Gemini 1.5 Pro) for closed-loop strategy
 */

const socialPostMetricSchema = new mongoose.Schema({
    activityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Activity',
        index: true
    },
    contentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MarketingContent',
        index: true
    },
    dealId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
    },
    platform: {
        type: String,
        required: [true, 'Platform is required'],
        enum: ['facebook', 'instagram', 'linkedin', 'youtube', 'google_business', 'twitter'],
        index: true
    },
    remotePostId: {
        type: String,
        required: [true, 'Remote Post ID / URN is required'],
        trim: true
    },
    // Only true after a successful metrics fetch using a provider-issued post ID.
    // Legacy rows remain excluded until they are revalidated by the provider.
    remotePostIdVerified: {
        type: Boolean,
        default: false,
        index: true
    },
    title: {
        type: String,
        trim: true
    },
    caption: {
        type: String
    },
    mediaUrl: {
        type: String
    },
    format: {
        type: String,
        enum: ['post', 'story', 'reel', 'video'],
        default: 'post'
    },
    publishedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    pillar: {
        type: String,
        enum: ['ct-project', 'ct-festival', 'ct-edu', 'ct-trust', 'general'],
        default: 'general',
        index: true
    },
    metrics: {
        impressions: { type: Number, default: 0 },
        reach: { type: Number, default: 0 },
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
        saves: { type: Number, default: 0 },
        videoViews: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        engagement: { type: Number, default: 0 },
        engagementRate: { type: Number, default: 0 } // percentage e.g. 5.4 = 5.4%
    },
    history: [{
        syncedAt: { type: Date, default: Date.now },
        impressions: Number,
        reach: Number,
        likes: Number,
        comments: Number,
        shares: Number,
        saves: Number,
        videoViews: Number,
        clicks: Number
    }],
    syncStatus: {
        type: String,
        enum: ['synced', 'partial', 'failed', 'pending'],
        default: 'pending'
    },
    syncError: {
        type: String
    },
    lastSyncedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Compound unique index ensuring idempotent ingestion per post per platform
socialPostMetricSchema.index({ platform: 1, remotePostId: 1 }, { unique: true });
socialPostMetricSchema.index({ publishedAt: -1, pillar: 1 });
socialPostMetricSchema.index({ remotePostIdVerified: 1, publishedAt: -1 });

export default mongoose.model('SocialPostMetric', socialPostMetricSchema);
