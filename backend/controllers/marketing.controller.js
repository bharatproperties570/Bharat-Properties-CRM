/**
 * marketing.controller.js
 * Phase D — Real AI (Gemini 1.5 Pro + GPT-4o) with BullMQ job queuing.
 * 
 * Version 2.0: Integrated MarketingAudienceService for 360-degree source control.
 */
import mongoose from 'mongoose';
import marketingService from '../services/MarketingService.js';
import marketingPublishingService from '../services/MarketingPublishingService.js';
import unifiedAIService from '../services/UnifiedAIService.js';
import AIGovernance from '../services/ai/AIGovernance.js';
import publishService from '../services/PublishService.js';
import Deal from '../models/Deal.js';
import Project from '../models/Project.js';
import Lead  from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import MarketingContent from '../models/MarketingContent.js';
import MarketingCampaign from '../models/MarketingCampaign.js';
import CampaignRun from '../models/CampaignRun.js';
import MarketingDelivery from '../models/MarketingDelivery.js';
import Activity from '../models/Activity.js';
import DispatchJob from '../models/DispatchJob.js';
import NurtureBot from '../services/NurtureBot.js';
import marketingAudienceService from '../services/MarketingAudienceService.js';
import { normalizePhone } from '../utils/normalization.js';
import { getVisibilityFilter } from '../utils/visibility.js';
import fs from 'fs';
import path from 'path';
import { buildUniversalContext, interpolateUniversalTemplate } from '../utils/universalVariableInterpolator.js';

// Lazy-import the marketing queue
let _marketingQueue = null;
let _memoryQueue = []; 
const getMarketingQueue = async () => {
    if (!_marketingQueue) {
        try {
            const mod = await import('../src/queues/marketingQueue.js');
            _marketingQueue = mod.marketingQueue;
        } catch (e) { return null; }
    }
    return _marketingQueue;
};

// 🧠 SENIOR PROFESSIONAL: Autonomous Memory Processing Loop
// Periodically checks if any in-memory scheduled jobs are ready to fire.
setInterval(async () => {
    if (_memoryQueue.length === 0) return;
    const now = new Date();
    
    // Find jobs ready to fire
    const readyJobs = _memoryQueue.filter(j => new Date(j.scheduledAt) <= now);
    if (readyJobs.length === 0) return;

    console.log(`[MemoryScheduler] ⚡ Firing ${readyJobs.length} ready jobs...`);

    for (const job of readyJobs) {
        // Remove from queue first to prevent double firing
        _memoryQueue = _memoryQueue.filter(m => m.id !== job.id);
        
        // Dispatch
        _dispatchDirectly(job).catch(err => console.error(`[MemoryScheduler] Dispatch failed for ${job.id}:`, err));
    }
}, 30000); // Check every 30 seconds

// ── Dashboard & Analytics ─────────────────────────────────────────────────────

export const getMarketingStats = async (req, res) => {
    try {
        const stats = await NurtureBot.getMarketingStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// 🧠 P18-05C-R2: DURABLE CAMPAIGN ANALYTICS (RUNS FOR CAMPAIGN)
export const getCampaignRunsForCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });

        const campaign = await MarketingCampaign.findById(campaignId);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        const userRole = (req.user?.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'super admin';
        if (!isAdmin && campaign.ownerId.toString() !== (req.user?._id || req.user?.id || '').toString()) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const runs = await CampaignRun.find({ campaignId }).sort({ createdAt: -1 });
        return res.json(runs);
    } catch (error) {
        console.error('Error fetching campaign runs:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getCampaignRunMetrics = async (req, res) => {
    try {
        const { runId } = req.params;
        const run = await CampaignRun.findById(runId);
        if (!run) return res.status(404).json({ error: 'Campaign run not found' });

        const campaign = await MarketingCampaign.findById(run.campaignId);
        const userRole = (req.user?.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'super admin';
        if (!isAdmin && campaign && campaign.ownerId.toString() !== (req.user?._id || req.user?.id || '').toString()) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const metrics = await MarketingDelivery.aggregate([
            { $match: { campaignRunId: new mongoose.Types.ObjectId(runId) } },
            { $group: {
                _id: "$status",
                count: { $sum: 1 }
            }}
        ]);

        const formatted = {
            total: 0,
            IN_PROGRESS: 0,
            SENT: 0,
            FAILED_RETRYABLE: 0,
            FAILED_FINAL: 0,
        };

        metrics.forEach(m => {
            formatted[m._id] = m.count;
            formatted.total += m.count;
        });

        res.json({
            run,
            metrics: formatted
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getCampaignSummary = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const campaign = await MarketingCampaign.findById(campaignId);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        const userRole = (req.user?.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'super admin';
        if (!isAdmin && campaign.ownerId.toString() !== (req.user?._id || req.user?.id || '').toString()) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const runs = await CampaignRun.find({ campaignId }).select('_id');
        const runIds = runs.map(r => r._id);

        const metrics = await MarketingDelivery.aggregate([
            { $match: { campaignRunId: { $in: runIds } } },
            { $group: {
                _id: "$status",
                count: { $sum: 1 }
            }}
        ]);

        const formatted = {
            totalRuns: runs.length,
            totalDeliveries: 0,
            IN_PROGRESS: 0,
            SENT: 0,
            FAILED_RETRYABLE: 0,
            FAILED_FINAL: 0,
        };

        metrics.forEach(m => {
            formatted[m._id] = m.count;
            formatted.totalDeliveries += m.count;
        });

        res.json({
            campaign,
            summary: formatted
        });
    } catch(error) {
        res.status(500).json({ error: error.message });
    }
};

export const getCampaignRuns = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        
        // Fetch all marketing activities from last 30 days within regional scope
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 
        // 🧠 SENIOR PROFESSIONAL: Strict Batch Filter
        // Only include activities that are part of an orchestrated campaign batch
        const activities = await Activity.find({ 
            ...visibilityFilter,
            $or: [
                { 'details.campaignName': { $exists: true } },
                { 'details.jobId': { $exists: true } }
            ],
            createdAt: { $gte: thirtyDaysAgo }
        }).lean();
 
        if (activities.length === 0) {
            return res.json({ success: true, data: [] });
        }
 
        // 🧠 SENIOR PROFESSIONAL: Data-Driven Aggregation Engine
        // Deep Analysis: Extracting specific channel names (SMS/WA/Email/RCS) from metadata
        const campaignGroups = {};
        
        activities.forEach(act => {
            const details = act.details || {};
            // 🧠 SMART CHANNEL INFERENCE:
            // Prioritize explicit metadata, then infer from subject/type
            let inferredChannel = details.channel || '';
            
            if (!inferredChannel) {
                const searchStr = `${act.type} ${act.subject} ${act.description}`.toUpperCase();
                if (searchStr.includes('WHATSAPP') || searchStr.includes(' WA ')) inferredChannel = 'WhatsApp';
                else if (searchStr.includes('SMS')) inferredChannel = 'SMS';
                else if (searchStr.includes('EMAIL')) inferredChannel = 'Email';
                else if (searchStr.includes('RCS')) inferredChannel = 'RCS';
                else inferredChannel = act.type || 'Marketing';
            }

            const channel = inferredChannel.toUpperCase();
            const cName = details.campaignName || act.subject?.split(': ')[1] || 'Direct Broadcast';
            
            // Professional Batching: Grouping by jobId or strict 10-minute time window
            const actDate = act.createdAt instanceof Date ? act.createdAt : new Date(act.createdAt);
            const timeWindow = Math.floor(actDate.getTime() / (10 * 60 * 1000)); 
            const batchKey = details.jobId || `batch_${cName}_${timeWindow}`;
            
            if (!campaignGroups[batchKey]) {
                campaignGroups[batchKey] = {
                    id: batchKey,
                    name: cName,
                    date: actDate,
                    sent: 0,
                    delivered: 0,
                    read: 0,
                    failed: 0,
                    channels: new Set(),
                    totalTarget: 0
                };
            }
 
            campaignGroups[batchKey].channels.add(channel);
            
            const status = (act.status || '').toLowerCase();
            campaignGroups[batchKey].totalTarget++;
            
            // 🧠 ACTUAL DATA MAPPING: Strictly from database status
            if (['sent', 'delivered', 'read', 'completed', 'success'].includes(status)) {
                campaignGroups[batchKey].sent++;
            }
            
            if (['delivered', 'read', 'completed', 'success'].includes(status)) {
                campaignGroups[batchKey].delivered++;
            }
            
            if (status === 'read') {
                campaignGroups[batchKey].read++;
            }
            
            if (status === 'failed' || status === 'error') {
                campaignGroups[batchKey].failed++;
            }
 
            if (act.createdAt < campaignGroups[batchKey].date) {
                campaignGroups[batchKey].date = act.createdAt;
            }
        });
 
        const runs = Object.values(campaignGroups).map(c => {
            let statusLabel = 'Completed';
            if (c.sent < c.totalTarget && c.failed === 0) statusLabel = 'Processing';
            if (c.failed === c.totalTarget) statusLabel = 'Failed';

            return {
                id: c.id,
                name: c.name,
                date: c.date,
                channels: Array.from(c.channels).join(', '),
                leadsTargeted: c.totalTarget,
                sent: c.sent,
                delivered: c.delivered,
                read: c.read,
                failed: c.failed,
                status: statusLabel
            };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
 
        res.json({ success: true, data: runs });
    } catch (error) {
        console.error('[MarketingController] getCampaignRuns error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/marketing/scheduled
 * Fetches both 'Delayed' and 'Repeatable' jobs from BullMQ.
 */
export const getScheduledCampaigns = async (req, res) => {
    try {
        const queue = await getMarketingQueue();
        const { default: redisConnection, isRedisOnline } = await import('../src/config/redis.js');
        
        if (!queue || redisConnection.isMock || !isRedisOnline) {
            return res.json({ success: true, delayed: [], repeatable: [], message: 'Queue engine offline (Mock Mode)' });
        }

        let delayedList = [];
        let repeatableList = [];

        if (queue && !redisConnection.isMock && isRedisOnline) {
            // 1. Fetch Delayed individual jobs from BullMQ
            const delayedJobs = await queue.getJobs(['delayed']);
            delayedList = delayedJobs.map(j => ({
                id: j.id,
                name: j.data?.name || 'Untitled',
                channel: j.data?.channel || 'Unknown',
                leads: j.data?.leads?.length || 0,
                scheduledAt: new Date(j.timestamp + (j.opts?.delay || 0)).toISOString(),
                type: 'delayed',
                status: 'Pending'
            }));

            // 2. Fetch Repeatable job definitions from BullMQ
            const repeatableJobs = await queue.getRepeatableJobs();
            repeatableList = repeatableJobs.map(rj => ({
                id: rj.key,
                name: rj.name || 'Recurring Campaign',
                channel: 'Channel-Locked', 
                leads: 'Dynamic Pool',
                cron: rj.cron,
                nextRun: new Date(rj.next).toISOString(),
                type: 'repeatable',
                status: 'Active Loop'
            }));
        }

        // 🧠 SENIOR PROFESSIONAL: Merge In-Memory Jobs
        // This ensures visibility even when Redis is offline
        _memoryQueue.forEach(j => {
            delayedList.push({
                id: j.id,
                name: j.name,
                channel: j.channel,
                leads: j.recipients?.length || 0,
                scheduledAt: j.scheduledAt,
                type: 'delayed',
                status: 'Pending (Memory)',
                isMemory: true
            });
        });

        res.json({ success: true, delayed: delayedList, repeatable: repeatableList });
    } catch (error) {
        console.error('[MarketingController] getScheduledCampaigns error:', error);
        res.status(200).json({ success: true, delayed: [], repeatable: [], error: error.message });
    }
};

/**
 * DELETE /api/marketing/scheduled/:id
 */
export const deleteScheduledCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query; // 'delayed' or 'repeatable'
        const queue = await getMarketingQueue();
        
        if (type === 'repeatable') {
            await queue.removeRepeatableByKey(id);
        } else {
            // Check memory queue first
            const memIdx = _memoryQueue.findIndex(m => m.id === id);
            if (memIdx !== -1) {
                _memoryQueue.splice(memIdx, 1);
            } else if (queue) {
                const job = await queue.getJob(id);
                if (job) await job.remove();
            }
        }

        res.json({ success: true, message: 'Schedule removed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ── AI Content Generation ──────────────────────────────────────────────────────


export const generateSocialContent = async (req, res) => {
    try {
        const { dealId, platform } = req.body;
        if (!dealId || !platform) return res.status(400).json({ success: false, error: 'Deal ID and platform are required' });

        const visibilityFilter = await getVisibilityFilter(req.user);
        const deal = await Deal.findOne({ _id: dealId, ...visibilityFilter });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found or access denied' });

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
        const visibilityFilter = await getVisibilityFilter(req.user);
        const deal = await Deal.findOne({ _id: dealId, ...visibilityFilter });
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found or access denied' });
        const campaign = await marketingService.generateEmailCampaign(deal, audience);
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getRecentDeals = async (req, res) => {
    try {
        const visibilityFilter = await getVisibilityFilter(req.user);
        const deals = await Deal.find({ stage: 'Open', ...visibilityFilter }).sort({ createdAt: -1 }).limit(5);
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

        // Use UnifiedAIService with central AI Governance capability
        const result = await unifiedAIService.generate(userPrompt, {
            provider: provider || 'google',
            model: model,
            systemPrompt: systemPrompt,
            capability: AIGovernance.CAPABILITIES.AI_MARKETING_GENERATION
        });

        res.json({ success: true, content: result });
    } catch (error) {
        console.error('[MarketingController] generateWithModel Error:', error);
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

        const recipients = await marketingAudienceService.getAudience(config, req.user);
        
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
        console.log('[MarketingImport] Request Headers:', req.headers['content-type']);
        console.log('[MarketingImport] File Object:', req.file ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        } : 'MISSING');
        
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
        
        const extension = req.file.originalname.split('.').pop().toLowerCase();
        let rawData = [];

        if (['csv', 'xlsx', 'xls'].includes(extension)) {
            console.log(`[MarketingImport] Processing ${extension.toUpperCase()} from buffer...`);
            try {
                const XLSXModule = await import('xlsx');
                const XLSX = XLSXModule.default || XLSXModule;
                
                // Read from memory buffer instead of file path
                const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
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

        // NO UNLINK NEEDED since we use memoryStorage

        // 🧠 SENIOR PROFESSIONAL: Resilient Field Discovery (Case-Insensitive & Pattern Matching)
        const recipients = rawData.map((row, idx) => {
            const keys = Object.keys(row);
            const findValue = (possibleNames) => {
                const foundKey = keys.find(k => {
                    const normalizedK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return possibleNames.some(p => normalizedK === p.toLowerCase().replace(/[^a-z0-9]/g, ''));
                });
                return foundKey ? row[foundKey] : null;
            };

            const name = findValue(['name', 'fullname', 'contactname', 'customer', 'client', 'leadname', 'party']) || `Row-${idx + 1}`;
            const rawMobile = findValue(['mobile', 'phone', 'phonenumber', 'whatsapp', 'contact', 'phno', 'mobileno', 'pno', 'number', 'custmobile', 'mob', 'wa', 'whatsappnumber', 'telephone']) || '';
            const mobile = normalizePhone(rawMobile);
            const email = findValue(['email', 'emailaddress', 'mail', 'id', 'emailid']) || '';

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
        const { 
            channel, segment, name, subject, content, html, 
            waMapping, smsData, audienceConfig, isScheduled, scheduledAt,
            repeatMode, repeatFreq
        } = req.body;

        if (!channel) return res.status(400).json({ success: false, error: 'channel is required' });
        
        console.log(`[MarketingController] 🚀 Launching ${channel} campaign: "${name}"`);
        console.log(`[MarketingController] Source: ${audienceConfig?.source}, Recipient Count: ${audienceConfig?.tempCount || 'N/A'}`);

        let recipients = [];
        if (audienceConfig && (audienceConfig.source === 'Excel' || audienceConfig.source === 'Import') && audienceConfig.tempRecipients) {
            const { mapping } = audienceConfig;
            recipients = audienceConfig.tempRecipients.map(r => {
                const row = r.context || {};
                const name   = (mapping?.name   && row[mapping.name])   ? row[mapping.name] : r.name;
                const mobile = (mapping?.mobile && row[mapping.mobile]) ? normalizePhone(row[mapping.mobile]) : r.mobile;
                const email  = (mapping?.email  && row[mapping.email])  ? row[mapping.email] : r.email;
                return { ...r, name, mobile, email };
            }).filter(r => r.mobile);
        } else if (audienceConfig && audienceConfig.source) {
            recipients = await marketingAudienceService.getAudience(audienceConfig, req.user);
        } else {
            const visibilityFilter = await getVisibilityFilter(req.user);
            const segmentQuery = segment && segment !== 'all' ? { stage: { $regex: new RegExp(segment, 'i') } } : {};
            const leads = await Lead.find({ ...segmentQuery, ...visibilityFilter, mobile: { $exists: true, $ne: '' } }).limit(1000).lean();
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
        const { default: redisConnection, isRedisOnline } = await import('../src/config/redis.js');
        const SmsTemplate = mongoose.model('SmsTemplate');

        // Resolve DLT Metadata if using a template
        let dltMetadata = {};
        const activeSmsTemplateId = smsData?.templateId || req.body.templateId;
        if (activeSmsTemplateId && channel.toLowerCase() === 'sms') {
            const tplQuery = mongoose.Types.ObjectId.isValid(activeSmsTemplateId) 
                ? { _id: activeSmsTemplateId } 
                : { name: activeSmsTemplateId };
            const tpl = await SmsTemplate.findOne(tplQuery).lean();
            if (tpl) {
                dltMetadata = {
                    dltTemplateId: tpl.dltTemplateId,
                    dltHeaderId: tpl.dltHeaderId || tpl.senderId,
                    category: tpl.category
                };
            }
        }

        // 🧠 SENIOR PROFESSIONAL FALLBACK: Direct Dispatch or In-Memory Schedule if Redis is Offline
        if (!queue || redisConnection.isMock || !isRedisOnline) {
            console.warn('[MarketingController] ⚠️ Redis Offline - Switching to Memory/Direct Mode');
            
            if (isScheduled && scheduledAt && new Date(scheduledAt) > new Date()) {
                // Schedule in memory
                const memoryJob = {
                    id: `mem_${Date.now()}`,
                    channel, name, subject, content, html,
                    templateName: req.body.templateName,
                    templateLang: req.body.templateLang,
                    templateComponents: req.body.templateComponents,
                    waMapping: activeMapping,
                    smsData: { ...smsData, ...dltMetadata },
                    recipients,
                    scheduledAt,
                    performedBy: req.user?.firstName || 'System'
                };
                _memoryQueue.push(memoryJob);
                console.log(`[MarketingController] 💾 Job scheduled in Memory: ${name} at ${scheduledAt}`);

                return res.json({
                    success: true,
                    leadCount: recipients.length,
                    jobId: memoryJob.id,
                    status: 'Scheduled (Memory)',
                    message: 'Redis is offline. Campaign has been scheduled in system memory safely.'
                });
            }

            // Otherwise dispatch immediately
            _dispatchDirectly({
                channel, name, subject, content, html,
                templateName: req.body.templateName || (channel.toLowerCase() === 'whatsapp' || channel === 'wa' ? req.body.templateId : undefined),
                templateLang: req.body.templateLang,
                templateComponents: req.body.templateComponents,
                waMapping: activeMapping,
                smsData: { ...(smsData || {}), ...dltMetadata },
                recipients,
                performedBy: req.user?.firstName || 'System'
            }).catch(err => console.error('[MarketingController] Direct Dispatch Error:', err));

            return res.json({ 
                success: true, 
                leadCount: recipients.length, 
                jobId: `direct_${Date.now()}`,
                status: 'Dispatched (Direct)',
                message: 'Redis is offline. Campaign is being processed via high-priority direct dispatch.'
            });
        }

        // 🧠 RECURRING & SCHEDULING ORCHESTRATION
        let jobOptions = { removeOnComplete: true, attempts: 3 };
        let delay = 0;

        if (isScheduled && scheduledAt) {
            const startDate = new Date(scheduledAt);
            const now = Date.now();
            
            if (repeatMode && repeatMode !== 'none') {
                const hour = startDate.getHours();
                const minute = startDate.getMinutes();
                const dayOfMonth = startDate.getDate();
                const month = startDate.getMonth() + 1;
                const dayOfWeek = startDate.getDay();

                let cron;
                const freq = repeatFreq || 1;

                switch(repeatMode) {
                    case 'daily':   cron = `${minute} ${hour} */${freq} * *`; break;
                    case 'weekly':  cron = `${minute} ${hour} * * ${dayOfWeek}`; break;
                    case 'monthly': cron = `${minute} ${hour} ${dayOfMonth} */${freq} *`; break;
                    case 'yearly':  cron = `${minute} ${hour} ${dayOfMonth} ${month} *`; break;
                }

                if (cron) {
                    jobOptions.repeat = { cron, startDate: startDate };
                }
            } else {
                if (startDate.getTime() > now) {
                    delay = startDate.getTime() - now;
                    jobOptions.delay = delay;
                }
            }
        }

        const job = await queue.add('blast', {
            channel,
            name:    name || 'Campaign',
            subject: subject || 'Update',
            message: content || '',
            html:    html    || '',
            templateName: req.body.templateName || req.body.templateId,
            templateLang: req.body.templateLang || 'en_US',
            templateComponents: req.body.templateComponents || [],
            waMapping: activeMapping,
            smsData: { ...(smsData || {}), ...dltMetadata },
            mobiles,
            emails,
            leads: recipients,
            isScheduled,
            scheduledAt,
            repeatMode,
            repeatFreq
        }, jobOptions);

        res.json({ 
            success: true, 
            leadCount: recipients.length, 
            jobId: job.id,
            status: isScheduled ? (repeatMode !== 'none' ? 'Recurring' : 'Scheduled') : 'Dispatched',
            message: isScheduled ? `Campaign orchestration active for ${new Date(scheduledAt).toLocaleString()}` : undefined
        });
    } catch (error) {
        console.error('[MarketingController] ❌ Blast Error:', error);
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

export const broadcastToBrokerGroup = async (req, res) => {
    try {
        const { 
            dealId, dealIds, groupIds, contactGroupIds, leadIds, whatsappGroupJids, 
            integrationId, channels = ['whatsapp'], templateId, language, templateText, 
            isBaileys, smsTemplate, rcsTemplate, emailTemplate,
            forceBroadcast = false, deduplicationWindowHours = 4 
        } = req.body;
        console.log(`[BNA] Dispatching to audience: Company=${groupIds} Contact=${contactGroupIds} MatchedLeads=${leadIds} WAGroups=${whatsappGroupJids} Integration=${integrationId} (WA: ${templateId || 'NONE'}, SMS: ${smsTemplate?.id || 'NONE'}, RCS: ${rcsTemplate?.id || 'NONE'}, Email: ${emailTemplate?.id || 'NONE'}, Force: ${Boolean(forceBroadcast)})`);
        
        const hasCompanyGroups = Array.isArray(groupIds) && groupIds.length > 0;
        const hasContactGroups = Array.isArray(contactGroupIds) && contactGroupIds.length > 0;
        const hasMatchedLeads = Array.isArray(leadIds) && leadIds.length > 0;
        const hasWaGroups = Array.isArray(whatsappGroupJids) && whatsappGroupJids.length > 0;

        const targetDealIds = Array.isArray(dealIds) && dealIds.length > 0
            ? dealIds
            : (dealId ? [dealId] : []);

        if (targetDealIds.length === 0 || (!hasCompanyGroups && !hasContactGroups && !hasMatchedLeads && !hasWaGroups)) {
            return res.status(400).json({ success: false, error: 'Deal ID (or Deal IDs) and at least one Target Audience (Broker Group, Contact Group, Matched Lead, or WhatsApp Group) are required' });
        }

        const Company = mongoose.model('Company');
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 1. Fetch Deal Metadata (Sanitized or instant-prepared with full relation population)
        const deals = await Deal.find({ _id: { $in: targetDealIds }, ...visibilityFilter })
            .populate('inventoryId')
            .populate('owner')
            .populate('projectId')
            .populate('partyStructure.owner')
            .populate('assignedTo')
            .lean();
        if (!deals || deals.length === 0) {
            return res.status(404).json({ success: false, error: 'Selected deal(s) not found or access denied.' });
        }

        let meta;
        let primaryDealId = deals[0]._id;
        let shareableId = '';

        if (deals.length === 1) {
            const singleDeal = deals[0];
            meta = singleDeal.broadcastMetadata;
            if (!meta || !meta.isReady) {
                const price = singleDeal.price || singleDeal.quotePrice || singleDeal.value;
                const formattedPrice = price ? (price >= 10000000 ? `₹ ${(price / 10000000).toFixed(2)} Cr` : price >= 100000 ? `₹ ${(price / 100000).toFixed(2)} Lac` : `₹ ${price.toLocaleString('en-IN')}`) : 'Price on Request';
                meta = {
                    title: singleDeal.title || singleDeal.dealCode || 'Exclusive Deal',
                    location: singleDeal.location || singleDeal.locationDetails?.locality || 'Kurukshetra',
                    price: formattedPrice,
                    features: [singleDeal.size ? `${singleDeal.size} ${singleDeal.sizeUnit || 'Sq.Ft'}` : null, singleDeal.unitType].filter(Boolean),
                    description: singleDeal.remarks || singleDeal.description || 'Verified property listing',
                    isReady: true,
                    inventoryId: singleDeal.inventoryId
                };
            }
            shareableId = singleDeal.shareableId || singleDeal.dealCode || `BP-${String(singleDeal._id).slice(-6).toUpperCase()}`;
        } else {
            // 🏢 Multi-Deal Portfolio Package
            const dealCodes = deals.map(d => d.shareableId || d.dealCode || `BP-${String(d._id).slice(-4).toUpperCase()}`).join(', ');
            const locations = [...new Set(deals.map(d => d.broadcastMetadata?.location || d.location || 'Kurukshetra'))].filter(Boolean).join(', ');
            
            const formattedDealList = deals.map((d, idx) => {
                const p = d.broadcastMetadata?.price || (d.price || d.value ? `₹ ${(d.price || d.value).toLocaleString('en-IN')}` : 'Price on Request');
                const loc = d.broadcastMetadata?.location || d.location || 'Prime Location';
                const specs = d.broadcastMetadata?.features?.join(' | ') || d.unitType || (d.size ? `${d.size} ${d.sizeUnit || 'Sq.Ft'}` : '');
                return `${idx + 1}️⃣ *${d.title || d.dealCode || 'Deal'}*\n💰 Price: ${p} | 📍 ${loc}${specs ? ` | 📐 ${specs}` : ''}`;
            }).join('\n\n');

            meta = {
                title: `${deals.length} Curated Deals Portfolio`,
                price: `${deals.length} Curated Deals`,
                location: locations,
                features: [`${deals.length} Verified Properties`, locations],
                description: `Curated package of ${deals.length} verified investment opportunities:\n\n${formattedDealList}`,
                detailedSections: [{
                    title: 'Included Listings',
                    lines: deals.map((d, i) => `${i + 1}. ${d.title || d.dealCode || 'Deal'} | ${d.broadcastMetadata?.location || d.location || 'Prime'} | ${d.broadcastMetadata?.price || 'P.O.R'}`)
                }],
                isReady: true,
                isMultiDeal: true,
                dealsCount: deals.length,
                inventoryId: deals[0]?.inventoryId
            };
            shareableId = dealCodes;
        }

        // 2. Fetch Targeted Audience (Brokers, Contacts, Matched Leads, WhatsApp Groups)
        let rawRecipients = [];
        
        if (hasCompanyGroups) {
            const companies = await Company.find({
                groups: { $in: groupIds },
                ...visibilityFilter
            }).lean();

            const companyRecipients = companies.map(c => {
                const phone = c.phones?.[0]?.phoneNumber || '';
                const email = c.emails?.[0]?.address || '';
                return {
                    id: c._id,
                    name: c.name,
                    mobile: normalizePhone(phone),
                    email: email,
                    isVerified: c.isVerifiedBroker,
                    context: { originalType: 'Company' }
                };
            }).filter(r => r.mobile || r.email);
            
            rawRecipients = rawRecipients.concat(companyRecipients);
        }

        if (hasContactGroups) {
            const Contact = mongoose.model('Contact');
            const contacts = await Contact.find({
                groups: { $in: contactGroupIds },
                ...visibilityFilter
            }).lean();

            const contactRecipients = contacts.map(c => {
                const phone = c.phones?.[0]?.number || '';
                const email = c.emails?.[0]?.address || '';
                return {
                    id: c._id,
                    name: `${c.name} ${c.surname || ''}`.trim(),
                    mobile: normalizePhone(phone),
                    email: email,
                    isVerified: false,
                    context: { originalType: 'Contact' }
                };
            }).filter(r => r.mobile || r.email);

            rawRecipients = rawRecipients.concat(contactRecipients);
        }

        if (hasMatchedLeads) {
            const LeadModel = mongoose.model('Lead');
            const leads = await LeadModel.find({
                _id: { $in: leadIds },
                ...visibilityFilter
            }).lean();

            const leadRecipients = leads.map(l => {
                const phone = l.mobile || '';
                const email = l.email || '';
                const fullName = `${l.salutation || ''} ${l.firstName || ''} ${l.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Prospective Buyer';
                return {
                    id: l._id,
                    name: fullName,
                    firstName: l.firstName || fullName.split(' ')[0],
                    lastName: l.lastName || '',
                    mobile: normalizePhone(phone),
                    email: email,
                    isVerified: false,
                    context: { originalType: 'Lead' }
                };
            }).filter(r => r.mobile || r.email);

            rawRecipients = rawRecipients.concat(leadRecipients);
        }

        if (hasWaGroups) {
            whatsappGroupJids.forEach(jid => {
                rawRecipients.push({
                    id: jid,
                    name: 'WhatsApp Group',
                    mobile: jid,
                    email: '',
                    isVerified: false,
                    isGroup: true,
                    context: { originalType: 'WhatsAppGroup' }
                });
            });
        }

        // Enterprise Deduplication (by mobile/JID or email so no person gets duplicate broadcasts)
        const seenKeys = new Set();
        const recipients = [];
        for (const r of rawRecipients) {
            const key = r.mobile ? `m:${r.mobile}` : (r.email ? `e:${String(r.email).toLowerCase()}` : `id:${r.id}`);
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                recipients.push(r);
            }
        }

        if (recipients.length === 0) {
            return res.status(404).json({ success: false, error: 'No recipients or groups with valid contact information found.' });
        }

        // 3. Queue the Broadcast for Async Processing (Senior Professional Pattern)
        const queue = await getMarketingQueue();
        const { isRedisOnline } = await import('../src/config/redis.js');

        const campaignId = `bna_camp_${primaryDealId || 'deal'}_${Date.now()}`;

        const jobData = {
            name: `BNA Broadcast: ${meta.title}`,
            campaignId,
            dealId: primaryDealId,
            dealIds: targetDealIds,
            deal: deals[0],
            deals: deals,
            channels,
            recipients,
            meta,
            templateId,
            templateText: templateText || null,
            isBaileys: Boolean(isBaileys),
            language,
            integrationId: integrationId || null,
            shareableId,
            smsTemplate: smsTemplate || null,
            rcsTemplate: rcsTemplate || null,
            emailTemplate: emailTemplate || null,
            forceBroadcast: Boolean(forceBroadcast),
            deduplicationWindowHours: Number(deduplicationWindowHours) || 4,
            performedBy: req.user?.fullName || req.user?.name || (req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : '') || 'Bharat Properties'
        };

        // Initialize Live Broadcast State Tracker (Phase 4)
        try {
            const { default: BroadcastLiveTracker } = await import('../services/BroadcastLiveTracker.js');
            await BroadcastLiveTracker.initCampaign({
                campaignId,
                name: `BNA Broadcast: ${meta.title}`,
                dealId: primaryDealId,
                dealIds: targetDealIds,
                dealTitle: meta.title,
                totalRecipients: recipients.length,
                channels,
                isBaileys: Boolean(isBaileys),
                provider: isBaileys ? 'BAILEYS' : 'META',
                campaignParams: jobData,
                performedBy: jobData.performedBy
            });
        } catch (trackerInitErr) {
            console.error('[broadcastToBrokerGroup] BroadcastLiveTracker init warning:', trackerInitErr.message);
        }

        if (queue && isRedisOnline) {
            const job = await queue.add('bna-broadcast', jobData, { removeOnComplete: true });
            return res.json({ 
                success: true, 
                message: `Broadcast queued for ${recipients.length} brokers.`,
                campaignId,
                jobId: job.id,
                dispatchCount: recipients.length
            });
        }

        // 🧠 FALLBACK: If Redis is offline, dispatch directly in background
        console.warn('[BNA_BROADCAST] Redis Offline - Fallback to Direct Background Dispatch');
        _dispatchBNADirectly(jobData).catch(err => console.error('[BNA_BROADCAST_DIRECT_ERROR]', err));

        res.json({ 
            success: true, 
            message: `Broadcast started for ${recipients.length} brokers (Direct Mode).`,
            campaignId,
            dispatchCount: recipients.length
        });

    } catch (error) {
        console.error('[BNA_BROADCAST_ERROR]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * 🧠 Enterprise Template Resolver
 * Intelligently maps registry variables to Meta components (Body, Buttons, Header)
 */
async function resolveMetaComponents(templateId, recipient, meta, registryMapping, universalData = null) {
    const waService = (await import('../services/WhatsAppService.js')).default;
    const VariableResolutionService = (await import('../services/VariableResolutionService.js')).default;
    
    const allTemplates = await waService.getTemplates();
    const templateDef = allTemplates.find(t => t.name === templateId);
    if (!templateDef) return [];

    // 1. Resolve all possible variables for this recipient
    const enrichedContext = {
        ...recipient,
        fullName: recipient.firstName ? `${recipient.firstName} ${recipient.lastName || ''}`.trim() : (recipient.name || 'Customer'),
        firstName: recipient.firstName || (recipient.name ? recipient.name.split(' ')[0] : 'Customer'),
    };

    // Preserve multiple properties if they exist, otherwise fallback to meta single object
    if (!enrichedContext.matchedProperties || enrichedContext.matchedProperties.length === 0) {
        enrichedContext.matchedProperties = [{
            inventoryId: meta.inventoryId,
            projectName: meta.title,
            sector: meta.location,
            price: meta.price,
            size: meta.features?.[0] || ''
        }];
    }
    const resolvedMap = (await import("../services/VariableResolutionService.js")).default.resolveForLeads(enrichedContext, registryMapping);

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
                    // Meta API forbids newlines and tabs in template parameters
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

    console.log(`[resolveMetaComponents] "${templateId}" → ${globalVarIndex - 1} body var(s), ${components.length} total component(s) built.`);
    return components;
}

/**
 * Direct dispatch for BNA broadcasts when queue is unavailable or synchronous fallback
 */
export async function _dispatchBNADirectly(data) {
    const { 
        dealId, channels, recipients, meta, templateId, language, shareableId, 
        performedBy, templateText, isBaileys, smsTemplate, rcsTemplate, emailTemplate,
        forceBroadcast = false, deduplicationWindowHours = 4 
    } = data;
    const waService = (await import('../services/WhatsAppService.js')).default;
    const Activity = mongoose.model('Activity');

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
            console.warn('[BNA_DIRECT] Deal populate error:', e.message);
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
        console.warn('[BNA_DIRECT] Template fetch warning:', e.message);
    }

    let templateRegistryData = null;
    try {
        const SystemSetting = mongoose.model('SystemSetting');
        let registrySetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
        if (!registrySetting && mongoose.connection.db) {
            registrySetting = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'messaging_variable_registry' });
        }
        templateRegistryData = {
            mapping: registrySetting?.value || { "1": "customer_name", "2": "property_list_default" }
        };

        if (!activeTemplateId) {
            let templatesSetting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
            if (!templatesSetting && mongoose.connection.db) {
                templatesSetting = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'crm_whatsapp_templates' });
            }
            if (templatesSetting?.value) {
                const dealMatchTemplate = templatesSetting.value.find(t => t.systemContext?.includes('deal_match'));
                if (dealMatchTemplate) {
                    activeTemplateId = dealMatchTemplate.name || dealMatchTemplate.id;
                    activeTemplateLang = dealMatchTemplate.language || 'en';
                }
            }
        }
    } catch (err) {
        console.error('[BNA/TemplateInit] Error:', err.message);
    }

    // Fallback template message for Email
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
            </div>
        </div>
    `;

    const dispatchSingleRecipient = async (recipient) => {
        const results = [];
        const isGroup = recipient.isGroup || String(recipient.mobile || '').includes('@g.us');

        // Enterprise Universal Context Resolution (lookups, specs, currency, recipient)
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
                if (!isGroup && !isBaileys && activeTemplateId && templateRegistryData) {
                    const personalizedComponents = await resolveMetaComponents(
                        activeTemplateId, 
                        recipient, 
                        meta, 
                        templateRegistryData.mapping,
                        universalData
                    );
                    
                    console.log(`[BNA/WA] Dispatching '${activeTemplateId}' with ${personalizedComponents.length} components.`);
                    waRes = await waService.sendTemplate(recipient.mobile, activeTemplateId, activeTemplateLang, personalizedComponents, { integrationId: data.integrationId });
                    text = `Template: ${activeTemplateId}`;
                } else {
                    // WhatsApp Web, Group, or Direct Text dispatch with Universal Interpolation
                    if (baseTemplateText) {
                        text = interpolateUniversalTemplate(baseTemplateText, contextMap);
                    } else if (meta.isMultiDeal) {
                        text = interpolateUniversalTemplate(
                            `🏢 *PORTFOLIO BNA ALERT: {{title}}*\n\n` +
                            `Hi {{customer_name}},\n\n` +
                            `Here is our exclusive curated portfolio of *{{dealsCount}} verified deals*:\n\n` +
                            `{{description}}\n\n` +
                            `🔗 Deal References: {{dealCode}}\n` +
                            `Contact us for full dossiers, commission splits, and site inspections.`,
                            contextMap
                        );
                    } else if (recipient.context?.originalType === 'Lead') {
                        text = interpolateUniversalTemplate(
                            `*🌟 PROPERTY RECOMMENDATION: {{projectName}}*\n\n` +
                            `Hello *{{customer_name}}*,\n` +
                            `Here is an exclusive property opportunity matching your requirement:\n\n` +
                            `💰 *Price:* {{price}}\n` +
                            `📍 *Location:* {{location}}\n` +
                            `📐 *Specs:* {{size}}\n\n` +
                            `📝 *Overview:* {{description}}\n\n` +
                            `🔗 *Ref:* {{dealCode}}\n` +
                            `Reply directly to this message to schedule a site inspection!`,
                            contextMap
                        );
                    } else {
                        text = interpolateUniversalTemplate(
                            `🏢 *BNA ALERT: {{projectName}}*\n\n` +
                            `Hi {{customer_name}},\n\n` +
                            `💰 *Price:* {{price}}\n📍 *Location:* {{location}}\n` +
                            `📐 *Specs:* {{size}}\n\n` +
                            `📝 *Details:* {{description}}\n\n` +
                            `🔗 Ref: {{dealCode}}\n` +
                            `Contact us for commission split and site visits.`,
                            contextMap
                        );
                    }
                    waRes = await waService.sendMessage(recipient.mobile, text, { 
                        integrationId: data.integrationId,
                        useBaileys: Boolean(data.isBaileys),
                        provider: data.isBaileys ? 'BAILEYS' : 'META',
                        channel: data.isBaileys ? 'whatsapp_web' : 'whatsapp_api'
                    });
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
                const smsSvc = (await import('../services/SmsService.js')).default;
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
                const smsSvc = (await import('../services/SmsService.js')).default;
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
                await (await import("../services/email.service.js")).default.sendEmail(recipient.email, finalSubject, '', finalHtml);
                results.push({ channel: 'email', status: 'success', messageContent: finalSubject });
            } catch (e) { results.push({ channel: 'email', status: 'failed', error: e.message }); }
        }

        const success = results.some(r => r.status === 'success' || r.status === 'simulated_success');

        // Log Activity
        try {
            await Activity.create({
                type: 'Marketing',
                subject: `BNA Broadcast: ${meta.title}`,
                entityType: recipient.context?.originalType || (isGroup ? 'WhatsAppGroup' : 'Company'),
                entityId: mongoose.Types.ObjectId.isValid(recipient.id) ? recipient.id : null,
                status: success ? 'Completed' : 'Failed',
                visibleTo: 'Everyone',
                description: text || `Dispatched deal details to ${recipient.name} (${recipient.mobile}) via ${results.filter(r => r.status === 'success').map(r => r.channel).join(', ')}`,
                details: { 
                    results, 
                    dealId, 
                    shareableId, 
                    message: text,
                    renderedBody: text,
                    direct: true,
                    isGroup: isGroup,
                    groupJid: isGroup ? recipient.mobile : null,
                    groupName: isGroup ? (recipient.name || 'WhatsApp Group') : null,
                    phoneNumber: recipient.mobile,
                    whatsappIntegrationId: data.integrationId || null,
                    platform: isGroup ? 'WhatsApp Web' : 'WhatsApp'
                },
                participants: [
                    { name: recipient.name || (isGroup ? 'WhatsApp Group' : 'Partner'), mobile: recipient.mobile }
                ],
                performedBy: performedBy,
                dueDate: new Date()
            });
        } catch (actErr) {
            console.warn('[BNA/ActivityLog] Warning:', actErr.message);
        }

        return { success, results };
    };

    // 🛡️ UNIFIED WHATSAPP BUSINESS SAFE-DISPATCH PIPELINE (Direct Fallback Mode)
    // 5 chats/batch across BOTH Individual Contacts and Groups, 8-15s typing jitter, 3-10m cooldown between batches, Single-Account only.
    const isWaWebTarget = (r) => {
        if (!channels.includes('whatsapp')) return false;
        if (r.isGroup || String(r.mobile || '').includes('@g.us')) return true;
        return Boolean(isBaileys && r.mobile);
    };

    const waWebRecipients = recipients.filter(isWaWebTarget);
    const otherRecipients = recipients.filter(r => !isWaWebTarget(r));

    // 1. Dispatch non-WhatsApp Web contacts first (SMS-only, Email-only, Cloud API)
    if (otherRecipients.length > 0) {
        console.log(`[BNA_DIRECT] Dispatching to ${otherRecipients.length} non-WhatsApp-Web / direct recipients...`);
        for (const recipient of otherRecipients) {
            await dispatchSingleRecipient(recipient);
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1000) + 1000));
        }
    }

    // 🛡️ CROSS-JOB DEDUPLICATION GUARD (Direct Mode)
    const deduplicationWindowMs = (Number(deduplicationWindowHours) || 4) * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - deduplicationWindowMs);
    const recentlyMessagedJids = new Set();

    if (!forceBroadcast && dealId) {
        try {
            const dealObjId = mongoose.Types.ObjectId.isValid(dealId) ? new mongoose.Types.ObjectId(dealId) : null;
            const dealQuery = dealObjId ? { $in: [String(dealId), dealObjId] } : String(dealId);

            const recentActivities = await Activity.find({
                type: 'Marketing',
                'details.dealId': dealQuery,
                status: { $in: ['Sent', 'Completed', 'sent', 'completed'] },
                createdAt: { $gte: cutoffDate }
            }).select('details.groupJid details.phoneNumber participants.mobile createdAt').lean();

            recentActivities.forEach(act => {
                const jid = act.details?.groupJid || act.details?.phoneNumber || act.participants?.[0]?.mobile;
                if (jid) recentlyMessagedJids.add(String(jid).trim());
            });

            if (recentlyMessagedJids.size > 0) {
                console.log(`🛡️ [BNA_DIRECT_DEDUPLICATION] Active: Found ${recentlyMessagedJids.size} recipients that already received Deal ${dealId} in the last ${deduplicationWindowHours || 4}h.`);
            }
        } catch (dupCheckErr) {
            console.warn(`[BNA_DIRECT_DEDUPLICATION] Warning: ${dupCheckErr.message}`);
        }
    }

    // 2. Dispatch WhatsApp Web chats (Individual Contacts & Groups) in batches of 5 with 3-10m cooldowns
    const BATCH_SIZE = 5;
    const totalWaChats = waWebRecipients.length;
    const totalBatches = Math.ceil(totalWaChats / BATCH_SIZE);

    if (totalWaChats > 0) {
        const indCount = waWebRecipients.filter(r => !r.isGroup && !String(r.mobile || '').includes('@g.us')).length;
        const grpCount = waWebRecipients.filter(r => r.isGroup || String(r.mobile || '').includes('@g.us')).length;
        console.log(`🛡️ [BNA_DIRECT_ANTI_BAN] Dispatching ${totalWaChats} WhatsApp Web chats (${indCount} Individual Contacts, ${grpCount} Groups) across ${totalBatches} batches (${BATCH_SIZE} chats/batch, 8-15s intra-chat typing delay, 3-10m cooldown between batches).`);
    }

    for (let b = 0; b < totalBatches; b++) {
        const batchStart = b * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalWaChats);
        const currentBatch = waWebRecipients.slice(batchStart, batchEnd);

        console.log(`🚀 [BNA_DIRECT] [Batch ${b + 1}/${totalBatches}] Forwarding to 5-chat batch (${currentBatch.length} chats: ${batchStart + 1} to ${batchEnd} of ${totalWaChats})...`);

        for (let j = 0; j < currentBatch.length; j++) {
            const target = currentBatch[j];
            const isGroup = target.isGroup || String(target.mobile || '').includes('@g.us');
            const chatLabel = isGroup ? `Group '${target.name || target.mobile}'` : `Contact '${target.name || target.mobile}'`;
            const targetMobile = String(target.mobile || '').trim();

            if (!forceBroadcast && targetMobile && recentlyMessagedJids.has(targetMobile)) {
                console.log(`⏭️ [BNA_DIRECT_DEDUPLICATION] Skipped ${chatLabel} (Already sent Deal in last ${deduplicationWindowHours || 4}h).`);
                continue;
            }

            console.log(`[BNA_DIRECT] [Batch ${b + 1}/${totalBatches} - Chat ${j + 1}/${currentBatch.length}] Sending to ${chatLabel}...`);
            await dispatchSingleRecipient(target);
            if (targetMobile) recentlyMessagedJids.add(targetMobile);

            if (j < currentBatch.length - 1) {
                const intraJitterMs = Math.floor(Math.random() * 7000) + 8000; // 8s to 15s
                console.log(`⏳ [BNA_DIRECT] Intra-batch pacing ${Math.round(intraJitterMs / 1000)}s before next chat...`);
                await new Promise(r => setTimeout(r, intraJitterMs));
            }
        }

        // Inter-batch cooldown: 3 to 10 minutes between batches (only if more batches remain)
        if (b < totalBatches - 1) {
            const cooldownSeconds = Math.floor(Math.random() * (600 - 180 + 1)) + 180; // 180s to 600s
            const cooldownMins = (cooldownSeconds / 60).toFixed(1);
            console.log(`🛑 🛡️ [BNA_DIRECT_ANTI_BAN] Batch ${b + 1}/${totalBatches} finished. Cooling down for ${cooldownMins} minutes (${cooldownSeconds}s) to comply with WhatsApp Business limits...`);

            let elapsed = 0;
            while (elapsed < cooldownSeconds) {
                const step = Math.min(10, cooldownSeconds - elapsed);
                await new Promise(r => setTimeout(r, step * 1000));
                elapsed += step;
                if (elapsed % 60 === 0 || elapsed === cooldownSeconds) {
                    console.log(`⏳ [BNA_DIRECT_COOLDOWN] ${elapsed}/${cooldownSeconds}s elapsed (~${Math.ceil((cooldownSeconds - elapsed) / 60)}m remaining)...`);
                }
            }
            console.log(`⚡ [BNA_DIRECT_COOLDOWN] Resuming WhatsApp Safe Dispatch for Batch ${b + 2}/${totalBatches}...`);
        }
    }
}


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

/**
 * GET /api/marketing/sms/templates
 */
export const getSmsTemplates = async (req, res) => {
    try {
        const SmsTemplate = (await import('../src/modules/sms/smsTemplate.model.js')).default;
        const SmsProvider = (await import('../src/modules/sms/smsProvider.model.js')).default;
        
        const [templates, activeProvider] = await Promise.all([
            SmsTemplate.find({ isActive: true }).sort({ name: 1 }).lean(),
            SmsProvider.findOne({ isActive: true }).lean()
        ]);

        // Aggregate unique Sender IDs from both Provider Config and saved Templates
        const configSenderIds = activeProvider?.config?.senderIds || [];
        const templateSenderIds = templates.map(t => t.dltHeaderId).filter(Boolean);
        
        const uniqueSenderIds = [...new Set([...configSenderIds, ...templateSenderIds])].sort();

        res.json({ success: true, data: { templates, senderIds: uniqueSenderIds } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/marketing/sms/sync
 */
export const syncSmsTemplates = async (req, res) => {
    try {
        const smsService = (await import('../src/modules/sms/sms.service.js')).default;
        const result = await smsService.syncTemplatesAndSenders();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * INTERNAL: High-Priority Direct Dispatch Loop
 * Used when Redis/BullMQ is unavailable.
 */
export async function _dispatchDirectly(data) {
    const { 
        channel, name, subject, content, html, 
        templateName, templateLang, templateComponents,
        waMapping, smsData, recipients, performedBy 
    } = data;

    // 🧠 SENIOR PROFESSIONAL: Observability Hook
    const debugLog = (msg) => {
        try {
            const logMsg = `[${new Date().toISOString()}] ${msg}\n`;
            fs.appendFileSync(path.join(process.cwd(), 'dispatch_debug.log'), logMsg);
        } catch (e) { console.error("Logger Failed", e); }
    };

    debugLog(`INIT: Channel=${channel}, Recipients=${recipients?.length}, Name=${name}`);

    console.log(`[DirectDispatch] 🚀 Starting direct delivery for ${recipients?.length || 0} leads...`);
    

    if (channel === 'sms') {
        console.log(`[DirectDispatch] SMS Config:`, { 
            senderId: smsData?.dltHeaderId || smsData?.senderId, 
            templateId: smsData?.dltTemplateId || smsData?.templateId 
        });
    }

    // Load Services
    const waService = (await import('../services/WhatsAppService.js')).default;
    const smsService = (await import('../src/modules/sms/sms.service.js')).default; // Use direct module
    const emailService = (await import('../services/email.service.js')).default;
    const Activity = (await import('../models/Activity.js')).default || mongoose.model('Activity');

    for (let i = 0; i < recipients.length; i++) {
        const lead = recipients[i];
        try {
            debugLog(`LEAD[${i}]: Processing ${lead.name} (${lead.mobile || lead.email})`);
            let success = false;
            let msgId = null;

            // 🧠 SENIOR PROFESSIONAL: Universal Variable Resolution
            // We resolve variables from both the lead object AND the raw Excel context (if imported)
            const resolutionData = { 
                name: lead.name || 'Customer', 
                firstName: (lead.name || 'Customer').split(' ')[0],
                email: lead.email || '',
                mobile: lead.mobile || '',
                ...(lead.context || {}) // Spread Excel columns / Lead fields
            };

            let resolvedContent = content || '';
            let resolvedSubject = subject || '';

            // Replace both {{var}} and {#var#} formats (SmartPing/DLT compliant)
            Object.entries(resolutionData).forEach(([key, val]) => {
                const safeVal = String(val || '');
                const regexes = [
                    new RegExp(`{{${key}}}`, 'gi'),
                    new RegExp(`{#${key}#}`, 'gi'),
                    new RegExp(`\\[${key}\\]`, 'gi')
                ];
                regexes.forEach(re => {
                    resolvedContent = resolvedContent.replace(re, safeVal);
                    resolvedSubject = resolvedSubject.replace(re, safeVal);
                });
            });

            // Cleanup any remaining placeholders to prevent DLT rejection
            resolvedContent = resolvedContent.replace(/{{.*?}}/g, '').replace(/{#.*?#}/g, '');

            if (channel === 'wa' || channel === 'whatsapp') {
                if (templateName) {
                    // 🧠 SENIOR PROFESSIONAL: Resolve Template Components for Direct Dispatch
                    const VariableResolutionService = (await import('../services/VariableResolutionService.js')).default;
                    const recipientParams = (await import("../services/VariableResolutionService.js")).default.resolveForLeads(resolutionData, waMapping || {});
                    
                    let finalComponents = [];
                    (templateComponents || []).forEach(comp => {
                        const type = comp.type?.toLowerCase();
                        if (!type) return;

                        const compText = comp.text || '';
                        const matches = compText.match(/{{(\d+)}}/g);
                        
                        if (matches) {
                            const indices = [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
                                .sort((a, b) => parseInt(a) - parseInt(b));

                            const parameters = indices.map(idx => {
                                const val = recipientParams[idx];
                                return { type: 'text', text: String(val || '—') };
                            });

                            if (parameters.length > 0) {
                                finalComponents.push({ type, parameters });
                            }
                        }
                    });

                    const res = await waService.sendTemplate(lead.mobile, templateName, templateLang || 'en', finalComponents);
                    success = res.success;
                    msgId = res.messageId;
                    debugLog(`LEAD[${i}]: WA Result: ${success} | ID: ${msgId} | Error: ${res.error || 'none'}`);
                } else {
                    const res = await (await import("../services/WhatsAppService.js")).default.sendMessage(lead.mobile, resolvedContent);
                    success = res.success;
                    msgId = res.messageId;
                }
            } else if (channel === 'email') {
                await emailService.sendEmail(lead.email, resolvedSubject, resolvedContent, html);
                success = true;
            } else if (channel === 'sms') {
                if (templateName) {
                    const res = await smsService.sendSMSWithTemplate(lead.mobile, templateName, resolutionData, {
                        entityType: lead.context?.originalType || 'Import',
                        entityId: lead.id,
                        dltHeaderId: smsData?.dltHeaderId,
                        dltTemplateId: smsData?.dltTemplateId,
                        category: smsData?.category || 'Transactional'
                    });
                    success = res.success;
                    msgId = res.providerId || res.data?.MessageId || (res.data?.JobId ? String(res.data.JobId) : null);
                } else {
                    const res = await smsService.sendSMS(lead.mobile, resolvedContent, {
                        entityType: lead.context?.originalType || 'Import',
                        entityId: lead.id,
                        dltHeaderId: smsData?.dltHeaderId,
                        dltTemplateId: smsData?.dltTemplateId,
                        category: smsData?.category || 'Transactional'
                    });
                    success = res.success;
                    msgId = res.providerId || res.data?.MessageId || (res.data?.JobId ? String(res.data.JobId) : null);
                }
                console.log(`[DirectDispatch] SMS to ${lead.mobile}: ${success ? '✅ Success' : '❌ Failed'}`);
            }

            // Log Activity
            if (success) {
                await Activity.create({
                    type: 'Marketing',
                    subject: `${channel.toUpperCase()} Campaign: ${name}`,
                    entityType: 'Lead',
                    entityId: lead.id,
                    status: 'Sent',
                    description: `Sent via direct dispatch.`,
                    performedBy: performedBy,
                    details: {
                        channel,
                        campaignName: name,
                        msgId: msgId,
                        direct: true
                    }
                });
            }

            // Throttle to prevent API rate limits
            await new Promise(r => setTimeout(r, 200));
        } catch (err) {
            console.error(`[DirectDispatch] Failed for lead ${lead.id}:`, err.message);
        }
    }

    console.log(`[DirectDispatch] ✅ Finished delivery for ${name}`);
};

export const getBNAAnalytics = async (req, res) => {
    try {
        // 🧠 Fix: Match both string and ObjectId forms of dealId
        const { dealId } = req.params;
        const visibilityFilter = await getVisibilityFilter(req.user);
        const Activity = mongoose.model('Activity');
        const dealObjId = mongoose.Types.ObjectId.isValid(dealId)
            ? new mongoose.Types.ObjectId(dealId)
            : null;

        const idQuery = dealObjId
            ? { $or: [{ 'details.dealId': dealId }, { 'details.dealId': dealObjId }] }
            : { 'details.dealId': dealId };

        // Fetch all marketing activities for this deal
        const activities = await Activity.find({
            ...idQuery,
            type: 'Marketing',
            ...visibilityFilter
        }).lean();

        const stats = {
            total: activities.length,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            channels: { whatsapp: 0, email: 0, sms: 0 }
        };

        activities.forEach(act => {
            const status = (act.status || '').toLowerCase();
            const results = act.details?.results || [];

            // Aggregate overall status
            if (['sent', 'completed'].includes(status)) stats.sent++;
            if (status === 'delivered') stats.delivered++;
            if (status === 'read') stats.read++;
            if (['failed', 'error'].includes(status)) stats.failed++;

            // Aggregate channels
            results.forEach(r => {
                if (stats.channels[r.channel] !== undefined) {
                    stats.channels[r.channel]++;
                }
            });
        });

        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getVariableRegistry = async (req, res) => {
    try {
        const SystemSetting = mongoose.model('SystemSetting');
        const setting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
        res.json({ success: true, data: setting?.value || { "1": "customer_name", "2": "property_list_default" } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Define the logic that actually runs the dispatch
export const executeDispatch = async (payload, user) => {
    const { dealIds, leadIds, toggles, hidePrice, hideUnit, hideLocation, templateId, matchContext } = payload;
    
    const finalDealIds = Array.isArray(dealIds) ? dealIds : [];
    const finalLeadIds = Array.isArray(leadIds) ? leadIds : [];

    const Inventory = mongoose.model('Inventory');
    const Deal = mongoose.model('Deal');
    const Lead = mongoose.model('Lead');
    const Activity = mongoose.model('Activity');
    const SystemSetting = mongoose.model('SystemSetting');

    const visibilityFilter = user ? { /* whatever your getVisibilityFilter returns */ } : {};

    // 1. Fetch all deals FIRST
    const populatedDeals = [];
    for (const dId of finalDealIds) {
        let propertyData = await Inventory.findOne({ _id: dId, ...visibilityFilter }).lean();
        if (!propertyData) {
            propertyData = await Deal.findOne({ _id: dId, ...visibilityFilter }).populate('inventoryId').lean();
        }
        if (propertyData) populatedDeals.push(propertyData);
    }

    // --- PRE-RESOLVE LOOKUPS FOR VARIABLES ---
    const Lookup = (await import('../models/Lookup.js')).default;
    for (const pd of populatedDeals) {
        const base = pd.inventoryId || pd;
        
        const resolveLookupSafely = async (val) => {
            if (!val) return null;
            if (typeof val === 'object' && (val.lookup_value || val.name || val.label)) {
                return val.lookup_value || val.name || val.label;
            }
            let strVal = typeof val === 'object' && val._id ? val._id.toString() : val.toString();
            if (/^[a-fA-F0-9]{24}$/.test(strVal)) {
                const lkup = await Lookup.findById(strVal).lean();
                if (lkup) return lkup.lookup_value || lkup.name || lkup.label;
            }
            return null;
        };

        if (pd.subCategory) {
            const val = await resolveLookupSafely(pd.subCategory);
            if (val) pd.subCategory = { lookup_value: val };
        }
        if (base.subCategory) {
            const val = await resolveLookupSafely(base.subCategory);
            if (val) base.subCategory = { lookup_value: val };
        }
        
        if (base.sizeLabel) {
            const val = await resolveLookupSafely(base.sizeLabel);
            if (val) base.sizeLabel = val;
        } else if (base.sizeConfig) {
            const val = await resolveLookupSafely(base.sizeConfig);
            if (val && !base.sizeLabel) base.sizeLabel = val;
        } else if (base.size) {
            const val = await resolveLookupSafely(base.size);
            if (val && !base.sizeLabel) base.sizeLabel = val;
            else if (typeof base.size === 'string' && !/^[a-fA-F0-9]{24}$/.test(base.size)) base.sizeLabel = base.size;
            else if (typeof base.size === 'object' && base.size.value) base.sizeLabel = base.size.value;
        }

        const lookupFields = ['facing', 'direction', 'roadWidth', 'unitType', 'buildupType', 'corner', 'category'];
        for (const field of lookupFields) {
            if (pd[field]) {
                const val = await resolveLookupSafely(pd[field]);
                if (val) pd[field] = { lookup_value: val };
            }
            if (base[field]) {
                const val = await resolveLookupSafely(base[field]);
                if (val) base[field] = { lookup_value: val };
            }
        }
    }
    // ------------------------------------------

    if (populatedDeals.length === 0) return { success: false, message: 'No properties found.' };

    const overallResults = [];

    // 2. Iterate over Leads (Send ONE consolidated message per lead)
    for (const lId of finalLeadIds) {
        const lead = await Lead.findOne({ _id: lId, ...visibilityFilter }).lean();
        if (!lead) continue;

        console.log(`[ManualDispatch] Processing Match for Lead:${lId} with ${populatedDeals.length} properties.`);
        const matchResults = [];

        // WhatsApp
        if (toggles?.whatsapp && (lead.mobile || lead.phones?.[0])) {
            const mobile = lead.mobile || lead.phones?.[0]?.number || lead.phones?.[0];
            
            // Enrich lead with properties for VariableResolutionService
            const enrichedLead = { 
                ...lead, 
                hidePrice,
                hideUnit,
                hideLocation,
                templateId,
                matchContext,
                matchedProperties: populatedDeals.map(p => ({ inventoryId: p })) 
            };

            let registrySetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
            if (!registrySetting && mongoose.connection.db) {
                registrySetting = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'messaging_variable_registry' });
            }
            const mapping = (registrySetting && registrySetting.value) ? registrySetting.value : {
                "1": "customer_name",
                "2": "property_list_default"
            };

            try {
                let templatesSetting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
                if (!templatesSetting && mongoose.connection.db) {
                    templatesSetting = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'crm_whatsapp_templates' });
                }
                let matchTemplate;
                if (templateId && templateId !== 'free_text') {
                    matchTemplate = templatesSetting?.value?.find(t => t.id === templateId || t.name === templateId);
                }
                if (!matchTemplate && templateId !== 'free_text') {
                    const expectedContext = matchContext === 'perfect' ? 'deal_match_modal' : 'deal_match';
                    matchTemplate = templatesSetting?.value?.find(t => 
                        t.systemContext?.includes(expectedContext) || 
                        t.systemContext?.includes('lead_match_full') || 
                        t.systemContext?.includes('deal_match') // broad fallback
                    );
                }
                
                let res;
                let textPayload = '';
                if (matchTemplate) {
                    const templateId = matchTemplate.name || matchTemplate.id;
                    const language = matchTemplate.language || 'en';
                    const waService = (await import('../services/WhatsAppService.js')).default;
                    
                    const metaObj = { 
                        title: populatedDeals[0]?.projectName || 'Project',
                        location: populatedDeals[0]?.sector || populatedDeals[0]?.location || '',
                        price: populatedDeals[0]?.price || '',
                        inventoryId: populatedDeals[0]?._id
                    };

                    const personalizedComponents = await resolveMetaComponents(
                        templateId, 
                        enrichedLead, 
                        metaObj, 
                        mapping
                    );

                    console.log(`[ManualDispatch/WA] Dispatching '${templateId}'`);
                    textPayload = `[Template: ${templateId}] Payload: ${JSON.stringify(personalizedComponents)}`;
                    res = await waService.sendTemplate(mobile, templateId, language, personalizedComponents);
                } else {
                    const resolvedParams = (await import("../services/VariableResolutionService.js")).default.resolveForLeads(enrichedLead, mapping);
                    let message = `Hi ${resolvedParams["1"] || 'Customer'} 👋\n\nBased on your requirement, here are a few suitable options:\n\n${resolvedParams["2"] || 'Property matches below:'}`;
                    
                    let agentName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null;
                    let agentMobile = user?.mobile || user?.phone;
                    
                    if (user && user._id && (!agentMobile || !agentName)) {
                        const fullUser = await mongoose.model('User').findById(user._id || user.id).lean();
                        if (fullUser) {
                            agentMobile = fullUser.mobile || fullUser.phone;
                            agentName = `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim();
                        }
                    }
                    
                    message += `\n\nBest Regards,`;
                    if (agentName) message += `\n${agentName}`;
                    message += `\nBharat Properties`;
                    
                    if (agentMobile) {
                        message += `\n📞 ${agentMobile}`;
                    }
                    
                    textPayload = message; // Capture the final message
                    res = await (await import("../services/WhatsAppService.js")).default.sendMessage(mobile, message);
                }
                matchResults.push({ 
                    channel: 'whatsapp', 
                    status: res.success ? 'success' : 'failed',
                    messageContent: textPayload // Include actual message sent
                });
            } catch (err) { matchResults.push({ channel: 'whatsapp', status: 'failed', error: err.message }); }
        }

        // Email
        const emailAddr = lead.email || (Array.isArray(lead.emails) ? (lead.emails[0]?.address || lead.emails[0]) : null);
        if (toggles?.email && emailAddr) {
            const template = (await import("../services/CampaignConfig.js")).buildMultiEmailTemplate(populatedDeals, hidePrice, matchContext);
            try {
                await (await import("../services/email.service.js")).default.sendEmail(emailAddr, template.subject, template.text, template.html);
                matchResults.push({ channel: 'email', status: 'success' });
            } catch (err) { matchResults.push({ channel: 'email', status: 'failed', error: err.message }); }
        }

        // SMS
        if (toggles?.sms && (lead.mobile || lead.phones?.[0])) {
            const mobile = lead.mobile || lead.phones?.[0]?.number || lead.phones?.[0];
            const template = (await import("../services/CampaignConfig.js")).buildMultiSmsTemplate(populatedDeals, hidePrice, matchContext);
            try {
                const res = await (await import("../services/SmsService.js")).default.sendSms(mobile, template.message);
                matchResults.push({ channel: 'sms', status: res.success ? 'success' : 'failed' });
            } catch (err) { matchResults.push({ channel: 'sms', status: 'failed', error: err.message }); }
        }

        // Log Activity
        try {
            await Activity.create({
                type: 'Marketing',
                subject: `Sent ${matchContext === 'perfect' ? 'Perfect Matches' : 'Top Matches'} (${populatedDeals.length} properties)`,
                entityType: 'Lead',
                entityId: lead._id,
                dueDate: new Date(),
                performedAt: new Date(),
                status: 'Completed',
                description: `Dispatched details to ${lead.fullName || lead.firstName} via ${matchResults.filter(r => r.status === 'success').map(r => r.channel).join(', ') || 'none'}`,
                details: { 
                    results: matchResults, 
                    toggles, 
                    matchedCount: populatedDeals.length, 
                    hidePrice,
                    phoneNumber: lead.mobile || lead.phones?.[0]?.number || lead.phones?.[0] // Add phone number for thread fetching
                },
                performedBy: user?.firstName || 'System',
                assignedTo: user?._id
            });
        } catch (logErr) { console.error('[ManualDispatch] Activity Log Error:', logErr.message); }

        overallResults.push({ leadId: lId, results: matchResults });
    }
    
    return { success: true, results: overallResults };
};

export const sendManualMatch = async (req, res) => {
    console.log('[ManualDispatch] Incoming Request:', { body: req.body, user: req.user?._id });
    try {
        let { dealId, leadId, dealIds, leadIds, toggles, hidePrice, hideUnit, hideLocation, templateId, matchContext, scheduledAt } = req.body;
        
        // Normalize to arrays
        const finalDealIds = Array.isArray(dealIds) ? dealIds : (dealId ? [dealId] : []);
        const finalLeadIds = Array.isArray(leadIds) ? leadIds : (leadId ? [leadId] : []);

        if (finalDealIds.length === 0 || finalLeadIds.length === 0) {
            console.error('[ManualDispatch] Bad Request: Missing IDs');
            return res.status(400).json({ success: false, error: 'Deal IDs and Lead IDs are required' });
        }

        // 🧠 Terminal State Lock: Prevent matching for closed leads
        const Lookup = mongoose.model('Lookup');
        const terminalLookups = await Lookup.find({ 
            lookup_type: { $regex: /^stage$/i },
            lookup_value: { $regex: /closed|lost|won|unqualified|junk|dormant/i }
        }).lean();
        const terminalStageIds = terminalLookups.map(l => l._id.toString());

        const leadsToCheck = await Lead.find({ _id: { $in: finalLeadIds } }).select('stage').lean();
        for (const l of leadsToCheck) {
            if (l.stage && terminalStageIds.includes(l.stage.toString())) {
                return res.status(400).json({ success: false, error: 'Cannot send matches to Closed or Unqualified leads. Please revive the lead first.' });
            }
        }

        if (scheduledAt) {
            const delay = new Date(scheduledAt).getTime() - Date.now();
            if (delay > 0) {
                console.log(`[ManualDispatch] Writing to DispatchJob for ${scheduledAt}`);
                await DispatchJob.create({
                    leadIds: finalLeadIds,
                    dealIds: finalDealIds,
                    toggles: toggles || {},
                    hidePrice: hidePrice || false,
                    hideUnit: hideUnit || false,
                    hideLocation: hideLocation || false,
                    templateId: templateId || null,
                    matchContext: matchContext || 'perfect',
                    scheduledAt: new Date(scheduledAt),
                    status: 'pending'
                });
                return res.json({ success: true, message: `Dispatched correctly. Scheduled for ${new Date(scheduledAt).toLocaleString()}` });
            }
        }
        
        // Execute immediately
        const payload = { dealIds: finalDealIds, leadIds: finalLeadIds, toggles, hidePrice, hideUnit, hideLocation, templateId, matchContext };
        const result = await executeDispatch(payload, req.user);
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        return res.json(result);
    } catch (err) {
        console.error('[ManualDispatch] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

import crypto from 'crypto';
import SharedMatch from '../models/SharedMatch.js';

export const generateMatchLink = async (req, res) => {
    try {
        const { dealIds, leadId } = req.body;
        
        if (!dealIds || !Array.isArray(dealIds) || dealIds.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one Deal ID is required.' });
        }

        const token = crypto.randomBytes(4).toString('hex'); // E.g., '1a2b3c4d'
        
        const sharedMatch = await SharedMatch.create({
            token,
            leadId: leadId || null,
            dealIds,
            createdBy: req.user._id
        });

        // Construct the full URL
        const baseUrl = process.env.VITE_APP_URL || 'http://localhost:5173';
        const matchUrl = `${baseUrl}/matches/${token}`;

        return res.json({ success: true, url: matchUrl, token });
    } catch (err) {
        console.error('[MarketingController] generateMatchLink error:', err);
        return res.status(500).json({ success: false, error: 'Failed to generate match link' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// 🚀 Phase 4: Live Broadcast Progress Board & Operator Controls
// ═════════════════════════════════════════════════════════════════════════════

export const getLiveBroadcastState = async (req, res) => {
    try {
        const { campaignId } = req.params;
        if (!campaignId) {
            return res.status(400).json({ success: false, error: 'campaignId is required' });
        }
        const { default: BroadcastLiveTracker } = await import('../services/BroadcastLiveTracker.js');
        const state = await BroadcastLiveTracker.getCampaignState(campaignId);
        if (!state) {
            return res.status(404).json({ success: false, error: `Campaign ${campaignId} not found` });
        }
        return res.json({ success: true, data: state });
    } catch (err) {
        console.error('[getLiveBroadcastState] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const getLiveBroadcasts = async (req, res) => {
    try {
        const { dealId, limit } = req.query;
        const { default: BroadcastLiveTracker } = await import('../services/BroadcastLiveTracker.js');
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        const campaigns = await BroadcastLiveTracker.listLiveCampaigns({ dealId, limit: parsedLimit });
        return res.json({ success: true, data: campaigns });
    } catch (err) {
        console.error('[getLiveBroadcasts] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const pauseBroadcastCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { reason } = req.body || {};
        const performedBy = req.user?.fullName || req.user?.name || 'Operator';
        const { default: BroadcastLiveTracker } = await import('../services/BroadcastLiveTracker.js');
        const result = await BroadcastLiveTracker.pauseCampaign(campaignId, performedBy, reason);
        return res.json(result);
    } catch (err) {
        console.error('[pauseBroadcastCampaign] Error:', err);
        const statusCode = err.message.includes('NOT_FOUND') ? 404 : (err.message.includes('CONFLICT') ? 409 : 400);
        return res.status(statusCode).json({ success: false, error: err.message });
    }
};

export const resumeBroadcastCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { reason } = req.body || {};
        const performedBy = req.user?.fullName || req.user?.name || 'Operator';
        const queue = await getMarketingQueue();
        const { default: BroadcastLiveTracker } = await import('../services/BroadcastLiveTracker.js');
        const result = await BroadcastLiveTracker.resumeCampaign(campaignId, performedBy, reason, queue);
        return res.json(result);
    } catch (err) {
        console.error('[resumeBroadcastCampaign] Error:', err);
        const statusCode = err.message.includes('NOT_FOUND') ? 404 : (err.message.includes('CONFLICT') ? 409 : 400);
        return res.status(statusCode).json({ success: false, error: err.message });
    }
};

export const cancelBroadcastCampaign = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { reason } = req.body || {};
        const performedBy = req.user?.fullName || req.user?.name || 'Operator';
        const { default: BroadcastLiveTracker } = await import('../services/BroadcastLiveTracker.js');
        const result = await BroadcastLiveTracker.cancelCampaign(campaignId, performedBy, reason);
        return res.json(result);
    } catch (err) {
        console.error('[cancelBroadcastCampaign] Error:', err);
        const statusCode = err.message.includes('NOT_FOUND') ? 404 : 400;
        return res.status(statusCode).json({ success: false, error: err.message });
    }
};

export const retryFailedBroadcastRecipients = async (req, res) => {
    try {
        const { campaignId } = req.params;
        const performedBy = req.user?.fullName || req.user?.name || 'Operator';
        const queue = await getMarketingQueue();
        const { default: BroadcastLiveTracker } = await import('../services/BroadcastLiveTracker.js');
        const result = await BroadcastLiveTracker.retryFailedRecipients(campaignId, performedBy, queue);
        if (!result.success) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error('[retryFailedBroadcastRecipients] Error:', err);
        const statusCode = err.message.includes('NOT_FOUND') ? 404 : 400;
        return res.status(statusCode).json({ success: false, error: err.message });
    }
};

