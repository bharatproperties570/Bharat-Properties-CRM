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
import unifiedAIService from '../services/UnifiedAIService.js';
import publishService from '../services/PublishService.js';
import Deal from '../models/Deal.js';
import Project from '../models/Project.js';
import Lead  from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import MarketingContent from '../models/MarketingContent.js';
import Activity from '../models/Activity.js';
import DispatchJob from '../models/DispatchJob.js';
import NurtureBot from '../services/NurtureBot.js';
import marketingAudienceService from '../services/MarketingAudienceService.js';
import { normalizePhone } from '../utils/normalization.js';
import { getVisibilityFilter } from '../utils/visibility.js';
import fs from 'fs';
import path from 'path';

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

        // Use UnifiedAIService to support automatic provider fallback (failover)
        const result = await unifiedAIService.generate(userPrompt, {
            provider: provider || 'google',
            model: model,
            systemPrompt: systemPrompt
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
        const { dealId, groupIds, contactGroupIds, channels = ['whatsapp'], templateId, language } = req.body;
        console.log(`[BNA] Dispatching to groups: Company=${groupIds} Contact=${contactGroupIds} (Template: ${templateId || 'NONE'})`);
        
        if (!dealId || (!(groupIds && groupIds.length > 0) && !(contactGroupIds && contactGroupIds.length > 0))) {
            return res.status(400).json({ success: false, error: 'Deal ID and at least one Company or Contact Group are required' });
        }

        const Company = mongoose.model('Company');
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 1. Fetch Deal Metadata (Sanitized)
        const deal = await Deal.findOne({ _id: dealId, ...visibilityFilter }).lean();
        if (!deal || !deal.broadcastMetadata?.isReady) {
            return res.status(400).json({ success: false, error: 'Deal not found or not sanitized for broadcast.' });
        }

        // 2. Fetch Targeted Audience (Brokers in selected groups)
        let recipients = [];
        
        if (groupIds && groupIds.length > 0) {
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
            
            recipients = recipients.concat(companyRecipients);
        }

        if (contactGroupIds && contactGroupIds.length > 0) {
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

            recipients = recipients.concat(contactRecipients);
        }

        if (recipients.length === 0) {
            return res.status(404).json({ success: false, error: 'No brokers with valid contact information found.' });
        }

        // 3. Queue the Broadcast for Async Processing (Senior Professional Pattern)
        const queue = await getMarketingQueue();
        const { isRedisOnline } = await import('../src/config/redis.js');

        const jobData = {
            name: `BNA Broadcast: ${deal.broadcastMetadata.title}`,
            dealId,
            channels,
            recipients,
            meta: deal.broadcastMetadata,
            templateId,
            language,
            shareableId: deal.shareableId,
            performedBy: req.user?.firstName || 'System'
        };

        if (queue && isRedisOnline) {
            const job = await queue.add('bna-broadcast', jobData, { removeOnComplete: true });
            return res.json({ 
                success: true, 
                message: `Broadcast queued for ${recipients.length} brokers.`,
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
async function resolveMetaComponents(templateId, recipient, meta, registryMapping) {
    const waService = (await import('../services/WhatsAppService.js')).default;
    const VariableResolutionService = (await import('../services/VariableResolutionService.js')).default;
    
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
    const resolvedMap = (await import("../services/VariableResolutionService.js")).default.resolveForLeads(enrichedContext, registryMapping);

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

/**
 * Direct dispatch for BNA broadcasts when queue is unavailable
 */
async function _dispatchBNADirectly(data) {
    const { dealId, channels, recipients, meta, templateId, language, shareableId, performedBy } = data;
    const waService = (await import('../services/WhatsAppService.js')).default;
    const eSvc = (await import('../services/email.service.js')).default;
    const Activity = mongoose.model('Activity');

    // 🧠 PROFESSIONAL: Introspect template to map variables correctly
    // Meta error #132000 happens when param count doesn't match template
    let waMessageText = null;
    let templateComponents = null;

    let templateRegistryData = null;
    let activeTemplateId = templateId;
    let activeTemplateLang = language || 'en';

    try {
        const SystemSetting = mongoose.model('SystemSetting');
        const registrySetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
        templateRegistryData = {
            mapping: registrySetting?.value || { "1": "customer_name", "2": "property_list_default" }
        };

        // 🧠 Auto-Resolve System Trigger Context if no explicit template provided
        if (!activeTemplateId) {
            const templatesSetting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
            if (templatesSetting?.value) {
                // Find first template that has 'deal_match' context (Meta approved ones only preferably, but local logic will handle it)
                const dealMatchTemplate = templatesSetting.value.find(t => t.systemContext?.includes('deal_match'));
                if (dealMatchTemplate) {
                    activeTemplateId = dealMatchTemplate.name || dealMatchTemplate.id;
                    activeTemplateLang = dealMatchTemplate.language || 'en';
                    console.log(`[BNA/Context] Auto-resolved deal_match context to template: ${activeTemplateId}`);
                }
            }
        }
    } catch (err) {
        console.error('[BNA/TemplateInit] Error:', err.message);
    }

    // Fallback text message (when no template selected or template not found)
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
            </div>
        </div>
    `;

    for (const recipient of recipients) {
        const results = [];

        if (channels.includes('whatsapp') && recipient.mobile) {
            try {
                let waRes;
                if (activeTemplateId && templateRegistryData) {
                    const personalizedComponents = await resolveMetaComponents(
                        activeTemplateId, 
                        recipient, 
                        meta, 
                        templateRegistryData.mapping
                    );
                    
                    console.log(`[BNA/WA] Dispatching '${activeTemplateId}' with ${personalizedComponents.length} components.`);
                    waRes = await waService.sendTemplate(recipient.mobile, activeTemplateId, activeTemplateLang, personalizedComponents);
                } else {
                    // Fallback to text
                    const text = `🏢 *BNA ALERT: ${meta.title}*\n\n` +
                        `Hi ${recipient.name},\n\n` +
                        `💰 *Price:* ${meta.price}\n📍 *Location:* ${meta.location}\n` +
                        `📐 *Specs:* ${meta.features?.join(' | ') || 'N/A'}\n\n` +
                        `🔗 Ref: ${shareableId}`;
                    waRes = await (await import("../services/WhatsAppService.js")).default.sendMessage(recipient.mobile, text);
                }
                results.push({ channel: 'whatsapp', status: waRes.success ? 'success' : 'failed', error: waRes.error });
            } catch (e) { results.push({ channel: 'whatsapp', status: 'failed', error: e.message }); }
        }

        if (channels.includes('email') && recipient.email) {
            try {
                await (await import("../services/email.service.js")).default.sendEmail(recipient.email, emailSubject, '', emailHtml);
                results.push({ channel: 'email', status: 'success' });
            } catch (e) { results.push({ channel: 'email', status: 'failed', error: e.message }); }
        }

        // Log Activity
        await Activity.create({
            type: 'Marketing',
            subject: `BNA Broadcast: ${meta.title}`,
            entityType: 'Company',
            entityId: recipient.id,
            status: 'Completed',
            description: `Dispatched sanitized deal details via ${results.filter(r => r.status === 'success').map(r => r.channel).join(', ')}`,
            details: { results, dealId, shareableId, direct: true },
            performedBy: performedBy,
            dueDate: new Date()
        });

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
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
    const { dealIds, leadIds, toggles, hidePrice, matchContext } = payload;
    
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
            propertyData = await Deal.findOne({ _id: dId, ...visibilityFilter }).lean();
        }
        if (propertyData) populatedDeals.push(propertyData);
    }

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
                matchedProperties: populatedDeals.map(p => ({ inventoryId: p })) 
            };

            const registrySetting = await SystemSetting.findOne({ key: 'messaging_variable_registry' }).lean();
            const mapping = (registrySetting && registrySetting.value) ? registrySetting.value : {
                "1": "customer_name",
                "2": "property_list_default"
            };

            try {
                const templatesSetting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
                const expectedContext = matchContext === 'perfect' ? 'lead_match_full' : 'lead_match_short';
                const matchTemplate = templatesSetting?.value?.find(t => t.systemContext?.includes(expectedContext));
                
                let res;
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

                    console.log(`[ManualDispatch/WA] Context resolved '${expectedContext}' -> Dispatching '${templateId}'`);
                    res = await waService.sendTemplate(mobile, templateId, language, personalizedComponents);
                } else {
                    const resolvedParams = (await import("../services/VariableResolutionService.js")).default.resolveForLeads(enrichedLead, mapping);
                    let message = `Hi ${resolvedParams["1"] || 'Customer'} 👋\n\nBased on your requirement, here are a few suitable options:\n\n${resolvedParams["2"] || 'Property matches below:'}`;
                    res = await (await import("../services/WhatsAppService.js")).default.sendMessage(mobile, message);
                }
                matchResults.push({ channel: 'whatsapp', status: res.success ? 'success' : 'failed' });
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
                details: { results: matchResults, toggles, matchedCount: populatedDeals.length, hidePrice },
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
        let { dealId, leadId, dealIds, leadIds, toggles, hidePrice, matchContext, scheduledAt } = req.body;
        
        // Normalize to arrays
        const finalDealIds = Array.isArray(dealIds) ? dealIds : (dealId ? [dealId] : []);
        const finalLeadIds = Array.isArray(leadIds) ? leadIds : (leadId ? [leadId] : []);

        if (finalDealIds.length === 0 || finalLeadIds.length === 0) {
            console.error('[ManualDispatch] Bad Request: Missing IDs');
            return res.status(400).json({ success: false, error: 'Deal IDs and Lead IDs are required' });
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
                    matchContext: matchContext || 'perfect',
                    scheduledAt: new Date(scheduledAt),
                    status: 'pending'
                });
                return res.json({ success: true, message: `Dispatched correctly. Scheduled for ${new Date(scheduledAt).toLocaleString()}` });
            }
        }
        
        // Execute immediately
        const payload = { dealIds: finalDealIds, leadIds: finalLeadIds, toggles, hidePrice, matchContext };
        const result = await executeDispatch(payload, req.user);
        
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('[ManualDispatch] FATAL ERROR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
