import crypto from 'crypto';

class BaseConnector {
    constructor() {
        this.sourceType = 'unknown';
    }

    /**
     * The main entry point for the connector.
     * Extracts, normalizes, and prepares data for intake.
     * @param {Object} inputData - Raw data from the source (e.g. text, file buffer, URL)
     * @returns {Promise<Object>} The normalized IntakeRecord payload
     */
    async process(inputData) {
        throw new Error("process() must be implemented by the specific connector");
    }

    /**
     * Validates that the normalized data fits the required schema.
     * @param {Object} normalizedData 
     * @returns {Object} Cleaned and validated data
     */
    validateAndClean(normalizedData) {
        let mappedIntent = 'unknown';
        const rawIntent = (normalizedData.seller_intent || '').toString().toLowerCase();
        if (rawIntent === 'seller' || rawIntent === 'sell') {
            mappedIntent = 'sell';
        } else if (rawIntent === 'landlord' || rawIntent === 'rent' || rawIntent === 'tenant') {
            mappedIntent = 'rent';
        } else if (rawIntent === 'lease') {
            mappedIntent = 'lease';
        }

        return {
            title: normalizedData.title || '',
            description: normalizedData.description || '',
            location: normalizedData.location || '',
            sector: normalizedData.sector || '',
            property_type: normalizedData.property_type || '',
            size: normalizedData.size || '',
            price: normalizedData.price || '',
            contact_numbers: Array.isArray(normalizedData.contact_numbers) ? normalizedData.contact_numbers : [],
            seller_intent: mappedIntent,
            extracted_entities: normalizedData.extracted_entities || {},
            verification_status: normalizedData.verification_status || 'unverified',
            source_type: this.sourceType,
            source_confidence: normalizedData.source_confidence || 0,
            raw_source_data: normalizedData.raw_source_data || {}
        };
    }

    /**
     * Generates a unique hash to prevent duplicate intakes from the same source data.
     * @param {Object} data - The data to hash (usually raw input or key normalized fields)
     * @returns {String} sha256 hash
     */
    generateDuplicateHash(data) {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHash('sha256').update(str).digest('hex');
    }
}

export default BaseConnector;
