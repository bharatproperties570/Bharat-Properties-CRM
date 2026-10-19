/**
 * ============================================================
 *  WHATSAPP GROUP CONNECTOR
 *  Enterprise Connector for WhatsApp Group Messages → Intake
 * ============================================================
 *
 *  Follows the ConnectorRegistry pattern (extends BaseConnector).
 *  Processes a single WhatsApp group message and normalizes it
 *  into the standard Intake schema.
 *
 *  Input:  { text, groupName, groupJid, senderName, participant,
 *            messageId, timestamp, conversationId }
 *  Output: Normalized Intake payload with duplicate_hash
 * ============================================================
 */

import BaseConnector from './BaseConnector.js';

class WhatsAppGroupConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'whatsapp_group';
    }

    /**
     * Process a single WhatsApp group message into intake format.
     * @param {Object} inputData - Raw message data from GroupMessageScanner
     * @returns {Promise<Object>} Normalized intake record payload
     */
    async process(inputData) {
        const {
            text,
            groupName,
            groupJid,
            senderName,
            participant,
            messageId,
            timestamp,
            conversationId,
            user_id
        } = inputData;

        const cleanText = (text || '').substring(0, 50000);

        if (!cleanText) {
            return this.validateAndClean({
                title: 'Empty WhatsApp Group Message',
                description: '',
                source_confidence: 0,
                raw_source_data: inputData
            });
        }

        // Use the standard intakeParser for property data extraction
        let extracted = null;
        try {
            const { parseContent } = await import('../../src/modules/intake/intakeParser.js');
            const parsedResult = await parseContent(cleanText);
            if (parsedResult) {
                extracted = {
                    projectName: parsedResult.location !== 'Unspecified' ? parsedResult.location : '',
                    location: parsedResult.location !== 'Unspecified' ? parsedResult.location : '',
                    sector: parsedResult.address?.sector || '',
                    property_type: parsedResult.type !== 'Unknown' ? parsedResult.type : '',
                    size: parsedResult.specs?.size || '',
                    price: parsedResult.specs?.price || '',
                    contact_numbers: parsedResult.contact_numbers || [],
                    intent: parsedResult.intent || 'unknown'
                };
            }
        } catch (err) {
            console.error('[WhatsAppGroupConnector:Parser Error]:', err.message);
        }

        if (!extracted) extracted = {};

        const normalized = {
            title: extracted.projectName || extracted.location || `WhatsApp: ${groupName || 'Group'}`,
            description: cleanText,
            location: extracted.location || '',
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: extracted.size || '',
            price: extracted.price || '',
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: {
                ...extracted,
                // WhatsApp Group metadata for traceability
                _whatsappGroup: {
                    groupName,
                    groupJid,
                    senderName,
                    participant,
                    messageId,
                    timestamp,
                    conversationId: String(conversationId)
                }
            },
            verification_status: 'unverified',
            source_confidence: this._calculateConfidence(extracted, cleanText),
            raw_source_data: {
                text: cleanText,
                source: `WhatsApp Group: ${groupName || groupJid}`,
                groupName,
                groupJid,
                senderName,
                participant,
                messageId,
                timestamp,
                conversationId: String(conversationId)
            }
        };

        const finalData = this.validateAndClean(normalized);

        // Generate semantic dedup hash to identify identical deals cross-posted across groups
        let hash = null;
        try {
            const { generateNormalizedDealHash } = await import('../intakeQueue/IntakeQueue.js');
            hash = generateNormalizedDealHash(cleanText);
        } catch (e) {}
        if (!hash) {
            hash = this.generateDuplicateHash(cleanText);
        }

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }

    /**
     * Calculate source confidence based on extracted field completeness.
     * More extracted fields = higher confidence that this is a real property deal.
     */
    _calculateConfidence(extracted, text) {
        if (!extracted || !text) return 10;

        let score = 30; // Base score for WhatsApp group messages

        if (extracted.price) score += 20;
        if (extracted.location && extracted.location !== 'Unspecified') score += 15;
        if (extracted.property_type && extracted.property_type !== 'Unknown') score += 10;
        if (extracted.size) score += 10;
        if (extracted.contact_numbers?.length > 0) score += 10;
        if (extracted.intent && extracted.intent !== 'unknown') score += 5;

        return Math.min(score, 100);
    }
}

export default new WhatsAppGroupConnector();
