/**
 * CampaignEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The core orchestration service that fires when a Deal is created.
 * It fetches all eligible leads from CRM, builds personalised messages
 * using the deal's property data, and dispatches them across all enabled
 * channels (WhatsApp, Email, SMS) asynchronously.
 *
 * Design Principles:
 *  - Fire-and-forget: never blocks the main request thread.
 *  - Mock-safe: every channel degrades gracefully if credentials are absent.
 *  - Auditable: logs a CampaignRun record (inline object on Deal) after dispatch.
 */

import Lead from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import Deal from '../models/Deal.js';
import emailService from './email.service.js';
import whatsAppService from './WhatsAppService.js';
import smsService from './SmsService.js';
import {
    CAMPAIGN_CHANNELS,
    buildWhatsAppTemplate,
    buildEmailTemplate,
    buildSmsTemplate,
} from './CampaignConfig.js';

class CampaignEngine {
    /**
     * Launch a full marketing campaign for a newly created Deal.
     * Called asynchronously from the Deal controller — must not throw.
     *
     * @param {string|ObjectId} dealId
     */
    async launch(dealId) {
        try {
            console.log(`[CampaignEngine] 🚀 Launching campaign for Deal: ${dealId}`);

            // 1. Populate the deal with its linked inventory
            const deal = await Deal.findById(dealId).lean();
            if (!deal) {
                console.warn(`[CampaignEngine] Deal ${dealId} not found. Skipping.`);
                return;
            }

            // 2. Fetch linked inventory (if any)
            let inv = null;
            if (deal.inventoryId) {
                inv = await Inventory.findById(deal.inventoryId)
                    .populate('address.city address.locality')
                    .lean();
            }

            // 3. Fetch target leads from CRM
            //    Target: All leads whose status is NOT 'Closed/Lost' and have a mobile.
            const leads = await this._getTargetLeads(deal);
            console.log(`[CampaignEngine] Found ${leads.length} target leads.`);

            if (leads.length === 0) {
                console.log(`[CampaignEngine] No target leads found. Campaign skipped.`);
                return;
            }

            const mobiles = leads.map(l => l.mobile).filter(Boolean);
            const emails  = leads.map(l => l.email).filter(Boolean);

            // 4. Build message templates
            const waTemplate    = buildWhatsAppTemplate(deal, inv);
            const emailTemplate = buildEmailTemplate(deal, inv);
            const smsTemplate   = buildSmsTemplate(deal, inv);

            // 5. Dispatch channels (in parallel, fire-and-forget per channel)
            const dispatches = [];

            if (CAMPAIGN_CHANNELS.WHATSAPP.enabled && mobiles.length > 0) {
                dispatches.push(
                    this._dispatch('WhatsApp', () =>
                        whatsAppService.broadcast(mobiles, waTemplate.message)
                    )
                );
            }

            if (CAMPAIGN_CHANNELS.EMAIL.enabled && emails.length > 0) {
                dispatches.push(
                    this._dispatch('Email', () =>
                        this._sendBulkEmail(emails, emailTemplate)
                    )
                );
            }

            if (CAMPAIGN_CHANNELS.SMS.enabled && mobiles.length > 0) {
                // Small delay so WhatsApp goes first
                await new Promise(r => setTimeout(r, CAMPAIGN_CHANNELS.SMS.delayMs));
                dispatches.push(
                    this._dispatch('SMS', () =>
                        smsService.bulkSend(mobiles, smsTemplate.message)
                    )
                );
            }

            const results = await Promise.allSettled(dispatches);

            // 6. Summarise results
            const summary = results.map((r, i) => ({
                channel: ['WhatsApp', 'Email', 'SMS'][i],
                status:  r.status,
                value:   r.value,
            }));

            console.log(`[CampaignEngine] ✅ Campaign complete for Deal ${dealId}:`, summary);

            // 7. Save campaign run summary back to Deal (non-blocking upsert)
            await Deal.findByIdAndUpdate(dealId, {
                $push: {
                    campaignRuns: {
                        launchedAt: new Date(),
                        leadsTargeted: leads.length,
                        channels: summary,
                    },
                },
            }).catch(err => console.error('[CampaignEngine] Failed to update Deal campaignRuns:', err));

        } catch (err) {
            console.error(`[CampaignEngine] Unhandled error for Deal ${dealId}:`, err);
        }
    }

    /**
     * Get the list of leads to target for a new Deal campaign.
     * Filters: active leads matching the deal's project/location interest.
     */
    async _getTargetLeads(deal) {
        const query = {
            mobile: { $exists: true, $ne: '' },
            // Exclude leads that are already in a closed state
            $or: [
                { 'stageHistory.0': { $exists: false } },
                { lead_classification: { $ne: 'Disqualified' } },
            ],
        };

        // Narrow by location if deal has a city
        if (deal.city) {
            query.locCity = { $regex: deal.city, $options: 'i' };
        }

        return Lead.find(query)
            .select('mobile email firstName lastName intent_index')
            .limit(500)     // safety cap — increase for production
            .lean();
    }

    /**
     * Send emails to a list of addresses using the existing EmailService.
     */
    async _sendBulkEmail(emails, template) {
        const results = { sent: 0, failed: 0 };
        for (const email of emails) {
            try {
                await emailService.sendEmail(
                    email,
                    template.subject,
                    template.text,
                    template.html,
                );
                results.sent++;
            } catch (err) {
                console.error(`[CampaignEngine] Email failed for ${email}:`, err.message);
                results.failed++;
            }
            // Small cooldown between emails
            await new Promise(r => setTimeout(r, 150));
        }
        return results;
    }

    /**
     * Wraps a channel dispatch with error isolation.
     */
    async _dispatch(label, fn) {
        try {
            const result = await fn();
            console.log(`[CampaignEngine] ${label} dispatch done:`, result?.sent ?? '?', 'sent');
            return result;
        } catch (err) {
            console.error(`[CampaignEngine] ${label} dispatch error:`, err.message);
            return { error: err.message };
        }
    }
}

export default new CampaignEngine();
