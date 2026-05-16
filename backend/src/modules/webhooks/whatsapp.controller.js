import Intake from '../../../models/Intake.js';
import aiVerificationEngine from '../../../services/intakeVerification/AIVerificationEngine.js';
import intakeAIAssistantEngine from '../../../services/intakeVerification/IntakeAIAssistantEngine.js';
import DealVerificationService from '../../../services/DealVerificationService.js';

/**
 * Webhook endpoint for WhatsApp Business API
 * Receives incoming messages from property owners to auto-verify missing details.
 */
export const handleWhatsAppReply = async (req, res) => {
    try {
        const { entry } = req.body;
        
        if (!entry || !entry[0].changes) {
            return res.status(200).send('EVENT_RECEIVED');
        }

        const change = entry[0].changes[0].value;
        if (change.messages && change.messages[0]) {
            const message = change.messages[0];
            const senderPhone = message.from; 
            const textContent = message.text?.body;

            if (textContent) {
                console.log(`[WhatsAppWebhook] Processing message from ${senderPhone}`);

                // 1. Check if this is a reply to an active Deal Verification (v2.0 Logic)
                const handledByDealService = await DealVerificationService.processVerificationReply(
                    senderPhone,
                    textContent,
                    req.body
                );

                if (handledByDealService) {
                    console.log(`[WhatsAppWebhook] ✅ Message handled by DealVerificationService for ${senderPhone}`);
                    return res.status(200).send('EVENT_RECEIVED');
                }

                // 2. FALLBACK: Find the pending Intake waiting for verification
                const recentIntake = await Intake.findOne({
                    status: { $in: ['Processed', 'Queued', 'Processing'] },
                    contact_numbers: senderPhone
                }).sort({ createdAt: -1 });

                if (recentIntake) {
                    console.log(`[AutoVerify] Received WhatsApp reply for Intake ${recentIntake._id}`);
                    
                    // 2. Use LLM to parse the reply and extract missing fields
                    const { default: llmService } = await import('../../../services/ai/LLMService.js');
                    const llmResult = await llmService.extractPropertyData(textContent);
                    let updated = false;

                    if (llmResult) {
                        if (!recentIntake.price && llmResult.price) {
                            recentIntake.price = llmResult.price;
                            updated = true;
                        }
                        if (!recentIntake.size && llmResult.size) {
                            recentIntake.size = llmResult.size;
                            updated = true;
                        }
                        if (!recentIntake.location && llmResult.location) {
                            recentIntake.location = llmResult.location;
                            updated = true;
                        }
                    }

                    if (updated) {
                        // 3. Re-run Verification & AI Assistant with the new data
                        const verificationResult = await aiVerificationEngine.verify(recentIntake);
                        Object.assign(recentIntake, verificationResult);

                        const aiAssistantResult = intakeAIAssistantEngine.analyze(recentIntake);
                        recentIntake.ai_assistant = aiAssistantResult;

                        // 4. Mark as verified if confidence is high now
                        if (recentIntake.confidence_score >= 80) {
                            recentIntake.verification_status = 'verified';
                            recentIntake.verification_notes.push(`System Auto-Verified via WhatsApp reply from ${senderPhone}.`);
                            
                            // STP Logic: If score > 95, it's a perfect record, auto-forward
                            if (recentIntake.confidence_score >= 95 && recentIntake.duplicate_intelligence?.duplicate_probability < 10) {
                                recentIntake.status = 'Ready for Review';
                            }
                        }

                        await recentIntake.save();
                        console.log(`[AutoVerify] Intake ${recentIntake._id} updated via WhatsApp Webhook.`);
                    }
                }
            }
        }

        // Always return 200 to WhatsApp to acknowledge receipt
        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        console.error('[WhatsApp Webhook Error]:', error);
        res.status(500).send('Server Error');
    }
};

/**
 * Webhook Verification (for initial Meta App setup)
 */
export const verifyWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'bharat_crm_token';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
};
