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
import mongoose from 'mongoose';
import redisConnection from '../config/redis.js';

// Lazily imported services (avoids circular deps at module load)
let whatsAppService, emailService, smsService, marketingService, nurtureBot;

const loadServices = async () => {
    if (!whatsAppService) {
        const [wa, em, mkt, nb] = await Promise.all([
            import('../../services/WhatsAppService.js'),
            import('../../services/email.service.js'),
            import('../../services/MarketingService.js'),
            import('../../services/NurtureBot.js')
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
        const { channel, leadIds = [], mobiles = [], emails = [], message, subject, html, smsData, leads = [] } = data;
        await job.log(`Starting ${channel.toUpperCase()} blast for ${leads.length || mobiles.length || emails.length} recipients`);

        const { default: Activity } = await import('../../models/Activity.js');
        const { default: VariableResolutionService } = await import('../../services/VariableResolutionService.js');
        const { waMapping } = data;

        let sent = 0, failed = 0;

        // Unified Processing Loop
        for (let i = 0; i < leads.length; i++) {
            const recipient = leads[i]; // Standardized recipient from MarketingAudienceService
            const targetMobile = recipient.mobile;
            const targetEmail = recipient.email;

            // 1. Resolve Variables
            let resolvedMessage = message || '';
            let resolvedSubject = subject || '';
            let recipientParams = {};

            if (waMapping && Object.keys(waMapping).length > 0) {
                // If we have a mapping, use the Enterprise Variable Registry
                const resolutionContext = { ...recipient, ...recipient.context };
                recipientParams = VariableResolutionService.resolveForLeads(resolutionContext, waMapping);
            } else {
                // Legacy / Simple replacement
                const rName = recipient.name || 'Customer';
                resolvedMessage = (message || '').replace(/{{name}}/g, rName).replace(/{{firstName}}/g, rName.split(' ')[0]);
                resolvedSubject = (subject || '').replace(/{{name}}/g, rName);
            }

            try {
                let success = false;
                let messageId = null;

                if (channel === 'wa' || channel === 'whatsapp') {
                    const { templateName, templateLang = 'en' } = data;
                    if (templateName) {
                        const { templateComponents = [] } = data;
                        let finalComponents = [];

                        // Smart Component Construction (Header / Body / Buttons)
                        templateComponents.forEach(comp => {
                            const type = comp.type?.toLowerCase();
                            if (!type) return;

                            // Find variables in this specific component's text
                            const compText = comp.text || '';
                            const matches = compText.match(/{{(\d+)}}/g);
                            
                            if (matches) {
                                // Extract indices and SORT them numerically to match Meta's expected order
                                const indices = [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
                                    .sort((a, b) => parseInt(a) - parseInt(b));

                                const parameters = indices.map(idx => {
                                    const val = recipientParams[idx];
                                    // Fallback to avoid "Required parameter is missing" rejections by Meta
                                    const cleanedVal = (val === undefined || val === null || String(val) === 'undefined' || String(val).trim() === '') 
                                        ? '—' 
                                        : String(val);
                                    
                                    return { type: 'text', text: cleanedVal };
                                });

                                if (parameters.length > 0) {
                                    finalComponents.push({ type, parameters });
                                }
                            }
                        });

                        const res = await whatsAppService.sendTemplate(targetMobile, templateName, templateLang, finalComponents);
                        success = res.success;
                        messageId = res.messageId;
                        if (!success) recipient.error = res.error;
                    } else {
                        // Standardize on sendMessage for plain text dispatches
                        const res = await whatsAppService.sendMessage(targetMobile, resolvedMessage);
                        success = res.success;
                        messageId = res.messageId;
                        if (!success) recipient.error = res.error;
                    }
                } else if (channel === 'email') {
                    if (targetEmail) {
                        try {
                            await emailService.sendEmail(targetEmail, resolvedSubject || 'Bharat Properties Update', resolvedMessage, html);
                            success = true;
                        } catch (emErr) {
                            success = false;
                            recipient.error = emErr.message;
                        }
                    } else {
                        success = false;
                        recipient.error = 'No email address found';
                    }
                } else if (channel === 'sms') {
                    if (targetMobile) {
                        const { templateName } = data;
                        if (templateName) {
                            // Professional Template Dispatch with DLT support
                            const res = await smsService.sendSMSWithTemplate(targetMobile, templateName, recipientParams, {
                                entityType: recipient.context?.originalType || 'Lead',
                                entityId: recipient.id,
                                dltHeaderId: smsData?.dltHeaderId,
                                dltTemplateId: smsData?.dltTemplateId,
                                category: smsData?.category || 'Transactional'
                            });
                            success = res.success;
                            messageId = res.providerId || res.data?.MessageId || (res.data?.JobId ? String(res.data.JobId) : null);
                            if (!success) recipient.error = res.error;
                        } else {
                            // Direct text (DLT fallback may be needed at provider level)
                            const res = await smsService.sendSMS(targetMobile, resolvedMessage, {
                                entityType: recipient.context?.originalType || 'Lead',
                                entityId: recipient.id,
                                dltHeaderId: smsData?.dltHeaderId,
                                dltTemplateId: smsData?.dltTemplateId,
                                category: smsData?.category || 'Transactional'
                            });
                            success = res.success;
                            messageId = res.providerId || res.data?.MessageId || (res.data?.JobId ? String(res.data.JobId) : null);
                            if (!success) recipient.error = res.error;
                        }
                    } else {
                        success = false;
                        recipient.error = 'No mobile number found';
                    }
                }

                const isImport = recipient.context?.originalType === 'Import' || String(recipient.id).startsWith('imp-');
                
                let status = success ? 'Sent' : 'Failed';
                let description = success 
                    ? `Sent via ${channel.toUpperCase()}\nMessage: ${resolvedMessage.substring(0, 100)}...`
                    : `Failed via ${channel.toUpperCase()}\nReason: ${recipient.error || 'Provider rejected dispatch'}`;

                if (success) sent++; else failed++;

                // 2. LOG ACTIVITY (The Pulse) 
                // 🧠 SENIOR PROFESSIONAL FIX: Log activities for ALL recipients (including imports)
                // so they appear in the Performance Reports.
                try {
                    await Activity.create({
                        type: 'Marketing',
                        subject: `${channel.toUpperCase()} Campaign: ${data.name || 'Broadcast'}`,
                        entityType: recipient.context?.originalType || 'Lead',
                        // Handle imports (non-mongo IDs) gracefully
                        entityId: mongoose.Types.ObjectId.isValid(recipient.id) ? recipient.id : null,
                        description: description,
                        status: status,
                        performedBy: 'Marketing Engine',
                        details: { 
                            channel, 
                            campaignName: data.name, 
                            jobId: job.id, 
                            msgId: messageId,
                            error: !success ? (recipient.error || 'Unknown Provider Error') : null
                        },
                        dueDate: new Date()
                    });
                } catch (actErr) {
                    await job.log(`Activity Log Warning for ${recipient.name}: ${actErr.message}`);
                }

                if (!success) {
                    await job.log(`Dispatch FAILED for ${recipient.name} (${targetMobile || targetEmail}): ${recipient.error || 'Unknown Error'}`);
                } else {
                    await job.log(`Dispatch SUCCESS for ${recipient.name} (${targetMobile || targetEmail})`);
                }
            } catch (err) {
                failed++;
                await job.log(`Worker EXCEPTION for ${recipient.name} (${targetMobile || targetEmail}): ${err.message}`);
                
                // 🧠 SENIOR PROFESSIONAL FIX: Log failures even for imports
                try {
                    await Activity.create({
                        type: 'Marketing',
                        subject: `${channel.toUpperCase()} Campaign: ${data.name || 'Broadcast'}`,
                        entityType: recipient.context?.originalType || 'Lead',
                        entityId: mongoose.Types.ObjectId.isValid(recipient.id) ? recipient.id : null,
                        description: `System Error: ${err.message}`,
                        status: 'Failed',
                        performedBy: 'Marketing Engine',
                        details: { channel, jobId: job.id, error: err.message },
                        dueDate: new Date()
                    });
                } catch (actErr) {
                    await job.log(`Critical: Failed to log failure activity: ${actErr.message}`);
                }
            }

            await job.updateProgress(Math.round(((i + 1) / leads.length) * 100));
            // Adaptive cooldown to respect provider limits
            await new Promise(r => setTimeout(r, channel === 'wa' ? 300 : 150));
        }

        const result = { sent, failed };
        await job.log(`${channel.toUpperCase()} Blast Complete: ${sent} sent, ${failed} failed`);
        return { ...result, completedAt: new Date().toISOString() };
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

    // ─── LINKEDIN-LEAD-SYNC: Background sync ──────────────────────────────
    if (name === 'linkedin-lead-sync') {
        const { default: leadSyncService } = await import('../../services/LinkedInLeadSyncService.js');
        await job.log('Starting LinkedIn lead sync...');
        
        const count = await leadSyncService.syncAllLeads();
        
        await job.updateProgress(100);
        await job.log(`Sync complete. ${count} leads processed.`);
        return { synced: count, completedAt: new Date().toISOString() };
    }

    // ─── SCHEDULED-SOCIAL-DISPATCH: Actual publishing of a pre-prepared post ─
    if (name === 'scheduled-social-dispatch') {
        const { platform, text, imageUrl, format, entityId, entityType } = data;
        await job.log(`Dispatching scheduled ${platform} post for ${entityType} ${entityId}`);

        const { default: fbService } = await import('../../services/FacebookService.js');
        const { default: liService } = await import('../../services/LinkedInService.js');
        const { default: Activity } = await import('../../models/Activity.js');

        let result;
        const targetPlatform = platform.toLowerCase();

        try {
            if (targetPlatform === 'facebook') {
                result = await fbService.postToPage(text, imageUrl, format);
            } else if (targetPlatform === 'instagram') {
                result = await fbService.postToInstagram(text, imageUrl, format);
            } else if (targetPlatform === 'linkedin') {
                // For LinkedIn, we assume image and other assets are already handled or not required for basic scheduled post
                result = await liService.postToOrganization(text, null, null);
            } else {
                await job.log(`Warning: ${targetPlatform} dispatch is mock-only`);
                result = { success: true, id: `mock_${Date.now()}` };
            }

            // Log as Activity for Timeline visibility
            await Activity.create({
                type: 'Social Post',
                subject: `Scheduled Share to ${platform}`,
                entityType: entityType || 'System',
                entityId: entityId || null,
                description: text,
                status: 'Completed',
                performedBy: 'CRM Scheduler',
                details: {
                    platform: targetPlatform,
                    format: format,
                    imageUrl: imageUrl,
                    dispatchedAt: new Date(),
                    jobId: job.id
                },
                dueDate: new Date()
            });

            await job.updateProgress(100);
            await job.log(`✅ ${platform} Post Successful! ID: ${result.postId || result.id}`);
            return { ...result, completedAt: new Date().toISOString() };
        } catch (err) {
            await job.log(`❌ ${platform} Post Failed: ${err.message}`);
            throw err; // Rethrow to let BullMQ handle retries
        }
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
