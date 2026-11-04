import Intake from '../../models/Intake.js';
import AiAgent from '../../models/AiAgent.js';
import unifiedAIService from '../UnifiedAIService.js';
import whatsAppService from '../WhatsAppService.js';
import mongoose from 'mongoose';

/**
 * DealVerificationAgent
 * Enterprise-grade automated & interactive WhatsApp Deal Verification Agent
 * Connected to Settings > AI Agent Hub (useCase: intake_verification)
 * with Anti-Ban linguistic variation and multi-provider failover.
 */
class DealVerificationAgent {

    /**
     * Resolves target verification phone numbers from an Intake record.
     * Prioritizes phone number explicitly written in the message text,
     * with fallback to the WhatsApp group sender participant (automatically resolving LIDs).
     */
    async resolveTargetPhones(intakeRecord) {
        if (!intakeRecord) return { textContacts: [], senderPhone: null, recommendedTarget: null, targetType: 'text_contact' };

        // 1. Text-extracted contacts
        let textContacts = [];
        if (Array.isArray(intakeRecord.contact_numbers) && intakeRecord.contact_numbers.length > 0) {
            textContacts = intakeRecord.contact_numbers.map(p => this._cleanPhone(p)).filter(Boolean);
        } else if (intakeRecord.extracted_entities?.contact_numbers && Array.isArray(intakeRecord.extracted_entities.contact_numbers)) {
            textContacts = intakeRecord.extracted_entities.contact_numbers.map(p => this._cleanPhone(p)).filter(Boolean);
        }

        // 2. Sender participant number from group metadata (with enterprise LID resolution)
        const rawParticipant = intakeRecord.extracted_entities?._whatsappGroup?.participant || 
                               intakeRecord.raw_source_data?.participant || '';
        
        let senderPhone = null;
        if (rawParticipant) {
            try {
                const { BaileysConnectionManager } = await import('../baileysQueue/BaileysConnectionManager.js');
                const resolved = await BaileysConnectionManager.resolveJidToPhone(rawParticipant);
                if (resolved && resolved.cleanPhone && !resolved.cleanPhone.includes('@')) {
                    senderPhone = this._cleanPhone(resolved.cleanPhone);
                }
            } catch (e) {
                console.warn('[DealVerificationAgent] Error resolving sender LID:', e.message);
            }
            if (!senderPhone) {
                senderPhone = this._cleanPhone(rawParticipant);
            }
        }

        // 3. Recommended target
        let recommendedTarget = null;
        let targetType = 'text_contact';

        if (textContacts.length > 0) {
            recommendedTarget = textContacts[0];
            targetType = 'text_contact';
        } else if (senderPhone) {
            recommendedTarget = senderPhone;
            targetType = 'sender';
        }

        return {
            textContacts,
            senderPhone,
            recommendedTarget,
            targetType
        };
    }

    /**
     * Clean phone number into +91XXXXXXXXXX format
     */
    _cleanPhone(phone) {
        if (!phone) return null;
        const cleaned = String(phone).replace(/@s\.whatsapp\.net/g, '').replace(/[^0-9]/g, '');
        if (cleaned.length === 10) return `+91${cleaned}`;
        if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
        if (cleaned.length > 10) return `+${cleaned}`;
        return cleaned.length >= 10 ? `+91${cleaned.slice(-10)}` : null;
    }

    /**
     * Generates a human broker verification inquiry in natural Hinglish.
     * Powered dynamically by Settings > AI Agent Hub (useCase: intake_verification)
     * with anti-ban entropy, greeting rotation, and multi-provider failover.
     */
    async generateInquiryDraft(intakeRecord) {
        const location = intakeRecord.location || intakeRecord.sector || 'is location';
        const propType = intakeRecord.property_type || 'property';
        const price = intakeRecord.price || '';
        const size = intakeRecord.size || '';

        // 🛡️ Enterprise Pillar 1: Dynamic AI Agent Hub Resolution
        let agent = null;
        try {
            agent = await AiAgent.findOne({ useCases: 'intake_verification', isActive: true }).lean();
        } catch (dbErr) {
            console.warn('[DealVerificationAgent] Could not query AiAgent from DB:', dbErr.message);
        }

        const provider = agent?.provider || 'gemini';
        const modelName = agent?.modelName || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');
        
        // Base instructions from AI Agent Hub Settings (or enterprise default if not configured)
        const baseSystemPrompt = agent?.systemPrompt || `You are an experienced real estate dealer at Bharat Properties chatting 1-on-1 on WhatsApp with a fellow broker in Haryana/Delhi-NCR.
Your goal is to send a very short, natural WhatsApp message to find out the exact plot/house/unit number and bottom price for a posted deal.

Strict Tone & Style Rules:
- Ultra-short: strictly 1 to 2 lines (under 20 words).
- Real broker colloquial tone: Start with respectful North Indian broker greetings like "Ram Ram bhaiji", "Bhaiji pranam", "Namaste veerji", or "Haanji bhaisahab".
- Ask directly for unit/plot/house number and bottom closing price.
- Mention genuine client/party is ready.
- ZERO AI / Corporate feel: NO "Kindly", NO "Please", NO "cross-check", NO "hope this finds you well", NO quotes.
- Output ONLY the raw message text.`;

        // 🛡️ Enterprise Pillar 2: Anti-Ban Diversity Injector (Dynamic Greeting & Structure Permutation)
        const greetings = [
            "Ram Ram bhaiji",
            "Bhaiji pranam",
            "Namaste veerji",
            "Haanji bhaisahab",
            "Bhaiji",
            "Radhe Radhe bhaiji"
        ];
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

        const styleStrategies = [
            `Start with greeting "${randomGreeting}". Mention a genuine ready buyer/client on table and ask for the exact plot/unit number and bottom closing price.`,
            `Start with greeting "${randomGreeting}". Ask for the unit/plot number first, then ask what is the final bottom rate on table.`,
            `Start with greeting "${randomGreeting}". Ask what is the final negotiable closing price, and ask to share plot number for client visit.`,
            `Start with greeting "${randomGreeting}". Mention you saw their broadcast and have an immediate buyer on table; ask for plot/house number.`
        ];
        const selectedStrategy = styleStrategies[Math.floor(Math.random() * styleStrategies.length)];

        const dynamicSystemPrompt = `${baseSystemPrompt}

DYNAMIC ANTI-BAN VARIATION DIRECTIVE:
${selectedStrategy}
Keep it ultra-short (under 20 words). Never use repetitive stock templates.`;

        const userPrompt = `Deal broadcast:\n"${intakeRecord.description || intakeRecord.content || (propType + ' in ' + location)}"
Location: ${location}
Type: ${propType}
Size: ${size}
Price mentioned: ${price || 'Not mentioned'}`;

        // High dynamic temperature (0.75 - 0.85) to maximize entropy and eliminate repetition
        const dynamicTemperature = 0.75 + (Math.random() * 0.1);

        try {
            console.log(`[DealVerificationAgent] Generating inquiry via AI Agent Hub '${agent?.name || 'Default'}' (${provider}/${modelName})`);
            const draft = await unifiedAIService.generate(userPrompt, {
                provider,
                model: modelName,
                systemPrompt: dynamicSystemPrompt,
                temperature: dynamicTemperature,
                maxTokens: 200,
                capability: 'AI_DEAL_VERIFICATION'
            });

            if (draft && draft.trim().length > 10) {
                return draft.trim().replace(/^["']|["']$/g, '');
            }
        } catch (err) {
            console.warn('[DealVerificationAgent] AI generation failed, using anti-ban varied fallback:', err.message);
        }

        // 🛡️ Enterprise Pillar 3: Anti-Ban Dynamic Fallback Generator (Multi-variant Rotating Pool)
        return this._getVariedFallbackDraft(location, propType, size, price);
    }

    /**
     * Anti-Ban rotating fallback pool (never returns a single repetitive string)
     */
    _getVariedFallbackDraft(location, propType, size, price) {
        let displayType = propType || 'property';
        if (size && (displayType.toLowerCase().includes(size.toLowerCase()) || size.toLowerCase().includes(displayType.toLowerCase()))) {
            displayType = '';
        }
        const spec = `${location} me ${size ? size + ' ' : ''}${displayType}`.replace(/\s+/g, ' ').trim();
        
        const variants = [
            `Ram Ram bhaiji, ${spec} ka exact plot/unit no kya hai? Party ready hai, table pe final bottom rate bata do.`,
            `Bhaiji pranam, ${spec} wale deal ke liye buyer ready hai. Plot no aur closing rate share kar do.`,
            `Namaste veerji, ${spec} me final rate kya chhodoge? Exact house no bata do, client visit karani hai.`,
            `Haanji bhaisahab, ${spec} ka plot number kya hai? Genuine party on table hai, bottom price batao.`,
            `Bhaiji, ${spec} ka exact unit no share kardo, ready client hai table meeting karwayenge.`,
            `Radhe Radhe bhaiji, ${spec} me bottom closing rate kya banega? Plot number bata dijiye.`,
            `Ram Ram bhaiji, ${spec} ka number share kar do ji. Party ready payment leke baithi hai.`,
            `Bhaiji, ${spec} wali deal me final bottom rate aur plot no bata do, buyer confirm karna hai.`
        ];
        return variants[Math.floor(Math.random() * variants.length)];
    }

    /**
     * Sends the verification inquiry via Baileys WhatsApp Web or Meta Cloud API
     */
    async sendVerificationInquiry(intakeId, { targetPhone, targetType, message, provider = 'BAILEYS', userId = null, integrationId = null }) {
        if (!intakeId) throw new Error("Intake ID is required");
        if (!targetPhone) throw new Error("Target phone number is required");
        if (!message) throw new Error("Message content is required");

        const intake = await Intake.findById(intakeId);
        if (!intake) throw new Error("Intake record not found");

        // Enterprise Fail-safe: Resolve targetPhone through BaileysConnectionManager in case an LID or sliced LID was submitted
        let cleanTarget = targetPhone;
        try {
            const { BaileysConnectionManager } = await import('../baileysQueue/BaileysConnectionManager.js');
            const resolved = await BaileysConnectionManager.resolveJidToPhone(targetPhone);
            if (resolved && resolved.cleanPhone && !resolved.cleanPhone.includes('@')) {
                cleanTarget = resolved.cleanPhone;
            }
        } catch (e) {}

        const formattedPhone = this._cleanPhone(cleanTarget);
        if (!formattedPhone) throw new Error("Invalid target phone number format");

        const isMeta = String(provider).toUpperCase() === 'META';
        let resolvedIntegrationId = integrationId || (intake.whatsappIntegrationId ? String(intake.whatsappIntegrationId) : null);

        // Fallback: Check if originating conversation holds the source line
        if (!resolvedIntegrationId && (intake.raw_source_data?.whatsappIntegrationId || intake.raw_source_data?.conversationId || intake.extracted_entities?._whatsappGroup?.conversationId)) {
            if (intake.raw_source_data?.whatsappIntegrationId) {
                resolvedIntegrationId = String(intake.raw_source_data.whatsappIntegrationId);
            } else {
                try {
                    const Conversation = mongoose.models.Conversation || (await import('../../models/Conversation.js')).default;
                    const convId = intake.raw_source_data?.conversationId || intake.extracted_entities?._whatsappGroup?.conversationId;
                    const c = await Conversation.findById(convId).select('whatsappIntegrationId').lean();
                    if (c?.whatsappIntegrationId) resolvedIntegrationId = String(c.whatsappIntegrationId);
                } catch (e) {}
            }
        }

        if (!isMeta) {
            // Strictly enforce per-user WhatsApp Web session isolation if not already resolved from intake group
            if (!resolvedIntegrationId && userId) {
                const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || (await import('../../models/WhatsAppIntegration.js')).default;
                const WhatsAppAccountAuthorizationService = (await import('../WhatsAppAccountAuthorizationService.js')).default;
                const allActive = await WhatsAppIntegration.find({ status: 'ACTIVE', provider: 'BAILEYS' }).lean();

                const userObj = { _id: userId, id: userId };
                const userAllowed = WhatsAppAccountAuthorizationService.filterAuthorizedAccounts(userObj, allActive);
                if (userAllowed && userAllowed.length > 0) {
                    resolvedIntegrationId = userAllowed[0]._id.toString();
                } else {
                    throw new Error("No active WhatsApp Web connection linked to your user account. Please connect via Profile QR code.");
                }
            }
        }

        const dispatchOptions = isMeta 
            ? { provider: 'META', channel: 'whatsapp_api', integrationId: resolvedIntegrationId }
            : { provider: 'BAILEYS', channel: 'whatsapp_web', integrationId: resolvedIntegrationId };

        console.log(`[DealVerificationAgent] Sending inquiry to ${formattedPhone} via ${isMeta ? 'Meta API' : 'Baileys WhatsApp Web'} (Integration: ${resolvedIntegrationId || 'default'})`);
        const sendResult = await whatsAppService.sendMessage(formattedPhone, message, dispatchOptions);

        if (!sendResult || !sendResult.success) {
            const errorMsg = sendResult?.error || `Failed to dispatch WhatsApp inquiry via ${isMeta ? 'Meta Official API' : 'WhatsApp Web'}`;
            console.error(`[DealVerificationAgent] ❌ Dispatch FAILED to ${formattedPhone}:`, errorMsg);

            intake.wa_verification = intake.wa_verification || {};
            intake.wa_verification.status = 'failed';
            intake.wa_verification.last_error = errorMsg;
            intake.wa_verification.error_at = new Date();
            intake.wa_verification.target_phone = formattedPhone;
            intake.wa_verification.target_type = targetType || 'text_contact';
            intake.wa_verification.provider = isMeta ? 'meta' : 'baileys';
            await intake.save();

            throw new Error(errorMsg);
        }

        const now = new Date();
        intake.wa_verification = intake.wa_verification || {};
        intake.wa_verification.status = 'inquiry_sent';
        intake.wa_verification.last_error = null;
        intake.wa_verification.initiated_at = now;
        intake.wa_verification.target_phone = formattedPhone;
        intake.wa_verification.target_type = targetType || 'text_contact';
        intake.wa_verification.outbound_message = message;
        intake.wa_verification.provider = sendResult.provider || (isMeta ? 'meta' : 'baileys');
        intake.wa_verification.sent_by_user = userId;
        intake.wa_verification.integration_id = resolvedIntegrationId;
        intake.wa_verification.message_id = sendResult.messageId || sendResult.messages?.[0]?.id || null;
        intake.wa_verification.conversation_history = intake.wa_verification.conversation_history || [];
        intake.wa_verification.conversation_history.push({
            sender: 'system',
            message: message,
            provider: intake.wa_verification.provider,
            timestamp: now
        });

        intake.verification_status = 'pending';
        intake.verification_notes = intake.verification_notes || [];
        intake.verification_notes.push(`WhatsApp inquiry successfully dispatched to ${formattedPhone} via ${intake.wa_verification.provider} at ${now.toLocaleTimeString('en-IN')}`);

        await intake.save();

        return {
            success: true,
            status: 'inquiry_sent',
            targetPhone: formattedPhone,
            message: message,
            provider: intake.wa_verification.provider,
            messageId: intake.wa_verification.message_id,
            initiated_at: now,
            sendResult
        };
    }

    /**
     * Inbound message interceptor:
     * When a broker replies to a verification inquiry, parses response using Gemini Flash
     * and updates the Intake record with verified Unit Number & Final Price.
     */
    async processBrokerReply(senderPhone, messageText, incomingIntegrationId = null) {
        if (!senderPhone || !messageText) return null;

        const cleanSender = String(senderPhone).replace(/[^0-9]/g, '');
        if (cleanSender.length < 10) return null;

        const last10 = cleanSender.slice(-10);

        // Find pending intake matching this target phone (supports multi-turn conversation over 7-day window)
        const baseQuery = {
            'wa_verification.target_phone': { $regex: last10 },
            $or: [
                { 'wa_verification.status': { $in: ['inquiry_sent', 'replied_incomplete'] } },
                { 'wa_verification.status': 'replied_verified', createdDealId: { $in: [null, undefined] } }
            ],
            'wa_verification.initiated_at': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        };

        let pendingIntake = null;
        if (incomingIntegrationId) {
            pendingIntake = await Intake.findOne({
                ...baseQuery,
                $or: [
                    { 'wa_verification.integration_id': String(incomingIntegrationId) },
                    { whatsappIntegrationId: incomingIntegrationId }
                ]
            }).sort({ 'wa_verification.initiated_at': -1 });
        }

        if (!pendingIntake) {
            pendingIntake = await Intake.findOne(baseQuery).sort({ 'wa_verification.initiated_at': -1 });
        }

        if (!pendingIntake) return null;

        console.log(`[DealVerificationAgent] Processing broker reply from ${senderPhone} for Intake #${pendingIntake._id}`);

        // Invoke Gemini Flash with strict JSON extraction schema
        const extracted = await this.extractVerificationEntities(messageText, pendingIntake);

        const now = new Date();
        pendingIntake.wa_verification.inbound_reply = messageText;
        pendingIntake.wa_verification.replied_at = now;
        pendingIntake.wa_verification.extracted_data = extracted;
        pendingIntake.wa_verification.conversation_history = pendingIntake.wa_verification.conversation_history || [];
        pendingIntake.wa_verification.conversation_history.push({
            sender: 'broker',
            message: messageText,
            timestamp: now
        });

        const hasUnitNumber = extracted.unit_number && extracted.unit_number !== 'UNDISCLOSED' && extracted.unit_number !== 'UNKNOWN';

        // Multi-turn entity synthesis (preserves unit number or price from earlier conversation turns)
        const finalUnitNumber = hasUnitNumber 
            ? extracted.unit_number 
            : (pendingIntake.extracted_entities?.unitNumber || null);

        const finalPriceStr = extracted.final_price || 
                              pendingIntake.price || 
                              pendingIntake.extracted_entities?.specs?.price || null;

        const numericPrice = this._parsePriceToNumber(finalPriceStr);

        const isUnitValid = finalUnitNumber && 
            !['UNDISCLOSED', 'UNKNOWN', 'NO', 'NA', 'N/A', 'NONE'].includes(String(finalUnitNumber).toUpperCase().trim());

        if (hasUnitNumber) {
            pendingIntake.wa_verification.status = 'replied_verified';
            pendingIntake.verification_status = 'verified';
            pendingIntake.confidence_score = Math.max(pendingIntake.confidence_score || 0, 95);

            // Synchronize extracted entities
            pendingIntake.extracted_entities = pendingIntake.extracted_entities || {};
            pendingIntake.extracted_entities.unitNumber = extracted.unit_number;
            if (extracted.block) pendingIntake.extracted_entities.block = extracted.block;
            if (extracted.project) pendingIntake.extracted_entities.project = extracted.project;
            if (extracted.location_confirmed) {
                pendingIntake.extracted_entities.location = extracted.location_confirmed;
                pendingIntake.location = extracted.location_confirmed;
            }
            if (extracted.final_price) {
                pendingIntake.extracted_entities.specs = pendingIntake.extracted_entities.specs || {};
                pendingIntake.extracted_entities.specs.price = extracted.final_price;
                pendingIntake.price = extracted.final_price;
            }

            pendingIntake.verification_notes = pendingIntake.verification_notes || [];
            pendingIntake.verification_notes.push(`[WA Verified] Unit/Plot: #${extracted.unit_number} | Final Price: ${extracted.final_price || 'Confirmed'} (Source: Direct Broker Reply)`);
        } else if (extracted.final_price && isUnitValid) {
            // Broker gave unit in earlier turn, now confirmed price
            pendingIntake.wa_verification.status = 'replied_verified';
            pendingIntake.verification_status = 'verified';
            pendingIntake.confidence_score = Math.max(pendingIntake.confidence_score || 0, 95);
            pendingIntake.price = extracted.final_price;
            pendingIntake.extracted_entities = pendingIntake.extracted_entities || {};
            pendingIntake.extracted_entities.specs = pendingIntake.extracted_entities.specs || {};
            pendingIntake.extracted_entities.specs.price = extracted.final_price;
            pendingIntake.verification_notes = pendingIntake.verification_notes || [];
            pendingIntake.verification_notes.push(`[WA Price Confirmed] Final Price: ${extracted.final_price} for Unit #${finalUnitNumber}`);
        } else {
            pendingIntake.wa_verification.status = 'replied_incomplete';
            pendingIntake.verification_notes = pendingIntake.verification_notes || [];
            pendingIntake.verification_notes.push(`[WA Incomplete] Broker replied: "${messageText}". Unit number was kept confidential.`);
        }

        // 🚀 ENTERPRISE AUTONOMOUS DEAL MATERIALIZATION:
        // When Unit Number and Final Price are confirmed, atomically materialize Deal in CRM
        let spawnedDeal = null;
        if (isUnitValid && numericPrice > 0) {
            try {
                const dealEntities = {
                    ...extracted,
                    unit_number: finalUnitNumber,
                    final_price: finalPriceStr
                };
                spawnedDeal = await this.autoCreateUnverifiedDeal(pendingIntake, dealEntities, cleanSender);
                if (spawnedDeal) {
                    console.log(`[DealVerificationAgent] Autonomous Deal materialized: Deal #${spawnedDeal._id || spawnedDeal.dealId}`);
                }
            } catch (dealErr) {
                console.error(`[DealVerificationAgent] Autonomous Deal creation error:`, dealErr.message);
                pendingIntake.verification_notes = pendingIntake.verification_notes || [];
                pendingIntake.verification_notes.push(`[Auto-Deal Error] ${dealErr.message}`);
            }
        }

        // 🚀 ENTERPRISE HUMAN CONVERSATIONAL AGENT:
        // Automatically respond back to broker in natural 1-line human broker tone
        const followUpMessage = await this.generateConversationalReply(pendingIntake, messageText, extracted);

        if (followUpMessage) {
            const provider = pendingIntake.wa_verification?.provider === 'meta' ? 'META' : 'BAILEYS';
            const targetIntegrationId = incomingIntegrationId || 
                                        pendingIntake.wa_verification?.integration_id || 
                                        (pendingIntake.whatsappIntegrationId ? String(pendingIntake.whatsappIntegrationId) : null);

            const dispatchOptions = provider === 'META'
                ? { provider: 'META', channel: 'whatsapp_api', integrationId: targetIntegrationId }
                : { provider: 'BAILEYS', channel: 'whatsapp_web', integrationId: targetIntegrationId };

            try {
                const sendRes = await whatsAppService.sendMessage(senderPhone, followUpMessage, dispatchOptions);
                if (sendRes && sendRes.success) {
                    const replyTime = new Date();
                    pendingIntake.wa_verification.conversation_history.push({
                        sender: 'system',
                        message: followUpMessage,
                        timestamp: replyTime
                    });
                    console.log(`[DealVerificationAgent] ✅ Dispatched human follow-up to ${senderPhone} via line (${targetIntegrationId || 'default'}): "${followUpMessage}"`);
                }
            } catch (replySendErr) {
                console.error(`[DealVerificationAgent] Failed to dispatch conversational follow-up:`, replySendErr.message);
            }
        }

        await pendingIntake.save();
        return {
            intakeId: pendingIntake._id,
            verified: hasUnitNumber,
            extracted,
            followUpMessage
        };
    }

    /**
     * Generates an ultra-short, human follow-up message when the broker replies.
     * Powered dynamically by Settings > AI Agent Hub (useCase: intake_verification)
     */
    async generateConversationalReply(intakeRecord, brokerMessage, extractedData) {
        const hasUnit = extractedData.unit_number && extractedData.unit_number !== 'UNDISCLOSED' && extractedData.unit_number !== 'UNKNOWN';
        const hasPrice = !!extractedData.final_price;

        let agent = null;
        try {
            agent = await AiAgent.findOne({ useCases: 'intake_verification', isActive: true }).lean();
        } catch (e) {}

        const provider = agent?.provider || 'gemini';
        const modelName = agent?.modelName || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');

        const baseInstructions = agent?.systemPrompt || `You are an experienced North Indian property broker at Bharat Properties chatting 1-on-1 on WhatsApp with another broker.
Your tone must be 100% human, casual, respectful, and ultra-short (strictly 1 line, under 18 words).
Speak in natural North Indian broker Hinglish (use words like "Bhaiji", "Ji theek hai", "plot no / house no", "party ready hai", "table pe final bottom rate", "visit karani hai").`;

        const systemPrompt = `${baseInstructions}

CONVERSATION & REACTION RULES:
1. IF BROKER ASKS WHICH PROPERTY / KAUNSI DEAL / KAUNSE PLOT / FOR WHICH PROJECT / WHICH APARTMENT:
   Do NOT repeat price questions! Directly clarify the property using the Property Details provided (e.g. "Bhaiji, jo aapne group me [Location/Project] wali deal share ki thi, uske regarding puch raha hu.").
2. IF BROKER GAVE HOUSE/PLOT/UNIT NUMBER (but NOT price):
   Acknowledge and ask bottom price on table (e.g. "Ji theek hai bhaiji, table pe final bottom rate kya chhod denge?").
3. IF BROKER GAVE PRICE (but NOT unit number):
   Ask exact unit/house number for client visit (e.g. "Theek hai ji, exact house no bata do, buyer ko visit karani hai.").
4. IF BROKER GAVE BOTH:
   Acknowledge: "Ji theek hai bhaiji, buyer se match karke batata hu."
5. IF BROKER SAYS "OFFICE AAO" / "CALL KARO":
   Ask unit/plot no first so party can be confirmed (e.g. "Bhaiji pehle house no share kardo, party confirm karke seedha office hi baithte hain.").
6. NEVER ignore the broker's question! Never repeat the exact same sentence twice in a row.
7. Ultra-short (1 line, under 18 words), zero AI/corporate tone, no quotes. Output ONLY the raw message text.`;

        // Include recent conversation turns for situational awareness
        const historyText = (intakeRecord.wa_verification?.conversation_history || [])
            .slice(-4)
            .map(h => `${h.sender === 'system' ? 'You' : 'Broker'}: "${h.message}"`)
            .join('\n');

        const userPrompt = `Property Details:
Location: ${intakeRecord.location || intakeRecord.sector || 'Not specified'}
Project: ${intakeRecord.extracted_entities?.project || 'Not specified'}
Type: ${intakeRecord.property_type || 'property'}
Size: ${intakeRecord.size || 'Not specified'}
Price: ${intakeRecord.price || 'Not specified'}
Original Broadcast snippet: "${(intakeRecord.description || intakeRecord.content || '').substring(0, 150)}"

Conversation History:
${historyText || 'No prior turns'}

Broker just said: "${brokerMessage}"
Has Unit No: ${hasUnit ? extractedData.unit_number : 'NO'}
Has Final Price: ${hasPrice ? extractedData.final_price : 'NO'}

Write the 1-line WhatsApp reply to the broker:`;

        try {
            const reply = await unifiedAIService.generate(userPrompt, {
                provider,
                model: modelName,
                systemPrompt,
                temperature: 0.7,
                maxTokens: 150,
                capability: 'AI_DEAL_VERIFICATION'
            });
            if (reply && reply.trim().length > 3) {
                return reply.trim().replace(/^["']|["']$/g, '');
            }
        } catch (err) {
            console.warn('[DealVerificationAgent] Failed to generate conversational reply:', err.message);
        }

        // Context-aware natural fallbacks (never repeat inappropriate answers)
        const isAskingWhichDeal = /kauns|kons|which|kis|kaha|kahan|project|apartment|plot/i.test(brokerMessage);
        const propRef = intakeRecord.location || intakeRecord.sector || intakeRecord.extracted_entities?.project || 'group wali';

        if (isAskingWhichDeal) {
            return `Bhaiji, jo aapne group me ${propRef} ki deal dali thi, uske regarding puch raha hu.`;
        }

        if (hasUnit && !hasPrice) {
            return "Ji theek hai bhaiji, table pe final bottom rate kya chhod denge?";
        } else if (!hasUnit && hasPrice) {
            return "Theek hai ji, exact plot/house number kya hai? Buyer ko visit karani hai.";
        } else if (hasUnit && hasPrice) {
            return "Ji theek hai bhaiji, buyer se match karke batata hu.";
        }
        return "Bhaiji plot/house no bata do taaki genuine client se baat aage badha sakein.";
    }

    /**
     * Strict JSON entity extractor using Gemini Flash
     */
    async extractVerificationEntities(replyText, intakeContext) {
        const systemPrompt = `You are a real estate entity extraction engine.
A broker has replied to a WhatsApp inquiry regarding a property listing.
Analyze the broker's message and extract the verified property parameters.

Context of Property:
- Original Description: "${intakeContext.description || intakeContext.content || ''}"
- Suspected Location: "${intakeContext.location || intakeContext.sector || ''}"
- Suspected Type: "${intakeContext.property_type || ''}"

You MUST output ONLY a valid JSON object with EXACTLY this structure:
{
  "unit_number": "string (e.g. '342', '114-A', 'Flat 402', 'Shop 12', or 'UNDISCLOSED' if the broker refuses to share or says meeting me baat karenge)",
  "unit_type": "string (e.g. 'plot', 'house', 'kothi', 'flat', 'shop', 'commercial')",
  "location_confirmed": "string (e.g. 'Sector 4, Urban Estate' or empty if not mentioned)",
  "project": "string (e.g. 'Flower City', 'Urban Estate', 'Signature Global', or empty if not mentioned)",
  "block": "string (e.g. 'Block B', 'Pocket 2', 'Phase 1', or empty if not mentioned)",
  "final_price": "string (e.g. '1.40 Cr', '85 Lac', '2.10 Cr' or empty if not mentioned)",
  "price_type": "string ('Bottom / Non-negotiable' | 'Negotiable' | 'Fixed' | 'Unknown')",
  "broker_cooperation": "string ('cooperative' | 'in_person_only' | 'uncooperative')",
  "broker_notes": "string (summary of any specific conditions mentioned, e.g. 'Bayana on table')",
  "confidence_score": 95
}
Output pure JSON with no markdown tags.`;

        const userPrompt = `Broker Reply:\n"${replyText}"`;

        try {
            const rawOutput = await unifiedAIService.generate(userPrompt, {
                systemPrompt,
                provider: 'google',
                model: 'gemini-3.8-flash',
                temperature: 0.1,
                maxTokens: 1500,
                capability: 'AI_DEAL_VERIFICATION'
            });

            const cleanJson = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            return parsed;
        } catch (err) {
            console.error('[DealVerificationAgent] JSON entity extraction error:', err.message);
            // Fallback basic regex extractor
            return this._heuristicFallbackExtractor(replyText);
        }
    }

    _heuristicFallbackExtractor(text) {
        const unitMatch = text.match(/(?:plot|house|flat|shop|kothi|unit|no\.?)\s*(?:#|no\.?|number)?\s*([0-9]+[a-zA-Z]?)/i) ||
                          text.match(/^([0-9]+[a-zA-Z]?)(?:,|\s|$)/);
        const priceMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:cr|crore|lac|lakh|l\b)/i);
        const blockMatch = text.match(/(?:block|pocket|phase)\s*([a-zA-Z0-9]+)/i) ||
                           text.match(/([a-zA-Z0-9]+)\s*(?:block|pocket|phase)/i);

        let extractedBlock = '';
        if (blockMatch) {
            extractedBlock = blockMatch[0].trim();
        }

        return {
            unit_number: unitMatch ? unitMatch[1] : (text.toLowerCase().includes('mil') || text.toLowerCase().includes('office') ? 'UNDISCLOSED' : 'UNKNOWN'),
            unit_type: 'property',
            location_confirmed: '',
            project: '',
            block: extractedBlock,
            final_price: priceMatch ? priceMatch[0] : '',
            price_type: 'Bottom',
            broker_cooperation: 'cooperative',
            broker_notes: text.substring(0, 100),
            confidence_score: 70
        };
    }

    /**
     * Enterprise Autonomous Deal Materialization Engine:
     * Atomically creates Inventory under Project, and creates Deal with
     * verificationStatus = 'unverified' and assignedTo = Internal CRM User (Manager).
     * External Broker is saved as Contact and linked as Owner / Channel Partner.
     */
    async autoCreateUnverifiedDeal(pendingIntake, extracted, senderPhone) {
        if (!pendingIntake) return null;

        // Idempotency: If a Deal is already linked to this Intake, do not duplicate
        if (pendingIntake.createdDealId) {
            console.log(`[DealVerificationAgent] Deal already exists for Intake #${pendingIntake._id}: ${pendingIntake.createdDealId}`);
            return { _id: pendingIntake.createdDealId, status: 'already_linked' };
        }

        // Concurrency Guard: in-memory mutual exclusion per Intake ID
        if (!this._activeCreationLocks) this._activeCreationLocks = new Set();
        const lockKey = String(pendingIntake._id);
        if (this._activeCreationLocks.has(lockKey)) {
            console.log(`[DealVerificationAgent] Concurrent deal creation in progress for Intake #${lockKey}, skipping duplicate.`);
            return null;
        }
        this._activeCreationLocks.add(lockKey);

        try {
            const unitNumber = extracted.unit_number;
            const priceStr = extracted.final_price || pendingIntake.price;
            const numericPrice = this._parsePriceToNumber(priceStr);

            const isValidUnit = unitNumber && !['UNDISCLOSED', 'UNKNOWN', 'NO', 'NA', 'N/A', 'NONE'].includes(String(unitNumber).toUpperCase().trim());
            if (!isValidUnit || numericPrice <= 0) {
                console.log(`[DealVerificationAgent] Gatekeeper rejected deal creation: unit='${unitNumber}', price=${numericPrice}`);
                return null;
            }

            // 1. Resolve Project (Strict RBAC Boundary)
            const project = await this._resolveProject(pendingIntake, extracted);
            const projectName = project ? project.name : (extracted.project || extracted.location_confirmed || pendingIntake.location || pendingIntake.sector || 'Direct Intake Property');

            // 2. Resolve Block
            const block = extracted.block || pendingIntake.block || pendingIntake.extracted_entities?.block || '';

            // 3. Resolve Internal CRM User (Manager / Telecaller) for assignedTo
            // Strict Enterprise Rule: assignedTo is ALWAYS an internal staff/manager
            const assignedUserId = pendingIntake.wa_verification?.sent_by_user || 
                                   pendingIntake.createdBy || 
                                   project?.owner || 
                                   (Array.isArray(project?.assign) && project.assign[0]) || 
                                   null;

            let userTeam = null;
            let userDepartment = null;
            if (assignedUserId) {
                try {
                    const User = mongoose.models.User || (await import('../../models/User.js')).default;
                    const userDoc = await User.findById(assignedUserId).select('team teams department').lean();
                    if (userDoc) {
                        userTeam = userDoc.team || (userDoc.teams && userDoc.teams[0]) || null;
                        userDepartment = userDoc.department || null;
                    }
                } catch (uErr) {
                    console.warn('[DealVerificationAgent] User team lookup notice:', uErr.message);
                }
            }

            // 4. Resolve External Broker Contact (Channel Partner / Owner)
            const brokerContact = await this._resolveBrokerContact(senderPhone, pendingIntake, assignedUserId, project, userTeam, userDepartment);

            // 5. Resolve or create Inventory under Project
            const inventory = await this._resolveOrCreateInventory(project, projectName, block, unitNumber, numericPrice, extracted.unit_type, brokerContact, assignedUserId, userTeam, userDepartment);

            // 6. Invoke Enterprise DealCreationEngine
            const { createStandardizedDeal } = await import('../DealCreationEngine.js');

            const idempotencyKey = `INTAKE_AUTO_DEAL_${pendingIntake._id}`;
            const finalTeam = project?.team?.[0] || project?.teams?.[0] || userTeam || null;
            const finalTeams = project?.teams?.length ? project?.teams : (project?.team ? [project.team[0]] : (userTeam ? [userTeam] : []));
            const finalDept = project?.department || userDepartment || null;

            const input = {
                source: 'WhatsApp AI Verification Desk',
                idempotencyKey,
                correlationId: `VERIFIED_${pendingIntake._id}_${Date.now()}`,
                dealData: {
                    name: `Resale: ${projectName} - ${block ? block + ' ' : ''}#${unitNumber}`,
                    price: numericPrice,
                    projectName: projectName,
                    projectId: project?._id || null,
                    block: block,
                    unitNo: unitNumber,
                    unitType: extracted.unit_type || 'Plot',
                    stage: 'Open',
                    status: 'Open',
                    verificationStatus: 'unverified',
                    isQualified: false,
                    tags: ['AI Auto-Captured', 'Unverified', 'WhatsApp Inbound'],
                    remarks: `Auto-captured via WhatsApp Broker Reply.\nPlot/Unit: #${unitNumber}\nBlock: ${block || 'N/A'}\nProject: ${projectName}\nVerified Bottom Rate: ₹${numericPrice.toLocaleString('en-IN')}\nSource Broker: ${brokerContact?.name || senderPhone} (${senderPhone})\nPending User Call Verification.`,
                    assignedTo: assignedUserId,
                    team: finalTeam,
                    teams: finalTeams,
                    department: finalDept,
                    visibleTo: project?.visibleTo || 'Team'
                },
                linkage: {
                    inventoryId: inventory._id,
                    projectId: project?._id || null
                },
                ownerInfo: {
                    owner: brokerContact?._id || null,
                    channelPartner: brokerContact?._id || null
                }
            };

            const options = {
                triggerDistribution: false,
                triggerMarketing: false,
                triggerDiscovery: false
            };

            const resObj = await createStandardizedDeal(input, options);
            const dealDoc = resObj.deal;

            if (dealDoc) {
                pendingIntake.createdDealId = dealDoc._id;
                pendingIntake.status = 'Deal Linked';
                pendingIntake.verification_notes = pendingIntake.verification_notes || [];
                pendingIntake.verification_notes.push(`[Auto-Deal Created] Deal #${dealDoc.dealId || dealDoc._id} created in 'unverified' stage. Assigned to internal manager.`);
                await pendingIntake.save();
            }

            return dealDoc;
        } finally {
            this._activeCreationLocks.delete(lockKey);
        }
    }

    /**
     * Parses numeric price from Indian currency strings:
     * "1.40 Cr" -> 14000000
     * "85 Lac" -> 8500000
     * "50k" -> 50000
     */
    _parsePriceToNumber(rawPrice) {
        if (!rawPrice) return 0;
        if (typeof rawPrice === 'number') return rawPrice;
        const str = String(rawPrice).replace(/,/g, '').trim();

        const crMatch = str.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:cr|crore|crores)\b/i);
        if (crMatch) return Math.round(parseFloat(crMatch[1]) * 10000000);

        const lacMatch = str.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lakhs|lac|lacs|l)\b/i);
        if (lacMatch) return Math.round(parseFloat(lacMatch[1]) * 100000);

        const kMatch = str.match(/([0-9]+(?:\.[0-9]+)?)\s*k\b/i);
        if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);

        const numericOnly = parseFloat(str.replace(/[^0-9.]/g, ''));
        return isNaN(numericOnly) ? 0 : Math.round(numericOnly);
    }

    /**
     * Resolves matching Project document from MongoDB
     */
    async _resolveProject(pendingIntake, extracted) {
        const Project = mongoose.models.Project || (await import('../../models/Project.js')).default;
        const candidateNames = [
            extracted.project,
            extracted.location_confirmed,
            pendingIntake.location,
            pendingIntake.sector,
            pendingIntake.title
        ].filter(Boolean);

        for (const candidate of candidateNames) {
            const cleanCand = String(candidate).trim();
            if (cleanCand.length < 3) continue;

            const escaped = cleanCand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let proj = await Project.findOne({ name: { $regex: new RegExp(escaped, 'i') } }).lean();
            if (proj) return proj;

            const words = cleanCand.split(/\s+/).filter(w => w.length > 3 && !['sector', 'road', 'near', 'opp', 'opposite'].includes(w.toLowerCase()));
            for (const w of words) {
                const wEscaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                proj = await Project.findOne({ name: { $regex: new RegExp(wEscaped, 'i') } }).lean();
                if (proj) return proj;
            }
        }
        return null;
    }

    /**
     * Resolves or creates the External Broker Contact record
     */
    async _resolveBrokerContact(senderPhone, pendingIntake, assignedUserId, project, userTeam = null, userDepartment = null) {
        const Contact = mongoose.models.Contact || (await import('../../models/Contact.js')).default;
        const cleanPhone = this._cleanPhone(senderPhone);
        const last10 = cleanPhone ? cleanPhone.slice(-10) : '';

        let contact = null;
        if (last10) {
            contact = await Contact.findOne({
                $or: [
                    { 'phones.number': { $regex: last10 } },
                    { mobile: { $regex: last10 } },
                    { phone: { $regex: last10 } }
                ]
            });
        }

        if (!contact) {
            const brokerName = pendingIntake.extracted_entities?._whatsappGroup?.senderName || 
                               pendingIntake.raw_source_data?.senderName || 
                               `Broker ${last10 ? last10.slice(-4) : 'Direct'}`;

            contact = await Contact.create({
                name: brokerName,
                phones: [{ number: cleanPhone || senderPhone, type: 'Mobile' }],
                tags: ['Broker', 'WhatsApp Inbound', 'Channel Partner'],
                source: 'WhatsApp AI Verification Desk',
                assignedTo: assignedUserId,
                team: project?.team?.[0] || project?.teams?.[0] || userTeam || null,
                teams: project?.teams?.length ? project?.teams : (project?.team ? [project.team[0]] : (userTeam ? [userTeam] : [])),
                department: project?.department || userDepartment || null,
                visibleTo: project?.visibleTo || 'Team',
                description: `External Broker contacted via WhatsApp Deal Verification Desk for Intake #${pendingIntake._id}`
            });
        }
        return contact;
    }

    /**
     * Resolves or creates the Inventory record under Project
     */
    async _resolveOrCreateInventory(project, projectName, block, unitNumber, numericPrice, unitType, brokerContact, assignedUserId, userTeam = null, userDepartment = null) {
        const Inventory = mongoose.models.Inventory || (await import('../../models/Inventory.js')).default;
        const query = {
            unitNo: unitNumber
        };
        if (project?._id) query.projectId = project._id;
        if (block) query.block = block;

        let inventory = await Inventory.findOne(query);

        if (!inventory) {
            inventory = await Inventory.create({
                projectId: project?._id || null,
                projectName: projectName,
                block: block || '',
                unitNo: unitNumber,
                unitNumber: unitNumber,
                unitType: unitType || 'Plot',
                status: 'Available',
                price: { value: numericPrice, currency: 'INR' },
                owners: brokerContact ? [brokerContact._id] : [],
                team: project?.team?.[0] || project?.teams?.[0] || userTeam || null,
                teams: project?.teams?.length ? project?.teams : (project?.team ? [project.team[0]] : (userTeam ? [userTeam] : [])),
                department: project?.department || userDepartment || null,
                assignedTo: assignedUserId || null,
                visibleTo: project?.visibleTo || 'Team'
            });
        } else if (numericPrice > 0 && (!inventory.price || !inventory.price.value)) {
            inventory.price = { value: numericPrice, currency: 'INR' };
            await inventory.save();
        }
        return inventory;
    }
}

export default new DealVerificationAgent();
