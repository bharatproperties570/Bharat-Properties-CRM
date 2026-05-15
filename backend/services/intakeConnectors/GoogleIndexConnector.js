import { google } from 'googleapis';
import BaseConnector from './BaseConnector.js';
import publicUrlConnector from './PublicUrlConnector.js';

class GoogleIndexConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'google_index';
    }

    async process(inputData) {
        const { query, apiKey, searchEngineId, user_id } = inputData;
        
        if (!apiKey || !searchEngineId) {
            throw new Error("Google API Key and Search Engine ID are required for google_index source.");
        }

        const customsearch = google.customsearch('v1');
        const res = await customsearch.cse.list({
            cx: searchEngineId,
            q: query,
            auth: apiKey,
            num: 5 // Get top 5 results
        });

        if (!res.data.items || res.data.items.length === 0) {
            throw new Error("No results found on Google for the given query.");
        }

        const items = res.data.items;
        const consolidatedText = items.map(item => `${item.title}\n${item.snippet}`).join('\n\n');

        const normalized = {
            title: `Google Search: ${query}`,
            description: consolidatedText,
            location: '', // Rely on future NLP enrichment
            sector: '',
            property_type: '',
            size: '',
            price: '',
            contact_numbers: [],
            seller_intent: 'unknown',
            extracted_entities: {},
            verification_status: 'unverified',
            source_confidence: 40, // Snippets are low confidence
            raw_source_data: { query, resultsCount: items.length, items: items.map(i => ({ link: i.link, title: i.title })) }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(query);

        // Alternatively, we could queue up PublicUrlConnector jobs for each `item.link`,
        // but for now, we just index the snippets as a single intake record.

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new GoogleIndexConnector();
