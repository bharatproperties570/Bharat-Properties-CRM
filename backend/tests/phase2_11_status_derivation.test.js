import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
    CANONICAL_FIELDS,
    INTERNAL_ENGINE_FIELDS,
    isInternalEngineField,
    getInternalEngineFields,
    SENTINEL,
    isSentinel,
    createReadOnlySetGuard,
    createImmutableSet
} from '../services/authority/authorityFieldDictionary.js';

import {
    normalizeBooleanStatus,
    normalizeCategoricalBoolean,
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
    EXCLUDED_HASH_FIELDS,
    PERMITTED_NESTED_KEYS
} from '../services/authority/authorityNormalizer.js';

import PropertyVerificationSnapshot, {
    isPermittedSnapshotNormalizedKey,
    getPermittedSnapshotNormalizedKeys,
    PERMITTED_SNAPSHOT_NORMALIZED_KEYS
} from '../models/PropertyVerificationSnapshot.js';

import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    ALLOWED_UPDATE_FIELDS,
    BLOCKED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { applyApprovedChanges } from '../controllers/authorityVerification.controller.js';

test('--- PHASE 2.11: STATUS SEMANTICS, DERIVATION SAFETY & TEST-COUNT RECONCILIATION ---', async (t) => {
    let mongoServer;
    let tenantId;
    let testUser;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. AUDIT LITIGATION & MORTGAGE STATUS SEMANTICS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('1. Litigation & Mortgage Status Semantics: Preserve Categorical Observations', () => {
        // 1.1 Nuanced textual statuses are preserved as CATEGORICAL_STATUS observations
        const litigationPhrases = [
            'Litigation pending in High Court',
            'Matter disposed',
            'Court case pending',
            'case pending before High Court',
            'Pending before Civil Judge Senior Division',
            'dispute under arbitrator'
        ];

        for (const phrase of litigationPhrases) {
            const res = normalizeCategoricalBoolean(phrase, 'litigationStatus');
            assert.strictEqual(res.value, null, `"${phrase}" must NOT be coerced to boolean true or false`);
            assert.strictEqual(res.sentinel, 'CATEGORICAL_STATUS', `"${phrase}" must return CATEGORICAL_STATUS sentinel`);
            assert.ok(res.status || res.detail, `"${phrase}" must preserve textual observation`);
        }

        const mortgagePhrases = [
            'Under mortgage with SBI',
            'under mortgage',
            'Mortgage with HDFC Bank Limited',
            'Bank lien under dispute',
            'Mortgage pending NOC'
        ];

        for (const phrase of mortgagePhrases) {
            const res = normalizeCategoricalBoolean(phrase, 'mortgageStatus');
            assert.strictEqual(res.value, null, `"${phrase}" must NOT be coerced to boolean true or false`);
            assert.strictEqual(res.sentinel, 'CATEGORICAL_STATUS', `"${phrase}" must return CATEGORICAL_STATUS sentinel`);
            assert.ok(res.status || res.detail, `"${phrase}" must preserve textual observation`);
        }

        // 1.2 Explicit negative representations resolve to false
        const explicitNegativeLitigation = ['No', 'no', 'No litigation', 'no court case', 'no pending court case', 'nil', 'none'];
        for (const neg of explicitNegativeLitigation) {
            const res = normalizeCategoricalBoolean(neg, 'litigationStatus');
            assert.strictEqual(res.value, false, `"${neg}" must resolve to false`);
            assert.strictEqual(res.sentinel, null);
        }

        const explicitNegativeMortgage = ['No', 'no', 'Not under mortgage', 'no mortgage', 'mortgage cleared', 'nil', 'none', 'cleared'];
        for (const neg of explicitNegativeMortgage) {
            const res = normalizeCategoricalBoolean(neg, 'mortgageStatus');
            assert.strictEqual(res.value, false, `"${neg}" must resolve to false`);
            assert.strictEqual(res.sentinel, null);
        }

        // 1.3 NEVER infer absence of litigation/mortgage from empty, missing, not found, or error sentinels
        const missingValues = [null, undefined, '', '   ', 'not available', 'unknown', 'pending', 'RESTRICTED'];
        for (const missing of missingValues) {
            const litRes = normalizeCategoricalBoolean(missing, 'litigationStatus');
            assert.notStrictEqual(litRes.value, false, `Missing "${missing}" must NEVER be inferred as absence of litigation (false)`);

            const mortRes = normalizeCategoricalBoolean(missing, 'mortgageStatus');
            assert.notStrictEqual(mortRes.value, false, `Missing "${missing}" must NEVER be inferred as absence of mortgage (false)`);
        }
    });

    await t.test('2. Hash Sensitivity: Categorical Text Changes Alter Content Hash', () => {
        // Distinct observations must not collide under CATEGORICAL_STATUS
        const doc1 = {
            propertyId: 'P-LIT-01',
            litigationStatus: { _sentinel: 'CATEGORICAL_STATUS', status: 'Litigation pending in High Court' }
        };
        const doc2 = {
            propertyId: 'P-LIT-01',
            litigationStatus: { _sentinel: 'CATEGORICAL_STATUS', status: 'Matter disposed' }
        };

        const hash1 = computeSnapshotContentHash(doc1);
        const hash2 = computeSnapshotContentHash(doc2);
        assert.ok(hash1 && hash2);
        assert.notStrictEqual(hash1, hash2, 'Different categorical litigation observations must yield distinct hashes');

        const docM1 = {
            propertyId: 'P-MORT-01',
            mortgageStatus: { _sentinel: 'CATEGORICAL_STATUS', status: 'Under mortgage with SBI' }
        };
        const docM2 = {
            propertyId: 'P-MORT-01',
            mortgageStatus: { _sentinel: 'CATEGORICAL_STATUS', status: 'Mortgage cleared' }
        };

        const hashM1 = computeSnapshotContentHash(docM1);
        const hashM2 = computeSnapshotContentHash(docM2);
        assert.ok(hashM1 && hashM2);
        assert.notStrictEqual(hashM1, hashM2, 'Different categorical mortgage observations must yield distinct hashes');
    });

    await t.test('3. Intentionally Boolean Status Fields: buildingPlanApproved & occupancyCertificate', () => {
        // 3.1 Affirmative representations
        const planAffirmative = ['approved', 'sanctioned', 'yes', 'true', 'haan', true];
        for (const aff of planAffirmative) {
            const res = normalizeCategoricalBoolean(aff, 'buildingPlanApproved');
            assert.strictEqual(res.value, true, `Plan "${aff}" must resolve to true`);
        }

        const ocAffirmative = ['issued', 'granted', 'received', 'yes', 'true', 'haan', true];
        for (const aff of ocAffirmative) {
            const res = normalizeCategoricalBoolean(aff, 'occupancyCertificate');
            assert.strictEqual(res.value, true, `OC "${aff}" must resolve to true`);
        }

        // 3.2 Negative representations
        const planNegative = ['not approved', 'not applied', 'not sanctioned', 'no', 'false', 'nahi', false];
        for (const neg of planNegative) {
            const res = normalizeCategoricalBoolean(neg, 'buildingPlanApproved');
            assert.strictEqual(res.value, false, `Plan "${neg}" must resolve to false`);
        }

        const ocNegative = ['not issued', 'not applied', 'no', 'false', 'nahi', false];
        for (const neg of ocNegative) {
            const res = normalizeCategoricalBoolean(neg, 'occupancyCertificate');
            assert.strictEqual(res.value, false, `OC "${neg}" must resolve to false`);
        }

        // 3.3 Indeterminate representations (NEVER coerced to false or true)
        const indeterminate = ['pending', 'under review', 'rejected'];
        for (const ind of indeterminate) {
            const resPlan = normalizeCategoricalBoolean(ind, 'buildingPlanApproved');
            assert.strictEqual(resPlan.value, null, `Plan "${ind}" must NOT be coerced to boolean`);
            assert.strictEqual(resPlan.sentinel, 'CATEGORICAL_STATUS');

            if (ind !== 'rejected') {
                const resOc = normalizeCategoricalBoolean(ind, 'occupancyCertificate');
                assert.strictEqual(resOc.value, null, `OC "${ind}" must NOT be coerced to boolean`);
                assert.strictEqual(resOc.sentinel, 'CATEGORICAL_STATUS');
            }
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. AUDIT DUESSTATUS & LEASERENTSTATUS DERIVATIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('4. duesStatus Derivation: Rules, Negative Inference Defense & Disputed Handling', () => {
        // 4.1 value === 0 -> CLEAR
        assert.strictEqual(deriveDuesStatus({ value: 0, currency: 'INR' }), 'CLEAR');

        // 4.2 value > 0 -> PENDING
        assert.strictEqual(deriveDuesStatus({ value: 12500, currency: 'INR' }), 'PENDING');

        // 4.3 value < 0 -> CLEAR (advance payment / credit balance)
        assert.strictEqual(deriveDuesStatus({ value: -500, currency: 'INR' }), 'CLEAR');

        // 4.4 Disputed notes/text -> DISPUTED
        assert.strictEqual(deriveDuesStatus({ value: 50000, raw: 'Dues disputed in High Court' }), 'DISPUTED');
        assert.strictEqual(deriveDuesStatus({ value: 10000, detail: 'Stay granted by court against recovery' }), 'DISPUTED');

        // 4.5 CRITICAL SAFETY: Missing dues amount NEVER infers CLEAR
        assert.strictEqual(deriveDuesStatus(null), 'UNKNOWN', 'Null dues must return UNKNOWN');
        assert.strictEqual(deriveDuesStatus(undefined), 'UNKNOWN', 'Undefined dues must return UNKNOWN');
        assert.strictEqual(deriveDuesStatus({ value: null }), 'UNKNOWN', 'Null value dues must return UNKNOWN');
        assert.strictEqual(deriveDuesStatus(SENTINEL.NOT_RETURNED), 'UNKNOWN', 'NOT_RETURNED sentinel must return UNKNOWN');
        assert.strictEqual(deriveDuesStatus(SENTINEL.PARSE_ERROR), 'UNKNOWN', 'PARSE_ERROR sentinel must return UNKNOWN');
        assert.strictEqual(deriveDuesStatus({ value: 'N/A' }), 'UNKNOWN', 'Unparseable dues must return UNKNOWN');
    });

    await t.test('5. leaseRentStatus Derivation: Tenure Rules & Authority Status Independence', () => {
        // 5.1 Freehold properties -> NOT_APPLICABLE
        assert.strictEqual(deriveLeaseRentStatus({ allotmentMode: 'Freehold' }), 'NOT_APPLICABLE');
        assert.strictEqual(deriveLeaseRentStatus({ propertyCategory: 'Freehold Residential' }), 'NOT_APPLICABLE');
        assert.strictEqual(deriveLeaseRentStatus({ propertyType: 'Freehold Plot' }), 'NOT_APPLICABLE');

        // 5.2 Explicit lease rent facts
        assert.strictEqual(deriveLeaseRentStatus({ leaseRent: 'Paid' }), 'PAID');
        assert.strictEqual(deriveLeaseRentStatus({ leaseRent: 'Cleared' }), 'PAID');
        assert.strictEqual(deriveLeaseRentStatus({ leaseRent: 'Up to date' }), 'PAID');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: 'Due' }), 'PENDING');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: 'Unpaid' }), 'PENDING');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: { value: 1500 } }), 'PENDING');
        assert.strictEqual(deriveLeaseRentStatus({ groundRent: { value: 0 } }), 'PAID');

        // 5.3 CRITICAL SAFETY: General authorityStatus alone NEVER infers lease rent is PAID
        const genericAuthorityStatuses = ['Allotted', 'Active', 'Normal', 'Regular', 'Confirmed'];
        for (const status of genericAuthorityStatuses) {
            const derived = deriveLeaseRentStatus({ authorityStatus: status });
            assert.strictEqual(
                derived,
                'UNKNOWN',
                `General authorityStatus "${status}" must NEVER infer lease rent is PAID`
            );
        }
    });

    await t.test('6. Record Normalization Integration: duesStatus & leaseRentStatus Ingestion', () => {
        const dummyMapping = {
            propertyId: { sourceLabel: 'Plot No', evidence: 'UNVERIFIED' },
            currentDues: { sourceLabel: 'Dues', evidence: 'UNVERIFIED' },
            authorityStatus: { sourceLabel: 'Status', evidence: 'UNVERIFIED' }
        };

        // Record with 0 dues
        const rawClear = { 'Plot No': '101', Dues: '0', Status: 'Allotted' };
        const normClear = normalizeAuthorityRecord('HSVP', rawClear, dummyMapping);
        assert.strictEqual(normClear.record.duesStatus, 'CLEAR');
        assert.strictEqual(normClear.record.leaseRentStatus, 'UNKNOWN');

        // Record with missing dues
        const rawMissing = { 'Plot No': '102', Status: 'Allotted' };
        const normMissing = normalizeAuthorityRecord('HSVP', rawMissing, dummyMapping);
        assert.strictEqual(normMissing.record.duesStatus, 'UNKNOWN');
        assert.strictEqual(normMissing.record.leaseRentStatus, 'UNKNOWN');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. POLICY ENCAPSULATION & IMMUTABILITY AUDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('7. Immutability & Anti-Mutation Audit on Policy Sets and Getters', () => {
        // 7.1 Set.prototype exploit defense
        const setsToTest = [
            { name: 'INTERNAL_ENGINE_FIELDS', set: INTERNAL_ENGINE_FIELDS },
            { name: 'PERMITTED_HASH_SET', set: PERMITTED_HASH_SET },
            { name: 'EXCLUDED_HASH_FIELDS', set: EXCLUDED_HASH_FIELDS },
            { name: 'PERMITTED_SNAPSHOT_NORMALIZED_KEYS', set: PERMITTED_SNAPSHOT_NORMALIZED_KEYS }
        ];

        for (const { name, set } of setsToTest) {
            assert.throws(() => set.add('tampered_field'), TypeError, `${name}.add must throw`);
            assert.throws(() => set.delete('propertyId'), TypeError, `${name}.delete must throw`);
            assert.throws(() => set.clear(), TypeError, `${name}.clear must throw`);
            assert.throws(() => Set.prototype.add.call(set, 'tampered_proto'), TypeError, `Set.prototype.add on ${name} must throw`);
            assert.throws(() => Set.prototype.delete.call(set, 'propertyId'), TypeError, `Set.prototype.delete on ${name} must throw`);
        }

        // 7.2 Getter defensive copying verification
        const hashFieldsCopy = getPermittedHashFields();
        hashFieldsCopy.push('evil_hash_field');
        assert.strictEqual(isPermittedHashField('evil_hash_field'), false, 'Mutating getPermittedHashFields array copy must not alter policy');

        const excludedFieldsCopy = getExcludedHashFields();
        excludedFieldsCopy.push('evil_excluded');
        assert.strictEqual(isExcludedHashField('evil_excluded'), false, 'Mutating getExcludedHashFields array copy must not alter policy');

        const engineFieldsCopy = getInternalEngineFields();
        engineFieldsCopy.push('evil_engine');
        assert.strictEqual(isInternalEngineField('evil_engine'), false, 'Mutating getInternalEngineFields array copy must not alter policy');

        const snapshotKeysCopy = getPermittedSnapshotNormalizedKeys();
        snapshotKeysCopy.push('evil_snapshot_key');
        assert.strictEqual(isPermittedSnapshotNormalizedKey('evil_snapshot_key'), false, 'Mutating getPermittedSnapshotNormalizedKeys copy must not alter policy');

        const crosswalkList = getCanonicalHashCrosswalk();
        assert.strictEqual(crosswalkList.length, 30);
        assert.throws(() => { crosswalkList[0].tampered = true; }, TypeError, 'Mutating getCanonicalHashCrosswalk entry must throw');
        assert.strictEqual(getCrosswalkEntry(crosswalkList[0].hashField).tampered, undefined, 'Crosswalk entry must remain untampered');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. CANONICAL-TO-HASH CONTRACT VALIDATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('8. Exact Field Counts & Crosswalk Integrity', () => {
        // 8.1 Field counts
        const canonicalFieldKeys = Object.keys(CANONICAL_FIELDS);
        assert.strictEqual(canonicalFieldKeys.length, 37, 'CANONICAL_FIELDS must contain exactly 37 fields');

        const permittedHashKeys = getPermittedHashFields();
        assert.strictEqual(permittedHashKeys.length, 30, 'PERMITTED_HASH_FIELDS must contain exactly 30 fields');

        const crosswalkKeys = Object.keys(CANONICAL_HASH_CROSSWALK);
        assert.strictEqual(crosswalkKeys.length, 30, 'CANONICAL_HASH_CROSSWALK must contain exactly 30 fields');

        // 8.2 Specific contract crosswalk points
        const transferEntry = getCrosswalkEntry('transferDate');
        assert.strictEqual(transferEntry.classification, 'aliased');
        assert.deepEqual(transferEntry.canonicalSourceFields, ['lastTransferDate']);

        const areaValEntry = getCrosswalkEntry('propertyAreaValue');
        assert.strictEqual(areaValEntry.classification, 'normalized');
        assert.deepEqual(areaValEntry.canonicalSourceFields, ['area']);

        const areaUnitEntry = getCrosswalkEntry('propertyAreaUnit');
        assert.strictEqual(areaUnitEntry.classification, 'normalized');
        assert.deepEqual(areaUnitEntry.canonicalSourceFields, ['area']);

        const authCodeEntry = getCrosswalkEntry('authorityCode');
        assert.strictEqual(authCodeEntry.classification, 'derived');
        assert.deepEqual(authCodeEntry.canonicalSourceFields, ['authority']);

        // 8.3 Reconciled types for litigationStatus and mortgageStatus
        const litEntry = getCrosswalkEntry('litigationStatus');
        assert.strictEqual(litEntry.transformAndType.includes('String'), true, 'litigationStatus type must reflect String / Categorical');

        const mortEntry = getCrosswalkEntry('mortgageStatus');
        assert.strictEqual(mortEntry.transformAndType.includes('String'), true, 'mortgageStatus type must reflect String / Categorical');

        // 8.4 duesStatus and leaseRentStatus crosswalk definitions
        const duesEntry = getCrosswalkEntry('duesStatus');
        assert.strictEqual(duesEntry.classification, 'derived');
        assert.deepEqual(duesEntry.canonicalSourceFields, ['currentDues']);

        const leaseRentEntry = getCrosswalkEntry('leaseRentStatus');
        assert.strictEqual(leaseRentEntry.classification, 'derived');
        assert.deepEqual(leaseRentEntry.canonicalSourceFields, ['authorityStatus', 'allotmentMode']);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. INVENTORY OVERWRITE PROTECTION & FIELD ISOLATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('Database Setup (In-Memory)', async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        tenantId = new mongoose.Types.ObjectId();
        testUser = { _id: new mongoose.Types.ObjectId() };
    });

    await t.test('9. Field Isolation: authorityStatus Strictly Distinct from Inventory.status', () => {
        assert.strictEqual(BLOCKED_UPDATE_FIELDS.has('status'), true, 'Inventory.status must be strictly BLOCKED from authority updates');
        assert.strictEqual(ALLOWED_UPDATE_FIELDS.has('authorityVerification.authorityStatus'), true, 'authorityStatus must update only nested subschema');
    });

    await t.test('10. Overwrite Protection: Reject Overwriting Valid Inventory Data with Missing/Unknown/Sentinel', async () => {
        // 10.1 Create an Inventory record with valid existing data
        const inventory = await Inventory.create({
            tenantId,
            projectName: 'Phase 2.11 Sector 14 Test',
            unitNo: 'PL-211',
            status: 'Available',
            authorityVerification: {
                propertyId: 'HSVP-VALID-01',
                duesStatus: 'CLEAR',
                mortgageStatus: 'No mortgage recorded'
            }
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inventory._id,
            authorityCode: 'HSVP',
            propertyId: 'HSVP-VALID-01',
            urbanEstate: 'Gurugram',
            createdBy: testUser._id
        });

        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode: 'HSVP',
            requestedBy: testUser._id,
            runMode: 'SINGLE',
            status: 'COMPLETED'
        });

        // 10.2 Create run item proposing to overwrite valid data with 'UNKNOWN', sentinel, or null
        const item = await PropertyVerificationRunItem.create({
            tenantId,
            runId: run._id,
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode: 'HSVP',
            status: 'SUCCEEDED',
            reviewerDecision: 'APPROVED',
            proposedChanges: [
                {
                    field: 'authorityVerification.duesStatus',
                    currentValue: 'CLEAR',
                    proposedValue: 'UNKNOWN',
                    approved: true
                },
                {
                    field: 'authorityVerification.mortgageStatus',
                    currentValue: 'No mortgage recorded',
                    proposedValue: { _sentinel: 'NOT_RETURNED' },
                    approved: true
                }
            ]
        });

        // Mock req and res
        const req = {
            params: { itemId: item._id },
            user: { _id: testUser._id, tenantId },
            tenantId
        };

        let responseStatusCode = null;
        let responseJson = null;

        const res = {
            status(code) {
                responseStatusCode = code;
                return this;
            },
            json(payload) {
                responseJson = payload;
                return this;
            }
        };

        // 10.3 Attempt to apply proposed changes
        await applyApprovedChanges(req, res);

        assert.strictEqual(responseStatusCode, 422, 'Should return HTTP 422 because all proposed values were invalid/sentinels');
        assert.strictEqual(responseJson.success, false);
        assert.strictEqual(responseJson.rejectedFields.length, 2);

        // Verify Inventory record is completely UNTOUCHED
        const reloaded = await Inventory.findById(inventory._id);
        assert.strictEqual(reloaded.authorityVerification.duesStatus, 'CLEAR', 'Existing valid duesStatus must NOT be overwritten');
        assert.strictEqual(reloaded.authorityVerification.mortgageStatus, 'No mortgage recorded', 'Existing valid mortgageStatus must NOT be overwritten');
    });

    await t.test('Teardown Database', async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });
});
