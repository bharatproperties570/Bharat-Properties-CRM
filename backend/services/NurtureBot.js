/**
 * NurtureBot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-driven lead nurturing state machine.
 *
 * State Flow:
 *   LEAD_CREATED → WA_SENT → CALL_QUEUED → EMAIL_SENT → VISIT_BOOKED → HANDOFF
 *
 * The bot advances a lead through stages automatically:
 *  1. Send WhatsApp message immediately on lead entry
 *  2. If no reply in 24h → queue for an outgoing call
 *  3. After call attempt → send email with property brochure
 *  4. After 48h → attempt to book a site visit
 *  5. Hand off to human sales agent with full context
 *
 * To run the cron: import and call NurtureBot.processPendingLeads() every hour.
 */

import Lead, { resolveLeadLookup } from '../models/Lead.js';
import Activity from '../models/Activity.js';
import Deal from '../models/Deal.js';
import whatsAppService from './WhatsAppService.js';
import emailService from './email.service.js';
import smsService from './SmsService.js';
import exotelService from './ExotelService.js';
import unifiedAIService from './UnifiedAIService.js';
import { createNotification } from '../controllers/notification.controller.js';

// ── Nurture State Definitions ─────────────────────────────────────────────────
const STATES = {
    LEAD_CREATED:  { next: 'WA_SENT',       delayHours: 0  },
    WA_SENT:       { next: 'CALL_QUEUED',    delayHours: 24 },
    CALL_QUEUED:   { next: 'EMAIL_SENT',     delayHours: 2  },
    EMAIL_SENT:    { next: 'VISIT_BOOKED',   delayHours: 48 },
    VISIT_BOOKED:  { next: 'HANDOFF',        delayHours: 0  },
    HANDOFF:       { next: null,             delayHours: 0  }, // Terminal
};

class NurtureBot {
    /**
     * Start the nurture flow for a newly captured lead.
     * Should be called right after a lead is created via the webhook.
     *
     * @param {Object} lead  - Mongoose Lead document
     * @param {Object} deal  - Associated Deal document (for context)
     */
    async initiate(lead, deal = null) {
        try {
            console.log(`[NurtureBot] Initiating for Lead: ${lead._id} (${lead.mobile})`);

            // Set initial nurture state
            await Lead.findByIdAndUpdate(lead._id, {
                $set: {
                    'customFields.nurtureState': 'LEAD_CREATED',
                    'customFields.nurtureStartedAt': new Date(),
                    'customFields.nurtureDealId': deal?._id?.toString(),
                    'customFields.nurtureLastAdvancedAt': new Date(),
                },
            });

            // Immediately proceed to Step 1: Send WhatsApp
            await this._sendWhatsApp(lead, deal);
        } catch (err) {
            console.error(`[NurtureBot] initiate error for Lead ${lead._id}:`, err.message);
        }
    }

    /**
     * Cron-driven method: advances all leads stuck in a pending nurture state.
     * Should be called via node-cron every 30–60 minutes.
     */
    async processPendingLeads() {
        console.log('[NurtureBot] Processing pending nurture leads...');

        const now = new Date();

        // Find all leads in an active nurture state that haven't advanced yet
        const leadsToAdvance = await Lead.find({
            'customFields.nurtureState': { $in: Object.keys(STATES).filter(s => s !== 'HANDOFF') },
        })
            .select('firstName mobile email customFields assignment')
            .lean();

        let advanced = 0;

        for (const lead of leadsToAdvance) {
            const state = lead.customFields?.nurtureState;
            const stateDef = STATES[state];
            if (!stateDef || !stateDef.next) continue;

            const lastAdvancedAt = lead.customFields?.nurtureLastAdvancedAt
                ? new Date(lead.customFields.nurtureLastAdvancedAt)
                : new Date(0);

            const hoursElapsed = (now - lastAdvancedAt) / (1000 * 60 * 60);

            if (hoursElapsed >= stateDef.delayHours) {
                await this._advanceState(lead);
                advanced++;
            }
        }

        console.log(`[NurtureBot] Advanced ${advanced} leads.`);
        return advanced;
    }

    /**
     * Internal: advance a lead to the next state and perform its action.
     */
    async _advanceState(lead) {
        const currentState = lead.customFields?.nurtureState;
        const nextState = STATES[currentState]?.next;
        if (!nextState) return;

        console.log(`[NurtureBot] Lead ${lead._id}: ${currentState} → ${nextState}`);

        // Update state
        await Lead.findByIdAndUpdate(lead._id, {
            $set: {
                'customFields.nurtureState': nextState,
                'customFields.nurtureLastAdvancedAt': new Date(),
            },
        });

        // Perform action for the new state
        switch (nextState) {
            case 'WA_SENT':
                await this._sendWhatsApp(lead);
                break;
            case 'CALL_QUEUED':
                await this._queueCall(lead);
                break;
            case 'EMAIL_SENT':
                await this._sendFollowUpEmail(lead);
                break;
            case 'VISIT_BOOKED':
                await this._requestSiteVisit(lead);
                break;
            case 'HANDOFF':
                await this._handoffToSales(lead);
                break;
        }
    }

    // ── Step Actions ──────────────────────────────────────────────────────────

    async _sendWhatsApp(lead, deal = null) {
        const name = lead.firstName || 'Valued Customer';
        
        // AI-Powered Personalized Message
        const prompt = `
            Generate a friendly, professional WhatsApp message for a real estate lead.
            Lead Name: ${name}
            Property Context: ${deal ? `${deal.unitNo} in ${deal.projectName}` : 'Premium Real Estate'}
            Goal: Thank them for their interest and offer more details.
            Tone: Helpful, not pushy.
            Constraint: Keep it under 300 characters. Use emojis.
        `;

        try {
            const message = await unifiedAIService.generate(prompt);
            if (lead.mobile) {
                await whatsAppService.sendMessage(lead.mobile, message);
                await this._logActivity(lead._id, 'WhatsApp', 'AI-Personalized WhatsApp sent by NurtureBot');
            }
        } catch (err) {
            console.error('[NurtureBot] AI WhatsApp failed, falling back to template:', err.message);
            const fallback = `👋 Hello *${name}*! Thank you for your interest in Bharat Properties. Reply YES to know more!`;
            if (lead.mobile) {
                await whatsAppService.sendMessage(lead.mobile, fallback);
                await this._logActivity(lead._id, 'WhatsApp', 'Template WhatsApp sent (AI Fallback)');
            }
        }
    }

    async _queueCall(lead) {
        console.log(`[NurtureBot] Triggering Exotel Call for ${lead.mobile} (Agent Connect)`);
        try {
            // Connect Agent (Current Owner) ⇄ Lead
            const agentPhone = lead.assignment?.assignedTo?.mobile || '9991000570'; // Default BP office number
            const callResult = await exotelService.makeCall(lead.mobile, agentPhone);

            await this._logActivity(lead._id, 'Call', 
                `Exotel call initiated [Agent Connect]. Status: ${callResult.Status || 'Active'}${callResult.mock ? ' [MOCK]' : ''}`
            );
        } catch (callErr) {
            console.error('[NurtureBot] Exotel call failed:', callErr.message);
            await this._logActivity(lead._id, 'Error', `Exotel Call Failed: ${callErr.message}`);
        }
    }

    async _sendFollowUpEmail(lead) {
        if (!lead.email) return;
        const name = lead.firstName || 'Valued Customer';

        const prompt = `
            Create a professional follow-up email for a real estate lead who didn't respond to WhatsApp.
            Lead Name: ${name}
            Company: Bharat Properties
            Goal: Share property portfolio link and invite for site visit.
            Output JSON: { "subject": "...", "html": "..." }
        `;

        try {
            const response = await unifiedAIService.generate(prompt);
            const { subject, html } = JSON.parse(response);
            await emailService.sendEmail(lead.email, subject, 'Follow-up from Bharat Properties', html);
            await this._logActivity(lead._id, 'Email', 'AI-Generated Follow-up email sent');
        } catch (err) {
            console.error('[NurtureBot] AI Email failed:', err.message);
            const subject = `📋 Your Property Report — Bharat Properties`;
            const html = `<p>Hello ${name}, we tried reaching you. Check our properties here: ${process.env.FRONTEND_URL}</p>`;
            await emailService.sendEmail(lead.email, subject, 'Follow-up from Bharat Properties', html);
            await this._logActivity(lead._id, 'Email', 'Template Email sent (AI Fallback)');
        }
    }

    async _requestSiteVisit(lead) {
        const name = lead.firstName || 'Customer';
        if (lead.mobile) {
            const message = `🏠 Hi *${name}*, your personalized property shortlist is ready!\n\n📅 Would you like to schedule a *FREE site visit*?\n\nReply *YES* with your preferred date and time, and we'll confirm within 2 hours! 🙏\n\n_Bharat Properties_`;
            await whatsAppService.sendMessage(lead.mobile, message);
        }
        await this._logActivity(lead._id, 'WhatsApp', 'Site visit request sent by NurtureBot');
    }

    async _handoffToSales(lead) {
        // Notify the assigned agent
        const assignedTo = lead.assignment?.assignedTo;
        if (assignedTo) {
            await createNotification(
                assignedTo,
                'assignment',
                '🤝 Lead Ready for Closing',
                `NurtureBot has warmed up ${lead.firstName || 'a lead'} (${lead.mobile}). They are ready for site visit / closing!`,
                `/leads/${lead._id}`,
                { leadId: lead._id }
            ).catch(err => console.error('[NurtureBot] Notification error:', err.message));
        }
        await this._logActivity(lead._id, 'Note', 'NurtureBot handoff complete — Lead ready for human follow-up');
        console.log(`[NurtureBot] ✅ Lead ${lead._id} handed off to sales team.`);
    }

    /**
     * Fetch aggregate stats for the Marketing Suite UI.
     * Enhanced for enterprise-grade real-time analytics.
     */
    async getMarketingStats() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Fetch counts for core KPI indicators
        const [
            totalCaptured, 
            hotLeads, 
            waActivities,
            allMarketingLeads,
            deals
        ] = await Promise.all([
            Lead.countDocuments({ tags: 'Marketing Automation' }),
            Lead.countDocuments({ 'customFields.nurtureState': 'VISIT_BOOKED' }),
            Activity.find({ 
                type: 'WhatsApp', 
                createdAt: { $gte: todayStart } 
            }).lean(),
            Lead.find({ tags: 'Marketing Automation' }).select('_id budget').lean(),
            Deal.find({ stage: { $ne: 'Closed Lost' } }).select('expectedValue price').lean()
        ]);

        // Calculate Pipeline Value (Enterprise Multi-Model Calculation)
        // Summing budgets from leads + prices from active deals
        const leadPipeline = allMarketingLeads.reduce((acc, l) => {
            const match = (l.budget || '').match(/\d+/);
            return acc + (match ? parseInt(match[0]) * 100000 : 0); // basic Lakhs conversion fallback
        }, 0);
        
        const dealPipeline = deals.reduce((acc, d) => acc + (d.price || d.expectedValue || 0), 0);
        const totalPipelineValue = leadPipeline + dealPipeline;

        // WhatsApp Professional Analytics (Real-time tracking)
        const waMetrics = {
            sent: waActivities.length,
            delivered: waActivities.filter(a => ['Delivered', 'Read', 'Completed'].includes(a.status)).length,
            read: waActivities.filter(a => a.status === 'Read').length,
            failed: waActivities.filter(a => a.status === 'Failed').length
        };

        const engagementRate = totalCaptured > 0 
            ? ((waMetrics.read / totalCaptured) * 100).toFixed(1) 
            : '0.0';

        const recentLeads = await Lead.find({ tags: 'Marketing Automation' })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('firstName lastName mobile email intent_index customFields createdAt stage source propertyType budget')
            .lean();

        const recentActivities = await Activity.find({ tags: { $in: ['Automation', 'NurtureBot'] } })
            .sort({ createdAt: -1 })
            .limit(15)
            .populate('entityId', 'firstName lastName mobile')
            .lean();

        // Map to standard Enterprise Dashboard DTO
        return {
            totalCaptured,
            hotLeads,
            nurturedToday: waMetrics.sent,
            totalPipelineValue,
            engagementRate: `${engagementRate}%`,
            waMetrics,
            recentLeads,
            recentActivities,
            kpiCards: [
                { label: 'TOTAL PIPELINE', val: `₹${(totalPipelineValue / 10000000).toFixed(2)}Cr`, sub: 'Active deal potential', type: 'blue' },
                { label: 'ENGAGEMENT', val: `${engagementRate}%`, sub: 'Response velocity', type: 'green' },
                { label: 'CONVERSIONS', val: String(hotLeads), sub: 'Ready for site visit', type: 'gold' },
                { label: 'ACTIVITY', val: String(waMetrics.sent), sub: 'Automations today', type: 'blue' }
            ]
        };
    }

    async _logActivity(leadId, type, note) {
        try {
            await Activity.create({
                type,
                subject:    note.substring(0, 100),   // Required: truncated summary
                entityType: 'Lead',                    // Required: this relates to a Lead
                entityId:   leadId,                    // Required: the specific lead
                dueDate:    new Date(),                // Required: set same as creation
                description: note,
                status:     'Completed',
                performedAt: new Date(),
                tags:       ['NurtureBot', 'Automation'],
            });
        } catch (err) {
            // Non-critical — don't let activity logging break the flow
            console.error(`[NurtureBot] Activity log failed:`, err.message);
        }
    }
}

export default new NurtureBot();
