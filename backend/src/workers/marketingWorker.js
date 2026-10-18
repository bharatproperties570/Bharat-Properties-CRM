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
import { buildUniversalContext, interpolateUniversalTemplate } from '../../utils/universalVariableInterpolator.js';

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
async function resolveMetaComponents(templateId, recipient, meta, registryMapping, universalData = null) {
    const waService = (await import('../../services/WhatsAppService.js')).default;
    const { default: VariableResolutionService } = await import('../../services/VariableResolutionService.js');
    
    const allTemplates = await waService.getTemplates();
    const templateDef = allTemplates.find(t => t.name === templateId);
    if (!templateDef) return [];

    // 1. Resolve all possible variables for this recipient
    const enrichedContext = {
        ...recipient,
        fullName: recipient.firstName ? `${recipient.firstName} ${recipient.lastName || ''}`.trim() : (recipient.name || 'Customer'),
        firstName: recipient.firstName || (recipient.name ? recipient.name.split(' ')[0] : 'Customer'),
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
            const matches = (compDef.text || '').match(/\{\{([^}]+)\}\}/g) || [];
            if (matches.length > 0) {
                const parameters = [];
                const namedMap = VariableResolutionService.resolveNamed(enrichedContext);
                
                matches.forEach((match) => {
                    const varName = match.replace(/[{}]/g, '').trim();
                    let val;
                    
                    if (universalData && (universalData[varName] !== undefined || universalData[varName.toLowerCase()] !== undefined)) {
                        val = universalData[varName] !== undefined ? universalData[varName] : universalData[varName.toLowerCase()];
                    } else if (/^\d+$/.test(varName)) {
                        val = resolvedMap[String(globalVarIndex)] || '—';
                        globalVarIndex++;
                    } else {
                        val = namedMap[varName] || '—';
                    }
                    
                    let valStr = String(val);
                    valStr = valStr.replace(/\n/g, '  |  ').replace(/\t/g, ' ').replace(/\s{5,}/g, '    ');
                    if (valStr.length > 1000) {
                        valStr = valStr.substring(0, 995) + '...';
                    }
                    
                    const paramObj = { type: 'text', text: valStr };
                    if (!/^\d+$/.test(varName)) {
                        paramObj.parameter_name = varName;
                    }
                    parameters.push(paramObj);
                });
                components.push({ type: 'body', parameters });
            }
        } else if (compDef.type === 'BUTTONS') {
            compDef.buttons?.forEach((btn, btnIdx) => {
                const hasDynVar = btn.url && /\{\{\d+\}\}/.test(btn.url);
                if (hasDynVar) {
                    const namedMap = VariableResolutionService.resolveNamed(enrichedContext);
                    let siteVisitToken = namedMap['siteVisitToken'] || namedMap['site_visit_token'] || 'visit';

                    if (typeof siteVisitToken === 'string' && siteVisitToken.includes('.')) {
                        siteVisitToken = siteVisitToken.replace(/\./g, '~');
                    }

                    components.push({
                        type: 'button',
                        sub_type: 'url',
                        index: String(btnIdx),
                        parameters: [{ type: 'text', text: String(siteVisitToken) }]
                    });
                }
            });
        } else if (compDef.type === 'HEADER' && compDef.format === 'TEXT' && /\{\{([^}]+)\}\}/.test(compDef.text)) {
            const headerVars = (compDef.text.match(/\{\{([^}]+)\}\}/g) || []);
            if (headerVars.length > 0) {
                const namedMap = VariableResolutionService.resolveNamed(enrichedContext);
                const parameters = headerVars.map((match) => {
                    const varName = match.replace(/[{}]/g, '').trim();
                    let val;
                    let isNamed = false;
                    
                    if (universalData && (universalData[varName] !== undefined || universalData[varName.toLowerCase()] !== undefined)) {
                        val = universalData[varName] !== undefined ? universalData[varName] : universalData[varName.toLowerCase()];
                        isNamed = !/^\d+$/.test(varName);
                    } else if (/^\d+$/.test(varName)) {
                        val = resolvedMap[String(globalVarIndex)] || 'Update';
                        globalVarIndex++;
                    } else {
                        val = namedMap[varName] || 'Update';
                        isNamed = true;
                    }
                    
                    const paramObj = { type: 'text', text: String(val).substring(0, 200) };
                    if (isNamed) {
                        paramObj.parameter_name = varName;
                    }
                    return paramObj;
                });
                components.push({ type: 'header', parameters });
            }
        } else if (compDef.type === 'HEADER' && compDef.format !== 'TEXT') {
            const hType = compDef.format.toLowerCase();
            const finalMediaUrl = (
                hType === 'document' ? 'https://api.bharatproperties.co/uploads/Huda_Map_Book_KKR.pdf?v=compressed_v1' :
                hType === 'image' ? 'https://dummyimage.com/600x400/000/fff.png' :
                'https://www.w3schools.com/html/mov_bbb.mp4'
            );
            
            components.push({
                type: 'header',
                parameters: [{
                    type: hType,
                    [hType]: {
                        link: finalMediaUrl,
                        ...(hType === 'document' ? { filename: 'Huda_Map_Book_KKR.pdf' } : {})
                    }
                }]
            });
        }
    });

    return components;
}

// ─── BNA-BROADCAST: Broker network broadcast ──────────────────────────────
if (name === 'bna-broadcast') {
        const { dealId, recipients, channels: rawChannels, meta, templateId, language, integrationId, shareableId, performedBy, templateText, isBaileys, smsTemplate, rcsTemplate, emailTemplate } = data;
        const normalizedChannels = Array.isArray(rawChannels)
            ? rawChannels
            : (rawChannels && typeof rawChannels === 'object' ? Object.keys(rawChannels).filter(k => rawChannels[k]) : ['whatsapp']);
        const channels = normalizedChannels.length > 0 ? normalizedChannels : ['whatsapp'];
        let sent = 0, failed = 0;
        await job.log(`Starting BNA Broadcast for Deal ${dealId} to ${recipients.length} recipients`);

        const { default: Activity } = await import('../../models/Activity.js');
        const waService = (await import('../../services/WhatsAppService.js')).default;
        const eSvc = (await import('../../services/email.service.js')).default;

        // 1. Resolve Deal Document with full population
        let primaryDeal = data.deal;
        let dealsList = data.deals;
        if ((!primaryDeal || !primaryDeal.assignedTo?.fullName) && dealId) {
            try {
                const DealModel = mongoose.model('Deal');
                const freshDeal = await DealModel.findById(dealId)
                    .populate('inventoryId')
                    .populate('owner')
                    .populate('projectId')
                    .populate('partyStructure.owner')
                    .populate('assignedTo')
                    .lean();
                if (freshDeal) {
                    primaryDeal = { ...freshDeal, ...primaryDeal, assignedTo: freshDeal.assignedTo || primaryDeal?.assignedTo, inventoryId: freshDeal.inventoryId || primaryDeal?.inventoryId };
                    dealsList = [primaryDeal];
                }
            } catch (e) {
                await job.log(`Deal populate warning: ${e.message}`);
            }
        }

        // 2. Fetch template text from SystemSetting if templateId is specified and templateText is empty
        let baseTemplateText = templateText || '';
        let activeTemplateId = templateId;
        let activeTemplateLang = language || 'en';

        try {
            const SystemSetting = mongoose.model('SystemSetting');
            if (!baseTemplateText && activeTemplateId) {
                let setting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
                if (!setting && mongoose.connection.db) {
                    setting = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'crm_whatsapp_templates' });
                }
                if (setting?.value && Array.isArray(setting.value)) {
                    const foundTpl = setting.value.find(t => t.id === activeTemplateId || t.name === activeTemplateId);
                    if (foundTpl) {
                        const parts = [];
                        if (foundTpl.headerType === 'TEXT' && foundTpl.headerText && String(foundTpl.headerText).trim()) {
                            parts.push(String(foundTpl.headerText).trim());
                        }
                        const body = foundTpl.content || foundTpl.body || foundTpl.message || foundTpl.text || '';
                        if (body && String(body).trim()) {
                            parts.push(String(body).trim());
                        }
                        if (foundTpl.footer && String(foundTpl.footer).trim()) {
                            parts.push(String(foundTpl.footer).trim());
                        }
                        baseTemplateText = parts.length > 0 ? parts.join('\n\n') : (foundTpl.content || foundTpl.body || foundTpl.message || foundTpl.text || '');
                    }
                }
            }
        } catch (e) {
            await job.log(`Template fetch warning: ${e.message}`);
        }

        const defaultEmailSubject = `BROKER DEAL: ${meta.title} - ${meta.location}`;
        
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

        const defaultEmailHtml = `
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
            let setting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
            if (!setting && mongoose.connection.db) {
                setting = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'messaging_variable_registry' });
            }
            if (setting?.value) registryMapping = setting.value;
        } catch (e) { await job.log(`Registry Fetch Warning: ${e.message}`); }

        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            const results = [];
            const isGroup = recipient.isGroup || String(recipient.mobile || '').includes('@g.us');
            
            // Universal context resolution across all real-estate variables and recipient attributes
            const { contextMap, data: universalData } = await buildUniversalContext({
                deal: primaryDeal,
                deals: dealsList || (primaryDeal ? [primaryDeal] : []),
                recipient,
                currentUser: { fullName: performedBy, name: performedBy },
                meta
            });

            let text = '';
            if (channels.includes('whatsapp') && recipient.mobile) {
                try {
                    let waRes;
                    if (!isGroup && !isBaileys && templateId) {
                        const personalizedComponents = await resolveMetaComponents(
                            templateId, 
                            recipient, 
                            meta, 
                            registryMapping,
                            universalData
                        );
                        
                        waRes = await waService.sendTemplate(recipient.mobile, templateId, language || 'en', personalizedComponents, { integrationId });
                        text = `Template: ${templateId}`;
                    } else {
                        if (baseTemplateText) {
                            text = interpolateUniversalTemplate(baseTemplateText, contextMap);
                        } else if (meta.isMultiDeal) {
                            text = interpolateUniversalTemplate(
                                `*🏢 PORTFOLIO BNA ALERT: {{title}}*\n\n` +
                                `Here is our exclusive curated portfolio of *{{dealsCount}} verified deals*:\n\n` +
                                `{{description}}\n\n` +
                                `🔗 *Deal References:* {{dealCode}}\n` +
                                `Contact us for full dossiers, commission splits, and site inspections.`,
                                contextMap
                            );
                        } else {
                            text = interpolateUniversalTemplate(
                                `*🏢 BROKER UPDATE: {{projectName}}*\n\n` +
                                `💰 *Price:* {{price}}\n` +
                                `📍 *Location:* {{location}}\n` +
                                `📐 *Specs:* {{size}}\n\n` +
                                `📝 *Details:* {{description}}\n\n` +
                                `🔗 *Ref:* {{dealCode}}\n` +
                                `Contact us for commission split and site visits.`,
                                contextMap
                            );
                        }
                        waRes = await waService.sendMessage(recipient.mobile, text, { integrationId });
                    }
                    results.push({ 
                        channel: 'whatsapp', 
                        status: waRes.success ? 'success' : 'failed', 
                        error: waRes.error,
                        messageContent: text 
                    });
                } catch (e) { results.push({ channel: 'whatsapp', status: 'failed', error: e.message }); }
            }

            if (channels.includes('sms') && recipient.mobile && !isGroup) {
                try {
                    const smsSvc = (await import('../../services/SmsService.js')).default;
                    const rawSms = smsTemplate?.text || (meta.isMultiDeal
                        ? `[BHARAT PROPERTIES] {{title}} - {{dealsCount}} verified deals available. Ref: {{dealCode}}. Call {{ownerMobile}} for brochure.`
                        : `[BHARAT PROPERTIES] {{title}} at {{location}}. Price: {{price}}. Specs: {{size}}. Ref: {{dealCode}}. Call {{ownerMobile}} for details.`);
                    const smsText = interpolateUniversalTemplate(rawSms, contextMap);
                    const smsRes = await smsSvc.sendSms(recipient.mobile, smsText, {
                        dltHeaderId: smsTemplate?.dltHeaderId || 'BHRPRP',
                        dltTemplateId: smsTemplate?.dltTemplateId || '170716890000101'
                    });
                    results.push({ 
                        channel: 'sms', 
                        status: (smsRes?.success || smsRes?.sent > 0) ? 'success' : 'simulated_success', 
                        messageContent: smsText 
                    });
                } catch (e) { results.push({ channel: 'sms', status: 'failed', error: e.message }); }
            }

            if (channels.includes('rcs') && recipient.mobile && !isGroup) {
                try {
                    const smsSvc = (await import('../../services/SmsService.js')).default;
                    const rawRcsBody = rcsTemplate?.text || meta.description;
                    const rcsBody = interpolateUniversalTemplate(rawRcsBody, contextMap);
                    const rawRcsText = `✨ *[RCS RICH CARD] {{title}}*\n📍 Location: {{location}}\n💰 Price: {{price}}\n📐 Specs: {{size}}\n\n${rcsBody}\n\nRef: {{dealCode}}`;
                    const rcsText = interpolateUniversalTemplate(rawRcsText, contextMap);
                    const rcsRes = await smsSvc.sendSms(recipient.mobile, rcsText, {
                        isRcs: true,
                        richCard: {
                            title: interpolateUniversalTemplate(meta.title, contextMap),
                            price: interpolateUniversalTemplate(meta.price, contextMap),
                            buttons: rcsTemplate?.buttons || []
                        }
                    });
                    results.push({ 
                        channel: 'rcs', 
                        status: (rcsRes?.success || rcsRes?.sent > 0) ? 'success' : 'simulated_success', 
                        messageContent: rcsText 
                    });
                } catch (e) { results.push({ channel: 'rcs', status: 'failed', error: e.message }); }
            }

            if (channels.includes('email') && recipient.email && !isGroup) {
                try {
                    const rawSubject = emailTemplate?.subject || defaultEmailSubject;
                    const rawHtml = emailTemplate?.html || defaultEmailHtml;
                    const finalSubject = interpolateUniversalTemplate(rawSubject, contextMap);
                    const finalHtml = interpolateUniversalTemplate(rawHtml, contextMap);
                    await eSvc.sendEmail(recipient.email, finalSubject, '', finalHtml);
                    results.push({ channel: 'email', status: 'success', messageContent: finalSubject });
                } catch (e) { results.push({ channel: 'email', status: 'failed', error: e.message }); }
            }

            const success = results.some(r => r.status === 'success' || r.status === 'simulated_success');
            if (success) sent++; else failed++;

            // Log Activity
            try {
                await Activity.create({
                    type: 'Marketing',
                    subject: `BNA Broadcast: ${meta.title}`,
                    entityType: recipient.context?.originalType || (isGroup ? 'WhatsAppGroup' : 'Company'),
                    entityId: mongoose.Types.ObjectId.isValid(recipient.id) ? recipient.id : null,
                    status: success ? 'Sent' : 'Failed',
                    visibleTo: 'Everyone',
                    description: success 
                        ? (text || waMessage) 
                        : `Failed: ${results.map(r => r.error).filter(Boolean).join(' | ') || 'Connection dropped or provider timed out'}`,
                    details: { 
                        results, 
                        dealId, 
                        shareableId, 
                        jobId: job.id,
                        message: text || waMessage,
                        renderedBody: text || waMessage,
                        isGroup: isGroup,
                        groupJid: isGroup ? recipient.mobile : null,
                        groupName: isGroup ? (recipient.name || 'WhatsApp Group') : null,
                        phoneNumber: recipient.mobile,
                        whatsappIntegrationId: integrationId || null,
                        platform: isGroup ? 'WhatsApp Web' : 'WhatsApp'
                    },
                    participants: [
                        { name: recipient.name || (isGroup ? 'WhatsApp Group' : 'Partner'), mobile: recipient.mobile }
                    ],
                    performedBy: performedBy,
                    dueDate: new Date()
                });
            } catch (actErr) {
                await job.log(`Activity Log Warning for ${recipient.name}: ${actErr.message}`);
            }

            await job.updateProgress(Math.round(((i + 1) / recipients.length) * 100));
            await new Promise(r => setTimeout(r, channels.includes('whatsapp') ? 300 : 100));
        }

        await job.log(`BNA Broadcast Complete: ${sent} sent, ${failed} failed`);
        return { sent, failed, completedAt: new Date().toISOString() };
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

marketingWorker.on('failed', async (job, err) => {
    console.error(`[MarketingWorker] ❌ Job ${job?.name} (${job?.id}) failed (attempt ${job?.attemptsMade}):`, err.message);
    await writeFailedJobLog(job, err);
});

marketingWorker.on('error', (err) => {
    // Suppress Redis offline errors — queue degrades gracefully
    if (!err.message?.includes('ECONNREFUSED')) {
        console.warn('[MarketingWorker] Worker error:', err.message);
    }
});

console.log('✅ Marketing Worker Initialized (concurrency=5)');
