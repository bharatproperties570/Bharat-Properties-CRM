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
        let extracted = parsedData;
        
        const cleanText = (text || (extracted && extracted.rawText) || '').substring(0, 50000);

        // Parse raw text dynamically if parsedData is missing
        if (!extracted && cleanText) {
            try {
                const { parseContent } = await import('../../src/modules/intake/intakeParser.js');
                const parsedResult = await parseContent(cleanText, inputData.tenantId);
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
                console.error('[ManualConnector:Parser Error]:', err);
            }
        }

        if (!extracted) extracted = {};

        const normalized = {
            title: extracted.projectName || extracted.location || 'Manual Entry',
            description: cleanText,
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
            tenantId: inputData.tenantId || null,
            raw_source_data: typeof inputData === 'object' ? {
                ...inputData,
                text: (inputData.text || '').substring(0, 50000)
            } : inputData
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(text);

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new ManualConnector();
