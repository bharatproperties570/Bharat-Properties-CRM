/**
 * marketingWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ Worker — processes all Marketing OS async jobs from marketingQueue.
 *
 * Supported job types:
 *   'blast'       → Multi-channel campaign broadcast (WhatsApp / Email / SMS)
 *   'drip'        → Individual drip sequence steps for leads
 *   'social-post' → AI content generation + optional social publishing
 *   'ai-generate' → Background AI content generation task
 *
 * Architecture:
 *   - Reads job type from job.name
 *   - Updates job.updateProgress() at each milestone
 *   - Logs to job.log() for BullMQ Board visibility
 *   - On failure: BullMQ retries 3× with exponential backoff (5s→25s→125s)
 */

import { Worker } from 'bullmq';
import redisConnection from '../config/redis.js';

// Lazily imported services (avoids circular deps at module load)
let whatsAppService, emailService, smsService, marketingService, nurtureBot;

const loadServices = async () => {
    if (!whatsAppService) {
        const [wa, em, sms, mkt, nb] = await Promise.all([
            import('../../services/WhatsAppService.js'),
            import('../../services/email.service.js'),
            import('../../services/SmsService.js'),
            import('../../services/MarketingService.js'),
            import('../../services/NurtureBot.js'),
        ]);
        whatsAppService  = wa.default;
        emailService     = em.default;
        smsService       = (await import('../modules/sms/sms.service.js')).default;
        marketingService = mkt.default;
        nurtureBot       = nb.default;
    }
};

// ── Job Processor ─────────────────────────────────────────────────────────────

const processMarketingJob = async (job) => {
    await loadServices();
    const { name, data } = job;
    console.log(`[MarketingWorker] ▶ Processing job: ${name} (id=${job.id})`);

    // ─── BLAST: Campaign broadcast ─────────────────────────────────────────────
    if (name === 'blast') {
        const { channel, leadIds = [], mobiles = [], emails = [], message, subject, html } = data;
        await job.log(`Starting ${channel.toUpperCase()} blast for ${leadIds.length || mobiles.length || emails.length} recipients`);

        let result = {};

        if (channel === 'wa' || channel === 'whatsapp') {
            const targets = mobiles.length > 0 ? mobiles : leadIds;
            result = await whatsAppService.broadcast(targets, message);
            await job.log(`WhatsApp: ${result.sent} sent, ${result.failed} failed`);

        } else if (channel === 'email') {
            let sent = 0, failed = 0;
            const totalEmails = emails.length || leadIds.length;
            for (let i = 0; i < emails.length; i++) {
                try {
                    await emailService.sendEmail(emails[i], subject || 'Bharat Properties Update', message, html);
                    sent++;
                } catch (err) {
                    failed++;
                    await job.log(`Email failed for ${emails[i]}: ${err.message}`);
                }
                await job.updateProgress(Math.round(((i + 1) / totalEmails) * 100));
                // Small cooldown
                await new Promise(r => setTimeout(r, 150));
            }
            result = { sent, failed };
            await job.log(`Email: ${sent} sent, ${failed} failed`);

        } else if (channel === 'sms') {
            const targets = mobiles.length > 0 ? mobiles : leadIds;
            result = await smsService.bulkSend(targets, message);
            await job.log(`SMS: ${result.sent} sent, ${result.failed} failed`);
        }

        await job.updateProgress(100);
        console.log(`[MarketingWorker] ✅ Blast complete (${channel}):`, result);
        return { channel, ...result, completedAt: new Date().toISOString() };
    }

    // ─── DRIP: Single drip sequence step ──────────────────────────────────────
    if (name === 'drip') {
        const { leadId, sequenceId, step = 1 } = data;
        await job.log(`Running drip step ${step} for lead ${leadId}, sequence: ${sequenceId}`);

        // Use NurtureBot's lead processing for each drip step
        const stepResult = await nurtureBot.processSingleLead(leadId, { step, sequenceId });

        await job.updateProgress(100);
        console.log(`[MarketingWorker] ✅ Drip step ${step} done for lead ${leadId}`);
        return { leadId, sequenceId, step, result: stepResult, completedAt: new Date().toISOString() };
    }

    // ─── SOCIAL-POST: AI generation + optional publish ────────────────────────
    if (name === 'social-post') {
        const { dealId, platform, publishNow = false } = data;
        await job.log(`Generating ${platform} post for deal ${dealId}`);

        // Lazy load Deal model
        const { default: Deal } = await import('../../models/Deal.js');
        const deal = await Deal.findById(dealId).lean();
        if (!deal) throw new Error(`Deal ${dealId} not found`);

        await job.updateProgress(25);
        const content = await marketingService.generateSocialPost(deal, platform);
        await job.log(`AI content generated (${content.length} chars)`);

        await job.updateProgress(75);

        if (publishNow) {
            // Future: call platform APIs to publish
            await job.log(`Publishing to ${platform} (not yet implemented — content saved)`);
        }

        await job.updateProgress(100);
        console.log(`[MarketingWorker] ✅ Social post generated for ${platform}`);
        return { dealId, platform, content, published: false, completedAt: new Date().toISOString() };
    }

    // ─── AI-GENERATE: Background content generation ───────────────────────────
    if (name === 'ai-generate') {
        const { prompt, provider, model, context } = data;
        await job.log(`AI generation task: provider=${provider}, model=${model}`);

        const { default: unifiedAIService } = await import('../../services/UnifiedAIService.js');
        const content = await unifiedAIService.generate(prompt, { provider });

        await job.updateProgress(100);
        console.log(`[MarketingWorker] ✅ AI generation complete (${provider})`);
        return { content, provider, model, completedAt: new Date().toISOString() };
    }

    throw new Error(`Unknown marketing job type: ${name}`);
};

// ── Worker Instance ────────────────────────────────────────────────────────────

export const marketingWorker = new Worker('marketingQueue', processMarketingJob, {
    connection: redisConnection,
    concurrency: 5,  // Process up to 5 marketing jobs in parallel
    limiter: {
        max: 20,           // Rate limit: max 20 jobs
        duration: 60000,   // Per 60 seconds (to respect API rate limits)
    },
});

marketingWorker.on('completed', (job, result) => {
    console.log(`[MarketingWorker] ✅ Job ${job.name} (${job.id}) completed:`, 
        result?.completedAt || 'done');
});

marketingWorker.on('failed', (job, err) => {
    console.error(`[MarketingWorker] ❌ Job ${job?.name} (${job?.id}) failed (attempt ${job?.attemptsMade}):`, err.message);
});

marketingWorker.on('error', (err) => {
    // Suppress Redis offline errors — queue degrades gracefully
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[MarketingWorker] Worker error:', err.message);
    }
});

console.log('✅ Marketing Worker Initialized (concurrency=5)');
