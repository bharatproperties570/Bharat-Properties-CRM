import BaseConnector from './BaseConnector.js';

class ManualConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'manual';
    }

    async process(inputData) {
        // inputData is expected to have raw manual text
        const { text, parsedData, user_id } = inputData;
        
        // Use AI Parsing or simple extraction if parsedData is already provided
        const extracted = parsedData || {};
        
        const normalized = {
            title: extracted.projectName || extracted.location || 'Manual Entry',
            description: text || extracted.rawText || '',
            location: extracted.location || '',
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: extracted.size || '',
            price: extracted.budget || extracted.price || '',
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: extracted,
            verification_status: 'unverified',
            source_confidence: parsedData ? 80 : 50,
            raw_source_data: inputData
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(text);

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new ManualConnector();
