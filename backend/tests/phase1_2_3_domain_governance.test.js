import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import dns from 'dns';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import SourceAuthorizationMatrix, {
    SOURCE_TIERS,
    SOURCE_STATUS,
    domainGovernancePolicy,
    DomainGovernancePolicy,
    authorizationGrantRegistry,
    classifySource,
    evaluateOperationAuthorization,
    evaluateOperationAuthorizationAsync,
    isSourceAuthorized,
    isSourceAuthorizedAsync,
    extractCleanDomain,
    getParentDomains,
    OFFICIAL_REGULATORY_DIRECTORY
} from '../services/discovery/SourceAuthorizationMatrix.js';

import {
    validateDomainForApproval,
    getSafeParentDomains,
    isPublicSuffix,
    PUBLIC_SUFFIX_SET
} from '../services/discovery/PublicSuffixList.js';

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
import ApprovedDomain from '../models/ApprovedDomain.js';
import AuditLog from '../models/AuditLog.js';
import ParsingRule from '../src/modules/parsing/parsingRule.model.js';
import {
    approveDomain,
    revokeDomain,
    listDomains,
    getDomainDetails
} from '../src/modules/discovery/domainGovernance.controller.js';
import { authorize } from '../src/middlewares/auth.middleware.js';

// Prevent Mongoose buffering timeout during unit tests
ParsingRule.find = async () => [];

test('--- PHASE 1.2.3: MANDATORY DOMAIN GOVERNANCE AT EVERY FETCH BOUNDARY ---', async (t) => {

    let replSet;
    let mongoUri;

    const originalFindOne = Intake.findOne;
    const originalFindById = Intake.findById;
    const originalSave = Intake.prototype.save;
    const originalDnsLookup = dns.promises.lookup;
    const originalQueueAdd = intakeQueue.add;

    const savedIntakeDocs = new Map();

    t.before(async () => {
        replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        mongoUri = replSet.getUri();
        await mongoose.connect(mongoUri);
    });

    t.after(async () => {
        if (mongoose.connection && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (replSet) {
            await replSet.stop();
        }
    });

    t.beforeEach(async () => {
        domainGovernancePolicy.reset();
        authorizationGrantRegistry.clearAll();
        savedIntakeDocs.clear();

        if (mongoose.connection && mongoose.connection.readyState === 1) {
            await ApprovedDomain.deleteMany({});
            await AuditLog.deleteMany({});
        }

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

        Intake.findOne = async () => null;
        Intake.findById = async (id) => savedIntakeDocs.get(String(id)) || null;

        // Default DNS stub: maps hostnames to safe public IP
        dns.promises.lookup = async (host) => {
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
        
        const authDecision = evaluateOperationAuthorization(unknownUrl, 'automated_fetch');
        
        assert.equal(authDecision.allowed, false, 'Unknown domain must be blocked by default');
        assert.equal(authDecision.tier, SOURCE_TIERS.TIER_2_PUBLIC_PAGE);
        assert.equal(authDecision.status, SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED);
        assert.equal(authDecision.reason, 'unverified_domain_requires_human_verification');
        assert.equal(authDecision.domain, 'unregistered-brokerage.in');

        assert.equal(isSourceAuthorized(unknownUrl, 'automated_fetch'), false);
    });

    await t.test('2. Operator Verification Workflow: Registered and Approved Tier 2 Domain Can Fetch Under Policy', () => {
        const domain = 'kurukshetra-local-deals.com';
        const testUrl = `https://${domain}/verified-plot-deal`;

        // 1. Initially unverified
        assert.equal(evaluateOperationAuthorization(testUrl, 'automated_fetch').allowed, false);

        // 2. Operator registers and approves domain (with includeSubdomains: true)
        const registered = domainGovernancePolicy.registerDomain(domain, {
            approvedBy: 'operator_admin_42',
            notes: 'Verified local broker website with valid Haryana RERA registration',
            includeSubdomains: true
        });
        assert.equal(registered, true);

        // 3. Inspect audit record
        const record = domainGovernancePolicy.getDomainRecord(domain);
        assert.ok(record);
        assert.equal(record.domain, domain);
        assert.equal(record.status, 'approved');
        assert.equal(record.approvedBy, 'operator_admin_42');
        assert.equal(record.includeSubdomains, true);
        assert.ok(record.approvedAt instanceof Date);
        assert.ok(record.notes.includes('RERA'));

        // 4. Now authorized for automated fetch
        const authDecision = evaluateOperationAuthorization(testUrl, 'automated_fetch');
        assert.equal(authDecision.allowed, true);
        assert.equal(authDecision.status, SOURCE_STATUS.AUTHORIZED);
        assert.equal(authDecision.reason, null);

        // Subdomain of approved domain with includeSubdomains: true is also authorized
        const subUrl = `https://plots.${domain}/sector-7-plot`;
        assert.equal(evaluateOperationAuthorization(subUrl, 'automated_fetch').allowed, true);

        // Exact-host only approval (default includeSubdomains: false)
        domainGovernancePolicy.registerDomain('exact-host-only.com', {
            approvedBy: 'operator_admin_42',
            includeSubdomains: false
        });
        assert.equal(evaluateOperationAuthorization('https://exact-host-only.com/plot', 'automated_fetch').allowed, true);
        assert.equal(evaluateOperationAuthorization('https://sub.exact-host-only.com/plot', 'automated_fetch').allowed, false);
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
            const publicResult = await publicUrlConnector.process({
                url: unknownUrl,
                search_metadata: { title: 'Direct Connector Plot' }
            });

            assert.equal(networkAttempted, false, 'PublicUrlConnector must not touch network');
            assert.equal(publicResult.raw_source_data.fetch_blocked, true);
            assert.equal(publicResult.raw_source_data.fetch_block_reason, 'unverified_domain_requires_human_verification');
            assert.equal(publicResult.verification_status, 'unverified');
            assert.ok(publicResult.raw_source_data.url.includes('unapproved-direct-connector.com'));

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
        const approvedInitialDomain = 'verified-origin-domain.in';
        await domainGovernancePolicy.registerDomainDurable({
            domain: approvedInitialDomain,
            operatorEmail: 'test_operator@bp.in',
            operatorRole: 'Admin',
            reason: 'Origin domain approved for redirect testing'
        });
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
            await assert.rejects(
                async () => safeFetchHtml('https://unregistered-agent-website.com/plot'),
                (err) => err instanceof AuthorizationError
            );

            await assert.rejects(
                async () => safeFetchHtml('https://magicbricks.com/commercial-shop'),
                (err) => err instanceof AuthorizationError
            );

            await assert.rejects(
                async () => safeFetchHtml('https://facebook.com/groups/plots'),
                (err) => err instanceof AuthorizationError
            );

            await publicUrlConnector.process({ url: 'https://unapproved-test-source.com/plot' });
            await addToIntakeQueue('public_url', { url: 'https://unapproved-test-queue.com/plot' }, null);

            assert.equal(networkCallCount, 0, 'Zero HTTP/network calls must have been initiated across all blocked cases');
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    await t.test('13. Realistic Local HTTP Server Test: Pinned Agent Socket Lifecycle & Native Lookup Integration', async () => {
        let serverHitCount = 0;
        const server = http.createServer((req, res) => {
            serverHitCount++;
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK from local test server');
        });

        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        try {
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

            assert.equal(serverHitCount, 0, 'Server must receive 0 requests when pinned agent blocks connection');

            const mismatchAgent = createPinnedAgent('http:', 'expected-target.com', '93.184.216.34', 4);

            await assert.rejects(
                new Promise((resolve, reject) => {
                    const req = http.request({
                        host: 'different-host.com',
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

    // ─────────────────────────────────────────────────────────────────────────
    // 3. STATUTORY DIRECTORY & DURABLE STORAGE GATES
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('14. Finding A: Baseline Domain Approvals Corrected (No Hardcoded Approvals & Accurate Categorization)', async () => {
        domainGovernancePolicy.reset();
        assert.equal(domainGovernancePolicy.listDomains().length, 0, 'Policy registry must start completely empty on reset');

        assert.equal(OFFICIAL_REGULATORY_DIRECTORY['kurukshetrarealestate.in'], undefined, 'Private portal kurukshetrarealestate.in must not be in official regulatory directory');
        
        const syncDecision = evaluateOperationAuthorization('https://kurukshetrarealestate.in/plot-details', 'automated_fetch');
        assert.equal(syncDecision.allowed, false);
        assert.equal(syncDecision.reason, 'unverified_domain_requires_human_verification');

        const asyncDecision = await evaluateOperationAuthorizationAsync('https://kurukshetrarealestate.in/plot-details', 'automated_fetch');
        assert.equal(asyncDecision.allowed, false);
        assert.equal(asyncDecision.reason, 'unverified_domain_requires_human_verification');

        assert.ok(OFFICIAL_REGULATORY_DIRECTORY['tcpharyana.gov.in'], 'tcpharyana.gov.in must be in official regulatory directory');
        assert.equal(OFFICIAL_REGULATORY_DIRECTORY['tcpharyana.gov.in'].category, 'regulatory_authority');
        assert.ok(OFFICIAL_REGULATORY_DIRECTORY['tcpharyana.gov.in'].mandate.includes('urban planning'));

        assert.ok(OFFICIAL_REGULATORY_DIRECTORY['hsvp.org.in'], 'hsvp.org.in must be in official regulatory directory');
        assert.equal(OFFICIAL_REGULATORY_DIRECTORY['hsvp.org.in'].category, 'statutory_authority');
        assert.ok(OFFICIAL_REGULATORY_DIRECTORY['hsvp.org.in'].mandate.includes('urban development'));

        assert.equal(evaluateOperationAuthorization('https://tcpharyana.gov.in/notices', 'automated_fetch').allowed, false);
        assert.equal(evaluateOperationAuthorization('https://hsvp.org.in/plots', 'automated_fetch').allowed, false);

        await domainGovernancePolicy.registerDomainDurable({
            domain: 'tcpharyana.gov.in',
            operatorEmail: 'admin_officer@bp.in',
            operatorRole: 'Admin',
            reason: OFFICIAL_REGULATORY_DIRECTORY['tcpharyana.gov.in'].mandate,
            includeSubdomains: true
        });

        assert.equal(evaluateOperationAuthorization('https://tcpharyana.gov.in/notices', 'automated_fetch').allowed, true);
        assert.equal(evaluateOperationAuthorization('https://edisha.tcpharyana.gov.in/portal', 'automated_fetch').allowed, true);
        assert.equal(await isSourceAuthorizedAsync('https://tcpharyana.gov.in/notices', 'automated_fetch'), true);
    });

    await t.test('15. Finding B: Durable Domain Storage via ApprovedDomain Schema & Atomic AuditLog', async () => {
        const testDomain = 'durable-partner-portal.in';
        const operatorId = new mongoose.Types.ObjectId();
        const operatorEmail = 'senior_admin@bharatproperties.in';
        const operatorRole = 'SuperAdmin';
        const approvalReason = 'Formally verified real estate syndicate agreement Ref #SYND-2026';

        // 1. Perform durable registration
        const record = await domainGovernancePolicy.registerDomainDurable({
            domain: testDomain,
            operatorId,
            operatorEmail,
            operatorRole,
            reason: approvalReason
        });

        assert.ok(record);
        assert.equal(record.domain, testDomain);
        assert.equal(record.status, 'approved');
        assert.equal(record.operatorEmail, operatorEmail);
        assert.equal(record.operatorRole, operatorRole);
        assert.equal(record.approvalReason, approvalReason);
        assert.ok(record.approvedAt);

        // Verify AuditLog written to MongoDB
        const approvalAudit = await AuditLog.findOne({ targetName: testDomain, eventType: 'domain_approved' });
        assert.ok(approvalAudit, 'Durable AuditLog must exist in MongoDB');
        assert.equal(approvalAudit.actorEmail, operatorEmail);

        // 2. Evaluator authorizes the registered domain
        const authDecision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/exclusive-deals`, 'automated_fetch');
        assert.equal(authDecision.allowed, true);
        assert.equal(authDecision.status, SOURCE_STATUS.AUTHORIZED);

        // 3. Perform durable revocation
        const revokedRecord = await domainGovernancePolicy.revokeDomainDurable({
            domain: testDomain,
            operatorId,
            operatorEmail,
            operatorRole,
            reason: 'Partnership terms terminated by compliance team'
        });

        assert.ok(revokedRecord);
        assert.equal(revokedRecord.status, 'revoked');
        assert.equal(revokedRecord.revocationReason, 'Partnership terms terminated by compliance team');
        assert.ok(revokedRecord.revokedAt);

        // Verify revocation AuditLog written to MongoDB
        const revokeAudit = await AuditLog.findOne({ targetName: testDomain, eventType: 'domain_revoked' });
        assert.ok(revokeAudit, 'Durable AuditLog for revocation must exist in MongoDB');
        assert.equal(revokeAudit.actorEmail, operatorEmail);

        // 4. Evaluator immediately blocks the revoked domain
        const revokedDecision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/exclusive-deals`, 'automated_fetch');
        assert.equal(revokedDecision.allowed, false);
        assert.equal(revokedDecision.reason, 'unverified_domain_requires_human_verification');
    });

    await t.test('16. Finding B: Fail-Closed Behavior on Database Outage / Unreachable Database', async () => {
        const testDomain = 'haryana-land-records.in';
        await domainGovernancePolicy.registerDomainDurable({
            domain: testDomain,
            operatorEmail: 'admin@bp.in',
            operatorRole: 'Admin',
            reason: 'Land records verified'
        });

        assert.equal(await isSourceAuthorizedAsync(`https://${testDomain}/view`, 'automated_fetch'), true);

        // Simulate database outage / network failure
        domainGovernancePolicy.setFailClosedMode(true);

        const outageDecision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/view`, 'automated_fetch');
        assert.equal(outageDecision.allowed, false, 'Database outage must block automated fetch (fail-closed)');
        assert.equal(outageDecision.reason, 'database_unavailable_fail_closed');

        assert.equal(await isSourceAuthorizedAsync(`https://${testDomain}/view`, 'automated_fetch'), false);

        await assert.rejects(
            async () => safeFetchHtml(`https://${testDomain}/view`),
            (err) => {
                assert.equal(err.name, 'AuthorizationError');
                assert.ok(err.message.includes('database_unavailable_fail_closed'));
                return true;
            },
            'safeFetchHtml must fail closed on database outage'
        );

        domainGovernancePolicy.setFailClosedMode(false);
        assert.equal(await isSourceAuthorizedAsync(`https://${testDomain}/view`, 'automated_fetch'), true);
    });

    await t.test('17. Finding B: Operator RBAC and Identity Spoofing Protection on Governance Endpoints', async () => {
        const createMockRes = () => {
            const res = {
                statusCode: null,
                body: null,
                status(code) { this.statusCode = code; return this; },
                json(payload) { this.body = payload; return this; }
            };
            return res;
        };

        // Scenario A: Unauthenticated caller rejected (401)
        const unauthReq = { body: { domain: 'broker-x.in', reason: 'Attempted unauth' }, user: null };
        const unauthRes = createMockRes();
        await approveDomain(unauthReq, unauthRes);
        assert.equal(unauthRes.statusCode, 401);
        assert.equal(unauthRes.body.success, false);

        // Scenario B: RBAC Middleware Blocks Non-Admin Roles (403)
        const authorizeMiddleware = authorize('Admin', 'SuperAdmin');
        let nextCalled = false;
        let authError = null;

        const agentReq = { user: { _id: 'agent_123', email: 'agent@bp.com', role: 'Agent' } };
        authorizeMiddleware(agentReq, createMockRes(), (err) => {
            if (err) authError = err;
            else nextCalled = true;
        });
        assert.equal(nextCalled, false, 'Agent must not pass authorize middleware');
        assert.ok(authError, 'Access denied error expected for Agent role');
        assert.equal(authError.statusCode, 403);

        // Scenario C: Authenticated Admin succeeds and caller cannot spoof identity
        const adminId = new mongoose.Types.ObjectId();
        const legitAdminEmail = 'chief_compliance@bharatproperties.in';
        const adminReq = {
            user: { _id: adminId, email: legitAdminEmail, role: 'Admin' },
            body: {
                domain: 'verified-partner-north.in',
                reason: 'Formal RERA partnership established',
                operatorId: 'fake_spoofed_id',
                operatorEmail: 'spoofed_impostor@external.com',
                operatorRole: 'SuperAdmin'
            }
        };
        const adminRes = createMockRes();

        await approveDomain(adminReq, adminRes);
        assert.equal(adminRes.statusCode, 200);
        assert.equal(adminRes.body.success, true);

        // Verify identity extraction strictly from req.user
        assert.equal(adminRes.body.data.operatorEmail, legitAdminEmail, 'Operator email must be taken from req.user, not req.body');
        assert.equal(String(adminRes.body.data.operatorId), String(adminId));

        // Verify AuditLog in MongoDB
        const auditRecord = await AuditLog.findOne({ targetName: 'verified-partner-north.in', eventType: 'domain_approved' });
        assert.ok(auditRecord, 'AuditLog entry must be created in MongoDB');
        assert.equal(auditRecord.actorEmail, legitAdminEmail);
        assert.equal(auditRecord.targetType, 'domain');
        assert.equal(auditRecord.targetName, 'verified-partner-north.in');

        // Scenario D: Revocation by Admin
        const revokeReq = {
            user: { _id: adminId, email: legitAdminEmail, role: 'Admin' },
            body: { domain: 'verified-partner-north.in', reason: 'Annual review expired' }
        };
        const revokeRes = createMockRes();
        await revokeDomain(revokeReq, revokeRes);
        assert.equal(revokeRes.statusCode, 200);
        assert.equal(revokeRes.body.data.status, 'revoked');

        const revokeAudit = await AuditLog.findOne({ targetName: 'verified-partner-north.in', eventType: 'domain_revoked' });
        assert.ok(revokeAudit);
        assert.equal(revokeAudit.actorEmail, legitAdminEmail);
    });

    await t.test('18. Finding B: Revocation Enforced Across All 4 Ingestion Boundaries', async () => {
        const domain = 'revoked-ingestion-check.in';
        const domainUrl = `https://${domain}/prime-sector-9-plot`;

        await domainGovernancePolicy.registerDomainDurable({
            domain,
            operatorEmail: 'compliance@bharatproperties.in',
            operatorRole: 'Admin',
            reason: 'Initial partner onboarding'
        });
        assert.equal(await isSourceAuthorizedAsync(domainUrl, 'automated_fetch'), true);

        await domainGovernancePolicy.revokeDomainDurable({
            domain,
            operatorEmail: 'compliance@bharatproperties.in',
            operatorRole: 'Admin',
            reason: 'Regulatory violation'
        });
        assert.equal(await isSourceAuthorizedAsync(domainUrl, 'automated_fetch'), false);

        // BOUNDARY 1: Direct Connector Invocations
        const publicConnectorResult = await publicUrlConnector.process({ url: domainUrl });
        assert.equal(publicConnectorResult.verification_status, 'unverified');
        assert.equal(publicConnectorResult.raw_source_data.fetch_blocked, true);
        assert.ok(publicConnectorResult.raw_source_data.fetch_block_reason.includes('unverified_domain_requires_human_verification'));

        const listingConnectorResult = await propertyListingConnector.process({ url: domainUrl });
        assert.equal(listingConnectorResult.verification_status, 'unverified');
        assert.equal(listingConnectorResult.raw_source_data.fetch_blocked, true);

        // BOUNDARY 2: Queue Admission
        const queueResult = await addToIntakeQueue('public_url', { url: domainUrl });
        assert.equal(queueResult.success, true);
        assert.equal(queueResult.heldForReview, true);
        assert.equal(queueResult.fetchBlocked, true);

        // BOUNDARY 3: Worker Processing / Direct safeFetchHtml execution
        await assert.rejects(
            async () => safeFetchHtml(domainUrl),
            (err) => {
                assert.equal(err.name, 'AuthorizationError');
                assert.ok(err.message.includes('unverified_domain_requires_human_verification'));
                return true;
            },
            'Worker fetch execution must be blocked for revoked domain'
        );

        // BOUNDARY 4: Redirect Hops
        const initialApprovedDomain = 'redirect-start-domain.in';
        await domainGovernancePolicy.registerDomainDurable({
            domain: initialApprovedDomain,
            operatorEmail: 'test_admin@bp.in',
            operatorRole: 'Admin',
            reason: 'Approved initial domain'
        });
        const startUrl = `https://${initialApprovedDomain}/redirect`;

        const originalAxiosGet = (await import('axios')).default.get;
        (await import('axios')).default.get = async (url) => {
            if (url.includes(initialApprovedDomain)) {
                return {
                    status: 302,
                    headers: { location: domainUrl }
                };
            }
            return { status: 200, data: '<html><body>Content</body></html>' };
        };

        try {
            await assert.rejects(
                async () => safeFetchHtml(startUrl),
                (err) => {
                    assert.equal(err.name, 'AuthorizationError');
                    assert.ok(err.message.includes('unverified_domain_requires_human_verification'));
                    return true;
                },
                'Redirect to revoked domain must be blocked by AuthorizationError'
            );
        } finally {
            (await import('axios')).default.get = originalAxiosGet;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CRITICAL FINDING 1: ZERO IN-MEMORY FALLBACK & FAIL-CLOSED INTEGRITY
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('19. Finding 1: Disconnected Database Fails Closed in registerDomainDurable & isDomainVerifiedAsync', async () => {
        const testDomain = 'fail-closed-offline.in';

        // Disconnect MongoDB to simulate database unavailability
        await mongoose.disconnect();
        assert.equal(mongoose.connection.readyState, 0);

        try {
            // 1. registerDomainDurable MUST throw explicit error and NOT cache approved record
            await assert.rejects(
                async () => domainGovernancePolicy.registerDomainDurable({
                    domain: testDomain,
                    operatorEmail: 'admin@bp.in',
                    operatorRole: 'Admin',
                    reason: 'Should fail closed on disconnected DB'
                }),
                (err) => {
                    assert.ok(err.message.includes('Database connection unavailable'));
                    return true;
                },
                'registerDomainDurable must throw when MongoDB is disconnected'
            );

            // VerifiedDomains cache must NOT have registered the domain
            assert.equal(domainGovernancePolicy.verifiedDomains.has(testDomain), false);

            // 2. isDomainVerifiedAsync MUST return false (fail-closed)
            const isVerified = await domainGovernancePolicy.isDomainVerifiedAsync(testDomain);
            assert.equal(isVerified, false, 'isDomainVerifiedAsync must return false when MongoDB is disconnected');
            assert.ok(domainGovernancePolicy.lastDbError != null);

            // 3. evaluateOperationAuthorizationAsync MUST report database_unavailable_fail_closed
            const decision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/plot`, 'automated_fetch');
            assert.equal(decision.allowed, false);
            assert.equal(decision.reason, 'database_unavailable_fail_closed');

            // 4. safeFetchHtml MUST fail closed
            await assert.rejects(
                async () => safeFetchHtml(`https://${testDomain}/plot`),
                (err) => {
                    assert.equal(err.name, 'AuthorizationError');
                    assert.ok(err.message.includes('database_unavailable_fail_closed'));
                    return true;
                }
            );
        } finally {
            // Reconnect to test replica set
            await mongoose.connect(mongoUri);
            assert.equal(mongoose.connection.readyState, 1);
        }
    });

    await t.test('20. Finding 1: AuditLog Write Failure Aborts Transaction and Leaves Zero Cache Grant', async () => {
        const testDomain = 'audit-rollback-target.in';

        // Simulate AuditLog write failure
        const originalAuditCreate = AuditLog.create;
        AuditLog.create = async () => {
            throw new Error('SIMULATED_AUDIT_DISK_FULL: Failed to persist durable audit record');
        };

        try {
            // registerDomainDurable MUST throw and NOT commit or cache
            await assert.rejects(
                async () => domainGovernancePolicy.registerDomainDurable({
                    domain: testDomain,
                    operatorEmail: 'admin@bp.in',
                    operatorRole: 'Admin',
                    reason: 'Testing transaction rollback on audit failure'
                }),
                (err) => {
                    assert.ok(err.message.includes('SIMULATED_AUDIT_DISK_FULL'));
                    return true;
                },
                'registerDomainDurable must fail when AuditLog write fails'
            );

            // Verify ApprovedDomain was NOT persisted / rolled back in MongoDB
            const doc = await ApprovedDomain.findOne({ domain: testDomain });
            assert.equal(doc, null, 'ApprovedDomain write must be rolled back on audit failure');

            // Verify in-memory cache does not contain approved record
            assert.equal(domainGovernancePolicy.verifiedDomains.has(testDomain), false);

            // Async authorization evaluation must fail closed
            const authDecision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/deal`, 'automated_fetch');
            assert.equal(authDecision.allowed, false);
            assert.equal(authDecision.reason, 'unverified_domain_requires_human_verification');
        } finally {
            AuditLog.create = originalAuditCreate;
        }
    });

    await t.test('21. Finding 1: Server Restart / In-Memory Cache Flush Verification (Durable Registry Reliance)', async () => {
        const testDomain = 'restart-survival-test.in';

        // 1. Durably approve domain
        await domainGovernancePolicy.registerDomainDurable({
            domain: testDomain,
            operatorEmail: 'admin@bp.in',
            operatorRole: 'Admin',
            reason: 'Testing restart survival across cache flush'
        });

        // 2. Clear entire in-memory cache to simulate server restart
        domainGovernancePolicy.clear();
        assert.equal(domainGovernancePolicy.verifiedDomains.size, 0);

        // 3. Evaluator MUST successfully query durable registry in MongoDB and authorize fetch
        const authDecision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/plot`, 'automated_fetch');
        assert.equal(authDecision.allowed, true, 'Domain must be authorized from MongoDB after cache flush');
        assert.equal(authDecision.status, SOURCE_STATUS.AUTHORIZED);

        // 4. Now delete document from MongoDB
        await ApprovedDomain.deleteOne({ domain: testDomain });
        domainGovernancePolicy.clear();

        // 5. Evaluator must immediately block automated fetch (proves no zombie in-memory access)
        const postDeleteDecision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/plot`, 'automated_fetch');
        assert.equal(postDeleteDecision.allowed, false, 'Deleted domain must be blocked immediately');
        assert.equal(postDeleteDecision.reason, 'unverified_domain_requires_human_verification');
    });

    await t.test('22. Finding 1: Simulated Database Read Error Fails Closed Even If Cache Has Stale Entry', async () => {
        const testDomain = 'db-read-error-test.in';

        // Populate in-memory cache with an approved record
        domainGovernancePolicy.verifiedDomains.set(testDomain, {
            domain: testDomain,
            status: 'approved',
            approvedBy: 'old_cache_operator'
        });

        // Mock ApprovedDomain.findOne to simulate MongoDB network timeout
        const originalFindOne = ApprovedDomain.findOne;
        ApprovedDomain.findOne = () => {
            throw new Error('MongoNetworkTimeoutError: connection timed out while querying ApprovedDomain');
        };

        try {
            // isDomainVerifiedAsync MUST fail closed and NOT fall back to in-memory cache
            const isVerified = await domainGovernancePolicy.isDomainVerifiedAsync(testDomain);
            assert.equal(isVerified, false, 'isDomainVerifiedAsync must fail closed on DB read error');
            assert.ok(domainGovernancePolicy.lastDbError != null);

            // evaluateOperationAuthorizationAsync must return database_unavailable_fail_closed
            const authDecision = await evaluateOperationAuthorizationAsync(`https://${testDomain}/plot`, 'automated_fetch');
            assert.equal(authDecision.allowed, false);
            assert.equal(authDecision.reason, 'database_unavailable_fail_closed');

            // safeFetchHtml must throw AuthorizationError
            await assert.rejects(
                async () => safeFetchHtml(`https://${testDomain}/plot`),
                (err) => {
                    assert.equal(err.name, 'AuthorizationError');
                    assert.ok(err.message.includes('database_unavailable_fail_closed'));
                    return true;
                }
            );
        } finally {
            ApprovedDomain.findOne = originalFindOne;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CRITICAL FINDING 2: PSL DEFENSE & DOMAIN HIERARCHY ISOLATION
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('23. Finding 2: Public Suffix Approvals Rejected & PSL Defense', async () => {
        const publicSuffixes = [
            'gov.in',
            'co.in',
            'nic.in',
            'com',
            'org',
            'net',
            'io',
            'github.io',
            'vercel.app',
            'herokuapp.com',
            'pages.dev',
            'azurewebsites.net',
            'cloudfront.net'
        ];

        for (const suffix of publicSuffixes) {
            assert.equal(isPublicSuffix(suffix), true, `${suffix} must be identified as public suffix`);
            const validation = validateDomainForApproval(suffix);
            assert.equal(validation.valid, false);
            assert.ok(validation.error.includes('Cannot approve public suffix'));

            // registerDomainDurable must reject
            await assert.rejects(
                async () => domainGovernancePolicy.registerDomainDurable({
                    domain: suffix,
                    operatorEmail: 'admin@bp.in',
                    operatorRole: 'Admin',
                    reason: 'Illegal public suffix attempt'
                }),
                (err) => {
                    assert.ok(err.message.includes('Cannot approve public suffix'));
                    return true;
                }
            );
        }

        // approveDomain API endpoint must return HTTP 400
        const createMockRes = () => ({
            statusCode: null,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; return this; }
        });

        const res = createMockRes();
        await approveDomain({
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@bp.in', role: 'Admin' },
            body: { domain: 'gov.in', reason: 'Attempting to approve root gov.in' }
        }, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.ok(res.body.message.includes('Cannot approve public suffix'));
    });

    await t.test('24. Finding 2: IP Literals and Malformed Domains Rejected', async () => {
        const invalidInputs = [
            '127.0.0.1',
            '169.254.169.254',
            '93.184.216.34',
            '::1',
            '[::1]',
            'localhost',
            'invalid..domain.com',
            '-leading-hyphen.com',
            'trailing-hyphen-.com',
            'domain with spaces.com',
            'http://'
        ];

        for (const input of invalidInputs) {
            const validation = validateDomainForApproval(input);
            assert.equal(validation.valid, false, `${input} must be rejected by domain validation`);
        }

        // Test API endpoint returns 400 for IP literal
        const createMockRes = () => ({
            statusCode: null,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; return this; }
        });

        const res = createMockRes();
        await approveDomain({
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@bp.in', role: 'Admin' },
            body: { domain: '169.254.169.254', reason: 'Attempted IP registration' }
        }, res);

        assert.equal(res.statusCode, 400);
        assert.ok(res.body.message.includes('IP literals cannot be registered'));
    });

    await t.test('25. Finding 2: Exact Host vs Subdomain Scope Enforcement', async () => {
        // 1. Exact-host approval (includeSubdomains: false by default)
        await domainGovernancePolicy.registerDomainDurable({
            domain: 'exact-host-scope.com',
            operatorEmail: 'admin@bp.in',
            operatorRole: 'Admin',
            reason: 'Approved exact host only',
            includeSubdomains: false
        });

        // Exact host is authorized
        assert.equal(await isSourceAuthorizedAsync('https://exact-host-scope.com/plots', 'automated_fetch'), true);

        // Subdomain is BLOCKED because includeSubdomains is false
        assert.equal(await isSourceAuthorizedAsync('https://sub.exact-host-scope.com/plots', 'automated_fetch'), false);
        assert.equal(await isSourceAuthorizedAsync('https://sibling-exact-host-scope.com/plots', 'automated_fetch'), false);

        // 2. Wildcard approval (includeSubdomains: true explicitly approved)
        await domainGovernancePolicy.registerDomainDurable({
            domain: 'tcpharyana.gov.in',
            operatorEmail: 'admin@bp.in',
            operatorRole: 'Admin',
            reason: 'Official Haryana statutory department with subdomains',
            includeSubdomains: true
        });

        // Exact host authorized
        assert.equal(await isSourceAuthorizedAsync('https://tcpharyana.gov.in/notices', 'automated_fetch'), true);
        // Subdomains authorized
        assert.equal(await isSourceAuthorizedAsync('https://edisha.tcpharyana.gov.in/portal', 'automated_fetch'), true);
        assert.equal(await isSourceAuthorizedAsync('https://licensing.urban.tcpharyana.gov.in/app', 'automated_fetch'), true);

        // PSL Parent domain 'gov.in' is NOT authorized!
        assert.equal(await isSourceAuthorizedAsync('https://gov.in/portal', 'automated_fetch'), false);
        // Sibling domains under gov.in are NOT authorized!
        assert.equal(await isSourceAuthorizedAsync('https://otherdepartment.gov.in/portal', 'automated_fetch'), false);
        assert.equal(await isSourceAuthorizedAsync('https://evil-tcpharyana.gov.in/portal', 'automated_fetch'), false);
    });

    await t.test('26. Finding 2: Multi-Tenant Shared Hosting Isolation (Tenant Bleed Defense)', async () => {
        // Approving tenant-alpha.github.io must NOT authorize tenant-beta.github.io or github.io
        await domainGovernancePolicy.registerDomainDurable({
            domain: 'tenant-alpha.github.io',
            operatorEmail: 'admin@bp.in',
            operatorRole: 'Admin',
            reason: 'Verified tenant alpha on GitHub Pages',
            includeSubdomains: true
        });

        assert.equal(await isSourceAuthorizedAsync('https://tenant-alpha.github.io/listings', 'automated_fetch'), true);
        assert.equal(await isSourceAuthorizedAsync('https://sub.tenant-alpha.github.io/listings', 'automated_fetch'), true);

        // tenant-beta.github.io is strictly blocked
        assert.equal(await isSourceAuthorizedAsync('https://tenant-beta.github.io/listings', 'automated_fetch'), false);
        // Root platform github.io is strictly blocked
        assert.equal(await isSourceAuthorizedAsync('https://github.io/listings', 'automated_fetch'), false);

        // Safe parent domains check: github.io is not returned as candidate authorizer
        const parents = getSafeParentDomains('tenant-beta.github.io');
        assert.deepEqual(parents, [], 'getSafeParentDomains must terminate before public suffix github.io');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. CRITICAL FINDING 3: TRUTHFUL API OUTCOMES & DURABLE AUDIT LOGS
    // ─────────────────────────────────────────────────────────────────────────

    await t.test('27. Finding 3: Mandatory Non-Empty Reason on Approval and Revocation', async () => {
        const createMockRes = () => ({
            statusCode: null,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; return this; }
        });

        const adminUser = { _id: new mongoose.Types.ObjectId(), email: 'admin@bp.in', role: 'Admin' };

        // Approval with empty string reason -> HTTP 400
        const emptyApproveRes = createMockRes();
        await approveDomain({
            user: adminUser,
            body: { domain: 'broker-valid.in', reason: '   ' }
        }, emptyApproveRes);
        assert.equal(emptyApproveRes.statusCode, 400);
        assert.ok(emptyApproveRes.body.message.includes('Approval reason is required and cannot be empty'));

        // Approval with missing reason -> HTTP 400
        const missingApproveRes = createMockRes();
        await approveDomain({
            user: adminUser,
            body: { domain: 'broker-valid.in' }
        }, missingApproveRes);
        assert.equal(missingApproveRes.statusCode, 400);

        // Revocation with empty reason -> HTTP 400
        const emptyRevokeRes = createMockRes();
        await revokeDomain({
            user: adminUser,
            body: { domain: 'broker-valid.in', reason: '' }
        }, emptyRevokeRes);
        assert.equal(emptyRevokeRes.statusCode, 400);
        assert.ok(emptyRevokeRes.body.message.includes('Revocation reason is required and cannot be empty'));
    });

    await t.test('28. Finding 3: Truthful API Outcomes: Database Outage Returns HTTP 503', async () => {
        const createMockRes = () => ({
            statusCode: null,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; return this; }
        });

        const adminUser = { _id: new mongoose.Types.ObjectId(), email: 'admin@bp.in', role: 'Admin' };

        // Disconnect MongoDB
        await mongoose.disconnect();

        try {
            // approveDomain -> 503
            const approveRes = createMockRes();
            await approveDomain({
                user: adminUser,
                body: { domain: 'any-valid.in', reason: 'Legit reason' }
            }, approveRes);
            assert.equal(approveRes.statusCode, 503);
            assert.equal(approveRes.body.success, false);
            assert.ok(approveRes.body.message.includes('Database connection unavailable'));

            // revokeDomain -> 503
            const revokeRes = createMockRes();
            await revokeDomain({
                user: adminUser,
                body: { domain: 'any-valid.in', reason: 'Legit reason' }
            }, revokeRes);
            assert.equal(revokeRes.statusCode, 503);

            // listDomains -> 503
            const listRes = createMockRes();
            await listDomains({}, listRes);
            assert.equal(listRes.statusCode, 503);

            // getDomainDetails -> 503
            const detailRes = createMockRes();
            await getDomainDetails({ params: { domain: 'any-valid.in' } }, detailRes);
            assert.equal(detailRes.statusCode, 503);
        } finally {
            await mongoose.connect(mongoUri);
        }
    });

    await t.test('29. Finding 3: Preserves Full Historical Audit Trail Across Repeated Cycles', async () => {
        const testDomain = 'audit-lifecycle-check.in';
        const adminId = new mongoose.Types.ObjectId();
        const adminEmail = 'super_admin@bharatproperties.in';

        // 1. Initial Approval
        await domainGovernancePolicy.registerDomainDurable({
            domain: testDomain,
            operatorId: adminId,
            operatorEmail: adminEmail,
            operatorRole: 'SuperAdmin',
            reason: 'Cycle 1: Initial RERA Verification'
        });

        // 2. Revocation
        await domainGovernancePolicy.revokeDomainDurable({
            domain: testDomain,
            operatorId: adminId,
            operatorEmail: adminEmail,
            operatorRole: 'SuperAdmin',
            reason: 'Cycle 2: License Lapsed'
        });

        // 3. Re-Approval
        await domainGovernancePolicy.registerDomainDurable({
            domain: testDomain,
            operatorId: adminId,
            operatorEmail: adminEmail,
            operatorRole: 'SuperAdmin',
            reason: 'Cycle 3: License Renewed by Authority'
        });

        // Inspect ApprovedDomain document in MongoDB
        const doc = await ApprovedDomain.findOne({ domain: testDomain }).lean();
        assert.ok(doc);
        assert.equal(doc.status, 'approved');
        assert.equal(doc.auditHistory.length, 3, 'auditHistory must record all 3 historical events');
        assert.equal(doc.auditHistory[0].status, 'approved');
        assert.equal(doc.auditHistory[0].reason, 'Cycle 1: Initial RERA Verification');
        assert.equal(doc.auditHistory[1].status, 'revoked');
        assert.equal(doc.auditHistory[1].reason, 'Cycle 2: License Lapsed');
        assert.equal(doc.auditHistory[2].status, 'approved');
        assert.equal(doc.auditHistory[2].reason, 'Cycle 3: License Renewed by Authority');

        // Inspect AuditLog collection in MongoDB
        const auditLogs = await AuditLog.find({ targetName: testDomain }).sort('createdAt').lean();
        assert.equal(auditLogs.length, 3, 'AuditLog collection must contain all 3 durable audit records');
        assert.equal(auditLogs[0].eventType, 'domain_approved');
        assert.equal(auditLogs[1].eventType, 'domain_revoked');
        assert.equal(auditLogs[2].eventType, 'domain_approved');
    });

});
