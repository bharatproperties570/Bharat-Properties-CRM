process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    getPortalStatuses,
    savePortalConfig,
    testPortalConnection,
    syndicateToPortals
} from '../controllers/marketing.controller.js';
import { testSocialConnection } from '../controllers/social.controller.js';
import portalSyndicationService from '../services/PortalSyndicationService.js';
import twitterService from '../services/TwitterService.js';

// Helper mock for express response
const createMockRes = () => {
    const res = {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };
    return res;
};

describe('Portal Syndication & Social REST Route Controllers Suite', () => {

    it('1. GET /api/marketing/portals/status returns 11 portals with zero BNA', async () => {
        const req = {};
        const res = createMockRes();

        await getPortalStatuses(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.total, 11);
        assert.ok(Array.isArray(res.data.portals));
        assert.equal(res.data.portals.length, 11);

        // Verify BNA is not in portals
        const hasBna = res.data.portals.some(p => p.id === 'bna');
        assert.equal(hasBna, false, 'BNA must never exist in portal registry');

        // Verify 11 portals present
        const portalIds = res.data.portals.map(p => p.id);
        const expected = [
            '99acres', 'magicbricks', 'housing', 'commonfloor', 'makaan',
            'olx', 'quikr', 'proptiger', 'sulekha', 'propertyguide', 'squareyards'
        ];
        for (const id of expected) {
            assert.ok(portalIds.includes(id), `Missing expected portal ${id}`);
        }
    });

    it('2. POST /api/marketing/portals/config validates required fields and updates config', async () => {
        // Missing fields validation
        const badReq = { body: {} };
        const badRes = createMockRes();
        await savePortalConfig(badReq, badRes);
        assert.equal(badRes.statusCode, 400);
        assert.equal(badRes.data.success, false);

        // Successful config save
        const validReq = {
            body: {
                portalId: 'squareyards',
                config: {
                    partnerId: 'SQY-ENTERPRISE-001',
                    apiKey: 'sqy_secret_auth_token_999'
                }
            }
        };
        const validRes = createMockRes();
        await savePortalConfig(validReq, validRes);
        assert.equal(validRes.statusCode, 200);
        assert.equal(validRes.data.success, true);
        assert.ok(validRes.data.message.includes('Square Yards configuration updated'));
    });

    it('3. POST /api/marketing/portals/test checks credentials verification', async () => {
        // Missing portalId
        const noIdReq = { body: {} };
        const noIdRes = createMockRes();
        await testPortalConnection(noIdReq, noIdRes);
        assert.equal(noIdRes.statusCode, 400);

        // Missing partnerId in portal test
        const noPartnerReq = {
            body: {
                portalId: 'commonfloor',
                config: { apiKey: 'some_api_key' }
            }
        };
        const noPartnerRes = createMockRes();
        await testPortalConnection(noPartnerReq, noPartnerRes);
        assert.equal(noPartnerRes.statusCode, 200);
        assert.equal(noPartnerRes.data.success, false);
        assert.ok(noPartnerRes.data.error.includes('Partner ID / Merchant Code is required'));

        // Valid test connection
        const okReq = {
            body: {
                portalId: 'commonfloor',
                config: { partnerId: 'CF-BLR-555', apiKey: 'cf_token_xyz' }
            }
        };
        const okRes = createMockRes();
        await testPortalConnection(okReq, okRes);
        assert.equal(okRes.statusCode, 200);
        assert.equal(okRes.data.success, true);
        assert.ok(okRes.data.message.includes('Connection validated for CommonFloor'));
    });

    it('4. POST /api/marketing/portals/syndicate handles direct dispatch with Anti-Poaching guard', async () => {
        const origGetConfig = portalSyndicationService.getConfig;
        const origDispatch = portalSyndicationService._dispatchToPortal;

        portalSyndicationService.getConfig = async () => ({
            '99acres': { apiKey: 'key_1', partnerId: 'part_1' },
            'magicbricks': { apiKey: 'key_2', partnerId: 'part_2' },
            'housing': { apiKey: 'key_3', partnerId: 'part_3' }
        });
        portalSyndicationService._dispatchToPortal = async (meta) => ({
            listingRef: `${meta.id.toUpperCase()}-MOCK-REF-123`
        });

        const req = {
            body: {
                id: '507f1f77bcf86cd799439011',
                type: 'project',
                portalIds: ['99acres', 'magicbricks', 'housing'],
                propertyData: {
                    _id: '507f1f77bcf86cd799439011',
                    name: 'Godrej Palm Retreat 302',
                    price: 18500000,
                    location: 'Sector 150, Noida'
                },
                privacy: {
                    hideUnitNo: true,
                    hideLocation: true,
                    priceOnRequest: true
                }
            },
            user: { _id: 'user_123', name: 'Agent Test' }
        };
        const res = createMockRes();

        try {
            await syndicateToPortals(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            assert.ok(res.data.results);
            assert.equal(res.data.results.dispatched.length, 3);
            assert.equal(res.data.results.unconfigured.length, 0);
            assert.equal(res.data.privacyApplied.hideUnitNo, true);
            assert.equal(res.data.privacyApplied.hideLocation, true);
            assert.equal(res.data.privacyApplied.priceOnRequest, true);
        } finally {
            portalSyndicationService.getConfig = origGetConfig;
            portalSyndicationService._dispatchToPortal = origDispatch;
        }

        // Test unconfigured portal graceful reporting
        const unconfReq = {
            body: {
                id: '507f1f77bcf86cd799439011',
                type: 'project',
                portalIds: ['squareyards'],
                propertyData: { name: 'Godrej Palm Retreat' }
            }
        };
        const unconfRes = createMockRes();
        await syndicateToPortals(unconfReq, unconfRes);
        assert.equal(unconfRes.statusCode, 200);
        assert.equal(unconfRes.data.success, false);
        assert.equal(unconfRes.data.results.unconfigured.length, 1);
        assert.equal(unconfRes.data.results.unconfigured[0].portalId, 'squareyards');
    });

    it('5. POST /api/social/test-connection verifies Twitter credentials format without crashing', async () => {
        // Missing Twitter credentials
        const emptyReq = {
            body: {
                platform: 'twitter',
                config: {}
            }
        };
        const emptyRes = createMockRes();
        await testSocialConnection(emptyReq, emptyRes);
        assert.equal(emptyRes.statusCode, 200);
        assert.equal(emptyRes.data.success, false);
        assert.ok(emptyRes.data.error.includes('Missing required credentials'));

        // Valid credentials format
        const mockVerify = twitterService.verifyCredentials;
        twitterService.verifyCredentials = async () => ({
            success: true,
            message: '✓ Connected to Twitter / X as @BharatPropertiesCRM'
        });

        try {
            const validReq = {
                body: {
                    platform: 'twitter',
                    config: {
                        apiKey: 'test_key',
                        apiSecret: 'test_secret',
                        accessToken: 'test_token',
                        accessTokenSecret: 'test_token_secret'
                    }
                }
            };
            const validRes = createMockRes();
            await testSocialConnection(validReq, validRes);
            assert.equal(validRes.statusCode, 200);
            assert.equal(validRes.data.success, true);
            assert.ok(validRes.data.message.includes('@BharatPropertiesCRM'));
        } finally {
            twitterService.verifyCredentials = mockVerify;
        }
    });
});
