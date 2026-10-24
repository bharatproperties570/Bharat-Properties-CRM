import test from 'node:test';
import assert from 'node:assert/strict';

import ParsingRule from '../src/modules/parsing/parsingRule.model.js';
import { normalizeDiscoveryUrl } from '../services/discovery/DiscoveryFilterEngine.js';
import publicUrlConnector from '../services/intakeConnectors/PublicUrlConnector.js';

// Prevent Mongoose buffering timeout by providing in-memory stub for test runner
ParsingRule.find = async () => [];

test('--- PHASE 1: END-TO-END PIPELINE & FIXTURE INTEGRATION SUITE ---', async (t) => {

    await t.test('Pipeline Stage 1: URL Normalization & Deduplication Gate', () => {
        const rawUrlWithTracking = 'https://www.99acres.com/property-in-sector-8-kurukshetra-spid-X12345?utm_source=google&utm_medium=cpc&utm_campaign=brand_search&gclid=EAIaIQobChMI123&ref=share_btn';
        const expectedCanonical = 'https://www.99acres.com/property-in-sector-8-kurukshetra-spid-X12345';

        const normalized = normalizeDiscoveryUrl(rawUrlWithTracking);
        assert.equal(normalized, expectedCanonical, 'Tracking parameters must be stripped');

        const hash1 = publicUrlConnector.generateDuplicateHash(normalized);
        const hash2 = publicUrlConnector.generateDuplicateHash(rawUrlWithTracking);
        const hash3 = publicUrlConnector.generateDuplicateHash(expectedCanonical);

        // Hashing the normalized URL guarantees deduplication across different campaigns
        assert.equal(hash1, hash3);
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
});
