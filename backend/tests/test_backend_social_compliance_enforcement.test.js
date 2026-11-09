process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Deal from '../models/Deal.js';
import Project from '../models/Project.js';
import Inventory from '../models/Inventory.js';
import MarketingContent from '../models/MarketingContent.js';
import OutboxEvent from '../models/OutboxEvent.js';
import Activity from '../models/Activity.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

import facebookService from '../services/FacebookService.js';
import twitterService from '../services/TwitterService.js';
import linkedInService from '../services/LinkedInService.js';
import googleBusinessService from '../services/GoogleBusinessService.js';
import youtubeService from '../services/YouTubeService.js';
import marketingPublishingService from '../services/MarketingPublishingService.js';
import publishService from '../services/PublishService.js';
import marketingComplianceEnforcementService from '../services/MarketingComplianceEnforcementService.js';
import { postSocialMedia } from '../controllers/social.controller.js';
import {
    hasAuthoritativeTitleVerification,
    hasAuthoritativeReraApproval,
    hasAuthoritativeBankApproval,
    hasAuthoritativeReadyPossession,
    extractVerificationFacts,
    validateAndSanitizeCopy,
    generateCompliantFallback
} from '../utils/propertyComplianceValidator.js';

describe('Gate 1-6: Backend Social Publishing Compliance & Evidence Gate Suite', () => {
    let replset;
    let testAdminUser;
    let unverifiedDeal;
    let verifiedDeal;
    let verifiedProject;

    // Track provider invocations
    const providerCalls = {
        facebook: [],
        instagram: [],
        linkedin: [],
        twitter: [],
        googleBusiness: [],
        youtube: []
    };

    // Stubs
    let origFbPost;
    let origIgPost;
    let origLiPost;
    let origTwPost;
    let origGbPost;
    let origYtPost;

    const mockResponse = () => {
        const res = {
            statusCode: 200,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                return this;
            }
        };
        return res;
    };

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        await mongoose.connect(replset.getUri());

        const testTenantId = new mongoose.Types.ObjectId();
        testAdminUser = {
            _id: new mongoose.Types.ObjectId(),
            fullName: 'Compliance Admin',
            role: 'admin',
            tenantId: testTenantId
        };

        // Stub provider services
        origFbPost = facebookService.postToPage;
        origIgPost = facebookService.postToInstagram;
        origLiPost = linkedInService.postToOrganization;
        origTwPost = twitterService.postTweet;
        origGbPost = googleBusinessService.createPost;
        origYtPost = youtubeService.uploadVideo;

        facebookService.postToPage = async (text, imageUrl, format) => {
            providerCalls.facebook.push({ text, imageUrl, format });
            return { success: true, id: 'fb_post_123', postId: 'fb_post_123' };
        };
        facebookService.postToInstagram = async (text, imageUrl, format) => {
            providerCalls.instagram.push({ text, imageUrl, format });
            return { success: true, id: 'ig_post_123', postId: 'ig_post_123' };
        };
        linkedInService.postToOrganization = async (text, media, assetUrn) => {
            providerCalls.linkedin.push({ text, media, assetUrn });
            return { success: true, id: 'li_post_123' };
        };
        twitterService.postTweet = async (text, imageUrl) => {
            providerCalls.twitter.push({ text, imageUrl });
            return { success: true, id: 'tw_post_123' };
        };
        googleBusinessService.createPost = async (text, locationId, imageUrl) => {
            providerCalls.googleBusiness.push({ text, locationId, imageUrl });
            return { success: true, id: 'gb_post_123' };
        };
        youtubeService.uploadVideo = async (title, description, videoPath) => {
            providerCalls.youtube.push({ title, description, videoPath });
            return { success: true, id: 'yt_post_123' };
        };

        // Create Seed Fixtures
        unverifiedDeal = await Deal.create({
            name: 'Unverified Sector 10 Plot',
            unitNo: 'Plot 42',
            location: 'Sector 10, Kurukshetra',
            price: 7500000,
            tenantId: testTenantId,
            // No authorityVerification, no approvals
            isVerified: false
        });

        verifiedDeal = await Deal.create({
            name: 'Verified Royal Villa',
            unitNo: 'Villa 101',
            location: 'Sector 13, Kurukshetra',
            price: 15000000,
            tenantId: testTenantId,
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-hsvp-101',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: new Date(),
                litigationStatus: 'CLEAN',
                fileNumber: 'HSVP/2024/V-101',
                occupancyCertificate: true,
                occupancyCertificateRef: 'OC-HSVP-2024-101'
            },
            reraNumber: 'HRERA-PKL-KUK-2024-88',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            reraVerificationSnapshotId: 'snap-hrera-88',
            bankApproval: {
                bankName: 'SBI',
                status: 'APPROVED',
                sanctionLetterNumber: 'SBI/RE/2024/8892',
                sanctionDate: new Date()
            },
            occupancyCertificate: {
                certificateNumber: 'OC-KUK-2024-101',
                status: 'ISSUED',
                issueDate: new Date()
            }
        });
    });

    after(async () => {
        facebookService.postToPage = origFbPost;
        facebookService.postToInstagram = origIgPost;
        linkedInService.postToOrganization = origLiPost;
        twitterService.postTweet = origTwPost;
        googleBusinessService.createPost = origGbPost;
        youtubeService.uploadVideo = origYtPost;

        await mongoose.disconnect();
        if (replset) await replset.stop();
    });

    beforeEach(async () => {
        providerCalls.facebook.length = 0;
        providerCalls.instagram.length = 0;
        providerCalls.linkedin.length = 0;
        providerCalls.twitter.length = 0;
        providerCalls.googleBusiness.length = 0;
        providerCalls.youtube.length = 0;
        await OutboxEvent.deleteMany({});
        await Activity.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 1: BACKEND SOCIAL PUBLISHING COMPLIANCE (SCENARIOS 1 - 8)
    // ─────────────────────────────────────────────────────────────────────────

    it('Scenario 1: Direct immediate social request containing fabricated verified-title claims is sanitized', async () => {
        const req = {
            body: {
                platform: 'facebook',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                text: '🔥 Hot deal in Kurukshetra! 100% Verified Title & Clear Registry! Call today.'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.doesNotMatch(dispatchedText, /100% verified title/i);
        assert.doesNotMatch(dispatchedText, /clear registry/i);
        assert.match(dispatchedText, /Documentation status can be checked during due diligence/i);
    });

    it('Scenario 2: Direct immediate social request containing fabricated RERA approval is sanitized', async () => {
        const req = {
            body: {
                platform: 'facebook',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                text: 'Exclusive project! RERA Approved & RERA Compliant listing in Kurukshetra.'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.doesNotMatch(dispatchedText, /rera approved/i);
        assert.doesNotMatch(dispatchedText, /rera compliant/i);
    });

    it('Scenario 3: Direct immediate social request containing guaranteed returns is sanitized', async () => {
        const req = {
            body: {
                platform: 'twitter',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                text: 'High-Yield Investment Opportunity with Guaranteed Returns and 18% Assured ROI! Risk-free investment!'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.twitter.length, 1);

        const dispatchedText = providerCalls.twitter[0].text;
        assert.doesNotMatch(dispatchedText, /guaranteed returns/i);
        assert.doesNotMatch(dispatchedText, /assured roi/i);
        assert.doesNotMatch(dispatchedText, /risk-free/i);
        assert.doesNotMatch(dispatchedText, /high-yield investment opportunity/i);
    });

    it('Scenario 4: Direct request containing unsupported bank-loan approval is sanitized to assistance copy', async () => {
        const req = {
            body: {
                platform: 'facebook',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                text: 'Prime plot! Bank loan approved! Pre-approved loan from national bank.'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.doesNotMatch(dispatchedText, /bank loan approved/i);
        assert.match(dispatchedText, /Home loan assistance available as per eligibility/i);
    });

    it('Scenario 5: Direct request containing unsupported ready-possession claims is sanitized', async () => {
        const req = {
            body: {
                platform: 'facebook',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                text: 'Don\'t miss out on this ready possession opportunity! Immediate possession available.'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.doesNotMatch(dispatchedText, /ready possession/i);
        assert.doesNotMatch(dispatchedText, /immediate possession/i);
        assert.match(dispatchedText, /prime property opportunity/i);
    });

    it('Scenario 6: Request with generic isVerified: true boolean is disregarded', async () => {
        const req = {
            body: {
                platform: 'facebook',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                isVerified: true,
                titleVerified: true,
                text: '100% Verified Title property on prime road.'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.doesNotMatch(dispatchedText, /100% verified title/i);
        assert.match(dispatchedText, /Documentation status can be checked during due diligence/i);
    });

    it('Scenario 7: Request with forged client-side verificationFacts is disregarded', async () => {
        const req = {
            body: {
                platform: 'facebook',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                verificationFacts: {
                    isTitleVerified: true,
                    isReraApproved: true,
                    isBankApproved: true,
                    isReadyPossession: true
                },
                text: 'Verified Title & RERA Approved project with Bank Loan Approved.'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.doesNotMatch(dispatchedText, /verified title/i);
        assert.doesNotMatch(dispatchedText, /rera approved/i);
        assert.doesNotMatch(dispatchedText, /bank loan approved/i);
    });

    it('Scenario 8: Request with missing or inaccessible entity fails closed (treats all claims as unverified)', async () => {
        const nonExistentId = new mongoose.Types.ObjectId().toString();
        const req = {
            body: {
                platform: 'facebook',
                entityId: nonExistentId,
                entityType: 'deal',
                text: 'Verified Title property with Guaranteed Returns!'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.doesNotMatch(dispatchedText, /verified title/i);
        assert.doesNotMatch(dispatchedText, /guaranteed returns/i);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 1 & 6: SCHEDULED POSTS & OUTBOX PAYLOAD (SCENARIOS 9 - 11, 16)
    // ─────────────────────────────────────────────────────────────────────────

    it('Scenario 9 & 16: Scheduled request contains sanitized copy in Outbox payload', async () => {
        const scheduledTime = new Date(Date.now() + 3600000).toISOString();
        const req = {
            body: {
                platform: 'facebook',
                entityId: unverifiedDeal._id.toString(),
                entityType: 'deal',
                scheduledTime,
                text: 'Special launch! Verified Title and Guaranteed Returns of 20%!'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.scheduled, true);

        // Verify OutboxEvent payload was created with sanitized copy
        const outbox = await OutboxEvent.findOne({ aggregateType: 'Social' });
        assert.ok(outbox, 'OutboxEvent must be persisted');
        assert.equal(outbox.payload.jobType, 'scheduled-social-dispatch');
        assert.equal(outbox.payload.jobData.platform, 'facebook');
        assert.equal(outbox.payload.jobData.entityId, unverifiedDeal._id.toString());

        const payloadText = outbox.payload.jobData.text;
        assert.doesNotMatch(payloadText, /verified title/i);
        assert.doesNotMatch(payloadText, /guaranteed returns/i);
    });

    it('Scenario 10: Scheduled post whose verification expires before worker execution is re-sanitized', async () => {
        // Create deal that was verified 181 days ago (expired freshness)
        const expiredDeal = await Deal.create({
            name: 'Expired Verification Deal',
            unitNo: 'Plot 99',
            location: 'Kurukshetra',
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-expired-99',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: new Date(Date.now() - 185 * 24 * 60 * 60 * 1000), // > 180 days
                litigationStatus: 'CLEAN'
            }
        });

        const jobData = {
            platform: 'facebook',
            entityId: expiredDeal._id.toString(),
            entityType: 'deal',
            text: 'Exclusive listing with Verified Title in Kurukshetra!'
        };

        const revalidated = await marketingComplianceEnforcementService.revalidateScheduledPost(jobData);
        assert.equal(revalidated.facts.isTitleVerified, false, 'Expired verification must be evaluated as unverified');
        assert.doesNotMatch(revalidated.sanitizedText, /verified title/i);
        assert.match(revalidated.sanitizedText, /Documentation status can be checked during due diligence/i);
    });

    it('Scenario 11: Scheduled post whose verification was revoked before worker execution is re-sanitized', async () => {
        // Deal with active litigation / revoked verification
        const revokedDeal = await Deal.create({
            name: 'Revoked Verification Deal',
            unitNo: 'Plot 77',
            location: 'Kurukshetra',
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-revoked-77',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: new Date(),
                litigationStatus: 'DISPUTED' // Revoked / Litigation
            }
        });

        const jobData = {
            platform: 'facebook',
            entityId: revokedDeal._id.toString(),
            entityType: 'deal',
            text: 'Exclusive listing with 100% Verified Title in Kurukshetra!'
        };

        const revalidated = await marketingComplianceEnforcementService.revalidateScheduledPost(jobData);
        assert.equal(revalidated.facts.isTitleVerified, false, 'Litigation must revoke title verification');
        assert.doesNotMatch(revalidated.sanitizedText, /100% verified title/i);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 1: STORED MARKETINGCONTENT & ALTERNATE ROUTES (SCENARIO 12)
    // ─────────────────────────────────────────────────────────────────────────

    it('Scenario 12: Stored MarketingContent publishing with unsupported claims is sanitized before dispatch', async () => {
        // Create SystemSetting for LinkedIn
        await SystemSetting.findOneAndUpdate(
            { key: 'linkedin_integration' },
            { $set: { value: { accessToken: 'mock-ln-token-123' }, active: true } },
            { upsert: true }
        );

        const content = await MarketingContent.create({
            title: 'Stored Post',
            content: 'Invest now! Guaranteed Returns and 100% Verified Title!',
            platform: 'LinkedIn',
            date: '2026-11-09',
            dealId: unverifiedDeal._id
        });

        const result = await marketingPublishingService.publishToSocial(content._id.toString());
        assert.equal(result.success, true);
        assert.equal(providerCalls.linkedin.length, 1);

        const dispatchedText = providerCalls.linkedin[0].text;
        assert.doesNotMatch(dispatchedText, /guaranteed returns/i);
        assert.doesNotMatch(dispatchedText, /100% verified title/i);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 13: VALID EVIDENCE-BACKED CLAIMS REMAIN INTACT
    // ─────────────────────────────────────────────────────────────────────────

    it('Scenario 13: Valid evidence-backed claims remain intact across title, rera, bank, possession', async () => {
        const req = {
            body: {
                platform: 'facebook',
                entityId: verifiedDeal._id.toString(),
                entityType: 'deal',
                text: 'Villa 101 at Sector 13! Verified Title, RERA Approved, Bank Loan Approved, ready possession opportunity!'
            },
            user: testAdminUser
        };
        const res = mockResponse();

        await postSocialMedia(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);

        const dispatchedText = providerCalls.facebook[0].text;
        assert.match(dispatchedText, /verified title/i, 'Verified title must be preserved');
        assert.match(dispatchedText, /rera approved/i, 'RERA approved must be preserved');
        assert.match(dispatchedText, /bank loan approved/i, 'Bank loan approved must be preserved');
        assert.match(dispatchedText, /ready possession/i, 'Ready possession must be preserved');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 14 & 15: ADVERSARIAL SANITIZATION & PROVIDER FIDELITY
    // ─────────────────────────────────────────────────────────────────────────

    it('Scenario 14 & 15: Post-sanitization preserves factual details and neutralizes unsupported claims', async () => {
        // 1. Text with factual property details along with prohibited claims
        const textWithFacts = 'Plot 42 at Sector 10 for ₹75 Lakh! Guaranteed Returns! High-Yield Investment Opportunity! 100% Verified Title! RERA Approved!';
        const facts = { isTitleVerified: false, isReraApproved: false, isBankApproved: false, isReadyPossession: false };

        const sanitized = validateAndSanitizeCopy(textWithFacts, facts, { deal: unverifiedDeal, platform: 'facebook' });
        assert.doesNotMatch(sanitized, /guaranteed returns/i);
        assert.doesNotMatch(sanitized, /high-yield/i);
        assert.doesNotMatch(sanitized, /100% verified title/i);
        assert.doesNotMatch(sanitized, /rera approved/i);
        // Retains legitimate property info
        assert.match(sanitized, /Plot 42/i);
        assert.match(sanitized, /Sector 10/i);

        // 2. Empty or invalid copy triggers deterministic fallback containing canonical deal info
        const fallbackResult = validateAndSanitizeCopy(null, facts, { deal: unverifiedDeal, platform: 'facebook' });
        assert.match(fallbackResult, /Plot 42/i);
        assert.match(fallbackResult, /Sector 10/i);
        assert.match(fallbackResult, /Documentation status can be checked during due diligence/i);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 2: BANK APPROVAL EVIDENCE CONTRACT
    // ─────────────────────────────────────────────────────────────────────────

    it('Gate 2: Bank approval requires recognized institution, approved status, and valid evidence reference', () => {
        // Missing evidence reference
        const noRef = {
            bankApproval: {
                bankName: 'SBI',
                status: 'APPROVED'
                // Missing sanctionLetterNumber
            }
        };
        assert.equal(hasAuthoritativeBankApproval(noRef), false);

        // Placeholder evidence reference
        const placeholderRef = {
            bankApproval: {
                bankName: 'SBI',
                status: 'APPROVED',
                sanctionLetterNumber: 'n/a'
            }
        };
        assert.equal(hasAuthoritativeBankApproval(placeholderRef), false);

        // Unrecognized generic institution
        const genericBank = {
            bankApproval: {
                bankName: 'All Major Banks',
                status: 'APPROVED',
                sanctionLetterNumber: 'SANCTION-101'
            }
        };
        assert.equal(hasAuthoritativeBankApproval(genericBank), false);

        // Pending or applied status
        const pendingBank = {
            bankApproval: {
                bankName: 'HDFC',
                status: 'PENDING',
                sanctionLetterNumber: 'HDFC-8821'
            }
        };
        assert.equal(hasAuthoritativeBankApproval(pendingBank), false);

        // Generic booleans alone must fail closed
        const booleanOnly = {
            isBankApproved: true,
            bankLoanApproved: true,
            approvedBank: 'SBI'
        };
        assert.equal(hasAuthoritativeBankApproval(booleanOnly), false);

        // Valid evidence-backed bank approval passes
        const validBank = {
            bankApproval: {
                bankName: 'ICICI BANK',
                status: 'APPROVED',
                sanctionLetterNumber: 'ICICI-SANCT-2024-998',
                sanctionDate: new Date()
            }
        };
        assert.equal(hasAuthoritativeBankApproval(validBank), true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 3: READY POSSESSION EVIDENCE CONTRACT
    // ─────────────────────────────────────────────────────────────────────────

    it('Gate 3: Ready possession requires completion/occupancy certificate evidence and non-contradictory status', () => {
        // Contradictory under-construction status
        const underConstruction = {
            constructionStatus: 'UNDER_CONSTRUCTION',
            possessionStatus: 'READY',
            occupancyCertificate: {
                certificateNumber: 'OC-1234',
                status: 'ISSUED'
            }
        };
        assert.equal(hasAuthoritativeReadyPossession(underConstruction), false, 'Under-construction property must never be ready possession');

        // Bare status string without evidence
        const bareStatus = {
            possessionStatus: 'READY'
        };
        assert.equal(hasAuthoritativeReadyPossession(bareStatus), false, 'Bare status string alone must not prove ready possession');

        // Generic boolean without evidence
        const booleanOnly = {
            readyPossession: true,
            possessionStatus: 'READY_TO_MOVE'
        };
        assert.equal(hasAuthoritativeReadyPossession(booleanOnly), false, 'Generic boolean must not prove ready possession');

        // Past possession date alone without certificate evidence
        const pastDateOnly = {
            possessionDate: '2023-01-01',
            possessionStatus: 'READY'
        };
        assert.equal(hasAuthoritativeReadyPossession(pastDateOnly), false, 'Past possession date alone must not prove ready possession');

        // Valid Occupancy Certificate passes
        const validOC = {
            possessionStatus: 'READY',
            occupancyCertificate: {
                certificateNumber: 'OC-KUK-2024-551',
                status: 'ISSUED',
                issueDate: new Date()
            }
        };
        assert.equal(hasAuthoritativeReadyPossession(validOC), true);

        // Valid Completion Certificate in approvals array passes
        const validCCInApprovals = {
            possessionStatus: 'READY_TO_MOVE',
            approvals: [
                {
                    documentType: 'OCCUPANCY_CERTIFICATE',
                    status: 'APPROVED',
                    referenceNo: 'OC-HR-2024-99'
                }
            ]
        };
        assert.equal(hasAuthoritativeReadyPossession(validCCInApprovals), true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 4: RERA PROVENANCE CONTRACT
    // ─────────────────────────────────────────────────────────────────────────

    it('Gate 4: RERA approval requires approved status, valid reference, and authoritative source provenance', () => {
        // Manually entered registration without provenance fails closed
        const manualWithoutProvenance = {
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED'
            // No source, no snapshot, no authority link
        };
        assert.equal(hasAuthoritativeReraApproval(manualWithoutProvenance), false, 'Manual registration without provenance must fail closed');

        // Explicit manual source fails closed
        const explicitManual = {
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED',
            source: 'MANUAL'
        };
        assert.equal(hasAuthoritativeReraApproval(explicitManual), false, 'Explicit manual source must fail closed');

        // Valid RERA with official portal provenance passes
        const verifiedProvenance = {
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            verificationSnapshotId: 'snap-rera-2024-11'
        };
        assert.equal(hasAuthoritativeReraApproval(verifiedProvenance), true);

        // Approvals array entry with official provenance passes
        const approvalWithProvenance = {
            approvals: [
                {
                    approvalAuthority: 'RERA',
                    registrationNo: 'PBRERA-SAS80-PR0456',
                    status: 'APPROVED',
                    source: 'GOVERNMENT_PORTAL',
                    documentId: 'doc-pbrera-456'
                }
            ]
        };
        assert.equal(hasAuthoritativeReraApproval(approvalWithProvenance), true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 5: SANITIZER ADVERSARIAL VARIATIONS (PUNCTUATION, SPACING, CASING)
    // ─────────────────────────────────────────────────────────────────────────

    it('Gate 5: Sanitizer catches adversarial spacing, hyphenation, and casing variations', () => {
        const unverifiedFacts = {
            isTitleVerified: false,
            isReraApproved: false,
            isBankApproved: false,
            isReadyPossession: false
        };

        const samples = [
            'G-u-a-r-a-n-t-e-e-d   R-e-t-u-r-n-s for all buyers!',
            'Assured---ROI of 25% with Fixed   Returns!',
            'Zero---Risk and Risk - Free investment asset!',
            '100%   Verified   Title with Clear---Registry!',
            'R-E-R-A   Approved & RERA-Compliant project!',
            'Bank - Loan - Approved by SBI!',
            'Ready---Possession and Immediate   Possession available now!'
        ];

        for (const text of samples) {
            const sanitized = validateAndSanitizeCopy(text, unverifiedFacts, { deal: unverifiedDeal, platform: 'facebook' });
            assert.doesNotMatch(sanitized, /guaranteed[\s\-_/]+returns/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /assured[\s\-_/]+roi/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /fixed[\s\-_/]+returns/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /risk[\s\-_/]*free/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /verified[\s\-_/]+title/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /clear[\s\-_/]+registry/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /rera[\s\-_/]+approved/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /bank[\s\-_/]*loan[\s\-_/]+approved/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /ready[\s\-_/]+possession/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /immediate[\s\-_/]+possession/i, `Failed on: ${text}`);
        }
    });
});
