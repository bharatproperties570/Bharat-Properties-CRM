import BaseConnector from './BaseConnector.js';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { parseContent } from '../../src/modules/intake/intakeParser.js';
import { normalizeDiscoveryUrl, evaluateListing } from '../discovery/DiscoveryFilterEngine.js';

class PropertyListingConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'property_listing';
    }

    async process(inputData) {
        const { url, user_id, discovery_filters, search_metadata } = inputData;
        const canonicalUrl = normalizeDiscoveryUrl(url) || url;
        
        // Fetch URL content
        const response = await axios.get(canonicalUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000,
            validateStatus: () => true
        });

        if (response.status >= 400) {
            throw new Error(`URL returned status ${response.status}: ${response.statusText}`);
        }

        const $ = cheerio.load(response.data);
        $('script, style, nav, footer, header, noscript').remove();
        
        // Highly targeted selectors for common listing sites
        const title = $('h1').first().text() || $('title').text() || search_metadata?.title || 'Property Listing';
        const price = $('.price, [data-price], .amount').first().text() || '';
        const location = $('.location, .address, [data-location]').first().text() || '';
        const size = $('.size, .area, [data-area]').first().text() || '';
        
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

        // Still run through NLP but with extracted targeted data as prefix
        const prefix = `Title: ${title}\nPrice: ${price}\nLocation: ${location}\nSize: ${size}\n\n`;
        const extracted = (await parseContent(prefix + bodyText.substring(0, 3000), inputData.tenantId)) || {};

        const effectivePrice = price || extracted.specs?.price || extracted.budget || extracted.price || '';
        const effectiveSize = size || extracted.specs?.size || extracted.size || '';
        const effectiveLocation = location || extracted.location || extracted.address?.sector || '';

        const verificationNotes = [];
        let verificationStatus = 'unverified';
        let filterEvaluation = null;

        // Phase 1: Apply Discovery Filters if configured
        if (discovery_filters) {
            filterEvaluation = evaluateListing({
                url: canonicalUrl,
                title,
                description: bodyText,
                price: effectivePrice,
                size: effectiveSize,
                seller_intent: extracted.intent || 'unknown',
                publishedDate: search_metadata?.publishedDate || null
            }, discovery_filters);

            if (filterEvaluation.disqualified) {
                verificationStatus = 'rejected';
                verificationNotes.push(`[Filter Disqualified] Excluded due to: ${filterEvaluation.auditReasons.join(', ')}`);
            } else if (filterEvaluation.missingCoreData) {
                verificationStatus = 'unverified';
                verificationNotes.push(`[Filter Notice] Missing listing data for: ${filterEvaluation.missingFields.join(', ')}`);
            } else if (filterEvaluation.passed === true) {
                verificationNotes.push(`[Filter Passed] Satisfies all configured discovery criteria`);
            }
        }

        const normalized = {
            title: title.substring(0, 100) || 'Property Listing',
            description: bodyText.substring(0, 5000),
            location: effectiveLocation,
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: effectiveSize,
            price: effectivePrice,
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: {
                ...extracted,
                filter_evaluation: filterEvaluation
            },
            verification_status: verificationStatus,
            verification_notes: verificationNotes,
            source_confidence: verificationStatus === 'rejected' ? 15 : 90,
            tenantId: inputData.tenantId || null,
            raw_source_data: { 
                url: canonicalUrl, 
                raw_url: url,
                originalTitle: title, 
                scrapedPrice: price,
                search_metadata: search_metadata || null,
                filter_evaluation: filterEvaluation
            }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(canonicalUrl);

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new PropertyListingConnector();
