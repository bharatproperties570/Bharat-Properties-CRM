import test from 'node:test';
import assert from 'node:assert/strict';

import ParsingRule from '../src/modules/parsing/parsingRule.model.js';
import { normalizeDiscoveryUrl, validateDiscoveryConfigPayload } from '../services/discovery/DiscoveryFilterEngine.js';
import publicUrlConnector from '../services/intakeConnectors/PublicUrlConnector.js';
import { authorizationGrantRegistry } from '../services/discovery/SourceAuthorizationMatrix.js';

// Prevent Mongoose buffering timeout by providing in-memory stub for test runner
ParsingRule.find = async () => [];

test('--- PHASE 1: END-TO-END PIPELINE & FIXTURE INTEGRATION SUITE ---', async (t) => {
    // Register verified grant for 99acres fixture testing
    authorizationGrantRegistry.registerGrant({
        domain: '99acres.com',
        grantType: 'syndication_partner',
        status: 'verified'
    });

    await t.test('Pipeline Stage 1: URL Normalization & Deduplication Gate', () => {
        const urlGoogleAd = 'https://www.99acres.com/property-in-sector-8-kurukshetra-spid-X12345?utm_source=google&utm_medium=cpc&utm_campaign=brand_search&gclid=EAIaIQobChMI123&ref=share_btn';
        const urlFacebookAd = 'https://www.99acres.com/property-in-sector-8-kurukshetra-spid-X12345?utm_source=facebook&utm_medium=paid&fbclid=IwAR234xyz';
        const urlTrailingSlash = 'https://www.99acres.com/property-in-sector-8-kurukshetra-spid-X12345/';
        const expectedCanonical = 'https://www.99acres.com/property-in-sector-8-kurukshetra-spid-X12345';

        const norm1 = normalizeDiscoveryUrl(urlGoogleAd);
        const norm2 = normalizeDiscoveryUrl(urlFacebookAd);
        const norm3 = normalizeDiscoveryUrl(urlTrailingSlash);

        assert.equal(norm1, expectedCanonical, 'Google tracking parameters must be stripped');
        assert.equal(norm2, expectedCanonical, 'Facebook tracking parameters must be stripped');
        assert.equal(norm3, expectedCanonical, 'Trailing slash must be normalized');

        const hash1 = publicUrlConnector.generateDuplicateHash(norm1);
        const hash2 = publicUrlConnector.generateDuplicateHash(norm2);
        const hash3 = publicUrlConnector.generateDuplicateHash(norm3);

        // Hashing the normalized URLs guarantees deduplication across different campaigns
        assert.equal(hash1, hash2, 'Hash of Google campaign and Facebook campaign must be identical');
        assert.equal(hash2, hash3, 'Hash of trailing slash variant must match canonical hash');
    });

    await t.test('Pipeline Stage 2: Connector Filter Evaluation on HTML Fixture (Matched Criteria)', async () => {
        // Mock HTML representing a real estate listing page
        const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Urgent Sale: 250 Sqyd Plot in Sector 8 Kurukshetra</title></head>
        <body>
            <header><nav><a href="/">Home</a></nav></header>
            <h1>250 Sqyd Residential Plot for Sale</h1>
            <div class="price">Price: 1.50 Cr</div>
            <div class="location">Location: Sector 8, Kurukshetra</div>
            <div class="size">Size: 250 sqyd</div>
            <p>Direct owner dealing. Genuine buyers can contact. Bayana ready.</p>
            <footer><p>© 2026 99acres</p></footer>
        </body>
        </html>
        `;

        const originalGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async (url) => {
            return {
                status: 200,
                statusText: 'OK',
                data: mockHtml
            };
        };

        try {
            const discoveryFilters = {
                price_min: 10000000, // 1 Cr
                price_max: 20000000, // 2 Cr
                size_min: 200,
                size_max: 300,
                size_unit: 'sqyd',
                portal_whitelist: ['99acres.com']
            };

            const inputData = {
                url: 'https://www.99acres.com/plot-sector-8-kurukshetra-1.5cr',
                user_id: 'test_admin_id',
                discovery_filters: discoveryFilters,
                search_metadata: {
                    title: '250 Sqyd Residential Plot for Sale in Sector 8'
                }
            };

            const result = await publicUrlConnector.process(inputData);

            assert.equal(result.verification_status, 'unverified', 'Connector should not claim verified deal without human verification');
            assert.ok(result.verification_notes.some(n => n.includes('[Filter Passed]')), 'Verification notes must record Filter Passed');
            assert.equal(result.extracted_entities.filter_evaluation.passed, true);
            assert.equal(result.extracted_entities.filter_evaluation.disqualified, false);
            assert.equal(result.raw_source_data.url, 'https://www.99acres.com/plot-sector-8-kurukshetra-1.5cr');
        } finally {
            (await import('axios')).default.get = originalGet;
        }
    });

    await t.test('Pipeline Stage 3: Connector Disqualification on Out-of-Budget HTML Fixture', async () => {
        const mockHtmlBudgetFail = `
        <!DOCTYPE html>
        <html>
        <head><title>Ultra Luxury Villa</title></head>
        <body>
            <h1>Luxury Villa in Sector 8</h1>
            <div class="price">Price: 4.50 Cr</div>
            <div class="size">Size: 500 sqyd</div>
            <p>Luxury villa for sale.</p>
        </body>
        </html>
        `;

        const originalGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async (url) => {
            return { status: 200, statusText: 'OK', data: mockHtmlBudgetFail };
        };

        try {
            const discoveryFilters = {
                price_min: 5000000,  // 50L
                price_max: 20000000  // 2 Cr max (Listing is 4.5 Cr)
            };

            const inputData = {
                url: 'https://www.99acres.com/luxury-villa-4.5cr',
                user_id: 'test_admin_id',
                discovery_filters: discoveryFilters
            };

            const result = await publicUrlConnector.process(inputData);

            assert.equal(result.verification_status, 'rejected', 'Out-of-budget listing must have verification_status=rejected');
            assert.ok(result.verification_notes.some(n => n.includes('[Filter Disqualified]')), 'Must log [Filter Disqualified] in verification notes');
            assert.equal(result.extracted_entities.filter_evaluation.passed, false);
            assert.ok(result.extracted_entities.filter_evaluation.auditReasons.includes('above_max_price'));
        } finally {
            (await import('axios')).default.get = originalGet;
        }
    });

    await t.test('Pipeline Stage 4: Missing Information Handling (Strict Safety)', async () => {
        // Text long enough (>2000 chars) so intakeParser doesn't attempt external LLM API fallback
        const mockHtmlMissingData = `
        <!DOCTYPE html>
        <html>
        <head><title>Commercial property announcement</title></head>
        <body>
            <h1>Commercial property in Kurukshetra</h1>
            <p>${'Commercial opportunity available in main market. Contact office for details. '.repeat(40)}</p>
        </body>
        </html>
        `;

        const originalGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async (url) => {
            return { status: 200, statusText: 'OK', data: mockHtmlMissingData };
        };

        try {
            const discoveryFilters = {
                price_min: 5000000,
                price_max: 20000000,
                size_min: 100,
                size_max: 300,
                size_unit: 'sqyd'
            };

            const inputData = {
                url: 'https://www.99acres.com/property-missing-specs',
                user_id: 'test_admin_id',
                discovery_filters: discoveryFilters
            };

            const result = await publicUrlConnector.process(inputData);

            // Safety assertion: Missing data must remain 'unverified' and must NOT be accepted as verified
            assert.equal(result.verification_status, 'unverified');
            assert.equal(result.extracted_entities.filter_evaluation.passed, null);
            assert.equal(result.extracted_entities.filter_evaluation.missingCoreData, true);
            assert.ok(result.verification_notes.some(n => n.includes('[Filter Notice] Missing listing data')));
        } finally {
            (await import('axios')).default.get = originalGet;
        }
    });

    await t.test('Pipeline Stage 5: Search Error Fallback & Resilience', async () => {
        const originalGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async (url) => {
            return { status: 404, statusText: 'Not Found', data: '<html><body>404 Not Found</body></html>' };
        };

        try {
            await assert.rejects(
                async () => {
                    await publicUrlConnector.process({ url: 'https://www.99acres.com/expired-listing' });
                },
                /URL returned status 404/
            );
        } finally {
            (await import('axios')).default.get = originalGet;
        }
    });

    await t.test('Pipeline Stage 6: API Boundary & Validation Layer Gate', () => {
        // Valid payload
        const validPayload = {
            name: 'Kurukshetra Plots Phase 1',
            keywords: ['plots in kurukshetra', 'land for sale sector 8'],
            location_filters: ['Sector 8', 'Sector 7'],
            property_types: ['plot', 'residential'],
            schedule_cron: '0 */6 * * *',
            price_min: 5000000,
            price_max: 20000000,
            size_min: 150,
            size_max: 500,
            size_unit: 'sqyd',
            seller_types: ['owner', 'builder'],
            portal_whitelist: ['https://99acres.com', 'magicbricks.com/'],
            freshness_days: 30
        };

        const validRes = validateDiscoveryConfigPayload(validPayload);
        assert.equal(validRes.valid, true);
        assert.equal(validRes.errors.length, 0);
        assert.deepEqual(validRes.cleanPayload.portal_whitelist, ['99acres.com', 'magicbricks.com']);

        // Invalid payload: inverted prices, negative sizes, invalid units, invalid cron
        const invalidPayload = {
            name: '', // Empty name
            keywords: [], // No keywords
            schedule_cron: 'invalid-cron-format',
            price_min: 25000000,
            price_max: 10000000, // max < min
            size_min: -50, // negative size
            size_unit: 'hectares_not_supported',
            seller_types: ['owner', 'unauthorized_broker_type'],
            portal_whitelist: ['not_a_domain'],
            freshness_days: 0 // < 1
        };

        const invalidRes = validateDiscoveryConfigPayload(invalidPayload);
        assert.equal(invalidRes.valid, false);
        assert.ok(invalidRes.errors.some(e => e.includes('Configuration name is required')));
        assert.ok(invalidRes.errors.some(e => e.includes('At least one search keyword is required')));
        assert.ok(invalidRes.errors.some(e => e.includes('Invalid cron expression')));
        assert.ok(invalidRes.errors.some(e => e.includes('price_max (10000000) cannot be less than price_min (25000000)')));
        assert.ok(invalidRes.errors.some(e => e.includes('size_min must be a non-negative number')));
        assert.ok(invalidRes.errors.some(e => e.includes('Unsupported size_unit')));
        assert.ok(invalidRes.errors.some(e => e.includes('Unsupported seller_type')));
        assert.ok(invalidRes.errors.some(e => e.includes('Malformed portal domain')));
        assert.ok(invalidRes.errors.some(e => e.includes('freshness_days must be an integer between 1 and 365')));
    });

    await t.test('Pipeline Stage 7: Regional Unit Ambiguity (Bigha to Sqyd) in Connector', async () => {
        const mockHtmlBigha = `
        <!DOCTYPE html>
        <html>
        <head><title>Agricultural Land for Sale</title></head>
        <body>
            <h1>Agricultural Land in Haryana</h1>
            <div class="price">Price: 1.20 Cr</div>
            <div class="size">Size: 4 bigha</div>
            <p>Direct owner selling land. Clean registry.</p>
        </body>
        </html>
        `;

        const originalGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async (url) => {
            return { status: 200, statusText: 'OK', data: mockHtmlBigha };
        };

        try {
            const discoveryFilters = {
                price_min: 5000000,
                price_max: 20000000,
                size_min: 1000,
                size_max: 5000,
                size_unit: 'sqyd' // Target is sqyd, listing is bigha -> Regional Ambiguity!
            };

            const inputData = {
                url: 'https://www.99acres.com/bigha-land-haryana',
                user_id: 'test_admin_id',
                discovery_filters: discoveryFilters
            };

            const result = await publicUrlConnector.process(inputData);

            // Bigha cannot be cross-converted automatically -> must NOT be accepted or rejected, but flagged unverified
            assert.equal(result.verification_status, 'unverified', 'Regional ambiguous unit must require human review');
            assert.equal(result.extracted_entities.filter_evaluation.passed, null);
            assert.equal(result.extracted_entities.filter_evaluation.checks.size.reason, 'ambiguous_regional_unit_conversion');
            assert.ok(result.verification_notes.some(n => n.includes('[Filter Notice] Missing listing data for: size')));
        } finally {
            (await import('axios')).default.get = originalGet;
        }
    });

    await t.test('Pipeline Stage 8: Controller Pre-Persistence Rejection Gate', async () => {
        const { createConfig, updateConfig } = await import('../src/modules/discovery/discovery.controller.js');

        // Test createConfig rejection
        let statusCode = null;
        let responseJson = null;

        const mockReqCreate = {
            body: {
                name: '', // Empty name (invalid)
                keywords: [] // Missing keywords (invalid)
            }
        };

        const mockResCreate = {
            status(code) {
                statusCode = code;
                return {
                    json(data) {
                        responseJson = data;
                        return data;
                    }
                };
            }
        };

        await createConfig(mockReqCreate, mockResCreate);

        assert.equal(statusCode, 400, 'Invalid discovery config payload must return 400 Bad Request');
        assert.equal(responseJson.success, false);
        assert.ok(Array.isArray(responseJson.errors));
        assert.ok(responseJson.errors.length >= 2);
        assert.ok(responseJson.errors.some(e => e.includes('Configuration name is required')));

        // Test updateConfig rejection
        statusCode = null;
        responseJson = null;

        const mockReqUpdate = {
            params: { id: 'cfg_12345' },
            body: {
                name: 'Valid Name',
                keywords: ['valid keyword'],
                price_min: 50000000,
                price_max: 10000000 // Inverted price range (invalid)
            }
        };

        const mockResUpdate = {
            status(code) {
                statusCode = code;
                return {
                    json(data) {
                        responseJson = data;
                        return data;
                    }
                };
            }
        };

        await updateConfig(mockReqUpdate, mockResUpdate);

        assert.equal(statusCode, 400, 'Invalid update payload must return 400 Bad Request');
        assert.equal(responseJson.success, false);
        assert.ok(responseJson.errors.some(e => e.includes('cannot be less than price_min')));
    });

    authorizationGrantRegistry.clearAll();
});
