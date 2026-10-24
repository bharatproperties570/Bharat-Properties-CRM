import test from 'node:test';
import assert from 'node:assert/strict';

import SourceAuthorizationMatrix, {
    SOURCE_TIERS,
    SOURCE_STATUS,
    authorizationGrantRegistry,
    classifySource,
    evaluateOperationAuthorization,
    isSourceAuthorized
} from '../services/discovery/SourceAuthorizationMatrix.js';

import SafeUrlFetcher, {
    safeFetchHtml,
    validateDestinationSecurity,
    isPrivateOrInternalIp,
    AuthorizationError,
    SSRFSecurityError
} from '../services/discovery/SafeUrlFetcher.js';

import publicUrlConnector from '../services/intakeConnectors/PublicUrlConnector.js';
import propertyListingConnector from '../services/intakeConnectors/PropertyListingConnector.js';
import intakeQueue, { addToIntakeQueue } from '../services/intakeQueue/IntakeQueue.js';
import Intake from '../models/Intake.js';
import ParsingRule from '../src/modules/parsing/parsingRule.model.js';

// Prevent Mongoose buffering timeout
ParsingRule.find = async () => [];

test('--- PHASE 1.2.1: SOURCE AUTHORIZATION ENFORCEMENT & SAFE FETCHING SUITE ---', async (t) => {

    // Clean any partner grants before testing
    authorizationGrantRegistry.clearAll();

    await t.test('1. Tier 1 Official API Classification & Credential Gating', () => {
        const classified = classifySource('google_index');
        assert.equal(classified.tier, SOURCE_TIERS.TIER_1_OFFICIAL_API);
        assert.equal(classified.defaultStatus, SOURCE_STATUS.AUTHORIZED);
        assert.equal(classified.technicallyAccessible, true);
        assert.equal(classified.requiresWrittenPermission, false);

        // With credentials configured
        process.env.GOOGLE_API_KEY = 'test_key';
        process.env.GOOGLE_SEARCH_ENGINE_ID = 'test_cx';
        const evalWithKeys = evaluateOperationAuthorization('google_index', 'automated_fetch');
        assert.equal(evalWithKeys.allowed, true);
        assert.equal(evalWithKeys.status, SOURCE_STATUS.AUTHORIZED);

        // Without credentials
        delete process.env.GOOGLE_API_KEY;
        delete process.env.GOOGLE_SEARCH_ENGINE_ID;
        const evalWithoutKeys = evaluateOperationAuthorization('google_index', 'automated_fetch');
        assert.equal(evalWithoutKeys.allowed, false);
        assert.equal(evalWithoutKeys.reason, 'missing_official_api_credentials');
    });

    await t.test('2. Tier 2 Public URL Handling Under Configured Policy', async () => {
        const publicUrl = 'https://kurukshetrarealestate.in/plot-details';
        const classified = classifySource(publicUrl);

        assert.equal(classified.tier, SOURCE_TIERS.TIER_2_PUBLIC_PAGE);
        assert.equal(classified.defaultStatus, SOURCE_STATUS.AUTHORIZED);
        assert.equal(classified.requiresWrittenPermission, false);

        const authDecision = evaluateOperationAuthorization(publicUrl, 'automated_fetch');
        assert.equal(authDecision.allowed, true);
        assert.equal(authDecision.status, SOURCE_STATUS.AUTHORIZED);
        assert.equal(authDecision.reason, null);
    });

    await t.test('3. Tier 3 Restricted Portal BLOCKED Before Any Network Request Without Verified Permission', async () => {
        // Ensure no grant exists
        authorizationGrantRegistry.clearAll();

        const portalUrl = 'https://www.99acres.com/property-in-sector-8-kurukshetra-spid-X123';
        const authDecision = evaluateOperationAuthorization(portalUrl, 'automated_fetch');

        assert.equal(authDecision.allowed, false);
        assert.equal(authDecision.tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
        assert.equal(authDecision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
        assert.equal(authDecision.reason, 'restricted_commercial_portal_requires_verified_permission');

        // Spy on network requests: verify Axios / network is NEVER called
        let networkFetchAttempted = false;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkFetchAttempted = true;
            throw new Error('NETWORK CALL DETECTED: Should have been blocked before network!');
        };

        try {
            const result = await publicUrlConnector.process({
                url: portalUrl,
                user_id: 'test_user',
                search_metadata: { title: 'Sector 8 Plot on 99acres' }
            });

            assert.equal(networkFetchAttempted, false, 'Network call must NEVER be made for ungranted restricted portal');
            assert.equal(result.raw_source_data.fetch_blocked, true);
            assert.equal(result.raw_source_data.fetch_block_reason, 'restricted_commercial_portal_requires_verified_permission');
            assert.equal(result.raw_source_data.source_tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
            assert.equal(result.raw_source_data.authorization_status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
            assert.equal(result.verification_status, 'unverified');
            assert.ok(result.verification_notes.some(n => n.includes('[Source Governance Blocked]')));
            assert.ok(result.duplicate_hash, 'Canonical duplicate hash must be generated for human desk indexing');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('4. Tier 3 Operation Allowed ONLY Under an Explicitly Configured & Verified Grant', async () => {
        const portalDomain = '99acres.com';
        const portalUrl = `https://www.${portalDomain}/sector-8-commercial-listing`;

        // 1. Without grant: blocked
        authorizationGrantRegistry.clearAll();
        assert.equal(evaluateOperationAuthorization(portalUrl, 'automated_fetch').allowed, false);

        // 2. Register explicit verified partner grant
        authorizationGrantRegistry.registerGrant({
            domain: portalDomain,
            grantType: 'syndication_partner',
            status: 'verified',
            agreementReference: 'AGR-99ACRES-2026',
            expiresAt: new Date(Date.now() + 86400000) // 1 day in future
        });

        const authDecision = evaluateOperationAuthorization(portalUrl, 'automated_fetch');
        assert.equal(authDecision.allowed, true);
        assert.equal(authDecision.status, SOURCE_STATUS.AUTHORIZED);
        assert.equal(authDecision.grant.agreementReference, 'AGR-99ACRES-2026');

        // 3. Test execution with mock network response
        const mockHtml = `<html><head><title>Partner Plot</title></head><body><h1>Partner Plot</h1></body></html>`;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => ({
            status: 200,
            statusText: 'OK',
            data: mockHtml,
            headers: {}
        });

        try {
            const result = await publicUrlConnector.process({
                url: portalUrl,
                user_id: 'test_user'
            });

            assert.equal(result.raw_source_data.fetch_blocked, undefined);
            assert.equal(result.raw_source_data.authorization_status, SOURCE_STATUS.AUTHORIZED);
            assert.equal(result.title, 'Partner Plot');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
            authorizationGrantRegistry.clearAll();
        }

        // 4. Once grant is cleared/revoked, it is immediately blocked again
        assert.equal(evaluateOperationAuthorization(portalUrl, 'automated_fetch').allowed, false);
    });

    await t.test('5. Tier 4 Social / Walled-Garden Sources Strictly Blocked', () => {
        const walledUrls = [
            'https://www.facebook.com/groups/realestatekurukshetra',
            'https://instagram.com/p/Cxyz123',
            'https://youtube.com/watch?v=12345',
            'https://t.me/kurukshetraplots',
            'https://telegram.org/channel/deals'
        ];

        for (const url of walledUrls) {
            const decision = evaluateOperationAuthorization(url, 'automated_fetch');
            assert.equal(decision.allowed, false);
            assert.equal(decision.tier, SOURCE_TIERS.TIER_4_WALLED_GARDEN);
            assert.equal(decision.status, SOURCE_STATUS.UNSUPPORTED_BLOCKED);
            assert.equal(decision.reason, 'walled_garden_blocked_pending_oauth');
        }
    });

    await t.test('6. Portal Whitelist Does NOT Override Authorization', () => {
        authorizationGrantRegistry.clearAll();

        const portalUrl = 'https://www.magicbricks.com/property-kurukshetra';
        
        // Simulating a DiscoveryConfig with magicbricks.com in the whitelist
        const contextWithWhitelist = {
            portal_whitelist: ['magicbricks.com', '99acres.com']
        };

        const decision = evaluateOperationAuthorization(portalUrl, 'automated_fetch', contextWithWhitelist);

        // Crucial requirement: Whitelist is a filter, not an authorization grant!
        assert.equal(decision.allowed, false);
        assert.equal(decision.tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
        assert.equal(decision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
        assert.equal(decision.reason, 'restricted_commercial_portal_requires_verified_permission');
    });

    await t.test('7. Direct Connector Calls Cannot Bypass Authorization Policy', async () => {
        authorizationGrantRegistry.clearAll();

        // Direct call to PropertyListingConnector with ungranted portal
        let networkFetchAttempted = false;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkFetchAttempted = true;
            throw new Error('NETWORK CALL DETECTED: Should have been blocked!');
        };

        try {
            const result = await propertyListingConnector.process({
                url: 'https://housing.com/in/buy/projects/12345',
                user_id: 'direct_caller'
            });

            assert.equal(networkFetchAttempted, false, 'Direct connector call must NOT bypass authorization gate');
            assert.equal(result.raw_source_data.fetch_blocked, true);
            assert.equal(result.raw_source_data.fetch_block_reason, 'restricted_commercial_portal_requires_verified_permission');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('8. Queue Entries Cannot Bypass Authorization Policy or Scheme Validation', async () => {
        // A. Walled Garden URL queued -> Rejected at queue gate
        const walledQueueRes = await addToIntakeQueue('public_url', {
            url: 'https://facebook.com/groups/kurukshetraplots',
            source: 'Web Intake'
        });
        assert.equal(walledQueueRes.success, false);
        assert.equal(walledQueueRes.reason, 'walled_garden_blocked_pending_oauth');

        // B. Unsafe scheme queued -> Rejected at queue gate
        const ftpQueueRes = await addToIntakeQueue('public_url', {
            url: 'ftp://ftp.example.com/property_list.txt',
            source: 'Web Intake'
        });
        assert.equal(ftpQueueRes.success, false);
        assert.ok(ftpQueueRes.reason.startsWith('unsafe_scheme_'));

        // C. SSRF internal IP queued -> Rejected at queue gate
        const ssrfQueueRes = await addToIntakeQueue('public_url', {
            url: 'http://127.0.0.1:8080/admin',
            source: 'Web Intake'
        });
        assert.equal(ssrfQueueRes.success, false);
        assert.equal(ssrfQueueRes.reason, 'ssrf_destination_blocked');

        // D. Cloud Metadata IP queued -> Rejected at queue gate
        const metadataQueueRes = await addToIntakeQueue('public_url', {
            url: 'http://169.254.169.254/latest/meta-data',
            source: 'Web Intake'
        });
        assert.equal(metadataQueueRes.success, false);
        assert.equal(metadataQueueRes.reason, 'ssrf_destination_blocked');
    });

    await t.test('9. SSRF Defense: Private IP, Loopback, Link-Local & Cloud Metadata Blocked', async () => {
        // Loopback IPv4
        assert.equal(isPrivateOrInternalIp('127.0.0.1'), true);
        assert.equal(isPrivateOrInternalIp('127.0.1.5'), true);
        
        // Private RFC 1918 IPv4
        assert.equal(isPrivateOrInternalIp('10.0.0.1'), true);
        assert.equal(isPrivateOrInternalIp('10.255.255.255'), true);
        assert.equal(isPrivateOrInternalIp('172.16.0.1'), true);
        assert.equal(isPrivateOrInternalIp('172.31.255.255'), true);
        assert.equal(isPrivateOrInternalIp('192.168.1.1'), true);
        assert.equal(isPrivateOrInternalIp('192.168.254.254'), true);

        // Link-Local / Cloud Metadata IPv4
        assert.equal(isPrivateOrInternalIp('169.254.169.254'), true);
        assert.equal(isPrivateOrInternalIp('169.254.1.1'), true);

        // Carrier-Grade NAT & Current Network
        assert.equal(isPrivateOrInternalIp('0.0.0.0'), true);
        assert.equal(isPrivateOrInternalIp('100.64.0.1'), true);

        // Multicast & Broadcast
        assert.equal(isPrivateOrInternalIp('224.0.0.1'), true);
        assert.equal(isPrivateOrInternalIp('255.255.255.255'), true);

        // IPv6 Loopback & Link-local
        assert.equal(isPrivateOrInternalIp('::1'), true);
        assert.equal(isPrivateOrInternalIp('::'), true);
        assert.equal(isPrivateOrInternalIp('fe80::1'), true);
        assert.equal(isPrivateOrInternalIp('fc00::1'), true);
        assert.equal(isPrivateOrInternalIp('::ffff:127.0.0.1'), true);
        assert.equal(isPrivateOrInternalIp('::ffff:169.254.169.254'), true);

        // Public IPs must NOT be flagged as private
        assert.equal(isPrivateOrInternalIp('8.8.8.8'), false);
        assert.equal(isPrivateOrInternalIp('1.1.1.1'), false);
        assert.equal(isPrivateOrInternalIp('142.250.190.46'), false);

        // Destination Security Validation
        await assert.rejects(
            async () => validateDestinationSecurity('http://127.0.0.1/secret'),
            { name: 'SSRFSecurityError' }
        );

        await assert.rejects(
            async () => validateDestinationSecurity('http://169.254.169.254/latest/meta-data'),
            { name: 'SSRFSecurityError' }
        );

        await assert.rejects(
            async () => validateDestinationSecurity('http://metadata.google.internal/computeMetadata/v1'),
            { name: 'SSRFSecurityError' }
        );

        await assert.rejects(
            async () => validateDestinationSecurity('http://localhost:3000'),
            { name: 'SSRFSecurityError' }
        );

        await assert.rejects(
            async () => validateDestinationSecurity('file:///etc/passwd'),
            { name: 'SSRFSecurityError' }
        );
    });

    await t.test('10. Safe Bounded Redirects: Redirects to Internal/Private Addresses Are Blocked', async () => {
        const originalAxiosGet = (await import('axios')).default.get;
        const dns = await import('dns');
        const originalLookup = dns.promises.lookup;

        try {
            // Stub DNS lookup so innocent-looking-site.com resolves to a public IP
            dns.promises.lookup = async (host, opts) => {
                if (host === 'innocent-looking-site.com') {
                    return [{ address: '93.184.216.34', family: 4 }];
                }
                return originalLookup(host, opts);
            };

            // Mock: first request returns 302 redirecting to internal AWS metadata service
            (await import('axios')).default.get = async (url) => {
                if (url.includes('innocent-looking-site.com')) {
                    return {
                        status: 302,
                        headers: {
                            location: 'http://169.254.169.254/latest/meta-data/'
                        }
                    };
                }
                return { status: 200, data: 'internal data' };
            };

            await assert.rejects(
                async () => safeFetchHtml('https://innocent-looking-site.com/listing'),
                (err) => {
                    assert.equal(err.name, 'SSRFSecurityError');
                    assert.ok(err.message.includes('169.254.169.254') || err.message.includes('Forbidden') || err.message.includes('blocked'));
                    return true;
                }
            );
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
            dns.promises.lookup = originalLookup;
        }
    });

    await t.test('11. Google Quota Failure Does NOT Silently Scrape an Unapproved Alternate Search Engine', async () => {
        const googleDiscoveryService = (await import('../services/discovery/GoogleDiscoveryService.js')).default;
        const DiscoveryConfig = (await import('../models/DiscoveryConfig.js')).default;

        const originalFindById = DiscoveryConfig.findById;
        const originalFallback = googleDiscoveryService.scrapeGoogleSearchFallback;

        let unapprovedScrapeAttempted = false;

        try {
            const mockConfig = {
                _id: 'mock_cfg_test_429',
                name: 'Kurukshetra Quota Safe Run',
                keywords: ['kurukshetra plots'],
                location_filters: [],
                property_types: [],
                portal_whitelist: [],
                urls_discovered_count: 0,
                save: async function() { return this; }
            };

            DiscoveryConfig.findById = async () => mockConfig;

            // Spy on fallback scraper
            googleDiscoveryService.scrapeGoogleSearchFallback = async () => {
                unapprovedScrapeAttempted = true;
                return [{ url: 'https://unapproved.com/item' }];
            };

            // Set Google API keys and mock 429 quota exhaustion
            process.env.GOOGLE_API_KEY = 'mock_key';
            process.env.GOOGLE_SEARCH_ENGINE_ID = 'mock_cx';
            delete process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER;

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
                const result = await googleDiscoveryService.runDiscovery('mock_cfg_test_429');
                assert.equal(result.success, false);
                assert.equal(result.reason, 'google_api_quota_exhausted');
                assert.equal(unapprovedScrapeAttempted, false, 'Must NOT scrape alternate search engines when unapproved');
                assert.equal(mockConfig.last_run_status, 'failed');
            } finally {
                google.customsearch = originalCustomsearch;
            }
        } finally {
            DiscoveryConfig.findById = originalFindById;
            googleDiscoveryService.scrapeGoogleSearchFallback = originalFallback;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_SEARCH_ENGINE_ID;
            delete process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER;
        }
    });

    await t.test('12. Existing WhatsApp Intake & Manual Creation Pathways Remain Completely Unaffected', async () => {
        // Stub Intake.prototype.save, Intake.findOne, and intakeQueue.add for unit test environment
        const originalSave = Intake.prototype.save;
        const originalFindOne = Intake.findOne;
        const originalQueueAdd = intakeQueue.add;

        try {
            Intake.prototype.save = async function() {
                this._id = this._id || 'mock_intake_123';
                return this;
            };
            Intake.findOne = async () => null;
            intakeQueue.add = async () => ({ id: 'mock_job_queued' });

            // WhatsApp Group deal message
            const waResult = await addToIntakeQueue('whatsapp_group', {
                text: '200 sqyd residential plot in Sector 8 Kurukshetra bayana ready',
                messageId: 'wa_msg_unique_9999',
                groupName: 'Kurukshetra Property Club'
            });

            assert.equal(waResult.success, true);
            assert.ok(waResult.intakeId);

            // Manual CRM intake entry
            const manualResult = await addToIntakeQueue('manual', {
                text: 'Direct client walking into office requesting 1 kanal plot Sector 13',
                source: 'Office Walk-in'
            });

            assert.equal(manualResult.success, true);
            assert.ok(manualResult.intakeId);
        } finally {
            Intake.prototype.save = originalSave;
            Intake.findOne = originalFindOne;
            intakeQueue.add = originalQueueAdd;
        }
    });
});
