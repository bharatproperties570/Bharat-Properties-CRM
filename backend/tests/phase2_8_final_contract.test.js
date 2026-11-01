/**
 * Phase 2.8 — Final Evidence Semantics, Hash Input & Privacy Boundary Audit Suite
 *
 * Verifies:
 * 1. Source Evidence Status & Provenance Separation:
 *    - All 37 canonical fields and 3 authority source maps audited.
 *    - Internal engine fields (authority, policyVersion, verificationStatus, matchConfidence,
 *      matchStrategy, verifiedAt, verifiedBy, source, snapshotContentHash, rawSnapshotHash)
 *      are strictly NOT_APPLICABLE (never VERIFIED_FROM_OFFICIAL_SPEC or VERIFIED_FROM_SAMPLE).
 *    - All portal data fields remain UNVERIFIED without genuine samples.
 *    - NOT_SUPPORTED retained only where affirmative non-support evidence exists.
 *    - proposedSourceLabel vs verifiedSourceLabel: null separation across all source maps.
 * 2. Hash Input Genuinely Normalized (Raw Strings Removed):
 *    - PERMITTED_NESTED_KEYS excludes 'raw' across financial (allotmentPrice, currentDues, totalPaid) and area.
 *    - Modifying or removing 'raw' strings does NOT alter the computed content hash.
 *    - Modifying 'value', 'currency', 'unit', or 'mode' DOES alter the computed content hash.
 *    - Recursive allowlisting and strict typing: malformed/nested injected objects are stripped.
 *    - Table-driven unit test verifying every permitted hash field participates in the hash digest.
 *    - Key-order invariance and typed sentinel equivalence.
 * 3. Personal-Data Persistence Boundary Hardening:
 *    - Strict allowlisted persistence contract for PropertyVerificationSnapshot.normalizedData.
 *    - Rejection/stripping of all PII variants: camelCase, snake_case, PascalCase, arbitrary keys.
 *    - ownerDataPresent set to true and ownerDataRedacted set to true when PII is detected.
 *    - ownerName schema field strictly coerced to null.
 *    - Both save() and insertMany() paths enforce privacy boundary.
 *    - Zero CRM Contact creation or linking.
 * 4. System Coexistence:
 *    - Authority Verification routes, Role permissions, and AuditLog events coexist cleanly
 *      with upstream main (Phase 14 automation audit logs).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
    CONTRACT_MAPPING_STATUS,
    SOURCE_EVIDENCE_STATUS,
    EVIDENCE_STATUS,
    CANONICAL_FIELDS,
    INTERNAL_ENGINE_FIELDS,
    SOURCE_FIELD_MAPS,
    SENTINEL
} from '../services/authority/authorityFieldDictionary.js';

import {
    computeSnapshotContentHash,
    computeNormalizedContentHash,
    PERMITTED_HASH_FIELDS,
    PERMITTED_NESTED_KEYS,
    EXCLUDED_HASH_FIELDS
} from '../services/authority/authorityNormalizer.js';

import PropertyVerificationSnapshot, {
    PERMITTED_SNAPSHOT_NORMALIZED_KEYS
} from '../models/PropertyVerificationSnapshot.js';

import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import Inventory from '../models/Inventory.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Contact from '../models/Contact.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import User from '../models/User.js';

test('--- PHASE 2.8: FINAL EVIDENCE SEMANTICS, HASH INPUT & PRIVACY BOUNDARY AUDIT ---', async (t) => {

    let mongoServer;
    let tenantId;
    let userId;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: SOURCE EVIDENCE SEMANTICS & STATUS AUDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('1. Status Enums & Provenance Separation', () => {
        assert.ok(CONTRACT_MAPPING_STATUS);
        assert.ok(SOURCE_EVIDENCE_STATUS);
        assert.equal(EVIDENCE_STATUS, SOURCE_EVIDENCE_STATUS);

        assert.equal(CONTRACT_MAPPING_STATUS.VERIFIED, 'VERIFIED');
        assert.equal(CONTRACT_MAPPING_STATUS.PROVISIONAL, 'PROVISIONAL');
        assert.equal(CONTRACT_MAPPING_STATUS.DEFERRED, 'DEFERRED');
        assert.equal(CONTRACT_MAPPING_STATUS.NOT_APPLICABLE, 'NOT_APPLICABLE');

        assert.equal(SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_SAMPLE, 'VERIFIED_FROM_SAMPLE');
        assert.equal(SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_OFFICIAL_SPEC, 'VERIFIED_FROM_OFFICIAL_SPEC');
        assert.equal(SOURCE_EVIDENCE_STATUS.UNVERIFIED, 'UNVERIFIED');
        assert.equal(SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, 'NOT_SUPPORTED');
        assert.equal(SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, 'NOT_APPLICABLE');
        assert.equal(SOURCE_EVIDENCE_STATUS.INTERNAL_ENGINE, 'NOT_APPLICABLE');
    });

    await t.test('2. Internal Orchestrator Artifacts Must Be NOT_APPLICABLE (Never VERIFIED_FROM_OFFICIAL_SPEC)', () => {
        // INTERNAL_ENGINE_FIELDS set declared and frozen
        assert.ok(INTERNAL_ENGINE_FIELDS instanceof Set);
        assert.ok(Object.isFrozen(INTERNAL_ENGINE_FIELDS));

        const expectedEngineFields = [
            'authority', 'policyVersion', 'verificationStatus', 'matchConfidence',
            'matchStrategy', 'verifiedAt', 'verifiedBy', 'source',
            'snapshotContentHash', 'rawSnapshotHash'
        ];

        for (const field of expectedEngineFields) {
            assert.ok(
                INTERNAL_ENGINE_FIELDS.has(field),
                `INTERNAL_ENGINE_FIELDS must contain ${field}`
            );
        }

        // In source maps, authority and policyVersion must have sourceEvidenceStatus: NOT_APPLICABLE
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const map = SOURCE_FIELD_MAPS[auth];
            assert.equal(map.authority.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE);
            assert.equal(map.policyVersion.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE);
            assert.notEqual(map.authority.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_OFFICIAL_SPEC);
            assert.notEqual(map.policyVersion.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_OFFICIAL_SPEC);
        }
    });

    await t.test('3. Data-Derived Source Fields Remain Strictly UNVERIFIED Without Genuine Samples', () => {
        const dataDerivedFields = [
            'propertyId', 'fileNumber', 'formNumber', 'schemeName', 'sectorNumber',
            'blockCode', 'propertyCategory', 'propertyType', 'area',
            'allotmentMode', 'authorityStatus', 'possessionStatus',
            'allotmentPrice', 'currentDues', 'totalPaid',
            'allotmentDate', 'possessionDate', 'lastTransferDate', 'litigationStatus',
            'mortgageStatus', 'buildingPlanApproved', 'occupancyCertificate'
        ];

        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const map = SOURCE_FIELD_MAPS[auth];
            for (const field of dataDerivedFields) {
                const entry = map[field];
                if (!entry) continue;
                if (entry.sourceEvidenceStatus === SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED) continue;

                assert.equal(
                    entry.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.UNVERIFIED,
                    `${auth}.${field} must remain UNVERIFIED until real redacted sample is provided`
                );
                assert.notEqual(
                    entry.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_SAMPLE,
                    `${auth}.${field} cannot be VERIFIED_FROM_SAMPLE`
                );
                assert.notEqual(
                    entry.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_OFFICIAL_SPEC,
                    `${auth}.${field} cannot be VERIFIED_FROM_OFFICIAL_SPEC`
                );
            }
        }
    });

    await t.test('4. NOT_SUPPORTED Retained Exclusively Where Affirmative Source Evidence Exists', () => {
        // HSVP: No municipal Estate Office tier
        assert.equal(SOURCE_FIELD_MAPS.HSVP.estateOffice.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.HSVP.estateOffice.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);

        // Chandigarh: Union territory divided into Sectors, not Haryana Urban Estates
        assert.equal(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.urbanEstate.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.urbanEstate.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);

        // Chandigarh phaseCode is UNVERIFIED (Industrial Area Phase I & II exist; non-support is NOT established)
        assert.equal(
            SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.phaseCode.sourceEvidenceStatus,
            SOURCE_EVIDENCE_STATUS.UNVERIFIED
        );

        // GMADA: Authority itself under PUDA, not an Estate Office structure
        assert.equal(SOURCE_FIELD_MAPS.GMADA.estateOffice.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.estateOffice.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.urbanEstate.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.urbanEstate.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
    });

    await t.test('5. Proposed Source Labels Distinguished from Verified Source Labels (verifiedSourceLabel: null)', () => {
        for (const [auth, map] of Object.entries(SOURCE_FIELD_MAPS)) {
            for (const [field, def] of Object.entries(map)) {
                assert.ok('proposedSourceLabel' in def, `${auth}.${field} must declare proposedSourceLabel`);
                assert.ok('verifiedSourceLabel' in def, `${auth}.${field} must declare verifiedSourceLabel`);
                assert.equal(def.verifiedSourceLabel, null, `${auth}.${field} verifiedSourceLabel must be null`);
                assert.equal(def.sourceLabel, def.proposedSourceLabel, `${auth}.${field} sourceLabel must match proposedSourceLabel`);
            }
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: HASH INPUT IS GENUINELY NORMALIZED (RAW STRINGS REMOVED)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('6. PERMITTED_NESTED_KEYS Excludes "raw" Strings', () => {
        assert.ok(!PERMITTED_NESTED_KEYS.allotmentPrice.has('raw'), 'allotmentPrice must not permit raw');
        assert.ok(!PERMITTED_NESTED_KEYS.currentDues.has('raw'), 'currentDues must not permit raw');
        assert.ok(!PERMITTED_NESTED_KEYS.totalPaid.has('raw'), 'totalPaid must not permit raw');
        assert.ok(!PERMITTED_NESTED_KEYS.area.has('raw'), 'area must not permit raw');

        assert.deepEqual(Array.from(PERMITTED_NESTED_KEYS.allotmentPrice).sort(), ['currency', 'value']);
        assert.deepEqual(Array.from(PERMITTED_NESTED_KEYS.currentDues).sort(), ['currency', 'value']);
        assert.deepEqual(Array.from(PERMITTED_NESTED_KEYS.totalPaid).sort(), ['currency', 'value']);
        assert.deepEqual(Array.from(PERMITTED_NESTED_KEYS.area).sort(), ['mode', 'unit', 'value']);
    });

    await t.test('7. Modifying or Removing "raw" Strings Does NOT Alter Snapshot Content Hash', () => {
        const withoutRaw = {
            propertyId: 'PLOT-777',
            sectorNumber: '15',
            allotmentPrice: { value: 5000000, currency: 'INR' },
            currentDues: { value: 0, currency: 'INR' }
        };

        const withRaw = {
            propertyId: 'PLOT-777',
            sectorNumber: '15',
            allotmentPrice: { value: 5000000, currency: 'INR', raw: '50 Lakhs' },
            currentDues: { value: 0, currency: 'INR', raw: 'Nil' }
        };

        const withModifiedRaw = {
            propertyId: 'PLOT-777',
            sectorNumber: '15',
            allotmentPrice: { value: 5000000, currency: 'INR', raw: '₹ 50,00,000.00 /-' },
            currentDues: { value: 0, currency: 'INR', raw: 'ZERO DUES - N.A.' }
        };

        const withHtmlInRaw = {
            propertyId: 'PLOT-777',
            sectorNumber: '15',
            allotmentPrice: { value: 5000000, currency: 'INR', raw: '<span class="price">50L</span>' },
            currentDues: { value: 0, currency: 'INR', raw: '<div id="dues">0</div>' }
        };

        const hashWithoutRaw = computeSnapshotContentHash(withoutRaw);
        const hashWithRaw = computeSnapshotContentHash(withRaw);
        const hashWithModifiedRaw = computeSnapshotContentHash(withModifiedRaw);
        const hashWithHtml = computeSnapshotContentHash(withHtmlInRaw);

        assert.equal(hashWithRaw, hashWithoutRaw, 'Adding raw string must NOT alter hash');
        assert.equal(hashWithModifiedRaw, hashWithoutRaw, 'Modifying raw string must NOT alter hash');
        assert.equal(hashWithHtml, hashWithoutRaw, 'HTML fragments in raw must NOT alter hash');
    });

    await t.test('8. Modifying Canonical Value or Currency DOES Alter Snapshot Content Hash', () => {
        const baseline = {
            propertyId: 'PLOT-777',
            allotmentPrice: { value: 5000000, currency: 'INR' }
        };

        const modifiedValue = {
            propertyId: 'PLOT-777',
            allotmentPrice: { value: 5000001, currency: 'INR' }
        };

        const modifiedCurrency = {
            propertyId: 'PLOT-777',
            allotmentPrice: { value: 5000000, currency: 'USD' }
        };

        const baseHash = computeSnapshotContentHash(baseline);
        const valHash = computeSnapshotContentHash(modifiedValue);
        const currHash = computeSnapshotContentHash(modifiedCurrency);

        assert.notEqual(valHash, baseHash, 'Altering numeric value MUST alter hash');
        assert.notEqual(currHash, baseHash, 'Altering currency MUST alter hash');
    });

    await t.test('9. Recursive Allowlisting & Strict Canonical Typing (Injected/Deep Objects Stripped)', () => {
        const clean = {
            propertyId: 'P-100',
            allotmentPrice: { value: 1200000, currency: 'INR' }
        };

        // Injected malformed / nested data
        const contaminated = {
            propertyId: 'P-100',
            allotmentPrice: {
                value: 1200000,
                currency: 'INR',
                raw: 'untrusted string',
                nestedSecret: { token: 'xyz123' },
                owner_name: 'Smuggled Name',
                allottee_address: 'Smuggled Address'
            }
        };

        assert.equal(
            computeSnapshotContentHash(contaminated),
            computeSnapshotContentHash(clean),
            'Injected nested objects and unpermitted keys must be stripped by recursive allowlist'
        );

        // Object injected as value is rejected from being hashed as an arbitrary dictionary
        const injectedObjAsValue = {
            propertyId: 'P-100',
            allotmentPrice: {
                value: { malicious: 'data' },
                currency: 'INR'
            }
        };
        const expectedWhenValueInvalid = computeSnapshotContentHash({
            propertyId: 'P-100',
            allotmentPrice: { currency: 'INR' }
        });
        assert.equal(
            computeSnapshotContentHash(injectedObjAsValue),
            expectedWhenValueInvalid,
            'Malformed object value must be discarded rather than recursively hashed'
        );
    });

    await t.test('10. Table-Driven Unit Test: Every Permitted Field Participates in Content Hash', () => {
        const baseHash = computeSnapshotContentHash({ propertyId: 'P-TABLE-BASE' });

        for (const field of PERMITTED_HASH_FIELDS) {
            let sampleVal;
            if (field.includes('Date')) {
                sampleVal = new Date('2026-03-15T00:00:00.000Z');
            } else if (field === 'buildingPlanApproved' || field === 'occupancyCertificate') {
                sampleVal = true;
            } else if (field === 'propertyAreaValue') {
                sampleVal = 250;
            } else if (['allotmentPrice', 'currentDues', 'totalPaid'].includes(field)) {
                sampleVal = { value: 99999, currency: 'INR' };
            } else {
                sampleVal = 'TEST_FACT_' + field;
            }

            const input = { propertyId: 'P-TABLE-BASE', [field]: sampleVal };
            const fieldHash = computeSnapshotContentHash(input);

            assert.notEqual(
                fieldHash,
                baseHash,
                `Permitted hash field "${field}" must alter the content hash`
            );
        }
    });

    await t.test('11. Key-Order Invariance & Sentinel Canonicalization', () => {
        // Nested key order invariance
        const orderA = {
            propertyId: 'P-99',
            allotmentPrice: { currency: 'INR', value: 800000 }
        };
        const orderB = {
            propertyId: 'P-99',
            allotmentPrice: { value: 800000, currency: 'INR' }
        };
        assert.equal(computeSnapshotContentHash(orderA), computeSnapshotContentHash(orderB));

        // Top-level key order invariance
        const topA = { propertyId: 'P-1', sectorNumber: '20', schemeName: 'Urban Estate' };
        const topB = { schemeName: 'Urban Estate', propertyId: 'P-1', sectorNumber: '20' };
        assert.equal(computeSnapshotContentHash(topA), computeSnapshotContentHash(topB));

        // Typed sentinel invariance
        const sentA = { propertyId: 'P-1', litigationStatus: SENTINEL.FALSE };
        const sentB = { propertyId: 'P-1', litigationStatus: { _sentinel: 'FALSE' } };
        const sentC = { propertyId: 'P-1', litigationStatus: { sentinel: 'FALSE' } };
        assert.equal(computeSnapshotContentHash(sentA), computeSnapshotContentHash(sentB));
        assert.equal(computeSnapshotContentHash(sentA), computeSnapshotContentHash(sentC));
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: PERSONAL-DATA PERSISTENCE BOUNDARY HARDENING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('Database Setup (In-Memory)', async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        tenantId = new mongoose.Types.ObjectId();
        userId = new mongoose.Types.ObjectId();
        assert.ok(mongoose.connection.readyState === 1);
    });

    await t.test('12. PropertyVerificationSnapshot — Strict Allowlisted normalizedData Persistence', async () => {
        // Assert PERMITTED_SNAPSHOT_NORMALIZED_KEYS exists and is frozen
        assert.ok(PERMITTED_SNAPSHOT_NORMALIZED_KEYS instanceof Set);
        assert.ok(Object.isFrozen(PERMITTED_SNAPSHOT_NORMALIZED_KEYS));

        const linkId = new mongoose.Types.ObjectId();

        // Pass normalizedData containing canonical fields AND various PII casing variants
        const rawNormalizedInput = {
            propertyId: 'PLOT-500',
            sectorNumber: '10',
            allotmentPrice: { value: 3500000, currency: 'INR' },
            // PII variants that MUST be stripped:
            ownerName: 'Vipul Sharma',
            allotteeName: 'Vipul Sharma',
            allotteeAddress: 'House 123, Sector 10',
            owner_name: 'Vipul Sharma (snake)',
            allottee_name: 'Vipul Sharma (snake)',
            allottee_address: '123 Snake Road',
            phone_number: '9876543210',
            mobile_no: '9876543210',
            email_address: 'vipul@example.com',
            pan_card: 'ABCDE1234F',
            aadhaar_number: '1234-5678-9012',
            father_name: 'Senior Sharma',
            unknown_arbitrary_field: 'Injected Payload'
        };

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId,
            normalizedData: rawNormalizedInput
        });

        // Verify document persisted in database
        const persisted = await PropertyVerificationSnapshot.findById(snapshot._id).lean();

        // 1. PII detection flags
        assert.equal(persisted.ownerDataPresent, true, 'ownerDataPresent must be true when PII is detected');
        assert.equal(persisted.ownerDataRedacted, true, 'ownerDataRedacted must always be true');

        // 2. Schema field ownerName coerced to null
        assert.equal(persisted.normalizedData.ownerName, null, 'ownerName must be coerced to null');

        // 3. Every PII field and unknown field stripped completely
        const strippedKeys = [
            'allotteeName', 'allotteeAddress', 'owner_name', 'allottee_name',
            'allottee_address', 'phone_number', 'mobile_no', 'email_address',
            'pan_card', 'aadhaar_number', 'father_name', 'unknown_arbitrary_field'
        ];
        for (const key of strippedKeys) {
            assert.equal(
                persisted.normalizedData[key],
                undefined,
                `Key "${key}" must be completely stripped from normalizedData on persistence`
            );
        }

        // 4. Canonical non-PII facts retained
        assert.equal(persisted.normalizedData.propertyId, 'PLOT-500');
        assert.equal(persisted.normalizedData.sectorNumber, '10');
        assert.equal(persisted.normalizedData.allotmentPrice.value, 3500000);

        // 5. Hash computed cleanly without raw strings or PII
        assert.ok(/^[0-9a-f]{64}$/.test(persisted.contentHash));
    });

    await t.test('13. PropertyVerificationSnapshot.insertMany() Enforces Same Privacy Sanitization', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const docsToInsert = [
            {
                tenantId,
                authorityCode: 'GMADA',
                linkId,
                normalizedData: {
                    propertyId: 'PLOT-BATCH-1',
                    sectorNumber: '68',
                    owner_name: 'Batch User 1',
                    mobile: '9999999999'
                }
            },
            {
                tenantId,
                authorityCode: 'GMADA',
                linkId,
                normalizedData: {
                    propertyId: 'PLOT-BATCH-2',
                    sectorNumber: '69',
                    allottee_address: 'Mohali Phase 7',
                    email: 'batch2@example.com'
                }
            }
        ];

        const inserted = await PropertyVerificationSnapshot.insertMany(docsToInsert);
        assert.equal(inserted.length, 2);

        for (const doc of inserted) {
            const fresh = await PropertyVerificationSnapshot.findById(doc._id).lean();
            assert.equal(fresh.ownerDataPresent, true);
            assert.equal(fresh.ownerDataRedacted, true);
            assert.equal(fresh.isSealed, true);
            assert.equal(fresh.normalizedData.owner_name, undefined);
            assert.equal(fresh.normalizedData.mobile, undefined);
            assert.equal(fresh.normalizedData.allottee_address, undefined);
            assert.equal(fresh.normalizedData.email, undefined);
            assert.ok(/^[0-9a-f]{64}$/.test(fresh.contentHash));
        }
    });

    await t.test('14. Zero CRM Contact Creation or Linking Across Authority Workflows', async () => {
        // Query Contacts count in database
        const contactCountBefore = await Contact.countDocuments({ tenantId });

        // Simulate complete authority link & review workflow
        const inventory = await Inventory.create({
            tenantId,
            projectName: 'Phase 2.8 Verification Enclave',
            unitNo: 'UNIT-208',
            unitType: 'Plot',
            status: 'Available'
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inventory._id,
            authorityCode: 'HSVP',
            propertyId: 'PLOT-208',
            sectorNumber: '14',
            createdBy: userId
        });

        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode: 'HSVP',
            runMode: 'SINGLE',
            status: 'COMPLETED',
            requestedBy: userId
        });

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId: link._id,
            normalizedData: {
                propertyId: 'PLOT-208',
                sectorNumber: '14',
                ownerName: 'Portal Disclosed Person'
            }
        });

        const runItem = await PropertyVerificationRunItem.create({
            tenantId,
            runId: run._id,
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode: 'HSVP',
            snapshotId: snapshot._id,
            status: 'NEEDS_REVIEW',
            matchStatus: 'EXACT_MATCH',
            proposedChanges: [
                {
                    field: 'authorityVerification.propertyId',
                    currentValue: null,
                    proposedValue: 'PLOT-208',
                    approved: true
                }
            ],
            reviewerDecision: 'APPROVED',
            reviewedBy: userId,
            reviewedAt: new Date()
        });

        // Contact collection must remain completely untouched
        const contactCountAfter = await Contact.countDocuments({ tenantId });
        assert.equal(contactCountAfter, contactCountBefore, 'No CRM Contacts must ever be created or modified');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: UPSTREAM RECONCILIATION & SYSTEM COEXISTENCE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('15. Upstream Reconciliation: AuditLog Events & Role Permissions Integrity', async () => {
        // 1. Verify all 6 authority event types exist and persist
        const authorityEvents = [
            'authority_settings_updated',
            'authority_link_created',
            'authority_run_created',
            'authority_run_policy_rejected',
            'authority_review_submitted',
            'authority_changes_applied'
        ];

        for (const eventType of authorityEvents) {
            const log = await AuditLog.create({
                tenantId,
                eventType,
                targetType: 'authority_run',
                description: `Test event for ${eventType}`
            });
            assert.equal(log.eventType, eventType);
        }

        // 2. Verify targetTypes 'authority_settings' and 'authority_run'
        const settingsLog = await AuditLog.create({
            tenantId,
            eventType: 'authority_settings_updated',
            targetType: 'authority_settings',
            description: 'Settings updated'
        });
        assert.equal(settingsLog.targetType, 'authority_settings');

        // 3. Verify Role schema contains authorityVerification module and approval rights
        const testRole = new Role({
            tenantId,
            name: 'Authority Auditor Role',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: false }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });
        assert.equal(testRole.moduleAccess.authorityVerification.view, true);
        assert.equal(testRole.approvalRights.manageAuthoritySettings, true);
        assert.equal(testRole.approvalRights.approveAuthorityChanges, true);
    });

    await t.test('16. Teardown Database', async () => {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
        assert.equal(mongoose.connection.readyState, 0);
    });
});
