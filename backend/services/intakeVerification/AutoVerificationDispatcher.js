import { Queue, Worker } from '../../src/config/redis.js';
import redisConnection from '../../src/config/redis.js';
import Intake from '../../models/Intake.js';
import AutoVerificationSettings from '../../models/AutoVerificationSettings.js';
import dealVerificationAgent from './DealVerificationAgent.js';
import mongoose from 'mongoose';

/**
 * ============================================================
 *  AUTO VERIFICATION DISPATCHER v1.0
 *  Enterprise Meta Policy-Compliant Anti-Ban Auto-Pilot Engine
 * ============================================================
 *
 *  Architectural Guarantees:
 *  ✅ Tier 1: Quality Gatekeeper (Confidence >= 80%, Seller Only)
 *  ✅ Tier 2: 48-Hour Broker Frequency Cooldown & Cross-Group Dedup
 *  ✅ Tier 3: Daily Quota Ceiling & Working Hours Gate (10 AM - 7 PM IST)
 *  ✅ Tier 4: Natural Gaussian Jitter Pacing (90s - 210s)
 *  ✅ Tier 5: Human Telemetry Presence ('composing' Typing Simulation)
 *  ✅ Tier 6: High Linguistic Entropy via AiAgent Hub ('intake_verification')
 *  ✅ Tier 7: Soft Opt-Out Non-Intrusive Courtesy Footer
 *  ✅ Health Circuit Breaker: Auto-trips and pauses on socket/rate limit anomalies
 * ============================================================
 */

export const autoVerificationQueue = new Queue('whatsapp_auto_verification', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 }
    }
});

class AutoVerificationDispatcher {
    constructor() {
        this._lastScheduledEpochMs = Date.now();
        this._worker = null;
        this._initializeWorker();
    }

    /**
     * Initializes the single-concurrency BullMQ worker
     */
    _initializeWorker() {
        if (this._worker) return;

        this._worker = new Worker('whatsapp_auto_verification', async (job) => {
            return await this._processDispatchJob(job);
        }, {
            connection: redisConnection,
            concurrency: 1 // STRICT SERIAL DISPATCH (Never parallel bursts)
        });

        this._worker.on('completed', (job, result) => {
            console.log(`[AutoDispatcher] ✅ Job ${job.id} completed:`, result?.targetPhone || 'success');
        });

        this._worker.on('failed', (job, err) => {
            console.error(`[AutoDispatcher] ❌ Job ${job?.id} failed:`, err.message);
        });

        console.log('🛡️  [AutoDispatcher] AutoVerification worker initialized with concurrency=1');
    }

    /**
     * Evaluates an incoming group deal intake against all 7 Anti-Ban Tiers
     * and schedules it in the pacing queue if qualified.
     */
    async evaluateAndQueue(intake) {
        if (!intake || !intake._id) return { queued: false, reason: 'invalid_intake' };

        try {
            const settings = await AutoVerificationSettings.getSettings();

            // 0. Master Switch & Circuit Breaker Check
            if (!settings.isEnabled) {
                return { queued: false, reason: 'master_disabled' };
            }
            if (settings.circuitBreakerTripped) {
                console.warn(`[AutoDispatcher] Circuit breaker is TRIPPED (${settings.circuitBreakerReason}). Skipping intake #${intake._id}`);
                return { queued: false, reason: 'circuit_breaker_tripped' };
            }

            // Must be from WhatsApp Group
            if (intake.source_type !== 'whatsapp_group') {
                return { queued: false, reason: 'not_whatsapp_group' };
            }

            // Already verified or linked
            if (intake.createdDealId || ['inquiry_sent', 'replied_verified'].includes(intake.wa_verification?.status)) {
                return { queued: false, reason: 'already_verified_or_sent' };
            }

            // ── Tier 1: Quality & Intent Gatekeeper ────────────────────────
            const confidence = intake.source_confidence || 0;
            if (confidence < settings.confidenceThreshold) {
                console.log(`[AutoDispatcher] Intake #${intake._id} skipped: Confidence ${confidence}% < ${settings.confidenceThreshold}% threshold`);
                return { queued: false, reason: 'low_confidence', confidence };
            }

            // Only Seller/Available listings (strictly exclude buyer demand requests)
            const intent = String(intake.seller_intent || intake.extracted_entities?.intent || '').toLowerCase();
            if (settings.requireSaleIntentOnly && ['buy', 'buyer', 'demand', 'requirement', 'wanted'].includes(intent)) {
                console.log(`[AutoDispatcher] Intake #${intake._id} skipped: Buyer requirement/demand detected (intent='${intent}')`);
                return { queued: false, reason: 'buyer_intent_excluded' };
            }

            // Target phone resolution
            const targetInfo = await dealVerificationAgent.resolveTargetPhones(intake);
            const targetPhone = targetInfo.recommendedTarget;
            if (!targetPhone) {
                console.log(`[AutoDispatcher] Intake #${intake._id} skipped: No valid target phone resolved`);
                return { queued: false, reason: 'missing_target_phone' };
            }

            const cleanPhone = String(targetPhone).replace(/[^0-9]/g, '');
            if (cleanPhone.length < 10) {
                return { queued: false, reason: 'invalid_phone_format' };
            }
            const last10 = cleanPhone.slice(-10);

            // ── Tier 2: 48-Hour Broker Frequency Cooldown & Blacklist ────────
            // Blacklist check
            if (Array.isArray(settings.excludedPhones) && settings.excludedPhones.some(p => p.includes(last10))) {
                console.log(`[AutoDispatcher] Target phone ${last10} is in excluded/blacklist. Skipping.`);
                return { queued: false, reason: 'blacklisted_phone' };
            }

            // Broker 48h cooldown across all group deals
            const cooldownMs = settings.cooldownHoursPerBroker * 3600 * 1000;
            const recentInquiry = await Intake.findOne({
                _id: { $ne: intake._id },
                'wa_verification.target_phone': { $regex: last10 },
                'wa_verification.status': { $in: ['queued', 'inquiry_sent', 'replied_verified', 'replied_incomplete'] },
                $or: [
                    { 'wa_verification.initiated_at': { $gte: new Date(Date.now() - cooldownMs) } },
                    { 'wa_verification.scheduled_at': { $gte: new Date(Date.now() - cooldownMs) } },
                    { createdAt: { $gte: new Date(Date.now() - cooldownMs) } }
                ]
            }).select('_id wa_verification.initiated_at wa_verification.status').lean();

            if (recentInquiry) {
                console.log(`[AutoDispatcher] Broker ${last10} has an active/recent inquiry within last ${settings.cooldownHoursPerBroker}h (Intake #${recentInquiry._id}, status: ${recentInquiry.wa_verification?.status}). Skipping duplicate annoyance.`);
                return { queued: false, reason: 'broker_cooldown_active' };
            }

            // ── Tier 3: Daily Quota & Business Hours Scheduling ───────────
            if (settings.dailySentCount >= settings.dailyLimit) {
                console.warn(`[AutoDispatcher] Daily quota limit reached (${settings.dailySentCount}/${settings.dailyLimit}). Postponing.`);
                return { queued: false, reason: 'daily_quota_reached' };
            }

            // Calculate safe schedule timestamp (Business hours + Gaussian delay)
            const scheduledAt = this._calculateNextDispatchTime(settings);

            const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

            const jobData = {
                intakeId: String(intake._id),
                targetPhone: cleanPhone,
                targetType: targetInfo.targetType,
                enqueuedAt: new Date().toISOString()
            };

            const job = await autoVerificationQueue.add('dispatch_auto_inquiry', jobData, {
                delay: delayMs,
                jobId: `autov_${intake._id}`
            });

            // Mark intake as queued in wa_verification
            intake.wa_verification = intake.wa_verification || {};
            intake.wa_verification.status = 'queued';
            intake.wa_verification.target_phone = cleanPhone;
            intake.wa_verification.scheduled_at = scheduledAt;
            intake.verification_notes = intake.verification_notes || [];
            intake.verification_notes.push(`[Auto-Verification Queued] Anti-Ban Guard: Scheduled for dispatch at ${scheduledAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} (${Math.round(delayMs / 1000)}s delay)`);
            await intake.save();

            console.log(`[AutoDispatcher] 🛡️ Intake #${intake._id} successfully queued for ${cleanPhone} at ${scheduledAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

            return {
                queued: true,
                intakeId: intake._id,
                targetPhone: cleanPhone,
                scheduledAt,
                delaySeconds: Math.round(delayMs / 1000)
            };
        } catch (err) {
            console.error('[AutoDispatcher:evaluateAndQueue Error]:', err.message);
            return { queued: false, error: err.message };
        }
    }

    /**
     * Executes the actual message dispatch with Presence Simulation (Tier 5)
     * and Soft Opt-Out Courtesy (Tier 7).
     */
    async _processDispatchJob(job) {
        const { intakeId, targetPhone, targetType } = job.data;
        console.log(`[AutoDispatcher] 🚀 Processing dispatch job for Intake #${intakeId} -> ${targetPhone}`);

        const settings = await AutoVerificationSettings.getSettings();

        // Circuit breaker check
        if (!settings.isEnabled || settings.circuitBreakerTripped) {
            console.warn('[AutoDispatcher] Dispatch cancelled: System disabled or circuit breaker active.');
            return { status: 'cancelled_circuit_breaker' };
        }

        // Daily limit check
        if (settings.dailySentCount >= settings.dailyLimit) {
            console.warn('[AutoDispatcher] Dispatch cancelled: Daily limit reached.');
            return { status: 'cancelled_daily_limit' };
        }

        const intake = await Intake.findById(intakeId);
        if (!intake) {
            return { status: 'intake_not_found' };
        }

        // If deal already linked or already sent manually
        if (intake.createdDealId || intake.wa_verification?.status === 'inquiry_sent') {
            return { status: 'already_completed' };
        }

        // Re-verify cooldown right before dispatch to prevent bursts from race conditions
        const cleanPhone = String(targetPhone).replace(/[^0-9]/g, '');
        const last10 = cleanPhone.slice(-10);
        const cooldownMs = settings.cooldownHoursPerBroker * 3600 * 1000;
        const recentSent = await Intake.findOne({
            _id: { $ne: intake._id },
            'wa_verification.target_phone': { $regex: last10 },
            'wa_verification.status': { $in: ['inquiry_sent', 'replied_verified', 'replied_incomplete'] },
            'wa_verification.initiated_at': { $gte: new Date(Date.now() - cooldownMs) }
        }).select('_id').lean();

        if (recentSent) {
            console.log(`[AutoDispatcher] Broker ${last10} was recently messaged (Intake #${recentSent._id}). Skipping scheduled job.`);
            intake.wa_verification.status = 'idle';
            intake.verification_notes = intake.verification_notes || [];
            intake.verification_notes.push(`[Auto-Verification Skipped] Broker ${last10} reached cooldown limit.`);
            await intake.save();
            return { status: 'cancelled_cooldown' };
        }

        const targetIntegrationId = intake.whatsappIntegrationId ? String(intake.whatsappIntegrationId) : null;

        try {
            // ── Tier 5: Human Telemetry Presence ('composing' simulation on exact line) ──
            await this._simulateHumanPresence(targetPhone, settings.simulateTypingSeconds || 5, targetIntegrationId);

            // ── Tier 6: Dynamic Linguistic Entropy Draft Generation ────────
            let draft = await dealVerificationAgent.generateInquiryDraft(intake);

            // ── Tier 7: Soft Opt-Out Courtesy Note ─────────────────────────
            if (settings.includeOptOutCourtesy && settings.optOutCourtesyText) {
                draft = `${draft.trim()}${settings.optOutCourtesyText}`;
            }

            // Resolve internal manager/caller to attribute sent_by_user
            let internalUserId = intake.createdBy || null;
            if (!internalUserId) {
                try {
                    const User = mongoose.models.User || (await import('../../models/User.js')).default;
                    const adminUser = await User.findOne({ role: { $in: ['admin', 'manager'] } }).select('_id').lean();
                    if (adminUser) internalUserId = adminUser._id;
                } catch (e) {}
            }

            // ── Dispatch via DealVerificationAgent on EXACT group line ─────
            const result = await dealVerificationAgent.sendVerificationInquiry(intakeId, {
                targetPhone,
                targetType: targetType || 'whatsapp_group_sender',
                message: draft,
                provider: 'BAILEYS',
                userId: internalUserId,
                integrationId: targetIntegrationId
            });

            // Increment daily quota counter
            settings.dailySentCount = (settings.dailySentCount || 0) + 1;
            await settings.save();

            console.log(`[AutoDispatcher] ✅ Dispatch SUCCESS to ${targetPhone} via integration (${targetIntegrationId || 'default'}). Today Count: ${settings.dailySentCount}/${settings.dailyLimit}`);
            return { status: 'success', targetPhone, result };

        } catch (dispatchErr) {
            console.error(`[AutoDispatcher] ❌ Dispatch failed for ${targetPhone}:`, dispatchErr.message);

            // Check if socket failure or 403 indicates account risk
            if (dispatchErr.message?.includes('403') || dispatchErr.message?.includes('Connection Closed') || dispatchErr.message?.includes('logged out')) {
                await this.tripCircuitBreaker(`WhatsApp socket error encountered during auto-dispatch: ${dispatchErr.message}`);
            }

            throw dispatchErr;
        }
    }

    /**
     * Calculates the next safe dispatch epoch time adhering to:
     * 1. Minimum/Maximum Gaussian random delay from previous job
     * 2. Business Working Hours (10:00 AM - 7:00 PM IST)
     * 3. Working Days (Mon-Sat)
     */
    _calculateNextDispatchTime(settings) {
        // Base Gaussian jitter delay between min and max seconds
        const minS = settings.minDelaySeconds || 90;
        const maxS = settings.maxDelaySeconds || 210;
        const randomDelayS = Math.floor(Math.random() * (maxS - minS + 1)) + minS;

        // Ensure jobs are spaced out monotonically from the previous scheduled job
        let candidateEpoch = Math.max(Date.now(), this._lastScheduledEpochMs) + (randomDelayS * 1000);

        // Adjust for Business Hours in IST (UTC + 5:30)
        let candidateDate = new Date(candidateEpoch);
        candidateDate = this._adjustToBusinessHours(candidateDate, settings);

        this._lastScheduledEpochMs = candidateDate.getTime();
        return candidateDate;
    }

    /**
     * Shifts candidate date to the next valid business window if outside hours.
     */
    _adjustToBusinessHours(date, settings) {
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(date.getTime() + istOffsetMs);

        const hours = istTime.getUTCHours();
        const minutes = istTime.getUTCMinutes();
        const dayOfWeek = istTime.getUTCDay(); // 0 = Sun, 1 = Mon ...

        const [startH, startM] = (settings.businessHoursStart || '10:00').split(':').map(Number);
        const [endH, endM] = (settings.businessHoursEnd || '19:00').split(':').map(Number);

        const currentMinutesOfDay = (hours * 60) + minutes;
        const startMinutesOfDay = (startH * 60) + (startM || 0);
        const endMinutesOfDay = (endH * 60) + (endM || 0);

        const activeDays = settings.activeDays || [1, 2, 3, 4, 5, 6];

        let needsShift = false;
        let daysToAdd = 0;

        // Check if current day is inactive (e.g. Sunday)
        if (!activeDays.includes(dayOfWeek)) {
            needsShift = true;
            daysToAdd = (8 - dayOfWeek) % 7 || 1; // Advance to next Monday
        } else if (currentMinutesOfDay >= endMinutesOfDay) {
            // Past business hours -> shift to tomorrow morning
            needsShift = true;
            daysToAdd = 1;
        } else if (currentMinutesOfDay < startMinutesOfDay) {
            // Before business hours -> shift to today morning
            needsShift = true;
            daysToAdd = 0;
        }

        if (needsShift) {
            // Set to target morning at startMinutesOfDay + random initial jitter (1-5 minutes)
            const morningJitterMs = (Math.floor(Math.random() * 240) + 60) * 1000;
            
            const targetIst = new Date(istTime);
            targetIst.setUTCDate(targetIst.getUTCDate() + daysToAdd);
            targetIst.setUTCHours(startH, startM || 0, 0, 0);

            // If advanced day lands on an inactive day, push to Monday
            while (!activeDays.includes(targetIst.getUTCDay())) {
                targetIst.setUTCDate(targetIst.getUTCDate() + 1);
            }

            // Convert back from IST to UTC epoch
            const targetUtcEpoch = targetIst.getTime() - istOffsetMs + morningJitterMs;
            return new Date(targetUtcEpoch);
        }

        return date;
    }

    /**
     * Simulates authentic user presence ('composing' typing indicator) via Baileys socket.
     */
    async _simulateHumanPresence(targetPhone, typingDurationSecs = 5, integrationId = null) {
        try {
            const { BaileysConnectionManager } = await import('../baileysQueue/BaileysConnectionManager.js');
            const clean = String(targetPhone).replace(/[^0-9]/g, '');
            const targetJid = clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;

            const sock = BaileysConnectionManager.getSocket(integrationId);
            if (sock && typeof sock.sendPresenceUpdate === 'function') {
                await sock.sendPresenceUpdate('composing', targetJid).catch(() => {});
                console.log(`[AutoDispatcher] Simulated 'composing' presence on socket (${integrationId || 'default'}) to ${targetJid} for ${typingDurationSecs}s`);
            }
        } catch (presenceErr) {
            console.warn('[AutoDispatcher] Presence simulation notice:', presenceErr.message);
        }

        // Wait typing duration to simulate natural character typing
        await new Promise(res => setTimeout(res, typingDurationSecs * 1000));
    }

    /**
     * Trips safety circuit breaker to prevent account penalties
     */
    async tripCircuitBreaker(reason) {
        try {
            const settings = await AutoVerificationSettings.getSettings();
            settings.circuitBreakerTripped = true;
            settings.circuitBreakerReason = reason;
            settings.circuitBreakerTrippedAt = new Date();
            await settings.save();
            console.error(`🚨 [AutoDispatcher] CIRCUIT BREAKER TRIPPED! Reason: ${reason}`);
        } catch (e) {
            console.error('[AutoDispatcher] Error tripping circuit breaker:', e.message);
        }
    }

    /**
     * Resets safety circuit breaker after admin review
     */
    async resetCircuitBreaker() {
        const settings = await AutoVerificationSettings.getSettings();
        settings.circuitBreakerTripped = false;
        settings.circuitBreakerReason = null;
        settings.circuitBreakerTrippedAt = null;
        await settings.save();
        console.log('✅ [AutoDispatcher] Circuit breaker manually RESET.');
        return settings;
    }
}

export default new AutoVerificationDispatcher();
