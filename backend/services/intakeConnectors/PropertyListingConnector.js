import BaseConnector from './BaseConnector.js';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { parseContent } from '../../src/modules/intake/intakeParser.js';

class PropertyListingConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'property_listing';
    }

    async process(inputData) {
        const { url, user_id } = inputData;
        
        // Fetch URL content
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header, noscript').remove();
        
        // Highly targeted selectors for common listing sites
        const title = $('h1').first().text() || $('title').text();
        const price = $('.price, [data-price], .amount').first().text();
        const location = $('.location, .address, [data-location]').first().text();
        const size = $('.size, .area, [data-area]').first().text();
        
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

        // Still run through NLP but with extracted targeted data as prefix
        const prefix = `Title: ${title}\nPrice: ${price}\nLocation: ${location}\nSize: ${size}\n\n`;
        const extracted = await parseContent(prefix + bodyText.substring(0, 3000));

        const normalized = {
            title: title.substring(0, 100) || 'Property Listing',
            description: bodyText.substring(0, 5000),
            location: location || extracted.location || '',
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: size || extracted.size || '',
            price: price || extracted.budget || extracted.price || '',
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: extracted,
            verification_status: 'unverified',
            source_confidence: 90, // Targeted scraper yields high confidence
            raw_source_data: { url, originalTitle: title, scrapedPrice: price }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(url);

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new PropertyListingConnector();
