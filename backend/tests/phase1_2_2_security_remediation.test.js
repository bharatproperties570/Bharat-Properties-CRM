import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import dns from 'node:dns';

import SourceAuthorizationMatrix, {
    SOURCE_TIERS,
    SOURCE_STATUS,
    authorizationGrantRegistry,
    domainGovernancePolicy,
    classifySource,
    evaluateOperationAuthorization,
    isSourceAuthorized
} from '../services/discovery/SourceAuthorizationMatrix.js';

import SafeUrlFetcher, {
    safeFetchHtml,
    validateDestinationSecurity,
    createPinnedAgent,
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

test('--- PHASE 1.2.2: SECURITY REMEDIATION & FINAL AUTHORIZATION GATE SUITE ---', async (t) => {

    authorizationGrantRegistry.clearAll();
    domainGovernancePolicy.reset();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. REMOVAL OF MISLEADING FALLBACK PROVIDER & ZERO UNAPPROVED SCRAPING
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('1.1 Google API Quota Exhaustion (429) Terminates Safely Without External Search Requests', async () => {
        const googleDiscoveryService = (await import('../services/discovery/GoogleDiscoveryService.js')).default;
        const DiscoveryConfig = (await import('../models/DiscoveryConfig.js')).default;

        const originalFindById = DiscoveryConfig.findById;
        let externalScrapeInvoked = false;

        const mockConfig = {
            _id: 'mock_cfg_429_safe',
            name: 'Quota Exhaustion Safety Test',
            keywords: ['kurukshetra plots'],
            location_filters: [],
            property_types: [],
            portal_whitelist: [],
            urls_discovered_count: 0,
            save: async function() { return this; }
        };

        DiscoveryConfig.findById = async () => mockConfig;
        googleDiscoveryService.processAndQueueUrl = async () => ({ queued: true });

        // Spy on fallback
        const originalFallback = googleDiscoveryService.scrapeGoogleSearchFallback;
        googleDiscoveryService.scrapeGoogleSearchFallback = async () => {
            externalScrapeInvoked = true;
            return [];
        };

        process.env.GOOGLE_API_KEY = 'mock_api_key';
        process.env.GOOGLE_SEARCH_ENGINE_ID = 'mock_cx';

        const { google } = await import('googleapis');
        const originalCustomsearch = google.customsearch;
        google.customsearch = () => ({
            cse: {
                list: async () => {
                    const err = new Error('Resource has been exhausted (e.g. check quota)');
                    err.code = 429;
                    err.status = 429;
                    throw err;
                }
            }
        });

        try {
            const result = await googleDiscoveryService.runDiscovery('mock_cfg_429_safe');

            assert.equal(result.success, false);
            assert.equal(result.reason, 'google_api_quota_exhausted');
            assert.equal(externalScrapeInvoked, false, 'No fallback search scraping may be triggered upon quota exhaustion');
            assert.equal(mockConfig.last_run_status, 'failed');
        } finally {
            google.customsearch = originalCustomsearch;
            DiscoveryConfig.findById = originalFindById;
            googleDiscoveryService.scrapeGoogleSearchFallback = originalFallback;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_SEARCH_ENGINE_ID;
        }
    });

    await t.test('1.2 Environment Flags Cannot Trigger Unapproved External Scraping', async () => {
        const googleDiscoveryService = (await import('../services/discovery/GoogleDiscoveryService.js')).default;
        const DiscoveryConfig = (await import('../models/DiscoveryConfig.js')).default;

        const originalFindById = DiscoveryConfig.findById;
        let externalRequestMade = false;

        const mockConfig = {
            _id: 'mock_cfg_flag_safety',
            name: 'Misleading Flag Test',
            keywords: ['kurukshetra land'],
            location_filters: [],
            property_types: [],
            portal_whitelist: [],
            urls_discovered_count: 0,
            save: async function() { return this; }
        };

        DiscoveryConfig.findById = async () => mockConfig;

        // Try setting misleading provider names
        const misleadingFlags = [
            'approved_partner_feed',
            'authorized_crawler',
            'yahoo_scraper',
            'bing_search',
            'true'
        ];

        for (const flagValue of misleadingFlags) {
            process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER = flagValue;
            process.env.GOOGLE_API_KEY = 'mock_key';
            process.env.GOOGLE_SEARCH_ENGINE_ID = 'mock_cx';

            const { google } = await import('googleapis');
            const originalCustomsearch = google.customsearch;
            google.customsearch = () => ({
                cse: {
                    list: async () => {
                        const err = new Error('Quota exceeded');
                        err.code = 429;
                        err.status = 429;
                        throw err;
                    }
                }
            });

            googleDiscoveryService.scrapeGoogleSearchFallback = async () => {
                externalRequestMade = true;
                return [];
            };

            try {
                const result = await googleDiscoveryService.runDiscovery('mock_cfg_flag_safety');
                assert.equal(result.success, false);
                assert.equal(result.reason, 'google_api_quota_exhausted');
                assert.equal(externalRequestMade, false, `Flag ${flagValue} must NOT trigger unapproved external requests`);
            } finally {
                google.customsearch = originalCustomsearch;
                delete process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER;
                delete process.env.GOOGLE_API_KEY;
                delete process.env.GOOGLE_SEARCH_ENGINE_ID;
            }
        }

        DiscoveryConfig.findById = originalFindById;
    });

    await t.test('1.3 Missing Google API Credentials Fails Closed Safely Without Scraping', async () => {
        const googleDiscoveryService = (await import('../services/discovery/GoogleDiscoveryService.js')).default;
        const DiscoveryConfig = (await import('../models/DiscoveryConfig.js')).default;

        const originalFindById = DiscoveryConfig.findById;
        let fallbackCalled = false;

        const mockConfig = {
            _id: 'mock_cfg_missing_creds',
            name: 'Missing Credentials Test',
            keywords: ['kurukshetra sector 8'],
            urls_discovered_count: 0,
            save: async function() { return this; }
        };

        DiscoveryConfig.findById = async () => mockConfig;
        googleDiscoveryService.scrapeGoogleSearchFallback = async () => {
            fallbackCalled = true;
            return [];
        };

        delete process.env.GOOGLE_API_KEY;
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.GOOGLE_SEARCH_ENGINE_ID;
        delete process.env.DISCOVERY_APPROVED_FALLBACK_PROVIDER;

        try {
            const result = await googleDiscoveryService.runDiscovery('mock_cfg_missing_creds');
            assert.equal(result.success, false);
            assert.equal(result.reason, 'google_api_unconfigured');
            assert.equal(fallbackCalled, false, 'Unconfigured API must halt safely without fallback scraping');
            assert.equal(mockConfig.last_run_status, 'failed');
        } finally {
            DiscoveryConfig.findById = originalFindById;
        }
    });

    await t.test('1.4 Decommissioned scrapeGoogleSearchFallback Always Returns Empty Without Network Calls', async () => {
        const googleDiscoveryService = (await import('../services/discovery/GoogleDiscoveryService.js')).default;
        
        let networkCalled = false;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkCalled = true;
            throw new Error('NETWORK CALL DETECTED: scrapeGoogleSearchFallback must make zero network requests');
        };

        try {
            const results = await googleDiscoveryService.scrapeGoogleSearchFallback('test query');
            assert.deepEqual(results, []);
            assert.equal(networkCalled, false, 'scrapeGoogleSearchFallback must NOT attempt any network connections');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. DNS REBINDING (TOCTOU) CLOSURE & PINNED CONNECTION AGENT
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('2.1 DNS Rebinding Defense: Connection Aborts if DNS Changes to Private IP at Socket Time', async () => {
        const targetHost = 'dynamic-rebind-host.com';
        const publicIp = '93.184.216.34';
        const rebindingPrivateIp = '127.0.0.1';

        // Create pinned agent pointing to publicIp
        const pinnedAgent = createPinnedAgent('http:', targetHost, publicIp, 4);

        // Simulate DNS answer rebinding at socket connection time:
        // dns.lookup now returns rebindingPrivateIp instead of publicIp
        const originalDnsLookup = dns.lookup;
        dns.lookup = (host, opts, callback) => {
            if (host === targetHost) {
                // Rebound to private loopback IP!
                return callback(null, [{ address: rebindingPrivateIp, family: 4 }]);
            }
            return originalDnsLookup(host, opts, callback);
        };

        try {
            // The agent's custom lookup MUST catch this rebinding and reject with SSRFSecurityError
            await new Promise((resolve, reject) => {
                pinnedAgent.options.lookup(targetHost, {}, (err, address, family) => {
                    if (err) return resolve(err); // Rejection is expected!
                    reject(new Error(`VULNERABILITY: Pinned agent allowed connection to rebound address: ${address}`));
                });
            }).then((err) => {
                assert.ok(err instanceof SSRFSecurityError, `Expected SSRFSecurityError, got ${err?.name}`);
                assert.ok(
                    err.message.includes('DNS rebinding detected') || err.message.includes('private'),
                    `Unexpected error message: ${err.message}`
                );
            });
        } finally {
            dns.lookup = originalDnsLookup;
        }
    });

    await t.test('2.2 Connection Pinning: Socket Connects Strictly to Validated Pinned IP', async () => {
        const targetHost = 'verified-listing-domain.com';
        const validatedPublicIp = '142.250.190.46';

        const pinnedAgent = createPinnedAgent('https:', targetHost, validatedPublicIp, 4);

        const originalDnsLookup = dns.lookup;
        // Mock live lookup returning matching validated IP
        dns.lookup = (host, opts, callback) => {
            if (host === targetHost) {
                return callback(null, [{ address: validatedPublicIp, family: 4 }]);
            }
            return originalDnsLookup(host, opts, callback);
        };

        try {
            await new Promise((resolve, reject) => {
                pinnedAgent.options.lookup(targetHost, {}, (err, address, family) => {
                    if (err) return reject(err);
                    assert.equal(address, validatedPublicIp, 'Socket must connect to the exact pinned IP');
                    assert.equal(family, 4);
                    resolve();
                });
            });
        } finally {
            dns.lookup = originalDnsLookup;
        }
    });

    await t.test('2.3 Multiple DNS Answers with Mixed Public/Private IPs Are Strictly Rejected', async () => {
        const targetHost = 'mixed-dns-answers.com';
        const originalDnsLookupPromises = dns.promises.lookup;

        dns.promises.lookup = async (host, opts) => {
            if (host === targetHost) {
                return [
                    { address: '93.184.216.34', family: 4 }, // Public
                    { address: '192.168.1.50', family: 4 }   // Private RFC 1918!
                ];
            }
            return originalDnsLookupPromises(host, opts);
        };

        try {
            await assert.rejects(
                async () => validateDestinationSecurity(`http://${targetHost}/listing`),
                (err) => {
                    assert.equal(err.name, 'SSRFSecurityError');
                    assert.ok(err.message.includes('forbidden private IP') || err.message.includes('192.168.1.50'));
                    return true;
                }
            );
        } finally {
            dns.promises.lookup = originalDnsLookupPromises;
        }
    });

    await t.test('2.4 IPv4-Mapped IPv6 Internal Addresses Are Identified and Blocked', () => {
        assert.equal(isPrivateOrInternalIp('::ffff:127.0.0.1'), true);
        assert.equal(isPrivateOrInternalIp('::ffff:169.254.169.254'), true);
        assert.equal(isPrivateOrInternalIp('::ffff:10.0.0.1'), true);
        assert.equal(isPrivateOrInternalIp('::ffff:172.16.0.1'), true);
        assert.equal(isPrivateOrInternalIp('::ffff:192.168.1.1'), true);
        assert.equal(isPrivateOrInternalIp('::ffff:100.64.0.1'), true);

        // Public mapped IPv6
        assert.equal(isPrivateOrInternalIp('::ffff:8.8.8.8'), false);
        assert.equal(isPrivateOrInternalIp('::ffff:93.184.216.34'), false);
    });

    await t.test('2.5 Safe Bounded Redirects Block Redirects to Internal Metadata or Unauthorized Portals', async () => {
        const originalAxiosGet = (await import('axios')).default.get;
        const originalDnsPromises = dns.promises.lookup;

        dns.promises.lookup = async (host, opts) => {
            if (host === 'public-domain.com') {
                return [{ address: '93.184.216.34', family: 4 }];
            }
            return originalDnsPromises(host, opts);
        };

        try {
            // Scenario A: Redirect to Cloud Metadata IP (169.254.169.254)
            (await import('axios')).default.get = async (url) => {
                if (url.includes('public-domain.com')) {
                    return {
                        status: 302,
                        headers: { location: 'http://169.254.169.254/latest/meta-data/' }
                    };
                }
                return { status: 200, data: 'metadata' };
            };

            await assert.rejects(
                async () => safeFetchHtml('http://public-domain.com/redirect-test'),
                (err) => {
                    assert.equal(err.name, 'SSRFSecurityError');
                    assert.ok(err.message.includes('169.254.169.254') || err.message.includes('Forbidden') || err.message.includes('blocked'));
                    return true;
                }
            );

            // Scenario B: Redirect to Restricted Portal (99acres) without grant
            (await import('axios')).default.get = async (url) => {
                if (url.includes('public-domain.com')) {
                    return {
                        status: 302,
                        headers: { location: 'https://www.99acres.com/sector-8-commercial-listing' }
                    };
                }
                return { status: 200, data: 'listing' };
            };

            await assert.rejects(
                async () => safeFetchHtml('http://public-domain.com/redirect-to-portal'),
                (err) => {
                    assert.equal(err.name, 'AuthorizationError');
                    assert.ok(err.message.includes('restricted_commercial_portal_requires_verified_permission'));
                    return true;
                }
            );
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
            dns.promises.lookup = originalDnsPromises;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. SOURCE AUTHORIZATION & GRANT LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('3.1 Tier 3 Portals Remain Strictly Blocked Without Verified Grant', () => {
        authorizationGrantRegistry.clearAll();

        const portals = [
            'https://www.99acres.com/plot-in-kurukshetra',
            'https://magicbricks.com/property/1234',
            'https://housing.com/in/buy/plot/567',
            'https://www.olx.in/item/plot-890'
        ];

        for (const url of portals) {
            const decision = evaluateOperationAuthorization(url, 'automated_fetch');
            assert.equal(decision.allowed, false);
            assert.equal(decision.tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
            assert.equal(decision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
            assert.equal(isSourceAuthorized(url), false);
        }
    });

    await t.test('3.2 Portal Whitelist Never Grants Authorization', () => {
        authorizationGrantRegistry.clearAll();

        const portalUrl = 'https://www.99acres.com/sector-8-plot';
        const context = { portal_whitelist: ['99acres.com', 'magicbricks.com'] };

        const decision = evaluateOperationAuthorization(portalUrl, 'automated_fetch', context);
        assert.equal(decision.allowed, false, 'portal_whitelist must not grant authorization');
        assert.equal(decision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
    });

    await t.test('3.3 Registering a Verified Grant Authorizes Fetch; Revoking Blocks Immediately', () => {
        const portalDomain = 'magicbricks.com';
        const portalUrl = `https://www.${portalDomain}/property-kurukshetra-123`;

        authorizationGrantRegistry.clearAll();

        // 1. Initial state: Blocked
        assert.equal(evaluateOperationAuthorization(portalUrl, 'automated_fetch').allowed, false);

        // 2. Register verified grant
        authorizationGrantRegistry.registerGrant({
            domain: portalDomain,
            grantType: 'syndication_partner',
            status: 'verified',
            agreementReference: 'AGR-MB-2026-KURUKSHETRA'
        });

        const activeDecision = evaluateOperationAuthorization(portalUrl, 'automated_fetch');
        assert.equal(activeDecision.allowed, true);
        assert.equal(activeDecision.status, SOURCE_STATUS.AUTHORIZED);
        assert.equal(activeDecision.grant.agreementReference, 'AGR-MB-2026-KURUKSHETRA');

        // 3. Revoke grant
        authorizationGrantRegistry.revokeGrant(portalDomain);

        const revokedDecision = evaluateOperationAuthorization(portalUrl, 'automated_fetch');
        assert.equal(revokedDecision.allowed, false, 'Revoked grant must immediately block subsequent operations');
        assert.equal(revokedDecision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
    });

    await t.test('3.4 Expired Partner Grants Are Immediately Treated as Invalid', () => {
        const portalDomain = 'housing.com';
        const portalUrl = `https://${portalDomain}/in/buy/projects/555`;

        authorizationGrantRegistry.clearAll();

        // Register grant with expiration in the PAST
        authorizationGrantRegistry.registerGrant({
            domain: portalDomain,
            grantType: 'syndication_partner',
            status: 'verified',
            agreementReference: 'AGR-EXPIRED-2025',
            expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
        });

        const decision = evaluateOperationAuthorization(portalUrl, 'automated_fetch');
        assert.equal(decision.allowed, false, 'Expired grant must not allow automated fetch');
        assert.equal(decision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
    });

    await t.test('3.5 Conservative Domain Verification Policy Holds Unknown Domains for Review in Discovery', () => {
        const unknownUrl = 'https://unknown-broker-portal-kurukshetra.com/listing-123';

        domainGovernancePolicy.reset();

        // In automated discovery with strict domain verification enabled:
        const discoveryContext = {
            source: 'google_discovery',
            requireDomainVerification: true
        };

        const decision = evaluateOperationAuthorization(unknownUrl, 'automated_fetch', discoveryContext);
        assert.equal(decision.allowed, false, 'Unknown domain in automated discovery must be held for review');
        assert.equal(decision.reason, 'unverified_domain_requires_human_verification');

        // Verify domain in policy -> now allowed
        domainGovernancePolicy.addVerifiedDomain('unknown-broker-portal-kurukshetra.com');
        const approvedDecision = evaluateOperationAuthorization(unknownUrl, 'automated_fetch', discoveryContext);
        assert.equal(approvedDecision.allowed, true);

        // User-submitted single URL in CRM (not background discovery) is permitted under safe fetch controls
        const operatorContext = { isUserSubmitted: true };
        const operatorDecision = evaluateOperationAuthorization(unknownUrl, 'automated_fetch', operatorContext);
        assert.equal(operatorDecision.allowed, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. PRE-FLIGHT BOUNDARIES & INTAKE PRESERVATION
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('4.1 Blocked Portals Preserve Metadata on Deal Intake Desk Without Touching Network', async () => {
        authorizationGrantRegistry.clearAll();

        let networkAttempted = false;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkAttempted = true;
            throw new Error('NETWORK CALL DETECTED: Blocked portal must never initiate an HTTP request');
        };

        try {
            const inputData = {
                url: 'https://www.99acres.com/unverified-plot-sector-8',
                user_id: 'test_operator',
                search_metadata: {
                    title: '250 Sqyd Plot Sector 8 Kurukshetra',
                    publishedDate: '2026-10-24T00:00:00Z',
                    discoveredAt: '2026-10-24T05:00:00Z'
                }
            };

            const result = await publicUrlConnector.process(inputData);

            assert.equal(networkAttempted, false, 'Zero network access must occur');
            assert.equal(result.raw_source_data.fetch_blocked, true);
            assert.equal(result.raw_source_data.fetch_block_reason, 'restricted_commercial_portal_requires_verified_permission');
            assert.equal(result.raw_source_data.source_tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
            assert.equal(result.verification_status, 'unverified');
            assert.equal(result.title, '250 Sqyd Plot Sector 8 Kurukshetra');
            assert.ok(result.verification_notes.some(n => n.includes('[Source Governance Blocked]')));
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('4.2 Queue Gate Enforces Immediate Rejection for SSRF Targets & Malicious Schemes', async () => {
        // SSRF Target: 169.254.169.254
        const metadataRes = await addToIntakeQueue('public_url', {
            url: 'http://169.254.169.254/latest/meta-data/',
            source: 'Web Intake'
        });
        assert.equal(metadataRes.success, false);
        assert.equal(metadataRes.reason, 'ssrf_destination_blocked');

        // Dangerous Scheme: file://
        const fileRes = await addToIntakeQueue('public_url', {
            url: 'file:///etc/shadow',
            source: 'Web Intake'
        });
        assert.equal(fileRes.success, false);
        assert.ok(fileRes.reason.startsWith('unsafe_scheme_'));

        // Walled Garden: Facebook Group
        const fbRes = await addToIntakeQueue('public_url', {
            url: 'https://facebook.com/groups/realestatekurukshetra',
            source: 'Web Intake'
        });
        assert.equal(fbRes.success, false);
        assert.equal(fbRes.reason, 'walled_garden_blocked_pending_oauth');
    });

    await t.test('4.3 Existing WhatsApp & Manual Intakes Remain Completely Unaffected', async () => {
        const originalSave = Intake.prototype.save;
        const originalFindOne = Intake.findOne;
        const originalQueueAdd = intakeQueue.add;

        try {
            Intake.prototype.save = async function() {
                this._id = this._id || 'mock_intake_p122';
                return this;
            };
            Intake.findOne = async () => null;
            intakeQueue.add = async () => ({ id: 'mock_job_queued' });

            // WhatsApp Group intake
            const waRes = await addToIntakeQueue('whatsapp_group', {
                text: 'Direct owner: 1 kanal east facing plot Sector 13 Kurukshetra bayana ready',
                messageId: 'wa_msg_p122_unique',
                groupName: 'Kurukshetra Investors Club'
            });
            assert.equal(waRes.success, true);
            assert.ok(waRes.intakeId);

            // Manual CRM intake
            const manualRes = await addToIntakeQueue('manual', {
                text: 'Walk-in buyer inquiry for 250 sqyd Sector 7',
                source: 'Office Walk-in'
            });
            assert.equal(manualRes.success, true);
            assert.ok(manualRes.intakeId);
        } finally {
            Intake.prototype.save = originalSave;
            Intake.findOne = originalFindOne;
            intakeQueue.add = originalQueueAdd;
        }
    });

    authorizationGrantRegistry.clearAll();
    domainGovernancePolicy.reset();
});
