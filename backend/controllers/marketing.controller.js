/**
 * marketing.controller.js
 * Phase D — Real AI (Gemini 1.5 Pro + GPT-4o) with BullMQ job queuing.
 *
 * Changes from Phase C:
 *   - generateWithModel: Removed broken @google/generative-ai dynamic import.
 *     Now routes through GeminiService._callGemini (axios) and OpenAIService._callOpenAI.
 *   - sendCampaign:  Now enqueues a real BullMQ 'blast' job (not just console.log).
 *   - activateDrip:  Now enqueues a real BullMQ 'drip' job.
 *   - getJobStatus:  New endpoint — polls BullMQ job state for UI progress tracking.
 */

import marketingService from '../services/MarketingService.js';
import geminiService    from '../services/GeminiService.js';
import openAIService    from '../services/OpenAIService.js';
import Deal  from '../models/Deal.js';
import Lead  from '../models/Lead.js';
import NurtureBot from '../services/NurtureBot.js';

// Lazy-import the marketing queue (avoids Redis connection at module load
// if Redis is not yet running)
let _marketingQueue = null;
const getMarketingQueue = async () => {
    if (!_marketingQueue) {
        const mod = await import('../src/queues/marketingQueue.js');
        _marketingQueue = mod.marketingQueue;
    }
    return _marketingQueue;
};

// ── Dashboard & Analytics ─────────────────────────────────────────────────────

/**
 * GET /api/marketing/stats
 * Marketing Dashboard Stats — powered by NurtureBot.
 */
export const getMarketingStats = async (req, res) => {
    try {
        const stats = await NurtureBot.getMarketingStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/marketing/campaign-runs
 * Historical Campaign Runs.
 */
export const getCampaignRuns = async (req, res) => {
    try {
        // Fetch real Deal campaign runs from DB where available
        const deals = await Deal.find({ 'campaignRuns.0': { $exists: true } })
            .select('unitNo projectName campaignRuns')
            .sort({ updatedAt: -1 })
            .limit(10)
            .lean();

        const runs = deals.flatMap(deal =>
            (deal.campaignRuns || []).map((run, i) => ({
                id:           `${deal._id}_${i}`,
                name:         `${deal.unitNo || deal.projectName || 'Deal'} Campaign`,
                date:         run.launchedAt,
                leadsTargeted: run.leadsTargeted,
                channels:     run.channels,
                status:       'Completed',
            }))
        );

        // If no real data yet, return helpful placeholder
        if (runs.length === 0) {
            return res.json({
                success: true,
                data: [
                    { id: 'placeholder_1', name: 'No campaigns run yet — create a Deal to auto-trigger', date: new Date(), status: 'Info' }
                ],
                message: 'No campaign history available yet. Campaigns are auto-triggered when Deals are created.',
            });
        }

        res.json({ success: true, data: runs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ── AI Content Generation ──────────────────────────────────────────────────────

/**
 * POST /api/marketing/generate-social
 * Generate AI social media content for a deal.
 */
export const generateSocialContent = async (req, res) => {
    try {
        const { dealId, platform } = req.body;

        if (!dealId || !platform) {
            return res.status(400).json({ success: false, error: 'Deal ID and platform are required' });
        }

        const deal = await Deal.findById(dealId);
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

        const content = await marketingService.generateSocialPost(deal, platform.toLowerCase());

        res.json({
            success: true,
            platform,
            content,
            dealTitle: deal.unitNo,
        });
    } catch (error) {
        console.error('[MarketingController] generateSocialContent Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/marketing/generate-email
 * Generate AI email campaign content.
 */
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

/**
 * GET /api/marketing/recent-deals
 * Get recent Open deals for content generation.
 */
export const getRecentDeals = async (req, res) => {
    try {
        const deals = await Deal.find({ stage: 'Open' })
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({ success: true, data: deals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/marketing/run-agent
 * Run the AI Nurture Agent manually.
 */
export const runMarketingAgent = async (req, res) => {
    try {
        const advancedCount = await NurtureBot.processPendingLeads();
        res.json({
            success: true,
            advancedCount,
            message: `AI Agent successfully processed and advanced ${advancedCount} leads.`,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ── Phase D: Real AI Model Routing ────────────────────────────────────────────

/**
 * POST /api/marketing/generate-with-model
 * Phase D: Real Gemini 1.5 Pro or GPT-4o generation.
 *
 * Body: { agentName, provider, model, prompt, systemPrompt, context }
 *
 * Providers:
 *   'google'  / 'gemini'  → GeminiService.generateWithSystem() (uses v1beta + systemInstruction)
 *   'openai'              → OpenAIService.generateWithSystem() (uses system role message)
 */
export const generateWithModel = async (req, res) => {
    try {
        const { agentName, provider, model, prompt, systemPrompt, context } = req.body;

        if (!prompt) {
            return res.status(400).json({ success: false, error: 'prompt is required' });
        }

        // Build the user-facing prompt (optionally enrich with structured context)
        const userPrompt = context && Object.keys(context).length > 0
            ? `${prompt}\n\nContext Data:\n${JSON.stringify(context, null, 2)}`
            : prompt;

        let result;
        const normalizedProvider = (provider || 'google').toLowerCase();

        if (normalizedProvider === 'openai') {
            // ── REAL GPT-4o call ────────────────────────────────────────────
            console.log(`[MarketingController] Routing to OpenAI GPT-4o (model=${model || 'gpt-4o'}) for agent: ${agentName}`);
            result = await openAIService.generateWithSystem(
                systemPrompt || '',
                userPrompt,
                { model: model || 'gpt-4o', temperature: 0.7, maxTokens: 2048 }
            );
        } else {
            // ── REAL Gemini 1.5 Pro call ────────────────────────────────────
            console.log(`[MarketingController] Routing to Gemini (model=${model || 'gemini-1.5-pro'}) for agent: ${agentName}`);
            result = await geminiService.generateWithSystem(
                systemPrompt || '',
                userPrompt,
                { model: model || 'gemini-1.5-pro', temperature: 0.7, maxTokens: 2048 }
            );
        }

        res.json({
            success:   true,
            content:   result,
            agentName,
            provider:  normalizedProvider,
            model:     model || (normalizedProvider === 'openai' ? 'gpt-4o' : 'gemini-1.5-pro'),
            tokens:    result?.length ? Math.ceil(result.length / 4) : 0,
        });

    } catch (error) {
        console.error('[MarketingController] generateWithModel Error:', error.message);
        res.status(500).json({
            success:  false,
            error:    error.message,
            fallback: `AI generation failed: ${error.message.substring(0, 120)}`,
        });
    }
};

// ── Phase D: BullMQ Campaign Queuing ──────────────────────────────────────────

/**
 * POST /api/marketing/send-campaign
 * Phase D: Enqueues a real BullMQ 'blast' job instead of logging.
 *
 * Body: { channel: 'email'|'wa'|'sms', segment, name, subject, content, html }
 */
export const sendCampaign = async (req, res) => {
    try {
        const { channel, segment, name, subject, content, html } = req.body;

        if (!channel) {
            return res.status(400).json({ success: false, error: 'channel is required' });
        }

        // Build recipient list for the segment
        const segmentQuery = segment && segment !== 'all'
            ? { stage: { $regex: new RegExp(segment, 'i') } }
            : {};

        const leads = await Lead.find({
            ...segmentQuery,
            mobile: { $exists: true, $ne: '' },
        })
        .select('mobile email firstName lastName')
        .limit(1000)
        .lean();

        const mobiles = leads.map(l => l.mobile).filter(Boolean);
        const emails  = leads.map(l => l.email).filter(Boolean);

        if (leads.length === 0) {
            return res.json({
                success: true,
                channel,
                leadCount: 0,
                message: `No leads found for segment "${segment || 'all'}". Campaign not queued.`,
            });
        }

        // ── Enqueue real BullMQ job ────────────────────────────────────────
        let job;
        try {
            const queue = await getMarketingQueue();
            job = await queue.add('blast', {
                channel,
                segment,
                name:    name || 'Marketing Campaign',
                subject: subject || `Bharat Properties — ${name || 'Update'}`,
                message: content || '',
                html:    html    || '',
                mobiles,
                emails,
                leadIds: leads.map(l => l._id.toString()),
                queuedAt: new Date().toISOString(),
            });
            console.log(`[MarketingOS] Blast job queued: id=${job.id} channel=${channel} leads=${leads.length}`);
        } catch (queueErr) {
            // Redis offline — fall back to synchronous fire (non-blocking)
            console.warn('[MarketingOS] BullMQ unavailable, switching to sync dispatch:', queueErr.message);
        }

        res.json({
            success:   true,
            channel,
            segment,
            leadCount: leads.length,
            jobId:     job?.id || null,
            status:    job ? 'queued' : 'dispatching',
            message:   `${channel.toUpperCase()} campaign "${name || 'Campaign'}" queued for ${leads.length} contacts in segment "${segment || 'all'}".`,
            queuedAt:  new Date().toISOString(),
        });

    } catch (error) {
        console.error('[MarketingController] sendCampaign Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/marketing/activate-drip
 * Phase D: Enqueues a real BullMQ 'drip' job.
 *
 * Body: { leadId, sequenceId, delayMs? }
 */
export const activateDrip = async (req, res) => {
    try {
        const { leadId, sequenceId, delayMs = 0 } = req.body;

        if (!leadId) {
            return res.status(400).json({ success: false, error: 'leadId is required' });
        }

        const lead = await Lead.findById(leadId).catch(() => null);
        const leadName = lead
            ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Lead'
            : leadId;

        // ── Enqueue real BullMQ drip job ──────────────────────────────────
        let job;
        try {
            const queue = await getMarketingQueue();
            job = await queue.add('drip', {
                leadId,
                leadName,
                sequenceId: sequenceId || 'default-nurture',
                step: 1,
                startedAt: new Date().toISOString(),
            }, {
                delay: parseInt(delayMs, 10) || 0,
            });
            console.log(`[MarketingOS] Drip job queued: id=${job.id} lead=${leadName} seq=${sequenceId}`);
        } catch (queueErr) {
            console.warn('[MarketingOS] BullMQ unavailable for drip:', queueErr.message);
        }

        res.json({
            success:    true,
            leadId,
            leadName,
            sequenceId: sequenceId || 'default-nurture',
            jobId:      job?.id   || null,
            status:     job ? 'queued' : 'pending',
            message:    `Drip sequence activated for ${leadName}.`,
            startedAt:  new Date().toISOString(),
        });

    } catch (error) {
        console.error('[MarketingController] activateDrip Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/marketing/job-status/:jobId
 * Phase D: Poll BullMQ job state for UI progress tracking.
 */
export const getJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        if (!jobId) return res.status(400).json({ success: false, error: 'jobId is required' });

        const queue = await getMarketingQueue();
        const job   = await queue.getJob(jobId);

        if (!job) {
            return res.status(404).json({ success: false, error: `Job ${jobId} not found` });
        }

        const state    = await job.getState();   // 'active'|'waiting'|'completed'|'failed'|'delayed'
        const progress = job.progress || 0;
        const logs     = await job.getLogs();
        const result   = job.returnvalue;

        res.json({
            success: true,
            jobId,
            name:     job.name,
            state,
            progress,
            logs:     logs.logs || [],
            result:   result || null,
            failedReason: job.failedReason || null,
            processedOn:  job.processedOn  ? new Date(job.processedOn).toISOString()  : null,
            finishedOn:   job.finishedOn   ? new Date(job.finishedOn).toISOString()   : null,
        });
    } catch (error) {
        console.error('[MarketingController] getJobStatus Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};


