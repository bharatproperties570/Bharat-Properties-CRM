/**
 * ================================================================
 *  WhatsApp Webhook Handler  v2.0
 *  Route: POST /api/social/webhook
 *  Verify: GET /api/social/webhook
 *  Bharat Properties CRM — Antigravity Compatible
 * ================================================================
 */

import crypto               from 'crypto';
import express              from 'express';
import { normalizePhone }   from '../utils/normalization.js';
import DealVerificationService from '../services/DealVerificationService.js';
import { receiveWebhook as legacyHandler } from '../controllers/social.controller.js';

import Lead from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import Activity from '../models/Activity.js';
import { autoTriggerStageChange } from '../controllers/activity.controller.js';
import { createNotification } from '../controllers/notification.controller.js';

const router = express.Router();

// ── Config ─────────────────────────────────────────────────────
const VERIFY_TOKEN    = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'bharat-properties-webhook-2026';
const APP_SECRET      = process.env.FB_APP_SECRET && process.env.FB_APP_SECRET !== 'YOUR_FB_APP_SECRET' ? process.env.FB_APP_SECRET : ''; 
const MAX_PAYLOAD_KB  = 512;

// ── Structured logger ──────────────────────────────────────────
const log = {
    info:  (tid, msg, m={}) => console.log(JSON.stringify({ level:'info',  svc:'WAWebhook', traceId:tid, msg, ...m, ts: new Date().toISOString() })),
    warn:  (tid, msg, m={}) => console.warn(JSON.stringify({ level:'warn',  svc:'WAWebhook', traceId:tid, msg, ...m, ts: new Date().toISOString() })),
    error: (tid, msg, m={}) => console.error(JSON.stringify({ level:'error', svc:'WAWebhook', traceId:tid, msg, ...m, ts: new Date().toISOString() })),
};

// ================================================================
//  GET /
//  Meta sends this once when you register the webhook URL
// ================================================================
router.get('/', (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        log.info(null, 'Webhook verified by Meta');
        return res.status(200).send(challenge);
    }

    log.warn(null, 'Webhook verification failed', { mode, tokenMatch: token === VERIFY_TOKEN });
    return res.sendStatus(403);
});

// ================================================================
//  POST /
//  All incoming WhatsApp events arrive here
// ================================================================
router.post(
    '/',
    express.json({ limit: `${MAX_PAYLOAD_KB}kb` }),
    async (req, res) => {
        const traceId = crypto.randomBytes(6).toString('hex');

        // Signature check
        if (APP_SECRET) {
            const sigHeader = req.headers['x-hub-signature-256'] || '';
            const expected  = 'sha256=' + crypto
                .createHmac('sha256', APP_SECRET)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (sigHeader !== expected) {
                log.warn(traceId, 'Invalid webhook signature — rejected');
                return res.sendStatus(401);
            }
        }

        // 1. Acknowledge Meta immediately
        res.sendStatus(200);

        // 2. Process Asynchronously
        setImmediate(() => processWebhookEvent(traceId, req.body, req).catch(err => {
            log.error(traceId, 'Webhook processing error', { err: err.message });
        }));
    }
);

async function processWebhookEvent(traceId, body, req) {
    if (body?.object !== 'whatsapp_business_account') {
        // Fallback to legacy handler for FB/IG comments
        return legacyHandler(req, { status: () => ({ json: () => {} }), send: () => {} });
    }

    const entries = body?.entry || [];
    for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
            if (change?.field !== 'messages') continue;
            const value    = change?.value || {};
            const messages = value?.messages || [];

            for (const message of messages) {
                await processMessage(traceId, message, value, req);
            }
            
            // If it's a status update (delivered/read), let legacy handler log it
            if (value?.statuses) {
                await legacyHandler(req, { status: () => ({ json: () => {} }), send: () => {} });
            }
        }
    }
}

async function processMessage(traceId, message, value, req) {
    const rawMobile  = message?.from;
    const mobile     = normalizePhone(rawMobile);
    
    // 🚀 ENTERPRISE FLOW LOGIC: Handle Flow Submissions
    if (message?.type === 'interactive' && message?.interactive?.type === 'nfm_reply') {
        return processFlowSubmission(traceId, message, mobile, req);
    }

    if (message?.type !== 'text') return;

    const userText   = message?.text?.body || '';

    log.info(traceId, 'Incoming message', { mobile, msg: userText.slice(0, 50) });

    // ROUTE 1: Deal Verification
    const handled = await DealVerificationService.processVerificationReply(
        mobile,
        userText,
        { message, value, traceId }
    );

    if (handled) {
        log.info(traceId, 'Message handled by DealVerificationService', { mobile });
        return;
    }

    // 🚀 ROUTE 1.5: Inbound Revival (Check if Lead is Dormant/Closed)
    try {
        const lead = await Lead.findOne({ mobile }).populate('stage').lean();
        if (lead && lead.stage) {
            const stageName = lead.stage.lookup_value || '';
            const terminalStages = ['closed', 'closed lost', 'closed won', 'dormant', 'stalled'];
            
            if (terminalStages.some(s => stageName.toLowerCase().includes(s))) {
                log.info(traceId, `Lead ${lead._id} is in terminal stage (${stageName}), attempting auto-revival`);
                
                // 1. Log the Inbound Activity
                const activity = await Activity.create({
                    entityType: 'Lead',
                    entityId: lead._id,
                    type: 'WhatsApp',
                    purpose: 'Inbound',
                    outcome: 'Inbound Message',
                    notes: `Inbound WhatsApp message received: "${userText}"`,
                    status: 'Completed',
                    dueDate: new Date(),
                    createdBy: lead.owner || null
                });

                // 2. Trigger Stage Change Engine (This will use our new 'inbound_revival_whatsapp' rule)
                await autoTriggerStageChange(activity._id, lead.owner);
                
                // 3. Notify the owner
                if (lead.owner) {
                    await createNotification(
                        lead.owner,
                        'leads',
                        '🔥 Lead Auto-Revived!',
                        `Lead ${lead.firstName || ''} was revived from ${stageName} due to an inbound WhatsApp message.`,
                        `/leads/${lead._id}`
                    );
                }
            }
        }
    } catch (err) {
        log.error(traceId, 'Failed to process inbound revival', { err: err.message });
    }

    // ROUTE 2: Fallback to General AI Bot (Legacy Logic)
    log.info(traceId, 'Routing to general AI bot (Legacy)', { mobile });
    return legacyHandler(req, { status: () => ({ json: () => {} }), send: () => {} });
}

export default router;

async function processFlowSubmission(traceId, message, mobile, req) {
    try {
        const nfm_reply = message.interactive.nfm_reply;
        if (!nfm_reply || !nfm_reply.response_json) {
            log.warn(traceId, 'Flow submission missing response_json');
            return;
        }

        const payload = JSON.parse(nfm_reply.response_json);
        log.info(traceId, 'Flow submission received', { mobile, payload });

        // 1. Find the most recently contacted Inventory for this mobile
        // Search across populated owners or direct legacy fields
        const inventory = await Inventory.findOne({
            $or: [
                { 'owners.phones.number': mobile },
                { 'ownerPhone': mobile },
                { 'associates.contact.phones.number': mobile },
                { 'associatedPhone': mobile }
            ]
        }).sort({ lastContactedAt: -1 }).populate('owners');

        if (!inventory) {
            log.warn(traceId, 'No matching Inventory found for flow submission', { mobile });
            return;
        }

        // 2. Map Flow Payload to CRM Fields
        let result = 'Not Interested';
        let reason = 'Unknown';
        let status = 'Active';
        let markAsSold = false;
        let intent = null;
        let scheduleFollowUp = false;

        if (payload.interested) {
            result = 'Interested';
            scheduleFollowUp = true;
            if (payload.interested === 'ready_to_sell') { reason = 'Ready to Sell Now'; intent = 'For Sale'; }
            else if (payload.interested === 'wants_to_buy') { reason = 'Wants to Buy (Invest)'; intent = 'For Sale'; }
            else if (payload.interested === 'sell_and_buy') { reason = 'Sell & Buy (Re-invest)'; intent = 'For Sale'; }
            else if (payload.interested === 'wants_to_rent') { reason = 'Wants to Rent'; intent = 'For Rent'; }
        } else if (payload.not_interested) {
            result = 'Not Interested';
            if (payload.not_interested === 'sold_out') { reason = 'Sold Out'; status = 'Sold Out'; markAsSold = true; }
            else if (payload.not_interested === 'rented_out') { reason = 'Rented Out'; status = 'Rented Out'; markAsSold = true; }
            else if (payload.not_interested === 'unreasonable_demand') { reason = 'Unreasonable demand'; status = 'Inactive'; }
            else if (payload.not_interested === 'plan_dropped') { reason = 'Plan Dropped/Personal'; status = 'Inactive'; }
            else if (payload.not_interested === 'family_dispute') { reason = 'Family Dispute'; status = 'Inactive'; }
            else if (payload.not_interested === 'self_use') { reason = 'Self Use'; status = 'Inactive'; }
            else if (payload.not_interested === 'sell_future') { reason = 'Sell in Future'; status = 'Inactive'; scheduleFollowUp = true; }
            else if (payload.not_interested === 'inquiring_rates') { reason = 'Inquiring Rates Only'; status = 'Inactive'; }
        }

        const customMessage = payload.message || '';
        const interactionNote = `${result} (${reason}) - Flow Auto-Reply: ${customMessage}`;

        // 3. Construct Update Payload
        const updatePayload = {
            $push: {
                interactions: {
                    note: interactionNote,
                    actor: mobile, // owner identifier
                    details: {
                        result,
                        reason,
                        feedback: customMessage,
                        source: 'WhatsApp Flow'
                    }
                }
            },
            $set: {
                lastContactedAt: new Date().toISOString(),
                lastContactDate: new Date().toLocaleDateString('en-GB'),
                lastContactUser: 'Auto (Flow)',
                remarks: `${result} (${reason}): ${customMessage}`,
                status: status
            }
        };

        if (intent && !inventory.intent?.includes(intent)) {
            updatePayload.$addToSet = { intent: intent };
        }

        let nextActionDateObj = null;
        if (payload.call_date && payload.call_date !== 'undefined' && payload.call_date !== 'null') {
            // Meta sends unix timestamp string e.g. "1698239081000"
            const parsedDate = new Date(parseInt(payload.call_date));
            if (!isNaN(parsedDate.getTime())) {
                const dateStr = parsedDate.toISOString().split('T')[0];
                let timeStr = '10:00';
                if (payload.call_time === 'afternoon') timeStr = '14:00';
                else if (payload.call_time === 'evening') timeStr = '17:00';
                
                nextActionDateObj = new Date(`${dateStr}T${timeStr}:00`);
                updatePayload.$set.followUpDate = nextActionDateObj.toISOString();
                scheduleFollowUp = true;
            }
        }

        // 4. Update Inventory
        await Inventory.findByIdAndUpdate(inventory._id, updatePayload);
        log.info(traceId, `Successfully updated Inventory ${inventory.unitNo} from Flow`, { inventoryId: inventory._id });

        // 5. Activity & Notification Engine
        // Create Follow Up Activity if needed
        if (scheduleFollowUp && nextActionDateObj) {
            await Activity.create({
                type: 'Follow Up',
                subject: `Flow Follow-up: Call for Unit ${inventory.unitNo}`,
                status: 'Pending',
                priority: 'High',
                scheduledDate: nextActionDateObj,
                dueDate: nextActionDateObj,
                relatedTo: [{ id: inventory._id, name: inventory.unitNo, model: 'Inventory' }],
                participants: [{ name: 'Owner (Flow)', mobile }],
                description: `Owner requested follow-up via WhatsApp Flow.\nReason: ${reason}\nMessage: ${customMessage}`
            });
        }

        // Notify assigned owner
        if (inventory.assignedTo) {
            await createNotification(
                inventory.assignedTo,
                'inventory',
                '📱 Flow Feedback Received!',
                `Owner of Unit ${inventory.unitNo} submitted feedback via WhatsApp: ${result} (${reason}).`,
                `/inventory/${inventory._id}`
            );
        }

    } catch (e) {
        log.error(traceId, 'Error processing Flow submission', { error: e.message });
    }
}
