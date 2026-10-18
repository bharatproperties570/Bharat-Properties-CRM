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
     * with fallback to the WhatsApp group sender participant.
     */
    resolveTargetPhones(intakeRecord) {
        if (!intakeRecord) return { textContacts: [], senderPhone: null, recommendedTarget: null, targetType: 'text_contact' };

        // 1. Text-extracted contacts
        let textContacts = [];
        if (Array.isArray(intakeRecord.contact_numbers) && intakeRecord.contact_numbers.length > 0) {
            textContacts = intakeRecord.contact_numbers.map(p => this._cleanPhone(p)).filter(Boolean);
        } else if (intakeRecord.extracted_entities?.contact_numbers && Array.isArray(intakeRecord.extracted_entities.contact_numbers)) {
            textContacts = intakeRecord.extracted_entities.contact_numbers.map(p => this._cleanPhone(p)).filter(Boolean);
        }

        // 2. Sender participant number from group metadata
        const rawParticipant = intakeRecord.extracted_entities?._whatsappGroup?.participant || 
                               intakeRecord.raw_source_data?.participant || '';
        const senderPhone = this._cleanPhone(rawParticipant);

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
     * Generates a warm, human-like broker verification inquiry in natural Hinglish.
     * Powered by Gemini Flash.
     */
    async generateInquiryDraft(intakeRecord) {
        const location = intakeRecord.location || intakeRecord.sector || 'your area';
        const propType = intakeRecord.property_type || 'property';
        const price = intakeRecord.price || '';
        const size = intakeRecord.size || '';

        const systemPrompt = `You are a senior real estate acquisition manager at Bharat Properties, a premier property firm in North India.
Your objective is to write a warm, friendly, and respectful WhatsApp inquiry in natural Hinglish to a fellow broker regarding a property broadcast they posted in a real estate group.

Goals of the inquiry:
1. Mention the specific property post you noticed (Location: "${location}", Type: "${propType}", Size: "${size}", Listed Price: "${price}").
2. State that you have a verified, genuine buyer ready for this location.
3. Politely request the exact Plot / House / Flat / Shop Number (or Unit No.) so you can match and verify the deal with your buyer.
4. Ask what would be the party's last/final bottom closing price on the table.

Style rules:
- Natural, respectful broker-to-broker Hinglish (use words like "Namaste sir / bhaiji", "deal confirm", "genuine client ready hai", "plot/unit number", "last price").
- Short and direct: 2 to 3 sentences maximum.
- Do NOT use robotic templates, marketing fluff, links, or asterisks overload.
- Output ONLY the message text.`;

        const userPrompt = `Draft the broker WhatsApp inquiry for this post:\n"${intakeRecord.description || intakeRecord.content || (propType + ' in ' + location)}"`;

        try {
            const draft = await geminiService.generateWithSystem(systemPrompt, userPrompt, {
                model: 'gemini-3.8-flash',
                temperature: 0.6,
                maxTokens: 1024
            });
            if (draft && draft.trim().length > 20) {
                return draft.trim().replace(/^["']|["']$/g, '');
            }
        } catch (err) {
            console.warn('[DealVerificationAgent] Gemini draft generation failed, using fallback template:', err.message);
        }

        // Fallback natural template
        let details = propType;
        if (size) details += ` (${size})`;
        if (location) details += ` in ${location}`;

        return `Namaste sir, Bharat Properties se baat kar raha hoon. Aapka ${details} ka group post dekha tha. Hamare paas genuine client ready hai is segment me. Deal confirm karne ke liye plot/unit number aur party ka last closing price kya rahega?`;
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

        const formattedPhone = this._cleanPhone(targetPhone);
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

        await pendingIntake.save();
        return {
            intakeId: pendingIntake._id,
            verified: hasUnitNumber,
            extracted
        };
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
