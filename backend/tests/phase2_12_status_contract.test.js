/**
 * phase2_12_status_contract.test.js
 *
 * PHASE 2.12 TEST SUITE:
 * 1. Final Status Contract (Litigation & Mortgage) as String | SENTINEL
 * 2. Categorical Observations Preservation & Non-Coercion
 * 3. Categorical-Sentinel Round-Trip Consistency & PII Sanitization
 * 4. Deterministic Hash Sensitivity to Categorical Text
 * 5. Dues & Lease-Rent Derivations (Thresholds, Uncertainty, Dispute Handling)
 * 6. Policy Encapsulation & Prototype Exploit Defenses
 * 7. Inventory Write Protection & Apply Gate (Anti-Overwrite, Top-Level Status Isolation)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
    AUTHORITY_REGISTRY,
    CANONICAL_FIELDS,
    SOURCE_FIELD_MAPS,
    CONTRACT_MAPPING_STATUS,
    SOURCE_EVIDENCE_STATUS,
    SENTINEL,
    isSentinel,
    createReadOnlySetGuard,
    createImmutableSet
} from '../services/authority/authorityFieldDictionary.js';

import {
    normalizeBooleanStatus,
    normalizeCategoricalBoolean,
    normalizeLitigationStatus,
    normalizeMortgageStatus,
    deriveDuesStatus,
    deriveLeaseRentStatus,
    normalizeAuthorityRecord,
    computeSnapshotContentHash,
    computeNormalizedContentHash,
    isPermittedHashField,
    isExcludedHashField,
    isPermittedNestedKey,
    getPermittedHashFields,
    getExcludedHashFields,
    CANONICAL_HASH_CROSSWALK,
    getCrosswalkEntry,
    getCanonicalHashCrosswalk,
    PERMITTED_HASH_FIELDS,
    PERMITTED_HASH_SET,
    PERMITTED_NESTED_KEYS,
    EXCLUDED_HASH_FIELDS
} from '../services/authority/authorityNormalizer.js';

import Inventory from '../models/Inventory.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import AuditLog from '../models/AuditLog.js';
import Role from '../models/Role.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';

import {
    applyApprovedChanges,
    submitReview
} from '../controllers/authorityVerification.controller.js';

test('--- PHASE 2.12: FINAL STATUS CONTRACT, DERIVATION & TEST EVIDENCE RECONCILIATION ---', async (t) => {
    let mongoServer;
    let tenantId;
    let testUser;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. FINAL STATUS CONTRACT FOR LITIGATION & MORTGAGE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('1. Final Status Contract: Controlled String & Observation Categorical Types', () => {
        // 1.1 Explicit negative statements resolve to controlled String (never Boolean false)
        const explicitNegLitigation = [
            'No', 'no', 'No litigation', 'no court case', 'no pending court case',
            'no dispute', 'nil', 'none', 'clear', 'no pending case'
        ];
        for (const neg of explicitNegLitigation) {
            const res = normalizeLitigationStatus(neg);
            assert.strictEqual(typeof res, 'object');
            assert.strictEqual(res.value, false, 'Phase 1 backwards compatibility value must be false');
            assert.strictEqual(res.controlledString, 'NO_LITIGATION', 'Must produce controlled string NO_LITIGATION');
            assert.notStrictEqual(typeof res, 'boolean', 'Must NEVER be primitive boolean');
        }

        const explicitNegMortgage = [
            'No', 'no', 'Not under mortgage', 'no mortgage', 'mortgage cleared',
            'nil', 'none', 'cleared', 'clear', 'no lien', 'unencumbered'
        ];
        for (const neg of explicitNegMortgage) {
            const res = normalizeMortgageStatus(neg);
            assert.strictEqual(typeof res, 'object');
            assert.strictEqual(res.value, false, 'Phase 1 backwards compatibility value must be false');
            assert.strictEqual(res.controlledString, 'NO_MORTGAGE', 'Must produce controlled string NO_MORTGAGE');
            assert.notStrictEqual(typeof res, 'boolean', 'Must NEVER be primitive boolean');
        }

        // 1.2 Explicit generic positive statements resolve to controlled String
        const explicitPosLit = normalizeLitigationStatus('Yes');
        assert.strictEqual(explicitPosLit.value, true);
        assert.strictEqual(explicitPosLit.controlledString, 'LITIGATION_REPORTED');

        const explicitPosMort = normalizeMortgageStatus('Yes');
        assert.strictEqual(explicitPosMort.value, true);
        assert.strictEqual(explicitPosMort.controlledString, 'MORTGAGE_REPORTED');

        // 1.3 Meaningful categorical observations are preserved without boolean coercion
        const nuancedLitigation = [
            'Litigation pending in High Court',
            'Matter disposed',
            'Case dismissed by District Court',
            'Civil suit pending before Senior Division',
            'Arbitration stay order granted'
        ];
        for (const obs of nuancedLitigation) {
            const res = normalizeLitigationStatus(obs);
            assert.strictEqual(res.value, null, `Observation "${obs}" must NOT be coerced to boolean`);
            assert.strictEqual(res.sentinel, 'CATEGORICAL_STATUS');
            assert.strictEqual(res.status, obs, `Observation "${obs}" text must be preserved verbatim`);
            assert.strictEqual(res.controlledString, obs);
        }

        const nuancedMortgage = [
            'Under mortgage with SBI',
            'Bank lien under dispute',
            'Mortgage with HDFC Bank Limited',
            'Mortgage pending NOC from authority',
            'Charge registered with ROC'
        ];
        for (const obs of nuancedMortgage) {
            const res = normalizeMortgageStatus(obs);
            assert.strictEqual(res.value, null, `Observation "${obs}" must NOT be coerced to boolean`);
            assert.strictEqual(res.sentinel, 'CATEGORICAL_STATUS');
            assert.strictEqual(res.status, obs, `Observation "${obs}" text must be preserved verbatim`);
            assert.strictEqual(res.controlledString, obs);
        }

        // 1.4 Missing, empty, or error states NEVER infer absence of litigation/mortgage
        const missingInputs = [null, undefined, '', '   '];
        for (const miss of missingInputs) {
            const litMiss = normalizeLitigationStatus(miss);
            assert.strictEqual(isSentinel(litMiss) || Boolean(litMiss._sentinel), true);
            assert.notStrictEqual(litMiss.value, false, 'Missing input must NEVER infer no litigation');

            const mortMiss = normalizeMortgageStatus(miss);
            assert.strictEqual(isSentinel(mortMiss) || Boolean(mortMiss._sentinel), true);
            assert.notStrictEqual(mortMiss.value, false, 'Missing input must NEVER infer no mortgage');
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. BOOLEAN RULES INDEPENDENCE (BUILDING PLAN & OCCUPANCY CERTIFICATE)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('2. Boolean Rules Independence: buildingPlanApproved & occupancyCertificate', () => {
        // buildingPlanApproved and occupancyCertificate remain strictly Boolean
        const subSchema = Inventory.schema.path('authorityVerification').schema;
        assert.strictEqual(subSchema.path('buildingPlanApproved').instance, 'Boolean');
        assert.strictEqual(subSchema.path('occupancyCertificate').instance, 'Boolean');
        assert.strictEqual(subSchema.path('litigationStatus').instance, 'String');
        assert.strictEqual(subSchema.path('mortgageStatus').instance, 'String');

        // Normalization returns boolean values
        const planApproved = normalizeCategoricalBoolean('Approved', 'buildingPlanApproved');
        assert.strictEqual(planApproved.value, true);

        const planRejected = normalizeCategoricalBoolean('Not Sanctioned', 'buildingPlanApproved');
        assert.strictEqual(planRejected.value, false);

        const ocIssued = normalizeCategoricalBoolean('Issued', 'occupancyCertificate');
        assert.strictEqual(ocIssued.value, true);

        const ocNotIssued = normalizeCategoricalBoolean('Not Issued', 'occupancyCertificate');
        assert.strictEqual(ocNotIssued.value, false);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DATABASE SETUP (IN-MEMORY)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('Database Setup (In-Memory)', async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        tenantId = new mongoose.Types.ObjectId();
        testUser = { _id: new mongoose.Types.ObjectId(), tenantId };
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. CATEGORICAL-SENTINEL ROUND-TRIP & PII STRIPPING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('3. Categorical-Sentinel Round-Trip Consistency & PII Sanitization', async () => {
        const dummyLink = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: new mongoose.Types.ObjectId(),
            authorityCode: 'HSVP',
            authorityPropertyId: 'PROP-999',
            compositeKey: 'HSVP:GURUGRAM:14::PROP-999',
            matchConfidence: 100,
            linkStatus: 'CONFIRMED',
            createdBy: testUser._id
        });

        // 3.1 Categorical observations normalize and persist as clean string in Snapshot
        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId: dummyLink._id,
            policyVersion: '2026-10-27-PHASE1-DRAFT',
            rawSnapshotHash: 'a'.repeat(64),
            normalizedData: {
                propertyId: 'PROP-999',
                litigationStatus: normalizeLitigationStatus('Litigation pending in High Court'),
                mortgageStatus: normalizeMortgageStatus('Under mortgage with SBI'),
                duesStatus: 'PENDING'
            }
        });

        const clean = snapshot.normalizedData;
        assert.strictEqual(typeof clean.litigationStatus, 'string');
        assert.strictEqual(clean.litigationStatus, 'Litigation pending in High Court');
        assert.strictEqual(typeof clean.mortgageStatus, 'string');
        assert.strictEqual(clean.mortgageStatus, 'Under mortgage with SBI');

        // 3.2 Controlled negative normalization persists as controlled String in Snapshot
        const snapshotNeg = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId: dummyLink._id,
            policyVersion: '2026-10-27-PHASE1-DRAFT',
            rawSnapshotHash: 'b'.repeat(64),
            normalizedData: {
                propertyId: 'PROP-1000',
                litigationStatus: normalizeLitigationStatus('No court case'),
                mortgageStatus: normalizeMortgageStatus('Not under mortgage')
            }
        });
        assert.strictEqual(snapshotNeg.normalizedData.litigationStatus, 'NO_LITIGATION');
        assert.strictEqual(snapshotNeg.normalizedData.mortgageStatus, 'NO_MORTGAGE');

        // 3.3 Strict sentinels strip unauthorized nested keys and PII
        const maliciousSentinelDoc = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId: dummyLink._id,
            policyVersion: '2026-10-27-PHASE1-DRAFT',
            rawSnapshotHash: 'c'.repeat(64),
            normalizedData: {
                propertyId: 'PROP-1001',
                litigationStatus: {
                    _sentinel: 'NOT_RETURNED',
                    ownerPii: 'Aman Sharma',
                    bankAccount: '1234567890',
                    xss: '<script>alert(1)</script>'
                }
            }
        });
        const sanitized = maliciousSentinelDoc.normalizedData.litigationStatus;
        assert.strictEqual(sanitized._sentinel, 'NOT_RETURNED');
        assert.strictEqual(sanitized.ownerPii, undefined, 'Unauthorized nested PII must be stripped');
        assert.strictEqual(sanitized.bankAccount, undefined, 'Unauthorized nested account must be stripped');
        assert.strictEqual(sanitized.xss, undefined, 'Unauthorized nested script must be stripped');
        assert.strictEqual(Object.keys(sanitized).length, 1, 'Only _sentinel key must remain');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. HASH SENSITIVITY & CONTENT HASH REPRODUCIBILITY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('4. Hash Sensitivity: Distinct Categorical Observations Alter Hash', () => {
        const base = {
            authorityCode: 'HSVP',
            propertyId: 'PROP-HASH-01',
            urbanEstate: 'Gurugram',
            sectorNumber: 'Sector 14'
        };

        const hashA = computeSnapshotContentHash({
            ...base,
            litigationStatus: 'Litigation pending in High Court'
        });
        const hashB = computeSnapshotContentHash({
            ...base,
            litigationStatus: 'Matter disposed'
        });
        const hashC = computeSnapshotContentHash({
            ...base,
            litigationStatus: 'NO_LITIGATION'
        });

        assert.ok(hashA && hashB && hashC);
        assert.notStrictEqual(hashA, hashB, 'Distinct observation texts must yield distinct hashes');
        assert.notStrictEqual(hashA, hashC, 'Observation vs controlled negative must yield distinct hashes');
        assert.notStrictEqual(hashB, hashC);

        // Saved snapshot content hash matches pre-save object hash
        const preSaveHash = computeSnapshotContentHash({
            ...base,
            litigationStatus: normalizeLitigationStatus('Litigation pending in High Court')
        });
        assert.strictEqual(preSaveHash, hashA, 'Pre-save normalized object and clean string produce identical hash');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. DUES AND LEASE RENT DERIVATION RULES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('5. Dues & Lease-Rent Derivations: Strict Evidence & Uncertainty Handling', () => {
        // 5.1 duesStatus: CLEAR only on finite numeric 0
        assert.strictEqual(deriveDuesStatus({ value: 0, currency: 'INR' }), 'CLEAR');
        assert.strictEqual(deriveDuesStatus({ value: 1000, currency: 'INR' }), 'PENDING');
        assert.strictEqual(deriveDuesStatus({ value: -500, currency: 'INR' }), 'CLEAR');

        // 5.2 Dispute evidence in raw / detail / status resolves to DISPUTED
        assert.strictEqual(deriveDuesStatus({ raw: 'Stay granted by High Court', value: null }), 'DISPUTED');
        assert.strictEqual(deriveDuesStatus({ detail: 'Disputed calculation by allottee', value: 50000 }), 'DISPUTED');
        assert.strictEqual(deriveDuesStatus({ status: 'DISPUTED', value: null }), 'DISPUTED');

        // 5.3 Missing, empty, or unparsed dues NEVER infer CLEAR
        assert.strictEqual(deriveDuesStatus(null), 'UNKNOWN');
        assert.strictEqual(deriveDuesStatus(undefined), 'UNKNOWN');
        assert.strictEqual(deriveDuesStatus(SENTINEL.NOT_RETURNED), 'UNKNOWN');
        assert.strictEqual(deriveDuesStatus(SENTINEL.PARSE_ERROR), 'UNKNOWN');
        assert.strictEqual(deriveDuesStatus({ value: 'N/A' }), 'UNKNOWN');

        // 5.4 leaseRentStatus: General authorityStatus NEVER infers PAID
        const genericStatuses = ['Allotted', 'Active', 'Normal', 'Regular', 'Confirmed'];
        for (const st of genericStatuses) {
            assert.strictEqual(
                deriveLeaseRentStatus({ authorityStatus: st }),
                'UNKNOWN',
                `authorityStatus "${st}" must not infer rent paid`
            );
        }

        // 5.5 Freehold tenure exemption -> NOT_APPLICABLE
        assert.strictEqual(deriveLeaseRentStatus({ allotmentMode: 'Freehold Allotment' }), 'NOT_APPLICABLE');
        assert.strictEqual(deriveLeaseRentStatus({ propertyCategory: 'Freehold Residential' }), 'NOT_APPLICABLE');

        // 5.6 Explicit lease rent observations
        assert.strictEqual(deriveLeaseRentStatus({ leaseRent: 'Paid' }), 'PAID');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: 'Due' }), 'PENDING');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: { value: 2500 } }), 'PENDING');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: { value: 0 } }), 'PAID');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: 'Disputed' }), 'DISPUTED');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. POLICY ENCAPSULATION & PROTOTYPE EXPLOIT DEFENSES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('6. Policy Encapsulation: Native Prototype Mutation Rejection', () => {
        // Native Set.prototype.add.call, delete.call, clear.call fail on read-only proxy guards
        const sets = [
            PERMITTED_HASH_SET,
            EXCLUDED_HASH_FIELDS,
            PERMITTED_NESTED_KEYS.currentDues,
            PERMITTED_NESTED_KEYS.area
        ];

        for (const s of sets) {
            assert.throws(() => {
                Set.prototype.add.call(s, '__malicious_injection__');
            }, TypeError);

            assert.throws(() => {
                Set.prototype.delete.call(s, 'duesStatus');
            }, TypeError);

            assert.throws(() => {
                Set.prototype.clear.call(s);
            }, TypeError);
        }

        // Crosswalk immutability
        const crosswalk = getCanonicalHashCrosswalk();
        assert.strictEqual(crosswalk.length, 30);
        assert.throws(() => {
            CANONICAL_HASH_CROSSWALK.litigationStatus.tampered = true;
        }, TypeError);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7. INVENTORY OVERWRITE PROTECTION & APPLY GATE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('7. Apply Gate: Accept Valid Strings, Reject Sentinels & Protect Inventory.status', async () => {
        // Create initial Inventory record with existing facts
        const inv = await Inventory.create({
            tenantId,
            title: 'Plot 42 Sector 14 Gurugram',
            propertyId: 'PROP-42',
            status: 'Available',
            price: 5000000,
            authorityVerification: {
                litigationStatus: 'NO_LITIGATION',
                mortgageStatus: 'NO_MORTGAGE',
                duesStatus: 'CLEAR'
            }
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inv._id,
            authorityCode: 'HSVP',
            authorityPropertyId: 'PROP-42',
            compositeKey: 'HSVP:GURUGRAM:14::PROP-42',
            matchConfidence: 100,
            linkStatus: 'CONFIRMED',
            createdBy: testUser._id
        });

        await AuthoritySourceSettings.findOneAndUpdate(
            { tenantId, authorityCode: 'HSVP' },
            {
                $set: {
                    isEnabled: true,
                    isPaused: false,
                    permissionStatus: 'GRANTED',
                    approvedAccessMethod: 'PUBLIC_API',
                    approvalReference: 'GOV/HSVP/2026/001',
                    approvalExpiryDate: new Date(Date.now() + 86400000 * 365),
                    reviewStatus: 'APPROVED',
                    ratePolicy: { maxRequestsPerDay: 1000, maxRequestsPerHour: 100 },
                    identityRequirements: { verified: true },
                    permittedFields: ['propertyId', 'sectorNumber', 'litigationStatus', 'mortgageStatus']
                }
            },
            { upsert: true }
        );

        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode: 'HSVP',
            runMode: 'SINGLE',
            status: 'COMPLETED',
            requestedBy: testUser._id,
            createdBy: testUser._id,
            isFixtureMode: false,
            provenance: 'LIVE'
        });

        const initialStatus = inv.status;

        // 7.1 Reject overwriting valid litigationStatus with missing/unknown sentinel
        const itemReject = await PropertyVerificationRunItem.create({
            tenantId,
            runId: run._id,
            linkId: link._id,
            authorityCode: 'HSVP',
            inventoryId: inv._id,
            authorityPropertyId: 'PROP-42',
            status: 'SUCCEEDED',
            reviewerDecision: 'APPROVED',
            reviewedBy: new mongoose.Types.ObjectId(),
            proposedChanges: [
                {
                    field: 'authorityVerification.litigationStatus',
                    currentValue: 'NO_LITIGATION',
                    proposedValue: { _sentinel: 'NOT_RETURNED' },
                    approved: true
                },
                {
                    field: 'authorityVerification.mortgageStatus',
                    currentValue: 'NO_MORTGAGE',
                    proposedValue: 'UNKNOWN',
                    approved: true
                },
                {
                    field: 'status', // Top-level status attempt
                    currentValue: 'Available',
                    proposedValue: 'Verified',
                    approved: true
                }
            ]
        });

        const reqReject = {
            params: { itemId: itemReject._id.toString() },
            tenantId,
            user: { _id: testUser._id, tenantId }
        };

        const resReject = {
            statusCode: 200,
            data: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await applyApprovedChanges(reqReject, resReject);
        assert.strictEqual(resReject.statusCode, 422, 'Applying rejected/blocked/sentinel fields must return 422 Unprocessable Entity');
        assert.strictEqual(resReject.data.success, false);
        assert.ok(resReject.data.rejectedFields.length > 0, 'Rejection list must be returned');

        // Verify Inventory record is completely unchanged
        const freshInv = await Inventory.findById(inv._id);
        assert.strictEqual(freshInv.status.toString(), initialStatus.toString(), 'Top-level status must NEVER be modified');
        assert.strictEqual(freshInv.authorityVerification.litigationStatus, 'NO_LITIGATION');
        assert.strictEqual(freshInv.authorityVerification.mortgageStatus, 'NO_MORTGAGE');

        // 7.2 Successfully apply valid categorical string observation
        const snap = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId: link._id,
            runItemId: new mongoose.Types.ObjectId(),
            observedAt: new Date(),
            isSynthetic: false,
            provenance: 'LIVE',
            normalizedData: {},
            isSealed: true
        });

        const itemValid = await PropertyVerificationRunItem.create({
            tenantId,
            runId: run._id,
            snapshotId: snap._id,
            linkId: link._id,
            authorityCode: 'HSVP',
            inventoryId: inv._id,
            authorityPropertyId: 'PROP-42',
            status: 'SUCCEEDED',
            reviewerDecision: 'APPROVED',
            reviewedBy: new mongoose.Types.ObjectId(),
            isSynthetic: false,
            provenance: 'LIVE',
            proposedChanges: [
                {
                    field: 'authorityVerification.litigationStatus',
                    currentValue: 'NO_LITIGATION',
                    proposedValue: 'Litigation pending in High Court',
                    approved: true
                },
                {
                    field: 'authorityVerification.mortgageStatus',
                    currentValue: 'NO_MORTGAGE',
                    proposedValue: 'Under mortgage with SBI',
                    approved: true
                }
            ]
        });

        const reqValid = {
            params: { itemId: itemValid._id.toString() },
            tenantId,
            user: { _id: testUser._id, tenantId }
        };

        const resValid = {
            statusCode: 200,
            data: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await applyApprovedChanges(reqValid, resValid);
        assert.strictEqual(resValid.statusCode, 200);
        assert.strictEqual(resValid.data.data.appliedFields.length, 2);

        const updatedInv = await Inventory.findById(inv._id);
        assert.strictEqual(updatedInv.authorityVerification.litigationStatus, 'Litigation pending in High Court');
        assert.strictEqual(updatedInv.authorityVerification.mortgageStatus, 'Under mortgage with SBI');
        assert.strictEqual(updatedInv.status.toString(), initialStatus.toString(), 'Top-level Inventory.status remains isolated');
    });

    await t.test('Teardown Database', async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });
});
