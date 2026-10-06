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

import { Worker } from '../config/redis.js';
import mongoose from 'mongoose';
import redisConnection from '../config/redis.js';
import { writeFailedJobLog } from '../utils/failedJobLogger.js';
import piiSanitizer from '../utils/piiSanitizer.js';
import crypto from 'crypto';
import MarketingDelivery from '../../models/MarketingDelivery.js';

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

        const acquireClaim = async (jobId, recipientId, channel, campaignRunId = null) => {
            if (!recipientId) return false;
            try {
                await MarketingDelivery.create({
                    jobId, recipientId: String(recipientId), channel, campaignRunId, status: 'IN_PROGRESS', lastAttemptAt: new Date(), attempts: 1
                });
                return true;
            } catch (err) {
                if (err.code !== 11000) throw err;
                
                const existing = await MarketingDelivery.findOne({ jobId, recipientId: String(recipientId), channel });
                if (!existing) return true; // Edge case
                if (existing.status === 'SENT' || existing.status === 'FAILED_FINAL') return false;
                
                if (existing.status === 'FAILED_RETRYABLE' || 
                   (existing.status === 'IN_PROGRESS' && Date.now() - existing.lastAttemptAt.getTime() > 5 * 60000)) {
                    
                    const updated = await MarketingDelivery.findOneAndUpdate(
                        { _id: existing._id, status: existing.status, lastAttemptAt: existing.lastAttemptAt },
                        { $set: { status: 'IN_PROGRESS', lastAttemptAt: new Date() }, $inc: { attempts: 1 } },
                        { new: true }
                    );
                    return !!updated;
                }
                return false;
            }
        };

        const releaseClaim = async (jobId, recipientId, channel, success, error, messageId) => {
            if (!recipientId) return;
            try {
                await MarketingDelivery.findOneAndUpdate(
                    { jobId, recipientId: String(recipientId), channel },
                    {
                        $set: {
                            status: success ? 'SENT' : 'FAILED_RETRYABLE',
                            providerMessageId: messageId,
                            error: !success ? (error ? piiSanitizer.sanitizeError(error) : null) : null,
                            lastAttemptAt: new Date()
                        }
                    }
                );
            } catch (err) {
                console.error('Failed to release claim:', err);
            }
        };


export const processMarketingJob = async (job) => {
    await loadServices();
    
    const { name, data } = job;
    
    if (!data.campaignRunId) {
        throw new Error('No campaignRunId provided in job data.');
    }
    
    const CampaignRun = mongoose.model('CampaignRun');
    const runCheck = await CampaignRun.findById(data.campaignRunId);
    if (!runCheck) {
        throw new Error(`CampaignRun not found: ${data.campaignRunId}`);
    }

    const acquiredRun = await CampaignRun.findOneAndUpdate(
        {
            _id: data.campaignRunId,
            status: { $in: ['PENDING', 'RUNNING'] },
            jobId: job.id,
            $or: [
                { 'execution.attempt': { $lt: job.attemptsMade } },
                { 'execution.jobId': { $ne: job.id } },
                { execution: { $exists: false } }
            ]
        },
        {
            $set: {
                status: 'RUNNING',
                'execution.jobId': job.id,
                'execution.attempt': job.attemptsMade,
                'execution.ownerState': 'ACTIVE',
                'execution.startedAt': new Date(),
                'execution.terminalAt': null,
                'execution.outcome': null
            }
        },
        { new: true }
    );

    if (!acquiredRun) {
        throw new Error(`Execution ownership acquisition failed for CampaignRun ${data.campaignRunId}, Job ${job.id}, Attempt ${job.attemptsMade}`);
    }

    console.log(`[MarketingWorker] ▶ Processing job: ${name} (id=${job.id})`);

    // ─── BLAST: Campaign broadcast ─────────────────────────────────────────────
    if (name === 'blast') {
        const { channel, leadIds = [], mobiles = [], emails = [], message, subject, html, smsData, leads = [], campaignRunId } = data;
        await job.log(`Starting ${channel.toUpperCase()} blast for ${leads.length || mobiles.length || emails.length} recipients`);

        const { default: Activity } = await import('../../models/Activity.js');
        const { default: VariableResolutionService } = await import('../../services/VariableResolutionService.js');
        const { waMapping } = data;

        let sent = 0, failed = 0, skipped = 0;

        // Unified Processing Loop
        for (let i = 0; i < leads.length; i++) {
            const recipient = leads[i]; // Standardized recipient from MarketingAudienceService
            const targetMobile = recipient.mobile;
            const targetEmail = recipient.email;

            // 🛡️ DURABLE PRE-DISPATCH ATOMIC CLAIM
            const claimed = await acquireClaim(job.id, recipient.id, channel, campaignRunId);
            if (!claimed) {
                skipped++;
                continue;
            }

            // 1. Resolve Variables
            let resolvedMessage = message || '';
            let resolvedSubject = subject || '';
            let recipientParams = {};

            const resolutionContext = { ...recipient, ...recipient.context };

            if (waMapping && Object.keys(waMapping).length > 0) {
                // If we have a mapping, use the Enterprise Variable Registry
                recipientParams = VariableResolutionService.resolveForLeads(resolutionContext, waMapping);
            }

            // Universal Variable Resolution for text (important for SMS & Email)
            const resolutionData = { 
                name: recipient.name || 'Customer', 
                firstName: (recipient.name || 'Customer').split(' ')[0],
                email: recipient.email || '',
                mobile: recipient.mobile || '',
                ...resolutionContext
            };

            // Replace both {{var}} and {#var#} formats (SmartPing/DLT compliant)
            Object.entries(resolutionData).forEach(([key, val]) => {
                const safeVal = String(val || '');
                const regexes = [
                    new RegExp(`\\{\\{${key}\\}\\}`, 'gi'),
                    new RegExp(`\\{#${key}#\\}`, 'gi'),
                    new RegExp(`\\[${key}\\]`, 'gi')
                ];
                regexes.forEach(re => {
                    resolvedMessage = resolvedMessage.replace(re, safeVal);
                    resolvedSubject = resolvedSubject.replace(re, safeVal);
                });
            });

            // Cleanup any remaining placeholders to prevent DLT rejection
            resolvedMessage = resolvedMessage.replace(/\{\{.*?\}\}/g, '').replace(/\{#.*?#\}/g, '');

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

                            // Find variables in this specific component's text (if text provided)
                            const compText = comp.text || '';
                            const matches = compText.match(/{{(\d+)}}/g);
                            
                            let indices = [];
                            if (matches) {
                                // Extract indices from text
                                const found = [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
                                    .map(i => parseInt(i));
                                
                                // 🧠 SENIOR PROFESSIONAL: Gap-Free Sequential Indices
                                // Meta requires parameters in order. If 1 and 3 are present, 2 must also be sent.
                                const max = found.length > 0 ? Math.max(...found) : 0;
                                for (let i = 1; i <= max; i++) indices.push(String(i));
                            } else if (type === 'body' && waMapping) {
                                // 🧠 ENTERPRISE FIX: If no text is provided but it's a BODY component,
                                // use all numeric keys from waMapping as indices, filling gaps.
                                const keys = Object.keys(waMapping)
                                    .filter(k => /^\d+$/.test(k))
                                    .map(k => parseInt(k));
                                
                                const max = keys.length > 0 ? Math.max(...keys) : 0;
                                for (let i = 1; i <= max; i++) indices.push(String(i));
                            }

                            if (indices.length > 0) {
                                const parameters = indices.map(idx => {
                                    const val = recipientParams[idx];
                                    // 🧠 SENIOR PROFESSIONAL: Safe Fallback
                                    // We use a zero-width space or em-dash to ensure the parameter is "present" for Meta
                                    const cleanedVal = (val === undefined || val === null || String(val).trim() === '' || String(val) === 'undefined') 
                                        ? '—' 
                                        : String(val);
                                    
                                    return { type: 'text', text: cleanedVal };
                                });

                                finalComponents.push({ type, parameters });
                            }
                        });

                        const idempotencyKey = crypto.createHash('sha256').update(job.id + '_' + recipient.id + '_' + channel).digest('hex');
                        const res = await whatsAppService.sendTemplate(targetMobile, templateName, templateLang, finalComponents, { idempotencyKey });
                        success = res.success;
                        messageId = res.messageId;
                        if (!success) recipient.error = res.error;
                    } else {
                        // Standardize on sendMessage for plain text dispatches
                        const idempotencyKey = crypto.createHash('sha256').update(job.id + '_' + recipient.id + '_' + channel).digest('hex');
                        const res = await whatsAppService.sendMessage(targetMobile, resolvedMessage, { idempotencyKey });
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
                            // Combine numbered params with named ones for legacy template support ({{Name}})
                            const smsVariables = { ...recipientParams, ...resolutionData };
                            const res = await smsService.sendSMSWithTemplate(targetMobile, templateName, smsVariables, {
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

                                // 🛡️ RELEASE CLAIM
                await releaseClaim(job.id, recipient.id, channel, success, recipient.error, messageId);

                // 2. LOG ACTIVITY (The Pulse)
                // 🛡️ PERSIST IDEMPOTENCY STATE
                try {
                    await MarketingDelivery.findOneAndUpdate(
                        { jobId: job.id, recipientId: String(recipient.id), channel },
                        {
                            $set: {
                                status: success ? 'SENT' : 'FAILED_RETRYABLE',
                                providerMessageId: messageId,
                                error: !success ? recipient.error : null,
                                lastAttemptAt: new Date()
                            },
                            $inc: { attempts: 1 }
                        },
                        { upsert: true }
                    );
                } catch(deliveryErr) {
                    await job.log(`Delivery state persistence warning for ${piiSanitizer.maskName(recipient.name)}: ${deliveryErr.message}`);
                }

                try {
                    await Activity.create({
                        type: 'Marketing',
                        subject: `${channel.toUpperCase()} Campaign: ${data.name || 'Broadcast'}`,
                        entityType: recipient.context?.originalType || 'Lead',
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
                    await job.log(`Activity Log Warning for ${piiSanitizer.maskName(recipient.name)}: ${actErr.message}`);
                }

                if (!success) {
                    await job.log(`Dispatch FAILED for ${piiSanitizer.maskName(recipient.name)} (${piiSanitizer.maskPhone(targetMobile) || piiSanitizer.maskEmail(targetEmail)}): ${recipient.error || 'Unknown Error'}`);
                } else {
                    await job.log(`Dispatch SUCCESS for ${piiSanitizer.maskName(recipient.name)} (${piiSanitizer.maskPhone(targetMobile) || piiSanitizer.maskEmail(targetEmail)})`);
                }
            } catch (err) {
                failed++;
                await job.log(`Worker EXCEPTION for ${piiSanitizer.maskName(recipient.name)} (${piiSanitizer.maskPhone(targetMobile) || piiSanitizer.maskEmail(targetEmail)}): ${err.message}`);
                
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

        const result = { sent, failed, skipped };
        await job.log(`${channel.toUpperCase()} Blast Complete: ${sent} sent, ${failed} failed, ${skipped} skipped (deduplicated)`);
        return { ...result, completedAt: new Date().toISOString() };
    }

    // ─── DRIP: Single drip sequence step ──────────────────────────────────────
    if (name === 'drip') {
        const { enrollmentId, stepNumber = 1 } = data;
        await job.log(`Running drip step ${stepNumber} for enrollment ${enrollmentId}`);

        const { SequenceEngine } = await import('../utils/SequenceEngine.js');
        await SequenceEngine.executeNextStep(enrollmentId, stepNumber);

        await job.updateProgress(100);
        console.log(`[MarketingWorker] ✅ Drip step ${stepNumber} done for enrollment ${enrollmentId}`);
        return { enrollmentId, stepNumber, completedAt: new Date().toISOString() };
    }


    // ─── AUTO-MATCH-DISPATCH: Triggered by Business Rules ────────────────
    if (name === 'auto-match-dispatch') {
        const { leadId, toggles, matchContext, companyId } = data;
        await job.log(`Auto-matching properties for Lead: ${leadId}`);

        // Lazy load controller logic securely
        const dealController = await import('../../controllers/deal.controller.js');
        const marketingController = await import('../../controllers/marketing.controller.js');
        
        try {
            await job.updateProgress(10);
            
            // 1. Simulate the Request to leverage Enterprise Scoring Engine
            let matchedDeals = [];
            const req = { user: { email: "bharatproperties570@gmail.com", dataScope: "all" }, query: { leadId, budgetFlexibility: 20, sizeFlexibility: 20 } };
            const res = {
                status: () => res,
                json: (response) => {
                    if (response.success && response.data) {
                        matchedDeals = response.data;
                    }
                    return res;
                }
            };
            
            await dealController.matchDeals(req, res);
            await job.updateProgress(50);
            
            // Filter top matches (only Preferred Matches or just top 5 by score)
            // If they are preferred matches we send them, otherwise fallback to top 3 if score > 50
            const preferred = matchedDeals.filter(d => d.isPreferredMatch);
            const topDeals = preferred.length > 0 ? preferred.slice(0, 5) : matchedDeals.filter(d => d.score >= 50).slice(0, 3);
            
            if (topDeals.length === 0) {
                await job.log(`No preferred or high-score matches found for Lead ${leadId}. Aborting dispatch.`);
                console.log(`[MarketingWorker] No preferred matches for Auto-Dispatch (Lead: ${leadId})`);
                await job.updateProgress(100);
                return { leadId, success: true, reason: 'No matches found' };
            }
            
            await job.log(`Found ${topDeals.length} matches. Executing Omnichannel Dispatch...`);
            
            // 2. Invoke Enterprise Dispatcher
            const payload = {
                dealIds: topDeals.map(d => String(d.inventoryId?._id || d.inventoryId || d._id)),
                leadIds: [leadId],
                toggles: toggles || { whatsapp: true },
                hidePrice: false,
                hideUnit: true,
                hideLocation: false,
                matchContext: matchContext || 'perfect'
            };
            
            const dispatchResult = await marketingController.executeDispatch(payload, { _id: null, name: 'System Auto-Match' });
            
            await job.updateProgress(100);
            await job.log(`Dispatch completed.`);
            console.log(`[MarketingWorker] ✅ Auto-Match Dispatch completed for Lead: ${leadId}`);
            
            return { leadId, success: true, dispatchResult };
        } catch (error) {
            await job.log(`Auto-match dispatch failed: ${error.message}`);
            throw error;
        }
    }

    // ─── PROCESS-AUTOMATION-EVENT: Async sequence evaluation ────────────────
    if (name === 'process-automation-event') {
        const { eventName, entityId, entityType } = data;
        await job.log(`Evaluating automation event ${eventName} for ${entityType} ${entityId}`);
        const moduleName = entityType.toLowerCase() + 's';

        let Model;
        if (entityType === 'Lead') {
            const { default: M } = await import('../../models/Lead.js');
            Model = M;
        } else if (entityType === 'Deal') {
            const { default: M } = await import('../../models/Deal.js');
            Model = M;
        }

        if (Model && entityId) {
            const entity = await Model.findById(entityId);
            if (entity) {
                const { SequenceEngine } = await import('../utils/SequenceEngine.js');
                if (eventName.endsWith('_UPDATED')) {
                    await SequenceEngine.evaluateExitCriteria(entity, moduleName);
                    await SequenceEngine.evaluateAutoEnrollment(entity, moduleName, entity.companyId);
                } else if (eventName.endsWith('_CREATED')) {
                    await SequenceEngine.evaluateAutoEnrollment(entity, moduleName, entity.companyId);
                }
            }
        }
        return { eventName, entityId, completedAt: new Date().toISOString() };
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

/**
 * 🧠 Enterprise Template Resolver (Worker Context)
 * Intelligently maps registry variables to Meta components (Body, Buttons, Header)
 */
async function resolveMetaComponents(templateId, recipient, meta, registryMapping) {
    const waService = (await import('../../services/WhatsAppService.js')).default;
    const { default: VariableResolutionService } = await import('../../services/VariableResolutionService.js');
    
    const allTemplates = await waService.getTemplates();
    const templateDef = allTemplates.find(t => t.name === templateId);
    if (!templateDef) return [];

    // 1. Resolve all possible variables for this recipient
    const enrichedContext = {
        ...recipient,
        fullName: recipient.name || 'Broker',
        firstName: (recipient.name || 'Broker').split(' ')[0],
        matchedProperties: [{
            inventoryId: meta.inventoryId,
            projectName: meta.title,
            sector: meta.location,
            price: meta.price,
            size: meta.features?.[0] || ''
        }]
    };
    const resolvedMap = VariableResolutionService.resolveForLeads(enrichedContext, registryMapping);

    // 2. Build Components Sequentially
    const components = [];
    let globalVarIndex = 1;

    templateDef.components.forEach(compDef => {
        if (compDef.type === 'BODY') {
            const matches = compDef.text.match(/{{(\d+)}}/g) || [];
            if (matches.length > 0) {
                const parameters = [];
                matches.forEach(() => {
                    const val = resolvedMap[String(globalVarIndex)] || '—';
                    parameters.push({ type: 'text', text: String(val) });
                    globalVarIndex++;
                });
                components.push({ type: 'body', parameters });
            }
        } else if (compDef.type === 'BUTTONS') {
            compDef.buttons?.forEach((btn, btnIdx) => {
                if (btn.url && btn.url.includes('{{1}}')) {
                    const val = resolvedMap[String(globalVarIndex)] || 'token';
                    components.push({
                        type: 'button',
                        sub_type: 'url',
                        index: btnIdx,
                        parameters: [{ type: 'text', text: String(val) }]
                    });
                    globalVarIndex++;
                }
            });
        } else if (compDef.type === 'HEADER' && compDef.format === 'TEXT' && compDef.text.includes('{{1}}')) {
            const val = resolvedMap[String(globalVarIndex)] || 'Update';
            components.push({
                type: 'header',
                parameters: [{ type: 'text', text: String(val) }]
            });
            globalVarIndex++;
        }
    });

    return components;
}

// ─── BNA-BROADCAST: Broker network broadcast ──────────────────────────────
if (name === 'bna-broadcast') {
        const { dealId, recipients, channels, meta, templateId, language, shareableId, performedBy } = data;
        let sent = 0, failed = 0;
        await job.log(`Starting BNA Broadcast for Deal ${dealId} to ${recipients.length} brokers`);

        
        const { default: Activity } = await import('../../models/Activity.js');
        const waService = (await import('../../services/WhatsAppService.js')).default;
        const eSvc = (await import('../../services/email.service.js')).default;

        let skipped = 0;


        // 🧠 Message Construction (Shared across recipients)
        let waMessage = `*🏢 BROKER UPDATE: ${meta.title}*\n\n` +
            `💰 *Price:* ${meta.price}\n` +
            `📍 *Location:* ${meta.location}\n` +
            `📐 *Specs:* ${meta.features?.join(' | ') || 'N/A'}\n\n`;

        // 🧠 Dynamic Detail Sections (Filtered for empty values)
        if (meta.detailedSections && Array.isArray(meta.detailedSections)) {
            meta.detailedSections.forEach(sec => {
                waMessage += `*${sec.title.toUpperCase()}*\n`;
                sec.lines.forEach(l => { waMessage += `• ${l}\n`; });
                waMessage += `\n`;
            });
        }

        waMessage += `📝 *Details:* ${meta.description}\n\n` +
            `🔗 *Ref:* ${shareableId}\n` +
            `Contact us for commission split and site visits.`;

        const emailSubject = `BROKER DEAL: ${meta.title} - ${meta.location}`;
        
        let detailedHtml = '';
        if (meta.detailedSections && Array.isArray(meta.detailedSections)) {
            detailedHtml = meta.detailedSections.map(sec => `
                <div style="margin-top: 20px;">
                    <p style="font-size: 12px; font-weight: 800; color: #64748b; margin-bottom: 8px; text-transform: uppercase;">${sec.title}</p>
                    <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 14px;">
                        ${sec.lines.map(l => `<li style="margin-bottom: 4px;">${l}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
        }

        const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; color: #1e293b;">
                <div style="background: #6366f1; padding: 20px; color: #fff;">
                    <h2 style="margin: 0;">${meta.title}</h2>
                </div>
                <div style="padding: 20px;">
                    <p style="font-size: 18px; font-weight: 800; color: #6366f1;">${meta.price}</p>
                    <p><strong>Location:</strong> ${meta.location}</p>
                    <p><strong>Specs:</strong> ${meta.features?.join(' | ') || 'N/A'}</p>
                    ${detailedHtml}
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
                    <p>${meta.description}</p>
                    <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-top: 20px;">
                        <p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 800;">REFERENCE CODE</p>
                        <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: 800; color: #1e293b;">${shareableId}</p>
                    </div>
                    <p style="margin-top: 24px; font-size: 12px; color: #64748b; font-style: italic;">Reply for commission structure and site visit bookings.</p>
                </div>
            </div>
        `;

        // 🧠 PROFESSIONAL: Fetch registry once
        let registryMapping = { "1": "customer_name", "2": "property_list_default", "3": "assignedTo" };
        try {
            const SystemSetting = mongoose.model('SystemSetting');
            const setting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
            if (setting?.value) registryMapping = setting.value;
        } catch (e) { await job.log(`Registry Fetch Warning: ${e.message}`); }

        
        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            
            if (!recipient.id) continue;
            
            // 🛡️ DURABLE PRE-DISPATCH ATOMIC CLAIM
            const claimed = await acquireClaim(job.id, recipient.id, 'bna', campaignRunId);
            if (!claimed) {
                skipped++;
                continue;
            }

            const results = [];

            
            if (channels.includes('whatsapp') && recipient.mobile) {
                try {
                    let waRes;
                    if (templateId) {
                        const personalizedComponents = await resolveMetaComponents(
                            templateId, 
                            recipient, 
                            meta, 
                            registryMapping
                        );
                        
                        const idempotencyKey = crypto.createHash('sha256').update(job.id + '_' + recipient.id + '_bna').digest('hex');
                        waRes = await waService.sendTemplate(recipient.mobile, templateId, language || 'en', personalizedComponents, { idempotencyKey });
                    } else {
                        const idempotencyKey = crypto.createHash('sha256').update(job.id + '_' + recipient.id + '_bna').digest('hex');
                        waRes = await waService.sendMessage(recipient.mobile, waMessage, { idempotencyKey });
                    }
                    results.push({ channel: 'whatsapp', status: waRes.success ? 'success' : 'failed', error: waRes.error });
                } catch (e) { results.push({ channel: 'whatsapp', status: 'failed', error: e.message }); }
            }

            if (channels.includes('email') && recipient.email) {

                try {
                    await eSvc.sendEmail(recipient.email, emailSubject, '', emailHtml);
                    results.push({ channel: 'email', status: 'success' });
                } catch (e) { results.push({ channel: 'email', status: 'failed', error: e.message }); }
            }

            const success = results.some(r => r.status === 'success');
            if (success) sent++; else failed++;

            
            // 🛡️ RELEASE CLAIM
            const bnaSuccess = results.some(r => r.status === 'success');
            await releaseClaim(job.id, recipient.id, 'bna', bnaSuccess, results.map(r => r.error).filter(Boolean).join(' | '), null);

            // Log Activity
            
            // 🛡️ PERSIST IDEMPOTENCY STATE
            try {
                await MarketingDelivery.findOneAndUpdate(
                    { jobId: job.id, recipientId: String(recipient.id), channel: 'bna' },
                    {
                        $set: {
                            status: success ? 'SENT' : 'FAILED_RETRYABLE',
                            error: !success ? results.map(r => r.error).filter(Boolean).join(' | ') : null,
                            lastAttemptAt: new Date()
                        },
                        $inc: { attempts: 1 }
                    },
                    { upsert: true }
                );
            } catch(deliveryErr) {
                await job.log(`Delivery state persistence warning for ${piiSanitizer.maskName(recipient.name)}: ${deliveryErr.message}`);
            }

            try {
                await Activity.create({

                    type: 'Marketing',
                    subject: `BNA Broadcast: ${meta.title}`,
                    entityType: 'Company',
                    entityId: mongoose.Types.ObjectId.isValid(recipient.id) ? recipient.id : null,
                    status: success ? 'Sent' : 'Failed',
                    description: success 
                        ? `Sent via ${results.filter(r => r.status === 'success').map(r => r.channel).join(', ')}`
                        : `Failed: ${results.map(r => r.error).filter(Boolean).join(' | ')}`,
                    details: { results, dealId, shareableId, jobId: job.id },
                    performedBy: performedBy,
                    dueDate: new Date()
                });
            } catch (actErr) {
                await job.log(`Activity Log Warning for ${piiSanitizer.maskName(recipient.name)}: ${actErr.message}`);
            }

            await job.updateProgress(Math.round(((i + 1) / recipients.length) * 100));
            await new Promise(r => setTimeout(r, channels.includes('whatsapp') ? 300 : 100));
        }

        await job.log(`BNA Broadcast Complete: ${sent} sent, ${failed} failed, ${skipped} skipped (deduplicated)`);
        
        const terminalResult = await CampaignRun.updateOne(
            {
                _id: data.campaignRunId,
                jobId: job.id,
                'execution.attempt': job.attemptsMade,
                'execution.ownerState': 'ACTIVE'
            },
            {
                $set: {
                    'execution.ownerState': 'TERMINAL',
                    'execution.outcome': 'completed',
                    'execution.terminalAt': new Date()
                }
            }
        );

        if (terminalResult.modifiedCount === 0) {
            throw new Error(`Terminal marker update failed (stale execution) for Job ${job.id}`);
        }

        return { sent, failed, completedAt: new Date().toISOString() };
    }

    throw new Error(`Unknown marketing job type: ${name}`);
};


// ── Worker Instance ────────────────────────────────────────────────────────────


export async function finalizeCampaignRunStatus(campaignRunId, isJobFailed) {
    if (!campaignRunId) return;
    try {
        const mongoose = (await import('mongoose')).default;
        const CampaignRun = mongoose.model('CampaignRun');
        
        const run = await CampaignRun.findById(campaignRunId);
        if (!run || !['PENDING', 'RUNNING'].includes(run.status)) return;
        
        let executionDefinitivelyTerminal = false;
        let authoritativeQueueState = null;
        
        if (run.jobId) {
            try {
                const { marketingQueue } = await import('../queues/marketingQueue.js');
                const job = await marketingQueue.getJob(run.jobId);
                if (job) {
                    const state = await job.getState();
                    if (['completed', 'failed'].includes(state)) {
                        executionDefinitivelyTerminal = true;
                        authoritativeQueueState = state;
                    }
                } else {
                    if (run.execution && run.execution.jobId === run.jobId && run.execution.ownerState === 'TERMINAL') {
                        executionDefinitivelyTerminal = true;
                        authoritativeQueueState = run.execution.outcome || 'failed';
                    }
                }
            } catch (err) {}
        }
        
        const MarketingDelivery = mongoose.model('MarketingDelivery');
        const metrics = await MarketingDelivery.aggregate([
            { $match: { campaignRunId: new mongoose.Types.ObjectId(campaignRunId) } },
            { $group: {
                _id: null,
                total: { $sum: 1 },
                sent: { $sum: { $cond: [{ $eq: ["$status", "SENT"] }, 1, 0] } },
                failedFinal: { $sum: { $cond: [{ $eq: ["$status", "FAILED_FINAL"] }, 1, 0] } },
                failedRetryable: { $sum: { $cond: [{ $eq: ["$status", "FAILED_RETRYABLE"] }, 1, 0] } },
                inProgress: { $sum: { $cond: [{ $eq: ["$status", "IN_PROGRESS"] }, 1, 0] } }
            }}
        ]);
        
        if (metrics.length === 0) {
            if (!executionDefinitivelyTerminal) return; 
            
            let nextZero = 'RUNNING';
            if (authoritativeQueueState === 'failed') nextZero = 'FAILED';
            else if (run.targetCount > 0) nextZero = 'FAILED';
            else nextZero = 'COMPLETED';
            
            if (nextZero !== 'RUNNING') {
                if (global.testSeamWorkerA_postCompute) await global.testSeamWorkerA_postCompute();
                
                const filter = { _id: campaignRunId, status: { $in: ['PENDING', 'RUNNING'] } };
                if (run.execution && run.execution.jobId) {
                    filter['execution.jobId'] = run.execution.jobId;
                    filter['execution.attempt'] = run.execution.attempt;
                    filter['execution.ownerState'] = run.execution.ownerState;
                }
                
                await CampaignRun.findOneAndUpdate(
                    filter,
                    { $set: { status: nextZero } }
                );
            }
            return;
        }

        const { sent, failedFinal, failedRetryable, inProgress } = metrics[0];
        
        if (inProgress > 0 || failedRetryable > 0) return; 
        
        let nextStatus = 'RUNNING';
        const targetCount = run.targetCount || 0;
        
        if (executionDefinitivelyTerminal) {
            if (sent > 0 && failedFinal === 0 && sent >= targetCount) {
                 nextStatus = 'COMPLETED';
            } else if (sent > 0 && failedFinal > 0) {
                 nextStatus = 'PARTIAL';
            } else if (sent > 0 && failedFinal === 0 && sent < targetCount) {
                 nextStatus = 'PARTIAL'; 
            } else if (sent === 0 && (failedFinal > 0 || targetCount > 0)) {
                 nextStatus = 'FAILED';
            } else if (sent === 0 && failedFinal === 0) {
                 if (authoritativeQueueState === 'failed') nextStatus = 'FAILED';
                 else nextStatus = 'COMPLETED';
            }
        }
        
        if (nextStatus !== 'RUNNING') {
            if (global.testSeamWorkerA_postCompute) await global.testSeamWorkerA_postCompute();
            
            const filter = { _id: campaignRunId, status: { $in: ['PENDING', 'RUNNING'] } };
            if (run.execution && run.execution.jobId) {
                filter['execution.jobId'] = run.execution.jobId;
                filter['execution.attempt'] = run.execution.attempt;
                filter['execution.ownerState'] = run.execution.ownerState;
            }
            
            await CampaignRun.findOneAndUpdate(
                filter,
                { $set: { status: nextStatus } }
            );
        }

    } catch(e) {
        console.error('[MarketingWorker] Finalize CampaignRun error:', e.stack || e.message);
    }
}

export const marketingWorker = new Worker('marketingQueue', processMarketingJob, {
    connection: redisConnection,
    concurrency: 5,  // Process up to 5 marketing jobs in parallel
    limiter: {
        max: 20,           // Rate limit: max 20 jobs
        duration: 60000,   // Per 60 seconds (to respect API rate limits)
    },
});

marketingWorker.on('completed', async (job, result) => {
    console.log(`[MarketingWorker] ✅ Job ${job.name} (${job.id}) completed:`, result?.completedAt || 'done');
    await finalizeCampaignRunStatus(job?.data?.campaignRunId, false);
});

marketingWorker.on('failed', async (job, err) => {
    console.error(`[MarketingWorker] ❌ Job ${job?.name} (${job?.id}) failed (attempt ${job?.attemptsMade}):`, err.message);
    try {
        await writeFailedJobLog(job, err);
    } catch(e) {}
    
    const maxAttempts = job?.opts?.attempts || 1;
    if (job?.attemptsMade >= maxAttempts) {
        if (job?.data?.campaignRunId) {
            try {
                const mongoose = (await import('mongoose')).default;
                const CampaignRun = mongoose.model('CampaignRun');
                const updateRes = await CampaignRun.updateOne(
                    {
                        _id: job.data.campaignRunId,
                        jobId: job.id,
                        'execution.attempt': job.attemptsMade,
                        'execution.ownerState': 'ACTIVE'
                    },
                    {
                        $set: {
                            'execution.ownerState': 'TERMINAL',
                            'execution.outcome': 'failed',
                            'execution.terminalAt': new Date()
                        }
                    }
                );
                
                if (updateRes.modifiedCount === 0) {
                    console.warn(`[MarketingWorker] Stale failed event for Job ${job.id} - ignoring finalization.`);
                    return; // DO NOT FINALIZE
                }
            } catch(e) {
                console.error('[MarketingWorker] Terminal CAS on failure failed:', e);
                return; // DO NOT FINALIZE ON DB ERROR
            }
        }
        await finalizeCampaignRunStatus(job?.data?.campaignRunId, true);
    }
});

marketingWorker.on('error', (err) => {
    // Suppress Redis offline errors — queue degrades gracefully
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[MarketingWorker] Worker error:', err.message);
    }
});

console.log('✅ Marketing Worker Initialized (concurrency=5)');
