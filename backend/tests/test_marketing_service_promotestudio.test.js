import test from 'node:test';
import assert from 'node:assert/strict';
import marketingService from '../services/MarketingService.js';
import unifiedAIService from '../services/UnifiedAIService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import {
    hasAuthoritativeTitleVerification,
    hasAuthoritativeReraApproval,
    extractVerificationFacts,
    validateAndSanitizeCopy,
    generateCompliantFallback
} from '../utils/propertyComplianceValidator.js';

test('MarketingService — Promote Studio Authoritative Verification & Compliance Gateway', async (t) => {
    const originalGenerate = unifiedAIService.generate;
    const originalFindOne = SystemSetting.findOne;

    t.afterEach(() => {
        unifiedAIService.generate = originalGenerate;
        SystemSetting.findOne = originalFindOne;
    });

    // Mock SystemSetting.findOne to return immediately
    SystemSetting.findOne = () => ({
        lean: async () => ({ value: 'mocked' }),
        then: (resolve) => resolve({ value: 'mocked' })
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 1: isVerified: true alone without authoritative evidence -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 1: Generic boolean (isVerified: true, titleVerified: true) alone is UNVERIFIED', async () => {
        const genericDeal = {
            unitNo: 'Unit 101',
            projectName: 'Sunrise Residency',
            location: 'Sector 7, Kurukshetra',
            isVerified: true,
            titleVerified: true,
            isTitleVerified: true
        };

        assert.equal(hasAuthoritativeTitleVerification(genericDeal), false, 'Generic booleans must NOT qualify as verified title');
        const facts = extractVerificationFacts(genericDeal);
        assert.equal(facts.isTitleVerified, false);
        assert.equal(facts.titleEvidenceCode, null);
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 2: RERA ID present but registration status not approved -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 2: RERA ID present without explicit approved status -> UNVERIFIED', async () => {
        const unapprovedReraDeal = {
            unitNo: 'Unit 202',
            projectName: 'Palm Greens',
            location: 'Kurukshetra',
            reraId: 'HRERA-PKL-KUK-2024-999'
            // reraStatus is missing / not approved
        };

        assert.equal(hasAuthoritativeReraApproval(unapprovedReraDeal), false, 'RERA ID alone without approved status must NOT qualify');
        const facts = extractVerificationFacts(unapprovedReraDeal);
        assert.equal(facts.isReraApproved, false);
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 3: RERA status expired, rejected, pending, or unknown -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 3: RERA status expired, rejected, pending, or unknown -> UNVERIFIED', async () => {
        const statuses = ['EXPIRED', 'REJECTED', 'PENDING', 'UNDER_REVIEW', 'UNKNOWN', 'REVOKED'];
        for (const status of statuses) {
            const deal = {
                unitNo: 'Unit 303',
                projectName: 'Lotus Heights',
                location: 'Kurukshetra',
                reraNumber: 'HRERA-PKL-KUK-101',
                reraStatus: status
            };
            assert.equal(hasAuthoritativeReraApproval(deal), false, `RERA status ${status} must be UNVERIFIED`);
            const facts = extractVerificationFacts(deal);
            assert.equal(facts.isReraApproved, false);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 4: Verified title with missing or invalid evidence -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 4: Title verification with missing snapshot or active litigation -> UNVERIFIED', async () => {
        // Missing audit trail snapshot
        const missingSnapshotDeal = {
            unitNo: 'Plot 10',
            location: 'Kurukshetra',
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED'
                // No verificationSnapshotId, snapshotContentHash, or lastVerifiedAt
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(missingSnapshotDeal), false, 'Missing snapshot/audit trail must be UNVERIFIED');

        // Active litigation dispute
        const activeLitigationDeal = {
            unitNo: 'Plot 11',
            location: 'Kurukshetra',
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-456',
                litigationStatus: 'ACTIVE_DISPUTE'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(activeLitigationDeal), false, 'Active litigation must be UNVERIFIED');
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 5: Valid authoritative title verification -> VERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 5: Valid authoritative title verification (HSVP/CHD/GMADA with snapshot) -> VERIFIED', async () => {
        const validHsvpDeal = {
            unitNo: 'Plot 88',
            projectName: 'Urban Estate',
            location: 'Sector 32, Kurukshetra',
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-hsvp-888',
                litigationStatus: 'CLEAN'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(validHsvpDeal), true, 'Valid HSVP verification must be VERIFIED');
        const facts = extractVerificationFacts(validHsvpDeal);
        assert.equal(facts.isTitleVerified, true);
        assert.equal(facts.titleEvidenceCode, 'HSVP');

        // PropertyAuthorityLink
        const validLinkDeal = {
            unitNo: 'Plot 99',
            authorityLink: {
                authorityCode: 'GMADA',
                identityVerified: true,
                identityVerifiedAt: new Date(),
                latestSnapshotId: 'snap-gmada-99'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(validLinkDeal), true, 'Valid authority link must be VERIFIED');
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 6: Valid approved RERA evidence -> VERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 6: Valid approved RERA evidence -> VERIFIED', async () => {
        const approvedReraDeal = {
            unitNo: 'Tower A 501',
            projectName: 'Grand Vista',
            location: 'Mohali',
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED'
        };
        assert.equal(hasAuthoritativeReraApproval(approvedReraDeal), true, 'Approved RERA status with number must be VERIFIED');
        const facts = extractVerificationFacts(approvedReraDeal);
        assert.equal(facts.isReraApproved, true);
        assert.equal(facts.reraNumber, 'PBRERA-SAS80-PR0456');
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 7: Every fallback tone with unverified records -> zero unsupported claims
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 7: Every fallback tone on unverified property produces zero unsupported claims', async () => {
        const unverifiedProperty = {
            unitNo: 'Plot 55',
            projectName: 'Green Enclave',
            location: 'Kurukshetra',
            price: '₹ 45 Lakhs',
            isVerified: false
        };

        const tones = ['urgent', 'luxury', 'investor', 'short_hook'];
        for (const tone of tones) {
            const fallback = generateCompliantFallback(unverifiedProperty, 'facebook', tone, 'post');
            
            // Strictly check for prohibited claim strings
            assert.ok(!/verified title/i.test(fallback), `Tone ${tone} must NOT claim verified title`);
            assert.ok(!/rera compliant/i.test(fallback), `Tone ${tone} must NOT claim RERA compliant`);
            assert.ok(!/clear registry/i.test(fallback), `Tone ${tone} must NOT claim clear registry`);
            assert.ok(!/clear documentation/i.test(fallback), `Tone ${tone} must NOT claim clear documentation`);
            assert.ok(!/documented property/i.test(fallback), `Tone ${tone} must NOT claim documented property`);
            assert.ok(!/bank loan approved/i.test(fallback), `Tone ${tone} must NOT claim bank loan approved`);
            assert.ok(!/ready possession/i.test(fallback), `Tone ${tone} must NOT claim ready possession`);
            assert.ok(!/guaranteed return/i.test(fallback), `Tone ${tone} must NOT claim guaranteed returns`);
            assert.ok(!/high-yield investment/i.test(fallback), `Tone ${tone} must NOT claim high-yield investment`);
            assert.ok(!/proven capital appreciation/i.test(fallback), `Tone ${tone} must NOT claim proven capital appreciation`);
            assert.ok(!/strong rental yield potential/i.test(fallback), `Tone ${tone} must NOT claim strong rental yield`);

            // Check that it contains neutral phrasing
            assert.ok(fallback.includes('Property details') || fallback.includes('Documentation status'), `Tone ${tone} must provide neutral factual presentation`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 8: Every fallback tone with verified records -> verified claims properly qualified
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 8: Fallback tones on verified property include qualified verification claims', async () => {
        const fullyVerifiedDeal = {
            unitNo: 'Villa 12',
            projectName: 'Royal Heritage',
            location: 'Sector 32, Kurukshetra',
            price: '₹ 2.8 Cr',
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-1234',
                litigationStatus: 'CLEAN'
            },
            reraNumber: 'HRERA-PKL-KUK-2024-88',
            reraStatus: 'APPROVED'
        };

        const tones = ['urgent', 'luxury', 'investor'];
        for (const tone of tones) {
            const fallback = generateCompliantFallback(fullyVerifiedDeal, 'facebook', tone, 'post');
            assert.ok(fallback.includes('HSVP Verified Title'), `Tone ${tone} should claim HSVP Verified Title`);
            assert.ok(fallback.includes('RERA Approved (HRERA-PKL-KUK-2024-88)'), `Tone ${tone} should cite RERA registration`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 9: AI-generated unsupported claims safely sanitized/corrected
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 9: Post-generation validator sanitizes AI hallucinations and unsupported claims', async () => {
        const unverifiedFacts = {
            isTitleVerified: false,
            isReraApproved: false,
            isBankLoanApproved: false,
            isReadyPossession: false
        };

        const hallucinatedAICopy = 
            '🔥 URGENT! Guaranteed Returns 24% p.a. with Proven Capital Appreciation!\n' +
            'This luxury home features Verified Title and RERA Compliant documents.\n' +
            '100% Bank Loan Approved and Ready Possession guaranteed!';

        const validatedCopy = validateAndSanitizeCopy(hallucinatedAICopy, unverifiedFacts, { platform: 'facebook', tone: 'urgent' });

        // Ensure all hallucinated claims were stripped or neutralized
        assert.ok(!/guaranteed return/i.test(validatedCopy), 'Guaranteed returns must be sanitized');
        assert.ok(!/proven capital appreciation/i.test(validatedCopy), 'Proven capital appreciation must be sanitized');
        assert.ok(!/verified title/i.test(validatedCopy), 'Verified title must be sanitized');
        assert.ok(!/rera compliant/i.test(validatedCopy), 'RERA compliance must be sanitized');
        assert.ok(!/bank loan approved/i.test(validatedCopy), 'Bank loan approved must be sanitized');
        assert.ok(!/ready possession/i.test(validatedCopy), 'Ready possession must be sanitized');
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 10: AI-generated compliant copy preserved without corruption
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 10: AI-generated compliant copy is preserved accurately', async () => {
        const verifiedFacts = {
            isTitleVerified: true,
            titleEvidenceCode: 'HSVP',
            isReraApproved: true,
            reraNumber: 'HRERA-2024-123'
        };

        const compliantAICopy = 
            'Prime Real Estate Showcase in Sector 32, Kurukshetra.\n' +
            'Featuring HSVP Verified Title and RERA Approved (HRERA-2024-123).\n' +
            'Inquire today for full documentation and site visit.';

        const validatedCopy = validateAndSanitizeCopy(compliantAICopy, verifiedFacts, { platform: 'linkedin', tone: 'luxury' });
        assert.ok(validatedCopy.includes('HSVP Verified Title'), 'Verified claims should remain intact');
        assert.ok(validatedCopy.includes('HRERA-2024-123'), 'RERA number should remain intact');
        assert.ok(validatedCopy.includes('Sector 32, Kurukshetra'), 'Location details should remain intact');
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 11: Missing verification data defaults to neutral badge and neutral copy
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 11: Completely missing verification fields defaults to neutral copy', async () => {
        const emptyDeal = {
            location: 'Railway Road, Kurukshetra'
        };
        const facts = extractVerificationFacts(emptyDeal);
        assert.equal(facts.isTitleVerified, false);
        assert.equal(facts.isReraApproved, false);
        assert.equal(facts.isBankLoanApproved, false);
        assert.equal(facts.isReadyPossession, false);

        const fallback = generateCompliantFallback(emptyDeal, 'facebook', 'urgent');
        assert.ok(!fallback.includes('Verified Title'));
        assert.ok(!fallback.includes('RERA'));
        assert.ok(fallback.includes('Documentation status can be checked during due diligence') || fallback.includes('Property details'));
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO 12: Regional phone resolution and character limits
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario 12: Regional phone resolution and short_hook character limits', async () => {
        unifiedAIService.generate = async () => {
            throw new Error('AI Offline');
        };

        // Kurukshetra phone
        const kkrDeal = { location: 'Sector 3, Kurukshetra, Haryana' };
        const kkrPost = await marketingService.generateSocialPost(kkrDeal, 'facebook', { tone: 'urgent' });
        assert.ok(kkrPost.includes('+91 99913 33570'), 'Kurukshetra location must resolve to +91 99913 33570');

        // Mohali phone
        const mohaliDeal = { location: 'Sector 82, Mohali, Punjab' };
        const mohaliPost = await marketingService.generateSocialPost(mohaliDeal, 'facebook', { tone: 'urgent' });
        assert.ok(mohaliPost.includes('+91 99910 00570'), 'Mohali location must resolve to +91 99910 00570');

        // Short hook character limit (< 280)
        const hookPost = await marketingService.generateSocialPost(kkrDeal, 'x', { tone: 'short_hook', format: 'post' });
        assert.ok(hookPost.length < 280, `Short hook must remain under 280 characters, got ${hookPost.length}`);
    });
});
