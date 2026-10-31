import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
    CONTRACT_MAPPING_STATUS,
    SOURCE_EVIDENCE_STATUS,
    EVIDENCE_STATUS,
    CANONICAL_FIELDS,
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

import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Contact from '../models/Contact.js';
import { applyApprovedChanges } from '../controllers/authorityVerification.controller.js';

test('--- PHASE 2.7: EVIDENCE STATUS, PRIVACY STORAGE & SNAPSHOT HASH CONTRACT AUDIT ---', async (t) => {

    let mongoServer;
    let tenantId;
    let userId;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: SOURCE EVIDENCE SEMANTICS & STATUS AUDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('1. Status Enums & Provenance Separation', () => {
        // Enums exist and are frozen
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

    await t.test('2. Internal Orchestrator Artifacts Marked NOT_APPLICABLE for Source Evidence', () => {
        // Internal engine fields (authority, policyVersion) must NOT be marked VERIFIED_FROM_OFFICIAL_SPEC
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const map = SOURCE_FIELD_MAPS[auth];
            assert.equal(
                map.authority.sourceEvidenceStatus,
                SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE,
                `${auth}.authority must have sourceEvidenceStatus: NOT_APPLICABLE`
            );
            assert.equal(
                map.policyVersion.sourceEvidenceStatus,
                SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE,
                `${auth}.policyVersion must have sourceEvidenceStatus: NOT_APPLICABLE`
            );
            assert.equal(map.authority.contractMappingStatus, CONTRACT_MAPPING_STATUS.VERIFIED);
            assert.equal(map.policyVersion.contractMappingStatus, CONTRACT_MAPPING_STATUS.VERIFIED);
        }

        // Canonical internal fields in dictionary
        assert.equal(CANONICAL_FIELDS.snapshotContentHash.crm_mapping, 'authorityVerification.snapshotContentHash');
        assert.equal(CANONICAL_FIELDS.rawSnapshotHash.crm_mapping, 'authorityVerification.rawSnapshotHash');
    });

    await t.test('3. Data-Derived Source Fields Strictly UNVERIFIED Without Genuine Samples', () => {
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
                    `${auth}.${field} must be UNVERIFIED until genuine redacted sample or official API spec is provided`
                );
                assert.notEqual(
                    entry.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_SAMPLE,
                    `${auth}.${field} cannot be VERIFIED_FROM_SAMPLE without real sample`
                );
                assert.notEqual(
                    entry.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_OFFICIAL_SPEC,
                    `${auth}.${field} cannot be VERIFIED_FROM_OFFICIAL_SPEC without official standard`
                );
            }
        }
    });

    await t.test('4. NOT_SUPPORTED Must Have Documented Non-Support Evidence', () => {
        // HSVP: No municipal Estate Office tier
        assert.equal(SOURCE_FIELD_MAPS.HSVP.estateOffice.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.HSVP.estateOffice.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);

        // Chandigarh: Union territory divided into Sectors, not Haryana Urban Estates
        assert.equal(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.urbanEstate.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.urbanEstate.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);

        // Chandigarh phaseCode is UNVERIFIED (Industrial Area Phase I & II exist; non-support is NOT established)
        assert.equal(
            SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.phaseCode.sourceEvidenceStatus,
            SOURCE_EVIDENCE_STATUS.UNVERIFIED,
            'CHD phaseCode must be UNVERIFIED, not NOT_SUPPORTED'
        );

        // GMADA: Authority itself under PUDA, not an Estate Office structure
        assert.equal(SOURCE_FIELD_MAPS.GMADA.estateOffice.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.estateOffice.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.urbanEstate.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.urbanEstate.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
    });

    await t.test('5. Proposed Source Labels Distinguished from Verified Source Labels', () => {
        for (const [auth, map] of Object.entries(SOURCE_FIELD_MAPS)) {
            for (const [field, def] of Object.entries(map)) {
                // Every entry explicitly provides proposedSourceLabel and verifiedSourceLabel
                assert.ok('proposedSourceLabel' in def, `${auth}.${field} must have proposedSourceLabel property`);
                assert.ok('verifiedSourceLabel' in def, `${auth}.${field} must have verifiedSourceLabel property`);

                // Since zero live portal response samples are available, verifiedSourceLabel must be null for all data fields
                assert.equal(
                    def.verifiedSourceLabel,
                    null,
                    `${auth}.${field} verifiedSourceLabel must be null (unverified)`
                );

                // Backward-compatible sourceLabel equals proposedSourceLabel
                assert.equal(def.sourceLabel, def.proposedSourceLabel, `${auth}.${field} sourceLabel must match proposedSourceLabel`);
            }
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: PERSONAL INFORMATION PERSISTENCE BOUNDARY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('6. Dictionary & Mapping Dispositions for Owner/Allottee PII', () => {
        // CANONICAL_FIELDS definitions
        const allotteeName = CANONICAL_FIELDS.allotteeName;
        const allotteeAddress = CANONICAL_FIELDS.allotteeAddress;

        assert.equal(allotteeName.storageDestination, 'NOT_STORED');
        assert.equal(allotteeName.privacyReviewDisposition, 'PRIVACY_DEFERRED_NOT_STORED');
        assert.ok(allotteeName.description.includes('NOT auto-linked'));
        assert.ok(allotteeName.description.includes('NOT stored'));

        assert.equal(allotteeAddress.storageDestination, 'NOT_STORED');
        assert.equal(allotteeAddress.privacyReviewDisposition, 'PRIVACY_DEFERRED_NOT_STORED');
        assert.ok(allotteeAddress.description.includes('NOT auto-linked'));
        assert.ok(allotteeAddress.description.includes('NOT stored'));

        // SOURCE_FIELD_MAPS definitions
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const nameDef = SOURCE_FIELD_MAPS[auth].allotteeName;
            const addrDef = SOURCE_FIELD_MAPS[auth].allotteeAddress;

            assert.equal(nameDef.contractMappingStatus, CONTRACT_MAPPING_STATUS.DEFERRED);
            assert.equal(nameDef.privacyDisposition, 'PRIVACY_DEFERRED_NOT_STORED');
            assert.equal(nameDef.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.UNVERIFIED);

            assert.equal(addrDef.contractMappingStatus, CONTRACT_MAPPING_STATUS.DEFERRED);
            assert.equal(addrDef.privacyDisposition, 'PRIVACY_DEFERRED_NOT_STORED');
            assert.equal(addrDef.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.UNVERIFIED);
        }
    });

    await t.test('7. RunItem BLOCKED_UPDATE_FIELDS Strictly Prohibits PII', () => {
        const forbiddenPii = [
            'ownerName', 'allotteeName', 'allotteeAddress',
            'ownerPhone', 'ownerEmail', 'allotteePhone', 'allotteeEmail',
            'phone', 'email', 'owners',
            'authorityVerification.ownerName',
            'authorityVerification.allotteeName',
            'authorityVerification.allotteeAddress'
        ];

        for (const field of forbiddenPii) {
            assert.ok(BLOCKED_UPDATE_FIELDS.has(field), `BLOCKED_UPDATE_FIELDS must contain ${field}`);
            assert.ok(!ALLOWED_UPDATE_FIELDS.has(field), `ALLOWED_UPDATE_FIELDS must NOT contain ${field}`);
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: RECURSIVE SNAPSHOT CONTENT-HASH CONTRACT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('8. Cryptographic Content-Hash Properties & Canonical Alias', () => {
        assert.equal(typeof computeSnapshotContentHash, 'function');
        assert.equal(typeof computeNormalizedContentHash, 'function');
        assert.equal(computeNormalizedContentHash, computeSnapshotContentHash);

        // Returns null for invalid / non-object inputs
        assert.equal(computeSnapshotContentHash(null), null);
        assert.equal(computeSnapshotContentHash(undefined), null);
        assert.equal(computeSnapshotContentHash(123), null);
        assert.equal(computeSnapshotContentHash('string'), null);

        // Output format: 64-char lowercase hexadecimal SHA-256 string
        const hash = computeSnapshotContentHash({ propertyId: 'P-101', sectorNumber: '15' });
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 64);
        assert.ok(/^[0-9a-f]{64}$/.test(hash));
    });

    await t.test('9. Table-Driven Unit Test: Every Permitted Field Participates in Hash', () => {
        // Baseline empty canonical facts
        const baseHash = computeSnapshotContentHash({ propertyId: 'P-BASE' });

        // Iterate over all permitted hash fields and verify that adding each field alters the hash
        for (const field of PERMITTED_HASH_FIELDS) {
            let sampleVal;
            if (field.includes('Date')) {
                sampleVal = new Date('2026-10-27T00:00:00.000Z');
            } else if (field.includes('Approved') || field.includes('Certificate')) {
                sampleVal = true;
            } else if (field.includes('Price') || field.includes('Dues') || field.includes('Paid')) {
                sampleVal = { value: 100000, currency: 'INR', raw: '1 Lakh' };
            } else if (field === 'propertyAreaValue') {
                sampleVal = 500;
            } else {
                sampleVal = 'TEST_VAL_' + field;
            }

            const input = { propertyId: 'P-BASE', [field]: sampleVal };
            const fieldHash = computeSnapshotContentHash(input);

            assert.notEqual(
                fieldHash,
                baseHash,
                `Permitted field ${field} must alter the content hash`
            );
        }
    });

    await t.test('10. Key-Order Invariance at All Nesting Levels', () => {
        // Top-level key order invariance
        const objA = {
            propertyId: 'PLOT-77',
            sectorNumber: '22',
            authorityStatus: 'Allotted',
            buildingPlanApproved: true
        };
        const objB = {
            buildingPlanApproved: true,
            authorityStatus: 'Allotted',
            sectorNumber: '22',
            propertyId: 'PLOT-77'
        };
        assert.equal(computeSnapshotContentHash(objA), computeSnapshotContentHash(objB));

        // Nested key order invariance inside financial objects
        const nestedA = {
            propertyId: 'PLOT-77',
            allotmentPrice: { value: 750000, currency: 'INR', raw: '7.5 Lakhs' }
        };
        const nestedB = {
            propertyId: 'PLOT-77',
            allotmentPrice: { raw: '7.5 Lakhs', currency: 'INR', value: 750000 }
        };
        assert.equal(computeSnapshotContentHash(nestedA), computeSnapshotContentHash(nestedB));
    });

    await t.test('11. Recursive Field Allowlisting — Smuggled Nested Keys Strictly Stripped', () => {
        // Smuggled keys inside allotmentPrice
        const cleanNested = {
            propertyId: 'PLOT-99',
            allotmentPrice: { value: 500000, currency: 'INR', raw: '5 Lakhs' }
        };
        const smuggledNested = {
            propertyId: 'PLOT-99',
            allotmentPrice: {
                value: 500000,
                currency: 'INR',
                raw: '5 Lakhs',
                smuggledSecret: 'ATTACK_PAYLOAD',
                ownerName: 'Secret Bob',
                token: 'malicious_bearer_token'
            }
        };

        const cleanHash = computeSnapshotContentHash(cleanNested);
        const smuggledHash = computeSnapshotContentHash(smuggledNested);

        // The hash MUST be identical because smuggled nested keys are stripped by recursive allowlist
        assert.equal(
            smuggledHash,
            cleanHash,
            'Smuggled nested keys inside allotmentPrice must be stripped and not alter hash'
        );
    });

    await t.test('12. Stable Date Serialization & Sentinel Invariance', () => {
        // Date instance vs equivalent ISO string
        const dateObjInput = {
            propertyId: 'PLOT-12',
            allotmentDate: new Date('2026-05-15T00:00:00.000Z')
        };
        const dateStrInput = {
            propertyId: 'PLOT-12',
            allotmentDate: '2026-05-15T00:00:00.000Z'
        };
        assert.equal(computeSnapshotContentHash(dateObjInput), computeSnapshotContentHash(dateStrInput));

        // Typed sentinel representation
        const sentinelInputA = {
            propertyId: 'PLOT-12',
            litigationStatus: SENTINEL.FALSE
        };
        const sentinelInputB = {
            propertyId: 'PLOT-12',
            litigationStatus: { _sentinel: 'FALSE' }
        };
        assert.equal(computeSnapshotContentHash(sentinelInputA), computeSnapshotContentHash(sentinelInputB));
    });

    await t.test('13. Strict Exclusion of Transient Metadata, IDs & Transport Tokens', () => {
        const base = { propertyId: 'P-TEST', sectorNumber: '10' };
        const contaminated = {
            ...base,
            _id: new mongoose.Types.ObjectId().toString(),
            id: 'doc-123',
            tenantId: new mongoose.Types.ObjectId().toString(),
            linkId: new mongoose.Types.ObjectId().toString(),
            runId: new mongoose.Types.ObjectId().toString(),
            runItemId: new mongoose.Types.ObjectId().toString(),
            snapshotId: new mongoose.Types.ObjectId().toString(),
            observedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            verifiedAt: new Date(),
            verifiedBy: 'user-456',
            cookies: 'session=abc; path=/',
            session: { sid: 'xyz' },
            sessionId: 'sess-888',
            csrfToken: 'csrf-999',
            token: 'bearer-token',
            headers: { Authorization: 'Bearer xxx' },
            rawHtml: '<html>secret</html>',
            password: 'supersecretpassword'
        };

        assert.equal(
            computeSnapshotContentHash(contaminated),
            computeSnapshotContentHash(base),
            'All transient metadata, database IDs, and credentials must be strictly excluded from hash'
        );
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: DATABASE INTEGRATION & NEGATIVE PERSISTENCE TESTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('14. Database Setup for Integration Tests', async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
        tenantId = new mongoose.Types.ObjectId();
        userId = new mongoose.Types.ObjectId();
    });

    await t.test('15. Negative Test: Snapshot .save() Strips PII Prior to Database Persistence', async () => {
        const rawWithPii = {
            propertyId: 'PLOT-SEC-1',
            sectorNumber: '14',
            ownerName: 'Secret Citizen Name',
            allotteeName: 'Confidential Allottee',
            allotteeAddress: 'House 123, Sector 14, Gurugram',
            ownerPhone: '9876543210',
            ownerEmail: 'citizen@example.com',
            aadhaar: '1234-5678-9012'
        };

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            linkId: new mongoose.Types.ObjectId(),
            runItemId: new mongoose.Types.ObjectId(),
            authorityCode: 'HSVP',
            observedAt: new Date(),
            normalizedData: rawWithPii
        });

        // Verify document persisted in database
        const saved = await PropertyVerificationSnapshot.findById(snapshot._id);
        assert.ok(saved);

        // Personal data must be stripped: ownerName is null, other PII fields deleted
        assert.equal(saved.normalizedData.ownerName, null, 'ownerName must be null in persistent snapshot');
        assert.equal(saved.normalizedData.allotteeName, undefined, 'allotteeName must not exist in persistent snapshot');
        assert.equal(saved.normalizedData.allotteeAddress, undefined, 'allotteeAddress must not exist in persistent snapshot');
        assert.equal(saved.normalizedData.ownerPhone, undefined, 'ownerPhone must not exist in persistent snapshot');
        assert.equal(saved.normalizedData.ownerEmail, undefined, 'ownerEmail must not exist in persistent snapshot');
        assert.equal(saved.normalizedData.aadhaar, undefined, 'aadhaar must not exist in persistent snapshot');

        // Privacy flags recorded accurately
        assert.equal(saved.ownerDataPresent, true, 'ownerDataPresent must be true when PII was submitted');
        assert.equal(saved.ownerDataRedacted, true, 'ownerDataRedacted must be true');

        // Content hash computed deterministically
        assert.ok(saved.contentHash);
        assert.equal(saved.contentHash.length, 64);
        assert.equal(saved.snapshotContentHash, saved.contentHash, 'virtual snapshotContentHash must match contentHash');

        // snapshotId virtual is distinct from contentHash
        assert.equal(saved.snapshotId.toString(), saved._id.toString());
        assert.notEqual(saved.snapshotId.toString(), saved.contentHash);
    });

    await t.test('16. Negative Test: Snapshot .insertMany() Strips PII on Batch Insert', async () => {
        const batchDocs = [
            {
                tenantId,
                linkId: new mongoose.Types.ObjectId(),
                runItemId: new mongoose.Types.ObjectId(),
                authorityCode: 'GMADA',
                observedAt: new Date(),
                normalizedData: {
                    propertyId: 'PLOT-BATCH-1',
                    sectorNumber: '66',
                    ownerName: 'Confidential Person A',
                    allotteeAddress: 'SAS Nagar'
                }
            },
            {
                tenantId,
                linkId: new mongoose.Types.ObjectId(),
                runItemId: new mongoose.Types.ObjectId(),
                authorityCode: 'GMADA',
                observedAt: new Date(),
                normalizedData: {
                    propertyId: 'PLOT-BATCH-2',
                    sectorNumber: '67',
                    ownerName: 'Confidential Person B',
                    ownerPhone: '9998887776'
                }
            }
        ];

        const inserted = await PropertyVerificationSnapshot.insertMany(batchDocs);
        assert.equal(inserted.length, 2);

        for (const doc of inserted) {
            const fresh = await PropertyVerificationSnapshot.findById(doc._id);
            assert.equal(fresh.normalizedData.ownerName, null);
            assert.equal(fresh.normalizedData.allotteeAddress, undefined);
            assert.equal(fresh.normalizedData.ownerPhone, undefined);
            assert.equal(fresh.ownerDataPresent, true);
            assert.equal(fresh.ownerDataRedacted, true);
            assert.ok(fresh.contentHash);
        }
    });

    await t.test('17. Negative Test: Inventory Schema Rejects PII via strict: throw', async () => {
        const inv = await Inventory.create({
            projectName: 'Strict Privacy Test',
            unitNo: 'U-PRIV-1',
            unitNumber: 'U-PRIV-1',
            tenantId,
            authorityVerification: {
                propertyId: 'P-SAFE-1'
            }
        });

        // Attempting to set ownerName inside authorityVerification subdocument MUST throw StrictModeError
        await assert.rejects(
            async () => {
                await Inventory.findOneAndUpdate(
                    { _id: inv._id, tenantId },
                    { $set: { 'authorityVerification.ownerName': 'Illicit Owner Name' } },
                    { new: true, runValidators: true }
                );
            },
            (err) => {
                assert.ok(err.name === 'StrictModeError' || err.message.includes('strict mode is set to throw'));
                return true;
            }
        );

        // Attempting to set allotteeAddress inside authorityVerification MUST throw StrictModeError
        await assert.rejects(
            async () => {
                await Inventory.findOneAndUpdate(
                    { _id: inv._id, tenantId },
                    { $set: { 'authorityVerification.allotteeAddress': 'Illicit Address' } },
                    { new: true, runValidators: true }
                );
            },
            (err) => {
                assert.ok(err.name === 'StrictModeError' || err.message.includes('strict mode is set to throw'));
                return true;
            }
        );
    });

    await t.test('18. Negative Test: Controller applyApprovedChanges Rejects Proposed PII Fields with 422', async () => {
        const inventory = await Inventory.create({
            projectName: 'Phase 2.7 Application Test',
            unitNo: 'U-900',
            unitNumber: 'U-900',
            tenantId,
            status: 'Available'
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inventory._id,
            authorityCode: 'HSVP',
            propertyId: 'P-900',
            sectorNumber: '21',
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
            linkId: link._id,
            runItemId: new mongoose.Types.ObjectId(),
            authorityCode: 'HSVP',
            observedAt: new Date(),
            normalizedData: {
                propertyId: 'P-900',
                sectorNumber: '21',
                ownerName: 'Secret Citizen' // will be stripped on save
            }
        });

        // RunItem with proposed changes attempting to apply ownerName and allotteeAddress
        const item = await PropertyVerificationRunItem.create({
            tenantId,
            runId: run._id,
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode: 'HSVP',
            status: 'SUCCEEDED',
            reviewerDecision: 'APPROVED',
            snapshotId: snapshot._id,
            proposedChanges: [
                {
                    field: 'authorityVerification.ownerName',
                    currentValue: null,
                    proposedValue: 'Secret Citizen',
                    approved: true
                },
                {
                    field: 'authorityVerification.allotteeAddress',
                    currentValue: null,
                    proposedValue: 'Sector 21, Gurugram',
                    approved: true
                }
            ]
        });

        const req = {
            tenantId,
            params: { itemId: item._id.toString() },
            user: { _id: userId, tenantId }
        };

        let responseStatus = 200;
        let responseJson = null;
        const res = {
            status: (code) => {
                responseStatus = code;
                return res;
            },
            json: (data) => {
                responseJson = data;
                return res;
            }
        };

        await applyApprovedChanges(req, res);

        // Application MUST be rejected because no eligible approved fields were allowed
        assert.equal(responseStatus, 422);
        assert.equal(responseJson.success, false);
        assert.ok(
            responseJson.message.includes('Validation failed') ||
            responseJson.message.includes('No approved fields eligible for application')
        );

        // Verify Inventory was NOT mutated
        const unmodifiedInv = await Inventory.findById(inventory._id);
        assert.equal(unmodifiedInv.authorityVerification, undefined);
    });

    await t.test('19. Legitimate Apply Sets Both snapshotContentHash and rawSnapshotHash on Inventory', async () => {
        const inventory = await Inventory.create({
            projectName: 'Phase 2.7 Dual Hash Test',
            unitNo: 'U-HASH-1',
            unitNumber: 'U-HASH-1',
            tenantId,
            status: 'Available' // Must NOT change
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inventory._id,
            authorityCode: 'CHD',
            propertyId: 'PLOT-CHD-1',
            sectorNumber: '34',
            createdBy: userId
        });

        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode: 'CHD',
            runMode: 'SINGLE',
            status: 'COMPLETED',
            requestedBy: userId
        });

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            linkId: link._id,
            runItemId: new mongoose.Types.ObjectId(),
            authorityCode: 'CHD',
            observedAt: new Date(),
            normalizedData: {
                propertyId: 'PLOT-CHD-1',
                sectorNumber: '34'
            }
        });

        const item = await PropertyVerificationRunItem.create({
            tenantId,
            runId: run._id,
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode: 'CHD',
            status: 'SUCCEEDED',
            reviewerDecision: 'APPROVED',
            snapshotId: snapshot._id,
            proposedChanges: [
                {
                    field: 'authorityVerification.propertyId',
                    currentValue: null,
                    proposedValue: 'PLOT-CHD-1',
                    approved: true
                },
                {
                    field: 'authorityVerification.sectorNumber',
                    currentValue: null,
                    proposedValue: '34',
                    approved: true
                }
            ]
        });

        const req = {
            tenantId,
            params: { itemId: item._id.toString() },
            user: { _id: userId, tenantId }
        };

        let responseStatus = 200;
        let responseJson = null;
        const res = {
            status: (code) => {
                responseStatus = code;
                return res;
            },
            json: (data) => {
                responseJson = data;
                return res;
            }
        };

        await applyApprovedChanges(req, res);

        assert.equal(responseStatus, 200);
        assert.equal(responseJson.success, true);

        const updatedInv = await Inventory.findById(inventory._id);
        assert.ok(updatedInv.authorityVerification);
        assert.equal(updatedInv.authorityVerification.propertyId, 'PLOT-CHD-1');
        assert.equal(updatedInv.authorityVerification.sectorNumber, '34');

        // Both snapshotContentHash and rawSnapshotHash are populated identically
        assert.equal(updatedInv.authorityVerification.snapshotContentHash, snapshot.contentHash);
        assert.equal(updatedInv.authorityVerification.rawSnapshotHash, snapshot.contentHash);
        assert.equal(
            updatedInv.authorityVerification.snapshotContentHash,
            updatedInv.authorityVerification.rawSnapshotHash
        );

        // VerificationSnapshotId is ObjectId, distinct from contentHash string
        assert.equal(
            updatedInv.authorityVerification.verificationSnapshotId.toString(),
            snapshot._id.toString()
        );
        assert.notEqual(
            updatedInv.authorityVerification.verificationSnapshotId.toString(),
            updatedInv.authorityVerification.snapshotContentHash
        );

        // Inventory.status is untouched
        assert.equal(updatedInv.status.toString(), inventory.status.toString());
    });

    await t.test('20. Zero Contact Documents Created or Linked', async () => {
        const contactCount = await Contact.countDocuments({ tenantId });
        assert.equal(contactCount, 0, 'Zero contacts must exist in tenant context');
    });

    await t.test('21. Teardown Database', async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });
});
