import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import portalSyndicationService, { PORTALS_REGISTRY } from '../services/PortalSyndicationService.js';

describe('Portal Syndication Engine & Multi-Portal Distribution Suite', () => {

    it('1. Registry contains exactly 11 Indian property portals and strictly excludes legacy BNA', () => {
        const portalIds = Object.keys(PORTALS_REGISTRY);
        assert.equal(portalIds.length, 11, 'Should have exactly 11 registered portals');

        const expectedPortals = [
            '99acres', 'magicbricks', 'housing', 'commonfloor', 'makaan',
            'olx', 'quikr', 'proptiger', 'sulekha', 'propertyguide', 'squareyards'
        ];

        expectedPortals.forEach(id => {
            assert.ok(PORTALS_REGISTRY[id], `Portal ${id} must exist in registry`);
            assert.ok(PORTALS_REGISTRY[id].name, `Portal ${id} must have a name`);
            assert.ok(PORTALS_REGISTRY[id].method, `Portal ${id} must have a method (XML_FEED or REST_API)`);
            assert.ok(Array.isArray(PORTALS_REGISTRY[id].configFields), `Portal ${id} must specify configFields`);
        });

        // BNA must NOT be in portal syndication registry
        assert.equal(PORTALS_REGISTRY['bna'], undefined, 'BNA must not be in portal registry');
    });

    it('2. Anti-Poaching Privacy Guard masks unit #, location, and price correctly', () => {
        const rawProperty = {
            _id: '507f1f77bcf86cd799439011',
            name: 'Godrej Palm Retreat #302 Tower B',
            title: 'Tower B #302',
            unitNo: '302',
            price: 18500000,
            priceRange: '₹1.85 Cr',
            location: 'Street 4, Sector 150, Noida, UP',
            address: {
                street: 'Street 4, Near Expressway',
                landmark: 'Adjacent to Sports City',
                location: 'Sector 150, Noida',
                city: 'Noida',
                state: 'Uttar Pradesh'
            },
            googleMapsUrl: 'https://maps.google.com/?q=28.45,77.50'
        };

        const masked = portalSyndicationService._applyPrivacyMasking(rawProperty, {
            hideUnitNo: true,
            hideLocation: true,
            priceOnRequest: true
        });

        // Unit masking
        assert.equal(masked.unitNo, '[CONFIDENTIAL]');
        assert.ok(!masked.name.includes('302'), 'Unit 302 should be masked');
        assert.ok(masked.name.includes('[CONFIDENTIAL]'));

        // Location masking
        assert.equal(masked.address.street, '');
        assert.equal(masked.address.landmark, '');
        assert.equal(masked.googleMapsUrl, '');
        assert.equal(masked.address.city, 'Noida');

        // Price masking
        assert.equal(masked.price, null);
        assert.equal(masked.priceRange, 'Price on Request');
    });

    it('3. Generates compliant XML feed for 99acres with escaped entities', () => {
        const sampleListing = {
            _id: 'proj_99acres_test',
            name: 'DLF The Camellias & Luxury Golf Residences',
            description: 'Ultra-exclusive 4 BHK <Penthouses> & Suites',
            price: 55000000,
            address: {
                city: 'Gurugram',
                location: 'Golf Course Road, Sector 42',
                state: 'Haryana'
            },
            reraNumber: 'HARERA/GGM/2026/01',
            primaryImage: 'https://cdn.bharatproperties.in/camellias.jpg'
        };

        const xml = portalSyndicationService._generateXmlFeed(sampleListing, '99acres', 'project');

        assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Must have XML declaration');
        assert.ok(xml.includes('<propertyListing version="2.0" portal="99acres">'), 'Must have root element');
        assert.ok(xml.includes('&amp; Luxury Golf Residences'), 'Ampersands must be escaped');
        assert.ok(xml.includes('&lt;Penthouses&gt;'), 'Angle brackets must be escaped');
        assert.ok(xml.includes('<reraNumber>HARERA/GGM/2026/01</reraNumber>'), 'Must include RERA');
        assert.ok(xml.includes('<company>Bharat Properties</company>'), 'Must include agency name');
    });

    it('4. Formats standardized JSON payload for REST API portals', () => {
        const sampleListing = {
            _id: 'proj_magicbricks_test',
            name: 'M3M Golfestate',
            description: 'Luxury ready apartments',
            price: 32000000,
            priceRange: '₹3.20 Cr',
            address: {
                city: 'Gurgaon',
                location: 'Sector 65',
                state: 'Haryana',
                pincode: '122018'
            },
            totalUnits: 120,
            reraNumber: 'HRERA-1234'
        };

        const json = portalSyndicationService._formatJsonListing(sampleListing, 'magicbricks', 'project');

        assert.equal(json.sourceSystem, 'BharatPropertiesCRM');
        assert.equal(json.portalTarget, 'magicbricks');
        assert.equal(json.propertyType, 'NewProject');
        assert.equal(json.pricing.totalPrice, 32000000);
        assert.equal(json.location.city, 'Gurgaon');
        assert.equal(json.location.pincode, '122018');
        assert.equal(json.specifications.totalUnits, 120);
        assert.equal(json.partnerContact.brand, 'Bharat Properties');
    });

    it('5. Handles unconfigured portals gracefully without crashing', async () => {
        const sampleProperty = {
            _id: '507f1f77bcf86cd799439099',
            name: 'Test Project',
            price: 10000000
        };

        // Attempting to syndicate to 99acres and housing when no credentials configured
        const res = await portalSyndicationService.syndicate(sampleProperty, {
            portalIds: ['99acres', 'housing'],
            privacy: { hideUnitNo: true, hideLocation: false, priceOnRequest: false }
        });

        assert.ok(res.results, 'Response must have results');
        assert.ok(Array.isArray(res.results.unconfigured), 'Unconfigured array must exist');
        // Both portals report unconfigured with informative error
        assert.equal(res.results.unconfigured.length, 2);
        assert.ok(res.results.unconfigured[0].error.includes('Settings > Integrations Hub'));
    });

    it('6. Validates portal credentials via testPortalConnection and returns structured statuses', async () => {
        // Missing credentials
        const failRes = await portalSyndicationService.testPortalConnection('magicbricks', {});
        assert.equal(failRes.success, false);
        assert.ok(failRes.error.includes('Partner ID / Merchant Code is required'));

        // Valid credentials
        const passRes = await portalSyndicationService.testPortalConnection('magicbricks', {
            partnerId: 'MB-DELHI-123',
            apiKey: 'mb_api_secret_key_888'
        });
        assert.equal(passRes.success, true);
        assert.ok(passRes.message.includes('Connection validated'));

        // getPortalStatuses includes both array and map
        const statusRes = await portalSyndicationService.getPortalStatuses();
        assert.equal(statusRes.success, true);
        assert.equal(statusRes.total, 11);
        assert.ok(statusRes.statuses['99acres']);
        assert.ok(statusRes.statuses['squareyards']);
    });
});
