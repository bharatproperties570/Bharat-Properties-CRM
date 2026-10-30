import mongoose from 'mongoose';
import BroadcastCampaign from '../models/BroadcastCampaign.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import redisConnection from '../src/config/redis.js';

const REDIS_KEY_PREFIX = 'bna:campaign:';
const REDIS_STATE_TTL_SECONDS = 86400; // 24 hours

class BroadcastLiveTracker {
    /**
     * Helper to safely interact with Redis cache without crashing if Redis is offline
     */
    static async _safeRedisSet(key, value, ttlSeconds = REDIS_STATE_TTL_SECONDS) {
        try {
            if (redisConnection && redisConnection.status === 'ready') {
                const str = typeof value === 'string' ? value : JSON.stringify(value);
                await redisConnection.set(key, str, 'EX', ttlSeconds);
            }
        } catch (err) {
            console.warn('[BroadcastLiveTracker] Redis set warning:', err.message);
        }
    }

    static async _safeRedisGet(key) {
        try {
            if (redisConnection && redisConnection.status === 'ready') {
                return await redisConnection.get(key);
            }
        } catch (err) {
            console.warn('[BroadcastLiveTracker] Redis get warning:', err.message);
        }
        return null;
    }

    static async _safeRedisDel(key) {
        try {
            if (redisConnection && redisConnection.status === 'ready') {
                await redisConnection.del(key);
            }
        } catch (err) {
            console.warn('[BroadcastLiveTracker] Redis del warning:', err.message);
        }
    }

    /**
     * Initializes or registers a campaign broadcast in the Live Tracker
     */
    static async initCampaign({
        campaignId,
        name,
        dealId = null,
        dealIds = [],
        dealTitle = 'Broadcast Deal',
        totalRecipients = 0,
        channels = ['whatsapp'],
        isBaileys = false,
        provider = 'META',
        campaignParams = {},
        performedBy = 'System'
    }) {
        const campaignDoc = await BroadcastCampaign.findOneAndUpdate(
            { campaignId },
            {
                $setOnInsert: {
                    campaignId,
                    name: name || `Broadcast: ${dealTitle}`,
                    dealId: dealId && mongoose.Types.ObjectId.isValid(dealId) ? dealId : undefined,
                    dealIds: Array.isArray(dealIds) ? dealIds.filter(id => mongoose.Types.ObjectId.isValid(id)) : [],
                    dealTitle,
                    totalRecipients,
                    processedRecipients: 0,
                    currentIndex: 0,
                    channels,
                    isBaileys: Boolean(isBaileys),
                    provider: isBaileys ? 'BAILEYS' : provider,
                    status: 'ACTIVE',
                    isCooldown: false,
                    stats: {
                        sent: 0,
                        accepted: 0,
                        delivered: 0,
                        read: 0,
                        failed: 0,
                        unknown: 0,
                        suppressed: 0,
                        skipped: 0
                    },
                    campaignParams,
                    startedAt: new Date()
                },
                $push: {
                    auditLog: {
                        action: 'CREATED',
                        performedBy,
                        timestamp: new Date(),
                        reason: 'Broadcast initialized'
                    }
                }
            },
            { upsert: true, new: true }
        );

        await this._safeRedisSet(`${REDIS_KEY_PREFIX}${campaignId}:state`, {
            campaignId,
            status: 'ACTIVE',
            totalRecipients,
            processedRecipients: 0
        });

        return campaignDoc;
    }

    /**
     * Updates live progress and stats as recipient micro-jobs execute
     */
    static async recordRecipientProgress({
        campaignId,
        recipientIndex,
        totalRecipients,
        stats = {}
    }) {
        const processedCount = recipientIndex + 1;
        const isFinished = processedCount >= totalRecipients;

        const updateSet = {
            processedRecipients: processedCount,
            currentIndex: processedCount,
            'stats.sent': stats.sent || 0,
            'stats.accepted': stats.accepted || 0,
            'stats.failed': stats.failed || 0,
            'stats.unknown': stats.unknown || 0,
            'stats.suppressed': stats.suppressed || 0,
            'stats.skipped': stats.skipped || 0
        };

        if (isFinished) {
            updateSet.status = 'COMPLETED';
            updateSet.isCooldown = false;
            updateSet.nextDispatchAt = null;
            updateSet.cooldownUntil = null;
            updateSet.completedAt = new Date();
        }

        const updated = await BroadcastCampaign.findOneAndUpdate(
            { campaignId },
            { $set: updateSet },
            { new: true }
        );

        if (isFinished) {
            await this._safeRedisDel(`${REDIS_KEY_PREFIX}${campaignId}:paused`);
        }

        return updated;
    }

    /**
     * Records upcoming pacing delay (randomized jitter or anti-ban batch cooldown)
     */
    static async recordCooldownOrPacing({
        campaignId,
        nextIndex,
        delayMs,
        isBatchBoundary
    }) {
        const now = Date.now();
        const nextDispatchAt = new Date(now + delayMs);
        const cooldownUntil = isBatchBoundary ? nextDispatchAt : null;
        const status = isBatchBoundary ? 'COOLDOWN' : 'ACTIVE';

        const updated = await BroadcastCampaign.findOneAndUpdate(
            { campaignId, status: { $nin: ['PAUSED', 'CANCELLED', 'COMPLETED'] } },
            {
                $set: {
                    status,
                    isCooldown: isBatchBoundary,
                    delayMs,
                    nextDispatchAt,
                    cooldownUntil
                }
            },
            { new: true }
        );

        return updated;
    }

    /**
     * Check if a campaign has been flagged as paused or cancelled
     */
    static async isCampaignHalted(campaignId) {
        // Fast Redis check first
        const pausedKey = await this._safeRedisGet(`${REDIS_KEY_PREFIX}${campaignId}:paused`);
        if (pausedKey === '1') return { halted: true, status: 'PAUSED' };

        const cancelledKey = await this._safeRedisGet(`${REDIS_KEY_PREFIX}${campaignId}:cancelled`);
        if (cancelledKey === '1') return { halted: true, status: 'CANCELLED' };

        // Fallback to database
        const campaign = await BroadcastCampaign.findOne({ campaignId }).select('status').lean();
        if (!campaign) return { halted: false, status: 'ACTIVE' };

        if (['PAUSED', 'CANCELLED', 'COMPLETED'].includes(campaign.status)) {
            return { halted: true, status: campaign.status };
        }

        return { halted: false, status: campaign.status };
    }

    /**
     * Returns real-time campaign state with live monotonic delivery breakdown
     */
    static async getCampaignState(campaignId) {
        const campaign = await BroadcastCampaign.findOne({ campaignId }).lean();
        if (!campaign) return null;

        // Fetch authoritative delivery ground truth from MarketingDelivery ledger
        let deliveryStats = {
            accepted: 0,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            unknown: 0,
            suppressed: 0,
            skipped: campaign.stats?.skipped || 0
        };

        try {
            const aggregates = await MarketingDelivery.aggregate([
                { $match: { jobId: campaignId } },
                { $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }}
            ]);

            aggregates.forEach(agg => {
                const s = agg._id;
                const c = agg.count;
                if (s === 'ACCEPTED') deliveryStats.accepted += c;
                else if (s === 'SENT') deliveryStats.sent += c;
                else if (s === 'DELIVERED') deliveryStats.delivered += c;
                else if (s === 'READ') deliveryStats.read += c;
                else if (['FAILED_FINAL', 'FAILED_RETRYABLE'].includes(s)) deliveryStats.failed += c;
                else if (s === 'DELIVERY_UNKNOWN') deliveryStats.unknown += c;
                else if (s === 'SUPPRESSED_OPTOUT') deliveryStats.suppressed += c;
                else if (s === 'SKIPPED_DUPLICATE') deliveryStats.skipped += c;
            });
        } catch (aggErr) {
            console.error('[BroadcastLiveTracker] Aggregation error:', aggErr.message);
            // Fall back to recorded stats on error
            deliveryStats = { ...campaign.stats };
        }

        const total = campaign.totalRecipients || 0;
        const processed = campaign.processedRecipients || 0;
        const progressPercent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

        // Calculate live cooldown countdown
        let remainingCooldownSeconds = 0;
        if (campaign.isCooldown && campaign.cooldownUntil) {
            const diff = new Date(campaign.cooldownUntil).getTime() - Date.now();
            remainingCooldownSeconds = Math.max(0, Math.round(diff / 1000));
        }

        return {
            campaignId: campaign.campaignId,
            name: campaign.name,
            dealId: campaign.dealId,
            dealTitle: campaign.dealTitle,
            status: campaign.status,
            totalRecipients: total,
            processedRecipients: processed,
            currentIndex: campaign.currentIndex || 0,
            progressPercent,
            channels: campaign.channels || ['whatsapp'],
            isBaileys: campaign.isBaileys,
            provider: campaign.provider,
            isCooldown: campaign.isCooldown,
            remainingCooldownSeconds,
            nextDispatchAt: campaign.nextDispatchAt,
            cooldownUntil: campaign.cooldownUntil,
            delayMs: campaign.delayMs || 0,
            stats: deliveryStats,
            auditLog: campaign.auditLog || [],
            startedAt: campaign.startedAt,
            completedAt: campaign.completedAt,
            updatedAt: campaign.updatedAt
        };
    }

    /**
     * Lists active and recent live campaigns (optionally filtered by dealId)
     */
    static async listLiveCampaigns({ dealId = null, limit = 10 } = {}) {
        const query = {};
        if (dealId && mongoose.Types.ObjectId.isValid(dealId)) {
            query.dealId = new mongoose.Types.ObjectId(dealId);
        }

        const campaigns = await BroadcastCampaign.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        // Enrich each with live delivery metrics
        return await Promise.all(campaigns.map(c => this.getCampaignState(c.campaignId)));
    }

    /**
     * Atomic operator action: PAUSE Campaign
     */
    static async pauseCampaign(campaignId, performedBy = 'Operator', reason = 'Manual pause by operator') {
        const campaign = await BroadcastCampaign.findOne({ campaignId });
        if (!campaign) {
            throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
        }

        if (campaign.status === 'PAUSED') {
            return { success: true, message: 'Campaign is already paused', campaignId, status: 'PAUSED' };
        }

        if (['COMPLETED', 'CANCELLED'].includes(campaign.status)) {
            throw new Error(`INVALID_STATE_TRANSITION: Cannot pause a ${campaign.status} campaign`);
        }

        // Atomic CAS
        const updated = await BroadcastCampaign.findOneAndUpdate(
            { campaignId, status: { $in: ['ACTIVE', 'COOLDOWN', 'INITIALIZING'] } },
            {
                $set: { status: 'PAUSED' },
                $push: {
                    auditLog: {
                        action: 'PAUSED',
                        performedBy,
                        timestamp: new Date(),
                        reason
                    }
                }
            },
            { new: true }
        );

        if (!updated) {
            throw new Error('CONCURRENT_MUTATION_CONFLICT: Campaign status changed concurrently');
        }

        await this._safeRedisSet(`${REDIS_KEY_PREFIX}${campaignId}:paused`, '1');

        return {
            success: true,
            message: 'Campaign paused successfully',
            campaignId,
            status: 'PAUSED',
            pausedAt: new Date().toISOString()
        };
    }

    /**
     * Atomic operator action: RESUME Campaign
     */
    static async resumeCampaign(campaignId, performedBy = 'Operator', reason = 'Manual resume by operator', marketingQueue = null) {
        const campaign = await BroadcastCampaign.findOne({ campaignId });
        if (!campaign) {
            throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
        }

        if (campaign.status === 'ACTIVE' || campaign.status === 'COOLDOWN') {
            return { success: true, message: 'Campaign is already running', campaignId, status: campaign.status };
        }

        if (campaign.status !== 'PAUSED') {
            throw new Error(`INVALID_STATE_TRANSITION: Cannot resume a campaign in ${campaign.status} state`);
        }

        // Atomic CAS
        const updated = await BroadcastCampaign.findOneAndUpdate(
            { campaignId, status: 'PAUSED' },
            {
                $set: {
                    status: 'ACTIVE',
                    isCooldown: false,
                    nextDispatchAt: new Date(Date.now() + 5000), // Resume in 5s
                    cooldownUntil: null
                },
                $push: {
                    auditLog: {
                        action: 'RESUMED',
                        performedBy,
                        timestamp: new Date(),
                        reason
                    }
                }
            },
            { new: true }
        );

        if (!updated) {
            throw new Error('CONCURRENT_MUTATION_CONFLICT: Campaign was resumed or modified concurrently');
        }

        await this._safeRedisDel(`${REDIS_KEY_PREFIX}${campaignId}:paused`);

        // Re-enqueue the current recipient micro-job to BullMQ if queue provided
        if (marketingQueue && updated.campaignParams) {
            const nextIndex = updated.currentIndex || 0;
            const params = updated.campaignParams;

            await marketingQueue.add('bna-recipient-dispatch', {
                ...params,
                recipientIndex: nextIndex,
                stats: updated.stats || {}
            }, {
                jobId: `bna_${campaignId}_recip_${nextIndex}_resumed_${Date.now()}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                delay: 2000, // Safe 2-second warm-up jitter
                removeOnComplete: true
            });
        }

        return {
            success: true,
            message: 'Campaign resumed successfully. Child micro-job dispatched.',
            campaignId,
            status: 'ACTIVE',
            resumedAt: new Date().toISOString()
        };
    }

    /**
     * Atomic operator action: CANCEL Campaign
     */
    static async cancelCampaign(campaignId, performedBy = 'Operator', reason = 'Manual cancel by operator') {
        const campaign = await BroadcastCampaign.findOne({ campaignId });
        if (!campaign) {
            throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
        }

        if (campaign.status === 'CANCELLED') {
            return { success: true, message: 'Campaign is already cancelled', campaignId, status: 'CANCELLED' };
        }

        const updated = await BroadcastCampaign.findOneAndUpdate(
            { campaignId, status: { $ne: 'CANCELLED' } },
            {
                $set: {
                    status: 'CANCELLED',
                    isCooldown: false,
                    nextDispatchAt: null,
                    cooldownUntil: null,
                    completedAt: new Date()
                },
                $push: {
                    auditLog: {
                        action: 'CANCELLED',
                        performedBy,
                        timestamp: new Date(),
                        reason
                    }
                }
            },
            { new: true }
        );

        await this._safeRedisSet(`${REDIS_KEY_PREFIX}${campaignId}:cancelled`, '1');
        await this._safeRedisDel(`${REDIS_KEY_PREFIX}${campaignId}:paused`);

        return {
            success: true,
            message: 'Campaign cancelled successfully. Chained scheduling terminated.',
            campaignId,
            status: 'CANCELLED',
            cancelledAt: new Date().toISOString()
        };
    }

    /**
     * Operator Recovery Action: RETRY FAILED ONLY
     * Finds recipients with FAILED_RETRYABLE or DELIVERY_UNKNOWN; guarantees 0 duplicate dispatches
     * to already sent/delivered/read recipients.
     */
    static async retryFailedRecipients(campaignId, performedBy = 'Operator', marketingQueue = null) {
        const parentCampaign = await BroadcastCampaign.findOne({ campaignId });
        if (!parentCampaign) {
            throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
        }

        // 1. Fetch deliveries with failed or unknown status
        const failedDeliveries = await MarketingDelivery.find({
            jobId: campaignId,
            status: { $in: ['FAILED_FINAL', 'FAILED_RETRYABLE', 'DELIVERY_UNKNOWN'] }
        }).lean();

        if (failedDeliveries.length === 0) {
            return {
                success: false,
                error: 'NO_FAILED_RECIPIENTS: No failed or unknown recipients found to retry in this campaign.'
            };
        }

        // 2. Fetch all confirmed recipients in this campaign to double-check
        const confirmedDeliveries = await MarketingDelivery.find({
            jobId: campaignId,
            status: { $in: ['SENT', 'ACCEPTED', 'DELIVERED', 'READ', 'SUPPRESSED_OPTOUT'] }
        }).select('recipientId').lean();

        const confirmedRecipientKeys = new Set(confirmedDeliveries.map(d => String(d.recipientId).trim()));

        // 3. Filter down original recipient list strictly to eligible unconfirmed failed targets
        const originalRecipients = parentCampaign.campaignParams?.recipients || [];
        const eligibleFailedRecipients = [];

        for (const recipient of originalRecipients) {
            const key = String(recipient.mobile || recipient.id || '').trim();
            // Never re-dispatch if already confirmed or opted-out!
            if (!confirmedRecipientKeys.has(key)) {
                const hadFailure = failedDeliveries.some(f => String(f.recipientId).trim() === key);
                if (hadFailure) {
                    eligibleFailedRecipients.push(recipient);
                }
            }
        }

        if (eligibleFailedRecipients.length === 0) {
            return {
                success: false,
                error: 'ALL_RECIPIENTS_CONFIRMED: All previously failed recipients were subsequently delivered or opted-out.'
            };
        }

        // 4. Create child retry campaign
        const retryCampaignId = `${campaignId}_retry_${Date.now()}`;
        const retryName = `[Retry] ${parentCampaign.name}`;

        const retryParams = {
            ...parentCampaign.campaignParams,
            campaignId: retryCampaignId,
            name: retryName,
            recipients: eligibleFailedRecipients,
            forceBroadcast: true // Force retry for these specific failed targets
        };

        const retryDoc = await this.initCampaign({
            campaignId: retryCampaignId,
            name: retryName,
            dealId: parentCampaign.dealId,
            dealIds: parentCampaign.dealIds,
            dealTitle: parentCampaign.dealTitle,
            totalRecipients: eligibleFailedRecipients.length,
            channels: parentCampaign.channels,
            isBaileys: parentCampaign.isBaileys,
            provider: parentCampaign.provider,
            campaignParams: retryParams,
            performedBy
        });

        // Record audit in parent campaign
        await BroadcastCampaign.updateOne(
            { campaignId },
            {
                $push: {
                    auditLog: {
                        action: 'RETRY_INITIATED',
                        performedBy,
                        timestamp: new Date(),
                        reason: `Spawned retry campaign ${retryCampaignId} for ${eligibleFailedRecipients.length} failed recipients`
                    }
                }
            }
        );

        // 5. Enqueue child retry campaign to marketingQueue
        if (marketingQueue) {
            await marketingQueue.add('bna-broadcast', retryParams, { removeOnComplete: true });
        }

        return {
            success: true,
            message: `Retry campaign spawned for ${eligibleFailedRecipients.length} failed recipients`,
            parentCampaignId: campaignId,
            retryCampaignId,
            retryRecipientCount: eligibleFailedRecipients.length
        };
    }
}

export default BroadcastLiveTracker;
