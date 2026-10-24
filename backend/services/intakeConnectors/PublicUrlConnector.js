import axios from 'axios';
import * as cheerio from 'cheerio';
import BaseConnector from './BaseConnector.js';
import { parseContent } from '../../src/modules/intake/intakeParser.js';
import { normalizeDiscoveryUrl, evaluateListing } from '../discovery/DiscoveryFilterEngine.js';

class PublicUrlConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'public_url';
    }

    async process(inputData) {
        const { url, user_id, discovery_filters, search_metadata } = inputData;
        const canonicalUrl = normalizeDiscoveryUrl(url) || url;
        
        // Fetch URL content
        const response = await axios.get(canonicalUrl, {
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
        
        const title = $('title').text() || $('h1').first().text() || search_metadata?.title || canonicalUrl;
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

        // Pass extracted text to NLP Parser
        const extracted = (await parseContent(bodyText, inputData.tenantId)) || {};

        const verificationNotes = [];
        let verificationStatus = 'unverified';
        let filterEvaluation = null;

        const resolvedPrice = extracted.specs?.price || extracted.budget || extracted.price || '';
        const resolvedSize = extracted.specs?.size || extracted.size || '';

        // Phase 1: Apply Discovery Filters if configured
        if (discovery_filters) {
            filterEvaluation = evaluateListing({
                url: canonicalUrl,
                title,
                description: bodyText,
                price: resolvedPrice,
                size: resolvedSize,
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
            title: title.substring(0, 100),
            description: bodyText.substring(0, 5000), // Cap description size
            location: extracted.location || '',
            sector: extracted.sector || '',
            property_type: extracted.property_type || '',
            size: resolvedSize,
            price: resolvedPrice,
            contact_numbers: extracted.contact_numbers || [],
            seller_intent: extracted.intent || 'unknown',
            extracted_entities: {
                ...extracted,
                filter_evaluation: filterEvaluation
            },
            verification_status: verificationStatus,
            verification_notes: verificationNotes,
            source_confidence: bodyText.length > 100 ? (verificationStatus === 'rejected' ? 10 : 75) : 20,
            tenantId: inputData.tenantId || null,
            raw_source_data: { 
                url: canonicalUrl, 
                raw_url: url,
                originalTitle: title,
                search_metadata: search_metadata || null,
                filter_evaluation: filterEvaluation
            }
        };

        const finalData = this.validateAndClean(normalized);
        const hash = this.generateDuplicateHash(canonicalUrl); // Canonical URL hash prevents duplicate re-scraping

        return { ...finalData, duplicate_hash: hash, createdBy: user_id };
    }
}

export default new PublicUrlConnector();
