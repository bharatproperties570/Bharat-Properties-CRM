import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parsePriceToNumber,
    normalizeDiscoveryUrl,
    isPortalAllowed,
    evaluateSellerTypeFilter,
    evaluatePriceFilter
} from '../services/discovery/DiscoveryFilterEngine.js';

test('--- TDD: PRICE PARSING, URL WHITELIST SECURITY & SELLER DISAMBIGUATION ---', async (t) => {

    await t.test('1. Price Parsing: Valid Indian real estate formats', () => {
        assert.equal(parsePriceToNumber('1.5 Cr'), 15000000);
        assert.equal(parsePriceToNumber('1.25 Crore'), 12500000);
        assert.equal(parsePriceToNumber('2.5 crores'), 25000000);
        assert.equal(parsePriceToNumber('85 Lacs'), 8500000);
        assert.equal(parsePriceToNumber('45 Lakh'), 4500000);
        assert.equal(parsePriceToNumber('50k'), 50000);
        assert.equal(parsePriceToNumber('75 thousand'), 75000);
        assert.equal(parsePriceToNumber('₹ 45,000'), 45000);
        assert.equal(parsePriceToNumber('Rs. 1,50,000'), 150000);
        assert.equal(parsePriceToNumber('INR 25,00,000'), 2500000);
        assert.equal(parsePriceToNumber('45000'), 45000);
        assert.equal(parsePriceToNumber('1500000'), 1500000);
        assert.equal(parsePriceToNumber(8500000), 8500000);
    });

    await t.test('2. Price Parsing: Reject false positives (phone numbers, sectors, non-prices)', () => {
        // Phone numbers must NEVER be parsed as prices
        assert.equal(parsePriceToNumber('Call 9876543210'), null, 'Phone number must not be parsed as price');
        assert.equal(parsePriceToNumber('Contact 9811098110 for visit'), null, 'Contact phone must not be parsed as price');
        assert.equal(parsePriceToNumber('9876543210'), null, '10-digit Indian mobile number without denomination or currency must not be parsed as price');

        // Location / Sector / Plot identifiers
        assert.equal(parsePriceToNumber('Sector 8'), null, 'Sector number must not be parsed as price');
        assert.equal(parsePriceToNumber('Plot 120 Phase 2'), null, 'Plot number must not be parsed as price');

        // Non-price strings
        assert.equal(parsePriceToNumber('Price on Request'), null);
        assert.equal(parsePriceToNumber('Call for price'), null);
        assert.equal(parsePriceToNumber('Negotiable'), null);
        assert.equal(parsePriceToNumber(''), null);
        assert.equal(parsePriceToNumber(null), null);
        assert.equal(parsePriceToNumber(undefined), null);

        // Malformed numeric strings
        assert.equal(parsePriceToNumber('-500'), null, 'Negative price must return null');
        assert.equal(parsePriceToNumber('1.2.3'), null, 'Multiple decimals must return null');
    });

    await t.test('3. URL Normalization & Whitelist Security (Lookalikes & Scheme Injection)', () => {
        const whitelist = ['99acres.com', 'magicbricks.com', 'housing.com'];

        // Legitimate URLs
        const legitimate1 = isPortalAllowed('https://www.99acres.com/3bhk-flat-gurgaon-npxid-123', whitelist);
        assert.equal(legitimate1.allowed, true);
        assert.equal(legitimate1.domain, 'www.99acres.com');

        const legitimate2 = isPortalAllowed('https://m.magicbricks.com/propertyDetails', whitelist);
        assert.equal(legitimate2.allowed, true);

        // Attack: Lookalike domain prefix / suffix
        const lookalike1 = isPortalAllowed('https://99acres.com.attacker.com/fake-deal', whitelist);
        assert.equal(lookalike1.allowed, false, 'Lookalike attacker subdomain must be blocked');
        assert.equal(lookalike1.reason, 'portal_not_in_whitelist');

        const lookalike2 = isPortalAllowed('https://fake99acres.com/property', whitelist);
        assert.equal(lookalike2.allowed, false, 'Fake domain prefix must be blocked');

        const lookalike3 = isPortalAllowed('https://notmagicbricks.com/listing', whitelist);
        assert.equal(lookalike3.allowed, false);

        // Attack: Dangerous schemes
        const badScheme1 = isPortalAllowed('javascript:alert(1)', whitelist);
        assert.equal(badScheme1.allowed, false);

        const badScheme2 = normalizeDiscoveryUrl('javascript:alert(1)');
        assert.equal(badScheme2, null, 'javascript: URLs must normalize to null');

        const badScheme3 = normalizeDiscoveryUrl('data:text/html,<script>alert(1)</script>');
        assert.equal(badScheme3, null, 'data: URLs must normalize to null');

        const badScheme4 = normalizeDiscoveryUrl('ftp://99acres.com/listing');
        assert.equal(badScheme4, null, 'ftp: URLs must normalize to null');

        // Parameter stripping & canonical equality
        const urlA = 'https://www.99acres.com/property-123?utm_source=google&utm_medium=cpc&gclid=xyz123';
        const urlB = 'https://www.99acres.com/property-123?gclid=different&fbclid=abc';
        const urlC = 'https://www.99acres.com/property-123/';

        const normA = normalizeDiscoveryUrl(urlA);
        const normB = normalizeDiscoveryUrl(urlB);
        const normC = normalizeDiscoveryUrl(urlC);

        assert.equal(normA, 'https://www.99acres.com/property-123');
        assert.equal(normB, 'https://www.99acres.com/property-123');
        assert.equal(normC, 'https://www.99acres.com/property-123');
    });

    await t.test('4. Seller-Type Disambiguation (Exclusion phrases vs Affirmative signals)', () => {
        const allowedOwnerOnly = ['owner'];
        const allowedBrokerOnly = ['broker'];

        // Case A: Owner listing containing "dealers please excuse" or "brokers excuse"
        // MUST NOT be classified as broker!
        const ownerListing1 = evaluateSellerTypeFilter(
            'Direct Owner',
            'Fully furnished 3BHK flat in Sector 48, direct from owner. Dealers please excuse.',
            allowedOwnerOnly
        );
        assert.equal(ownerListing1.detected, 'owner', 'Exclusion phrase must not trigger broker detection');
        assert.equal(ownerListing1.passed, true);

        const ownerListing2 = evaluateSellerTypeFilter(
            '',
            'Individual owner offering residential plot in Sushant Lok. Brokers excuse. No brokerage.',
            allowedOwnerOnly
        );
        assert.equal(ownerListing2.detected, 'owner');
        assert.equal(ownerListing2.passed, true);

        // Case B: Genuine broker listing
        const brokerListing = evaluateSellerTypeFilter(
            'Agent',
            'We are premier real estate consultants offering multiple options across Golf Course Road. Commission 1%.',
            allowedBrokerOnly
        );
        assert.equal(brokerListing.detected, 'broker');
        assert.equal(brokerListing.passed, true);

        // Case C: Builder listing
        const builderListing = evaluateSellerTypeFilter(
            'Developer',
            'New ultra luxury builder floor launched in DLF Phase 1. Booking open from developer.',
            ['builder']
        );
        assert.equal(builderListing.detected, 'builder');
        assert.equal(builderListing.passed, true);

        // Case D: Ambiguous listing without signals
        const ambiguousListing = evaluateSellerTypeFilter(
            '',
            'Spacious 2BHK flat available for immediate sale in South City 1.',
            allowedOwnerOnly
        );
        assert.equal(ambiguousListing.passed, null);
        assert.equal(ambiguousListing.detected, null);
        assert.equal(ambiguousListing.reason, 'unverified_seller_type');
        assert.equal(ambiguousListing.isMissingData, true);
    });
});
