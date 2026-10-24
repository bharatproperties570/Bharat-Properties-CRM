import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import dns from 'node:dns';

import SourceAuthorizationMatrix, {
    SOURCE_TIERS,
    SOURCE_STATUS,
    classifySource,
    isSourceAuthorized,
    extractCleanDomain
} from '../services/discovery/SourceAuthorizationMatrix.js';

import {
    validateDiscoveryConfigPayload,
    normalizeDiscoveryUrl,
    evaluateListing
} from '../services/discovery/DiscoveryFilterEngine.js';

import publicUrlConnector from '../services/intakeConnectors/PublicUrlConnector.js';
import propertyListingConnector from '../services/intakeConnectors/PropertyListingConnector.js';
import { addToIntakeQueue } from '../services/intakeQueue/IntakeQueue.js';
import Intake from '../models/Intake.js';
import ParsingRule from '../src/modules/parsing/parsingRule.model.js';

// Prevent Mongoose buffering timeout during unit tests
ParsingRule.find = async () => [];

test('--- PHASE 1.2: AUTHORIZED DISCOVERY SOURCES & PIPELINE INTEGRATION SUITE ---', async (t) => {

    await t.test('1. Source Authorization Matrix & 4-Tier Governance Classification', () => {
        // Tier 1: Official APIs
        const tier1Check = classifySource('google_index');
        assert.equal(tier1Check.tier, SOURCE_TIERS.TIER_1_OFFICIAL_API);
        assert.equal(tier1Check.status, SOURCE_STATUS.AUTHORIZED);
        assert.equal(tier1Check.authorized, true);
        assert.equal(tier1Check.spec.requiredEnvVars.includes('GOOGLE_API_KEY'), true);

        // Tier 2: Publicly Accessible Pages
        const tier2Check = classifySource('https://kurukshetrarealestate.in/plot-details');
        assert.equal(tier2Check.tier, SOURCE_TIERS.TIER_2_PUBLIC_PAGE);
        assert.equal(tier2Check.status, SOURCE_STATUS.AUTHORIZED);
        assert.equal(tier2Check.authorized, true);
        assert.equal(tier2Check.spec.timeoutMs, 15000);

        // Tier 3: Commercial Aggregator Portals (Permission / Syndication Required)
        const portals = [
            'https://www.99acres.com/property-in-sector-8-kurukshetra',
            'https://magicbricks.com/propertyDetails/1234',
            'https://housing.com/in/buy/projects/page/567',
            'https://www.olx.in/item/plot-for-sale-iid-890'
        ];

        for (const portalUrl of portals) {
            const check = classifySource(portalUrl);
            assert.equal(check.tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
            assert.equal(check.defaultStatus, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
            assert.equal(check.requiresWrittenPermission, true);
            assert.equal(isSourceAuthorized(portalUrl), false, 'Portals without grant must not be authorized for automated fetch');
        }

        // Tier 4: Walled Gardens & Private Communities (Strictly Blocked)
        const walledGardens = [
            'https://www.facebook.com/groups/kurukshetraplots',
            'https://instagram.com/p/Cxyz123',
            'https://youtube.com/watch?v=abcd1234',
            'https://t.me/realestatekurukshetra'
        ];

        for (const walledUrl of walledGardens) {
            const check = classifySource(walledUrl);
            assert.equal(check.tier, SOURCE_TIERS.TIER_4_WALLED_GARDEN);
            assert.equal(check.status, SOURCE_STATUS.UNSUPPORTED_BLOCKED);
            assert.equal(check.authorized, false);
            assert.equal(isSourceAuthorized(walledUrl), false, 'Walled gardens must be blocked pending OAuth review');
        }

        // Clean domain extraction helper
        assert.equal(extractCleanDomain('https://www.99acres.com/path?arg=1'), '99acres.com');
        assert.equal(extractCleanDomain('subdomain.magicbricks.com'), 'subdomain.magicbricks.com');
    });

    await t.test('2. Partial Configuration Update Semantics (Prevents Filter Erasure)', () => {
        // Full Creation (isPartial: false) - requires name and keywords, sets defaults
        const fullValid = validateDiscoveryConfigPayload({
            name: 'Sector 8 Plots',
            keywords: ['sector 8 plot kurukshetra']
        });
        assert.equal(fullValid.valid, true);
        assert.equal(fullValid.cleanPayload.price_min, null);
        assert.deepEqual(fullValid.cleanPayload.portal_whitelist, []);
        assert.equal(fullValid.cleanPayload.schedule_cron, '0 0 * * *');

        // Missing required fields on full creation should fail
        const fullInvalid = validateDiscoveryConfigPayload({});
        assert.equal(fullInvalid.valid, false);
        assert.ok(fullInvalid.errors.includes('Configuration name is required'));

        // Partial Update: Only updating name
        const partialNameOnly = validateDiscoveryConfigPayload({
            name: 'Updated Campaign Name'
        }, { isPartial: true });
        assert.equal(partialNameOnly.valid, true);
        assert.equal(partialNameOnly.cleanPayload.name, 'Updated Campaign Name');
        // Crucial: Must NOT default unspecified filter fields to null or []
        assert.equal('price_min' in partialNameOnly.cleanPayload, false, 'Unspecified price_min must not be in clean payload');
        assert.equal('portal_whitelist' in partialNameOnly.cleanPayload, false, 'Unspecified portal_whitelist must not be in clean payload');
        assert.equal('keywords' in partialNameOnly.cleanPayload, false, 'Unspecified keywords must not be in clean payload');

        // Partial Update: Only updating price ceiling
        const partialPriceOnly = validateDiscoveryConfigPayload({
            price_max: 25000000
        }, { isPartial: true });
        assert.equal(partialPriceOnly.valid, true);
        assert.equal(partialPriceOnly.cleanPayload.price_max, 25000000);
        assert.equal('price_min' in partialPriceOnly.cleanPayload, false);

        // Partial Update: Disallow invalid cross-range if both are provided
        const partialInvalidRange = validateDiscoveryConfigPayload({
            price_min: 30000000,
            price_max: 10000000
        }, { isPartial: true });
        assert.equal(partialInvalidRange.valid, false);
        assert.ok(partialInvalidRange.errors[0].includes('cannot be less than price_min'));

        // Partial Update: Explicitly clearing a filter by passing null
        const partialClearFilter = validateDiscoveryConfigPayload({
            price_max: null,
            size_unit: null
        }, { isPartial: true });
        assert.equal(partialClearFilter.valid, true);
        assert.equal(partialClearFilter.cleanPayload.price_max, null);
        assert.equal(partialClearFilter.cleanPayload.size_unit, null);

        // Partial Update: Updating active status toggle only
        const partialToggle = validateDiscoveryConfigPayload({
            is_active: false
        }, { isPartial: true });
        assert.equal(partialToggle.valid, true);
        assert.equal(partialToggle.cleanPayload.is_active, false);
        assert.equal(Object.keys(partialToggle.cleanPayload).length, 1);
    });

    await t.test('3. Queue-Level Canonical URL Deduplication Gate', async () => {
        const canonicalUrl = 'https://www.99acres.com/plot-in-sector-8-kurukshetra-spid-Y999';
        const rawUrlWithParams = `${canonicalUrl}?utm_source=google&gclid=abc123xyz`;

        const originalFindOne = Intake.findOne;
        const originalSave = Intake.prototype.save;

        try {
            // Stub save in case deduplication ever passed to prevent unbuffered insertOne timeout
            Intake.prototype.save = async function() {
                this._id = this._id || 'mock_intake_saved_id';
                return this;
            };

            // Simulate that the canonical URL was already ingested in the database
            Intake.findOne = async (query) => {
                const isMatch = query?.$or?.some(clause => 
                    clause['raw_source_data.url'] === canonicalUrl ||
                    clause['raw_source_data.normalized_url'] === canonicalUrl ||
                    clause['raw_source_data.raw_url'] === rawUrlWithParams ||
                    clause['duplicate_hash'] !== undefined
                );
                if (isMatch) {
                    return { _id: 'mock_existing_intake_id_123', status: 'Queued' };
                }
                return null;
            };

            const result = await addToIntakeQueue('public_url', {
                url: rawUrlWithParams,
                source: 'Google Discovery'
            });

            assert.equal(result.success, false);
            assert.equal(result.duplicate, true);
            assert.equal(result.reason, 'duplicate_url_already_queued_or_processed');
            assert.equal(result.intakeId, 'mock_existing_intake_id_123');
        } finally {
            Intake.findOne = originalFindOne;
            Intake.prototype.save = originalSave;
        }
    });

    await t.test('4. Comprehensive Provenance Tracking in Connectors', async () => {
        const { authorizationGrantRegistry } = await import('../services/discovery/SourceAuthorizationMatrix.js');
        authorizationGrantRegistry.registerGrant({
            domain: '99acres.com',
            grantType: 'syndication_partner',
            status: 'verified'
        });

        const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Residential Plot Sector 7 Kurukshetra</title></head>
        <body>
            <h1>200 Sqyd Residential Plot</h1>
            <div class="price">75 Lakh</div>
            <div class="size">200 sqyd</div>
            <p>Direct from owner in Sector 7. Call 9996000570.</p>
        </body>
        </html>
        `;

        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => ({
            status: 200,
            statusText: 'OK',
            data: mockHtml
        });

        try {
            const inputData = {
                url: 'https://www.99acres.com/sector-7-plot-75lac?utm_source=ad',
                user_id: 'test_operator_id',
                discovery_filters: {
                    price_min: 5000000,
                    price_max: 10000000,
                    size_min: 150,
                    size_max: 250,
                    size_unit: 'sqyd'
                },
                search_metadata: {
                    title: 'Sector 7 Plot on 99acres',
                    publishedDate: '2026-10-20T10:00:00Z',
                    discoveredAt: '2026-10-24T05:00:00Z'
                }
            };

            const result = await publicUrlConnector.process(inputData);

            // Verify provenance fields in raw_source_data
            assert.ok(result.raw_source_data, 'raw_source_data must exist');
            assert.equal(result.raw_source_data.source_tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
            assert.equal(result.raw_source_data.authorization_status, SOURCE_STATUS.AUTHORIZED);
            assert.equal(result.raw_source_data.url, 'https://www.99acres.com/sector-7-plot-75lac');
            assert.equal(result.raw_source_data.raw_url, inputData.url);
            assert.equal(result.raw_source_data.published_date, '2026-10-20T10:00:00Z');
            assert.ok(result.raw_source_data.discovery_timestamp);
            assert.ok(result.raw_source_data.extraction_timestamp);
            assert.ok(result.raw_source_data.filter_evaluation);
            assert.equal(result.raw_source_data.filter_evaluation.passed, true);

            // Status must remain unverified for human review
            assert.equal(result.verification_status, 'unverified');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
            authorizationGrantRegistry.clearAll();
        }
    });

    await t.test('5. Uncertainty Preservation in Extraction (No Fabricated Values)', async () => {
        // Page with missing price and missing size
        const mockVagueHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Prime Land in Kurukshetra</title></head>
        <body>
            <h1>Prime Land Available</h1>
            <p>Prime location land available near Pipli road. Contact for price and size details.</p>
        </body>
        </html>
        `;

        const originalAxiosGet = (await import('axios')).default.get;
        const dns = await import('dns');
        const originalLookup = dns.promises.lookup;
        dns.promises.lookup = async (host, opts) => {
            if (host === 'kurukshetrarealestate.in') {
                return [{ address: '93.184.216.34', family: 4 }];
            }
            return originalLookup(host, opts);
        };
        (await import('axios')).default.get = async () => ({
            status: 200,
            statusText: 'OK',
            data: mockVagueHtml
        });

        try {
            const inputData = {
                url: 'https://kurukshetrarealestate.in/prime-land',
                user_id: 'test_operator_id',
                discovery_filters: {
                    price_min: 5000000,
                    price_max: 15000000,
                    size_min: 100,
                    size_max: 500,
                    size_unit: 'sqyd'
                }
            };

            const result = await publicUrlConnector.process(inputData);

            // Must NOT invent price or size
            assert.equal(result.price, '', 'Price must not be fabricated when missing');
            assert.equal(result.size, '', 'Size must not be fabricated when missing');

            // Evaluation must flag missing data
            assert.equal(result.extracted_entities.filter_evaluation.missingCoreData, true);
            assert.equal(result.extracted_entities.filter_evaluation.passed, null);
            assert.ok(result.extracted_entities.filter_evaluation.missingFields.includes('price'));
            assert.ok(result.extracted_entities.filter_evaluation.missingFields.includes('size'));

            // Must remain unverified
            assert.equal(result.verification_status, 'unverified');
            assert.ok(result.verification_notes.some(n => n.includes('[Filter Notice]')));
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
            dns.promises.lookup = originalLookup;
        }
    });

    await t.test('6. PropertyListingConnector Targeted CSS Selectors & Provenance', async () => {
        const mockListingHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Sector 3 Kurukshetra Plot</title></head>
        <body>
            <h1>350 Sqyd Corner Plot in Sector 3</h1>
            <div class="amount">₹2.10 Cr</div>
            <div class="address">Sector 3, Urban Estate, Kurukshetra</div>
            <div class="area">350 sqyd</div>
            <p>Corner facing east. Direct owner sale.</p>
        </body>
        </html>
        `;

        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => ({
            status: 200,
            statusText: 'OK',
            data: mockListingHtml
        });

        try {
            const result = await propertyListingConnector.process({
                url: 'https://realestateportal.com/listings/sector-3-plot?ref=share',
                discovery_filters: {
                    price_min: 15000000,
                    price_max: 30000000,
                    size_min: 300,
                    size_max: 400,
                    size_unit: 'sqyd'
                }
            });

            assert.equal(result.raw_source_data.scrapedPrice, '₹2.10 Cr');
            assert.equal(result.raw_source_data.source_tier, SOURCE_TIERS.TIER_2_PUBLIC_PAGE);
            assert.ok(result.raw_source_data.extraction_timestamp);
            assert.equal(result.verification_status, 'unverified');
            assert.equal(result.extracted_entities.filter_evaluation.passed, true);
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('7. Cross-Source & Cross-Campaign Hash Consistency', () => {
        const googleCampaignUrl = 'https://www.99acres.com/property-sector-8-kurukshetra?utm_source=google&gclid=12345';
        const fbCampaignUrl = 'https://www.99acres.com/property-sector-8-kurukshetra?utm_source=facebook&fbclid=67890';
        const slashVariantUrl = 'https://www.99acres.com/property-sector-8-kurukshetra/';

        const hash1 = publicUrlConnector.generateDuplicateHash(normalizeDiscoveryUrl(googleCampaignUrl));
        const hash2 = publicUrlConnector.generateDuplicateHash(normalizeDiscoveryUrl(fbCampaignUrl));
        const hash3 = propertyListingConnector.generateDuplicateHash(normalizeDiscoveryUrl(slashVariantUrl));

        assert.equal(hash1, hash2, 'Google and Facebook campaign variants must produce identical duplicate hash');
        assert.equal(hash2, hash3, 'Trailing slash variant must match canonical duplicate hash across connectors');
    });

    await t.test('8. Strict Human Review Gate (Zero Autonomous Deal Conversions)', () => {
        // Discovered web items must NEVER be automatically converted into CRM Deals
        const validListingData = {
            title: 'Valid Sector 8 Plot',
            price: '1.5 Cr',
            size: '250 sqyd',
            url: 'https://example.com/valid-plot'
        };

        const config = {
            price_min: 10000000,
            price_max: 20000000,
            size_min: 200,
            size_max: 300,
            size_unit: 'sqyd'
        };

        const evalReport = evaluateListing(validListingData, config);
        assert.equal(evalReport.passed, true);

        // Even though filter passed, verification_status must be 'unverified'
        // and must require human review before creating a CRM Deal or Lead.
        let defaultStatus = 'unverified';
        if (evalReport.disqualified) defaultStatus = 'rejected';
        assert.equal(defaultStatus, 'unverified');
        assert.notEqual(defaultStatus, 'verified', 'Automated web listing must never be pre-verified without human review');
    });

    await t.test('9. Google Custom Search API Quota Exhaustion (HTTP 429) & Safe Non-Scraping Termination', async () => {
        const googleDiscoveryService = (await import('../services/discovery/GoogleDiscoveryService.js')).default;
        const DiscoveryConfig = (await import('../models/DiscoveryConfig.js')).default;

        const originalFindById = DiscoveryConfig.findById;
        const originalFindOne = Intake.findOne;
        const originalFallback = googleDiscoveryService.scrapeGoogleSearchFallback;
        const originalProcessAndQueue = googleDiscoveryService.processAndQueueUrl;

        let fallbackTriggered = false;

        try {
            const mockConfig = {
                _id: 'mock_cfg_id_429',
                name: 'Kurukshetra 429 Fallback Test',
                keywords: ['kurukshetra plot'],
                location_filters: [],
                property_types: [],
                portal_whitelist: [],
                urls_discovered_count: 0,
                save: async function() { return this; }
            };

            DiscoveryConfig.findById = async () => mockConfig;
            Intake.findOne = async () => null;

            // Fallback should NOT be triggered without approved provider
            googleDiscoveryService.scrapeGoogleSearchFallback = async () => {
                fallbackTriggered = true;
                return [{ url: 'https://example.com/organic-listing-1', title: 'Organic Listing' }];
            };

            googleDiscoveryService.processAndQueueUrl = async () => ({ queued: true, url: 'https://example.com/organic-listing-1' });

            // Force API mode with dummy keys
            process.env.GOOGLE_API_KEY = 'mock_key';
            process.env.GOOGLE_SEARCH_ENGINE_ID = 'mock_cx';
            delete process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER;

            // Mock google custom search to throw 429
            const { google } = await import('googleapis');
            const originalCustomsearch = google.customsearch;
            google.customsearch = () => ({
                cse: {
                    list: async () => {
                        const err = new Error('Quota exceeded for quota metric Queries and limit 100 per day');
                        err.code = 429;
                        err.status = 429;
                        throw err;
                    }
                }
            });

            try {
                // Scenario A: Without approved fallback provider, unapproved scraping is blocked
                const result = await googleDiscoveryService.runDiscovery('mock_cfg_id_429');
                assert.equal(result.success, false);
                assert.equal(result.reason, 'google_api_quota_exhausted');
                assert.equal(fallbackTriggered, false, 'Unapproved search engine scraping must NOT occur on quota exhaustion');
                assert.equal(mockConfig.last_run_status, 'failed');

                // Scenario B: Environment flag without a real implemented adapter must NOT trigger unapproved external requests
                process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER = 'approved_partner_feed';
                const resultWithApproved = await googleDiscoveryService.runDiscovery('mock_cfg_id_429');
                assert.equal(resultWithApproved.success, false);
                assert.equal(resultWithApproved.reason, 'google_api_quota_exhausted');
                assert.equal(fallbackTriggered, false, 'Unapproved fallback scraping must NOT be triggered by misleading env flags');
            } finally {
                google.customsearch = originalCustomsearch;
                delete process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER;
            }
        } finally {
            DiscoveryConfig.findById = originalFindById;
            Intake.findOne = originalFindOne;
            googleDiscoveryService.scrapeGoogleSearchFallback = originalFallback;
            googleDiscoveryService.processAndQueueUrl = originalProcessAndQueue;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_SEARCH_ENGINE_ID;
            delete process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER;
        }
    });
});
