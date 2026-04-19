/**
 * marketing.controller.js
 * Phase D — Real AI (Gemini 1.5 Pro + GPT-4o) with BullMQ job queuing.
 * 
 * Version 2.0: Integrated MarketingAudienceService for 360-degree source control.
 */
import mongoose from 'mongoose';
import marketingService from '../services/MarketingService.js';
import marketingPublishingService from '../services/MarketingPublishingService.js';
import geminiService    from '../services/GeminiService.js';
import openAIService    from '../services/OpenAIService.js';
import publishService from '../services/PublishService.js';
import Deal from '../models/Deal.js';
import Project from '../models/Project.js';
import Lead  from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import MarketingContent from '../models/MarketingContent.js';
import NurtureBot from '../services/NurtureBot.js';
import marketingAudienceService from '../services/MarketingAudienceService.js';
import { normalizePhone } from '../utils/normalization.js';
import fs from 'fs';

// Lazy-import the marketing queue
let _marketingQueue = null;
const getMarketingQueue = async () => {
    if (!_marketingQueue) {
        const mod = await import('../src/queues/marketingQueue.js');
        _marketingQueue = mod.marketingQueue;
    }
    return _marketingQueue;
};

// ── Dashboard & Analytics ─────────────────────────────────────────────────────

export const getMarketingStats = async (req, res) => {
    try {
        const stats = await NurtureBot.getMarketingStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCampaignRuns = async (req, res) => {
    try {
        const Activity = mongoose.model('Activity');
        
        // Fetch all marketing activities from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const activities = await Activity.find({ 
            type: 'Marketing',
            createdAt: { $gte: thirtyDaysAgo }
        }).lean();

        if (activities.length === 0) {
            return res.json({
                success: true,
                data: [
                    { id: 'placeholder_1', name: 'No campaigns run yet', date: new Date(), status: 'Info', sent: 0, delivered: 0, read: 0 }
                ]
            });
        }

        // Group by campaign name
        const campaignGroups = {};
        activities.forEach(act => {
            const cName = act.details?.campaignName || 'Unnamed Campaign';
            if (!campaignGroups[cName]) {
                campaignGroups[cName] = {
                    name: cName,
                    date: act.createdAt,
                    sent: 0,
                    delivered: 0,
                    read: 0,
                    failed: 0,
                    channels: new Set()
                };
            }

            if (act.details?.channel) campaignGroups[cName].channels.add(act.details.channel);
            
            // Increment counts based on status
            const status = (act.status || '').toLowerCase();
            campaignGroups[cName].sent++; // Total sent
            if (status === 'delivered') campaignGroups[cName].delivered++;
            if (status === 'read') {
                campaignGroups[cName].delivered++;
                campaignGroups[cName].read++;
            }
            if (status === 'failed') {
                campaignGroups[cName].failed++;
                campaignGroups[cName].sent--; // Adjust sent to successfully dispatched
            }

            // Update latest date
            if (act.createdAt > campaignGroups[cName].date) {
                campaignGroups[cName].date = act.createdAt;
            }
        });

        // Convert to array and sort
        const runs = Object.values(campaignGroups).map((c, i) => ({
            id: `campaign_${i}`,
            name: c.name,
            date: c.date,
            channels: Array.from(c.channels).join(', '),
            leadsTargeted: c.sent + c.failed,
            sent: c.sent,
            delivered: c.delivered,
            read: c.read,
            failed: c.failed,
            status: c.failed > 0 && c.sent === 0 ? 'Failed' : 'Completed'
        })).sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, data: runs });
    } catch (error) {
        console.error('[MarketingController] getCampaignRuns error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ── AI Content Generation ──────────────────────────────────────────────────────

export const generateSocialContent = async (req, res) => {
    try {
        const { dealId, platform } = req.body;
        if (!dealId || !platform) return res.status(400).json({ success: false, error: 'Deal ID and platform are required' });

        const deal = await Deal.findById(dealId);
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        const content = await marketingService.generateSocialPost(deal, platform.toLowerCase());

        const post = await MarketingContent.create({
            title: `${deal.unitNo || 'Property'} ${platform} Post`,
            content: content,
            platform: platform.charAt(0).toUpperCase() + platform.slice(1),
            type: 'ct-project',
            date: new Date().toISOString().split('T')[0],
            status: 'draft',
            dealId: deal._id,
            author: req.user?.id
        });

        res.json({ success: true, platform, content, dealTitle: deal.unitNo, postId: post._id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const generateEmailCampaign = async (req, res) => {
    try {
        const { dealId, audience } = req.body;
        const deal = await Deal.findById(dealId);
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
        const campaign = await marketingService.generateEmailCampaign(deal, audience);
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getRecentDeals = async (req, res) => {
    try {
        const deals = await Deal.find({ stage: 'Open' }).sort({ createdAt: -1 }).limit(5);
        res.json({ success: true, data: deals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const runMarketingAgent = async (req, res) => {
    try {
        const advancedCount = await NurtureBot.processPendingLeads();
        res.json({ success: true, advancedCount, message: `AI Agent successfully processed and advanced ${advancedCount} leads.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const generateWithModel = async (req, res) => {
    try {
        const { agentName, provider, model, prompt, systemPrompt, context } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

        const userPrompt = context && Object.keys(context).length > 0
            ? `${prompt}\n\nContext Data:\n${JSON.stringify(context, null, 2)}`
            : prompt;

        let result;
        const normalizedProvider = (provider || 'google').toLowerCase();

        if (normalizedProvider === 'openai') {
            result = await openAIService.generateWithSystem(systemPrompt || '', userPrompt, { model: model || 'gpt-4o' });
        } else {
            result = await geminiService.generateWithSystem(systemPrompt || '', userPrompt, { model: model || 'gemini-1.5-pro' });
        }

        res.json({ success: true, content: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ── Campaign Dispatch & Audience Engine ────────────────────────────────────────

/**
 * POST /api/marketing/audience-count
 */
export const getAudienceCount = async (req, res) => {
    try {
        const config = req.body;
        if (!config || !config.source) return res.status(400).json({ success: false, error: 'Source is required' });
        
        console.log('[MarketingController] Fetching count for:', config);
        
        // Handle Import Source (Transient Data)
        if (config.source === 'Excel' || config.source === 'Import') {
            return res.json({ success: true, count: config.tempCount || 0 });
        }

        const recipients = await marketingAudienceService.getAudience(config);
        
        res.json({ success: true, count: recipients.length });
    } catch (error) {
        console.error('[MarketingController] getAudienceCount EXCEPTION:', error.stack || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/marketing/import-audience
 * Parses Excel/CSV and returns a recipient list for campaign previews.
 */
export const importAudience = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
        
        const filePath = req.file.path;
        const extension = req.file.originalname.split('.').pop().toLowerCase();
        let rawData = [];

        if (['csv', 'xlsx', 'xls'].includes(extension)) {
            console.log(`[MarketingImport] Processing ${extension.toUpperCase()}:`, filePath);
            try {
                const XLSXModule = await import('xlsx');
                const XLSX = XLSXModule.default || XLSXModule;
                
                const workbook = XLSX.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) throw new Error('File has no readable sheets or content');
                
                const sheet = workbook.Sheets[sheetName];
                rawData = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 0 });
                console.log(`[MarketingImport] ${extension.toUpperCase()} parsed: ${rawData.length} rows found`);
            } catch (err) {
                console.error(`[MarketingImport] ${extension.toUpperCase()} Parsing Failed:`, err.stack || err.message);
                return res.status(500).json({ success: false, error: `${extension.toUpperCase()} parsing failed: ${err.message}.` });
            }
        } else {
            return res.status(400).json({ success: false, error: `Unsupported file format (.${extension}). Please use .csv or .xlsx` });
        }

        // Clean up temp file
        await fs.promises.unlink(filePath).catch(() => {});

        // Standardize Data (Lenient mode for manual mapping)
        const recipients = rawData.map((row, idx) => {
            // Initial Smart Field Mapping (Attempt)
            const name = row.name || row['full name'] || row['contact name'] || row['customer'] || `Row-${idx + 1}`;
            const rawMobile = row.mobile || row.phone || row['phone number'] || row['whatsapp'] || row['contact'] || row['Ph No'] || row['Mobile No'] || row['P.No'] || row['Number'] || row['Cust Mobile'] || '';
            const mobile = normalizePhone(rawMobile);
            const email = row.email || row['email address'] || '';

            return {
                id: `imp-${idx}-${Date.now()}`,
                name,
                mobile,
                email,
                context: { ...row, originalType: 'Import' }
            };
        });

        res.json({ 
            success: true, 
            recipients, 
            count: recipients.length,
            message: `Successfully identified ${recipients.length} rows from ${req.file.originalname}. Please verify column mapping below.`
        });

    } catch (error) {
        console.error('[MarketingController] importAudience Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/marketing/send-campaign
 */
export const sendCampaign = async (req, res) => {
    try {
        const { channel, segment, name, subject, content, html, waMapping, audienceConfig } = req.body;

        if (!channel) return res.status(400).json({ success: false, error: 'channel is required' });

        let recipients = [];
        if (audienceConfig && (audienceConfig.source === 'Excel' || audienceConfig.source === 'Import') && audienceConfig.tempRecipients) {
            const { mapping } = audienceConfig;
            recipients = audienceConfig.tempRecipients.map(r => {
                const row = r.context || {};
                // Honor user-defined mapping if provided
                const name   = (mapping?.name   && row[mapping.name])   ? row[mapping.name] : r.name;
                const mobile = (mapping?.mobile && row[mapping.mobile]) ? normalizePhone(row[mapping.mobile]) : r.mobile;
                const email  = (mapping?.email  && row[mapping.email])  ? row[mapping.email] : r.email;
                
                return { ...r, name, mobile, email };
            }).filter(r => r.mobile);
        } else if (audienceConfig && audienceConfig.source) {
            recipients = await marketingAudienceService.getAudience(audienceConfig);
        } else {
            // Legacy fallback
            const segmentQuery = segment && segment !== 'all' ? { stage: { $regex: new RegExp(segment, 'i') } } : {};
            const leads = await Lead.find({ ...segmentQuery, mobile: { $exists: true, $ne: '' } }).limit(1000).lean();
            recipients = leads.map(l => ({
                id: l._id,
                name: l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
                mobile: normalizePhone(l.mobile),
                email: l.email,
                context: { ...l, originalType: 'Lead' }
            }));
        }

        if (recipients.length === 0) return res.json({ success: true, leadCount: 0, message: 'No recipients found.' });

        const mobiles = recipients.map(r => r.mobile).filter(Boolean);
        const emails  = recipients.map(r => r.email).filter(Boolean);

        let activeMapping = waMapping;
        if (!activeMapping || Object.keys(activeMapping).length === 0) {
            const SystemSetting = mongoose.model('SystemSetting');
            const registrySetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
            if (registrySetting && registrySetting.value) activeMapping = registrySetting.value;
        }

        const queue = await getMarketingQueue();
        const job = await queue.add('blast', {
            channel,
            name:    name || 'Campaign',
                    subject: subject || 'Update',
            message: content || '',
            html:    html    || '',
            templateName: req.body.templateName,
            templateLang: req.body.templateLang || 'en_US',
            templateComponents: req.body.templateComponents || [],
            waMapping: activeMapping,
            mobiles,
            emails,
            leads: recipients,
            queuedAt: new Date().toISOString(),
        });

        res.json({ success: true, leadCount: recipients.length, jobId: job.id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const sendManualMatch = async (req, res) => {
    console.log('[ManualDispatch] Incoming Request:', { body: req.body, user: req.user?._id });
    try {
        let { dealId, leadId, dealIds, leadIds, toggles } = req.body;
        
        // Normalize to arrays
        const finalDealIds = Array.isArray(dealIds) ? dealIds : (dealId ? [dealId] : []);
        const finalLeadIds = Array.isArray(leadIds) ? leadIds : (leadId ? [leadId] : []);

        if (finalDealIds.length === 0 || finalLeadIds.length === 0) {
            console.error('[ManualDispatch] Bad Request: Missing IDs');
            return res.status(400).json({ success: false, error: 'Deal IDs and Lead IDs are required' });
        }

        // 1. Load Services & Templates
        const { buildWhatsAppTemplate, buildEmailTemplate, buildSmsTemplate } = await import('../services/CampaignConfig.js');
        const waService = (await import('../services/WhatsAppService.js')).default;
        const smsSvc = (await import('../services/SmsService.js')).default;
        const eSvc = (await import('../services/email.service.js')).default;
        const Activity = mongoose.model('Activity');

        const overallResults = [];

        // 2. Iterate through cross-product (or usually it's 1-to-N or N-to-1)
        for (const dId of finalDealIds) {
            // Fetch Property/Deal (Polymorphic)
            let propertyData = await Inventory.findById(dId).lean();
            let isInventory = true;
            if (!propertyData) {
                propertyData = await Deal.findById(dId).lean();
                isInventory = false;
            }
            if (!propertyData) continue;

            const mockInv = isInventory ? propertyData : (propertyData.inventoryId ? await Inventory.findById(propertyData.inventoryId).lean() : null);

            for (const lId of finalLeadIds) {
                const lead = await Lead.findById(lId).lean();
                if (!lead) continue;

                console.log(`[ManualDispatch] Processing Match: Prop:${dId} -> Lead:${lId}`);
                const matchResults = [];

                // Dispatch WhatsApp
                if (toggles?.whatsapp && (lead.mobile || lead.phones?.[0])) {
                    const mobile = lead.mobile || lead.phones?.[0]?.number || lead.phones?.[0];
                    const template = buildWhatsAppTemplate(propertyData, mockInv);
                    try {
                        const res = await waService.sendMessage(mobile, template.message);
                        matchResults.push({ channel: 'whatsapp', status: res.success ? 'success' : 'failed' });
                    } catch (err) { matchResults.push({ channel: 'whatsapp', status: 'failed', error: err.message }); }
                }

                // Dispatch Email
                const emailAddr = lead.email || (Array.isArray(lead.emails) ? (lead.emails[0]?.address || lead.emails[0]) : null);
                if (toggles?.email && emailAddr) {
                    const template = buildEmailTemplate(propertyData, mockInv);
                    try {
                        await eSvc.sendEmail(emailAddr, template.subject, template.text, template.html);
                        matchResults.push({ channel: 'email', status: 'success' });
                    } catch (err) { matchResults.push({ channel: 'email', status: 'failed', error: err.message }); }
                }

                // Dispatch SMS
                if (toggles?.sms && (lead.mobile || lead.phones?.[0])) {
                    const mobile = lead.mobile || lead.phones?.[0]?.number || lead.phones?.[0];
                    const template = buildSmsTemplate(propertyData, mockInv);
                    try {
                        const res = await smsSvc.sendSms(mobile, template.message);
                        matchResults.push({ channel: 'sms', status: res.success ? 'success' : 'failed' });
                    } catch (err) { matchResults.push({ channel: 'sms', status: 'failed', error: err.message }); }
                }

                // Log Activity
                try {
                    await Activity.create({
                        type: 'Marketing',
                        subject: `Manual Property Share: ${propertyData.projectName || propertyData.unitNo || 'Property'}`,
                        entityType: 'Lead',
                        entityId: lead._id,
                        dueDate: new Date(),
                        performedAt: new Date(),
                        status: 'Completed',
                        description: `Dispatched details to ${lead.fullName || lead.firstName} via ${matchResults.filter(r => r.status === 'success').map(r => r.channel).join(', ') || 'none'}`,
                        details: { results: matchResults, toggles, inventoryId: isInventory ? dId : (propertyData.inventoryId || null) },
                        performedBy: req.user?.firstName || 'System',
                        assignedTo: req.user?._id
                    });
                } catch (logErr) { console.error('[ManualDispatch] Activity Log Error:', logErr.message); }

                overallResults.push({ dealId: dId, leadId: lId, results: matchResults });
            }
        }

        res.json({ success: true, results: overallResults });
    } catch (error) {
        console.error('[ManualDispatch] FATAL ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const activateDrip = async (req, res) => {
    try {
        const { leadId, sequenceId, delayMs = 0 } = req.body;
        const queue = await getMarketingQueue();
        const job = await queue.add('drip', { leadId, sequenceId, step: 1 }, { delay: parseInt(delayMs) });
        res.json({ success: true, jobId: job.id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const queue = await getMarketingQueue();
        const job = await queue.getJob(jobId);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        const state = await job.getState();
        res.json({ success: true, jobId, state, progress: job.progress, result: job.returnvalue });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ── Marketing Content CRUD ───────────────────────────────────────────────────

export const getMarketingContent = async (req, res) => {
    try {
        const content = await MarketingContent.find(req.query).sort({ date: 1 }).populate('dealId', 'unitNo').lean();
        res.json({ success: true, data: content });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const saveMarketingContent = async (req, res) => {
    try {
        const { id, ...data } = req.body;
        const content = id ? await MarketingContent.findByIdAndUpdate(id, data, { new: true }) : await MarketingContent.create({ ...data, author: req.user?.id });
        res.json({ success: true, data: content });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteMarketingContent = async (req, res) => {
    try {
        await MarketingContent.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const publishMarketingContent = async (req, res) => {
    try {
        const { contentId, phoneNumber } = req.body;
        const content = await MarketingContent.findById(contentId);
        if (!content) return res.status(404).json({ success: false, error: 'Content not found' });
        let result = content.platform?.toLowerCase() === 'whatsapp' ? await marketingPublishingService.publishToWhatsApp(contentId, phoneNumber) : await marketingPublishingService.publishToSocial(contentId);
        res.json({ success: true, message: result.message });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const broadcastToHub = async (req, res) => {
    try {
        const { id, type, platforms, privacy } = req.body;
        const Model = type === 'deal' ? Deal : Project;
        const data = await Model.findById(id).lean();
        if (!data) return res.status(404).json({ success: false, message: 'Item not found' });
        const results = await publishService.publish(data, { platforms, privacy, itemType: type });
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
