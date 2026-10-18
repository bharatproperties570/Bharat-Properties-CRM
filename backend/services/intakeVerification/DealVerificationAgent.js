import Intake from '../../models/Intake.js';
import geminiService from '../GeminiService.js';
import whatsAppService from '../WhatsAppService.js';

/**
 * DealVerificationAgent
 * Enterprise-grade automated & interactive WhatsApp Deal Verification Agent
 * Powered by Google Gemini Flash.
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
     * Generates an ultra-short, human broker verification inquiry in natural Hinglish.
     * Powered by Gemini 3.8 Flash.
     */
    async generateInquiryDraft(intakeRecord) {
        const location = intakeRecord.location || intakeRecord.sector || 'is location';
        const propType = intakeRecord.property_type || 'property';
        const price = intakeRecord.price || '';
        const size = intakeRecord.size || '';

        const systemPrompt = `You are an experienced real estate dealer at Bharat Properties chatting 1-on-1 on WhatsApp with a fellow broker in Haryana/Delhi-NCR.
Your goal is to send a very short, natural WhatsApp message to find out the exact plot/house/unit number and bottom price for a posted deal.

Strict Tone & Style Rules:
- Ultra-short: strictly 1 to 2 lines (under 20 words).
- Real broker colloquial tone: Start with "Ram Ram bhaiji" or "Bhaiji".
- Ask directly for unit/plot/house number and bottom closing price.
- Mention genuine client/party is ready.
- ZERO AI / Corporate feel: NO "Kindly", NO "Please", NO "cross-check", NO "hope this finds you well", NO quotes.
- Output ONLY the raw message text.

Examples:
- Deal: "1 Kanal plot in Sector 4 green belt 140 to 145"
  Message: Ram Ram bhaiji, Sec 4 me 1 Kanal plot ka exact plot no kya hai? Party ready hai, table pe final bottom rate kya chhod denge?
- Deal: "4 BHK Flat 500 sqyd in Sector 43 rent 2L"
  Message: Bhaiji, Sec 43 me flat ka house no bata do, buyer ready hai, final rate kya banega?
- Deal: "Kothi 10 marla in Sec 7"
  Message: Ram Ram bhaiji, Sec 7 kothi ka house number kya hai? Genuine party ready hai, bottom rate batao.`;

        const userPrompt = `Deal broadcast:\n"${intakeRecord.description || intakeRecord.content || (propType + ' in ' + location)}"`;

        try {
            const draft = await geminiService.generateWithSystem(systemPrompt, userPrompt, {
                model: 'gemini-3.8-flash',
                temperature: 0.4,
                maxTokens: 250
            });
            if (draft && draft.trim().length > 10) {
                return draft.trim().replace(/^["']|["']$/g, '');
            }
        } catch (err) {
            console.warn('[DealVerificationAgent] Gemini draft generation failed, using fallback template:', err.message);
        }

        // Fallback natural 1-liner
        let displayType = propType;
        if (size && (propType.toLowerCase().includes(size.toLowerCase()) || size.toLowerCase().includes(propType.toLowerCase()))) {
            displayType = '';
        }
        let spec = `${location} me ${size ? size + ' ' : ''}${displayType}`.replace(/\s+/g, ' ').trim();
        return `Ram Ram bhaiji, ${spec} ka plot/house no kya hai? Party ready hai, table pe final bottom rate kya chhod denge?`;
    }

    /**
     * Sends the verification inquiry via Baileys WhatsApp Web or Meta Cloud API
     */
    async sendVerificationInquiry(intakeId, { targetPhone, targetType, message, provider = 'BAILEYS', userId = null }) {
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
        const dispatchOptions = isMeta 
            ? { provider: 'META', channel: 'whatsapp_api' }
            : { provider: 'BAILEYS', channel: 'whatsapp_web' };

        console.log(`[DealVerificationAgent] Sending inquiry to ${formattedPhone} via ${isMeta ? 'Meta API' : 'Baileys WhatsApp Web'}`);
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
    async processBrokerReply(senderPhone, messageText) {
        if (!senderPhone || !messageText) return null;

        const cleanSender = String(senderPhone).replace(/[^0-9]/g, '');
        if (cleanSender.length < 10) return null;

        const last10 = cleanSender.slice(-10);

        // Find pending intake matching this target phone
        const pendingIntake = await Intake.findOne({
            'wa_verification.target_phone': { $regex: last10 },
            'wa_verification.status': 'inquiry_sent'
        }).sort({ 'wa_verification.initiated_at': -1 });

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

        if (hasUnitNumber) {
            pendingIntake.wa_verification.status = 'replied_verified';
            pendingIntake.verification_status = 'verified';
            pendingIntake.confidence_score = Math.max(pendingIntake.confidence_score || 0, 95);

            // Synchronize extracted entities
            pendingIntake.extracted_entities = pendingIntake.extracted_entities || {};
            pendingIntake.extracted_entities.unitNumber = extracted.unit_number;
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
        } else {
            pendingIntake.wa_verification.status = 'replied_incomplete';
            pendingIntake.verification_notes = pendingIntake.verification_notes || [];
            pendingIntake.verification_notes.push(`[WA Incomplete] Broker replied: "${messageText}". Unit number was kept confidential.`);
        }

        // 🚀 ENTERPRISE HUMAN CONVERSATIONAL AGENT:
        // Automatically respond back to broker in natural 1-line human broker tone
        const followUpMessage = await this.generateConversationalReply(pendingIntake, messageText, extracted);

        if (followUpMessage) {
            const provider = pendingIntake.wa_verification?.provider === 'meta' ? 'META' : 'BAILEYS';
            const dispatchOptions = provider === 'META'
                ? { provider: 'META', channel: 'whatsapp_api' }
                : { provider: 'BAILEYS', channel: 'whatsapp_web' };

            try {
                const sendRes = await whatsAppService.sendMessage(senderPhone, followUpMessage, dispatchOptions);
                if (sendRes && sendRes.success) {
                    const replyTime = new Date();
                    pendingIntake.wa_verification.conversation_history.push({
                        sender: 'system',
                        message: followUpMessage,
                        timestamp: replyTime
                    });
                    console.log(`[DealVerificationAgent] ✅ Dispatched human follow-up to ${senderPhone}: "${followUpMessage}"`);
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
     * Powered by Gemini 3.8 Flash.
     */
    async generateConversationalReply(intakeRecord, brokerMessage, extractedData) {
        const hasUnit = extractedData.unit_number && extractedData.unit_number !== 'UNDISCLOSED' && extractedData.unit_number !== 'UNKNOWN';
        const hasPrice = !!extractedData.final_price;

        const systemPrompt = `You are an experienced North Indian property broker at Bharat Properties chatting 1-on-1 on WhatsApp with another broker.
Your tone must be 100% human, casual, respectful, and ultra-short (strictly 1 line, under 15 words).
Speak in natural North Indian broker Hinglish (use words like "Bhaiji", "Ji theek hai", "plot no / house no", "party ready hai", "table pe final bottom rate", "visit karani hai").

STRICT RULES:
1. If broker gave house/plot number, but NOT price:
   Acknowledge and ask bottom price on table (e.g. "Ji theek hai bhaiji, table pe final bottom rate kya chhod denge?").
2. If broker gave price, but NOT house/plot number:
   Ask exact unit/house number for client visit (e.g. "Theek hai ji, exact house no bata do, buyer ko visit karani hai.").
3. If broker gave BOTH unit number and price:
   Briefly acknowledge (e.g. "Ji theek hai bhaiji, buyer se match karke batata hu.").
4. If broker says "office aao" / "call karo":
   Politely ask unit/plot no first so party can be confirmed (e.g. "Bhaiji pehle house no share kardo, party confirm karke seedha office hi baithte hain.").
5. NEVER sound like an AI. NO corporate English. NO quotes. Maximum 15 words.
Output ONLY the raw message text.`;

        const userPrompt = `Property Details: "${intakeRecord.description || intakeRecord.content || ''}"
Broker just said: "${brokerMessage}"
Has Unit No: ${hasUnit ? extractedData.unit_number : 'NO'}
Has Final Price: ${hasPrice ? extractedData.final_price : 'NO'}
Write the 1-line WhatsApp reply:`;

        try {
            const reply = await geminiService.generateWithSystem(systemPrompt, userPrompt, {
                model: 'gemini-3.8-flash',
                temperature: 0.4,
                maxTokens: 250
            });
            if (reply && reply.trim().length > 3) {
                return reply.trim().replace(/^["']|["']$/g, '');
            }
        } catch (err) {
            console.warn('[DealVerificationAgent] Failed to generate conversational reply:', err.message);
        }

        // Natural fallbacks
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
  "final_price": "string (e.g. '1.40 Cr', '85 Lac', '2.10 Cr' or empty if not mentioned)",
  "price_type": "string ('Bottom / Non-negotiable' | 'Negotiable' | 'Fixed' | 'Unknown')",
  "broker_cooperation": "string ('cooperative' | 'in_person_only' | 'uncooperative')",
  "broker_notes": "string (summary of any specific conditions mentioned, e.g. 'Bayana on table')",
  "confidence_score": 95
}
Output pure JSON with no markdown tags.`;

        const userPrompt = `Broker Reply:\n"${replyText}"`;

        try {
            const rawOutput = await geminiService.generateWithSystem(systemPrompt, userPrompt, {
                model: 'gemini-3.8-flash',
                temperature: 0.1,
                maxTokens: 1500,
                responseMimeType: 'application/json'
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
        const unitMatch = text.match(/(?:plot|house|flat|shop|kothi|unit|no\.?)\s*(?:#|no\.?|number)?\s*([0-9]+[a-zA-Z]?)/i);
        const priceMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:cr|crore|lac|lakh|l\b)/i);
        
        return {
            unit_number: unitMatch ? unitMatch[1] : (text.toLowerCase().includes('mil') || text.toLowerCase().includes('office') ? 'UNDISCLOSED' : 'UNKNOWN'),
            unit_type: 'property',
            location_confirmed: '',
            final_price: priceMatch ? priceMatch[0] : '',
            price_type: 'Bottom',
            broker_cooperation: 'cooperative',
            broker_notes: text.substring(0, 100),
            confidence_score: 70
        };
    }
}

export default new DealVerificationAgent();
