process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';
process.env.SYSTEM_SERVICE_SECRET = 'a-secure-32-byte-system-service-secret-for-testing-entropy-001';

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
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import facebookService from '../services/FacebookService.js';
import twitterService from '../services/TwitterService.js';
import linkedInService from '../services/LinkedInService.js';
import googleBusinessService from '../services/GoogleBusinessService.js';
import youtubeService from '../services/YouTubeService.js';
import portalSyndicationService from '../services/PortalSyndicationService.js';
import marketingPublishingService from '../services/MarketingPublishingService.js';
import publishService from '../services/PublishService.js';
import marketingService from '../services/MarketingService.js';
import { fork } from 'node:child_process';
import SystemServiceReplayLedgerModel from '../models/SystemServiceReplayLedger.js';
import { executePrivilegedAuditWrite } from '../services/internalAuditBridge.js';
import marketingComplianceEnforcementService, {
    generateSystemServiceSignature,
    verifySystemServiceSignature,
    calculateShannonEntropy,
    SystemServiceReplayLedger,
    clearSystemServiceReplayLedger,
    recordNonceConsumptionSync,
    recordNonceConsumptionDurable,
    verifySystemServiceSignatureDurable
} from '../services/MarketingComplianceEnforcementService.js';
import { AUDIT_CAPABILITY_TOKEN } from '../services/auditCapabilityToken.js';
import { DocumentAuditService } from '../services/DocumentAuditService.js';
import { postSocialMedia } from '../controllers/social.controller.js';
import { syndicateToPortals } from '../controllers/marketing.controller.js';
import {
    hasAuthoritativeTitleVerification,
    hasAuthoritativeReraApproval,
    hasAuthoritativeBankApproval,
    hasAuthoritativeReadyPossession,
    validateAuthoritativeDocumentRecord,
    hasAuthoritativeDocumentProvenance,
    validateExactSnapshotStates,
    isAuthorizedVerifier,
    hasStatutoryVerifierPermissions,
    TRUSTED_VERIFIER_ROLES,
    TRUSTED_SYSTEM_VERIFIER_IDS,
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
    let complianceRole;
    let complianceUser;
    let verifiedInventory;

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

        // Seed authentic compliance Role & User for real verifier authorization
        complianceRole = await Role.create({
            name: 'Compliance Officer',
            department: 'marketing',
            isSystemRole: false,
            moduleAccess: {
                authorityVerification: {
                    view: true,
                    create: true,
                    edit: true,
                    delete: false
                }
            },
            approvalRights: {
                approveAuthorityChanges: true,
                manageAuthoritySettings: true
            }
        });

        complianceUser = await User.create({
            fullName: 'Senior Compliance Officer',
            email: 'compliance.officer@bharatproperties.co',
            password: 'MockHashedPassword123!',
            department: 'marketing',
            role: complianceRole._id,
            isActive: true,
            status: 'active',
            tenantId: testTenantId
        });

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

        // Create authentic Inventory for verifiedDeal to satisfy PropertyAuthorityLink schema contract
        verifiedInventory = await Inventory.create({
            projectName: 'Verified Royal Villa',
            unitNo: 'Villa 101',
            category: 'Residential',
            tenantId: testTenantId,
            assignedTo: testAdminUser._id
        });
        verifiedDeal.inventoryId = verifiedInventory._id;
        await verifiedDeal.save();

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

        await DocumentAuditService.recordVerificationAudit({
            documentId: 'doc-sbi-8892',
            auditPayload: {
                documentId: 'doc-sbi-8892',
                versionId: String(sbiVer._id),
                entityId: verifiedDeal._id,
                entityType: 'Deal',
                verifierId: String(complianceUser._id),
                verifiedAt: new Date(),
                outcome: 'APPROVED'
            },
            verifierUser: complianceUser
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

        await DocumentAuditService.recordVerificationAudit({
            documentId: 'doc-oc-101',
            auditPayload: {
                documentId: 'doc-oc-101',
                versionId: String(ocVer._id),
                entityId: verifiedDeal._id,
                entityType: 'Deal',
                verifierId: String(complianceUser._id),
                verifiedAt: new Date(),
                outcome: 'APPROVED'
            },
            verifierUser: complianceUser
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

        await DocumentAuditService.recordVerificationAudit({
            documentId: 'doc-hrera-88',
            auditPayload: {
                documentId: 'doc-hrera-88',
                versionId: String(reraVer._id),
                entityId: verifiedDeal._id,
                entityType: 'Deal',
                verifierId: String(complianceUser._id),
                verifiedAt: new Date(),
                outcome: 'VERIFIED'
            },
            verifierUser: complianceUser
        });

        // Seed authentic PropertyAuthorityLink and PropertyVerificationSnapshot for verified relationship chain
        const authLink = await PropertyAuthorityLink.create({
            tenantId: verifiedDeal.tenantId || new mongoose.Types.ObjectId(),
            inventoryId: verifiedInventory._id,
            propertyId: 'HSVP-V-101',
            authorityCode: 'HSVP',
            identityVerified: true,
            matchEligibility: 'ELIGIBLE',
            isActive: true,
            createdBy: testAdminUser._id
        });

        await PropertyVerificationSnapshot.create({
            _id: new mongoose.Types.ObjectId(),
            snapshotId: 'snap-hrera-88',
            tenantId: verifiedDeal.tenantId || new mongoose.Types.ObjectId(),
            authorityCode: 'HSVP',
            linkId: authLink._id,
            isSealed: true,
            isRevoked: false,
            isSynthetic: false,
            provenance: 'LIVE',
            contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            observedAt: new Date(),
            createdByWorkerId: 'WORKER-AUTH-101',
            dataQuality: { status: 'COMPLETE' }
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
        const validBankDealId = new mongoose.Types.ObjectId();
        const validBankVerId = new mongoose.Types.ObjectId().toString();
        const validBank = {
            _id: validBankDealId,
            _entityType: 'Deal',
            bankApproval: {
                bankName: 'ICICI BANK',
                status: 'APPROVED',
                sanctionLetterNumber: 'ICICI-SANCT-2024-998',
                documentId: 'doc-icici-sanct-998',
                verificationStatus: 'VERIFIED',
                sanctionDate: new Date(),
                documentRecord: {
                    _isResolverVerified: true,
                    documentId: 'doc-icici-sanct-998',
                    entityType: 'Deal',
                    entityId: validBankDealId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: validBankVerId,
                    currentVersion: {
                        _id: validBankVerId,
                        versionId: validBankVerId,
                        documentId: 'doc-icici-sanct-998',
                        checksumAlgorithm: 'SHA-256',
                        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    },
                    verificationAudit: {
                        _verifierAuthorized: true,
                        _authorizedVerifierType: 'USER',
                        _verifierUser: {
                            _id: String(complianceUser._id),
                            fullName: 'Compliance Officer',
                            isActive: true,
                            status: 'active',
                            roleName: 'BANK_OFFICER',
                            role: {
                                name: 'Compliance Officer',
                                moduleAccess: { authorityVerification: { view: true, edit: true } },
                                approvalRights: { approveAuthorityChanges: true }
                            }
                        },
                        verifierId: String(complianceUser._id),
                        verifiedAt: new Date(),
                        outcome: 'APPROVED',
                        documentId: 'doc-icici-sanct-998',
                        versionId: validBankVerId,
                        entityId: validBankDealId,
                        entityType: 'Deal'
                    }
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
        const validOCDealId = new mongoose.Types.ObjectId();
        const validOCVerId = new mongoose.Types.ObjectId().toString();
        const validOC = {
            _id: validOCDealId,
            _entityType: 'Deal',
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
                    _isResolverVerified: true,
                    documentId: 'doc-oc-551',
                    entityType: 'Deal',
                    entityId: validOCDealId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: validOCVerId,
                    currentVersion: {
                        _id: validOCVerId,
                        versionId: validOCVerId,
                        documentId: 'doc-oc-551',
                        checksumAlgorithm: 'SHA-256',
                        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                    },
                    verificationAudit: {
                        _verifierAuthorized: true,
                        _authorizedVerifierType: 'USER',
                        _verifierUser: {
                            _id: String(complianceUser._id),
                            fullName: 'Compliance Officer',
                            isActive: true,
                            status: 'active',
                            roleName: 'COMPLIANCE_OFFICER',
                            role: {
                                name: 'Compliance Officer',
                                moduleAccess: { authorityVerification: { view: true, edit: true } },
                                approvalRights: { approveAuthorityChanges: true }
                            }
                        },
                        verifierId: String(complianceUser._id),
                        verifiedAt: new Date(),
                        outcome: 'APPROVED',
                        documentId: 'doc-oc-551',
                        versionId: validOCVerId,
                        entityId: validOCDealId,
                        entityType: 'Deal'
                    }
                }
            }
        };
        assert.equal(hasAuthoritativeReadyPossession(validOC), true);

        // Valid Completion Certificate in approvals array passes
        const validCCDealId = new mongoose.Types.ObjectId();
        const validCCVerId = new mongoose.Types.ObjectId().toString();
        const validCCInApprovals = {
            _id: validCCDealId,
            _entityType: 'Deal',
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
                        _isResolverVerified: true,
                        documentId: 'doc-oc-99',
                        entityType: 'Deal',
                        entityId: validCCDealId,
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: validCCVerId,
                        currentVersion: {
                            _id: validCCVerId,
                            versionId: validCCVerId,
                            documentId: 'doc-oc-99',
                            checksumAlgorithm: 'SHA-256',
                            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                        },
                        verificationAudit: {
                            _verifierAuthorized: true,
                            _authorizedVerifierType: 'USER',
                            _verifierUser: {
                                _id: String(complianceUser._id),
                                fullName: 'Compliance Officer',
                                isActive: true,
                                status: 'active',
                                roleName: 'COMPLIANCE_OFFICER',
                                role: {
                                    name: 'Compliance Officer',
                                    moduleAccess: { authorityVerification: { view: true, edit: true } },
                                    approvalRights: { approveAuthorityChanges: true }
                                }
                            },
                            verifierId: String(complianceUser._id),
                            verifiedAt: new Date(),
                            outcome: 'APPROVED',
                            documentId: 'doc-oc-99',
                            versionId: validCCVerId,
                            entityId: validCCDealId,
                            entityType: 'Deal'
                        }
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
        const reraTestPropId = new mongoose.Types.ObjectId();
        const reraTestTenantId = new mongoose.Types.ObjectId();
        const verifiedProvenance = {
            _id: reraTestPropId,
            _entityType: 'Inventory',
            tenantId: reraTestTenantId,
            reraNumber: 'HRERA-PKL-KUK-2024-11',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            verificationSnapshotId: 'snap-rera-2024-11',
            snapshotContentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            lastVerifiedAt: new Date(),
            _resolvedSnapshot: {
                _isResolverVerified: true,
                snapshotId: 'snap-rera-2024-11',
                authorityCode: 'HRERA',
                source: 'RERA_PORTAL',
                tenantId: reraTestTenantId,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                verifiedAt: new Date(),
                status: 'APPROVED',
                createdByWorkerId: 'WORKER_RERA_SYNC',
                isSealed: true,
                isRevoked: false,
                isSynthetic: false,
                provenance: 'LIVE',
                dataQuality: { status: 'COMPLETE' },
                _resolvedLink: {
                    _isResolverVerified: true,
                    tenantId: reraTestTenantId,
                    inventoryId: reraTestPropId,
                    propertyId: 'PLOT-KUK-11',
                    authorityCode: 'HRERA',
                    identityVerified: true,
                    matchEligibility: 'ELIGIBLE',
                    isActive: true
                }
            }
        };
        assert.equal(hasAuthoritativeReraApproval(verifiedProvenance), true);

        // Approvals array entry with official provenance AND linked document record passes
        const reraDocPropId = new mongoose.Types.ObjectId();
        const reraDocVerId = new mongoose.Types.ObjectId().toString();
        const approvalWithProvenance = {
            _id: reraDocPropId,
            _entityType: 'Deal',
            approvals: [
                {
                    approvalAuthority: 'RERA',
                    registrationNo: 'PBRERA-SAS80-PR0456',
                    status: 'APPROVED',
                    date: new Date(),
                    source: 'GOVERNMENT_PORTAL',
                    documentId: 'doc-pbrera-456',
                    documentRecord: {
                        _isResolverVerified: true,
                        documentId: 'doc-pbrera-456',
                        entityType: 'Deal',
                        entityId: reraDocPropId,
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: reraDocVerId,
                        metadata: { documentCategory: 'RERA_CERTIFICATE' },
                        currentVersion: {
                            _id: reraDocVerId,
                            versionId: reraDocVerId,
                            documentId: 'doc-pbrera-456',
                            checksumAlgorithm: 'SHA-256',
                            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                        },
                        verificationAudit: {
                            _verifierAuthorized: true,
                            _authorizedVerifierType: 'USER',
                            _verifierUser: {
                                _id: String(complianceUser._id),
                                fullName: 'Senior Compliance Officer',
                                isActive: true,
                                status: 'active',
                                roleName: 'COMPLIANCE_OFFICER',
                                role: {
                                    name: 'Compliance Officer',
                                    moduleAccess: { authorityVerification: { view: true, edit: true } },
                                    approvalRights: { approveAuthorityChanges: true }
                                }
                            },
                            verifierId: String(complianceUser._id),
                            verifiedAt: new Date(),
                            outcome: 'APPROVED',
                            documentId: 'doc-pbrera-456',
                            versionId: reraDocVerId,
                            entityId: reraDocPropId,
                            entityType: 'Deal'
                        }
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
            const dealId = new mongoose.Types.ObjectId();
            const verId = 'ver-oc-123';
            const completeProgress = {
                _id: dealId,
                _entityType: 'Deal',
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
                        _isResolverVerified: true,
                        documentId: 'doc-oc-123',
                        entityType: 'Deal',
                        entityId: dealId,
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: verId,
                        currentVersion: {
                            _id: verId,
                            versionId: verId,
                            documentId: 'doc-oc-123',
                            checksumAlgorithm: 'SHA-256',
                            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                        },
                        verificationAudit: {
                            _verifierAuthorized: true,
                            _authorizedVerifierType: 'USER',
                            _verifierUser: {
                                _id: String(complianceUser._id),
                                fullName: 'Senior Compliance Officer',
                                isActive: true,
                                status: 'active',
                                roleName: 'COMPLIANCE_OFFICER',
                                role: {
                                    name: 'Compliance Officer',
                                    moduleAccess: { authorityVerification: { view: true, edit: true } },
                                    approvalRights: { approveAuthorityChanges: true }
                                }
                            },
                            verifierId: String(complianceUser._id),
                            verifiedAt: new Date(),
                            outcome: 'APPROVED',
                            documentId: 'doc-oc-123',
                            versionId: verId,
                            entityId: dealId,
                            entityType: 'Deal'
                        }
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

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 12 — ROUND 5 AUDIT PROVENANCE, SNAPSHOT IDENTITY & ENTITY OWNERSHIP SUITE
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 12 — Round 5 Audit Provenance, Snapshot Identity & Entity Ownership Suite', () => {
        // ========== 1. REMOVE SYNTHETIC DOCUMENT VERIFICATION AUDIT ==========

        it('Audit Provenance: Document without genuine verificationAudit fails closed (no synthetic fallback)', () => {
            const docWithoutAudit = {
                documentId: 'doc-no-audit-1',
                documentRecord: {
                    documentId: 'doc-no-audit-1',
                    entityType: 'Deal',
                    state: 'ACTIVE', // ACTIVE alone does not mean verified!
                    isDeleted: false,
                    createdBy: 'USER-123',
                    createdAt: new Date(),
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                    // No verificationAudit or auditEvidence!
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docWithoutAudit), false, 'ACTIVE document without verification audit must fail closed');
        });

        it('Audit Provenance: rec.state === ACTIVE alone does not substitute for VERIFIED verification outcome', () => {
            const docActiveOnly = {
                documentId: 'doc-active-only',
                documentRecord: {
                    documentId: 'doc-active-only',
                    entityType: 'Deal',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        verifierId: 'CMP-OFFICER-1',
                        verifierRole: 'COMPLIANCE_OFFICER',
                        verifiedAt: new Date(),
                        outcome: 'PENDING' // Not VERIFIED or APPROVED!
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docActiveOnly), false, 'Non-verified audit outcome must fail closed');
        });

        it('Audit Provenance: Missing explicit verification timestamp fails closed (no new Date fallback)', () => {
            const docNoDate = {
                documentId: 'doc-no-date',
                documentRecord: {
                    documentId: 'doc-no-date',
                    entityType: 'Deal',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        verifierId: 'CMP-OFFICER-1',
                        verifierRole: 'COMPLIANCE_OFFICER',
                        outcome: 'VERIFIED'
                        // No verifiedAt timestamp!
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docNoDate), false, 'Missing verifiedAt timestamp must fail closed');
        });

        it('Audit Provenance: Arbitrary verifier string without recognized role fails closed', () => {
            const docArbitraryVerifier = {
                documentId: 'doc-arb-v',
                documentRecord: {
                    documentId: 'doc-arb-v',
                    entityType: 'Deal',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        verifierId: 'some-random-user-string',
                        verifiedAt: new Date(),
                        outcome: 'VERIFIED'
                        // No authorized role!
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docArbitraryVerifier), false, 'Arbitrary verifier string must fail closed');
            assert.equal(isAuthorizedVerifier('some-random-user-string', null), false);
        });

        it('Audit Provenance: Arbitrary 24-char ObjectId without authorized role fails closed', () => {
            const arbitraryId = new mongoose.Types.ObjectId().toString();
            const docArbObjectId = {
                documentId: 'doc-arb-id',
                documentRecord: {
                    documentId: 'doc-arb-id',
                    entityType: 'Deal',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        verifierId: arbitraryId,
                        verifiedAt: new Date(),
                        outcome: 'VERIFIED'
                        // No authorized role!
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docArbObjectId), false, 'Arbitrary 24-char ID without authorized role must fail closed');
            assert.equal(isAuthorizedVerifier(arbitraryId, null), false);
        });

        it('Audit Provenance: Authorized verifier with recognized role and non-future date passes', () => {
            const validVerId = String(complianceUser._id);
            const validEntId = new mongoose.Types.ObjectId().toString();
            const docValidAudit = {
                documentId: 'doc-valid-audit',
                documentRecord: {
                    _isResolverVerified: true,
                    documentId: 'doc-valid-audit',
                    entityType: 'Deal',
                    entityId: validEntId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { _id: 'ver-1', versionId: 'ver-1', checksumAlgorithm: 'SHA-256', checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        _verifierAuthorized: true,
                        _authorizedVerifierType: 'USER',
                        _verifierUser: {
                            _id: validVerId,
                            fullName: 'Senior Compliance Officer',
                            roleName: 'COMPLIANCE_OFFICER',
                            isActive: true,
                            status: 'active',
                            role: {
                                name: 'Compliance Officer',
                                moduleAccess: { authorityVerification: { view: true, edit: true } },
                                approvalRights: { approveAuthorityChanges: true }
                            }
                        },
                        verifierId: validVerId,
                        verifiedAt: new Date(),
                        outcome: 'VERIFIED',
                        documentId: 'doc-valid-audit',
                        versionId: 'ver-1',
                        entityId: validEntId,
                        entityType: 'Deal'
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docValidAudit), true, 'Genuine verification audit with authorized role must pass');
            assert.equal(isAuthorizedVerifier(validVerId, docValidAudit.documentRecord.verificationAudit), true);
        });

        it('Audit Provenance: Revoked or superseded audit record fails closed', () => {
            const docRevokedAudit = {
                documentId: 'doc-revoked-audit',
                documentRecord: {
                    documentId: 'doc-revoked-audit',
                    entityType: 'Deal',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        verifierId: 'CMP-AUD-889',
                        verifierRole: 'COMPLIANCE_OFFICER',
                        verifiedAt: new Date(),
                        outcome: 'VERIFIED',
                        isRevoked: true // Revoked!
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docRevokedAudit), false, 'Revoked audit record must fail closed');
        });

        it('Audit Provenance: Audit record documentId mismatch fails closed', () => {
            const docMismatchId = {
                documentId: 'doc-correct-id',
                documentRecord: {
                    documentId: 'doc-correct-id',
                    entityType: 'Deal',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        verifierId: 'CMP-AUD-889',
                        verifierRole: 'COMPLIANCE_OFFICER',
                        verifiedAt: new Date(),
                        outcome: 'VERIFIED',
                        documentId: 'doc-WRONG-id' // Mismatched!
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docMismatchId), false, 'Mismatched audit documentId must fail closed');
        });

        // ========== 2. SNAPSHOT RELATIONSHIP CHAIN ==========

        it('Snapshot Chain: Valid snapshot with valid link-to-property relationship passes', async () => {
            const propId = new mongoose.Types.ObjectId();
            const chainTenantId = new mongoose.Types.ObjectId();
            const link = await PropertyAuthorityLink.create({
                tenantId: chainTenantId,
                inventoryId: propId,
                propertyId: 'HSVP-PLOT-CHAIN-1',
                authorityCode: 'HSVP',
                identityVerified: true,
                matchEligibility: 'ELIGIBLE',
                isActive: true,
                createdBy: testAdminUser._id
            });

            const snapshot = await PropertyVerificationSnapshot.create({
                _id: new mongoose.Types.ObjectId(),
                snapshotId: 'snap-valid-chain-1',
                tenantId: chainTenantId,
                authorityCode: 'HSVP',
                linkId: link._id,
                isSealed: true,
                isRevoked: false,
                isSynthetic: false,
                provenance: 'LIVE',
                dataQuality: { status: 'COMPLETE' },
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                dataQuality: { status: 'COMPLETE' }
            });

            const testDeal = {
                _id: propId,
                _entityType: 'Inventory',
                tenantId: chainTenantId,
                inventoryId: propId,
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                lastVerifiedAt: new Date(),
                _resolvedSnapshot: {
                    ...snapshot.toObject(),
                    _isResolverVerified: true,
                    _resolvedLink: {
                        ...link.toObject(),
                        _isResolverVerified: true
                    }
                }
            };

            assert.equal(hasAuthoritativeReraApproval(testDeal), true, 'Valid snapshot relationship chain must pass');
        });

        it('Snapshot Chain: Snapshot linked to another property fails closed', async () => {
            const propertyA = new mongoose.Types.ObjectId();
            const propertyB = new mongoose.Types.ObjectId();

            const linkB = await PropertyAuthorityLink.create({
                tenantId: new mongoose.Types.ObjectId(),
                inventoryId: propertyB, // Linked to Property B
                propertyId: propertyB.toString(),
                authorityCode: 'HSVP',
                matchEligibility: 'ELIGIBLE',
                isActive: true,
                createdBy: testAdminUser._id
            });

            const snapshotB = await PropertyVerificationSnapshot.create({
                _id: new mongoose.Types.ObjectId(),
                snapshotId: 'snap-prop-b',
                tenantId: linkB.tenantId,
                authorityCode: 'HSVP',
                linkId: linkB._id,
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                dataQuality: { status: 'COMPLETE' }
            });

            // Property A attempts to use Snapshot B
            const dealA = {
                _id: propertyA,
                _entityType: 'Deal',
                inventoryId: propertyA,
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: {
                    ...snapshotB.toObject(),
                    _resolvedLink: linkB.toObject() // Points to property B
                }
            };

            assert.equal(hasAuthoritativeReraApproval(dealA), false, 'Snapshot linked to another property must fail closed');
        });

        it('Snapshot Chain: Missing PropertyAuthorityLink fails closed', () => {
            const fakeSnapshot = {
                authorityCode: 'HRERA',
                linkId: new mongoose.Types.ObjectId(),
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101'
                // No _resolvedLink or linkRecord!
            };

            const deal = {
                _id: new mongoose.Types.ObjectId(),
                _entityType: 'Deal',
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: fakeSnapshot
            };

            assert.equal(hasAuthoritativeReraApproval(deal), false, 'Missing PropertyAuthorityLink must fail closed');
        });

        it('Snapshot Chain: Missing property identity on link fails closed', () => {
            const linkNoIdentity = {
                inventoryId: null,
                propertyId: null,
                projectId: null,
                authorityCode: 'HRERA',
                isActive: true,
                matchEligibility: 'ELIGIBLE'
            };

            const snap = {
                authorityCode: 'HRERA',
                linkId: new mongoose.Types.ObjectId(),
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: linkNoIdentity
            };

            const deal = {
                _id: new mongoose.Types.ObjectId(),
                _entityType: 'Deal',
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: snap
            };

            assert.equal(hasAuthoritativeReraApproval(deal), false, 'Link with missing property identity must fail closed');
        });

        it('Snapshot Chain: Link ID incorrectly used directly as property ID fails closed', () => {
            const propertyId = new mongoose.Types.ObjectId();
            const snap = {
                authorityCode: 'HRERA',
                linkId: propertyId, // linkId was set directly to property ID without link establishing identity
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101'
                // No _resolvedLink!
            };

            const deal = {
                _id: propertyId,
                _entityType: 'Deal',
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: snap
            };

            assert.equal(hasAuthoritativeReraApproval(deal), false, 'Link ID used directly as property ID must fail closed');
        });

        it('Snapshot Chain: tenantId cannot substitute for property identity', () => {
            const tenantId = new mongoose.Types.ObjectId();
            const propA = new mongoose.Types.ObjectId();
            const propB = new mongoose.Types.ObjectId();

            const linkB = {
                tenantId: tenantId,
                inventoryId: propB, // Property B
                authorityCode: 'HRERA',
                isActive: true,
                matchEligibility: 'ELIGIBLE'
            };

            const snap = {
                tenantId: tenantId, // Same tenant!
                authorityCode: 'HRERA',
                linkId: new mongoose.Types.ObjectId(),
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: linkB
            };

            const dealA = {
                _id: propA,
                tenantId: tenantId, // Same tenant, different property
                _entityType: 'Deal',
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: snap
            };

            assert.equal(hasAuthoritativeReraApproval(dealA), false, 'tenantId must never substitute for property identity');
        });

        it('Snapshot Chain: Revoked, unsealed, stale, and restricted snapshots fail closed', () => {
            const baseLink = {
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HRERA',
                isActive: true,
                matchEligibility: 'ELIGIBLE'
            };

            // 1. Revoked
            const revokedSnap = {
                authorityCode: 'HRERA',
                isSealed: true,
                isRevoked: true, // Revoked!
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: baseLink
            };
            assert.equal(hasAuthoritativeReraApproval({ _id: baseLink.inventoryId, _entityType: 'Deal', reraNumber: 'HRERA-1', reraStatus: 'APPROVED', _resolvedSnapshot: revokedSnap }), false);

            // 2. Unsealed
            const unsealedSnap = {
                authorityCode: 'HRERA',
                isSealed: false, // Unsealed!
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: baseLink
            };
            assert.equal(hasAuthoritativeReraApproval({ _id: baseLink.inventoryId, _entityType: 'Deal', reraNumber: 'HRERA-1', reraStatus: 'APPROVED', _resolvedSnapshot: unsealedSnap }), false);

            // 3. Stale (> 180 days)
            const staleSnap = {
                authorityCode: 'HRERA',
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(Date.now() - 190 * 24 * 60 * 60 * 1000), // > 180 days!
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: baseLink
            };
            assert.equal(hasAuthoritativeReraApproval({ _id: baseLink.inventoryId, _entityType: 'Deal', reraNumber: 'HRERA-1', reraStatus: 'APPROVED', _resolvedSnapshot: staleSnap }), false);

            // 4. Restricted data quality
            const restrictedSnap = {
                authorityCode: 'HRERA',
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                dataQuality: { status: 'RESTRICTED' },
                _resolvedLink: baseLink
            };
            assert.equal(hasAuthoritativeReraApproval({ _id: baseLink.inventoryId, _entityType: 'Deal', reraNumber: 'HRERA-1', reraStatus: 'APPROVED', _resolvedSnapshot: restrictedSnap }), false);
        });

        // ========== 3. DOCUMENT ENTITYTYPE OWNERSHIP & COLLISION SIMULATION ==========

        it('Document Ownership: Document with entityType === Contact matching Deal ID is rejected (same-ID collision simulation)', async () => {
            const collisionId = new mongoose.Types.ObjectId();
            const collisionVer = await DocumentVersion.create({
                versionId: 'ver-collision-contact',
                documentId: 'doc-collision-contact',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/contacts/id.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 102400
            });

            await Document.create({
                documentId: 'doc-collision-contact',
                entityType: 'Contact', // Contact, NOT Deal!
                entityId: collisionId, // Same ID as Deal!
                metadata: {
                    documentCategory: 'BANK_APPROVAL'
                },
                currentVersionId: collisionVer._id,
                state: 'ACTIVE'
            });

            const dealWithCollision = {
                _id: collisionId,
                _entityType: 'Deal',
                bankApproval: {
                    documentId: 'doc-collision-contact',
                    bankName: 'HDFC',
                    status: 'APPROVED',
                    sanctionLetterNumber: 'HDFC-SANCT-999'
                }
            };

            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(dealWithCollision);
            assert.equal(dealWithCollision.bankApproval.documentRecord, null, 'Contact document must be rejected for Deal');

            // Direct validator check
            const candidateDoc = {
                documentId: 'doc-collision-contact',
                documentRecord: {
                    documentId: 'doc-collision-contact',
                    entityType: 'Contact',
                    entityId: collisionId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-collision-contact',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                }
            };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, dealWithCollision, 'BANK'), false, 'Cross-entity-type Contact document must fail closed');
        });

        it('Document Ownership: Document with entityType === Lead matching Deal ID is rejected', () => {
            const sharedId = new mongoose.Types.ObjectId();
            const candidateDoc = {
                documentId: 'doc-lead-col',
                documentRecord: {
                    documentId: 'doc-lead-col',
                    entityType: 'Lead', // Lead!
                    entityId: sharedId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-1',
                    currentVersion: { checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                }
            };
            const deal = { _id: sharedId, _entityType: 'Deal' };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, deal, 'BANK'), false, 'Lead document must fail closed for Deal');
        });

        it('Document Ownership: Document with entityType === Project matching Deal linked Project ID passes', () => {
            const dealId = new mongoose.Types.ObjectId();
            const projId = new mongoose.Types.ObjectId();

            const candidateDoc = {
                documentId: 'doc-proj-doc',
                documentRecord: {
                    _isResolverVerified: true,
                    documentId: 'doc-proj-doc',
                    entityType: 'Project', // Matches linked Project!
                    entityId: projId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    metadata: { documentCategory: 'RERA_CERTIFICATE' },
                    currentVersionId: 'ver-p1',
                    currentVersion: { _id: 'ver-p1', checksumAlgorithm: 'SHA-256', checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                }
            };
            const deal = { _id: dealId, _entityType: 'Deal', projectId: projId };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, deal, 'RERA'), true, 'Document for linked Project must pass');
        });

        it('Document Ownership: Document with entityType === Inventory matching Deal linked Inventory ID passes', () => {
            const dealId = new mongoose.Types.ObjectId();
            const invId = new mongoose.Types.ObjectId();

            const candidateDoc = {
                documentId: 'doc-inv-doc',
                documentRecord: {
                    _isResolverVerified: true,
                    documentId: 'doc-inv-doc',
                    entityType: 'Inventory', // Matches linked Inventory!
                    entityId: invId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    metadata: { documentCategory: 'BANK_APPROVAL' },
                    currentVersionId: 'ver-i1',
                    currentVersion: { _id: 'ver-i1', checksumAlgorithm: 'SHA-256', checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                }
            };
            const deal = { _id: dealId, _entityType: 'Deal', inventoryId: invId };
            assert.equal(validateAuthoritativeDocumentRecord(candidateDoc, deal, 'BANK'), true, 'Document for linked Inventory must pass');
        });

        // ========== 4. SANITIZER & TITLE COMPLIANCE REGRESSION ==========

        it('Sanitizer & Title: Custom title with unverified claims is sanitized and passes post-sanitization audit', () => {
            const unverifiedFacts = {
                isTitleVerified: false,
                isReraApproved: false,
                isBankApproved: false,
                isReadyPossession: false
            };
            const customTitle = 'Unbeatable Deal! 100% Guaranteed Returns & Verified Title in Prime Sector!';
            const sanitizedTitle = validateAndSanitizeCopy(customTitle, unverifiedFacts, { platform: 'facebook' });

            assert.doesNotMatch(sanitizedTitle, /guaranteed/i);
            assert.doesNotMatch(sanitizedTitle, /verified title/i);
            assert.match(sanitizedTitle, /Documentation status can be checked during due diligence/i);
        });

        it('Worker Execution Revalidation: Current evidence is revalidated rather than trusting previously scheduled facts', async () => {
            // Create a Deal with valid verification initially
            const tempDeal = await Deal.create({
                name: 'Expiring Deal',
                unitNo: 'Unit 990',
                location: 'Karnal',
                authorityVerification: {
                    authorityCode: 'HSVP',
                    status: 'VERIFIED',
                    verificationSnapshotId: 'snap-temp-990',
                    snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                    lastVerifiedAt: new Date(Date.now() - 190 * 24 * 60 * 60 * 1000), // Expired!
                    litigationStatus: 'CLEAN'
                }
            });

            // Simulate worker revalidation of scheduled post
            const jobData = {
                platform: 'facebook',
                entityId: tempDeal._id.toString(),
                entityType: 'deal',
                title: 'Prime Property with Verified Title',
                text: 'Luxury Unit 990 with Verified Title and Guaranteed 15% ROI!'
            };

            const revalidated = await marketingComplianceEnforcementService.revalidateScheduledPost(jobData);
            assert.equal(revalidated.facts.isTitleVerified, false, 'Expired verification must revalidate to false at execution time');
            assert.doesNotMatch(revalidated.sanitizedText, /guaranteed/i);
            assert.doesNotMatch(revalidated.sanitizedText, /15% roi/i);
            assert.doesNotMatch(revalidated.sanitizedText, /verified title/i);
            assert.doesNotMatch(revalidated.sanitizedTitle, /verified title/i);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 13 — ROUND 6 FINAL TRUST BOUNDARY SUITE
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 13 — Round 6 Final Trust Boundary Suite', () => {
        // ========== 1. REAL VERIFIER AUTHORIZATION ==========

        it('P0 Verifier: Forged verifier role string in audit object fails closed', () => {
            const fakeId = new mongoose.Types.ObjectId().toString();
            const auditForgedRole = {
                verifierId: fakeId,
                verifierRole: 'COMPLIANCE_OFFICER', // Untrusted string!
                verifiedAt: new Date(),
                outcome: 'VERIFIED',
                documentId: 'doc-forged-1',
                versionId: 'ver-1',
                entityId: fakeId,
                entityType: 'Deal'
            };
            assert.equal(isAuthorizedVerifier(fakeId, auditForgedRole), false, 'Forged role string without resolver authorization must fail closed');
            assert.equal(isAuthorizedVerifier(fakeId, 'COMPLIANCE_OFFICER'), false, 'Bare role string argument must fail closed');
        });

        it('P0 Verifier: Inactive user in User collection fails closed', async () => {
            const inactiveRole = await Role.create({
                name: 'Inactive Auditor Role',
                department: 'marketing',
                approvalRights: { approveAuthorityChanges: true }
            });
            const inactiveUser = await User.create({
                fullName: 'Inactive Officer',
                email: 'inactive.officer@bharatproperties.co',
                password: 'MockPassword123!',
                department: 'marketing',
                role: inactiveRole._id,
                isActive: false, // Inactive!
                status: 'inactive'
            });

            const candidateDoc = {
                documentId: 'doc-inactive-user',
                documentRecord: null
            };

            const docVer = await DocumentVersion.create({
                versionId: 'ver-inactive-doc',
                documentId: 'doc-inactive-user',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/inactive.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            const dealId = new mongoose.Types.ObjectId();
            await mongoose.connection.collection('documents').insertOne({
                documentId: 'doc-inactive-user',
                entityType: 'Deal',
                entityId: dealId,
                currentVersionId: docVer._id,
                state: 'ACTIVE',
                verificationAudit: {
                    documentId: 'doc-inactive-user',
                    versionId: String(docVer._id),
                    entityId: dealId,
                    entityType: 'Deal',
                    verifierId: String(inactiveUser._id),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                }
            });

            const testDeal = { _id: dealId, _entityType: 'Deal', bankApproval: candidateDoc };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(testDeal);
            assert.equal(candidateDoc.documentRecord, null, 'Inactive verifier user must fail closed during resolution');
        });

        it('P0 Verifier: User with role lacking compliance permissions fails closed', async () => {
            const standardAgentRole = await Role.create({
                name: 'Standard Field Agent',
                department: 'sales',
                moduleAccess: {
                    authorityVerification: { view: false, create: false, edit: false, delete: false }
                },
                approvalRights: { approveAuthorityChanges: false, manageAuthoritySettings: false }
            });
            const agentUser = await User.create({
                fullName: 'Field Agent',
                email: 'agent.user@bharatproperties.co',
                password: 'MockPassword123!',
                department: 'sales',
                role: standardAgentRole._id,
                isActive: true,
                status: 'active'
            });

            const docVer = await DocumentVersion.create({
                versionId: 'ver-agent-doc',
                documentId: 'doc-agent-user',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/agent.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            const dealId = new mongoose.Types.ObjectId();
            await mongoose.connection.collection('documents').insertOne({
                documentId: 'doc-agent-user',
                entityType: 'Deal',
                entityId: dealId,
                currentVersionId: docVer._id,
                state: 'ACTIVE',
                verificationAudit: {
                    documentId: 'doc-agent-user',
                    versionId: String(docVer._id),
                    entityId: dealId,
                    entityType: 'Deal',
                    verifierId: String(agentUser._id),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                }
            });

            const candidateDoc = { documentId: 'doc-agent-user' };
            const testDeal = { _id: dealId, _entityType: 'Deal', bankApproval: candidateDoc };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(testDeal);
            assert.equal(candidateDoc.documentRecord, null, 'User lacking compliance permissions must fail closed');
        });

        it('P0 Verifier: Arbitrary ObjectId without User record fails closed', async () => {
            const nonExistentUserId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-nonexist-doc',
                documentId: 'doc-nonexist-user',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/nonexist.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            const dealId = new mongoose.Types.ObjectId();
            await mongoose.connection.collection('documents').insertOne({
                documentId: 'doc-nonexist-user',
                entityType: 'Deal',
                entityId: dealId,
                currentVersionId: docVer._id,
                state: 'ACTIVE',
                verificationAudit: {
                    documentId: 'doc-nonexist-user',
                    versionId: String(docVer._id),
                    entityId: dealId,
                    entityType: 'Deal',
                    verifierId: String(nonExistentUserId),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                }
            });

            const candidateDoc = { documentId: 'doc-nonexist-user' };
            const testDeal = { _id: dealId, _entityType: 'Deal', bankApproval: candidateDoc };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(testDeal);
            assert.equal(candidateDoc.documentRecord, null, 'Non-existent verifier ObjectId must fail closed');
        });

        it('P0 Verifier: Arbitrary system ID string without HMAC signature fails closed', async () => {
            const dealId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-sys-fake',
                documentId: 'doc-sys-fake',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/sys-fake.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            await mongoose.connection.collection('documents').insertOne({
                documentId: 'doc-sys-fake',
                entityType: 'Deal',
                entityId: dealId,
                currentVersionId: docVer._id,
                state: 'ACTIVE',
                verificationAudit: {
                    documentId: 'doc-sys-fake',
                    versionId: String(docVer._id),
                    entityId: dealId,
                    entityType: 'Deal',
                    verifierId: 'SYSTEM_COMPLIANCE_ENGINE',
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                    // No systemSignature!
                }
            });

            const candidateDoc = { documentId: 'doc-sys-fake' };
            const testDeal = { _id: dealId, _entityType: 'Deal', bankApproval: candidateDoc };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(testDeal);
            assert.equal(candidateDoc.documentRecord, null, 'System service ID without HMAC signature must fail closed');
        });

        it('P0 Verifier: Authentic system service with valid HMAC signature passes', async () => {
            const dealId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-sys-auth',
                documentId: 'doc-sys-auth',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/sys-auth.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            const verifiedTime = new Date();
            const sysNonce = 'sec14-nonce-001';
            const validSig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {
                entityId: dealId,
                documentId: 'doc-sys-auth',
                nonce: sysNonce
            });

            await Document.create({
                documentId: 'doc-sys-auth',
                entityType: 'Deal',
                entityId: dealId,
                metadata: { documentCategory: 'BANK_APPROVAL' },
                currentVersionId: docVer._id,
                state: 'ACTIVE'
            });

            await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-sys-auth',
                auditPayload: {
                    documentId: 'doc-sys-auth',
                    versionId: String(docVer._id),
                    entityId: dealId,
                    entityType: 'Deal',
                    verifierId: 'SYSTEM_COMPLIANCE_ENGINE',
                    verifiedAt: verifiedTime,
                    outcome: 'APPROVED',
                    systemSignature: validSig,
                    systemNonce: sysNonce
                },
                systemContext: {
                    serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                    systemSignature: validSig,
                    nonce: sysNonce
                }
            });

            const candidateDoc = { documentId: 'doc-sys-auth' };
            const testDeal = { _id: dealId, _entityType: 'Deal', bankApproval: candidateDoc };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(testDeal);
            assert.ok(candidateDoc.documentRecord, 'System service with valid HMAC signature must resolve');
            assert.equal(candidateDoc._isResolverVerified, true);
        });

        it('P0 Verifier: Legitimate authorized compliance officer in database passes', async () => {
            const dealId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-legit-user',
                documentId: 'doc-legit-user',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/legit-user.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            await Document.create({
                documentId: 'doc-legit-user',
                entityType: 'Deal',
                entityId: dealId,
                metadata: { documentCategory: 'BANK_APPROVAL' },
                currentVersionId: docVer._id,
                state: 'ACTIVE'
            });

            await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-legit-user',
                auditPayload: {
                    documentId: 'doc-legit-user',
                    versionId: String(docVer._id),
                    entityId: dealId,
                    entityType: 'Deal',
                    verifierId: String(complianceUser._id),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                },
                verifierUser: complianceUser
            });

            const candidateDoc = { documentId: 'doc-legit-user' };
            const testDeal = { _id: dealId, _entityType: 'Deal', bankApproval: candidateDoc };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(testDeal);
            assert.ok(candidateDoc.documentRecord, 'Legitimate authorized verifier must resolve');
            assert.equal(candidateDoc._isResolverVerified, true);
        });

        // ========== 2. MANDATORY AUDIT LINKAGE ==========

        it('P0 Mandatory Audit Linkage: Missing any of the 7 core fields fails closed', () => {
            const baseValidAudit = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: String(complianceUser._id),
                    isActive: true,
                    status: 'active',
                    roleName: 'COMPLIANCE_OFFICER',
                    role: {
                        name: 'Compliance Officer',
                        moduleAccess: { authorityVerification: { view: true, edit: true } },
                        approvalRights: { approveAuthorityChanges: true }
                    }
                },
                verifierId: String(complianceUser._id),
                verifiedAt: new Date(),
                outcome: 'VERIFIED',
                documentId: 'doc-audit-test',
                versionId: 'ver-audit-test',
                entityId: '66f19ce95b90dffc37482fed',
                entityType: 'Deal'
            };

            const baseDoc = {
                documentId: 'doc-audit-test',
                documentRecord: {
                    _isResolverVerified: true,
                    documentId: 'doc-audit-test',
                    entityType: 'Deal',
                    entityId: '66f19ce95b90dffc37482fed',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-audit-test',
                    currentVersion: { _id: 'ver-audit-test', checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
                }
            };

            // 1. Missing documentId
            const docNoDocId = JSON.parse(JSON.stringify(baseDoc));
            docNoDocId.documentRecord.verificationAudit = { ...baseValidAudit, documentId: undefined };
            assert.equal(hasAuthoritativeDocumentProvenance(docNoDocId), false, 'Missing documentId must fail');

            // 2. Missing versionId
            const docNoVerId = JSON.parse(JSON.stringify(baseDoc));
            docNoVerId.documentRecord.verificationAudit = { ...baseValidAudit, versionId: undefined };
            assert.equal(hasAuthoritativeDocumentProvenance(docNoVerId), false, 'Missing versionId must fail');

            // 3. Missing entityId
            const docNoEntId = JSON.parse(JSON.stringify(baseDoc));
            docNoEntId.documentRecord.verificationAudit = { ...baseValidAudit, entityId: undefined };
            assert.equal(hasAuthoritativeDocumentProvenance(docNoEntId), false, 'Missing entityId must fail');

            // 4. Missing entityType
            const docNoEntType = JSON.parse(JSON.stringify(baseDoc));
            docNoEntType.documentRecord.verificationAudit = { ...baseValidAudit, entityType: undefined };
            assert.equal(hasAuthoritativeDocumentProvenance(docNoEntType), false, 'Missing entityType must fail');

            // 5. Missing verifierId
            const docNoVerif = JSON.parse(JSON.stringify(baseDoc));
            docNoVerif.documentRecord.verificationAudit = { ...baseValidAudit, verifierId: undefined };
            assert.equal(hasAuthoritativeDocumentProvenance(docNoVerif), false, 'Missing verifierId must fail');

            // 6. Missing verifiedAt
            const docNoTime = JSON.parse(JSON.stringify(baseDoc));
            docNoTime.documentRecord.verificationAudit = { ...baseValidAudit, verifiedAt: undefined };
            assert.equal(hasAuthoritativeDocumentProvenance(docNoTime), false, 'Missing verifiedAt must fail');

            // 7. Invalid outcome
            const docBadOutcome = JSON.parse(JSON.stringify(baseDoc));
            docBadOutcome.documentRecord.verificationAudit = { ...baseValidAudit, outcome: 'REVIEW_NEEDED' };
            assert.equal(hasAuthoritativeDocumentProvenance(docBadOutcome), false, 'Non-verified outcome must fail');
        });

        it('P0 Mandatory Audit Linkage: Embedded candidate doc.verificationAudit without resolved record is rejected', () => {
            const embeddedCandidateOnly = {
                documentId: 'doc-embedded-candidate',
                verificationAudit: {
                    documentId: 'doc-embedded-candidate',
                    versionId: 'ver-123',
                    entityId: '66f19ce95b90dffc37482fed',
                    entityType: 'Deal',
                    verifierId: String(complianceUser._id),
                    verifiedAt: new Date(),
                    outcome: 'VERIFIED'
                }
                // documentRecord is null / missing!
            };
            assert.equal(hasAuthoritativeDocumentProvenance(embeddedCandidateOnly), false, 'Embedded candidate audit without resolved CRM record must fail closed');
        });

        // ========== 3. SCHEMA ALIGNMENT & RELATIONSHIP CONTRACT ==========

        it('P0 Schema Alignment: Deal without linked inventory fails closed on authority link', () => {
            const snap = {
                _isResolverVerified: true,
                authorityCode: 'HSVP',
                tenantId: '66f19ce95b90dffc37482fed',
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: {
                    _isResolverVerified: true,
                    tenantId: '66f19ce95b90dffc37482fed',
                    inventoryId: '66f19ce95b90dffc37482fed',
                    propertyId: 'HSVP-PLOT-1',
                    authorityCode: 'HSVP',
                    identityVerified: true,
                    matchEligibility: 'ELIGIBLE',
                    isActive: true
                }
            };

            // Deal without linked inventoryId
            const dealNoInv = {
                _id: new mongoose.Types.ObjectId(),
                _entityType: 'Deal',
                reraNumber: 'HRERA-101',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: snap
                // inventoryId missing!
            };
            assert.equal(hasAuthoritativeReraApproval(dealNoInv), false, 'Deal without linked inventory must fail closed');
        });

        it('P0 Schema Alignment: link.identityVerified === false fails closed', () => {
            const invId = new mongoose.Types.ObjectId();
            const snap = {
                _isResolverVerified: true,
                authorityCode: 'HSVP',
                tenantId: '66f19ce95b90dffc37482fed',
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: {
                    _isResolverVerified: true,
                    tenantId: '66f19ce95b90dffc37482fed',
                    inventoryId: invId,
                    propertyId: 'HSVP-PLOT-1',
                    authorityCode: 'HSVP',
                    identityVerified: false, // Unverified identity!
                    matchEligibility: 'ELIGIBLE',
                    isActive: true
                }
            };

            const inventory = {
                _id: invId,
                _entityType: 'Inventory',
                reraNumber: 'HRERA-101',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: snap
            };
            assert.equal(hasAuthoritativeReraApproval(inventory), false, 'Link with identityVerified === false must fail closed');
        });

        it('P0 Schema Alignment: link.matchEligibility !== ELIGIBLE fails closed', () => {
            const invId = new mongoose.Types.ObjectId();
            const ineligibleStatuses = ['INCOMPLETE', 'NEEDS_REVIEW', 'AMBIGUOUS', 'INELIGIBLE'];

            for (const status of ineligibleStatuses) {
                const snap = {
                    _isResolverVerified: true,
                    authorityCode: 'HSVP',
                    tenantId: '66f19ce95b90dffc37482fed',
                    isSealed: true,
                    isRevoked: false,
                    contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    observedAt: new Date(),
                    createdByWorkerId: 'WORKER-101',
                    _resolvedLink: {
                        _isResolverVerified: true,
                        tenantId: '66f19ce95b90dffc37482fed',
                        inventoryId: invId,
                        propertyId: 'HSVP-PLOT-1',
                        authorityCode: 'HSVP',
                        identityVerified: true,
                        matchEligibility: status, // Not strictly ELIGIBLE!
                        isActive: true
                    }
                };

                const inventory = {
                    _id: invId,
                    _entityType: 'Inventory',
                    reraNumber: 'HRERA-101',
                    reraStatus: 'APPROVED',
                    _resolvedSnapshot: snap
                };
                assert.equal(hasAuthoritativeReraApproval(inventory), false, `Link with matchEligibility ${status} must fail closed`);
            }
        });

        it('P0 Schema Alignment: Tenant mismatch between snapshot and link fails closed', () => {
            const invId = new mongoose.Types.ObjectId();
            const snap = {
                _isResolverVerified: true,
                authorityCode: 'HSVP',
                tenantId: '66f19ce95b90dffc37482aaa', // Tenant A!
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: {
                    _isResolverVerified: true,
                    tenantId: '66f19ce95b90dffc37482bbb', // Tenant B!
                    inventoryId: invId,
                    propertyId: 'HSVP-PLOT-1',
                    authorityCode: 'HSVP',
                    identityVerified: true,
                    matchEligibility: 'ELIGIBLE',
                    isActive: true
                }
            };

            const inventory = {
                _id: invId,
                _entityType: 'Inventory',
                reraNumber: 'HRERA-101',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: snap
            };
            assert.equal(hasAuthoritativeReraApproval(inventory), false, 'Tenant mismatch between snapshot and link must fail closed');
        });

        it('P0 Schema Alignment: Authority code mismatch between snapshot and link fails closed', () => {
            const invId = new mongoose.Types.ObjectId();
            const snap = {
                _isResolverVerified: true,
                authorityCode: 'HSVP', // HSVP!
                tenantId: '66f19ce95b90dffc37482fed',
                isSealed: true,
                isRevoked: false,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                observedAt: new Date(),
                createdByWorkerId: 'WORKER-101',
                _resolvedLink: {
                    _isResolverVerified: true,
                    tenantId: '66f19ce95b90dffc37482fed',
                    inventoryId: invId,
                    propertyId: 'PLOT-1',
                    authorityCode: 'GMADA', // GMADA!
                    identityVerified: true,
                    matchEligibility: 'ELIGIBLE',
                    isActive: true
                }
            };

            const inventory = {
                _id: invId,
                _entityType: 'Inventory',
                reraNumber: 'HRERA-101',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: snap
            };
            assert.equal(hasAuthoritativeReraApproval(inventory), false, 'Authority code mismatch between snapshot and link must fail closed');
        });

        // ========== 4. ELIMINATE EMBEDDED SNAPSHOT FALLBACK ==========

        it('P0 Eliminate Embedded Fallback: Fabricated snapshot and link records without resolver proof fail closed', () => {
            const invId = new mongoose.Types.ObjectId();
            const fabricatedEntity = {
                _id: invId,
                _entityType: 'Inventory',
                reraNumber: 'HRERA-PKL-KUK-2024-99',
                reraStatus: 'APPROVED',
                authorityVerification: {
                    snapshotRecord: {
                        authorityCode: 'HSVP',
                        tenantId: '66f19ce95b90dffc37482fed',
                        isSealed: true,
                        isRevoked: false,
                        contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                        observedAt: new Date(),
                        linkRecord: {
                            tenantId: '66f19ce95b90dffc37482fed',
                            inventoryId: invId,
                            propertyId: 'HSVP-PLOT-1',
                            authorityCode: 'HSVP',
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            isActive: true
                        }
                        // Lacks _isResolverVerified: true!
                    }
                }
            };

            assert.equal(hasAuthoritativeReraApproval(fabricatedEntity), false, 'Fabricated snapshot/link without resolver proof must fail closed');
        });

        it('P0 Eliminate Embedded Fallback: Client-supplied embedded snapshot is cleared prior to resolver execution', async () => {
            const fakeEntity = {
                _id: new mongoose.Types.ObjectId(),
                _entityType: 'Deal',
                _resolvedSnapshot: { fake: 'client-injected-snapshot' },
                authorityVerification: {
                    snapshotRecord: { fake: 'client-injected-snapshot' }
                }
            };

            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(fakeEntity);
            assert.equal(fakeEntity._resolvedSnapshot, null, 'Client-injected snapshot must be wiped by resolver');
            assert.equal(fakeEntity.authorityVerification.snapshotRecord, null, 'Client-injected snapshotRecord must be wiped by resolver');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 14: ROUND 7 FINAL TRUST BOUNDARY HARDENING SUITE
    // ─────────────────────────────────────────────────────────────────────────

    describe('Section 14 — Round 7 Final Trust Boundary Hardening Suite', () => {
        // ========== 1. STRICT STATUTORY VERIFIER AUTHORIZATION ==========
        it('Statutory Verifier: Trusted role name without required permissions fails closed', () => {
            const auditContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'active',
                    role: {
                        name: 'COMPLIANCE_OFFICER',
                        moduleAccess: { authorityVerification: { view: true, edit: false } },
                        approvalRights: { approveAuthorityChanges: true }
                    }
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', auditContext), false, 'Missing edit permission must fail closed');
        });

        it('Statutory Verifier: canApproveDeal alone fails closed', () => {
            const auditContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'active',
                    role: {
                        name: 'Manager',
                        canApproveDeal: true,
                        moduleAccess: {},
                        approvalRights: {}
                    }
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', auditContext), false, 'canApproveDeal alone must not grant statutory verification rights');
        });

        it('Statutory Verifier: view permission alone fails closed', () => {
            const auditContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'active',
                    role: {
                        name: 'Auditor',
                        moduleAccess: { authorityVerification: { view: true, edit: false } },
                        approvalRights: { approveAuthorityChanges: false }
                    }
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', auditContext), false, 'View-only access must fail closed');
        });

        it('Statutory Verifier: approvalRights alone without module edit fails closed', () => {
            const auditContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'active',
                    role: {
                        name: 'Approver',
                        moduleAccess: { authorityVerification: { view: false, edit: false } },
                        approvalRights: { approveAuthorityChanges: true }
                    }
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', auditContext), false, 'Approval rights without module edit must fail closed');
        });

        it('Statutory Verifier: Inactive, suspended, or deleted user fails closed', () => {
            const validRole = {
                moduleAccess: { authorityVerification: { view: true, edit: true } },
                approvalRights: { approveAuthorityChanges: true }
            };

            const inactiveContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: false, // Inactive!
                    status: 'active',
                    role: validRole
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', inactiveContext), false);

            const suspendedContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'suspended', // Suspended!
                    role: validRole
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', suspendedContext), false);

            const deletedContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'active',
                    isDeleted: true, // Deleted!
                    role: validRole
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', deletedContext), false);
        });

        it('Statutory Verifier: Missing or deleted Role fails closed', () => {
            const noRoleContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'active',
                    role: null
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', noRoleContext), false);

            const deletedRoleContext = {
                _verifierAuthorized: true,
                _authorizedVerifierType: 'USER',
                _verifierUser: {
                    _id: '66f19ce95b90dffc37482fed',
                    isActive: true,
                    status: 'active',
                    role: {
                        isDeleted: true,
                        moduleAccess: { authorityVerification: { view: true, edit: true } },
                        approvalRights: { approveAuthorityChanges: true }
                    }
                }
            };
            assert.equal(isAuthorizedVerifier('66f19ce95b90dffc37482fed', deletedRoleContext), false);
        });

        it('Statutory Verifier: Immediate revocation enforcement on fresh verification resolution', async () => {
            const revRole = await Role.create({
                name: 'Temporary Compliance Lead',
                department: 'marketing',
                moduleAccess: { authorityVerification: { view: true, edit: true } },
                approvalRights: { approveAuthorityChanges: true }
            });
            const revUser = await User.create({
                fullName: 'Revocable Verifier',
                email: 'revocable@bharatproperties.co',
                password: 'MockHashedPassword123!',
                department: 'marketing',
                role: revRole._id,
                isActive: true,
                status: 'active',
                tenantId: verifiedDeal.tenantId
            });

            const dealId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-rev-test',
                documentId: 'doc-rev-test',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/rev-test.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            await Document.create({
                documentId: 'doc-rev-test',
                entityType: 'Deal',
                entityId: dealId,
                metadata: { documentCategory: 'BANK_APPROVAL' },
                currentVersionId: docVer._id,
                state: 'ACTIVE'
            });

            await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-rev-test',
                auditPayload: {
                    documentId: 'doc-rev-test',
                    versionId: String(docVer._id),
                    entityId: dealId,
                    entityType: 'Deal',
                    verifierId: String(revUser._id),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                },
                verifierUser: revUser
            });

            // 1. Initial resolution succeeds
            const testCandidate = { documentId: 'doc-rev-test' };
            const dealTest = { _id: dealId, _entityType: 'Deal', bankApproval: testCandidate };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(dealTest);
            assert.ok(testCandidate.documentRecord, 'Must resolve with active permissions');

            // 2. Revoke approval permission on Role
            revRole.approvalRights.approveAuthorityChanges = false;
            await revRole.save();

            // 3. Fresh resolution must fail closed
            const freshCandidate = { documentId: 'doc-rev-test' };
            const freshDealTest = { _id: dealId, _entityType: 'Deal', bankApproval: freshCandidate };
            await marketingComplianceEnforcementService.resolveAuthoritativeEvidence(freshDealTest);
            assert.equal(freshCandidate.documentRecord, null, 'Must fail closed immediately when permission is revoked');
        });

        // ========== 2. SYSTEM HMAC SECRET INTEGRITY ==========
        it('System Secret: Missing or weak secret fails closed', () => {
            const verifiedTime = new Date();
            // Test weak secret (< 32 chars)
            assert.throws(() => {
                generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {}, 'short-secret');
            }, /SYSTEM_SERVICE_SECRET_UNAVAILABLE/);

            // Test former insecure hard-coded fallback secret
            assert.throws(() => {
                generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {}, 'crm-system-service-internal-secret-phase6-compliance');
            }, /SYSTEM_SERVICE_SECRET_UNAVAILABLE/);
        });

        it('System Secret: Context tampering (entityId or documentId) fails closed', () => {
            const verifiedTime = new Date();
            const sysNonce = 'sec14-context-nonce-001';
            const ctx = {
                entityId: 'deal-123',
                documentId: 'doc-123',
                nonce: sysNonce
            };
            const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, ctx);

            // Valid signature with exact matching context passes
            assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, {
                entityId: 'deal-123',
                documentId: 'doc-123',
                nonce: sysNonce,
                idempotencyKey: 'idemp-ctx-test'
            }), true);

            // Mismatched entityId fails
            assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, {
                entityId: 'deal-TAMPERED',
                documentId: 'doc-123',
                nonce: sysNonce
            }), false);

            // Mismatched documentId fails
            assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, {
                entityId: 'deal-123',
                documentId: 'doc-TAMPERED',
                nonce: sysNonce
            }), false);

            // Wrong service ID fails
            assert.equal(verifySystemServiceSignature('FORGED_SERVICE_ID', verifiedTime, sig, {
                entityId: 'deal-123',
                documentId: 'doc-123',
                nonce: sysNonce
            }), false);
        });

        it('System Secret: Forged plain JS object without valid HMAC signature fails closed', async () => {
            const fakeSysDoc = {
                documentId: 'doc-fake-sys',
                documentRecord: {
                    _isResolverVerified: true,
                    documentId: 'doc-fake-sys',
                    entityType: 'Deal',
                    entityId: '66f19ce95b90dffc37482fed',
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-fake-1',
                    currentVersion: { _id: 'ver-fake-1', checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        _verifierAuthorized: true,
                        _authorizedVerifierType: 'SYSTEM',
                        _systemAuthenticated: false, // Not cryptographically authenticated!
                        verifierId: 'SYSTEM_COMPLIANCE_ENGINE',
                        verifiedAt: new Date(),
                        outcome: 'APPROVED',
                        documentId: 'doc-fake-sys',
                        versionId: 'ver-fake-1',
                        entityId: '66f19ce95b90dffc37482fed',
                        entityType: 'Deal'
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(fakeSysDoc), false, 'System verifier without authenticated HMAC must fail closed');
        });

        // ========== 3. POSITIVE VERIFIED STATES & SYNTHETIC SNAPSHOT PROTECTION ==========
        it('Positive Verified States: Missing or false states fail closed', () => {
            const tId = new mongoose.Types.ObjectId();
            const propId = new mongoose.Types.ObjectId();
            const baseSnap = {
                _isResolverVerified: true,
                snapshotId: 'snap-test-pos',
                authorityCode: 'HRERA',
                source: 'RERA_PORTAL',
                tenantId: tId,
                contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                verifiedAt: new Date(),
                observedAt: new Date(),
                status: 'APPROVED',
                createdByWorkerId: 'WORKER_RERA_SYNC',
                isSealed: true,
                isRevoked: false,
                isSynthetic: false,
                provenance: 'LIVE',
                dataQuality: { status: 'COMPLETE' },
                _resolvedLink: {
                    _isResolverVerified: true,
                    tenantId: tId,
                    inventoryId: propId,
                    propertyId: 'PLOT-POS-1',
                    authorityCode: 'HRERA',
                    identityVerified: true,
                    matchEligibility: 'ELIGIBLE',
                    isActive: true
                }
            };

            const baseEntity = {
                _id: propId,
                _entityType: 'Inventory',
                tenantId: tId,
                reraNumber: 'HRERA-101',
                reraStatus: 'APPROVED',
                source: 'RERA_PORTAL',
                lastVerifiedAt: new Date()
            };

            // 1. isSealed missing/false
            const unsealed = { ...baseEntity, _resolvedSnapshot: { ...baseSnap, isSealed: false } };
            assert.equal(hasAuthoritativeReraApproval(unsealed), false, 'Unsealed snapshot must fail');

            // 2. isRevoked === true
            const revoked = { ...baseEntity, _resolvedSnapshot: { ...baseSnap, isRevoked: true } };
            assert.equal(hasAuthoritativeReraApproval(revoked), false, 'Revoked snapshot must fail');

            // 3. dataQuality status RESTRICTED
            const restricted = { ...baseEntity, _resolvedSnapshot: { ...baseSnap, dataQuality: { status: 'RESTRICTED' } } };
            assert.equal(hasAuthoritativeReraApproval(restricted), false, 'Restricted snapshot must fail');

            // 4. isSynthetic === true
            const synthetic = { ...baseEntity, _resolvedSnapshot: { ...baseSnap, isSynthetic: true } };
            assert.equal(hasAuthoritativeReraApproval(synthetic), false, 'Synthetic snapshot must fail');

            // 5. provenance === 'SYNTHETIC_FIXTURE'
            const fixture = { ...baseEntity, _resolvedSnapshot: { ...baseSnap, provenance: 'SYNTHETIC_FIXTURE' } };
            assert.equal(hasAuthoritativeReraApproval(fixture), false, 'Synthetic fixture provenance must fail');

            // 6. missing/unrecognized provenance
            const unknownProv = { ...baseEntity, _resolvedSnapshot: { ...baseSnap, provenance: undefined } };
            assert.equal(hasAuthoritativeReraApproval(unknownProv), false, 'Missing provenance must fail');

            // 7. link.isActive === false
            const inactiveLink = {
                ...baseEntity,
                _resolvedSnapshot: {
                    ...baseSnap,
                    _resolvedLink: { ...baseSnap._resolvedLink, isActive: false }
                }
            };
            assert.equal(hasAuthoritativeReraApproval(inactiveLink), false, 'Inactive link must fail');

            // 8. link.matchEligibility !== 'ELIGIBLE'
            const ineligibleLink = {
                ...baseEntity,
                _resolvedSnapshot: {
                    ...baseSnap,
                    _resolvedLink: { ...baseSnap._resolvedLink, matchEligibility: 'NEEDS_REVIEW' }
                }
            };
            assert.equal(hasAuthoritativeReraApproval(ineligibleLink), false, 'Non-ELIGIBLE match eligibility must fail');

            // 9. Authentic live sealed snapshot passes
            const authentic = { ...baseEntity, _resolvedSnapshot: baseSnap };
            assert.equal(hasAuthoritativeReraApproval(authentic), true, 'Authentic live sealed snapshot must pass');
        });

        // ========== 4. STRICT 3-WAY TENANT BINDING ==========
        it('Tenant Binding: Mismatches across snapshot, link, canonical entity, or inventory fail closed', () => {
            const orgTenant = new mongoose.Types.ObjectId();
            const foreignTenant = new mongoose.Types.ObjectId();
            const propId = new mongoose.Types.ObjectId();

            const createValidSetup = (snapT, linkT, entT) => ({
                _id: propId,
                _entityType: 'Inventory',
                tenantId: entT,
                reraNumber: 'HRERA-101',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: {
                    _isResolverVerified: true,
                    snapshotId: 'snap-tenant-test',
                    authorityCode: 'HRERA',
                    source: 'RERA_PORTAL',
                    tenantId: snapT,
                    contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    verifiedAt: new Date(),
                    status: 'APPROVED',
                    isSealed: true,
                    isRevoked: false,
                    isSynthetic: false,
                    provenance: 'LIVE',
                    _resolvedLink: {
                        _isResolverVerified: true,
                        tenantId: linkT,
                        inventoryId: propId,
                        propertyId: 'PLOT-T-1',
                        authorityCode: 'HRERA',
                        identityVerified: true,
                        matchEligibility: 'ELIGIBLE',
                        isActive: true
                    }
                }
            });

            // Missing canonical entity tenant
            const missingEntT = createValidSetup(orgTenant, orgTenant, undefined);
            assert.equal(hasAuthoritativeReraApproval(missingEntT), false, 'Missing entity tenant must fail');

            // Snapshot tenant mismatch
            const snapMismatch = createValidSetup(foreignTenant, orgTenant, orgTenant);
            assert.equal(hasAuthoritativeReraApproval(snapMismatch), false, 'Snapshot foreign tenant must fail');

            // Link tenant mismatch
            const linkMismatch = createValidSetup(orgTenant, foreignTenant, orgTenant);
            assert.equal(hasAuthoritativeReraApproval(linkMismatch), false, 'Link foreign tenant must fail');

            // Entity tenant mismatch with snapshot/link
            const entMismatch = createValidSetup(orgTenant, orgTenant, foreignTenant);
            assert.equal(hasAuthoritativeReraApproval(entMismatch), false, 'Entity foreign tenant must fail');

            // Deal linked Inventory foreign tenant mismatch
            const dealWithForeignInv = {
                _id: new mongoose.Types.ObjectId(),
                _entityType: 'Deal',
                tenantId: orgTenant,
                inventoryId: propId,
                reraNumber: 'HRERA-101',
                reraStatus: 'APPROVED',
                _resolvedSnapshot: {
                    _isResolverVerified: true,
                    snapshotId: 'snap-tenant-deal',
                    authorityCode: 'HRERA',
                    source: 'RERA_PORTAL',
                    tenantId: orgTenant,
                    contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    verifiedAt: new Date(),
                    status: 'APPROVED',
                    isSealed: true,
                    isRevoked: false,
                    isSynthetic: false,
                    provenance: 'LIVE',
                    _resolvedLink: {
                        _isResolverVerified: true,
                        tenantId: orgTenant,
                        inventoryId: propId,
                        propertyId: 'PLOT-T-1',
                        authorityCode: 'HRERA',
                        identityVerified: true,
                        matchEligibility: 'ELIGIBLE',
                        isActive: true,
                        _resolvedDealInventory: {
                            _id: propId,
                            tenantId: foreignTenant // Foreign inventory tenant!
                        }
                    }
                }
            };
            assert.equal(hasAuthoritativeReraApproval(dealWithForeignInv), false, 'Deal linked inventory with foreign tenant must fail');
        });

        // ========== 5. DOCUMENT AUDIT IMMUTABILITY & LINKAGE ==========
        it('Document Audit Immutability: Ordinary mutations to verificationAudit are rejected', async () => {
            const ver = await DocumentVersion.create({
                versionId: 'ver-immut-1',
                documentId: 'doc-immut-1',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                objectKey: 'documents/immut-1.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            const immutEntId = new mongoose.Types.ObjectId();
            const doc = await Document.create({
                documentId: 'doc-immut-1',
                entityType: 'Deal',
                entityId: immutEntId,
                currentVersionId: ver._id,
                state: 'ACTIVE'
            });

            await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-immut-1',
                auditPayload: {
                    documentId: 'doc-immut-1',
                    versionId: String(ver._id),
                    entityId: immutEntId,
                    entityType: 'Deal',
                    verifierId: String(complianceUser._id),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                },
                verifierUser: complianceUser
            });

            // Ordinary save attempt to mutate verificationAudit throws error
            doc.verificationAudit = { ...doc.verificationAudit, outcome: 'VERIFIED' };
            await assert.rejects(async () => {
                await doc.save();
            }, /IMMUTABLE_VERIFICATION_AUDIT/);

            // Ordinary updateOne attempt to mutate verificationAudit throws error
            await assert.rejects(async () => {
                await Document.updateOne(
                    { _id: doc._id },
                    { $set: { 'verificationAudit.outcome': 'REJECTED' } }
                );
            }, /IMMUTABLE_VERIFICATION_AUDIT/);

            // Ordinary findOneAndUpdate attempt to mutate metadata.verificationAudit throws error
            await assert.rejects(async () => {
                await Document.findOneAndUpdate(
                    { _id: doc._id },
                    { $set: { 'metadata.verificationAudit.outcome': 'REJECTED' } }
                );
            }, /IMMUTABLE_VERIFICATION_AUDIT/);

            // Forged boolean flags fail closed (Round 8)
            await assert.rejects(async () => {
                await Document.updateOne(
                    { _id: doc._id },
                    { $set: { 'verificationAudit.outcome': 'REJECTED' } },
                    { isAuthorizedAuditWorkflow: true }
                );
            }, /IMMUTABLE_VERIFICATION_AUDIT/);

            // Ordinary non-audit field updates succeed without audit capability
            await Document.updateOne(
                { _id: doc._id },
                { $set: { isRevoked: true } }
            );
        });

        it('Document Audit Linkage: Document ownership and audit ownership contradiction fails closed', () => {
            const dealId = new mongoose.Types.ObjectId();
            const otherDealId = new mongoose.Types.ObjectId();

            const docContradiction = {
                documentId: 'doc-contra-1',
                documentRecord: {
                    _isResolverVerified: true,
                    documentId: 'doc-contra-1',
                    entityType: 'Deal',
                    entityId: dealId,
                    state: 'ACTIVE',
                    isDeleted: false,
                    currentVersionId: 'ver-contra-1',
                    currentVersion: { _id: 'ver-contra-1', checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
                    verificationAudit: {
                        _verifierAuthorized: true,
                        _authorizedVerifierType: 'USER',
                        _verifierUser: {
                            _id: String(complianceUser._id),
                            isActive: true,
                            status: 'active',
                            role: {
                                moduleAccess: { authorityVerification: { view: true, edit: true } },
                                approvalRights: { approveAuthorityChanges: true }
                            }
                        },
                        verifierId: String(complianceUser._id),
                        verifiedAt: new Date(),
                        outcome: 'APPROVED',
                        documentId: 'doc-contra-1',
                        versionId: 'ver-contra-1',
                        entityId: otherDealId, // Contradicts docRecord.entityId!
                        entityType: 'Deal'
                    }
                }
            };
            assert.equal(hasAuthoritativeDocumentProvenance(docContradiction), false, 'Audit entityId mismatch with document entityId must fail closed');
        });
    });

    // =========================================================================
    // SECTION 15: ROUND 8 FINAL IMMUTABILITY, SNAPSHOT STATE & REPLAY SUITE
    // =========================================================================
    describe('Section 15: Round 8 Final Immutability, Snapshot State & Replay Security Suite', () => {
        let tenantA;
        let tenantB;
        let statutoryUser;
        let statutoryRole;

        beforeEach(async () => {
            tenantA = new mongoose.Types.ObjectId();
            tenantB = new mongoose.Types.ObjectId();
            clearSystemServiceReplayLedger();

            statutoryRole = await Role.create({
                name: 'STATUTORY_COMPLIANCE_ROUND8_' + Date.now(),
                department: 'marketing',
                isSystemRole: false,
                moduleAccess: {
                    authorityVerification: { view: true, edit: true }
                },
                approvalRights: {
                    approveAuthorityChanges: true
                }
            });

            statutoryUser = await User.create({
                fullName: 'Statutory Verifier R8',
                email: `statutory_r8_${Date.now()}@bharatproperties.test`,
                password: 'HashedPassword123!',
                department: 'marketing',
                role: statutoryRole._id,
                isActive: true,
                status: 'active',
                tenantId: tenantA
            });
        });

        // ---------------------------------------------------------------------
        // 1. P0 — DOCUMENT AUDIT IMMUTABILITY AUTHORIZATION
        // ---------------------------------------------------------------------
        it('Document Immutability: Ordinary save() mutating verificationAudit throws IMMUTABLE_VERIFICATION_AUDIT', async () => {
            const docVer = await DocumentVersion.create({
                versionId: 'ver-imm-save-1',
                documentId: 'doc-imm-save-1',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                storageKey: 'documents/imm-save-1.pdf',
                storageBucket: 'test-bucket',
                objectKey: 'documents/imm-save-1.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            const immSaveEntId = new mongoose.Types.ObjectId();
            const doc = await Document.create({
                documentId: 'doc-imm-save-1',
                entityType: 'Deal',
                entityId: immSaveEntId,
                currentVersionId: docVer._id,
                state: 'ACTIVE'
            });

            await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-imm-save-1',
                auditPayload: {
                    documentId: 'doc-imm-save-1',
                    versionId: String(docVer._id),
                    entityId: immSaveEntId,
                    entityType: 'Deal',
                    verifierId: String(statutoryUser._id),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                },
                verifierUser: statutoryUser
            });

            // Attempting to modify audit and save() without capability token
            const fetchedDoc = await Document.findById(doc._id);
            fetchedDoc.verificationAudit = { ...fetchedDoc.verificationAudit, outcome: 'VERIFIED' };
            await assert.rejects(async () => {
                await fetchedDoc.save();
            }, /IMMUTABLE_VERIFICATION_AUDIT/);
        });

        it('Document Immutability: Ordinary updateOne() and findOneAndUpdate() reject audit mutation', async () => {
            const doc = await Document.create({
                documentId: 'doc-imm-ops-1',
                entityType: 'Deal',
                entityId: new mongoose.Types.ObjectId(),
                state: 'ACTIVE'
            });

            // updateOne rejected
            await assert.rejects(async () => {
                await Document.updateOne(
                    { _id: doc._id },
                    { $set: { 'verificationAudit.outcome': 'TAMPERED' } }
                );
            }, /IMMUTABLE_VERIFICATION_AUDIT/);

            // findOneAndUpdate rejected
            await assert.rejects(async () => {
                await Document.findOneAndUpdate(
                    { _id: doc._id },
                    { $set: { 'metadata.verificationAudit.outcome': 'TAMPERED' } }
                );
            }, /IMMUTABLE_VERIFICATION_AUDIT/);
        });

        it('Document Immutability: Forged caller boolean flags (isAuthorizedAuditWorkflow) are strictly rejected', async () => {
            const doc = await Document.create({
                documentId: 'doc-forged-flag-1',
                entityType: 'Deal',
                entityId: new mongoose.Types.ObjectId(),
                state: 'ACTIVE'
            });

            // Passing { isAuthorizedAuditWorkflow: true } in query options
            await assert.rejects(async () => {
                await Document.updateOne(
                    { _id: doc._id },
                    { $set: { 'verificationAudit.outcome': 'TAMPERED' } },
                    { isAuthorizedAuditWorkflow: true }
                );
            }, /IMMUTABLE_VERIFICATION_AUDIT/);

            // Passing doc._isAuthorizedAuditWorkflow on model instance
            doc._isAuthorizedAuditWorkflow = true;
            doc.verificationAudit = { outcome: 'TAMPERED' };
            await assert.rejects(async () => {
                await doc.save();
            }, /IMMUTABLE_VERIFICATION_AUDIT/);
        });

        it('Document Immutability: Aggregation update pipeline bypasses are rejected', async () => {
            const doc = await Document.create({
                documentId: 'doc-pipeline-bypass-1',
                entityType: 'Deal',
                entityId: new mongoose.Types.ObjectId(),
                state: 'ACTIVE'
            });

            await assert.rejects(async () => {
                await Document.updateOne(
                    { _id: doc._id },
                    [
                        { $set: { 'verificationAudit.outcome': 'PIPELINE_HACK' } }
                    ]
                );
            }, /IMMUTABLE_VERIFICATION_AUDIT/);
        });

        it('Document Immutability: DocumentAuditService records genuine verification audit with capability token', async () => {
            const entId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-audit-service-1',
                documentId: 'doc-audit-service-1',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                storageKey: 'documents/audit-srv-1.pdf',
                storageBucket: 'test-bucket',
                objectKey: 'documents/audit-srv-1.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            await Document.create({
                documentId: 'doc-audit-service-1',
                entityType: 'Deal',
                entityId: entId,
                currentVersionId: docVer._id,
                state: 'ACTIVE'
            });

            const verifiedAt = new Date();
            const updatedDoc = await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-audit-service-1',
                auditPayload: {
                    documentId: 'doc-audit-service-1',
                    versionId: String(docVer._id),
                    entityId: entId,
                    entityType: 'Deal',
                    verifierId: String(statutoryUser._id),
                    verifiedAt,
                    outcome: 'APPROVED'
                },
                verifierUser: statutoryUser
            });

            assert.ok(updatedDoc);
            assert.equal(updatedDoc.verificationAudit.outcome, 'APPROVED');
            assert.equal(updatedDoc.verificationAudit.documentId, 'doc-audit-service-1');
            assert.equal(String(updatedDoc.verificationAudit.verifierId), String(statutoryUser._id));
        });

        it('Document Immutability: Supersession preserves prior audit in auditHistory', async () => {
            const entId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-supersede-1',
                documentId: 'doc-supersede-1',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                storageKey: 'documents/sup-1.pdf',
                storageBucket: 'test-bucket',
                objectKey: 'documents/sup-1.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            await Document.create({
                documentId: 'doc-supersede-1',
                entityType: 'Deal',
                entityId: entId,
                currentVersionId: docVer._id,
                state: 'ACTIVE'
            });

            // Initial audit
            await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-supersede-1',
                auditPayload: {
                    documentId: 'doc-supersede-1',
                    versionId: String(docVer._id),
                    entityId: entId,
                    entityType: 'Deal',
                    verifierId: String(statutoryUser._id),
                    verifiedAt: new Date(Date.now() - 3600000),
                    outcome: 'APPROVED'
                },
                verifierUser: statutoryUser
            });

            // Superseding audit
            const supersededDoc = await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-supersede-1',
                auditPayload: {
                    documentId: 'doc-supersede-1',
                    versionId: String(docVer._id),
                    entityId: entId,
                    entityType: 'Deal',
                    verifierId: String(statutoryUser._id),
                    verifiedAt: new Date(),
                    outcome: 'VERIFIED'
                },
                verifierUser: statutoryUser
            });

            assert.equal(supersededDoc.verificationAudit.outcome, 'VERIFIED');
            assert.equal(supersededDoc.auditHistory.length, 1);
            assert.equal(supersededDoc.auditHistory[0].outcome, 'APPROVED');
            assert.equal(supersededDoc.auditHistory[0].action, 'SUPERSEDED');
        });

        it('Document Immutability: DocumentAuditService revokes verification audit and records history', async () => {
            const entId = new mongoose.Types.ObjectId();
            const docVer = await DocumentVersion.create({
                versionId: 'ver-revoke-1',
                documentId: 'doc-revoke-1',
                versionNumber: 1,
                providerInstanceId: 's3-primary',
                storageKey: 'documents/rev-1.pdf',
                storageBucket: 'test-bucket',
                objectKey: 'documents/rev-1.pdf',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                mimeType: 'application/pdf',
                sizeBytes: 1024
            });

            await Document.create({
                documentId: 'doc-revoke-1',
                entityType: 'Deal',
                entityId: entId,
                currentVersionId: docVer._id,
                state: 'ACTIVE'
            });

            await DocumentAuditService.recordVerificationAudit({
                documentId: 'doc-revoke-1',
                auditPayload: {
                    documentId: 'doc-revoke-1',
                    versionId: String(docVer._id),
                    entityId: entId,
                    entityType: 'Deal',
                    verifierId: String(statutoryUser._id),
                    verifiedAt: new Date(),
                    outcome: 'APPROVED'
                },
                verifierUser: statutoryUser
            });

            // Revoke audit
            const revokedDoc = await DocumentAuditService.revokeVerificationAudit({
                documentId: 'doc-revoke-1',
                revocationReason: 'Court injunction on Title deed',
                revokedBy: String(statutoryUser._id),
                verifierUser: statutoryUser
            });

            assert.equal(revokedDoc.isRevoked, true);
            assert.equal(revokedDoc.verificationAudit.isRevoked, true);
            assert.equal(revokedDoc.verificationAudit.revocationReason, 'Court injunction on Title deed');
            assert.equal(revokedDoc.auditHistory.length, 1);
            assert.equal(revokedDoc.auditHistory[0].action, 'REVOKED');
        });

        // ---------------------------------------------------------------------
        // 2. P0 — EXACT SNAPSHOT STATE REQUIREMENTS
        // ---------------------------------------------------------------------
        describe('Exact Snapshot State Validations', () => {
            const makeBaseSnap = () => ({
                isSealed: true,
                isRevoked: false,
                isSynthetic: false,
                provenance: 'LIVE',
                dataQuality: { status: 'COMPLETE' },
                dataQuality: { status: 'COMPLETE' }
            });

            const makeBaseLink = () => ({
                isActive: true,
                identityVerified: true,
                matchEligibility: 'ELIGIBLE'
            });

            it('Positive Baseline: Exact positive states pass validation', () => {
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), makeBaseLink()), true);
            });

            it('isSealed: false, null, or undefined fails closed', () => {
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isSealed: false }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isSealed: null }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isSealed: undefined }, makeBaseLink()), false);
            });

            it('isRevoked: true, null, or undefined fails closed (strictly requires false)', () => {
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isRevoked: true }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isRevoked: null }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isRevoked: undefined }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), status: 'REVOKED' }, makeBaseLink()), false);
            });

            it('isSynthetic: true, null, or undefined fails closed (strictly requires false)', () => {
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isSynthetic: true }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isSynthetic: null }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), isSynthetic: undefined }, makeBaseLink()), false);
            });

            it('provenance: anything other than LIVE fails closed', () => {
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), provenance: 'SYNTHETIC_FIXTURE' }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), provenance: 'FIXTURE' }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), provenance: null }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), provenance: undefined }, makeBaseLink()), false);
            });

            it('dataQuality: RESTRICTED or missing dataQuality fails closed', () => {
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), dataQuality: { status: 'RESTRICTED' } }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), dataQuality: null }, makeBaseLink()), false);
                assert.equal(validateExactSnapshotStates({ ...makeBaseSnap(), dataQuality: undefined }, makeBaseLink()), false);
            });

            it('link.isActive: false, null, or undefined fails closed', () => {
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), isActive: false }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), isActive: null }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), isActive: undefined }), false);
            });

            it('link.identityVerified: false, null, or undefined fails closed', () => {
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), identityVerified: false }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), identityVerified: null }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), identityVerified: undefined }), false);
            });

            it('link.matchEligibility: anything other than ELIGIBLE fails closed', () => {
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), matchEligibility: 'INELIGIBLE' }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), matchEligibility: 'NEEDS_REVIEW' }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), matchEligibility: 'PARTIAL' }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), matchEligibility: null }), false);
                assert.equal(validateExactSnapshotStates(makeBaseSnap(), { ...makeBaseLink(), matchEligibility: undefined }), false);
            });
        });

        // ---------------------------------------------------------------------
        // 3. P1 — HMAC REPLAY PROTECTION & SECRET ENTROPY
        // ---------------------------------------------------------------------
        describe('HMAC Replay Protection & Secret Entropy', () => {
            it('Replay Protection: First execution succeeds; duplicate replay fails closed', () => {
                const verifiedTime = new Date();
                const nonce = 'replay-test-nonce-001';
                const ctx = {
                    entityId: 'deal-rep-1',
                    documentId: 'doc-rep-1',
                    nonce
                };
                const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, ctx);

                // 1st call: valid -> ACCEPT
                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, ctx), true);

                // 2nd call: replay without idempotencyKey -> REJECT
                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, ctx), false);
            });

            it('Replay Protection: Altered nonce fails HMAC verification', () => {
                const verifiedTime = new Date();
                const ctx = {
                    entityId: 'deal-alt-1',
                    documentId: 'doc-alt-1',
                    nonce: 'nonce-original-001'
                };
                const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, ctx);

                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, {
                    ...ctx,
                    nonce: 'nonce-tampered-999'
                }), false);
            });

            it('Replay Protection: Altered entityId or documentId fails HMAC verification', () => {
                const verifiedTime = new Date();
                const ctx = {
                    entityId: 'deal-ctx-1',
                    documentId: 'doc-ctx-1',
                    nonce: 'nonce-ctx-001'
                };
                const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, ctx);

                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, {
                    ...ctx,
                    entityId: 'deal-tampered'
                }), false);

                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, {
                    ...ctx,
                    documentId: 'doc-tampered'
                }), false);
            });

            it('Replay Protection: Expired signature (> 15 minutes old) fails closed', () => {
                const expiredTime = new Date(Date.now() - 16 * 60 * 1000); // 16 mins ago
                const ctx = {
                    entityId: 'deal-exp-1',
                    documentId: 'doc-exp-1',
                    nonce: 'nonce-exp-001'
                };
                const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', expiredTime, ctx);

                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', expiredTime, sig, ctx), false);
            });

            it('Replay Protection: Future signature (> 1 minute ahead) fails closed', () => {
                const futureTime = new Date(Date.now() + 5 * 60 * 1000); // 5 mins in future
                const ctx = {
                    entityId: 'deal-fut-1',
                    documentId: 'doc-fut-1',
                    nonce: 'nonce-fut-001'
                };
                const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', futureTime, ctx);

                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', futureTime, sig, ctx), false);
            });

            it('Replay Protection: Worker retry with matching idempotencyKey succeeds', () => {
                const verifiedTime = new Date();
                const ctx = {
                    entityId: 'deal-retry-1',
                    documentId: 'doc-retry-1',
                    nonce: 'nonce-retry-001',
                    idempotencyKey: 'worker-job-item-777'
                };
                const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, ctx);

                // Initial call
                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, ctx), true);

                // Legitimate worker retry with identical idempotencyKey and context -> ACCEPT
                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, ctx), true);

                // Attempt to use same idempotencyKey with mismatched entityId -> REJECT
                assert.equal(verifySystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, sig, {
                    ...ctx,
                    entityId: 'deal-other'
                }), false);
            });

            it('Secret Entropy: Rejects weak secrets, repeated patterns, and dictionary words', () => {
                const verifiedTime = new Date();

                // Secret length < 32
                assert.throws(() => {
                    generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {}, 'too-short');
                }, /SYSTEM_SERVICE_SECRET_UNAVAILABLE/);

                // Shannon entropy < 3.0 bits/symbol (repeated character)
                assert.throws(() => {
                    generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {}, '11111111111111111111111111111111');
                }, /SYSTEM_SERVICE_SECRET_UNAVAILABLE/);

                // Distinct characters < 8
                assert.throws(() => {
                    generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {}, 'abababababababababababababababab');
                }, /SYSTEM_SERVICE_SECRET_UNAVAILABLE/);

                // Insecure dictionary pattern (password)
                assert.throws(() => {
                    generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {}, 'myverysecretpasswordforcompliancetesting123');
                }, /SYSTEM_SERVICE_SECRET_UNAVAILABLE/);

                // Valid strong secret succeeds
                const strongSecret = 'k9#mP$2vL@8xQ!5wR&7zT*3yU^6cB%4nD+1sF=';
                const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', verifiedTime, {
                    entityId: 'deal-1',
                    documentId: 'doc-1',
                    nonce: 'valid-nonce-001'
                }, strongSecret);
                assert.ok(sig);
            });
        });

        // ---------------------------------------------------------------------
        // 4. P1 — SINGLE-ORGANIZATION TENANT COMPATIBILITY
        // ---------------------------------------------------------------------
        describe('Single-Organization Tenant Compatibility', () => {
            it('Legacy Deal with tenantId: null fails closed (REQUIRES_CONTROLLED_MIGRATION)', () => {
                const legacyDeal = {
                    _id: new mongoose.Types.ObjectId(),
                    _entityType: 'Deal',
                    tenantId: null, // Legacy null tenant
                    dealId: 'DEAL-LEGACY-001',
                    reraNumber: 'HRERA-PKL-123-2024',
                    lastVerifiedAt: new Date(),
                    _resolvedSnapshot: {
                        _isResolverVerified: true,
                        tenantId: tenantA,
                        isSealed: true,
                        isRevoked: false,
                        isSynthetic: false,
                        provenance: 'LIVE',
                        authorityCode: 'HRERA',
                        dataQuality: { status: 'COMPLETE' },
                        createdByWorkerId: 'WORKER_RERA_SYNC',
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: tenantA,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: new mongoose.Types.ObjectId()
                        }
                    }
                };

                assert.equal(hasAuthoritativeReraApproval(legacyDeal), false, 'Legacy Deal with null tenant must fail closed');
            });

            it('Legacy Inventory with tenantId: null fails closed', () => {
                const legacyInventory = {
                    _id: new mongoose.Types.ObjectId(),
                    _entityType: 'Inventory',
                    tenantId: null,
                    unitNumber: 'UNIT-101',
                    reraNumber: 'HRERA-PKL-123-2024',
                    lastVerifiedAt: new Date(),
                    _resolvedSnapshot: {
                        _isResolverVerified: true,
                        tenantId: tenantA,
                        isSealed: true,
                        isRevoked: false,
                        isSynthetic: false,
                        provenance: 'LIVE',
                        authorityCode: 'HRERA',
                        dataQuality: { status: 'COMPLETE' },
                        createdByWorkerId: 'WORKER_RERA_SYNC',
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: tenantA,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: new mongoose.Types.ObjectId()
                        }
                    }
                };

                assert.equal(hasAuthoritativeReraApproval(legacyInventory), false, 'Legacy Inventory with null tenant must fail closed');
            });

            it('Legacy Project with tenantId: null fails closed', () => {
                const legacyProject = {
                    _id: new mongoose.Types.ObjectId(),
                    _entityType: 'Project',
                    tenantId: null,
                    name: 'Legacy Project',
                    reraNumber: 'HRERA-PKL-123-2024',
                    lastVerifiedAt: new Date(),
                    _resolvedSnapshot: {
                        _isResolverVerified: true,
                        tenantId: tenantA,
                        isSealed: true,
                        isRevoked: false,
                        isSynthetic: false,
                        provenance: 'LIVE',
                        authorityCode: 'HRERA',
                        dataQuality: { status: 'COMPLETE' },
                        createdByWorkerId: 'WORKER_RERA_SYNC',
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: tenantA,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: new mongoose.Types.ObjectId()
                        }
                    }
                };

                assert.equal(hasAuthoritativeReraApproval(legacyProject), false, 'Legacy Project with null tenant must fail closed');
            });

            it('Cross-tenant mismatch (snapshot tenant != canonical tenant) fails closed', () => {
                const invId = new mongoose.Types.ObjectId();
                const canonicalInv = {
                    _id: invId,
                    _entityType: 'Inventory',
                    tenantId: tenantA,
                    unitNumber: 'UNIT-TENANT-A',
                    reraNumber: 'HRERA-PKL-123-2024',
                    lastVerifiedAt: new Date(),
                    _resolvedSnapshot: {
                        _isResolverVerified: true,
                        tenantId: tenantB, // Snapshot belongs to Tenant B!
                        isSealed: true,
                        isRevoked: false,
                        isSynthetic: false,
                        provenance: 'LIVE',
                        authorityCode: 'HRERA',
                        dataQuality: { status: 'COMPLETE' },
                        createdByWorkerId: 'WORKER_RERA_SYNC',
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: tenantB,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId
                        }
                    }
                };

                assert.equal(hasAuthoritativeReraApproval(canonicalInv), false, 'Tenant mismatch must fail closed');
            });

            it('Project entity matching via string/name is strictly rejected; schema-supported Inventory.projectId is accepted', () => {
                const projectId = new mongoose.Types.ObjectId();
                const invId = new mongoose.Types.ObjectId();

                const canonicalProject = {
                    _id: projectId,
                    _entityType: 'Project',
                    tenantId: tenantA,
                    name: 'Prime Heights',
                    reraNumber: 'HRERA-PKL-123-2024',
                    reraStatus: 'APPROVED',
                    lastVerifiedAt: new Date()
                };

                // String/name based matching: link._resolvedProjectInventory has string projectName but no valid ObjectId projectId -> REJECT
                const stringMatchSnap = {
                    _isResolverVerified: true,
                    tenantId: tenantA,
                    isSealed: true,
                    isRevoked: false,
                    isSynthetic: false,
                    provenance: 'LIVE',
                    authorityCode: 'HRERA',
                    contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    observedAt: new Date(),
                    dataQuality: { status: 'COMPLETE' },
                    createdByWorkerId: 'WORKER_RERA_SYNC',
                    _resolvedLink: {
                        _isResolverVerified: true,
                        tenantId: tenantA,
                        isActive: true,
                        identityVerified: true,
                        matchEligibility: 'ELIGIBLE',
                        authorityCode: 'HRERA',
                        inventoryId: invId,
                        _resolvedProjectInventory: {
                            projectName: 'Prime Heights', // String-based matching attempt!
                            projectId: 'Prime Heights',   // Non-ObjectId string
                            tenantId: tenantA
                        }
                    }
                };

                assert.equal(
                    hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: stringMatchSnap }),
                    false,
                    'String or name-based project matching must be strictly rejected'
                );

                // Valid canonical relationship: Inventory.projectId as ObjectId matching Project._id -> ACCEPT
                const validSchemaSnap = {
                    _isResolverVerified: true,
                    tenantId: tenantA,
                    isSealed: true,
                    isRevoked: false,
                    isSynthetic: false,
                    provenance: 'LIVE',
                    authorityCode: 'HRERA',
                    contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    observedAt: new Date(),
                    dataQuality: { status: 'COMPLETE' },
                    createdByWorkerId: 'WORKER_RERA_SYNC',
                    _resolvedLink: {
                        _isResolverVerified: true,
                        tenantId: tenantA,
                        isActive: true,
                        identityVerified: true,
                        matchEligibility: 'ELIGIBLE',
                        authorityCode: 'HRERA',
                        inventoryId: invId,
                        _resolvedProjectInventory: {
                            _id: invId,
                            projectId: projectId, // Valid ObjectId ref to Project
                            tenantId: tenantA
                        }
                    }
                };

                assert.equal(
                    hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: validSchemaSnap }),
                    true,
                    'Schema-supported Project-to-Inventory ObjectId relationship must succeed'
                );
            });
        });

        // =====================================================================
        // SECTION 16: ROUND 9 FINAL SECURITY BOUNDARY & ADVERSARIAL SUITE
        // =====================================================================
        describe('Section 16: Round 9 Final Security Boundary & Adversarial Suite', () => {
            let replDocVer;
            let replDoc;
            let replEntId;
            let replUser;
            let replRole;
            const testTenant = '6af1cd89b469461ab58ba1e8';

            beforeEach(async () => {
                replEntId = new mongoose.Types.ObjectId();

                replRole = await Role.create({
                    name: `Compliance Auditor R9 ${Date.now()}-${Math.random()}`,
                    department: 'marketing',
                    isSystemRole: false,
                    moduleAccess: {
                        authorityVerification: { view: true, edit: true }
                    },
                    approvalRights: {
                        approveAuthorityChanges: true
                    }
                });

                replUser = await User.create({
                    fullName: 'Statutory Verifier R9',
                    email: `verifier-r9-${Date.now()}-${Math.random()}@bharatproperties.co`,
                    password: 'HashedPassword123!',
                    role: replRole._id,
                    department: 'marketing',
                    tenantId: testTenant,
                    isActive: true,
                    status: 'active'
                });

                replDocVer = await DocumentVersion.create({
                    versionId: `ver-r9-${Date.now()}-${Math.random()}`,
                    documentId: `doc-r9-${Date.now()}-${Math.random()}`,
                    versionNumber: 1,
                    providerInstanceId: 's3-primary',
                    storageKey: 'documents/r9.pdf',
                    storageBucket: 'test-bucket',
                    objectKey: 'documents/r9.pdf',
                    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    mimeType: 'application/pdf',
                    sizeBytes: 2048
                });

                replDoc = await Document.create({
                    documentId: replDocVer.documentId,
                    entityType: 'Deal',
                    entityId: replEntId,
                    currentVersionId: replDocVer._id,
                    state: 'ACTIVE'
                });
            });

            // 1. P0 — Genuinely Private Audit Capability
            describe('P0: Audit Capability Privacy', () => {
                it('1.1 Ordinary model update cannot change audit evidence', async () => {
                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            { $set: { verificationAudit: { outcome: 'VERIFIED' } } }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('1.2 Forged boolean options (isAuthorizedAuditWorkflow) are strictly rejected', async () => {
                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            { $set: { verificationAudit: { outcome: 'VERIFIED' } } },
                            { isAuthorizedAuditWorkflow: true }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('1.3 Importing application modules does NOT expose any capability token', () => {
                    assert.equal(AUDIT_CAPABILITY_TOKEN, undefined);
                    const docSymbols = Object.getOwnPropertySymbols(Document).map(s => s.toString());
                    assert.ok(!docSymbols.some(s => s.toLowerCase().includes('audit')));
                    const srvSymbols = Object.getOwnPropertySymbols(DocumentAuditService).map(s => s.toString());
                    assert.ok(!srvSymbols.some(s => s.toLowerCase().includes('audit')));
                });

                it('1.4 Direct invocation of internalAuditBridge by unauthorized caller fails closed', async () => {
                    await assert.rejects(async () => {
                        await executePrivilegedAuditWrite(replDoc._id, { $set: { 'verificationAudit.outcome': 'FORGED' } });
                    }, /UNAUTHORIZED_BRIDGE_CALLER/);
                });

                it('1.5 Approved DocumentAuditService workflow succeeds and attaches genuine audit', async () => {
                    const updated = await DocumentAuditService.recordVerificationAudit({
                        documentId: replDoc.documentId,
                        auditPayload: {
                            documentId: replDoc.documentId,
                            versionId: String(replDocVer._id),
                            entityId: replEntId,
                            entityType: 'Deal',
                            verifierId: String(replUser._id),
                            verifiedAt: new Date(),
                            outcome: 'VERIFIED'
                        },
                        verifierUser: replUser
                    });

                    assert.equal(updated.verificationAudit.outcome, 'VERIFIED');
                    assert.equal(updated.verificationAudit.documentId, replDoc.documentId);
                });
            });

            // 2. P0 — Complete Document Audit Mutation Protection
            describe('P0: Complete Document Write-Path Protection', () => {
                it('2.1 Document.create with forged verificationAudit fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.create({
                            documentId: `doc-forged-create-${Date.now()}`,
                            entityType: 'Deal',
                            entityId: replEntId,
                            state: 'ACTIVE',
                            verificationAudit: { outcome: 'VERIFIED', verifierId: 'evil' }
                        });
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.2 Document.create with forged metadata.verificationAudit fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.create({
                            documentId: `doc-forged-meta-${Date.now()}`,
                            entityType: 'Deal',
                            entityId: replEntId,
                            state: 'ACTIVE',
                            metadata: { verificationAudit: { outcome: 'VERIFIED' } }
                        });
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.3 insertMany with audit evidence fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.insertMany([
                            {
                                documentId: `doc-insertMany-${Date.now()}`,
                                entityType: 'Deal',
                                entityId: replEntId,
                                state: 'ACTIVE',
                                verificationAudit: { outcome: 'VERIFIED' }
                            }
                        ]);
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.4 replaceOne without capability fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.replaceOne(
                            { _id: replDoc._id },
                            {
                                documentId: replDoc.documentId,
                                entityType: 'Deal',
                                entityId: replEntId,
                                state: 'ACTIVE',
                                verificationAudit: { outcome: 'VERIFIED' }
                            }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.5 findOneAndReplace without capability fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.findOneAndReplace(
                            { _id: replDoc._id },
                            {
                                documentId: replDoc.documentId,
                                entityType: 'Deal',
                                entityId: replEntId,
                                state: 'ACTIVE',
                                verificationAudit: { outcome: 'VERIFIED' }
                            }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.6 bulkWrite operations with audit evidence are rejected', async () => {
                    // insertOne in bulkWrite
                    await assert.rejects(async () => {
                        await Document.bulkWrite([
                            {
                                insertOne: {
                                    document: {
                                        documentId: `doc-bulk-1-${Date.now()}`,
                                        entityType: 'Deal',
                                        entityId: replEntId,
                                        state: 'ACTIVE',
                                        verificationAudit: { outcome: 'VERIFIED' }
                                    }
                                }
                            }
                        ]);
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);

                    // updateOne in bulkWrite
                    await assert.rejects(async () => {
                        await Document.bulkWrite([
                            {
                                updateOne: {
                                    filter: { _id: replDoc._id },
                                    update: { $set: { verificationAudit: { outcome: 'VERIFIED' } } }
                                }
                            }
                        ]);
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);

                    // replaceOne in bulkWrite
                    await assert.rejects(async () => {
                        await Document.bulkWrite([
                            {
                                replaceOne: {
                                    filter: { _id: replDoc._id },
                                    replacement: {
                                        documentId: replDoc.documentId,
                                        entityType: 'Deal',
                                        entityId: replEntId,
                                        state: 'ACTIVE'
                                    }
                                }
                            }
                        ]);
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.7 $rename into and out of protected audit paths fails closed', async () => {
                    // Rename out of verificationAudit
                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            { $rename: { 'verificationAudit': 'someLeakedAudit' } }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);

                    // Rename into verificationAudit
                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            { $rename: { 'someField': 'verificationAudit' } }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.8 $set replacing entire metadata object fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            { $set: { metadata: { documentCategory: 'TITLE_DEED' } } }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.9 Aggregation update pipeline fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            [
                                { $set: { verificationAudit: { outcome: 'FORGED' } } }
                            ]
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });

                it('2.10 Audit deletion using $unset fails closed', async () => {
                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            { $unset: { verificationAudit: "" } }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);

                    await assert.rejects(async () => {
                        await Document.updateOne(
                            { _id: replDoc._id },
                            { $unset: { 'metadata.verificationAudit': "" } }
                        );
                    }, /IMMUTABLE_VERIFICATION_AUDIT/);
                });
            });

            // 3. P0 — Fix Revocation Authorization Bypass
            describe('P0: Revocation Authorization Strict Boundary', () => {
                let recordedDoc;
                beforeEach(async () => {
                    recordedDoc = await DocumentAuditService.recordVerificationAudit({
                        documentId: replDoc.documentId,
                        auditPayload: {
                            documentId: replDoc.documentId,
                            versionId: String(replDocVer._id),
                            entityId: replEntId,
                            entityType: 'Deal',
                            verifierId: String(replUser._id),
                            verifiedAt: new Date(),
                            outcome: 'VERIFIED'
                        },
                        verifierUser: replUser
                    });
                });

                it('3.1 systemContext: {} fails closed', async () => {
                    await assert.rejects(async () => {
                        await DocumentAuditService.revokeVerificationAudit({
                            documentId: replDoc.documentId,
                            revocationReason: 'Testing empty systemContext',
                            revokedBy: 'SYSTEM_COMPLIANCE_ENGINE',
                            systemContext: {}
                        });
                    }, /UNAUTHORIZED_REVOKER/);
                });

                it('3.2 Arbitrary non-empty systemContext fails closed', async () => {
                    await assert.rejects(async () => {
                        await DocumentAuditService.revokeVerificationAudit({
                            documentId: replDoc.documentId,
                            revocationReason: 'Testing arbitrary systemContext',
                            revokedBy: 'SYSTEM_COMPLIANCE_ENGINE',
                            systemContext: { arbitraryField: true }
                        });
                    }, /UNAUTHORIZED_REVOKER/);
                });

                it('3.3 Missing signature fails closed', async () => {
                    await assert.rejects(async () => {
                        await DocumentAuditService.revokeVerificationAudit({
                            documentId: replDoc.documentId,
                            revocationReason: 'Missing signature',
                            revokedBy: 'SYSTEM_COMPLIANCE_ENGINE',
                            systemContext: {
                                serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                                nonce: 'abcdef1234567890'
                            }
                        });
                    }, /UNAUTHORIZED_REVOKER/);
                });

                it('3.4 Invalid signature fails closed', async () => {
                    await assert.rejects(async () => {
                        await DocumentAuditService.revokeVerificationAudit({
                            documentId: replDoc.documentId,
                            revocationReason: 'Invalid signature',
                            revokedBy: 'SYSTEM_COMPLIANCE_ENGINE',
                            systemContext: {
                                serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                                nonce: 'abcdef1234567890',
                                systemSignature: '0000000000000000000000000000000000000000000000000000000000000000'
                            }
                        });
                    }, /UNAUTHORIZED_REVOKER/);
                });

                it('3.5 Expired or future timestamp fails closed', async () => {
                    const expiredTime = new Date(Date.now() - 25 * 60 * 1000);
                    const nonce = 'abcdef1234567890';
                    const ctx = {
                        entityId: String(replEntId),
                        documentId: replDoc.documentId,
                        nonce
                    };
                    const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', expiredTime, ctx);

                    await assert.rejects(async () => {
                        await DocumentAuditService.revokeVerificationAudit({
                            documentId: replDoc.documentId,
                            revocationReason: 'Expired timestamp',
                            revokedBy: 'SYSTEM_COMPLIANCE_ENGINE',
                            systemContext: {
                                serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                                timestamp: expiredTime,
                                nonce,
                                systemSignature: sig
                            }
                        });
                    }, /UNAUTHORIZED_REVOKER/);
                });

                it('3.6 Forged verifierUser object (lacking DB permissions) fails closed', async () => {
                    const forgedCallerUser = {
                        _id: new mongoose.Types.ObjectId(),
                        isActive: true,
                        status: 'active',
                        role: {
                            moduleAccess: { authorityVerification: { view: true, edit: true } },
                            approvalRights: { approveAuthorityChanges: true }
                        }
                    };

                    await assert.rejects(async () => {
                        await DocumentAuditService.revokeVerificationAudit({
                            documentId: replDoc.documentId,
                            revocationReason: 'Forged verifier object',
                            revokedBy: String(forgedCallerUser._id),
                            verifierUser: forgedCallerUser
                        });
                    }, /UNAUTHORIZED_REVOKER/);
                });

                it('3.7 Persisted authorized verifier succeeds and preserves immutable audit history', async () => {
                    const revoked = await DocumentAuditService.revokeVerificationAudit({
                        documentId: replDoc.documentId,
                        revocationReason: 'Statutory compliance revocation by authorized auditor',
                        revokedBy: String(replUser._id),
                        verifierUser: replUser
                    });

                    assert.equal(revoked.isRevoked, true);
                    assert.equal(revoked.verificationAudit.isRevoked, true);
                    assert.equal(revoked.auditHistory.length, 1);
                    assert.equal(revoked.auditHistory[0].action, 'REVOKED');
                    assert.equal(revoked.auditHistory[0].revocationReason, 'Statutory compliance revocation by authorized auditor');
                });

                it('3.8 Revoked document cannot be silently reactivated by subsequent recordVerificationAudit', async () => {
                    await DocumentAuditService.revokeVerificationAudit({
                        documentId: replDoc.documentId,
                        revocationReason: 'Court stay order',
                        revokedBy: String(replUser._id),
                        verifierUser: replUser
                    });

                    await assert.rejects(async () => {
                        await DocumentAuditService.recordVerificationAudit({
                            documentId: replDoc.documentId,
                            auditPayload: {
                                documentId: replDoc.documentId,
                                versionId: String(replDocVer._id),
                                entityId: replEntId,
                                entityType: 'Deal',
                                verifierId: String(replUser._id),
                                verifiedAt: new Date(),
                                outcome: 'VERIFIED'
                            },
                            verifierUser: replUser
                        });
                    }, /DOCUMENT_REVOKED/);
                });
            });

            // 4. P1 — Persisted Distributed HMAC Replay Protection
            describe('P1: Distributed Persistent HMAC Replay Protection', () => {
                it('4.1 Replay attack is rejected by persistent MongoDB ledger', async () => {
                    const now = new Date();
                    const nonce = `test-durable-${Date.now()}`;
                    const ctx = {
                        entityId: String(replEntId),
                        documentId: replDoc.documentId,
                        nonce
                    };
                    const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', now, ctx);

                    // First consumption succeeds
                    const res1 = await recordNonceConsumptionDurable(sig, {
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce
                    });
                    assert.equal(res1.consumed, true);
                    assert.equal(res1.isIdempotentRetry, false);

                    // Replay attempt fails closed
                    const res2 = await recordNonceConsumptionDurable(sig, {
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce
                    });
                    assert.equal(res2.consumed, false);
                    assert.equal(res2.error, 'SIGNATURE_REPLAY_DETECTED');
                });

                it('4.2 Replay protection persists across in-memory cache clear (process restart simulation)', async () => {
                    const now = new Date();
                    const nonce = `test-restart-${Date.now()}`;
                    const ctx = {
                        entityId: String(replEntId),
                        documentId: replDoc.documentId,
                        nonce
                    };
                    const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', now, ctx);

                    await recordNonceConsumptionDurable(sig, {
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce
                    });

                    // Clear process-local in-memory cache to simulate server restart
                    clearSystemServiceReplayLedger();
                    assert.equal(SystemServiceReplayLedger.size, 0);

                    // Attempting replay against MongoDB fails closed
                    const res = await recordNonceConsumptionDurable(sig, {
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce
                    });
                    assert.equal(res.consumed, false);
                    assert.equal(res.error, 'SIGNATURE_REPLAY_DETECTED');
                });

                it('4.3 Concurrent requests from separate worker processes enforce atomic uniqueness (multi-process test)', async () => {
                    const now = new Date();
                    const nonce = `test-mp-${Date.now()}`;
                    const ctx = {
                        entityId: String(replEntId),
                        documentId: replDoc.documentId,
                        nonce
                    };
                    const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', now, ctx);
                    const recordPayload = JSON.stringify({
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce
                    });

                    const mongoUri = mongoose.connection.client.s.url;
                    const workerScript = new URL('./helpers/concurrencyReplayWorker.js', import.meta.url).pathname;

                    // Launch two separate child processes racing to consume the same signature simultaneously
                    const runChild = () => new Promise((resolve) => {
                        const child = fork(workerScript, [mongoUri, sig, recordPayload], { silent: true });
                        child.on('message', (msg) => resolve(msg));
                        child.on('exit', (code) => resolve({ code }));
                    });

                    const [result1, result2] = await Promise.all([runChild(), runChild()]);
                    const results = [result1, result2];

                    const successCount = results.filter(r => r.success === true).length;
                    const failureCount = results.filter(r => r.success === false).length;

                    assert.equal(successCount, 1, 'Exactly one worker process must succeed in consuming the nonce');
                    assert.equal(failureCount, 1, 'The competing worker process must be rejected with replay error');
                });

                it('4.4 Legitimate idempotent retry with matching idempotencyKey succeeds', async () => {
                    const now = new Date();
                    const nonce = `test-idem-${Date.now()}`;
                    const idKey = `idempotency-key-${Date.now()}`;
                    const ctx = {
                        entityId: String(replEntId),
                        documentId: replDoc.documentId,
                        nonce,
                        idempotencyKey: idKey
                    };
                    const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', now, ctx);

                    const res1 = await recordNonceConsumptionDurable(sig, {
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce,
                        idempotencyKey: idKey
                    });
                    assert.equal(res1.consumed, true);
                    assert.equal(res1.isIdempotentRetry, false);

                    // Retry with exact matching key and context succeeds as idempotent retry
                    const res2 = await recordNonceConsumptionDurable(sig, {
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce,
                        idempotencyKey: idKey
                    });
                    assert.equal(res2.consumed, true);
                    assert.equal(res2.isIdempotentRetry, true);

                    // Retry with altered key fails closed
                    const res3 = await recordNonceConsumptionDurable(sig, {
                        serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                        entityId: ctx.entityId,
                        documentId: ctx.documentId,
                        nonce,
                        idempotencyKey: 'different-idempotency-key'
                    });
                    assert.equal(res3.consumed, false);
                    assert.equal(res3.error, 'SIGNATURE_REPLAY_DETECTED');
                });
            });

            // 5. P1 — Project-to-Inventory Tenant Equality
            describe('P1: Project-to-Inventory Tenant Equality', () => {
                const projectId = new mongoose.Types.ObjectId();
                const invId = new mongoose.Types.ObjectId();
                const canonicalProject = {
                    _id: projectId,
                    _entityType: 'Project',
                    name: 'Grand Bharat Towers',
                    tenantId: testTenant,
                    reraNumber: 'HRERA-PKL-123-2024',
                    reraStatus: 'APPROVED',
                    lastVerifiedAt: new Date(),
                    isManual: false
                };

                const baseSnap = {
                    _isResolverVerified: true,
                    tenantId: testTenant,
                    isSealed: true,
                    isRevoked: false,
                    isSynthetic: false,
                    provenance: 'LIVE',
                    authorityCode: 'HRERA',
                    contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    observedAt: new Date(),
                    dataQuality: { status: 'COMPLETE' },
                    createdByWorkerId: 'WORKER_RERA_SYNC'
                };

                it('5.1 Matching explicit tenant IDs pass', () => {
                    const snap = {
                        ...baseSnap,
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: testTenant,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId,
                            _resolvedProjectInventory: {
                                _id: invId,
                                projectId: projectId,
                                tenantId: testTenant
                            }
                        }
                    };

                    assert.equal(
                        hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: snap }),
                        true
                    );
                });

                it('5.2 Missing Inventory tenant fails closed', () => {
                    const snap = {
                        ...baseSnap,
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: testTenant,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId,
                            _resolvedProjectInventory: {
                                _id: invId,
                                projectId: projectId,
                                tenantId: ''
                            }
                        }
                    };

                    assert.equal(
                        hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: snap }),
                        false
                    );
                });

                it('5.3 Null Inventory tenant fails closed', () => {
                    const snap = {
                        ...baseSnap,
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: testTenant,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId,
                            _resolvedProjectInventory: {
                                _id: invId,
                                projectId: projectId,
                                tenantId: null
                            }
                        }
                    };

                    assert.equal(
                        hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: snap }),
                        false
                    );
                });

                it('5.4 Mismatched Inventory tenant fails closed', () => {
                    const snap = {
                        ...baseSnap,
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: testTenant,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId,
                            _resolvedProjectInventory: {
                                _id: invId,
                                projectId: projectId,
                                tenantId: '6af1cd89b469461ab58ba999' // Other tenant
                            }
                        }
                    };

                    assert.equal(
                        hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: snap }),
                        false
                    );
                });

                it('5.5 Missing Project tenant fails closed', () => {
                    const snap = {
                        ...baseSnap,
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: testTenant,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId,
                            _resolvedProjectInventory: {
                                _id: invId,
                                projectId: projectId,
                                tenantId: testTenant
                            }
                        }
                    };

                    assert.equal(
                        hasAuthoritativeReraApproval({ ...canonicalProject, tenantId: null, _resolvedSnapshot: snap }),
                        false
                    );
                });

                it('5.6 Invalid projectId fails closed', () => {
                    const snap = {
                        ...baseSnap,
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: testTenant,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId,
                            _resolvedProjectInventory: {
                                _id: invId,
                                projectId: 'invalid-non-objectid',
                                tenantId: testTenant
                            }
                        }
                    };

                    assert.equal(
                        hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: snap }),
                        false
                    );
                });

                it('5.7 String/name-only project mapping fails closed', () => {
                    const snap = {
                        ...baseSnap,
                        _resolvedLink: {
                            _isResolverVerified: true,
                            tenantId: testTenant,
                            isActive: true,
                            identityVerified: true,
                            matchEligibility: 'ELIGIBLE',
                            authorityCode: 'HRERA',
                            inventoryId: invId,
                            _resolvedProjectInventory: {
                                _id: invId,
                                projectName: 'Grand Bharat Towers',
                                tenantId: testTenant
                            }
                        }
                    };

                    assert.equal(
                        hasAuthoritativeReraApproval({ ...canonicalProject, _resolvedSnapshot: snap }),
                        false
                    );
                });
            });

            // 6. P1 — Persisted Verifier Identity
            describe('P1: Persisted Verifier Identity in Database', () => {
                it('6.1 Caller-supplied permissions are disregarded; user with restricted DB role fails closed', async () => {
                    const restrictedRole = await Role.create({
                        name: `Restricted User Role ${Date.now()}-${Math.random()}`,
                        department: 'sales',
                        isSystemRole: false,
                        moduleAccess: { authorityVerification: { view: true, edit: false } },
                        approvalRights: { approveAuthorityChanges: false }
                    });

                    const restrictedUser = await User.create({
                        fullName: 'Restricted User',
                        email: `restricted-${Date.now()}-${Math.random()}@bharatproperties.co`,
                        password: 'HashedPassword123!',
                        role: restrictedRole._id,
                        department: 'sales',
                        tenantId: testTenant,
                        isActive: true,
                        status: 'active'
                    });

                    // Caller passes forged verifierUser claiming to have super permissions
                    const forgedCallerUser = {
                        _id: restrictedUser._id,
                        isActive: true,
                        status: 'active',
                        role: {
                            moduleAccess: { authorityVerification: { view: true, edit: true } },
                            approvalRights: { approveAuthorityChanges: true }
                        }
                    };

                    await assert.rejects(async () => {
                        await DocumentAuditService.recordVerificationAudit({
                            documentId: replDoc.documentId,
                            auditPayload: {
                                documentId: replDoc.documentId,
                                versionId: String(replDocVer._id),
                                entityId: replEntId,
                                entityType: 'Deal',
                                verifierId: String(restrictedUser._id),
                                verifiedAt: new Date(),
                                outcome: 'VERIFIED'
                            },
                            verifierUser: forgedCallerUser
                        });
                    }, /UNAUTHORIZED_VERIFIER/);
                });

                it('6.2 Soft-deleted user in DB fails closed immediately', async () => {
                    await User.updateOne({ _id: replUser._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

                    await assert.rejects(async () => {
                        await DocumentAuditService.recordVerificationAudit({
                            documentId: replDoc.documentId,
                            auditPayload: {
                                documentId: replDoc.documentId,
                                versionId: String(replDocVer._id),
                                entityId: replEntId,
                                entityType: 'Deal',
                                verifierId: String(replUser._id),
                                verifiedAt: new Date(),
                                outcome: 'VERIFIED'
                            },
                            verifierUser: replUser
                        });
                    }, /UNAUTHORIZED_VERIFIER/);
                });

                it('6.3 Inactive/suspended user in DB fails closed immediately', async () => {
                    await User.updateOne({ _id: replUser._id }, { $set: { isActive: false, status: 'suspended' } });

                    await assert.rejects(async () => {
                        await DocumentAuditService.recordVerificationAudit({
                            documentId: replDoc.documentId,
                            auditPayload: {
                                documentId: replDoc.documentId,
                                versionId: String(replDocVer._id),
                                entityId: replEntId,
                                entityType: 'Deal',
                                verifierId: String(replUser._id),
                                verifiedAt: new Date(),
                                outcome: 'VERIFIED'
                            },
                            verifierUser: replUser
                        });
                    }, /UNAUTHORIZED_VERIFIER/);
                });
            });
        });
    });
});
