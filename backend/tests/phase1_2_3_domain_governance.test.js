import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import net from 'net';
import dns from 'dns';
import mongoose from 'mongoose';

import SourceAuthorizationMatrix, {
    SOURCE_TIERS,
    SOURCE_STATUS,
    domainGovernancePolicy,
    DomainGovernancePolicy,
    authorizationGrantRegistry,
    classifySource,
    evaluateOperationAuthorization,
    isSourceAuthorized,
    extractCleanDomain
} from '../services/discovery/SourceAuthorizationMatrix.js';

import {
    safeFetchHtml,
    validateDestinationSecurity,
    createPinnedAgent,
    AuthorizationError,
    SSRFSecurityError
} from '../services/discovery/SafeUrlFetcher.js';

import publicUrlConnector from '../services/intakeConnectors/PublicUrlConnector.js';
import propertyListingConnector from '../services/intakeConnectors/PropertyListingConnector.js';
import googleDiscoveryService from '../services/discovery/GoogleDiscoveryService.js';
import intakeQueue, { addToIntakeQueue } from '../services/intakeQueue/IntakeQueue.js';
import Intake from '../models/Intake.js';
import ParsingRule from '../src/modules/parsing/parsingRule.model.js';

// Prevent Mongoose buffering timeout during unit tests
ParsingRule.find = async () => [];

test('--- PHASE 1.2.3: MANDATORY DOMAIN GOVERNANCE AT EVERY FETCH BOUNDARY ---', async (t) => {

    const originalFindOne = Intake.findOne;
    const originalFindById = Intake.findById;
    const originalSave = Intake.prototype.save;
    const originalDnsLookup = dns.promises.lookup;
    const originalQueueAdd = intakeQueue.add;

    const savedIntakeDocs = new Map();

    t.beforeEach(() => {
        domainGovernancePolicy.reset();
        authorizationGrantRegistry.clearAll();
        savedIntakeDocs.clear();

        // Stub queue dispatch to prevent offline worker buffering
        intakeQueue.add = async () => ({ id: 'mock_job_123' });

        // In-memory Intake stubs for standalone deterministic testing
        Intake.prototype.save = async function() {
            if (!this._id) {
                this._id = new mongoose.Types.ObjectId();
            }
            savedIntakeDocs.set(String(this._id), this);
            return this;
        };

        Intake.findOne = async (query) => {
            return null; // No duplicate found by default
        };

        Intake.findById = async (id) => {
            return savedIntakeDocs.get(String(id)) || null;
        };

        // Default DNS stub: maps hostnames to safe public IP
        dns.promises.lookup = async (host, opts) => {
            if (host === '169.254.169.254') return [{ address: '169.254.169.254', family: 4 }];
            if (host === '127.0.0.1' || host === 'localhost') return [{ address: '127.0.0.1', family: 4 }];
            return [{ address: '93.184.216.34', family: 4 }];
        };
    });

    t.afterEach(() => {
        domainGovernancePolicy.reset();
        authorizationGrantRegistry.clearAll();
        savedIntakeDocs.clear();

        Intake.findOne = originalFindOne;
        Intake.findById = originalFindById;
        Intake.prototype.save = originalSave;
        dns.promises.lookup = originalDnsLookup;
        intakeQueue.add = originalQueueAdd;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. POLICY LAYER: SECURE-BY-DEFAULT DOMAIN GOVERNANCE
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('1. Unknown Tier 2 Domain Is Blocked by Default for Automated Fetching', () => {
        const unknownUrl = 'https://unregistered-brokerage.in/plot-for-sale-123';
        
        // No special flags or context passed — default invocation must be secure
        const authDecision = evaluateOperationAuthorization(unknownUrl, 'automated_fetch');
        
        assert.equal(authDecision.allowed, false, 'Unknown domain must be blocked by default');
        assert.equal(authDecision.tier, SOURCE_TIERS.TIER_2_PUBLIC_PAGE);
        assert.equal(authDecision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
        assert.equal(authDecision.reason, 'unverified_domain_requires_human_verification');
        assert.equal(authDecision.domain, 'unregistered-brokerage.in');

        // isSourceAuthorized helper must return false
        assert.equal(isSourceAuthorized(unknownUrl, 'automated_fetch'), false);
    });

    await t.test('2. Operator Verification Workflow: Registered and Approved Tier 2 Domain Can Fetch Under Policy', () => {
        const domain = 'kurukshetra-local-deals.com';
        const testUrl = `https://${domain}/verified-plot-deal`;

        // 1. Initially unverified
        assert.equal(evaluateOperationAuthorization(testUrl, 'automated_fetch').allowed, false);

        // 2. Operator registers and approves domain
        const registered = domainGovernancePolicy.registerDomain(domain, {
            approvedBy: 'operator_admin_42',
            notes: 'Verified local broker website with valid Haryana RERA registration'
        });
        assert.equal(registered, true);

        // 3. Inspect audit record
        const record = domainGovernancePolicy.getDomainRecord(domain);
        assert.ok(record);
        assert.equal(record.domain, domain);
        assert.equal(record.status, 'approved');
        assert.equal(record.approvedBy, 'operator_admin_42');
        assert.ok(record.approvedAt instanceof Date);
        assert.ok(record.notes.includes('RERA'));

        // 4. Now authorized for automated fetch
        const authDecision = evaluateOperationAuthorization(testUrl, 'automated_fetch');
        assert.equal(authDecision.allowed, true);
        assert.equal(authDecision.status, SOURCE_STATUS.AUTHORIZED);
        assert.equal(authDecision.reason, null);

        // Subdomain of approved domain is also authorized
        const subUrl = `https://plots.${domain}/sector-7-plot`;
        assert.equal(evaluateOperationAuthorization(subUrl, 'automated_fetch').allowed, true);
    });

    await t.test('3. Revocation or Removal of Domain Approval Blocks Subsequent Requests Immediately', () => {
        const domain = 'temporary-partner-portal.in';
        const testUrl = `https://${domain}/property-listing`;

        // 1. Approve domain
        domainGovernancePolicy.registerDomain(domain, { approvedBy: 'lead_operator' });
        assert.equal(evaluateOperationAuthorization(testUrl, 'automated_fetch').allowed, true);

        // 2. Operator revokes domain approval
        const revoked = domainGovernancePolicy.revokeDomain(domain, {
            revokedBy: 'compliance_officer',
            reason: 'Website terms of service updated or domain lapsed'
        });
        assert.equal(revoked, true);

        // 3. Inspect revocation record
        const record = domainGovernancePolicy.getDomainRecord(domain);
        assert.equal(record.status, 'revoked');
        assert.equal(record.revokedBy, 'compliance_officer');
        assert.equal(record.revocationReason, 'Website terms of service updated or domain lapsed');

        // 4. Evaluator must now block the domain
        const revokedDecision = evaluateOperationAuthorization(testUrl, 'automated_fetch');
        assert.equal(revokedDecision.allowed, false);
        assert.equal(revokedDecision.reason, 'unverified_domain_requires_human_verification');

        // 5. Test complete removal
        domainGovernancePolicy.removeVerifiedDomain(domain);
        assert.equal(domainGovernancePolicy.isDomainVerified(domain), false);
        assert.equal(evaluateOperationAuthorization(testUrl, 'automated_fetch').allowed, false);
    });

    await t.test('4. Portal Whitelist Alone Never Grants Authorization', () => {
        const portalUrl = 'https://www.99acres.com/sector-8-commercial-listing';

        // Operator has configured 99acres.com in whitelist filter
        const contextWithWhitelist = {
            portal_whitelist: ['99acres.com'],
            allowedDomains: ['99acres.com'],
            isWhitelisted: true
        };

        const decision = evaluateOperationAuthorization(portalUrl, 'automated_fetch', contextWithWhitelist);
        assert.equal(decision.allowed, false, 'Portal whitelist must not grant authorization');
        assert.equal(decision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
        assert.equal(decision.reason, 'restricted_commercial_portal_requires_verified_permission');
    });

    await t.test('5. Tier 3 Commercial Portals Strictly Blocked Without Verified Partner Grant', () => {
        const portals = [
            'https://www.99acres.com/property-in-sector-8-kurukshetra',
            'https://magicbricks.com/propertyDetails/1234',
            'https://housing.com/in/buy/projects/page/567',
            'https://www.olx.in/item/plot-for-sale-iid-890',
            'https://squareyards.com/property-kurukshetra'
        ];

        for (const url of portals) {
            const decision = evaluateOperationAuthorization(url, 'automated_fetch');
            assert.equal(decision.allowed, false, `Portal ${url} must be blocked without grant`);
            assert.equal(decision.tier, SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL);
            assert.equal(decision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
        }

        // Tier 3 only authorized if active grant is registered
        authorizationGrantRegistry.registerGrant({
            domain: 'squareyards.com',
            grantType: 'syndication_partner',
            status: 'verified'
        });
        const grantedDecision = evaluateOperationAuthorization('https://squareyards.com/property-kurukshetra', 'automated_fetch');
        assert.equal(grantedDecision.allowed, true);
    });

    await t.test('6. Tier 4 Social / Walled Gardens Strictly Blocked From Automated Web Fetching', () => {
        const walledGardens = [
            'https://www.facebook.com/groups/kurukshetraplots',
            'https://instagram.com/p/Cxyz123',
            'https://linkedin.com/posts/realestate-update',
            'https://t.me/realestatekurukshetra',
            'https://reddit.com/r/realestate'
        ];

        for (const url of walledGardens) {
            const decision = evaluateOperationAuthorization(url, 'automated_fetch');
            assert.equal(decision.allowed, false);
            assert.equal(decision.tier, SOURCE_TIERS.TIER_4_WALLED_GARDEN);
            assert.equal(decision.status, SOURCE_STATUS.UNSUPPORTED_BLOCKED);
            assert.equal(decision.reason, 'walled_garden_blocked_pending_oauth');
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. NETWORK ENTRY POINTS & PRE-FLIGHT INTEGRATION
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('7. Direct Connector Invocations Cannot Bypass Domain Governance (Zero Network Requests)', async () => {
        const unknownUrl = 'https://unapproved-direct-connector.com/plot-for-sale';
        let networkAttempted = false;

        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkAttempted = true;
            throw new Error('NETWORK CALL DETECTED: Unapproved domain must never initiate HTTP request');
        };

        try {
            // PublicUrlConnector test
            const publicResult = await publicUrlConnector.process({
                url: unknownUrl,
                search_metadata: { title: 'Direct Connector Plot' }
            });

            assert.equal(networkAttempted, false, 'PublicUrlConnector must not touch network');
            assert.equal(publicResult.raw_source_data.fetch_blocked, true);
            assert.equal(publicResult.raw_source_data.fetch_block_reason, 'unverified_domain_requires_human_verification');
            assert.equal(publicResult.verification_status, 'unverified');
            assert.ok(publicResult.raw_source_data.url.includes('unapproved-direct-connector.com'));

            // PropertyListingConnector test
            const listingResult = await propertyListingConnector.process({
                url: unknownUrl,
                search_metadata: { title: 'Direct Listing Candidate' }
            });

            assert.equal(networkAttempted, false, 'PropertyListingConnector must not touch network');
            assert.equal(listingResult.raw_source_data.fetch_blocked, true);
            assert.equal(listingResult.raw_source_data.fetch_block_reason, 'unverified_domain_requires_human_verification');
            assert.equal(listingResult.verification_status, 'unverified');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('8. Queue Admission Cannot Bypass Domain Governance (Preserved Without Network Fetch)', async () => {
        const unapprovedUrl = 'https://unknown-broker-intake.org/exclusive-residential-plot';

        let networkAttempted = false;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkAttempted = true;
            throw new Error('NETWORK CALL DETECTED: Queue admission must not fetch unapproved domain');
        };

        try {
            const queueRes = await addToIntakeQueue('public_url', {
                url: unapprovedUrl,
                title: 'Sector 4 Corner Plot',
                search_metadata: {
                    title: 'Sector 4 Corner Plot',
                    snippet: 'Prime location plot 300 sqyd',
                    discoveredAt: '2026-10-24T10:00:00.000Z'
                }
            }, null);

            assert.equal(networkAttempted, false, 'No HTTP request on queue admission');
            assert.equal(queueRes.success, true);
            assert.equal(queueRes.heldForReview, true);
            assert.equal(queueRes.fetchBlocked, true);
            assert.equal(queueRes.reason, 'unverified_domain_requires_human_verification');
            assert.ok(queueRes.intakeId);

            // Verify the intake document was saved in database with complete candidate provenance
            const savedIntake = await Intake.findById(queueRes.intakeId);
            assert.ok(savedIntake);
            assert.equal(savedIntake.status, 'Needs Review');
            assert.equal(savedIntake.verification_status, 'unverified');
            assert.equal(savedIntake.raw_source_data.fetch_blocked, true);
            assert.equal(savedIntake.raw_source_data.fetch_block_reason, 'unverified_domain_requires_human_verification');
            assert.equal(savedIntake.raw_source_data.originalTitle, 'Sector 4 Corner Plot');
            assert.ok(savedIntake.raw_source_data.url.includes('unknown-broker-intake.org'));
            assert.ok(savedIntake.verification_notes[0].includes('Queue Admission Governance Gate'));
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('9. Google Discovery API Results Preserve Unapproved Candidates Without Network Fetching', async () => {
        const candidateUrl = 'https://unknown-local-paper.in/realestate-classifieds/sector-2-plot';
        const mockConfig = {
            _id: 'cfg_discovery_test_1',
            name: 'Kurukshetra Plots Discovery',
            portal_whitelist: []
        };

        let networkAttempted = false;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkAttempted = true;
            throw new Error('NETWORK CALL DETECTED: Discovered candidates must not be automatically fetched without domain verification');
        };

        try {
            const queueResult = await googleDiscoveryService.processAndQueueUrl(candidateUrl, mockConfig, {
                title: 'East Facing 200 Sqyd Plot in Sector 2',
                snippet: 'Owner urgent sale near Brahma Sarovar',
                publishedDate: '2026-10-20'
            });

            assert.equal(networkAttempted, false, 'Candidate discovery must not fetch the page HTML');
            assert.equal(queueResult.queued, true);
            assert.equal(queueResult.heldForReview, true);
            assert.equal(queueResult.fetchBlocked, true);
            assert.equal(queueResult.reason, 'unverified_domain_requires_human_verification');

            // Verify stored document
            const intakeDoc = await Intake.findById(queueResult.intakeId);
            assert.ok(intakeDoc);
            assert.equal(intakeDoc.status, 'Needs Review');
            assert.equal(intakeDoc.raw_source_data.originalTitle, 'East Facing 200 Sqyd Plot in Sector 2');
            assert.equal(intakeDoc.raw_source_data.fetch_blocked, true);
            assert.equal(intakeDoc.raw_source_data.published_date, '2026-10-20');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('10. Every Redirect Rechecks Both Domain Authorization and SSRF Controls', async () => {
        const approvedInitialDomain = 'kurukshetrarealestate.in'; // In system baseline
        const initialUrl = `https://${approvedInitialDomain}/listing-entry`;

        const originalAxiosGet = (await import('axios')).default.get;

        try {
            // Scenario 1: Redirect from approved domain to unapproved Tier 2 domain
            (await import('axios')).default.get = async (url) => {
                if (url.includes(approvedInitialDomain)) {
                    return {
                        status: 302,
                        headers: { location: 'https://unverified-third-party.com/plot-details' }
                    };
                }
                return { status: 200, data: '<html><body>Plot</body></html>' };
            };

            await assert.rejects(
                async () => safeFetchHtml(initialUrl),
                (err) => {
                    assert.equal(err.name, 'AuthorizationError');
                    assert.ok(err.message.includes('unverified_domain_requires_human_verification'));
                    return true;
                },
                'Redirect to unapproved domain must be blocked by domain governance'
            );

            // Scenario 2: Redirect from approved domain to Tier 3 commercial portal without grant
            (await import('axios')).default.get = async (url) => {
                if (url.includes(approvedInitialDomain)) {
                    return {
                        status: 302,
                        headers: { location: 'https://www.99acres.com/sector-8-plot' }
                    };
                }
                return { status: 200, data: '<html><body>Plot</body></html>' };
            };

            await assert.rejects(
                async () => safeFetchHtml(initialUrl),
                (err) => {
                    assert.equal(err.name, 'AuthorizationError');
                    assert.ok(err.message.includes('restricted_commercial_portal_requires_verified_permission'));
                    return true;
                },
                'Redirect to Tier 3 portal without grant must be blocked'
            );

            // Scenario 3: Redirect from approved domain to Cloud Metadata IP (SSRF)
            (await import('axios')).default.get = async (url) => {
                if (url.includes(approvedInitialDomain)) {
                    return {
                        status: 302,
                        headers: { location: 'http://169.254.169.254/latest/meta-data/' }
                    };
                }
                return { status: 200, data: '<html><body>Plot</body></html>' };
            };

            await assert.rejects(
                async () => safeFetchHtml(initialUrl),
                (err) => {
                    assert.equal(err.name, 'SSRFSecurityError');
                    assert.ok(err.message.includes('169.254.169.254') || err.message.includes('private or internal IP'));
                    return true;
                },
                'Redirect to internal metadata IP must be blocked by SSRF gate'
            );
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('11. Manual and WhatsApp Intake Remain Completely Functional Without Web Domain Approval', async () => {
        const dummyUserId = new mongoose.Types.ObjectId();

        // 1. Manual Text Intake
        const manualRes = await addToIntakeQueue('manual', {
            text: 'Direct buyer walked in: looking for 250 sqyd plot in Sector 5 Kurukshetra with 1.5 Cr budget. Contact: 9876543210',
            source: 'Walk-in'
        }, dummyUserId);

        assert.equal(manualRes.success, true);
        assert.ok(manualRes.intakeId);

        const manualDoc = await Intake.findById(manualRes.intakeId);
        assert.ok(manualDoc);
        assert.equal(manualDoc.status, 'Queued');
        assert.equal(manualDoc.source_type, 'manual');

        // 2. WhatsApp Inbound Intake
        const whatsappRes = await addToIntakeQueue('whatsapp_group', {
            text: 'Urgent seller: Sector 13 Urban Estate 350 sqyd East facing plot. Asking 2.25 Cr. Immediate registry.',
            messageId: 'wa_live_msg_' + Date.now(),
            groupName: 'Kurukshetra Property Dealers Association',
            participant: '919876543210'
        }, null);

        assert.equal(whatsappRes.success, true);
        assert.ok(whatsappRes.intakeId);

        const waDoc = await Intake.findById(whatsappRes.intakeId);
        assert.ok(waDoc);
        assert.equal(waDoc.status, 'Queued');
        assert.equal(waDoc.source_type, 'whatsapp_group');
    });

    await t.test('12. Verification of Zero Network Calls Across All Blocked Invocations', async () => {
        let networkCallCount = 0;
        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async () => {
            networkCallCount++;
            throw new Error('UNAUTHORIZED NETWORK INVOCATION');
        };

        try {
            // Rejection 1: Unapproved Tier 2 direct fetch
            await assert.rejects(
                async () => safeFetchHtml('https://unregistered-agent-website.com/plot'),
                (err) => err instanceof AuthorizationError
            );

            // Rejection 2: Commercial portal without grant
            await assert.rejects(
                async () => safeFetchHtml('https://magicbricks.com/commercial-shop'),
                (err) => err instanceof AuthorizationError
            );

            // Rejection 3: Walled garden
            await assert.rejects(
                async () => safeFetchHtml('https://facebook.com/groups/plots'),
                (err) => err instanceof AuthorizationError
            );

            // Rejection 4: Direct connector for unapproved site
            await publicUrlConnector.process({ url: 'https://unapproved-test-source.com/plot' });

            // Rejection 5: Queue admission for unapproved site
            await addToIntakeQueue('public_url', { url: 'https://unapproved-test-queue.com/plot' }, null);

            // Assert that network calls were strictly ZERO
            assert.equal(networkCallCount, 0, 'Zero HTTP/network calls must have been initiated across all blocked cases');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. REALISTIC LOCAL HTTP SERVER TEST FOR PINNED AGENT SOCKET BEHAVIOR
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('13. Realistic Local HTTP Server Test: Pinned Agent Socket Lifecycle & Native Lookup Integration', async () => {
        /**
         * METHODOLOGY NOTE (Mocked DNS vs Socket-Level Networking):
         * - Mocked DNS unit tests intercept dns.promises.lookup to assert how the agent handles hypothetical IP answers.
         * - This test starts a real local Node.js HTTP server on an ephemeral loopback port and executes actual HTTP
         *   requests through Node's native networking stack (http.request) using createPinnedAgent.
         * - This proves that:
         *   1. Node's socket creation directly invokes the agent's custom lookup handler.
         *   2. Hostname mismatches or illegal destination IPs abort socket connections at the OS/socket layer.
         */

        // 1. Create a real local HTTP server
        let serverHitCount = 0;
        const server = http.createServer((req, res) => {
            serverHitCount++;
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK from local test server');
        });

        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        try {
            // Scenario A: Pinned agent with loopback destination is rejected by the agent's lookup guard
            const loopbackAgent = createPinnedAgent('http:', 'localhost', '127.0.0.1', 4);

            await assert.rejects(
                new Promise((resolve, reject) => {
                    const req = http.request({
                        host: 'localhost',
                        port,
                        path: '/test',
                        method: 'GET',
                        agent: loopbackAgent
                    }, (res) => {
                        resolve(res);
                    });
                    req.on('error', reject);
                    req.end();
                }),
                (err) => {
                    assert.ok(err instanceof SSRFSecurityError);
                    assert.ok(err.message.includes('strictly forbidden') || err.message.includes('private or internal IP'));
                    return true;
                },
                'Native socket request must be aborted by pinned agent lookup when targeting private/internal IP'
            );

            // Server must NOT have received any request
            assert.equal(serverHitCount, 0, 'Server must receive 0 requests when pinned agent blocks connection');

            // Scenario B: Pinned agent with hostname mismatch is rejected during native socket creation
            const mismatchAgent = createPinnedAgent('http:', 'expected-target.com', '93.184.216.34', 4);

            await assert.rejects(
                new Promise((resolve, reject) => {
                    const req = http.request({
                        host: 'different-host.com', // Mismatch against expected-target.com
                        port,
                        path: '/test',
                        method: 'GET',
                        agent: mismatchAgent
                    }, (res) => {
                        resolve(res);
                    });
                    req.on('error', reject);
                    req.end();
                }),
                (err) => {
                    assert.ok(err instanceof SSRFSecurityError);
                    assert.ok(err.message.includes('Hostname mismatch in connection'));
                    return true;
                },
                'Native socket request must be aborted when hostname requested does not match pinned target'
            );

            assert.equal(serverHitCount, 0, 'Server must receive 0 requests on hostname mismatch');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
