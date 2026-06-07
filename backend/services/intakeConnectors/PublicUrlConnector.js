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
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000,
            validateStatus: () => true // Don't throw on 404/500, handle it gracefully
        });

        if (response.status >= 400) {
            throw new Error(`URL returned status ${response.status}: ${response.statusText}`);
        }

        // Extract meaningful text from HTML
        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header, noscript').remove();
        
        const title = $('title').text() || $('h1').first().text() || url;
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

        // Pass extracted text to NLP Parser
        const extracted = (await parseContent(bodyText, inputData.tenantId)) || {};

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
            tenantId: inputData.tenantId || null,
            raw_source_data: { url, originalTitle: title }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(url); // Hashing URL to prevent re-scraping the exact same page

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new PublicUrlConnector();
