import mongoose from 'mongoose';
import crypto from 'crypto';
import BroadcastCampaign from '../models/BroadcastCampaign.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import redisConnection from '../src/config/redis.js';

const REDIS_KEY_PREFIX = 'bna:campaign:';
const REDIS_STATE_TTL_SECONDS = 86400; // 24 hours
const RETRY_LOCK_LEASE_MS = 60000; // 60 seconds lease
const RETRY_LOCK_HEARTBEAT_MS = 15000; // 15 seconds renewal

class BroadcastLiveTracker {
    /**
     * Heartbeat lease renewal for retryLock.
     * Condition: exact active lock token AND a still-valid unexpired lease.
     * Throws database errors; returns updated doc if matched, null otherwise.
     */
    static async _renewRetryLock(campaignId, lockToken, leaseDurationMs = RETRY_LOCK_LEASE_MS) {
        const now = new Date();
        const newExpiresAt = new Date(now.getTime() + leaseDurationMs);

        return await BroadcastCampaign.findOneAndUpdate(
            {
                campaignId,
                'retryLock.active': true,
                'retryLock.token': lockToken,
                $or: [
                    { 'retryLock.expiresAt': { $gt: now } },
                    {
                        'retryLock.expiresAt': { $exists: false },
                        'retryLock.lockedAt': { $gt: new Date(now.getTime() - leaseDurationMs) }
                    }
                ]
            },
            {
                $set: {
                    'retryLock.lockedAt': now,
                    'retryLock.expiresAt': newExpiresAt
                }
            },
            { new: true }
        );
    }

    /**
     * Verifies retryLock ownership.
     * Condition: active state is true, exact active lock token, AND an unexpired lease.
     * Returns true if valid ownership confirmed; false if expired, stolen, or database error.
     */
    static async _verifyRetryLockOwnership(campaignId, lockToken, leaseDurationMs = RETRY_LOCK_LEASE_MS) {
        try {
            const now = new Date();
            const current = await BroadcastCampaign.findOne({
                campaignId,
                'retryLock.active': true,
                'retryLock.token': lockToken,
                $or: [
                    { 'retryLock.expiresAt': { $gt: now } },
                    {
                        'retryLock.expiresAt': { $exists: false },
                        'retryLock.lockedAt': { $gt: new Date(now.getTime() - leaseDurationMs) }
                    }
                ]
            }).select('_id retryLock').lean();

            if (!current || !current.retryLock) {
                return false;
            }

            const { active, token, expiresAt, lockedAt } = current.retryLock;
            if (!active || token !== lockToken) {
                return false;
            }

            const effectiveExpiry = expiresAt
                ? new Date(expiresAt).getTime()
                : (lockedAt ? new Date(lockedAt).getTime() + leaseDurationMs : 0);

            if (effectiveExpiry <= now.getTime()) {
                return false;
            }

            return true;
        } catch (err) {
            console.warn(`[BroadcastLiveTracker] _verifyRetryLockOwnership error: ${err.message}`);
            return false;
        }
    }

    /**
     * Executes a single heartbeat renewal tick for retryLock.
     * Condition: exact active lock token AND a still-valid unexpired lease.
     * If renewal fails, returns null, or throws, marks state.renewalLost = true and stops renewing.
     */
    static async _handleHeartbeatTick(campaignId, lockToken, leaseDurationMs = RETRY_LOCK_LEASE_MS, state = { isRenewing: true, renewalLost: false }) {
        if (!state.isRenewing || state.renewalLost) return false;
        try {
            const renewed = await this._renewRetryLock(campaignId, lockToken, leaseDurationMs);
            if (!renewed) {
                state.renewalLost = true;
                state.isRenewing = false;
                console.warn(`[BroadcastLiveTracker] Heartbeat tick found no valid lease for token ${lockToken} on campaign ${campaignId}. Ownership marked lost.`);
                return false;
            }
            return true;
        } catch (err) {
            state.renewalLost = true;
            state.isRenewing = false;
            console.warn(`[BroadcastLiveTracker] Heartbeat tick threw database error for token ${lockToken} on campaign ${campaignId}: ${err.message}. Ownership marked lost.`);
            return false;
        }
    }
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
     * Updates live progress and stats as recipient micro-jobs execute.
     * Enforces atomic CAS: progress updates are conditional on an allowed active campaign state
     * (ACTIVE, COOLDOWN, INITIALIZING) and will NEVER overwrite PAUSED, CANCELLED, or COMPLETED.
     * Stale recipient jobs cannot overwrite operator states or regress progress counters ($max).
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

        // CAS Guard: Must be in an active execution state.
        // Stale jobs must never overwrite PAUSED or CANCELLED, and completion must not overwrite CANCELLED.
        const filter = {
            campaignId,
            status: { $in: ['ACTIVE', 'COOLDOWN', 'INITIALIZING'] }
        };

        const updateDoc = {
            $set: updateSet,
            $max: {
                processedRecipients: processedCount,
                currentIndex: processedCount
            }
        };

        const updated = await BroadcastCampaign.findOneAndUpdate(
            filter,
            updateDoc,
            { new: true }
        );

        if (!updated) {
            // Document was not updated because campaign was either not found or in a terminal/paused state
            const existing = await BroadcastCampaign.findOne({ campaignId }).lean();
            if (!existing) {
                return {
                    updated: false,
                    reason: 'CAMPAIGN_NOT_FOUND',
                    campaignId
                };
            }

            return {
                updated: false,
                reason: 'REJECTED_TERMINAL_OR_PAUSED_STATE',
                campaignId,
                status: existing.status,
                processedRecipients: existing.processedRecipients,
                currentIndex: existing.currentIndex
            };
        }

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
     * to already sent/delivered/read/opted-out recipients.
     *
     * CONCURRENCY & IDEMPOTENCY CONTROLS:
     * 1. Ownership-Safe Retry Lock:
     *    - Generates a unique cryptographically random ownership token (UUID).
     *    - Acquires lock via atomic CAS with a 60-second lease threshold.
     *    - Actively renews the lease via a background timer while the operation is in flight.
     *    - Periodically verifies ownership; if lease expires or is claimed by a newer owner,
     *      the former owner stops immediately before mutating data or enqueuing work.
     *    - Every release is conditional on the exact ownership token so an expired former owner
     *      can never clear a newer owner's lock.
     * 2. Fail-Closed Opt-Out Verification:
     *    - Verifies WhatsAppService availability. If WhatsApp opt-out verification is required
     *      but the service is unavailable, aborts the retry operation immediately.
     *    - If an opt-out check throws or times out, the recipient is excluded from retry candidates
     *      (never treat an unavailable opt-out check as consent).
     *    - Logs operational warnings without exposing private recipient data.
     *    - Confirmed opt-outs are updated to SUPPRESSED_OPTOUT in the delivery ledger.
     * 3. Atomic Multi-Field Claim on MarketingDelivery:
     *    - Uses explicit $and to avoid JavaScript duplicate object key collisions.
     *    - Atomically requires: status in ['FAILED_FINAL', 'FAILED_RETRYABLE', 'DELIVERY_UNKNOWN']
     *      AND status not in ['SENT', 'ACCEPTED', 'DELIVERED', 'READ', 'SUPPRESSED_OPTOUT']
     *      AND retryClaimed: { $ne: true } AND matching jobId and recipientId.
     *    - Verifies matchedCount / modifiedCount and constructs child campaign recipients exclusively
     *      from confirmed claimed records.
     * 4. Enqueue Rollback & Recovery:
     *    - BullMQ enqueue is wrapped in rollback logic: on enqueue failure, unsets claims on MarketingDelivery,
     *      marks child campaign FAILED, and safely releases the parent lock.
     * 5. Conservative DELIVERY_UNKNOWN Semantics:
     *    - Discloses potential duplicate delivery risk if the provider previously transmitted
     *      the unconfirmed socket write.
     */
    static async retryFailedRecipients(campaignId, performedBy = 'Operator', marketingQueue = null) {
        const parentCampaign = await BroadcastCampaign.findOne({ campaignId });
        if (!parentCampaign) {
            throw new Error(`CAMPAIGN_NOT_FOUND: Campaign ${campaignId} does not exist`);
        }

        // 1. Acquire ownership-safe retry lock on parent campaign
        const lockToken = crypto.randomUUID();
        const now = new Date();
        const initialExpiresAt = new Date(now.getTime() + RETRY_LOCK_LEASE_MS);

        const lockAcquired = await BroadcastCampaign.findOneAndUpdate(
            {
                campaignId,
                $or: [
                    { 'retryLock.active': { $ne: true } },
                    { 'retryLock.expiresAt': { $lte: now } },
                    {
                        'retryLock.expiresAt': { $exists: false },
                        'retryLock.lockedAt': { $lte: new Date(now.getTime() - RETRY_LOCK_LEASE_MS) }
                    }
                ]
            },
            {
                $set: {
                    'retryLock.active': true,
                    'retryLock.lockedAt': now,
                    'retryLock.expiresAt': initialExpiresAt,
                    'retryLock.lockedBy': performedBy,
                    'retryLock.token': lockToken
                }
            },
            { new: true }
        );

        if (!lockAcquired) {
            return {
                success: false,
                error: 'CONCURRENT_RETRY_IN_PROGRESS: A retry operation is currently in progress for this campaign.'
            };
        }

        const lockState = { isRenewing: true, renewalLost: false };

        // Background active lease renewal
        const renewTimer = setInterval(async () => {
            const ok = await BroadcastLiveTracker._handleHeartbeatTick(campaignId, lockToken, RETRY_LOCK_LEASE_MS, lockState);
            if (!ok && renewTimer) {
                clearInterval(renewTimer);
            }
        }, RETRY_LOCK_HEARTBEAT_MS);
        if (renewTimer?.unref) renewTimer.unref();

        const verifyLockOwnership = async () => {
            if (lockState.renewalLost) return false;
            try {
                const isValid = await BroadcastLiveTracker._verifyRetryLockOwnership(campaignId, lockToken, RETRY_LOCK_LEASE_MS);
                if (!isValid) {
                    lockState.renewalLost = true;
                    return false;
                }
                return true;
            } catch (err) {
                lockState.renewalLost = true;
                return false;
            }
        };

        let retryCampaignId = null;

        try {
            // 2. Fetch deliveries with failed or unknown status that have NOT already been claimed for retry
            const failedDeliveries = await MarketingDelivery.find({
                jobId: campaignId,
                status: { $in: ['FAILED_FINAL', 'FAILED_RETRYABLE', 'DELIVERY_UNKNOWN'] },
                retryClaimed: { $ne: true }
            }).lean();

            if (failedDeliveries.length === 0) {
                return {
                    success: false,
                    error: 'NO_FAILED_RECIPIENTS: No failed or unknown recipients found to retry in this campaign.'
                };
            }

            // 3. Immediately re-validate delivery status to exclude any confirmed or opted-out recipients
            const confirmedDeliveries = await MarketingDelivery.find({
                jobId: campaignId,
                status: { $in: ['SENT', 'ACCEPTED', 'DELIVERED', 'READ', 'SUPPRESSED_OPTOUT'] }
            }).select('recipientId').lean();

            const confirmedRecipientKeys = new Set(confirmedDeliveries.map(d => String(d.recipientId).trim()));

            // 4. Fail-Closed Opt-Out Verification:
            // If WhatsApp opt-out verification is required, WhatsAppService must be available
            const channels = parentCampaign.channels || ['whatsapp'];
            const isWhatsAppCampaign = channels.includes('whatsapp');
            let waService = null;

            if (isWhatsAppCampaign) {
                try {
                    const waModule = await import('./WhatsAppService.js');
                    waService = waModule.default;
                    if (!waService || typeof waService.isRecipientOptedOut !== 'function') {
                        throw new Error('isRecipientOptedOut is not a function on WhatsAppService');
                    }
                } catch (serviceLoadErr) {
                    console.error('[BroadcastLiveTracker] Opt-out verification service unavailable:', serviceLoadErr.message);
                    return {
                        success: false,
                        error: `OPT_OUT_SERVICE_UNAVAILABLE: WhatsApp consent verification service is unavailable (${serviceLoadErr.message}). Cannot verify consent.`
                    };
                }
            }

            const originalRecipients = parentCampaign.campaignParams?.recipients || [];
            const candidateFailedRecipients = [];
            let unknownStatusCount = 0;

            for (let idx = 0; idx < originalRecipients.length; idx++) {
                const recipient = originalRecipients[idx];
                const key = String(recipient.mobile || recipient.id || '').trim();

                // Never re-dispatch if already confirmed or opted-out
                if (!confirmedRecipientKeys.has(key)) {
                    const failureMatch = failedDeliveries.find(f => String(f.recipientId).trim() === key);
                    if (failureMatch) {
                        // Fail-closed opt-out lookup
                        if (waService && recipient.mobile) {
                            let isOptedOut = false;
                            try {
                                const optOutPromise = waService.isRecipientOptedOut(recipient.mobile);
                                const timeoutPromise = new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error('OPT_OUT_LOOKUP_TIMEOUT')), 3000)
                                );
                                isOptedOut = await Promise.race([optOutPromise, timeoutPromise]);
                            } catch (optErr) {
                                // Fail closed: exclude recipient from retry without exposing private recipient data
                                console.warn(`[BroadcastLiveTracker] Opt-out verification failed for recipient at index ${idx}: ${optErr.message}. Failing closed (treating as ineligible).`);
                                continue;
                            }

                            if (isOptedOut) {
                                // Mark delivery as SUPPRESSED_OPTOUT in ledger
                                await MarketingDelivery.updateOne(
                                    { jobId: campaignId, recipientId: key, channel: 'whatsapp' },
                                    { $set: { status: 'SUPPRESSED_OPTOUT', error: 'Recipient opted out of communications' } }
                                );
                                continue;
                            }
                        }

                        if (failureMatch.status === 'DELIVERY_UNKNOWN') {
                            unknownStatusCount++;
                        }
                        candidateFailedRecipients.push(recipient);
                    }
                }
            }

            if (candidateFailedRecipients.length === 0) {
                return {
                    success: false,
                    error: 'ALL_RECIPIENTS_CONFIRMED: All previously failed recipients were subsequently delivered, claimed, or opted-out.'
                };
            }

            // Verify lock ownership before proceeding to claim
            if (!await verifyLockOwnership()) {
                return {
                    success: false,
                    error: 'RETRY_LOCK_LOST: Retry lock expired or was acquired by another process.'
                };
            }

            // 5. Atomically claim candidate recipients on MarketingDelivery with explicit $and (no duplicate keys)
            retryCampaignId = `${campaignId}_retry_${Date.now()}`;
            const candidateKeys = candidateFailedRecipients.map(r => String(r.mobile || r.id || '').trim());

            const claimFilter = {
                jobId: campaignId,
                recipientId: { $in: candidateKeys },
                retryClaimed: { $ne: true },
                $and: [
                    { status: { $in: ['FAILED_FINAL', 'FAILED_RETRYABLE', 'DELIVERY_UNKNOWN'] } },
                    { status: { $nin: ['SENT', 'ACCEPTED', 'DELIVERED', 'READ', 'SUPPRESSED_OPTOUT'] } }
                ]
            };

            const claimResult = await MarketingDelivery.updateMany(
                claimFilter,
                {
                    $set: {
                        retryClaimed: true,
                        retryCampaignId
                    }
                }
            );

            if (!claimResult || claimResult.modifiedCount === 0) {
                return {
                    success: false,
                    error: 'NO_ELIGIBLE_RECIPIENTS: All candidate recipients were claimed or transitioned concurrently.'
                };
            }

            // Re-fetch only those deliveries that were successfully claimed
            const claimedDeliveries = await MarketingDelivery.find({
                jobId: campaignId,
                retryCampaignId,
                retryClaimed: true
            }).select('recipientId').lean();

            const claimedKeys = new Set(claimedDeliveries.map(d => String(d.recipientId).trim()));
            const finalRecipientsToRetry = candidateFailedRecipients.filter(r => claimedKeys.has(String(r.mobile || r.id || '').trim()));

            if (finalRecipientsToRetry.length === 0) {
                // Release any orphaned claims
                await MarketingDelivery.updateMany(
                    { jobId: campaignId, retryCampaignId },
                    { $set: { retryClaimed: false }, $unset: { retryCampaignId: 1 } }
                );
                return {
                    success: false,
                    error: 'NO_ELIGIBLE_RECIPIENTS: All candidate recipients were claimed or transitioned concurrently.'
                };
            }

            // Verify lock ownership before child campaign creation
            if (!await verifyLockOwnership()) {
                // Rollback claims
                await MarketingDelivery.updateMany(
                    { jobId: campaignId, retryCampaignId },
                    { $set: { retryClaimed: false }, $unset: { retryCampaignId: 1 } }
                );
                return {
                    success: false,
                    error: 'RETRY_LOCK_LOST: Retry lock expired or was acquired by another process.'
                };
            }

            // 6. Create child retry campaign
            const retryName = `[Retry] ${parentCampaign.name}`;
            const retryParams = {
                ...parentCampaign.campaignParams,
                campaignId: retryCampaignId,
                name: retryName,
                recipients: finalRecipientsToRetry,
                forceBroadcast: true // Force retry for these specific failed targets
            };

            await this.initCampaign({
                campaignId: retryCampaignId,
                name: retryName,
                dealId: parentCampaign.dealId,
                dealIds: parentCampaign.dealIds,
                dealTitle: parentCampaign.dealTitle,
                totalRecipients: finalRecipientsToRetry.length,
                channels: parentCampaign.channels,
                isBaileys: parentCampaign.isBaileys,
                provider: parentCampaign.provider,
                campaignParams: retryParams,
                performedBy
            });

            // Verify lock ownership before parent audit log mutation
            if (!await verifyLockOwnership()) {
                // Rollback claims and fail child campaign
                await MarketingDelivery.updateMany(
                    { jobId: campaignId, retryCampaignId },
                    { $set: { retryClaimed: false }, $unset: { retryCampaignId: 1 } }
                );
                await BroadcastCampaign.updateOne(
                    { campaignId: retryCampaignId },
                    { $set: { status: 'FAILED' } }
                );
                return {
                    success: false,
                    error: 'RETRY_LOCK_LOST: Retry lock expired before audit log mutation.'
                };
            }

            // Record audit in parent campaign
            await BroadcastCampaign.updateOne(
                { campaignId },
                {
                    $push: {
                        auditLog: {
                            action: 'RETRY_INITIATED',
                            performedBy,
                            timestamp: new Date(),
                            reason: `Spawned retry campaign ${retryCampaignId} for ${finalRecipientsToRetry.length} failed recipients (unknown: ${unknownStatusCount})`
                        }
                    }
                }
            );

            // Verify lock ownership before BullMQ queue insertion
            if (!await verifyLockOwnership()) {
                // Rollback claims and fail child campaign
                await MarketingDelivery.updateMany(
                    { jobId: campaignId, retryCampaignId },
                    { $set: { retryClaimed: false }, $unset: { retryCampaignId: 1 } }
                );
                await BroadcastCampaign.updateOne(
                    { campaignId: retryCampaignId },
                    { $set: { status: 'FAILED' } }
                );
                return {
                    success: false,
                    error: 'RETRY_LOCK_LOST: Retry lock expired before queue enqueue.'
                };
            }

            // 7. Enqueue child retry campaign to marketingQueue with rollback protection
            if (marketingQueue) {
                try {
                    await marketingQueue.add('bna-broadcast', retryParams, { removeOnComplete: true });
                } catch (queueErr) {
                    // ROLLBACK: Revert claims in MarketingDelivery and mark child campaign FAILED
                    await MarketingDelivery.updateMany(
                        { jobId: campaignId, retryCampaignId },
                        { $set: { retryClaimed: false }, $unset: { retryCampaignId: 1 } }
                    );
                    await BroadcastCampaign.updateOne(
                        { campaignId: retryCampaignId },
                        {
                            $set: { status: 'FAILED' },
                            $push: {
                                auditLog: {
                                    action: 'CANCELLED',
                                    performedBy: 'System',
                                    timestamp: new Date(),
                                    reason: `Queue enqueue failed: ${queueErr.message}. Recipient claims rolled back.`
                                }
                            }
                        }
                    );
                    throw new Error(`QUEUE_ENQUEUE_FAILED: Failed to enqueue retry campaign (${queueErr.message}). Recipient claims rolled back.`);
                }
            }

            return {
                success: true,
                message: `Retry campaign spawned for ${finalRecipientsToRetry.length} failed recipients`,
                parentCampaignId: campaignId,
                retryCampaignId,
                retryRecipientCount: finalRecipientsToRetry.length,
                unknownStatusCount,
                deliveryUnknownConservativeNotice: unknownStatusCount > 0
                    ? 'Includes DELIVERY_UNKNOWN recipients whose provider outcome was indeterminate at timeout. While retry is permitted, zero duplicate delivery cannot be guaranteed if the provider actually delivered the unconfirmed socket write.'
                    : null
            };
        } finally {
            lockState.isRenewing = false;
            clearInterval(renewTimer);
            // Ownership-safe atomic release: ONLY release if token matches lockToken!
            await BroadcastCampaign.updateOne(
                {
                    campaignId,
                    'retryLock.token': lockToken
                },
                {
                    $set: {
                        'retryLock.active': false,
                        'retryLock.lockedAt': null,
                        'retryLock.expiresAt': null,
                        'retryLock.lockedBy': null,
                        'retryLock.token': null
                    }
                }
            );
        }
    }
}

export default BroadcastLiveTracker;
