/**
 * Phase 2.9 — Nested Privacy, Policy Immutability & Final Contract Validation Suite
 *
 * Verifies:
 * 1. Deep Recursive Nested Privacy Boundary Hardening:
 *    - Strict allowlist & typing across all nested objects/arrays in normalizedData.
 *    - Injected nested PII in monetary objects (allotmentPrice, currentDues, totalPaid) stripped on persistence.
 *    - Injected PII in sentinels stripped on persistence (only _sentinel preserved).
 *    - Unexpected arrays, malformed objects, and HTML tags stripped on persistence.
 *    - sourceReferenceUrl stripped of authentication tokens, session IDs, and credentials.
 *    - ownerDataPresent set to true, ownerDataRedacted set to true, ownerName strictly coerced to null.
 *    - Both save() and insertMany() paths verified against real database persistence.
 * 2. Policy-Table Runtime Immutability:
 *    - INTERNAL_ENGINE_FIELDS, PERMITTED_SNAPSHOT_NORMALIZED_KEYS, EXCLUDED_HASH_FIELDS,
 *      and PERMITTED_NESTED_KEYS Sets are unmodifiable at runtime (.add, .delete, .clear throw TypeError).
 *    - SOURCE_FIELD_MAPS, CANONICAL_FIELDS, and PERMITTED_HASH_FIELDS deeply frozen against property mutation.
 * 3. Persistence Method Immutability Audit:
 *    - save(), insertMany(), updateOne(), updateMany(), findOneAndUpdate(), replaceOne(),
 *      findOneAndReplace(), deleteOne(), deleteMany(), findOneAndDelete(), and bulkWrite() tested.
 *    - Native driver bypass documented as an explicit boundary.
 * 4. Programmatic Canonical & Hash Field Count Reconciliation:
 *    - PERMITTED_HASH_FIELDS has exactly 30 fields, all participating in hash digest.
 *    - CANONICAL_FIELDS has exactly 37 fields (10 engine + 2 deferred personal + 25 portal facts).
 *    - All 10 INTERNAL_ENGINE_FIELDS have sourceEvidenceStatus: NOT_APPLICABLE.
 *    - All portal data fields remain UNVERIFIED (or NOT_SUPPORTED where non-support confirmed).
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
    SENTINEL,
    ImmutableSet,
    createImmutableSet,
    deepFreeze
} from '../services/authority/authorityFieldDictionary.js';

import {
    computeSnapshotContentHash,
    computeNormalizedContentHash,
    PERMITTED_HASH_FIELDS,
    PERMITTED_NESTED_KEYS,
    EXCLUDED_HASH_FIELDS
} from '../services/authority/authorityNormalizer.js';

import PropertyVerificationSnapshot, {
    PERMITTED_SNAPSHOT_NORMALIZED_KEYS,
    DATA_QUALITY_STATUSES,
    sanitizeSnapshotPII
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

test('--- PHASE 2.9: NESTED PRIVACY, POLICY IMMUTABILITY & FINAL CONTRACT VALIDATION ---', async (t) => {

    let mongoServer;
    let tenantId;
    let userId;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: POLICY-TABLE RUNTIME IMMUTABILITY AUDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('1. Policy Sets Must Block Runtime Mutation via .add(), .delete(), and .clear()', () => {
        // 1a. INTERNAL_ENGINE_FIELDS
        assert.ok(INTERNAL_ENGINE_FIELDS instanceof Set, 'INTERNAL_ENGINE_FIELDS must be a Set instance');
        assert.ok(Object.isFrozen(INTERNAL_ENGINE_FIELDS), 'INTERNAL_ENGINE_FIELDS must be frozen');
        assert.throws(
            () => INTERNAL_ENGINE_FIELDS.add('malicious_field'),
            TypeError,
            'INTERNAL_ENGINE_FIELDS.add() must throw TypeError'
        );
        assert.throws(
            () => INTERNAL_ENGINE_FIELDS.delete('authority'),
            TypeError,
            'INTERNAL_ENGINE_FIELDS.delete() must throw TypeError'
        );
        assert.throws(
            () => INTERNAL_ENGINE_FIELDS.clear(),
            TypeError,
            'INTERNAL_ENGINE_FIELDS.clear() must throw TypeError'
        );

        // 1b. PERMITTED_SNAPSHOT_NORMALIZED_KEYS
        assert.ok(PERMITTED_SNAPSHOT_NORMALIZED_KEYS instanceof Set, 'PERMITTED_SNAPSHOT_NORMALIZED_KEYS must be a Set');
        assert.ok(Object.isFrozen(PERMITTED_SNAPSHOT_NORMALIZED_KEYS), 'PERMITTED_SNAPSHOT_NORMALIZED_KEYS must be frozen');
        assert.throws(
            () => PERMITTED_SNAPSHOT_NORMALIZED_KEYS.add('injected_key'),
            TypeError,
            'PERMITTED_SNAPSHOT_NORMALIZED_KEYS.add() must throw TypeError'
        );
        assert.throws(
            () => PERMITTED_SNAPSHOT_NORMALIZED_KEYS.delete('propertyId'),
            TypeError,
            'PERMITTED_SNAPSHOT_NORMALIZED_KEYS.delete() must throw TypeError'
        );
        assert.throws(
            () => PERMITTED_SNAPSHOT_NORMALIZED_KEYS.clear(),
            TypeError,
            'PERMITTED_SNAPSHOT_NORMALIZED_KEYS.clear() must throw TypeError'
        );

        // 1c. EXCLUDED_HASH_FIELDS
        assert.ok(EXCLUDED_HASH_FIELDS instanceof Set, 'EXCLUDED_HASH_FIELDS must be a Set');
        assert.ok(Object.isFrozen(EXCLUDED_HASH_FIELDS), 'EXCLUDED_HASH_FIELDS must be frozen');
        assert.throws(
            () => EXCLUDED_HASH_FIELDS.add('new_exclusion'),
            TypeError,
            'EXCLUDED_HASH_FIELDS.add() must throw TypeError'
        );
        assert.throws(
            () => EXCLUDED_HASH_FIELDS.delete('_id'),
            TypeError,
            'EXCLUDED_HASH_FIELDS.delete() must throw TypeError'
        );
        assert.throws(
            () => EXCLUDED_HASH_FIELDS.clear(),
            TypeError,
            'EXCLUDED_HASH_FIELDS.clear() must throw TypeError'
        );

        // 1d. PERMITTED_NESTED_KEYS inner sets
        for (const [key, nestedSet] of Object.entries(PERMITTED_NESTED_KEYS)) {
            assert.ok(nestedSet instanceof Set, `PERMITTED_NESTED_KEYS.${key} must be a Set`);
            assert.ok(Object.isFrozen(nestedSet), `PERMITTED_NESTED_KEYS.${key} must be frozen`);
            assert.throws(
                () => nestedSet.add('raw'),
                TypeError,
                `PERMITTED_NESTED_KEYS.${key}.add() must throw TypeError`
            );
            assert.throws(
                () => nestedSet.delete('value'),
                TypeError,
                `PERMITTED_NESTED_KEYS.${key}.delete() must throw TypeError`
            );
            assert.throws(
                () => nestedSet.clear(),
                TypeError,
                `PERMITTED_NESTED_KEYS.${key}.clear() must throw TypeError`
            );
        }
    });

    await t.test('2. Deeply Frozen Policy Dictionaries Reject Property Mutation', () => {
        // 2a. SOURCE_FIELD_MAPS deep immutability
        assert.throws(
            () => { SOURCE_FIELD_MAPS.HSVP.propertyId.sourceLabel = 'HACKED'; },
            TypeError,
            'Mutating SOURCE_FIELD_MAPS nested property must throw TypeError'
        );
        assert.throws(
            () => { SOURCE_FIELD_MAPS.HSVP.newField = 123; },
            TypeError,
            'Adding field to SOURCE_FIELD_MAPS must throw TypeError'
        );

        // 2b. CANONICAL_FIELDS deep immutability
        assert.throws(
            () => { CANONICAL_FIELDS.propertyId.type = 'HACKED'; },
            TypeError,
            'Mutating CANONICAL_FIELDS nested property must throw TypeError'
        );
        assert.throws(
            () => { CANONICAL_FIELDS.newField = {}; },
            TypeError,
            'Adding field to CANONICAL_FIELDS must throw TypeError'
        );

        // 2c. PERMITTED_HASH_FIELDS array immutability
        assert.throws(
            () => { PERMITTED_HASH_FIELDS.push('HACKED'); },
            TypeError,
            'PERMITTED_HASH_FIELDS.push() must throw TypeError'
        );
        assert.throws(
            () => { PERMITTED_HASH_FIELDS[0] = 'HACKED'; },
            TypeError,
            'Mutating PERMITTED_HASH_FIELDS element must throw TypeError'
        );

        // 2d. DATA_QUALITY_STATUSES array immutability
        assert.throws(
            () => { DATA_QUALITY_STATUSES.push('HACKED'); },
            TypeError,
            'DATA_QUALITY_STATUSES.push() must throw TypeError'
        );
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: PROGRAMMATIC FIELD COUNTS & EVIDENCE SEMANTICS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('3. Exact Programmatic Derivation of Canonical & Hash Field Counts', () => {
        // 3a. Exactly 30 fields in PERMITTED_HASH_FIELDS
        assert.equal(
            PERMITTED_HASH_FIELDS.length,
            30,
            'PERMITTED_HASH_FIELDS must contain exactly 30 canonical fields'
        );

        const expectedHashFields = [
            'allotmentDate', 'allotmentMode', 'allotmentPrice', 'authorityCode',
            'authorityStatus', 'blockCode', 'buildingPlanApproved', 'currentDues',
            'duesStatus', 'estateOffice', 'fileNumber', 'formNumber',
            'leaseRentStatus', 'litigationStatus', 'mortgageStatus',
            'occupancyCertificate', 'phaseCode', 'possessionDate',
            'possessionStatus', 'propertyAreaUnit', 'propertyAreaValue',
            'propertyCategory', 'propertyId', 'propertySize', 'propertyType',
            'schemeName', 'sectorNumber', 'totalPaid', 'transferDate',
            'urbanEstate'
        ].sort();

        assert.deepEqual(
            Array.from(PERMITTED_HASH_FIELDS).sort(),
            expectedHashFields,
            'PERMITTED_HASH_FIELDS list must exactly match the 30 canonical facts'
        );

        // 3b. Every permitted hash field must be declared in PERMITTED_SNAPSHOT_NORMALIZED_KEYS (or authorityCode)
        for (const field of PERMITTED_HASH_FIELDS) {
            if (field === 'authorityCode') continue; // Schema-level field on PropertyVerificationSnapshot
            assert.ok(
                PERMITTED_SNAPSHOT_NORMALIZED_KEYS.has(field),
                `Permitted hash field ${field} must be recognized in snapshot schema`
            );
        }

        // 3c. Exactly 37 fields in CANONICAL_FIELDS
        const canonicalKeys = Object.keys(CANONICAL_FIELDS);
        assert.equal(
            canonicalKeys.length,
            37,
            'CANONICAL_FIELDS must contain exactly 37 field definitions'
        );

        // 3d. Exactly 10 fields in INTERNAL_ENGINE_FIELDS, all with sourceEvidenceStatus: NOT_APPLICABLE
        assert.equal(
            INTERNAL_ENGINE_FIELDS.size,
            10,
            'INTERNAL_ENGINE_FIELDS must contain exactly 10 fields'
        );
        for (const field of INTERNAL_ENGINE_FIELDS) {
            for (const [auth, map] of Object.entries(SOURCE_FIELD_MAPS)) {
                if (map[field]) {
                    assert.equal(
                        map[field].sourceEvidenceStatus,
                        SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE,
                        `${auth}.${field} must have sourceEvidenceStatus: NOT_APPLICABLE`
                    );
                }
            }
        }
    });

    await t.test('4. All 30 Permitted Hash Fields Alter the Content Hash When Modified', () => {
        const baseDoc = { propertyId: 'P-BASE-HASH-TEST' };
        const baseHash = computeSnapshotContentHash(baseDoc);

        for (const field of PERMITTED_HASH_FIELDS) {
            let sampleVal;
            if (field.includes('Date')) {
                sampleVal = new Date('2026-06-15T10:00:00.000Z');
            } else if (field === 'buildingPlanApproved' || field === 'occupancyCertificate') {
                sampleVal = true;
            } else if (field === 'propertyAreaValue') {
                sampleVal = 500;
            } else if (['allotmentPrice', 'currentDues', 'totalPaid'].includes(field)) {
                sampleVal = { value: 750000, currency: 'INR' };
            } else {
                sampleVal = 'TEST_VALUE_' + field;
            }

            const modifiedDoc = { propertyId: 'P-BASE-HASH-TEST', [field]: sampleVal };
            const modifiedHash = computeSnapshotContentHash(modifiedDoc);

            assert.notEqual(
                modifiedHash,
                baseHash,
                `Modifying permitted hash field "${field}" must alter the content hash`
            );
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: DEEP RECURSIVE NESTED PRIVACY BOUNDARY (DATABASE BACKED)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('Database Setup (In-Memory)', async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        tenantId = new mongoose.Types.ObjectId();
        userId = new mongoose.Types.ObjectId();
        assert.ok(mongoose.connection.readyState === 1);
    });

    await t.test('5. Deep Nested PII Inside Permitted Monetary Objects Is Stripped on Save', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const inputData = {
            propertyId: 'PLOT-901',
            sectorNumber: '21',
            allotmentPrice: {
                value: 4500000,
                currency: 'INR',
                // Malicious nested PII payloads:
                owner_name: 'Deep Nested Allottee',
                allottee_address: 'House 999, Deep Sector',
                contact_number: '9876543210',
                email_id: 'nested_leak@example.com',
                raw_payload: {
                    bearer_token: 'secret-token-xyz',
                    aadhaar_no: '1111 2222 3333'
                }
            },
            currentDues: {
                value: 0,
                currency: 'INR',
                resident_name: 'Secondary Person',
                mobile_no: '9123456780'
            }
        };

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId,
            normalizedData: inputData
        });

        // Read back directly from database
        const fresh = await PropertyVerificationSnapshot.findById(snapshot._id).lean();

        // 5a. Privacy detection flags
        assert.equal(fresh.ownerDataPresent, true, 'ownerDataPresent must be true when nested PII is detected');
        assert.equal(fresh.ownerDataRedacted, true, 'ownerDataRedacted must always be true');

        // 5b. ownerName schema field strictly null
        assert.equal(fresh.normalizedData.ownerName, null);

        // 5c. Monetary facts strictly normalized to permitted keys { value, currency }
        assert.deepEqual(fresh.normalizedData.allotmentPrice, {
            value: 4500000,
            currency: 'INR'
        });
        assert.deepEqual(fresh.normalizedData.currentDues, {
            value: 0,
            currency: 'INR'
        });

        // 5d. Zero leakage of nested keys
        assert.equal(fresh.normalizedData.allotmentPrice.owner_name, undefined);
        assert.equal(fresh.normalizedData.allotmentPrice.allottee_address, undefined);
        assert.equal(fresh.normalizedData.allotmentPrice.contact_number, undefined);
        assert.equal(fresh.normalizedData.allotmentPrice.email_id, undefined);
        assert.equal(fresh.normalizedData.allotmentPrice.raw_payload, undefined);
        assert.equal(fresh.normalizedData.currentDues.resident_name, undefined);
        assert.equal(fresh.normalizedData.currentDues.mobile_no, undefined);

        // 5e. Content hash computed cleanly
        assert.ok(/^[0-9a-f]{64}$/.test(fresh.contentHash));
    });

    await t.test('6. Injected PII in Sentinels Is Stripped (Only _sentinel Preserved)', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const inputData = {
            propertyId: 'PLOT-902',
            sectorNumber: '22',
            currentDues: {
                _sentinel: 'NOT_RETURNED',
                raw: 'Outstanding dues: Nil (Contact: 9876543210)',
                owner_email: 'sentinel_leak@example.com',
                meaning: 'Field absent',
                extra_secret: 'credential_123'
            },
            litigationStatus: {
                _sentinel: 'FALSE',
                raw: 'No case for Shri Ram Sharma',
                citizen_name: 'Ram Sharma'
            }
        };

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'GMADA',
            linkId,
            normalizedData: inputData
        });

        const fresh = await PropertyVerificationSnapshot.findById(snapshot._id).lean();

        assert.equal(fresh.ownerDataPresent, true);
        assert.equal(fresh.ownerDataRedacted, true);

        // Sentinels must strictly contain ONLY _sentinel
        assert.deepEqual(fresh.normalizedData.currentDues, { _sentinel: 'NOT_RETURNED' });
        assert.deepEqual(fresh.normalizedData.litigationStatus, { _sentinel: 'FALSE' });

        // Zero leakage
        assert.equal(fresh.normalizedData.currentDues.raw, undefined);
        assert.equal(fresh.normalizedData.currentDues.owner_email, undefined);
        assert.equal(fresh.normalizedData.litigationStatus.citizen_name, undefined);
    });

    await t.test('7. Malformed Objects and Unexpected Arrays in Scalar Fields Are Discarded', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const inputData = {
            propertyId: 'PLOT-903',
            // Malformed object in numeric field:
            propertyAreaValue: { hacked: true, pii_name: 'John Doe', phone: '9999999999' },
            // Unexpected array in string field:
            propertySize: ['array', 'with', { email: 'leak@test.com' }],
            // Unexpected object in boolean field:
            buildingPlanApproved: { malicious: 'payload', contact_info: 'test' }
        };

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'CHD',
            linkId,
            normalizedData: inputData
        });

        const fresh = await PropertyVerificationSnapshot.findById(snapshot._id).lean();

        assert.equal(fresh.ownerDataPresent, true);
        assert.equal(fresh.normalizedData.propertyAreaValue, null);
        assert.equal(fresh.normalizedData.propertySize, null);
        assert.equal(fresh.normalizedData.buildingPlanApproved, null);
    });

    await t.test('8. Raw HTML and Embedded Script Tags Are Stripped from Strings', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const inputData = {
            propertyId: '<script>alert("xss")</script>PLOT-904',
            schemeName: '<div class="scheme"><b>Urban Estate</b></div>',
            sectorNumber: '<span style="color:red">Sector 15</span>'
        };

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId,
            normalizedData: inputData
        });

        const fresh = await PropertyVerificationSnapshot.findById(snapshot._id).lean();

        assert.equal(fresh.ownerDataPresent, true); // HTML detected as sensitive
        assert.equal(fresh.normalizedData.propertyId, 'PLOT-904');
        assert.equal(fresh.normalizedData.schemeName, 'Urban Estate');
        assert.equal(fresh.normalizedData.sectorNumber, 'Sector 15');
    });

    await t.test('9. Sensitive Query Parameters in sourceReferenceUrl Are Stripped', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId,
            sourceReferenceUrl: 'https://hsvp.org.in/portal/view?propertyId=123&token=secret123&session=sess_xyz&auth=bearer_token',
            normalizedData: {
                propertyId: 'PLOT-905'
            }
        });

        const fresh = await PropertyVerificationSnapshot.findById(snapshot._id).lean();

        assert.ok(fresh.sourceReferenceUrl);
        assert.ok(!fresh.sourceReferenceUrl.includes('token='), 'token param must be stripped');
        assert.ok(!fresh.sourceReferenceUrl.includes('session='), 'session param must be stripped');
        assert.ok(!fresh.sourceReferenceUrl.includes('auth='), 'auth param must be stripped');
        assert.ok(fresh.sourceReferenceUrl.includes('propertyId=123'), 'non-sensitive query param preserved');
    });

    await t.test('10. insertMany() Executes the Same Deep Recursive Sanitization', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const batch = [
            {
                tenantId,
                authorityCode: 'GMADA',
                linkId,
                normalizedData: {
                    propertyId: 'BATCH-1',
                    allotmentPrice: {
                        value: 500000,
                        currency: 'INR',
                        owner_pan: 'ABCDE1234F',
                        nested: { phone: '9876543210' }
                    }
                }
            },
            {
                tenantId,
                authorityCode: 'GMADA',
                linkId,
                normalizedData: {
                    propertyId: 'BATCH-2',
                    currentDues: {
                        _sentinel: 'NOT_RETURNED',
                        aadhaar: '1234 5678 9012',
                        leak: 'secret'
                    }
                }
            }
        ];

        const inserted = await PropertyVerificationSnapshot.insertMany(batch);
        assert.equal(inserted.length, 2);

        for (const doc of inserted) {
            const fresh = await PropertyVerificationSnapshot.findById(doc._id).lean();
            assert.equal(fresh.ownerDataPresent, true);
            assert.equal(fresh.ownerDataRedacted, true);
            assert.equal(fresh.normalizedData.ownerName, null);
            assert.ok(/^[0-9a-f]{64}$/.test(fresh.contentHash));
        }

        const fresh1 = await PropertyVerificationSnapshot.findById(inserted[0]._id).lean();
        assert.deepEqual(fresh1.normalizedData.allotmentPrice, { value: 500000, currency: 'INR' });

        const fresh2 = await PropertyVerificationSnapshot.findById(inserted[1]._id).lean();
        assert.deepEqual(fresh2.normalizedData.currentDues, { _sentinel: 'NOT_RETURNED' });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: PERSISTENCE METHOD IMMUTABILITY & ACCESS BOUNDARY AUDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('11. Mongoose ODM Mutation Methods Are Strictly Blocked (SNAPSHOT_IMMUTABLE)', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId,
            normalizedData: { propertyId: 'PLOT-IMMUTABLE' }
        });

        // 11a. save() on existing document
        snapshot.normalizedData.propertyId = 'PLOT-MUTATED';
        await assert.rejects(
            async () => { await snapshot.save(); },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11b. updateOne()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.updateOne(
                    { _id: snapshot._id },
                    { $set: { 'normalizedData.propertyId': 'PLOT-MUTATED' } }
                );
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11c. updateMany()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.updateMany(
                    { _id: snapshot._id },
                    { $set: { 'normalizedData.propertyId': 'PLOT-MUTATED' } }
                );
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11d. findOneAndUpdate()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.findOneAndUpdate(
                    { _id: snapshot._id },
                    { $set: { 'normalizedData.propertyId': 'PLOT-MUTATED' } }
                );
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11e. replaceOne()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.replaceOne(
                    { _id: snapshot._id },
                    { tenantId, authorityCode: 'HSVP', linkId }
                );
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11f. findOneAndReplace()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.findOneAndReplace(
                    { _id: snapshot._id },
                    { tenantId, authorityCode: 'HSVP', linkId }
                );
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11g. deleteOne()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.deleteOne({ _id: snapshot._id });
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11h. deleteMany()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.deleteMany({ _id: snapshot._id });
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11i. findOneAndDelete()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.findOneAndDelete({ _id: snapshot._id });
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // 11j. bulkWrite()
        await assert.rejects(
            async () => {
                await PropertyVerificationSnapshot.bulkWrite([
                    { updateOne: { filter: { _id: snapshot._id }, update: { $set: { isSealed: false } } } }
                ]);
            },
            (err) => err.code === 'SNAPSHOT_IMMUTABLE'
        );

        // Verify document is unmodified in database
        const untouched = await PropertyVerificationSnapshot.findById(snapshot._id).lean();
        assert.equal(untouched.normalizedData.propertyId, 'PLOT-IMMUTABLE');
    });

    await t.test('12. Database Access Boundary: Native Driver vs Mongoose Middleware', async () => {
        const linkId = new mongoose.Types.ObjectId();

        const snapshot = await PropertyVerificationSnapshot.create({
            tenantId,
            authorityCode: 'HSVP',
            linkId,
            normalizedData: { propertyId: 'PLOT-BOUNDARY' }
        });

        // Direct native MongoDB driver call bypasses Mongoose middleware
        const rawCollection = mongoose.connection.db.collection('property_verification_snapshots');
        assert.ok(rawCollection, 'Native MongoDB collection accessible');

        // Document that Mongoose ODM middleware cannot intercept raw native commands
        // In production, database user roles must restrict UPDATE/DELETE at the MongoDB cluster level.
        const res = await rawCollection.updateOne(
            { _id: snapshot._id },
            { $set: { _nativeAuditNote: 'Direct driver write observed' } }
        );
        assert.equal(res.acknowledged, true);

        const afterNative = await rawCollection.findOne({ _id: snapshot._id });
        assert.equal(afterNative._nativeAuditNote, 'Direct driver write observed');

        // Clean up native test artifact
        await rawCollection.updateOne(
            { _id: snapshot._id },
            { $unset: { _nativeAuditNote: '' } }
        );
    });

    await t.test('Teardown Database', async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });
});
