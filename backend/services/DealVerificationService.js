/**
 * ================================================================
 *  DealVerificationService  v2.0
 *  Bharat Properties CRM — Antigravity Compatible
 * ================================================================
 *
 *  WHAT THIS DOES:
 *  1. triggerVerification()  — Deal bante hi WhatsApp template bhejta hai
 *  2. processVerificationReply() — Webhook se incoming reply process karta hai
 *     → AI se intent parse karta hai (Confirmed / Denied / Corrected / Callback)
 *     → Deal stage + Activity log auto-update karta hai
 *     → Agent sirf tab notify hota hai jab genuinely zaroorat ho
 *
 *  DEAL STAGES USED:
 *  'New' → 'Verified' | 'Price Disputed' | 'Callback Requested' | 'Denied'
 * ================================================================
 */

import crypto  from 'crypto';
import Deal    from '../models/Deal.js';
import Activity from '../models/Activity.js';
import Conversation from '../models/Conversation.js';
import Contact from '../models/Contact.js';
import WhatsAppService from './WhatsAppService.js';
import { resolveLeadLookup } from '../models/Lead.js';
import NotificationEngine from './NotificationEngine.js';
import unifiedAIService from './UnifiedAIService.js';

// ── Structured logger ──────────────────────────────────────────
const log = {
    info:  (tid, msg, m={}) => console.log(JSON.stringify({ level:'info',  svc:'DealVerify', traceId:tid, msg, ...m, ts: new Date().toISOString() })),
    warn:  (tid, msg, m={}) => console.warn(JSON.stringify({ level:'warn',  svc:'DealVerify', traceId:tid, msg, ...m, ts: new Date().toISOString() })),
    error: (tid, msg, m={}) => console.error(JSON.stringify({ level:'error', svc:'DealVerify', traceId:tid, msg, ...m, ts: new Date().toISOString() })),
};

// ── AI Intent Categories ───────────────────────────────────────
const VERIFICATION_INTENTS = {
    CONFIRMED:          'CONFIRMED',           // User ne sab sahi bataya
    PRICE_CORRECTED:    'PRICE_CORRECTED',     // Price galat thi, correction di
    PROJECT_CORRECTED:  'PROJECT_CORRECTED',   // Project name galat tha
    INTENT_CORRECTED:   'INTENT_CORRECTED',    // Buyer/Seller galat tha
    DENIED:             'DENIED',              // "Mujhe koi deal nahi karni" / spam
    CALLBACK_REQUESTED: 'CALLBACK_REQUESTED',  // "Agent se baat karni hai"
    UNCLEAR:            'UNCLEAR',             // AI samajh nahi paya
};

// ── AI Prompt Builder ──────────────────────────────────────────
/**
 * Builds the system prompt for the AI verification agent.
 * Injects deal context so AI knows exactly what to verify.
 */
const buildVerificationPrompt = (deals) => {
    const dealContext = deals.map((d, i) =>
        `Deal ${i + 1}:
  - Project: ${d.projectName || 'Unknown'}
  - Price: ${d.price ? `₹${(d.price / 100000).toFixed(1)} Lac` : 'Not captured'}
  - Type: ${d.name?.startsWith('Resale') ? 'Seller (Resale)' : 'Buyer Inquiry'}
  - Deal ID (internal): ${d._id}`
    ).join('\n\n');

    return `You are the Deal Verification Specialist for Bharat Properties.
Your primary mission is to verify the accuracy of "Deal" records captured by our automated intake engine.

### CORE OBJECTIVE:
- Confirm PROJECT NAME, EXPECTED PRICE, and INTENT (Selling/Buying).
- Be polite, professional, and helpful.
- If the user confirms, thank them and let them know an agent will reach out soon.
- If the user denies or corrects a detail, acknowledge it and update them that the record has been corrected.
- NEVER share sensitive IDs or unit numbers.

### RECENT SYSTEM ACTIONS (DO NOT SHARE RAW DATA):
${dealContext}

### TONE:
- Professional, efficient, and reliable. Use Hinglish where appropriate to build rapport.

### RESPONSE FORMAT (STRICT JSON):
You must respond with a valid JSON object only. No markdown, no explanation outside JSON.
{
  "intent": "<one of: CONFIRMED | PRICE_CORRECTED | PROJECT_CORRECTED | INTENT_CORRECTED | DENIED | CALLBACK_REQUESTED | UNCLEAR>",
  "correctedData": {
    "price": <number or null>,
    "projectName": "<string or null>",
    "dealIntent": "<BUYER or SELLER or null>"
  },
  "replyMessage": "<the actual message to send back to the user in Hinglish>",
  "requiresAgentFollowup": <true or false>,
  "agentNote": "<brief note for agent if requiresAgentFollowup is true, else null>"
}`;
};

// ================================================================
class DealVerificationService {

    // ────────────────────────────────────────────────────────────
    // 1. TRIGGER — Deal bante hi call hota hai
    // ────────────────────────────────────────────────────────────
    /**
     * Sends WhatsApp verification template and marks conversation
     * as 'intake_verification' mode.
     *
     * @param {object} deal     - Mongoose Deal document
     * @param {object} contactInfo  - { mobile: string, name: string }
     */
    static async triggerVerification(deal, contactInfo) {
        const traceId = crypto.randomBytes(6).toString('hex');
        const { mobile, name } = contactInfo;

        if (!mobile) {
            log.warn(traceId, 'triggerVerification called without mobile — skipping', { dealId: deal._id });
            return;
        }

        try {
            log.info(traceId, 'Triggering verification', { dealId: deal._id, mobile });

            // Build WhatsApp template components
            const priceDisplay = deal.price
                ? `₹${(deal.price / 100000).toFixed(1)} Lac`
                : 'price not captured';

            const components = [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: name || 'Valued Client' },
                        { type: 'text', text: deal.projectName || 'the property' },
                        { type: 'text', text: priceDisplay },
                    ],
                },
            ];

            // Send template
            const sendResult = await WhatsAppService.sendTemplate(
                mobile,
                'deal_intake_verification',
                'en_US',
                components
            );

            if (!sendResult?.success) {
                throw new Error(`WhatsApp template send failed: ${sendResult?.error || 'unknown'}`);
            }

            // Mark conversation in verification mode + attach deal reference
            await Conversation.findOneAndUpdate(
                { phoneNumber: mobile.replace(/\D/g, '') },
                {
                    $set: {
                        currentUseCase:       'intake_verification',
                        verificationDealIds:  [deal._id],   // supports multi-deal later
                        verificationTriggeredAt: new Date(),
                    },
                },
                { upsert: true, new: true }
            );

            // Log activity on deal
            await Activity.create({
                deal:        deal._id,
                type:        'WhatsApp',
                direction:   'Outbound',
                description: `Verification message sent to ${mobile}`,
                meta:        { traceId, template: 'deal_intake_verification' },
            });

            log.info(traceId, 'Verification triggered successfully', { dealId: deal._id });

        } catch (err) {
            log.error(traceId, 'triggerVerification failed', { dealId: deal._id, err: err.message });
            // Non-critical — don't rethrow, intake should still succeed
        }
    }

    // ────────────────────────────────────────────────────────────
    // 2. PROCESS REPLY — Webhook se incoming message aane par
    // ────────────────────────────────────────────────────────────
    /**
     * Main entry point called by the WhatsApp webhook handler.
     * Checks if message is a verification reply, runs AI, updates CRM.
     *
     * @param {string} mobile       - Normalized phone number
     * @param {string} userMessage  - User's reply text
     * @param {object} [rawPayload] - Full webhook payload for logging
     * @returns {Promise<boolean>}  - true if handled, false if not a verification reply
     */
    static async processVerificationReply(mobile, userMessage, rawPayload = {}) {
        const traceId = crypto.randomBytes(6).toString('hex');
        const cleanMobile = mobile.replace(/\D/g, '');

        // 1. Check if this conversation is in verification mode
        const conversation = await Conversation.findOne({
            phoneNumber:    cleanMobile,
            currentUseCase: 'intake_verification',
        }).lean();

        if (!conversation) return false; // Not our message to handle

        log.info(traceId, 'Verification reply received', { mobile: cleanMobile, msgPreview: userMessage.slice(0, 60) });

        // 2. Load pending deals for this contact
        const dealIds = conversation.verificationDealIds || [];
        if (!dealIds.length) {
            log.warn(traceId, 'No dealIds found in conversation', { mobile: cleanMobile });
            return false;
        }

        const deals = await Deal.find({ _id: { $in: dealIds } }).lean();
        if (!deals.length) {
            log.warn(traceId, 'Deals not found in DB', { dealIds });
            return false;
        }

        // 3. Ask AI to parse intent
        let aiResult;
        try {
            aiResult = await DealVerificationService._parseWithAI(
                userMessage,
                deals,
                traceId
            );
        } catch (aiErr) {
            log.error(traceId, 'AI parsing failed', { err: aiErr.message });
            // Fallback — mark as UNCLEAR and escalate to agent
            aiResult = {
                intent:                VERIFICATION_INTENTS.UNCLEAR,
                correctedData:         { price: null, projectName: null, dealIntent: null },
                replyMessage:          'Shukriya aapke jawab ke liye. Hamara agent aapse jald sampark karega.',
                requiresAgentFollowup: true,
                agentNote:             `AI parsing failed. Raw reply: "${userMessage}"`,
            };
        }

        log.info(traceId, 'AI intent resolved', { intent: aiResult.intent, dealIds });

        // 4. Update CRM based on AI intent
        await DealVerificationService._applyCrmUpdates(
            deals,
            aiResult,
            cleanMobile,
            traceId
        );

        // 5. Send reply back to user
        if (aiResult.replyMessage) {
            try {
                await WhatsAppService.sendMessage(cleanMobile, aiResult.replyMessage);
            } catch (replyErr) {
                log.warn(traceId, 'Failed to send AI reply', { err: replyErr.message });
            }
        }

        // 6. Clear verification mode (unless still pending more deals)
        const allHandled = deals.length <= 1 ||
            [VERIFICATION_INTENTS.CONFIRMED, VERIFICATION_INTENTS.DENIED].includes(aiResult.intent);

        if (allHandled) {
            await Conversation.findOneAndUpdate(
                { phoneNumber: cleanMobile },
                {
                    $set:   { currentUseCase: 'general' },
                    $unset: { verificationDealIds: '', verificationTriggeredAt: '' },
                }
            );
            log.info(traceId, 'Verification mode cleared', { mobile: cleanMobile });
        }

        // 7. Notify agent if required
        if (aiResult.requiresAgentFollowup) {
            try {
                const contact = await Contact.findOne({ 'phones.number': cleanMobile }).lean();
                await NotificationEngine.notify({
                    type: 'messaging',
                    title: `⚠️ Deal Verification Alert: ${aiResult.intent}`,
                    message: aiResult.agentNote || `Action required for ${contact ? contact.name : cleanMobile}`,
                    metadata: { 
                        dealIds, 
                        mobile: cleanMobile,
                        intent: aiResult.intent,
                        traceId 
                    },
                    priority: 'high'
                });
                log.info(traceId, 'Agent notified', { reason: aiResult.intent });
            } catch (notifyErr) {
                log.warn(traceId, 'Agent notification failed', { err: notifyErr.message });
            }
        }

        return true; // Message was handled
    }

    // ────────────────────────────────────────────────────────────
    // 3. AI PARSER — Unified AI call
    // ────────────────────────────────────────────────────────────
    /**
     * Calls Unified AI API to classify user reply intent.
     * Returns structured JSON matching VERIFICATION_INTENTS.
     */
    static async _parseWithAI(userMessage, deals, traceId) {
        const systemPrompt = buildVerificationPrompt(deals);

        log.info(traceId, 'Parsing intent using Unified AI Engine...');
        const rawText = await unifiedAIService.generate(
            userMessage,
            { systemPrompt, temperature: 0.1, maxTokens: 500 }
        );

        // Strip any accidental markdown fences
        const clean = rawText.replace(/```json|```/gi, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(clean);
        } catch {
            throw new Error(`AI returned invalid JSON: ${clean.slice(0, 200)}`);
        }

        // Validate intent is known
        if (!Object.values(VERIFICATION_INTENTS).includes(parsed.intent)) {
            log.warn(traceId, 'Unknown intent from AI — defaulting to UNCLEAR', { intent: parsed.intent });
            parsed.intent = VERIFICATION_INTENTS.UNCLEAR;
        }

        return parsed;
    }

    // ────────────────────────────────────────────────────────────
    // 4. CRM UPDATER — DB writes based on AI decision
    // ────────────────────────────────────────────────────────────
    static async _applyCrmUpdates(deals, aiResult, mobile, traceId) {
        const { intent, correctedData } = aiResult;

        // Stage mapping
        const stageMap = {
            [VERIFICATION_INTENTS.CONFIRMED]:          'Verified',
            [VERIFICATION_INTENTS.PRICE_CORRECTED]:    'Price Disputed',
            [VERIFICATION_INTENTS.PROJECT_CORRECTED]:  'Details Updated',
            [VERIFICATION_INTENTS.INTENT_CORRECTED]:   'Details Updated',
            [VERIFICATION_INTENTS.DENIED]:             'Denied',
            [VERIFICATION_INTENTS.CALLBACK_REQUESTED]: 'Callback Requested',
            [VERIFICATION_INTENTS.UNCLEAR]:            'Callback Requested',
        };

        const newStageName = stageMap[intent] || 'Callback Requested';

        // Resolve stage ID once
        const stageId = await resolveLeadLookup('DealStage', newStageName);

        for (const deal of deals) {
            try {
                const updatePayload = { stage: stageId, verifiedAt: new Date() };

                // Apply corrections if AI detected them
                if (intent === VERIFICATION_INTENTS.PRICE_CORRECTED && correctedData?.price > 0) {
                    updatePayload.price = correctedData.price;
                    updatePayload['remarks'] = `Price corrected by client via WhatsApp from ₹${deal.price} to ₹${correctedData.price}`;
                }
                if (intent === VERIFICATION_INTENTS.PROJECT_CORRECTED && correctedData?.projectName) {
                    updatePayload.projectName = correctedData.projectName;
                }

                await Deal.findByIdAndUpdate(deal._id, { $set: updatePayload });

                // Activity log
                await Activity.create({
                    deal:        deal._id,
                    type:        'WhatsApp',
                    direction:   'Inbound',
                    description: `Verification reply: ${intent}`,
                    meta: {
                        traceId,
                        intent,
                        correctedData: correctedData || null,
                        agentNote:     aiResult.agentNote || null,
                    },
                });

                log.info(traceId, 'Deal updated', { dealId: deal._id, stage: newStageName, intent });

            } catch (updateErr) {
                log.error(traceId, 'Deal update failed', { dealId: deal._id, err: updateErr.message });
            }
        }
    }
}

export default DealVerificationService;
export { VERIFICATION_INTENTS };
