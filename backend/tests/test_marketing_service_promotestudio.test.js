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
    // TITLE REQUIREMENT 1: Missing litigation status -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 1: Missing litigation status must NOT qualify as verified title', async () => {
        const deal = {
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-101',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: new Date()
                // litigationStatus missing
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(deal), false, 'Missing litigation status must be rejected');
    });

    // ─────────────────────────────────────────────────────────────
    // TITLE REQUIREMENT 2: Active litigation -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 2: Active litigation must NOT qualify as verified title', async () => {
        const disputedStatuses = ['LITIGATION_REPORTED', 'ACTIVE_DISPUTE', 'PENDING', 'DISPUTED', 'COURT_STAY'];
        for (const lit of disputedStatuses) {
            const deal = {
                authorityVerification: {
                    authorityCode: 'HSVP',
                    status: 'VERIFIED',
                    verificationSnapshotId: 'snap-102',
                    snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                    lastVerifiedAt: new Date(),
                    litigationStatus: lit
                }
            };
            assert.equal(hasAuthoritativeTitleVerification(deal), false, `Litigation status ${lit} must be rejected`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TITLE REQUIREMENT 3: Missing or invalid snapshot hash -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 3: Missing, short, or placeholder snapshot hash must be rejected', async () => {
        const invalidHashes = [undefined, null, '', '   ', 'none', 'null', 'abc', 'short_hash_123'];
        for (const hash of invalidHashes) {
            const deal = {
                authorityVerification: {
                    authorityCode: 'HSVP',
                    status: 'VERIFIED',
                    verificationSnapshotId: 'snap-103',
                    snapshotContentHash: hash,
                    lastVerifiedAt: new Date(),
                    litigationStatus: 'CLEAN'
                }
            };
            assert.equal(hasAuthoritativeTitleVerification(deal), false, `Invalid hash ${hash} must be rejected`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TITLE REQUIREMENT 4: Missing or invalid snapshot identifier -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 4: Missing, short, or placeholder snapshot ID must be rejected', async () => {
        const invalidIds = [undefined, null, '', '  ', 'no', 'null', 'undefined', 'none'];
        for (const sid of invalidIds) {
            const deal = {
                authorityVerification: {
                    authorityCode: 'HSVP',
                    status: 'VERIFIED',
                    verificationSnapshotId: sid,
                    snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                    lastVerifiedAt: new Date(),
                    litigationStatus: 'CLEAN'
                }
            };
            assert.equal(hasAuthoritativeTitleVerification(deal), false, `Invalid snapshot ID ${sid} must be rejected`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TITLE REQUIREMENT 5: Verification older than 180 days -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 5: Verification older than 180 days must be rejected', async () => {
        const expiredDate = new Date(Date.now() - (181 * 24 * 60 * 60 * 1000));
        const deal = {
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-105',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: expiredDate,
                litigationStatus: 'CLEAN'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(deal), false, '181-day old verification must be rejected');
    });

    // ─────────────────────────────────────────────────────────────
    // TITLE REQUIREMENT 6: Future verification timestamp -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 6: Future verification timestamp or malformed date must be rejected', async () => {
        const futureDate = new Date(Date.now() + (2 * 24 * 60 * 60 * 1000));
        const futureDeal = {
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-106',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: futureDate,
                litigationStatus: 'CLEAN'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(futureDeal), false, 'Future date must be rejected');

        const malformedDeal = {
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-106b',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: 'not-a-valid-date-string',
                litigationStatus: 'CLEAN'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(malformedDeal), false, 'Malformed date string must be rejected');
    });

    // ─────────────────────────────────────────────────────────────
    // TITLE REQUIREMENT 7: ALLOTTED and TRANSFERRED without explicit verification -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 7: ALLOTTED and TRANSFERRED must NOT be treated as verified legal title', async () => {
        const unapprovedStatuses = ['ALLOTTED', 'TRANSFERRED', 'REGISTRY_COMPLETED', 'PENDING', 'RESUMED'];
        for (const st of unapprovedStatuses) {
            const deal = {
                authorityVerification: {
                    authorityCode: 'HSVP',
                    status: st,
                    verificationSnapshotId: 'snap-107',
                    snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                    lastVerifiedAt: new Date(),
                    litigationStatus: 'CLEAN'
                }
            };
            assert.equal(hasAuthoritativeTitleVerification(deal), false, `Authority status ${st} must NOT qualify as verified title`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TITLE REQUIREMENT 8: PropertyAuthorityLink cannot bypass canonical contract
    // ─────────────────────────────────────────────────────────────
    await t.test('Title Requirement 8: PropertyAuthorityLink cannot bypass evidence, freshness or litigation requirements', async () => {
        // Link missing litigation
        const linkMissingLit = {
            authorityLink: {
                authorityCode: 'GMADA',
                status: 'VERIFIED',
                identityVerified: true,
                identityVerifiedAt: new Date(),
                latestSnapshotId: 'snap-gmada-108',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0'
                // missing litigationStatus
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(linkMissingLit), false, 'Link missing litigation must be rejected');

        // Link with expired date
        const linkExpired = {
            authorityLink: {
                authorityCode: 'GMADA',
                status: 'VERIFIED',
                identityVerified: true,
                identityVerifiedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
                latestSnapshotId: 'snap-gmada-108',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                litigationStatus: 'CLEAN'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(linkExpired), false, 'Link with expired date must be rejected');

        // Link with missing hash
        const linkMissingHash = {
            authorityLink: {
                authorityCode: 'GMADA',
                status: 'VERIFIED',
                identityVerified: true,
                identityVerifiedAt: new Date(),
                latestSnapshotId: 'snap-gmada-108',
                litigationStatus: 'CLEAN'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(linkMissingHash), false, 'Link missing hash must be rejected');

        // Valid link
        const validLink = {
            authorityLink: {
                authorityCode: 'GMADA',
                status: 'VERIFIED',
                identityVerified: true,
                identityVerifiedAt: new Date(),
                latestSnapshotId: 'snap-gmada-108',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                litigationStatus: 'CLEAN'
            }
        };
        assert.equal(hasAuthoritativeTitleVerification(validLink), true, 'Valid link must pass');
    });

    // ─────────────────────────────────────────────────────────────
    // RERA REQUIREMENT 9: Registration number without approved status -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('RERA Requirement 9: RERA registration number without approved status must remain unverified', async () => {
        const deal = {
            reraNumber: 'HRERA-PKL-KUK-2024-999'
            // reraStatus missing
        };
        assert.equal(hasAuthoritativeReraApproval(deal), false);
    });

    // ─────────────────────────────────────────────────────────────
    // RERA REQUIREMENT 10: Registration number with PENDING status -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('RERA Requirement 10: RERA registration number with PENDING status must remain unverified', async () => {
        const deal = {
            reraNumber: 'HRERA-PKL-KUK-2024-999',
            reraStatus: 'PENDING'
        };
        assert.equal(hasAuthoritativeReraApproval(deal), false);
    });

    // ─────────────────────────────────────────────────────────────
    // RERA REQUIREMENT 11: Approvals array with registrationNo but no approved status -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('RERA Requirement 11: Approvals array entry with registrationNo but unapproved status must NOT qualify', async () => {
        const deal = {
            approvals: [
                {
                    authority: 'RERA',
                    documentType: 'RERA',
                    registrationNo: 'HRERA-PKL-123',
                    status: 'PENDING' // Not approved
                }
            ]
        };
        assert.equal(hasAuthoritativeReraApproval(deal), false, 'Approvals array with pending status must not qualify');

        const dealMissingStatus = {
            approvals: [
                {
                    authority: 'RERA',
                    documentType: 'RERA',
                    registrationNo: 'HRERA-PKL-123'
                    // status missing
                }
            ]
        };
        assert.equal(hasAuthoritativeReraApproval(dealMissingStatus), false, 'Approvals array with missing status must not qualify');
    });

    // ─────────────────────────────────────────────────────────────
    // RERA REQUIREMENT 12: Expired, suspended, revoked, and rejected registrations -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('RERA Requirement 12: Expired, suspended, revoked, and rejected registrations must be rejected', async () => {
        const disallowed = ['EXPIRED', 'SUSPENDED', 'REVOKED', 'REJECTED', 'UNDER_REVIEW', 'UNKNOWN'];
        for (const st of disallowed) {
            const dealDirect = {
                reraNumber: 'HRERA-PKL-KUK-101',
                reraStatus: st
            };
            assert.equal(hasAuthoritativeReraApproval(dealDirect), false, `Direct RERA status ${st} must be rejected`);

            const dealApproval = {
                approvals: [
                    {
                        authority: 'RERA',
                        registrationNo: 'HRERA-PKL-101',
                        status: st
                    }
                ]
            };
            assert.equal(hasAuthoritativeReraApproval(dealApproval), false, `Approvals RERA status ${st} must be rejected`);
        }
    });

    // ─────────────────────────────────────────────────────────────
    // RERA REQUIREMENT 13: Valid explicitly approved registration with authoritative provenance -> VERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('RERA Requirement 13: Valid explicitly approved registration with authoritative provenance passes', async () => {
        const approvedDirect = {
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            verificationSnapshotId: 'snap-rera-456',
            snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
            lastVerifiedAt: new Date()
        };
        assert.equal(hasAuthoritativeReraApproval(approvedDirect), true);

        const approvedArray = {
            approvals: [
                {
                    approvalAuthority: 'RERA',
                    registrationNo: 'HRERA-PKL-KUK-2024-88',
                    status: 'APPROVED',
                    date: new Date(),
                    source: 'GOVERNMENT_PORTAL',
                    documentId: 'doc-hrera-88',
                    documentRecord: {
                        documentId: 'doc-hrera-88',
                        state: 'ACTIVE',
                        isDeleted: false,
                        currentVersionId: 'ver-hrera-88',
                        currentVersion: { checksum: 'a1b2c3d4e5f67890123456789abcdef0' }
                    }
                }
            ]
        };
        assert.equal(hasAuthoritativeReraApproval(approvedArray), true);

        // Gate 4: Unprovenanced or manual registration without evidence must fail closed
        const unprovenanced = {
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED'
            // Missing source/provenance
        };
        assert.equal(hasAuthoritativeReraApproval(unprovenanced), false, 'Missing source provenance must fail closed');

        const manualInput = {
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED',
            source: 'MANUAL',
            lastVerifiedAt: new Date()
        };
        assert.equal(hasAuthoritativeReraApproval(manualInput), false, 'Manual source must fail closed');

        // Missing verification timestamp fails closed
        const missingTimestamp = {
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            verificationSnapshotId: 'snap-rera-456',
            snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0'
        };
        assert.equal(hasAuthoritativeReraApproval(missingTimestamp), false, 'Missing verification timestamp must fail closed');

        // Verification older than 180 days fails closed
        const staleTimestamp = {
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            verificationSnapshotId: 'snap-rera-456',
            snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
            lastVerifiedAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1000)
        };
        assert.equal(hasAuthoritativeReraApproval(staleTimestamp), false, 'Stale timestamp (>180 days) must fail closed');

        // Bare snapshot ID without content hash fails closed
        const bareSnapshot = {
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            verificationSnapshotId: 'snap-rera-456',
            lastVerifiedAt: new Date()
        };
        assert.equal(hasAuthoritativeReraApproval(bareSnapshot), false, 'Bare snapshot ID without content hash must fail closed');

        // Bare source string alone fails closed
        const bareSource = {
            reraNumber: 'PBRERA-SAS80-PR0456',
            reraStatus: 'APPROVED',
            source: 'RERA_PORTAL',
            lastVerifiedAt: new Date()
        };
        assert.equal(hasAuthoritativeReraApproval(bareSource), false, 'Bare source string alone must fail closed');
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO: Generic boolean alone without evidence -> UNVERIFIED
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario: Generic boolean alone is UNVERIFIED', async () => {
        const genericDeal = {
            unitNo: 'Unit 101',
            isVerified: true,
            titleVerified: true,
            isTitleVerified: true
        };
        assert.equal(hasAuthoritativeTitleVerification(genericDeal), false);
        const facts = extractVerificationFacts(genericDeal);
        assert.equal(facts.isTitleVerified, false);
        assert.equal(facts.titleEvidenceCode, null);
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO: Every fallback tone on unverified property produces zero unsupported claims
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario: Every fallback tone on unverified property produces zero unsupported claims', async () => {
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

            assert.ok(fallback.includes('Property details') || fallback.includes('Documentation status'));
        }
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO: Verified property fallback tones include qualified claims
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario: Fallback tones on verified property include qualified verification claims', async () => {
        const fullyVerifiedDeal = {
            unitNo: 'Villa 12',
            projectName: 'Royal Heritage',
            location: 'Sector 32, Kurukshetra',
            price: '₹ 2.8 Cr',
            authorityVerification: {
                authorityCode: 'HSVP',
                status: 'VERIFIED',
                verificationSnapshotId: 'snap-1234',
                snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
                lastVerifiedAt: new Date(),
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
    // SCENARIO: Post-generation validator sanitizes AI hallucinations
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario: Post-generation validator sanitizes AI hallucinations and unsupported claims', async () => {
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
        assert.ok(!/guaranteed return/i.test(validatedCopy), 'Guaranteed returns must be sanitized');
        assert.ok(!/proven capital appreciation/i.test(validatedCopy), 'Proven capital appreciation must be sanitized');
        assert.ok(!/verified title/i.test(validatedCopy), 'Verified title must be sanitized');
        assert.ok(!/rera compliant/i.test(validatedCopy), 'RERA compliance must be sanitized');
        assert.ok(!/bank loan approved/i.test(validatedCopy), 'Bank loan approved must be sanitized');
        assert.ok(!/ready possession/i.test(validatedCopy), 'Ready possession must be sanitized');
    });

    // ─────────────────────────────────────────────────────────────
    // SCENARIO: Compliant AI copy preserved accurately
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario: AI-generated compliant copy is preserved accurately', async () => {
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
    // SCENARIO: Regional phone resolution and character limits
    // ─────────────────────────────────────────────────────────────
    await t.test('Scenario: Regional phone resolution and short_hook character limits', async () => {
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
