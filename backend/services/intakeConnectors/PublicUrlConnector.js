import axios from 'axios';
import * as cheerio from 'cheerio';
import BaseConnector from './BaseConnector.js';
import { parseContent } from '../../src/modules/intake/intakeParser.js';

class PublicUrlConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'public_url';
    }

    async process(inputData) {
        const { url, user_id } = inputData;
        
        // Fetch URL content
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'BharatProperties-Bot/1.0' },
            timeout: 10000
        });

        // Extract meaningful text from HTML
        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header, noscript').remove();
        
        const title = $('title').text() || $('h1').first().text() || url;
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

        // Pass extracted text to NLP Parser
        const extracted = await parseContent(bodyText);

        const normalized = {
            title: title.substring(0, 100),
            description: bodyText.substring(0, 5000), // Cap description size
            location: extracted.location || '',
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: extracted.size || '',
            price: extracted.budget || extracted.price || '',
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: extracted,
            verification_status: 'unverified',
            source_confidence: bodyText.length > 100 ? 75 : 20,
            raw_source_data: { url, originalTitle: title }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(url); // Hashing URL to prevent re-scraping the exact same page

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new PublicUrlConnector();
