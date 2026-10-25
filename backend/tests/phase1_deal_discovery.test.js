import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeDiscoveryUrl,
    isPortalAllowed,
    convertArea,
    evaluateListing,
    validateDiscoveryConfigPayload
} from '../services/discovery/DiscoveryFilterEngine.js';

test('--- PHASE 1: ONLINE DEAL DISCOVERY & FILTER ENGINE TEST SUITE ---', async (t) => {

    await t.test('Scenario 1: Valid listing matching every configured filter', () => {
        const config = {
            price_min: 10000000, // 1 Cr
            price_max: 25000000, // 2.5 Cr
            size_min: 200,
            size_max: 300,
            size_unit: 'sqyd',
            seller_types: ['owner'],
            portal_whitelist: ['99acres.com', 'magicbricks.com'],
            freshness_days: 30
        };

        const listing = {
            url: 'https://www.99acres.com/property-sector-8-kurukshetra-250sqyd',
            title: 'Direct Owner Urgent Sale 250 Sq Yd Plot',
            description: 'Plot available in Sector 8, direct owner sale, no brokerage.',
            price: '1.75 Cr',
            size: '250 sqyd',
            seller_intent: 'direct owner',
            publishedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days old
        };

        const result = evaluateListing(listing, config);

        assert.equal(result.passed, true, 'Listing should pass all criteria');
        assert.equal(result.disqualified, false, 'Listing should not be disqualified');
        assert.equal(result.missingCoreData, false, 'Listing has all required data');
        assert.equal(result.auditReasons.length, 0, 'No audit disqualification reasons');
        assert.equal(result.checks.price.extracted, 17500000);
        assert.equal(result.checks.size.extracted, 250);
        assert.equal(result.checks.sellerType.detected, 'owner');
    });

    await t.test('Scenario 2: Listing below the minimum price', () => {
        const config = {
            price_min: 10000000, // 1 Cr
            price_max: 20000000  // 2 Cr
        };

        const listing = {
            price: '75 Lacs', // 75,00,000 < 1,00,00,000
            size: '200 sqyd'
        };

        const result = evaluateListing(listing, config);

        assert.equal(result.passed, false, 'Should fail price check');
        assert.equal(result.disqualified, true, 'Should be marked disqualified');
        assert.ok(result.auditReasons.includes('below_min_price'), 'Audit reason must indicate below_min_price');
        assert.equal(result.checks.price.passed, false);
        assert.equal(result.checks.price.extracted, 7500000);
    });

    await t.test('Scenario 3: Listing above the maximum price', () => {
        const config = {
            price_min: 5000000,  // 50 Lac
            price_max: 15000000  // 1.5 Cr
        };

        const listing = {
            price: '2.40 Cr', // 2,40,00,000 > 1,50,00,000
            size: '200 sqyd'
        };

        const result = evaluateListing(listing, config);

        assert.equal(result.passed, false, 'Should fail max price check');
        assert.equal(result.disqualified, true, 'Should be marked disqualified');
        assert.ok(result.auditReasons.includes('above_max_price'), 'Audit reason must indicate above_max_price');
        assert.equal(result.checks.price.passed, false);
        assert.equal(result.checks.price.extracted, 24000000);
    });

    await t.test('Scenario 4: Listing below and above the size range', () => {
        const config = {
            size_min: 150,
            size_max: 300,
            size_unit: 'sqyd'
        };

        // Sub-test A: Below min size
        const smallListing = { size: '100 sqyd' };
        const smallResult = evaluateListing(smallListing, config);
        assert.equal(smallResult.passed, false);
        assert.ok(smallResult.auditReasons.includes('below_min_size'));

        // Sub-test B: Above max size
        const largeListing = { size: '500 sqyd' };
        const largeResult = evaluateListing(largeListing, config);
        assert.equal(largeResult.passed, false);
        assert.ok(largeResult.auditReasons.includes('above_max_size'));
    });

    await t.test('Scenario 5: Area-unit mismatch or missing area unit', () => {
        const config = {
            size_min: 100,
            size_max: 500,
            size_unit: 'sqyd'
        };

        // Sub-test A: Unsupported or unrecognized unit
        const invalidUnitListing = { size: '250 metersquares' };
        const resA = evaluateListing(invalidUnitListing, config);
        assert.equal(resA.passed, false);
        assert.ok(resA.auditReasons.includes('unsupported_area_unit_mismatch'));

        // Sub-test B: Missing unit in raw listing
        const missingUnitListing = { size: '250' };
        const resB = evaluateListing(missingUnitListing, config);
        assert.equal(resB.passed, false);
        assert.ok(resB.auditReasons.includes('missing_area_unit_in_listing'));

        // Sub-test C: Valid unit with conversion (1800 sqft = 200 sqyd, within 100-500 sqyd)
        const convertibleListing = { size: '1800 sqft' };
        const resC = evaluateListing(convertibleListing, config);
        assert.equal(resC.passed, true);
        assert.equal(resC.checks.size.extracted, 200);
        assert.equal(resC.checks.size.unit, 'sqyd');
    });

    await t.test('Scenario 6: Unsupported or excluded source (Portal whitelist)', () => {
        const config = {
            portal_whitelist: ['99acres.com', 'magicbricks.com']
        };

        const allowedListing = { url: 'https://www.99acres.com/some-listing-id' };
        assert.equal(isPortalAllowed(allowedListing.url, config.portal_whitelist).allowed, true);

        const excludedListing = { url: 'https://unverified-ads.in/property-123' };
        const resExcluded = isPortalAllowed(excludedListing.url, config.portal_whitelist);
        assert.equal(resExcluded.allowed, false);
        assert.equal(resExcluded.reason, 'portal_not_in_whitelist');

        const overallRes = evaluateListing(excludedListing, config);
        assert.equal(overallRes.passed, false);
        assert.ok(overallRes.auditReasons.includes('portal_not_in_whitelist'));
    });

    await t.test('Scenario 7: Old listing outside the freshness window', () => {
        const config = {
            freshness_days: 30
        };

        const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days old
        const listing = { publishedDate: oldDate };

        const result = evaluateListing(listing, config);
        assert.equal(result.passed, false);
        assert.equal(result.disqualified, true);
        assert.ok(result.auditReasons.includes('outside_freshness_window'));
        assert.equal(result.checks.freshness.passed, false);
        assert.equal(result.checks.freshness.ageInDays, 45);
    });

    await t.test('Scenario 8: Missing price or area data (Strict Non-Verification)', () => {
        const config = {
            price_min: 5000000,
            size_min: 150
        };

        // Neither price nor size is present
        const listing = {
            title: 'Commercial opportunity',
            description: 'Prime location, contact for price and size details.'
        };

        const result = evaluateListing(listing, config);

        // Core Requirement: Missing data must NOT be treated as passed/verified
        assert.equal(result.passed, null, 'Listing with missing core fields must return null (unverified), NOT true');
        assert.equal(result.disqualified, false, 'Not hard-disqualified, but pending review');
        assert.equal(result.missingCoreData, true, 'Must flag missing core data');
        assert.ok(result.missingFields.includes('price'), 'Must identify missing price');
        assert.ok(result.missingFields.includes('size'), 'Must identify missing size');
    });

    await t.test('Scenario 9: Duplicate URLs with different tracking parameters', () => {
        const url1 = 'https://www.99acres.com/property-3bhk?utm_source=google&utm_campaign=diwali&ref=agent_share';
        const url2 = 'https://www.99acres.com/property-3bhk?fbclid=IwAR2xyz&source=meta&utm_medium=cpc';
        const url3 = 'https://www.99acres.com/property-3bhk/';

        const norm1 = normalizeDiscoveryUrl(url1);
        const norm2 = normalizeDiscoveryUrl(url2);
        const norm3 = normalizeDiscoveryUrl(url3);

        assert.equal(norm1, 'https://www.99acres.com/property-3bhk');
        assert.equal(norm2, 'https://www.99acres.com/property-3bhk');
        assert.equal(norm3, 'https://www.99acres.com/property-3bhk');
        assert.equal(norm1, norm2, 'Normalized URLs from different ad campaigns must be identical');
    });

    await t.test('Scenario 10: Malformed configuration values (Validation rejects)', () => {
        // Negative price
        const resNegativePrice = validateDiscoveryConfigPayload({
            name: 'Test',
            keywords: ['plot'],
            price_min: -100
        });
        assert.equal(resNegativePrice.valid, false);
        assert.ok(resNegativePrice.errors.some(e => e.includes('price_min must be a non-negative number')));

        // Inverted price range (max < min)
        const resInvertedPrice = validateDiscoveryConfigPayload({
            name: 'Test',
            keywords: ['plot'],
            price_min: 2000000,
            price_max: 1000000
        });
        assert.equal(resInvertedPrice.valid, false);
        assert.ok(resInvertedPrice.errors.some(e => e.includes('price_max (1000000) cannot be less than price_min (2000000)')));

        // Inverted size range (max < min)
        const resInvertedSize = validateDiscoveryConfigPayload({
            name: 'Test',
            keywords: ['plot'],
            size_min: 500,
            size_max: 200
        });
        assert.equal(resInvertedSize.valid, false);
        assert.ok(resInvertedSize.errors.some(e => e.includes('size_max (200) cannot be less than size_min (500)')));

        // Unsupported area unit
        const resBadUnit = validateDiscoveryConfigPayload({
            name: 'Test',
            keywords: ['plot'],
            size_unit: 'lightyears'
        });
        assert.equal(resBadUnit.valid, false);
        assert.ok(resBadUnit.errors.some(e => e.includes('Unsupported size_unit')));

        // Invalid freshness
        const resBadFreshness = validateDiscoveryConfigPayload({
            name: 'Test',
            keywords: ['plot'],
            freshness_days: 0
        });
        assert.equal(resBadFreshness.valid, false);
        assert.ok(resBadFreshness.errors.some(e => e.includes('freshness_days must be an integer between 1 and 365')));

        // Invalid cron
        const resBadCron = validateDiscoveryConfigPayload({
            name: 'Test',
            keywords: ['plot'],
            schedule_cron: 'bad_cron_string'
        });
        assert.equal(resBadCron.valid, false);
        assert.ok(resBadCron.errors.some(e => e.includes('Invalid cron expression')));
    });

    await t.test('Scenario 11: Legacy configuration with newly added fields absent (Backward Compatible)', () => {
        const legacyPayload = {
            name: 'Legacy Discovery Job',
            keywords: ['residential plots kurukshetra'],
            location_filters: ['Sector 7'],
            property_types: ['Plot'],
            schedule_cron: '0 0 * * *',
            is_active: true
        };

        const validation = validateDiscoveryConfigPayload(legacyPayload);
        assert.equal(validation.valid, true, 'Legacy configs without new fields must remain valid');
        assert.equal(validation.cleanPayload.price_min, null);
        assert.equal(validation.cleanPayload.price_max, null);
        assert.equal(validation.cleanPayload.size_min, null);
        assert.equal(validation.cleanPayload.size_max, null);
        assert.equal(validation.cleanPayload.size_unit, null);
        assert.deepEqual(validation.cleanPayload.portal_whitelist, []);
        assert.deepEqual(validation.cleanPayload.seller_types, []);
        assert.equal(validation.cleanPayload.freshness_days, null);

        // Evaluation against legacy config with unconstrained criteria
        const listing = {
            title: 'Sample Plot',
            price: '1.2 Cr',
            size: '250 sqyd'
        };
        const evalResult = evaluateListing(listing, validation.cleanPayload);
        assert.equal(evalResult.passed, true, 'Legacy config should accept listings without filter restrictions');
    });

    await t.test('Scenario 12: Area unit conversion math verification', () => {
        // 1 sqyd = 9 sqft
        assert.equal(convertArea(10, 'sqyd', 'sqft'), 90);
        assert.equal(convertArea(90, 'sqft', 'sqyd'), 10);

        // 1 marla = 25 sqyd = 225 sqft
        assert.equal(convertArea(4, 'marla', 'sqyd'), 100);
        assert.equal(convertArea(4, 'marla', 'sqft'), 900);

        // 1 kanal = 20 marla = 500 sqyd
        assert.equal(convertArea(1, 'kanal', 'marla'), 20);
        assert.equal(convertArea(1, 'kanal', 'sqyd'), 500);

        // 1 acre = 4840 sqyd = 43560 sqft
        assert.equal(convertArea(1, 'acre', 'sqyd'), 4840);
        assert.equal(convertArea(1, 'acre', 'sqft'), 43560);
    });
});
