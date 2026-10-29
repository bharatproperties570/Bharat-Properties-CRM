import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
    CONTRACT_MAPPING_STATUS,
    SOURCE_EVIDENCE_STATUS,
    EVIDENCE_STATUS,
    CANONICAL_FIELDS,
    SOURCE_FIELD_MAPS
} from '../services/authority/authorityFieldDictionary.js';

import {
    computeSnapshotContentHash,
    PERMITTED_HASH_FIELDS,
    EXCLUDED_HASH_FIELDS
} from '../services/authority/authorityNormalizer.js';

import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import { applyApprovedChanges } from '../controllers/authorityVerification.controller.js';

test('--- PHASE 2.6: EVIDENCE STATUS & SNAPSHOT HASH CONTRACT TEST SUITE ---', async (t) => {

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. Separate schema-contract verification from source evidence
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('1. Status Enums Definition & Separation', () => {
        // CONTRACT_MAPPING_STATUS enum verification
        assert.ok(CONTRACT_MAPPING_STATUS, 'CONTRACT_MAPPING_STATUS must exist');
        assert.equal(CONTRACT_MAPPING_STATUS.VERIFIED, 'VERIFIED');
        assert.equal(CONTRACT_MAPPING_STATUS.PROVISIONAL, 'PROVISIONAL');
        assert.equal(CONTRACT_MAPPING_STATUS.DEFERRED, 'DEFERRED');
        assert.equal(CONTRACT_MAPPING_STATUS.NOT_APPLICABLE, 'NOT_APPLICABLE');

        // SOURCE_EVIDENCE_STATUS enum verification
        assert.ok(SOURCE_EVIDENCE_STATUS, 'SOURCE_EVIDENCE_STATUS must exist');
        assert.equal(SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_SAMPLE, 'VERIFIED_FROM_SAMPLE');
        assert.equal(SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_OFFICIAL_SPEC, 'VERIFIED_FROM_OFFICIAL_SPEC');
        assert.equal(SOURCE_EVIDENCE_STATUS.UNVERIFIED, 'UNVERIFIED');
        assert.equal(SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, 'NOT_SUPPORTED');

        // Backward-compatible alias
        assert.equal(EVIDENCE_STATUS, SOURCE_EVIDENCE_STATUS);
    });

    await t.test('2. Source Field Maps — Both Statuses Explicitly Populated', () => {
        const validContract = Object.values(CONTRACT_MAPPING_STATUS);
        const validEvidence = Object.values(SOURCE_EVIDENCE_STATUS);

        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const map = SOURCE_FIELD_MAPS[auth];
            assert.ok(map, `${auth} map missing`);

            for (const [field, m] of Object.entries(map)) {
                assert.ok(validContract.includes(m.contractMappingStatus),
                    `${auth}.${field} must have valid contractMappingStatus, got: ${m.contractMappingStatus}`);
                assert.ok(validEvidence.includes(m.sourceEvidenceStatus),
                    `${auth}.${field} must have valid sourceEvidenceStatus, got: ${m.sourceEvidenceStatus}`);
                // Backward-compatibility field
                assert.equal(m.evidence, m.sourceEvidenceStatus,
                    `${auth}.${field} legacy evidence must match sourceEvidenceStatus`);
            }
        }
    });

    await t.test('3. CRITICAL EVIDENCE GATE: Zero Data-Derived Mappings Marked Verified', () => {
        // Data-derived fields from source portals (must NOT be claimed verified without real response samples)
        const dataDerivedFields = [
            'propertyId', 'fileNumber', 'formNumber', 'schemeName', 'sectorNumber',
            'phaseCode', 'blockCode', 'propertyCategory', 'propertyType', 'area',
            'allotmentMode', 'authorityStatus', 'possessionStatus', 'allotteeName',
            'allotteeAddress', 'allotmentPrice', 'currentDues', 'totalPaid',
            'allotmentDate', 'possessionDate', 'lastTransferDate', 'litigationStatus',
            'mortgageStatus', 'buildingPlanApproved', 'occupancyCertificate'
        ];

        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const map = SOURCE_FIELD_MAPS[auth];
            for (const field of dataDerivedFields) {
                const mapping = map[field];
                if (!mapping) continue;

                // If the field is not supported (e.g. urbanEstate in CHD), it's NOT_SUPPORTED
                if (mapping.sourceEvidenceStatus === SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED) {
                    assert.equal(mapping.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
                    continue;
                }

                // Any supported or expected data-derived portal field MUST remain strictly UNVERIFIED
                assert.equal(
                    mapping.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.UNVERIFIED,
                    `CRITICAL: ${auth}.${field} must be UNVERIFIED because no real redacted portal sample is available`
                );
                assert.notEqual(
                    mapping.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_SAMPLE,
                    `FORBIDDEN: ${auth}.${field} cannot be marked VERIFIED_FROM_SAMPLE without genuine response evidence`
                );
            }
        }
    });

    await t.test('4. Application Constants & Unsupported Field Classifications', () => {
        // Application constants injected by client/engine are internal metadata: NOT_APPLICABLE
        assert.equal(SOURCE_FIELD_MAPS.HSVP.authority.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE);
        assert.equal(SOURCE_FIELD_MAPS.HSVP.policyVersion.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE);

        // HSVP does not use estate office
        assert.equal(SOURCE_FIELD_MAPS.HSVP.estateOffice.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.HSVP.estateOffice.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);

        // Chandigarh does not use urban estates (sectors instead)
        assert.equal(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.urbanEstate.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.urbanEstate.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
        // Phase 2.7: Chandigarh phaseCode is UNVERIFIED (e.g. Industrial Area Phase I/II exist)
        assert.equal(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD.phaseCode.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.UNVERIFIED);

        // GMADA does not use urban estates or estate offices
        assert.equal(SOURCE_FIELD_MAPS.GMADA.urbanEstate.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.urbanEstate.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.estateOffice.sourceEvidenceStatus, SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED);
        assert.equal(SOURCE_FIELD_MAPS.GMADA.estateOffice.contractMappingStatus, CONTRACT_MAPPING_STATUS.NOT_APPLICABLE);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. Deterministic Cryptographic Snapshot Content Hashing
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    await t.test('5. Deterministic Hash Function Properties', () => {
        assert.equal(typeof computeSnapshotContentHash, 'function');

        // Returns null for invalid/empty inputs
        assert.equal(computeSnapshotContentHash(null), null);
        assert.equal(computeSnapshotContentHash(undefined), null);
        assert.equal(computeSnapshotContentHash('not an object'), null);

        // Returns valid 64-char lowercase hexadecimal hash
        const sample = { propertyId: '123', sectorNumber: '14' };
        const hash = computeSnapshotContentHash(sample);
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 64);
        assert.match(hash, /^[0-9a-f]{64}$/);
    });

    await t.test('6. Deterministic Hashing — Key Ordering Invariance', () => {
        const objA = {
            propertyId: 'PL-9981',
            sectorNumber: '21',
            schemeName: 'Urban Estate Phase-1',
            allotmentDate: new Date('2022-04-15T00:00:00.000Z'),
            propertyType: 'Plot'
        };

        const objB = {
            propertyType: 'Plot',
            schemeName: 'Urban Estate Phase-1',
            sectorNumber: '21',
            allotmentDate: '2022-04-15T00:00:00.000Z',
            propertyId: 'PL-9981'
        };

        const hashA = computeSnapshotContentHash(objA);
        const hashB = computeSnapshotContentHash(objB);
        assert.equal(hashA, hashB, 'Identical content with different key order must yield identical hash');
    });

    await t.test('7. Deterministic Hashing — Strict Exclusion of PII (Personal Data)', () => {
        const base = {
            propertyId: 'PLOT-45',
            sectorNumber: '14',
            authorityStatus: 'Allotted'
        };

        const withPII = {
            ...base,
            ownerName: 'Secret Citizen Name',
            allotteeName: 'Confidential Allottee',
            allotteeAddress: 'House 123, Sector 14, Gurugram'
        };

        const hashBase = computeSnapshotContentHash(base);
        const hashWithPII = computeSnapshotContentHash(withPII);
        assert.equal(hashBase, hashWithPII, 'Personal data fields must be strictly excluded from content hash');
    });

    await t.test('8. Deterministic Hashing — Strict Exclusion of Cookies, CSRF, Tokens & Headers', () => {
        const base = {
            propertyId: 'PLOT-45',
            sectorNumber: '14',
            possessionStatus: 'Offered'
        };

        const withSecrets = {
            ...base,
            cookies: 'connect.sid=s%3Axyz; auth_token=jwt123',
            csrfToken: 'csrf-secret-999',
            session: { id: 'sess_123' },
            headers: { Authorization: 'Bearer supersecret' },
            rawHtml: '<html><body>Secret page</body></html>',
            password: 'mypassword',
            credentials: { key: '123' }
        };

        const hashBase = computeSnapshotContentHash(base);
        const hashWithSecrets = computeSnapshotContentHash(withSecrets);
        assert.equal(hashBase, hashWithSecrets, 'Cookies, CSRF, credentials and raw HTML must never pollute content hash');
    });

    await t.test('9. Deterministic Hashing — Modified Content Produces Different Hash', () => {
        const base = {
            propertyId: 'PLOT-100',
            sectorNumber: '14',
            propertyAreaValue: 250,
            propertyAreaUnit: 'SQ_YARD'
        };

        const modifiedPlot = { ...base, propertyId: 'PLOT-101' };
        const modifiedSector = { ...base, sectorNumber: '15' };
        const modifiedArea = { ...base, propertyAreaValue: 300 };

        const hBase = computeSnapshotContentHash(base);
        const hPlot = computeSnapshotContentHash(modifiedPlot);
        const hSector = computeSnapshotContentHash(modifiedSector);
        const hArea = computeSnapshotContentHash(modifiedArea);

        assert.notEqual(hBase, hPlot, 'Different propertyId must change hash');
        assert.notEqual(hBase, hSector, 'Different sectorNumber must change hash');
        assert.notEqual(hBase, hArea, 'Different propertyAreaValue must change hash');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. Database Model & Subdocument Integration
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let mongoServer;
    let tenantId;
    let linkId;

    await t.test('10. Database Setup for Integration Tests', async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        tenantId = new mongoose.Types.ObjectId();
        linkId = new mongoose.Types.ObjectId();
    });

    await t.test('11. PropertyVerificationSnapshot — ContentHash Persistence & snapshotId Separation', async () => {
        const normalizedData = {
            propertyId: 'PLOT-999',
            sectorNumber: '10',
            schemeName: 'Urban Estate',
            allotmentPrice: { value: 2500000, currency: 'INR' },
            ownerName: 'Redacted Allottee' // Should be excluded from hash
        };

        const expectedHash = computeSnapshotContentHash(normalizedData);

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId,
            normalizedData
        });

        // 1. Database ObjectId vs Cryptographic Hash separation
        assert.ok(snapshot._id instanceof mongoose.Types.ObjectId, '_id must be an ObjectId');
        assert.equal(snapshot.snapshotId.toString(), snapshot._id.toString(), 'snapshotId virtual must return _id');
        assert.notEqual(snapshot.snapshotId.toString(), snapshot.contentHash, 'snapshotId must not be equal to contentHash');

        // 2. Automatically computed contentHash matches deterministic function
        assert.equal(snapshot.contentHash, expectedHash);
        assert.equal(snapshot.contentHash.length, 64);

        // 3. Immutability check: snapshot is sealed
        assert.equal(snapshot.isSealed, true);
        await assert.rejects(
            async () => {
                snapshot.contentHash = 'modified_hash';
                await snapshot.save();
            },
            /cannot update after creation/
        );
    });

    await t.test('12. Inventory SubSchema — rawSnapshotHash Field & Strict Throw Enforcement', async () => {
        // Create Inventory record with valid authorityVerification subdocument
        const inv = await Inventory.create({
            projectName: 'Phase 2.6 Green Acres',
            unitNo: 'PLOT-55',
            unitNumber: 'PLOT-55',
            tenantId,
            authorityVerification: {
                propertyId: 'PLOT-55',
                sectorNumber: '12',
                rawSnapshotHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
            }
        });

        assert.equal(inv.authorityVerification.propertyId, 'PLOT-55');
        assert.equal(inv.authorityVerification.rawSnapshotHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

        // Strict throw check: Unknown field inside authorityVerification must throw StrictModeError
        await assert.rejects(
            async () => {
                await Inventory.findOneAndUpdate(
                    { _id: inv._id, tenantId },
                    { $set: { 'authorityVerification.unknownNestedKey': 'attack_val' } },
                    { new: true }
                );
            },
            (err) => {
                assert.ok(err.name === 'StrictModeError' || err.message.includes('strict mode is set to throw'));
                return true;
            }
        );
    });

    await t.test('13. Controller applyApprovedChanges — Populates verificationSnapshotId AND rawSnapshotHash', async () => {
        const inventory = await Inventory.create({
            projectName: 'Phase 2.6 Test Estate',
            unitNo: 'U-700',
            unitNumber: 'U-700',
            tenantId,
            status: 'Available' // Must NOT change
        });

        const link = await PropertyAuthorityLink.create({
            tenantId,
            inventoryId: inventory._id,
            authorityCode: 'HSVP',
            propertyId: 'P-700',
            status: 'LINKED',
            createdBy: new mongoose.Types.ObjectId()
        });

        const normalizedData = {
            propertyId: 'P-700',
            sectorNumber: '18',
            schemeName: 'Estate 18'
        };

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId: link._id,
            normalizedData
        });

        const run = await PropertyVerificationRun.create({
            tenantId,
            authorityCode: 'HSVP',
            status: 'COMPLETED',
            runMode: 'SINGLE',
            totalProperties: 1,
            requestedBy: new mongoose.Types.ObjectId()
        });

        const item = await PropertyVerificationRunItem.create({
            tenantId,
            runId: run._id,
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode: 'HSVP',
            status: 'SUCCEEDED',
            matchStatus: 'EXACT_MATCH',
            snapshotId: snapshot._id,
            reviewerDecision: 'APPROVED',
            proposedChanges: [
                {
                    field: 'authorityVerification.propertyId',
                    currentValue: null,
                    proposedValue: 'P-700',
                    approved: true
                },
                {
                    field: 'authorityVerification.sectorNumber',
                    currentValue: null,
                    proposedValue: '18',
                    approved: true
                }
            ]
        });

        // Mock req/res for applyApprovedChanges
        const req = {
            tenantId,
            params: { itemId: item._id.toString() },
            user: { _id: new mongoose.Types.ObjectId(), tenantId }
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

        // Verify Inventory subdocument
        const updatedInv = await Inventory.findById(inventory._id);
        assert.ok(updatedInv.authorityVerification);
        assert.equal(updatedInv.authorityVerification.propertyId, 'P-700');
        assert.equal(updatedInv.authorityVerification.sectorNumber, '18');

        // Check separation: verificationSnapshotId is ObjectId, rawSnapshotHash is SHA-256 string
        assert.equal(updatedInv.authorityVerification.verificationSnapshotId.toString(), snapshot._id.toString());
        assert.equal(updatedInv.authorityVerification.rawSnapshotHash, snapshot.contentHash);
        assert.equal(typeof updatedInv.authorityVerification.rawSnapshotHash, 'string');
        assert.equal(updatedInv.authorityVerification.rawSnapshotHash.length, 64);

        // Inventory status must NOT be modified
        assert.equal(updatedInv.status.toString(), inventory.status.toString());
    });

    await t.test('14. Teardown Database', async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });
});
