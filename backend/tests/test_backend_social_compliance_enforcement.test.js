process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Deal from '../models/Deal.js';
import Project from '../models/Project.js';
import Inventory from '../models/Inventory.js';
import Team from '../models/Team.js';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import MarketingContent from '../models/MarketingContent.js';
import OutboxEvent from '../models/OutboxEvent.js';
import Activity from '../models/Activity.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';

import facebookService from '../services/FacebookService.js';
import twitterService from '../services/TwitterService.js';
import linkedInService from '../services/LinkedInService.js';
import googleBusinessService from '../services/GoogleBusinessService.js';
import youtubeService from '../services/YouTubeService.js';
import portalSyndicationService from '../services/PortalSyndicationService.js';
import marketingPublishingService from '../services/MarketingPublishingService.js';
import publishService from '../services/PublishService.js';
import marketingService from '../services/MarketingService.js';
import marketingComplianceEnforcementService from '../services/MarketingComplianceEnforcementService.js';
import { postSocialMedia } from '../controllers/social.controller.js';
import { syndicateToPortals } from '../controllers/marketing.controller.js';
import {
    hasAuthoritativeTitleVerification,
    hasAuthoritativeReraApproval,
    hasAuthoritativeBankApproval,
    hasAuthoritativeReadyPossession,
    validateAuthoritativeDocumentRecord,
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
    const portalCalls = [];

    // Stubs
    let origFbPost;
    let origIgPost;
    let origLiPost;
    let origTwPost;
    let origGbPost;
    let origYtPost;
    let origDispatchToPortal;
    let origGetPortalConfig;

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
            email: 'admin@bharatproperties.co',
            role: { name: 'admin' },
            dataScope: 'all',
            tenantId: testTenantId
        };

        // Stub provider services
        origFbPost = facebookService.postToPage;
        origIgPost = facebookService.postToInstagram;
        origLiPost = linkedInService.postToOrganization;
        origTwPost = twitterService.postTweet;
        origGbPost = googleBusinessService.createPost;
        origYtPost = youtubeService.uploadVideo;
        origDispatchToPortal = portalSyndicationService._dispatchToPortal;
        origGetPortalConfig = portalSyndicationService.getConfig;

        portalSyndicationService.getConfig = async () => ({
            housing: { apiKey: 'mock_housing_key' },
            '99acres': { apiKey: 'mock_99acres_key' }
        });

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
        portalSyndicationService._dispatchToPortal = async (portalMeta, portalConf, maskedData, itemType) => {
            portalCalls.push({ portal: portalMeta.id, config: portalConf, data: maskedData, itemType });
            return { success: true, listingRef: `LST-mock-${portalMeta.id}`, timestamp: new Date().toISOString() };
        };

        // Create Seed Fixtures
        unverifiedDeal = await Deal.create({
            name: 'Unverified Sector 10 Plot',
            unitNo: 'Plot 42',
            location: 'Sector 10, Kurukshetra',
            price: 7500000,
            tenantId: testTenantId,
            assignedTo: testAdminUser._id,
            owner: testAdminUser._id,
            // No authorityVerification, no approvals
            isVerified: false
        });

        verifiedDeal = await Deal.create({
            name: 'Verified Royal Villa',
            unitNo: 'Villa 101',
            location: 'Sector 13, Kurukshetra',
            price: 15000000,
            progressPercentage: 100,
            tenantId: testTenantId,
            assignedTo: testAdminUser._id,
            owner: testAdminUser._id,
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
            reraDocumentId: 'doc-hrera-88',
            bankApproval: {
                bankName: 'SBI',
                status: 'APPROVED',
                sanctionLetterNumber: 'SBI/RE/2024/8892',
                documentId: 'doc-sbi-8892',
                verificationStatus: 'VERIFIED',
                sanctionDate: new Date()
            },
            occupancyCertificate: {
                certificateNumber: 'OC-KUK-2024-101',
                status: 'ISSUED',
                documentId: 'doc-oc-101',
                verificationStatus: 'VERIFIED',
                issueDate: new Date(),
                progressPercentage: 100
            }
        });

        // Create Authentic CRM Document & DocumentVersion records in MongoDB
        const sbiVer = await DocumentVersion.create({
            versionId: 'ver-sbi-8892',
            documentId: 'doc-sbi-8892',
            versionNumber: 1,
            providerInstanceId: 's3-primary',
            objectKey: 'documents/deals/sbi-sanction.pdf',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            mimeType: 'application/pdf',
            sizeBytes: 102400
        });

        await Document.create({
            documentId: 'doc-sbi-8892',
            entityType: 'Deal',
            entityId: verifiedDeal._id,
            metadata: {
                documentCategory: 'BANK_APPROVAL',
                documentType: 'SANCTION_LETTER',
                approvalAuthority: 'SBI'
            },
            currentVersionId: sbiVer._id,
            state: 'ACTIVE'
        });

        const ocVer = await DocumentVersion.create({
            versionId: 'ver-oc-101',
            documentId: 'doc-oc-101',
            versionNumber: 1,
            providerInstanceId: 's3-primary',
            objectKey: 'documents/deals/oc-certificate.pdf',
            checksum: 'c2e0b12398fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b866',
            mimeType: 'application/pdf',
            sizeBytes: 204800
        });

        await Document.create({
            documentId: 'doc-oc-101',
            entityType: 'Deal',
            entityId: verifiedDeal._id,
            metadata: {
                documentCategory: 'COMPLETION_CERTIFICATE',
                documentType: 'OCCUPANCY_CERTIFICATE',
                approvalAuthority: 'MUNICIPAL'
            },
            currentVersionId: ocVer._id,
            state: 'ACTIVE'
        });

        const reraVer = await DocumentVersion.create({
            versionId: 'ver-hrera-88',
            documentId: 'doc-hrera-88',
            versionNumber: 1,
            providerInstanceId: 's3-primary',
            objectKey: 'documents/deals/hrera-certificate.pdf',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            mimeType: 'application/pdf',
            sizeBytes: 153600
        });

        await Document.create({
            documentId: 'doc-hrera-88',
            entityType: 'Deal',
            entityId: verifiedDeal._id,
            metadata: {
                documentCategory: 'RERA_CERTIFICATE',
                documentType: 'RERA_CERTIFICATE',
                approvalAuthority: 'HRERA',
                documentNo: 'HRERA-PKL-KUK-2024-88'
            },
            currentVersionId: reraVer._id,
            state: 'ACTIVE'
        });
    });

    after(async () => {
        facebookService.postToPage = origFbPost;
        facebookService.postToInstagram = origIgPost;
        linkedInService.postToOrganization = origLiPost;
        twitterService.postTweet = origTwPost;
        googleBusinessService.createPost = origGbPost;
        youtubeService.uploadVideo = origYtPost;
        portalSyndicationService._dispatchToPortal = origDispatchToPortal;
        portalSyndicationService.getConfig = origGetPortalConfig;

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
        portalCalls.length = 0;
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

        // Loan assistance alone must fail closed
        const loanAssistance = {
            bankApproval: {
                bankName: 'SBI',
                status: 'APPROVED',
                category: 'LOAN_ASSISTANCE',
                sanctionLetterNumber: 'SBI-ASSIST-101',
                documentId: 'doc-sbi-assist-101',
                verificationStatus: 'VERIFIED'
            }
        };
        assert.equal(hasAuthoritativeBankApproval(loanAssistance), false, 'Loan assistance must never qualify as bank sanction');

        // Loan eligibility check alone must fail closed
        const loanEligibility = {
            bankApproval: {
                bankName: 'HDFC BANK',
                status: 'ELIGIBLE',
                label: 'ELIGIBILITY_CHECK',
                sanctionLetterNumber: 'HDFC-ELIG-202',
                documentId: 'doc-hdfc-elig-202',
                verificationStatus: 'VERIFIED'
            }
        };
        assert.equal(hasAuthoritativeBankApproval(loanEligibility), false, 'Loan eligibility must never qualify as bank sanction');

        // Manual string without real CRM document record or immutable hash must fail closed
        const manualBankWithoutDoc = {
            bankApproval: {
                bankName: 'AXIS BANK',
                status: 'APPROVED',
                sanctionLetterNumber: 'AXIS-SANCT-303',
                isManual: true
                // Missing documentId and contentHash
            }
        };
        assert.equal(hasAuthoritativeBankApproval(manualBankWithoutDoc), false, 'Manual string without document linkage or immutable hash must fail closed');

        // Valid evidence-backed bank approval with real CRM document record and verified status passes
        const validBank = {
            bankApproval: {
                bankName: 'ICICI BANK',
                status: 'APPROVED',
                sanctionLetterNumber: 'ICICI-SANCT-2024-998',
                documentId: 'doc-icici-sanct-998',
                verificationStatus: 'VERIFIED',
                sanctionDate: new Date(),
                documentRecord: {
                    documentId: 'doc-icici-sanct-998',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-icici-998',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                }
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
                status: 'ISSUED',
                documentId: 'doc-oc-1234',
                verificationStatus: 'VERIFIED'
            }
        };
        assert.equal(hasAuthoritativeReadyPossession(underConstruction), false, 'Under-construction property must never be ready possession');

        // Incomplete progress percentage (< 100) must fail closed
        const incompleteProgress = {
            progressPercentage: 85,
            possessionStatus: 'READY',
            occupancyCertificate: {
                certificateNumber: 'OC-1234',
                status: 'ISSUED',
                documentId: 'doc-oc-1234',
                verificationStatus: 'VERIFIED'
            }
        };
        assert.equal(hasAuthoritativeReadyPossession(incompleteProgress), false, 'Incomplete progress must never qualify as ready possession');

        // Missing certificate status must fail closed (no default approval)
        const missingStatusOC = {
            possessionStatus: 'READY',
            occupancyCertificate: {
                certificateNumber: 'OC-KUK-2024-551',
                documentId: 'doc-oc-551',
                verificationStatus: 'VERIFIED'
                // Missing status/approvalStatus
            }
        };
        assert.equal(hasAuthoritativeReadyPossession(missingStatusOC), false, 'Missing certificate status must not default to approved');

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
            progressPercentage: 100,
            occupancyCertificate: {
                certificateNumber: 'OC-KUK-2024-551',
                status: 'ISSUED',
                documentId: 'doc-oc-551',
                verificationStatus: 'VERIFIED',
                issueDate: new Date(),
                progressPercentage: 100,
                documentRecord: {
                    documentId: 'doc-oc-551',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-oc-551',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                }
            }
        };
        assert.equal(hasAuthoritativeReadyPossession(validOC), true);

        // Valid Completion Certificate in approvals array passes
        const validCCInApprovals = {
            possessionStatus: 'READY_TO_MOVE',
            progressPercentage: 100,
            approvals: [
                {
                    documentType: 'OCCUPANCY_CERTIFICATE',
                    status: 'APPROVED',
                    referenceNo: 'OC-HR-2024-99',
                    documentId: 'doc-oc-99',
                    verificationStatus: 'VERIFIED',
                    issueDate: new Date(),
                    progressPercentage: 100,
                    documentRecord: {
                        documentId: 'doc-oc-99',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-oc-99',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            ]
        };
        assert.equal(hasAuthoritativeReadyPossession(validCCInApprovals), true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 4: RERA PROVENANCE CONTRACT HARDENING
    // ─────────────────────────────────────────────────────────────────────────

    it('Gate 4: RERA approval requires approved status, valid reference, and immutable evidence provenance', () => {
        // Manually entered registration without provenance fails closed
        const manualWithoutProvenance = {
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED'
            // No source, no snapshot, no authority link
        };
        assert.equal(hasAuthoritativeReraApproval(manualWithoutProvenance), false, 'Manual registration without provenance must fail closed');

        // Merely having string source: 'RERA_PORTAL' without immutable hash/record/signature/snapshot fails closed!
        const bareReraPortalString = {
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL'
            // Missing snapshot, missing hash, missing documentId, missing reviewer signature
        };
        assert.equal(hasAuthoritativeReraApproval(bareReraPortalString), false, 'Bare string source: RERA_PORTAL alone must fail closed');

        // Explicit manual source fails closed
        const explicitManual = {
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED',
            source: 'MANUAL'
        };
        assert.equal(hasAuthoritativeReraApproval(explicitManual), false, 'Explicit manual source must fail closed');

        // Valid RERA with official portal provenance AND immutable verificationSnapshotId passes
        const verifiedProvenance = {
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            verificationSnapshotId: 'snap-rera-2024-11',
            snapshotContentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            lastVerifiedAt: new Date(),
            _resolvedSnapshot: {
                snapshotId: 'snap-rera-2024-11',
                authorityCode: 'HRERA',
                source: 'RERA_PORTAL',
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                verifiedAt: new Date(),
                status: 'APPROVED',
                createdByWorkerId: 'WORKER_RERA_SYNC'
            }
        };
        assert.equal(hasAuthoritativeReraApproval(verifiedProvenance), true);

        // Approvals array entry with official provenance AND linked document record passes
        const approvalWithProvenance = {
            approvals: [
                {
                    approvalAuthority: 'RERA',
                    registrationNo: 'PBRERA-SAS80-PR0456',
                    status: 'APPROVED',
                    date: new Date(),
                    source: 'GOVERNMENT_PORTAL',
                    documentId: 'doc-pbrera-456',
                    documentRecord: {
                        documentId: 'doc-pbrera-456',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-pbrera-456',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            ]
        };
        assert.equal(hasAuthoritativeReraApproval(approvalWithProvenance), true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 5: RECORD-LEVEL RBAC AND VISIBILITY
    // ─────────────────────────────────────────────────────────────────────────

    it('Gate 5: Enforces record-level RBAC & visibility filtering without leaking record existence', async () => {
        const otherTenantId = new mongoose.Types.ObjectId();
        const unauthorizedUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'unauthorized_agent@otherorg.com',
            role: { name: 'agent' },
            dataScope: 'assigned',
            tenantId: otherTenantId
        };

        // 1. Unauthorized user attempting to resolve deal in another tenant returns null (fail closed)
        const resolvedForOtherTenant = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
            verifiedDeal._id.toString(),
            'deal',
            unauthorizedUser
        );
        assert.equal(resolvedForOtherTenant, null, 'Cross-tenant or unauthorized entity resolution must return null');

        // 2. postSocialMedia with unauthorized entity fails closed (canonicalEntity is null -> treated as unverified)
        const unauthReq = {
            body: {
                platform: 'facebook',
                entityId: verifiedDeal._id.toString(),
                entityType: 'deal',
                text: 'Exclusive Villa with 100% Verified Title!'
            },
            user: unauthorizedUser
        };
        const unauthRes = mockResponse();
        await postSocialMedia(unauthReq, unauthRes);
        assert.equal(unauthRes.statusCode, 200);
        assert.equal(providerCalls.facebook.length, 1);
        assert.doesNotMatch(providerCalls.facebook[0].text, /100% verified title/i, 'Unauthorized entity must fail closed to unverified');

        // 3. Authorized internal system execution path (user.isSystem === true) succeeds
        const systemResolved = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
            verifiedDeal._id.toString(),
            'deal',
            { isSystem: true }
        );
        assert.ok(systemResolved, 'System worker execution path must successfully resolve entity');
        assert.equal(systemResolved._id.toString(), verifiedDeal._id.toString());

        // 4. PublishService.publish() rejects unauthorized user
        await assert.rejects(
            async () => {
                await publishService.publish(verifiedDeal, {
                    platforms: { facebook: true },
                    itemType: 'deal',
                    user: unauthorizedUser
                });
            },
            /inaccessible or unauthorized/i,
            'PublishService.publish must reject unauthorized user'
        );

        // 5. broadcastToHub rejects unauthorized user with 404
        const { broadcastToHub } = await import('../controllers/marketing.controller.js');
        const broadcastReq = {
            body: {
                id: verifiedDeal._id.toString(),
                type: 'deal',
                platforms: { facebook: true }
            },
            user: unauthorizedUser
        };
        const broadcastRes = mockResponse();
        await broadcastToHub(broadcastReq, broadcastRes);
        assert.equal(broadcastRes.statusCode, 404, 'broadcastToHub must return 404 for unauthorized user');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GATE 6: ADVERSARIAL SANITIZER VARIATIONS & NEUTRAL WORDING
    // ─────────────────────────────────────────────────────────────────────────

    it('Gate 6: Sanitizer catches adversarial spacing, hyphenation, casing, and neutralizes without promotional alternatives', () => {
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
            'Ready---Possession and Immediate   Possession available now!',
            'Double your investment in 3 years with 18% annual returns!',
            'Guaranteed monthly rental income with 100% safe property!',
            '100% bank finance available with Government-approved title!',
            'High Potential Rental Yields and assured rental yield!'
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
            assert.doesNotMatch(sanitized, /18%[\s\-_/]+annual/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /double[\s\-_/]+your[\s\-_/]+investment/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /100%[\s\-_/]+bank[\s\-_/]+finance/i, `Failed on: ${text}`);
            assert.doesNotMatch(sanitized, /govt[\s\-_/]+approved[\s\-_/]+title/i, `Failed on: ${text}`);
            // CRITICAL: NEVER replace with promotional alternatives like "High Potential Rental Yields"!
            assert.doesNotMatch(sanitized, /high[\s\-_/]*potential[\s\-_/]+rental[\s\-_/]+yield/i, `Sanitizer must not output promotional alternatives: ${sanitized}`);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: EVIDENCE INTEGRITY REGRESSION TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 10 — Evidence Integrity Regression Suite', () => {
        it('Evidence: Fake but syntactically valid document IDs fail closed', () => {
            const fakeDocId = {
                bankApproval: {
                    bankName: 'SBI',
                    status: 'APPROVED',
                    sanctionLetterNumber: 'SBI-FAKE-12345',
                    documentId: 'doc-fake-sbi-99999',
                    verificationStatus: 'VERIFIED'
                }
            };
            assert.equal(hasAuthoritativeBankApproval(fakeDocId), false, 'Bare syntactically valid documentId without resolved record must fail');
        });

        it('Evidence: Fake or short hash strings fail closed', () => {
            const fakeHash = {
                bankApproval: {
                    bankName: 'SBI',
                    status: 'APPROVED',
                    sanctionLetterNumber: 'SBI-FAKE-12345',
                    documentId: 'doc-sbi-123',
                    verificationStatus: 'VERIFIED',
                    documentRecord: {
                        documentId: 'doc-sbi-123',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-sbi-123',
                        currentVersion: { checksum: 'short_hash_123' } // < 16 chars
                    }
                }
            };
            assert.equal(hasAuthoritativeBankApproval(fakeHash), false, 'Checksum with <16 hex chars must fail');
        });

        it('Evidence: Nonexistent document records in DB fail closed during resolution', async () => {
            const dealWithNonexistentDoc = await Deal.create({
                name: 'Deal With Nonexistent Doc',
                unitNo: 'Unit 999',
                price: 5000000,
                tenantId: testAdminUser.tenantId,
                assignedTo: testAdminUser._id,
                owner: testAdminUser._id,
                bankApproval: {
                    bankName: 'SBI',
                    status: 'APPROVED',
                    sanctionLetterNumber: 'SBI-NOEXIST-999',
                    documentId: 'doc-nonexistent-in-mongodb-999',
                    verificationStatus: 'VERIFIED'
                }
            });

            const resolved = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
                dealWithNonexistentDoc._id,
                'deal',
                testAdminUser
            );
            assert.ok(resolved);
            assert.equal(resolved.bankApproval.documentRecord, null, 'Unresolved documentRecord must be null');
            assert.equal(hasAuthoritativeBankApproval(resolved), false, 'Deal with nonexistent document record must fail bank approval');
        });

        it('Evidence: Wrong-property document relationships fail closed', async () => {
            const wrongDocDeal = await Deal.create({
                name: 'Wrong Property Deal',
                unitNo: 'Unit Wrong',
                price: 8000000,
                tenantId: testAdminUser.tenantId,
                assignedTo: testAdminUser._id,
                owner: testAdminUser._id,
                bankApproval: {
                    bankName: 'SBI',
                    status: 'APPROVED',
                    sanctionLetterNumber: 'SBI/RE/2024/8892',
                    documentId: 'doc-sbi-8892', // Belongs to verifiedDeal, NOT wrongDocDeal
                    verificationStatus: 'VERIFIED'
                }
            });

            const resolved = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
                wrongDocDeal._id,
                'deal',
                testAdminUser
            );
            assert.ok(resolved);
            assert.equal(resolved.bankApproval.documentRecord, null, 'Document belonging to a different entity must be rejected');
            assert.equal(hasAuthoritativeBankApproval(resolved), false);
        });

        it('Evidence: Replaced or revoked document versions fail closed', () => {
            const revokedDoc = {
                bankApproval: {
                    bankName: 'SBI',
                    status: 'APPROVED',
                    sanctionLetterNumber: 'SBI-REVOKED-101',
                    documentId: 'doc-sbi-revoked',
                    verificationStatus: 'VERIFIED',
                    documentRecord: {
                        documentId: 'doc-sbi-revoked',
                        state: 'ACTIVE',
                        isDeleted: false,
                        isRevoked: true,
                        currentVersionId: 'ver-sbi-revoked',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            };
            assert.equal(hasAuthoritativeBankApproval(revokedDoc), false, 'Revoked document record must fail');

            const replacedVersionDoc = {
                bankApproval: {
                    bankName: 'SBI',
                    status: 'APPROVED',
                    sanctionLetterNumber: 'SBI-REPLACED-101',
                    documentId: 'doc-sbi-replaced',
                    currentVersionId: 'ver-old-123',
                    verificationStatus: 'VERIFIED',
                    documentRecord: {
                        documentId: 'doc-sbi-replaced',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-new-456',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            };
            assert.equal(hasAuthoritativeBankApproval(replacedVersionDoc), false, 'Replaced version must fail');
        });

        it('Evidence: verifiedByAuthority: true alone fails closed', () => {
            const bareFlag = {
                bankApproval: {
                    verifiedByAuthority: true,
                    status: 'APPROVED',
                    bankName: 'SBI'
                },
                occupancyCertificate: {
                    verifiedByAuthority: true,
                    status: 'ISSUED'
                },
                reraStatus: 'APPROVED',
                verifiedByAuthority: true
            };
            assert.equal(hasAuthoritativeBankApproval(bareFlag), false);
            assert.equal(hasAuthoritativeReadyPossession(bareFlag), false);
            assert.equal(hasAuthoritativeReraApproval(bareFlag), false);
        });

        it('Evidence: Authoritative source strings alone fail closed', () => {
            const sourceOnly = {
                bankApproval: {
                    bankName: 'SBI',
                    status: 'APPROVED',
                    source: 'BANK_PORTAL'
                },
                occupancyCertificate: {
                    status: 'ISSUED',
                    source: 'MUNICIPAL_PORTAL'
                },
                reraNumber: 'HRERA-PKL-KUK-2024-88',
                reraStatus: 'APPROVED',
                source: 'RERA_PORTAL'
            };
            assert.equal(hasAuthoritativeBankApproval(sourceOnly), false);
            assert.equal(hasAuthoritativeReadyPossession(sourceOnly), false);
            assert.equal(hasAuthoritativeReraApproval(sourceOnly), false);
        });

        it('Evidence: RERA evidence older than 180 days fails closed', () => {
            const staleRera = {
                reraNumber: 'HRERA-PKL-KUK-2024-88',
                reraStatus: 'APPROVED',
                source: 'RERA_PORTAL',
                verificationSnapshotId: 'snap-rera-stale',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1000)
            };
            assert.equal(hasAuthoritativeReraApproval(staleRera), false);
        });

        it('Evidence: RERA evidence without a verification timestamp fails closed', () => {
            const noTimestampRera = {
                reraNumber: 'HRERA-PKL-KUK-2024-88',
                reraStatus: 'APPROVED',
                source: 'RERA_PORTAL',
                verificationSnapshotId: 'snap-rera-notime',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0'
            };
            assert.equal(hasAuthoritativeReraApproval(noTimestampRera), false);
        });

        it('Evidence: OC/CC Boolean plus generic file reference fails closed', () => {
            const ocBooleanOnly = {
                occupancyCertificate: true,
                fileNumber: 'FN-KUK-1234',
                possessionStatus: 'READY'
            };
            assert.equal(hasAuthoritativeReadyPossession(ocBooleanOnly), false);
        });

        it('Evidence: Missing completion progress does not satisfy a mandatory 100% rule', () => {
            const incompleteProgress = {
                possessionStatus: 'READY',
                constructionStatus: 'UNDER_CONSTRUCTION',
                progressPercentage: 99,
                occupancyCertificate: {
                    certificateNumber: 'OC-123',
                    status: 'ISSUED',
                    documentId: 'doc-oc-123',
                    documentRecord: {
                        documentId: 'doc-oc-123',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-oc-123',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            };
            assert.equal(hasAuthoritativeReadyPossession(incompleteProgress), false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: RBAC ON LINKED RECORDS REGRESSION TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 10 — RBAC on Linked Records Regression Suite', () => {
        it('RBAC: Inaccessible linked Inventory cannot provide evidence', async () => {
            const agentTenantId = new mongoose.Types.ObjectId();
            const restrictedAgent = {
                _id: new mongoose.Types.ObjectId(),
                email: 'agent_scoped@company.com',
                role: { name: 'agent' },
                dataScope: 'assigned',
                tenantId: agentTenantId
            };

            // Inventory belongs to someone else in another scope/tenant
            const secretInventory = await Inventory.create({
                name: 'Secret Verified Penthouse',
                unitNo: 'PH-01',
                price: 25000000,
                tenantId: new mongoose.Types.ObjectId(),
                authorityVerification: {
                    authorityCode: 'HSVP',
                    authorityStatus: 'VERIFIED',
                    verificationSnapshotId: new mongoose.Types.ObjectId(),
                    snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                    lastVerifiedAt: new Date(),
                    litigationStatus: 'CLEAN'
                }
            });

            // Deal is assigned to restrictedAgent, but linked to secretInventory
            const agentDeal = await Deal.create({
                name: 'Agent Deal With Secret Inventory',
                unitNo: 'Unit 505',
                price: 25000000,
                tenantId: agentTenantId,
                assignedTo: restrictedAgent._id,
                owner: restrictedAgent._id,
                inventoryId: secretInventory._id
            });

            const resolved = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
                agentDeal._id,
                'deal',
                restrictedAgent
            );

            assert.ok(resolved, 'Deal should be accessible');
            assert.equal(resolved.inventory, null, 'Inaccessible linked inventory must be null');
            const facts = extractVerificationFacts(resolved);
            assert.equal(facts.isTitleVerified, false, 'Inaccessible inventory cannot provide title verification');
        });

        it('RBAC: Inaccessible linked Project cannot provide evidence', async () => {
            const agentTenantId = new mongoose.Types.ObjectId();
            const restrictedAgent = {
                _id: new mongoose.Types.ObjectId(),
                email: 'agent_project_scoped@company.com',
                role: { name: 'agent' },
                dataScope: 'assigned',
                tenantId: agentTenantId
            };

            // Project belongs to someone else
            const secretProject = await Project.create({
                name: 'Secret Grand Heights',
                tenantId: new mongoose.Types.ObjectId(),
                reraNumber: 'HRERA-PKL-KUK-2024-999',
                reraStatus: 'APPROVED',
                source: 'RERA_PORTAL',
                reraVerificationSnapshotId: 'snap-secret-proj-999',
                authorityVerification: {
                    authorityCode: 'HSVP',
                    authorityStatus: 'VERIFIED',
                    verificationSnapshotId: new mongoose.Types.ObjectId(),
                    snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                    lastVerifiedAt: new Date(),
                    litigationStatus: 'CLEAN'
                }
            });

            // Deal is assigned to restrictedAgent, linked to secretProject
            const agentDeal = await Deal.create({
                name: 'Agent Deal With Secret Project',
                unitNo: 'Unit 808',
                price: 12000000,
                tenantId: agentTenantId,
                assignedTo: restrictedAgent._id,
                owner: restrictedAgent._id,
                projectId: secretProject._id
            });

            const resolved = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
                agentDeal._id,
                'deal',
                restrictedAgent
            );

            assert.ok(resolved, 'Deal should be accessible');
            assert.equal(resolved.project, null, 'Inaccessible linked project must be null');
            const facts = extractVerificationFacts(resolved);
            assert.equal(facts.isReraApproved, false, 'Inaccessible project cannot provide RERA approval');
        });

        it('RBAC: Unauthenticated requests cannot use the internal system execution path', async () => {
            // An external caller trying to pass an untrusted user object with email and spoofed isSystem: true
            const spoofedUser = {
                email: 'attacker@evil.com',
                role: { name: 'agent' },
                isSystem: true,
                tenantId: new mongoose.Types.ObjectId()
            };

            const resolved = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
                verifiedDeal._id,
                'deal',
                spoofedUser
            );
            assert.equal(resolved, null, 'Spoofed isSystem from authenticated user must fail closed due to tenant mismatch');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: PORTAL PUBLISHING SECURITY REGRESSION TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 10 — Portal Publishing Security Regression Suite', () => {
        it('Portal Publishing: Inaccessible ID + forged propertyData returns 404 and produces 0 provider calls', async () => {
            const unauthorizedUser = {
                _id: new mongoose.Types.ObjectId(),
                email: 'intruder@otherorg.com',
                role: { name: 'agent' },
                dataScope: 'assigned',
                tenantId: new mongoose.Types.ObjectId()
            };

            const req = {
                body: {
                    id: verifiedDeal._id.toString(),
                    type: 'deal',
                    platforms: ['housing', '99acres'],
                    propertyData: {
                        title: 'Forged Property Claim',
                        price: 1000000,
                        isVerified: true
                    }
                },
                user: unauthorizedUser
            };
            const res = mockResponse();

            await syndicateToPortals(req, res);
            assert.equal(res.statusCode, 404, 'Must return 404 for inaccessible property');
            assert.equal(portalCalls.length, 0, 'Zero provider calls must be made');
        });

        it('Portal Publishing: Missing ID returns 400 and produces 0 provider calls', async () => {
            const req = {
                body: {
                    platforms: ['housing'],
                    propertyData: {
                        title: 'Raw Data Without ID',
                        price: 5000000
                    }
                },
                user: testAdminUser
            };
            const res = mockResponse();

            await syndicateToPortals(req, res);
            assert.equal(res.statusCode, 400, 'Must return 400 when canonical ID is missing');
            assert.equal(portalCalls.length, 0, 'Zero provider calls must be made');
        });

        it('Portal Publishing: Preview mode produces 0 provider calls and zero side effects', async () => {
            const req = {
                body: {
                    id: verifiedDeal._id.toString(),
                    type: 'deal',
                    preview: true,
                    platforms: ['housing', '99acres']
                },
                user: testAdminUser
            };
            const res = mockResponse();

            await syndicateToPortals(req, res);
            assert.equal(res.statusCode, 200);
            assert.ok(res.body.preview, 'Preview payload must be returned');
            assert.equal(portalCalls.length, 0, 'Preview must make zero live provider calls');
        });

        it('Portal Publishing: Valid canonical record dispatches to portals with compliance-sanitized data', async () => {
            const req = {
                body: {
                    id: verifiedDeal._id.toString(),
                    type: 'deal',
                    platforms: ['housing', '99acres'],
                    propertyData: {
                        description: 'Royal Villa! Guaranteed 20% Returns! 100% Bank Finance!'
                    }
                },
                user: testAdminUser
            };
            const res = mockResponse();

            await syndicateToPortals(req, res);
            assert.equal(res.statusCode, 200);
            assert.equal(portalCalls.length, 2, 'Must dispatch to both requested portals');

            for (const call of portalCalls) {
                assert.doesNotMatch(call.data.description, /guaranteed 20% returns/i, 'Prohibited returns claim must be sanitized before portal dispatch');
                assert.doesNotMatch(call.data.description, /100% bank finance/i, 'Prohibited 100% bank finance must be sanitized before portal dispatch');
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: AUTONOMOUS MARKETING COMPLIANCE REGRESSION TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 10 — Autonomous Marketing Compliance Regression Suite', () => {
        it('Autonomous Marketing: Unsanitized text is never persisted or returned as caption', async () => {
            const cycleResult = await marketingService.runAutonomousMarketingCycle({
                force: true,
                dryRun: false
            });

            assert.equal(cycleResult.success, true);
            assert.ok(cycleResult.captions, 'Cycle result must return channel captions');

            for (const [platform, caption] of Object.entries(cycleResult.captions)) {
                assert.doesNotMatch(caption, /guaranteed[\s\-_/]+returns/i, 'Caption must be sanitized');
                assert.doesNotMatch(caption, /high[\s\-_/]*potential[\s\-_/]+rental[\s\-_/]+yield/i, 'Promotional alternatives must not exist in caption');
            }

            // Inspect persisted MarketingContent record in MongoDB
            if (cycleResult.contentId) {
                const persisted = await MarketingContent.findById(cycleResult.contentId).lean();
                assert.ok(persisted, 'MarketingContent record must be persisted');
                assert.doesNotMatch(persisted.content, /guaranteed[\s\-_/]+returns/i, 'Persisted content in DB must be sanitized');
                assert.doesNotMatch(persisted.title, /guaranteed[\s\-_/]+returns/i, 'Persisted title in DB must be sanitized');
            }
        });

        it('Autonomous Marketing: Unsupported #VerifiedDeal hashtag is removed unless title is verified', () => {
            const unverifiedFacts = {
                isTitleVerified: false,
                isReraApproved: false,
                isBankApproved: false,
                isReadyPossession: false
            };
            const copyWithHashtags = 'Beautiful residential plot for sale in Kurukshetra! #VerifiedDeal #VerifiedProperty #RealEstate #Kurukshetra';
            const sanitized = validateAndSanitizeCopy(copyWithHashtags, unverifiedFacts, { platform: 'facebook' });

            assert.doesNotMatch(sanitized, /#VerifiedDeal/i, '#VerifiedDeal hashtag must be removed for unverified property');
            assert.doesNotMatch(sanitized, /#VerifiedProperty/i, '#VerifiedProperty hashtag must be removed for unverified property');
            assert.match(sanitized, /#RealEstate/i, 'Legitimate topic hashtags must remain intact');
            assert.match(sanitized, /#Kurukshetra/i, 'Legitimate location hashtags must remain intact');
        });

        it('Autonomous Marketing: Missing or empty deals in DB falls back to educational content without fake property claims', async () => {
            // Delete all deals temporarily
            await Deal.deleteMany({});

            const emptyCycle = await marketingService.runAutonomousMarketingCycle({
                force: true,
                pillar: 'ct-project',
                dryRun: true
            });

            assert.equal(emptyCycle.success, true);
            assert.equal(emptyCycle.pillar, 'ct-edu', 'Must fall back to educational pillar when no properties exist');
            for (const [platform, caption] of Object.entries(emptyCycle.captions || {})) {
                assert.doesNotMatch(caption, /100% verified title/i);
                assert.doesNotMatch(caption, /guaranteed/i);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: ADVERSARIAL SANITIZER REGRESSION TESTS
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 10 — Adversarial Sanitizer Regression Suite', () => {
        const unverifiedFacts = {
            isTitleVerified: false,
            isReraApproved: false,
            isBankApproved: false,
            isReadyPossession: false
        };

        const adversarialCases = [
            { raw: 'High potential rental yields in Sector 10!', pattern: /high[\s\-_/]*potential[\s\-_/]+rental[\s\-_/]+yield/i },
            { raw: 'Up to 20% annual returns guaranteed!', pattern: /up\s+to\s+20%\s+annual\s+returns/i },
            { raw: 'Fixed monthly returns of ₹50,000!', pattern: /fixed\s+monthly\s+returns/i },
            { raw: 'Assured ROI 18% with zero risk!', pattern: /assured\s+roi\s+18%/i },
            { raw: 'Guaranteed rental income for 5 years!', pattern: /guaranteed\s+rental\s+income/i },
            { raw: 'Risk-free investment in prime location!', pattern: /risk[\s\-_/]*free\s+investment/i },
            { raw: 'Double your investment in 3 years!', pattern: /double\s+your\s+investment/i },
            { raw: 'Government-approved title with immediate registry!', pattern: /government[\s\-_/]+approved\s+title/i },
            { raw: 'RERA certified and RERA compliant project!', pattern: /rera\s+certified/i },
            { raw: '100% bank finance available on this plot!', pattern: /100%\s+bank\s+finance/i },
            { raw: 'Possession guaranteed by next month!', pattern: /possession\s+guaranteed/i }
        ];

        for (const tc of adversarialCases) {
            it(`Sanitizer neutralizes: "${tc.raw}"`, () => {
                const sanitized = validateAndSanitizeCopy(tc.raw, unverifiedFacts, { platform: 'facebook' });
                assert.doesNotMatch(sanitized, tc.pattern, `Prohibited pattern must be neutralized: ${sanitized}`);
            });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 11: ROUND 4 EVIDENCE INTEGRITY & DOCUMENT VERSION CLOSURE SUITE
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 11 — Round 4 Evidence Integrity & Targeted Closure Suite', () => {
        // 1. Fake RERA snapshot and provenance bypass attempts (all 5 fail closed)
        it('RERA Bypass 1: Recent date + fake snapshot ID + fake hash fails closed without DB record', () => {
            const fake = {
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                source: 'RERA_PORTAL',
                verificationSnapshotId: 'snap-fake-12345678',
                snapshotContentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                lastVerifiedAt: new Date()
                // No _resolvedSnapshot or documentRecord
            };
            assert.equal(hasAuthoritativeReraApproval(fake), false);
        });

        it('RERA Bypass 2: Recent date + verifiedByAuthority: true fails closed without DB record', () => {
            const fake = {
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                verifiedByAuthority: true,
                lastVerifiedAt: new Date()
            };
            assert.equal(hasAuthoritativeReraApproval(fake), false);
        });

        it('RERA Bypass 3: Recent date + source: RERA_PORTAL fails closed without DB record', () => {
            const fake = {
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                source: 'RERA_PORTAL',
                lastVerifiedAt: new Date()
            };
            assert.equal(hasAuthoritativeReraApproval(fake), false);
        });

        it('RERA Bypass 4: Recent date + reviewer string + hash fails closed without DB record', () => {
            const fake = {
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                reviewedBy: 'Chief RERA Officer Haryana',
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                lastVerifiedAt: new Date()
            };
            assert.equal(hasAuthoritativeReraApproval(fake), false);
        });

        it('RERA Bypass 5: Embedded authorityVerification object with no underlying snapshot fails closed', () => {
            const fake = {
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                authorityVerification: {
                    authorityCode: 'HRERA',
                    status: 'VERIFIED',
                    verificationSnapshotId: 'snap-fake-9999',
                    snapshotContentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    lastVerifiedAt: new Date(),
                    litigationStatus: 'CLEAN'
                }
            };
            assert.equal(hasAuthoritativeReraApproval(fake), false);
        });

        // 2. DocumentVersion belongs to a different Document
        it('Document Version: DocumentVersion.documentId mismatching Document.documentId fails closed', () => {
            const candidateDoc = {
                documentId: 'doc-correct-100',
                documentRecord: {
                    documentId: 'doc-correct-100',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-100',
                    currentVersion: {
                        _id: 'ver-100',
                        documentId: 'doc-DIFFERENT-999', // Mismatch!
                        checksumAlgorithm: 'SHA-256',
                        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    }
                }
            };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, null, 'BANK'), false);
        });

        // 3. Wrong checksum algorithm and invalid digest length
        it('Document Version: Checksum algorithm not SHA-256 is rejected', () => {
            const candidateDoc = {
                documentId: 'doc-algo-bad',
                documentRecord: {
                    documentId: 'doc-algo-bad',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-bad-algo',
                    currentVersion: {
                        _id: 'ver-bad-algo',
                        documentId: 'doc-algo-bad',
                        checksumAlgorithm: 'MD5', // Invalid algorithm!
                        checksum: 'c2e0b12398fc1c149afbf4c8996fb924'
                    }
                }
            };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, null, 'BANK'), false);
        });

        it('Document Version: Checksum digest length less than 64 hex chars is rejected', () => {
            const candidateDoc = {
                documentId: 'doc-short-digest',
                documentRecord: {
                    documentId: 'doc-short-digest',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-short',
                    currentVersion: {
                        _id: 'ver-short',
                        documentId: 'doc-short-digest',
                        checksumAlgorithm: 'SHA-256',
                        checksum: 'e3b0c44298fc1c14' // Only 16 chars!
                    }
                }
            };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, null, 'BANK'), false);
        });

        // 4. Valid document but wrong document category
        it('Document Category: OCCUPANCY_CERTIFICATE document used for BANK claim is rejected', () => {
            const candidateDoc = {
                documentId: 'doc-oc-as-bank',
                documentRecord: {
                    documentId: 'doc-oc-as-bank',
                    state: 'ACTIVE',
                    isDeleted: false,
                    metadata: { documentCategory: 'OCCUPANCY_CERTIFICATE' },
                    currentVersionId: 'ver-oc',
                    currentVersion: {
                        _id: 'ver-oc',
                        documentId: 'doc-oc-as-bank',
                        checksumAlgorithm: 'SHA-256',
                        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    }
                }
            };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, null, 'BANK'), false);
        });

        it('Document Category: BANK_APPROVAL document used for POSSESSION claim is rejected', () => {
            const candidateDoc = {
                documentId: 'doc-bank-as-oc',
                documentRecord: {
                    documentId: 'doc-bank-as-oc',
                    state: 'ACTIVE',
                    isDeleted: false,
                    metadata: { documentCategory: 'BANK_APPROVAL' },
                    currentVersionId: 'ver-bank',
                    currentVersion: {
                        _id: 'ver-bank',
                        documentId: 'doc-bank-as-oc',
                        checksumAlgorithm: 'SHA-256',
                        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    }
                }
            };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, null, 'POSSESSION'), false);
        });

        // 5. Document linked to the wrong property
        it('Document Entity: Document linked to a different property entity is rejected', () => {
            const propertyA = { _id: new mongoose.Types.ObjectId() };
            const propertyB = { _id: new mongoose.Types.ObjectId() };

            const candidateDoc = {
                documentId: 'doc-prop-b',
                documentRecord: {
                    documentId: 'doc-prop-b',
                    entityType: 'Deal',
                    entityId: propertyB._id, // Belongs to Property B
                    state: 'ACTIVE',
                    isDeleted: false,
                    metadata: { documentCategory: 'BANK_APPROVAL' },
                    currentVersionId: 'ver-b',
                    currentVersion: {
                        _id: 'ver-b',
                        documentId: 'doc-prop-b',
                        checksumAlgorithm: 'SHA-256',
                        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    }
                }
            };
            // Attempting to evaluate document for Property A must fail
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, propertyA, 'BANK'), false);
        });

        // 6. Possession: Missing mandatory possession progress & progress contracts
        it('Possession: Missing progressPercentage fails closed', () => {
            const missingProgress = {
                possessionStatus: 'READY',
                // No progressPercentage on entity
                occupancyCertificate: {
                    certificateNumber: 'OC-123',
                    status: 'ISSUED',
                    documentId: 'doc-oc-123',
                    verificationStatus: 'VERIFIED',
                    issueDate: new Date(),
                    documentRecord: {
                        documentId: 'doc-oc-123',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-oc-123',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            };
            assert.equal(hasAuthoritativeReadyPossession(missingProgress), false);
        });

        it('Possession: progressPercentage === 99 fails closed', () => {
            const incompleteProgress = {
                possessionStatus: 'READY',
                progressPercentage: 99,
                occupancyCertificate: {
                    certificateNumber: 'OC-123',
                    status: 'ISSUED',
                    documentId: 'doc-oc-123',
                    verificationStatus: 'VERIFIED',
                    issueDate: new Date(),
                    documentRecord: {
                        documentId: 'doc-oc-123',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-oc-123',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            };
            assert.equal(hasAuthoritativeReadyPossession(incompleteProgress), false);
        });

        it('Possession: progressPercentage === 100 with authentic OC passes', () => {
            const completeProgress = {
                possessionStatus: 'READY',
                progressPercentage: 100,
                occupancyCertificate: {
                    certificateNumber: 'OC-123',
                    status: 'ISSUED',
                    documentId: 'doc-oc-123',
                    verificationStatus: 'VERIFIED',
                    issueDate: new Date(),
                    progressPercentage: 100,
                    documentRecord: {
                        documentId: 'doc-oc-123',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-oc-123',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            };
            assert.equal(hasAuthoritativeReadyPossession(completeProgress), true);
        });

        it('Possession: Contradictory progress across linked records (entity 100 vs project 85) fails closed', () => {
            const contradictory = {
                possessionStatus: 'READY',
                progressPercentage: 100,
                project: {
                    progressPercentage: 85 // Conflict!
                },
                occupancyCertificate: {
                    certificateNumber: 'OC-123',
                    status: 'ISSUED',
                    documentId: 'doc-oc-123',
                    verificationStatus: 'VERIFIED',
                    issueDate: new Date(),
                    documentRecord: {
                        documentId: 'doc-oc-123',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-oc-123',
                        currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    }
                }
            };
            assert.equal(hasAuthoritativeReadyPossession(contradictory), false);
        });

        it('Possession: 100% progress without authentic OC/CC document record fails closed', () => {
            const noDoc = {
                possessionStatus: 'READY',
                progressPercentage: 100
                // Missing occupancyCertificate / completionCertificate
            };
            assert.equal(hasAuthoritativeReadyPossession(noDoc), false);
        });

        // 7. Sanitizer semantic assertions: no unsupported replacement claims
        it('Sanitizer: Neutral replacement never injects unsupported financial or possession promises', () => {
            const unverifiedFacts = {
                isTitleVerified: false,
                isReraApproved: false,
                isBankApproved: false,
                isReadyPossession: false
            };
            const input = 'Guaranteed 20% ROI with assured rental income for 3 years! Possession guaranteed by December 2026! RERA registered project!';
            const sanitized = validateAndSanitizeCopy(input, unverifiedFacts, { platform: 'facebook' });

            // Semantic assertions: Ensure sanitized copy does NOT introduce other prohibited claims
            assert.doesNotMatch(sanitized, /8[\s\-_/]*10%/i, 'Must never inject 8-10% ROI');
            assert.doesNotMatch(sanitized, /fixed\s+rental/i, 'Must never inject fixed rental promises');
            assert.doesNotMatch(sanitized, /possession\s+scheduled/i, 'Must never inject unverified possession schedules');
            assert.doesNotMatch(sanitized, /rera\s+registered/i, 'Must never inject unverified RERA registration');
            assert.doesNotMatch(sanitized, /guaranteed/i, 'Must never contain guaranteed claims');
            assert.doesNotMatch(sanitized, /assured/i, 'Must never contain assured claims');
        });

        // 8. Autonomous Marketing Title Sanitization
        it('Autonomous Marketing: Prohibited claim in title is sanitized in return value and database persistence', async () => {
            const cycleResult = await marketingService.runAutonomousMarketingCycle({
                force: true,
                title: 'High-Yield Guaranteed Investment in Sector 13 with RERA Approved Plots!',
                dryRun: false
            });

            assert.equal(cycleResult.success, true);
            // Assert postTitle in return value
            assert.ok(cycleResult.postTitle, 'Cycle result must return postTitle');
            assert.doesNotMatch(cycleResult.postTitle, /guaranteed/i, 'Return title must not contain guaranteed');
            assert.doesNotMatch(cycleResult.postTitle, /high-yield/i, 'Return title must not contain high-yield');
            assert.doesNotMatch(cycleResult.postTitle, /rera approved/i, 'Return title must not contain unverified rera approved');

            // Assert persisted MarketingContent in MongoDB
            if (cycleResult.recordId || cycleResult.contentId) {
                const recId = cycleResult.recordId || cycleResult.contentId;
                const persisted = await MarketingContent.findById(recId).lean();
                assert.ok(persisted, 'MarketingContent must exist');
                assert.doesNotMatch(persisted.title, /guaranteed/i, 'Persisted DB title must not contain guaranteed');
                assert.doesNotMatch(persisted.title, /high-yield/i, 'Persisted DB title must not contain high-yield');
                assert.doesNotMatch(persisted.title, /rera approved/i, 'Persisted DB title must not contain unverified rera approved');
            }
        });
    });
});
