import BaseConnector from './BaseConnector.js';
import * as cheerio from 'cheerio';
import { parseContent } from '../../src/modules/intake/intakeParser.js';
import { normalizeDiscoveryUrl, evaluateListing } from '../discovery/DiscoveryFilterEngine.js';
import { classifySource, evaluateOperationAuthorization, evaluateOperationAuthorizationAsync } from '../discovery/SourceAuthorizationMatrix.js';
import { safeFetchHtml } from '../discovery/SafeUrlFetcher.js';

class PropertyListingConnector extends BaseConnector {
    constructor() {
        super();
        this.sourceType = 'property_listing';
    }

    async process(inputData) {
        const { url, user_id, discovery_filters, search_metadata } = inputData;
        const canonicalUrl = normalizeDiscoveryUrl(url) || url;
        const sourceClassification = classifySource(canonicalUrl);
        const authDecision = await evaluateOperationAuthorizationAsync(canonicalUrl, 'automated_fetch');
        
        // 🛡️ Pre-flight Authorization Enforcement Gate (BEFORE NETWORK ACCESS)
        if (!authDecision.allowed) {
            const verificationNotes = [
                `[Source Governance Blocked] Automated HTTP fetch blocked: ${authDecision.reason}. Preserved for authorized human review.`
            ];
            const title = search_metadata?.title || 'Property Listing';
            const normalized = {
                title: title.substring(0, 100),
                description: `[Automated Fetch Blocked] Automated page fetch blocked by source governance policy: ${authDecision.reason}. Preserved for authorized human review on Deal Intake Desk.`,
                location: '',
                sector: '',
                property_type: '',
                size: '',
                price: '',
                contact_numbers: [],
                seller_intent: 'unknown',
                extracted_entities: {
                    search_metadata: search_metadata || null,
                    governance_decision: authDecision
                },
                verification_status: 'unverified',
                verification_notes: verificationNotes,
                source_confidence: 10,
                tenantId: inputData.tenantId || null,
                raw_source_data: { 
                    url: canonicalUrl, 
                    raw_url: url,
                    normalized_url: canonicalUrl,
                    originalTitle: title,
                    source_tier: sourceClassification.tier,
                    authorization_status: authDecision.status,
                    fetch_blocked: true,
                    fetch_block_reason: authDecision.reason,
                    discovery_timestamp: inputData.discovery_timestamp || search_metadata?.discoveredAt || new Date().toISOString(),
                    extraction_timestamp: new Date().toISOString(),
                    published_date: search_metadata?.publishedDate || null,
                    search_metadata: search_metadata || null
                }
            };

            const finalData = this.validateAndClean(normalized);
            const hash = this.generateDuplicateHash(canonicalUrl);
            return { ...finalData, duplicate_hash: hash, createdBy: user_id };
        }

        // Fetch URL content securely via SafeUrlFetcher (SSRF + Safe Redirects)
        const response = await safeFetchHtml(canonicalUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000
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

        // Phase 1 / 1.2: Apply Discovery Filters if configured
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
                normalized_url: canonicalUrl,
                originalTitle: title, 
                scrapedPrice: price,
                source_tier: sourceClassification.tier,
                authorization_status: authDecision.status,
                discovery_timestamp: inputData.discovery_timestamp || search_metadata?.discoveredAt || new Date().toISOString(),
                extraction_timestamp: new Date().toISOString(),
                published_date: search_metadata?.publishedDate || null,
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
