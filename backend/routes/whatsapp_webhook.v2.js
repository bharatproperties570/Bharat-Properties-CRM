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
    if (message?.type !== 'text') return;

    const rawMobile  = message?.from;
    const userText   = message?.text?.body || '';
    const mobile     = normalizePhone(rawMobile);

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
