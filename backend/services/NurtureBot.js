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

            // Immediately proceed to Step 1: Send WhatsApp & SMS
            await this._sendWelcomeMessages(lead, deal);
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
                await this._sendWelcomeMessages(lead);
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

    /**
     * Executes the omnichannel automation based on unified rules.
     * @param {string} triggerId - The event trigger ID (e.g., 'Lead Created')
     * @param {Object} lead - Lead document
     * @param {Object} deal - Optional Deal context
     */
    async executeAutomation(triggerId, lead, deal = null) {
        try {
            const SystemSetting = (await import('../src/modules/systemSettings/system.model.js')).default;
            const smartConfig = await SystemSetting.findOne({ key: 'unified_automation_rules' }).lean();
            
            if (!smartConfig || !smartConfig.value?.[triggerId]) {
                console.log(`[AutomationEngine] No rules found for trigger: ${triggerId}`);
                return;
            }

            const rule = smartConfig.value[triggerId];
            const name = lead.firstName || 'Valued Customer';

            const resolveVars = (str) => {
                if (!str) return str;
                return str
                    .replace(/{{fullName}}/g, `${lead.firstName} ${lead.lastName || ''}`.trim())
                    .replace(/{{firstName}}/g, lead.firstName || 'Valued Customer')
                    .replace(/{{projectName}}/g, deal?.projectName || 'our projects')
                    .replace(/{{agentName}}/g, 'Team Bharat Properties');
            };

            console.log(`[AutomationEngine] Orchestrating: ${triggerId} for ${lead.mobile}`);

            // 1. WhatsApp Action
            if (rule.whatsapp?.enabled) {
                try {
                    const wa = rule.whatsapp;
                    if (wa.templateName) {
                        const components = [{ type: 'body', parameters: [{ type: 'text', text: name }] }];
                        await whatsAppService.sendTemplate(lead.mobile, wa.templateName, 'en_US', components);
                        await this._logActivity(lead._id, 'WhatsApp', `Automated [${wa.templateName}] sent via ${triggerId}`);
                    } else if (wa.body) {
                        await whatsAppService.sendMessage(lead.mobile, resolveVars(wa.body));
                        await this._logActivity(lead._id, 'WhatsApp', `Manual WhatsApp sent via ${triggerId}`);
                    }
                } catch (waErr) {
                    console.error('[AutomationEngine] WhatsApp Error:', waErr.message);
                }
            }

            // 2. SMS Action
            if (rule.sms?.enabled && rule.sms.body) {
                try {
                    await smsService.sendSms(lead.mobile, resolveVars(rule.sms.body), { 
                        dltTemplateId: rule.sms.dltId || 'DEFAULT_WELCOME'
                    });
                    await this._logActivity(lead._id, 'SMS', `Automated SMS sent via ${triggerId}`);
                } catch (smsErr) {
                    console.error('[AutomationEngine] SMS Error:', smsErr.message);
                }
            }

            // 3. Email Action
            if (rule.email?.enabled && lead.email) {
                try {
                    const subject = resolveVars(rule.email.subject || `Update from Bharat Properties`);
                    const html = resolveVars(rule.email.body || '').replace(/\n/g, '<br/>');
                    await emailService.sendEmail(lead.email, subject, resolveVars(rule.sms?.body || 'Hello'), html);
                    await this._logActivity(lead._id, 'Email', `Automated Email sent via ${triggerId}`);
                } catch (emailErr) {
                    console.error('[AutomationEngine] Email Error:', emailErr.message);
                }
            }

        } catch (err) {
            console.error(`[AutomationEngine] Global failure for ${triggerId}:`, err.message);
        }
    }

    async _sendWelcomeMessages(lead, deal = null) {
        // Now fully handled by the generic automation engine
        await this.executeAutomation('Lead Created', lead, deal);
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
        // Advanced follow-up can now be part of the 'Follow-up' rule
        await this.executeAutomation('Follow-up', lead);
    }

    async _requestSiteVisit(lead) {
        // Handled by 'Visit Scheduled' rule
        await this.executeAutomation('Visit Scheduled', lead);
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
