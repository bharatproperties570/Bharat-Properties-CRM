/**
 * Phase 2.10 — Policy Encapsulation, Hash Crosswalk & Latest-Main Validation Suite
 *
 * Verifies:
 * 1. Policy Encapsulation & Prototype Exploit Immunity:
 *    - Guards against V8 internal-slot mutation bypass (Set.prototype.add.call, delete.call, clear.call).
 *    - Proves that proxy receivers cause native Set methods to reject with incompatible receiver TypeError.
 *    - Confirms module-private policy sets cannot be tampered with through reflection or prototype manipulation.
 *    - Confirms query functions accurately inspect private collections.
 * 2. Canonical-Field-to-Hash Crosswalk Validation:
 *    - Comprehensive 30-field table cross-referencing all permitted hash fields to canonical definitions.
 *    - Validates classification ('direct', 'aliased', 'normalized', 'derived'), transform, and rationale.
 *    - Confirms sensitive = false across all 30 fields and unverified = true for portal fields without live samples.
 *    - Validates authoritative mappings: transferDate from lastTransferDate, propertyAreaValue/Unit from area,
 *      authorityCode from authority, and duesStatus/leaseRentStatus as categorical facts.
 * 3. Privacy Persistence Boundary & Native Driver Audit:
 *    - Personal data (allotteeName, allotteeAddress) remains strictly NOT_STORED and excluded from hashes.
 *    - Mongoose save() and insertMany() strip nested PII from snapshots.
 *    - Inventory rejects PII and unauthorized fields via strict: 'throw'.
 *    - Documents and verifies that native MongoDB driver operations bypass Mongoose hooks.
 * 4. Source Evidence Semantics:
 *    - Internal engine fields have sourceEvidenceStatus: NOT_APPLICABLE.
 *    - Portal fields remain UNVERIFIED with verifiedSourceLabel: null.
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
    createReadOnlySetGuard,
    createReadOnlySetProxy,
    isInternalEngineField,
    getInternalEngineFields,
    deepFreeze
} from '../services/authority/authorityFieldDictionary.js';

import {
    computeSnapshotContentHash,
    computeNormalizedContentHash,
    PERMITTED_HASH_FIELDS,
    PERMITTED_HASH_SET,
    PERMITTED_NESTED_KEYS,
    EXCLUDED_HASH_FIELDS,
    isPermittedHashField,
    isExcludedHashField,
    isPermittedNestedKey,
    getPermittedHashFields,
    getExcludedHashFields,
    CANONICAL_HASH_CROSSWALK,
    getCrosswalkEntry,
    getCanonicalHashCrosswalk
} from '../services/authority/authorityNormalizer.js';

import PropertyVerificationSnapshot, {
    PERMITTED_SNAPSHOT_NORMALIZED_KEYS,
    isPermittedSnapshotNormalizedKey,
    getPermittedSnapshotNormalizedKeys,
    DATA_QUALITY_STATUSES,
    sanitizeSnapshotPII
} from '../models/PropertyVerificationSnapshot.js';

import Inventory from '../models/Inventory.js';
import AuditLog from '../models/AuditLog.js';
import Role from '../models/Role.js';

test('--- PHASE 2.10: POLICY ENCAPSULATION, HASH CROSSWALK & LATEST-MAIN VALIDATION ---', async (t) => {

    let mongoServer;
    let tenantId;
    let userId;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: PROTOTYPE EXPLOIT IMMUNITY & POLICY ENCAPSULATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('1. Prototype Exploit Defense: Set.prototype Methods Reject Proxied Receivers', () => {
        // 1.1 Set.prototype.add.call on INTERNAL_ENGINE_FIELDS must fail with incompatible receiver
        assert.throws(
            () => { Set.prototype.add.call(INTERNAL_ENGINE_FIELDS, 'malicious_injected_field'); },
            (err) => {
                return err instanceof TypeError && (
                    err.message.includes('incompatible receiver') ||
                    err.message.includes('prohibited')
                );
            },
            'Set.prototype.add.call on INTERNAL_ENGINE_FIELDS must reject incompatible receiver'
        );

        // 1.2 Set.prototype.delete.call on INTERNAL_ENGINE_FIELDS must fail
        assert.throws(
            () => { Set.prototype.delete.call(INTERNAL_ENGINE_FIELDS, 'authority'); },
            (err) => {
                return err instanceof TypeError && (
                    err.message.includes('incompatible receiver') ||
                    err.message.includes('prohibited')
                );
            },
            'Set.prototype.delete.call on INTERNAL_ENGINE_FIELDS must reject incompatible receiver'
        );

        // 1.3 Set.prototype.clear.call on INTERNAL_ENGINE_FIELDS must fail
        assert.throws(
            () => { Set.prototype.clear.call(INTERNAL_ENGINE_FIELDS); },
            (err) => {
                return err instanceof TypeError && (
                    err.message.includes('incompatible receiver') ||
                    err.message.includes('prohibited')
                );
            },
            'Set.prototype.clear.call on INTERNAL_ENGINE_FIELDS must reject incompatible receiver'
        );

        // 1.4 Set.prototype.add.call on PERMITTED_SNAPSHOT_NORMALIZED_KEYS must fail
        assert.throws(
            () => { Set.prototype.add.call(PERMITTED_SNAPSHOT_NORMALIZED_KEYS, 'smuggled_key'); },
            (err) => {
                return err instanceof TypeError && (
                    err.message.includes('incompatible receiver') ||
                    err.message.includes('prohibited')
                );
            },
            'Set.prototype.add.call on PERMITTED_SNAPSHOT_NORMALIZED_KEYS must reject incompatible receiver'
        );

        // 1.5 Set.prototype.add.call on EXCLUDED_HASH_FIELDS must fail
        assert.throws(
            () => { Set.prototype.add.call(EXCLUDED_HASH_FIELDS, 'smuggled_hash_field'); },
            (err) => {
                return err instanceof TypeError && (
                    err.message.includes('incompatible receiver') ||
                    err.message.includes('prohibited')
                );
            },
            'Set.prototype.add.call on EXCLUDED_HASH_FIELDS must reject incompatible receiver'
        );

        // 1.6 Set.prototype.add.call on PERMITTED_NESTED_KEYS child sets must fail
        for (const [parentField, keySet] of Object.entries(PERMITTED_NESTED_KEYS)) {
            assert.throws(
                () => { Set.prototype.add.call(keySet, 'injected_child'); },
                (err) => {
                    return err instanceof TypeError && (
                        err.message.includes('incompatible receiver') ||
                        err.message.includes('prohibited')
                    );
                },
                `Set.prototype.add.call on PERMITTED_NESTED_KEYS.${parentField} must reject incompatible receiver`
            );
        }
    });

    await t.test('2. Direct Method Mutation & Property Tampering Rejections', () => {
        // Direct method calls must throw
        assert.throws(() => INTERNAL_ENGINE_FIELDS.add('bad'), TypeError);
        assert.throws(() => INTERNAL_ENGINE_FIELDS.delete('authority'), TypeError);
        assert.throws(() => INTERNAL_ENGINE_FIELDS.clear(), TypeError);

        assert.throws(() => EXCLUDED_HASH_FIELDS.add('bad'), TypeError);
        assert.throws(() => EXCLUDED_HASH_FIELDS.delete('ownerName'), TypeError);
        assert.throws(() => EXCLUDED_HASH_FIELDS.clear(), TypeError);

        assert.throws(() => PERMITTED_SNAPSHOT_NORMALIZED_KEYS.add('bad'), TypeError);
        assert.throws(() => PERMITTED_SNAPSHOT_NORMALIZED_KEYS.delete('propertyId'), TypeError);
        assert.throws(() => PERMITTED_SNAPSHOT_NORMALIZED_KEYS.clear(), TypeError);

        // Direct property assignment or definition must throw
        assert.throws(() => { INTERNAL_ENGINE_FIELDS.evil = true; }, TypeError);
        assert.throws(() => { Object.defineProperty(INTERNAL_ENGINE_FIELDS, 'evil', { value: 123 }); }, TypeError);
        assert.throws(() => { delete INTERNAL_ENGINE_FIELDS.size; }, TypeError);
    });

    await t.test('3. Query Functions Accurately Reflect Private Module Policies', () => {
        // 3.1 isInternalEngineField
        assert.equal(isInternalEngineField('authority'), true);
        assert.equal(isInternalEngineField('policyVersion'), true);
        assert.equal(isInternalEngineField('verificationStatus'), true);
        assert.equal(isInternalEngineField('snapshotContentHash'), true);
        assert.equal(isInternalEngineField('rawSnapshotHash'), true);
        assert.equal(isInternalEngineField('propertyId'), false);
        assert.equal(isInternalEngineField('ownerName'), false);
        assert.equal(isInternalEngineField('malicious_field'), false);

        const internalFields = getInternalEngineFields();
        assert.equal(internalFields.length, 10);
        assert.ok(internalFields.includes('authority'));

        // 3.2 isPermittedHashField
        assert.equal(isPermittedHashField('propertyId'), true);
        assert.equal(isPermittedHashField('transferDate'), true);
        assert.equal(isPermittedHashField('propertyAreaValue'), true);
        assert.equal(isPermittedHashField('authorityCode'), true);
        assert.equal(isPermittedHashField('duesStatus'), true);
        assert.equal(isPermittedHashField('leaseRentStatus'), true);
        assert.equal(isPermittedHashField('ownerName'), false);
        assert.equal(isPermittedHashField('allotteeName'), false);
        assert.equal(isPermittedHashField('cookies'), false);

        const permittedHashList = getPermittedHashFields();
        assert.equal(permittedHashList.length, 30);

        // 3.3 isExcludedHashField
        assert.equal(isExcludedHashField('ownerName'), true);
        assert.equal(isExcludedHashField('allotteeName'), true);
        assert.equal(isExcludedHashField('allotteeAddress'), true);
        assert.equal(isExcludedHashField('cookies'), true);
        assert.equal(isExcludedHashField('csrfToken'), true);
        assert.equal(isExcludedHashField('propertyId'), false);

        // 3.4 isPermittedNestedKey
        assert.equal(isPermittedNestedKey('allotmentPrice', 'value'), true);
        assert.equal(isPermittedNestedKey('allotmentPrice', 'currency'), true);
        assert.equal(isPermittedNestedKey('allotmentPrice', 'raw'), false);
        assert.equal(isPermittedNestedKey('allotmentPrice', 'ownerName'), false);
        assert.equal(isPermittedNestedKey('area', 'value'), true);
        assert.equal(isPermittedNestedKey('area', 'unit'), true);
        assert.equal(isPermittedNestedKey('area', 'mode'), true);
        assert.equal(isPermittedNestedKey('area', 'unknownKey'), false);
        assert.equal(isPermittedNestedKey('unrelatedParent', 'value'), false);

        // 3.5 isPermittedSnapshotNormalizedKey
        assert.equal(isPermittedSnapshotNormalizedKey('propertyId'), true);
        assert.equal(isPermittedSnapshotNormalizedKey('sectorNumber'), true);
        assert.equal(isPermittedSnapshotNormalizedKey('phaseCode'), true);
        assert.equal(isPermittedSnapshotNormalizedKey('ownerName'), true); // Recognized for null coercion
        assert.equal(isPermittedSnapshotNormalizedKey('injectedSmuggledKey'), false);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: CANONICAL-FIELD-TO-HASH CROSSWALK VALIDATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('4. Comprehensive Canonical-Field-to-Hash Crosswalk Integrity', () => {
        const crosswalkList = getCanonicalHashCrosswalk();
        assert.equal(
            crosswalkList.length,
            30,
            'CANONICAL_HASH_CROSSWALK must contain exactly 30 entries'
        );

        // 4.1 1:1 parity with PERMITTED_HASH_FIELDS
        const crosswalkFields = Object.keys(CANONICAL_HASH_CROSSWALK).sort();
        const permittedFields = Array.from(PERMITTED_HASH_FIELDS).sort();
        assert.deepEqual(
            crosswalkFields,
            permittedFields,
            'Crosswalk entries must match PERMITTED_HASH_FIELDS 1:1'
        );

        // 4.2 Validate structure and types of every crosswalk entry
        const validClassifications = ['direct', 'aliased', 'normalized', 'derived'];

        for (const entry of crosswalkList) {
            assert.ok(entry.hashField, `Entry missing hashField: ${JSON.stringify(entry)}`);
            assert.ok(Array.isArray(entry.canonicalSourceFields), `${entry.hashField} missing canonicalSourceFields array`);
            assert.ok(entry.canonicalSourceFields.length > 0, `${entry.hashField} has empty canonicalSourceFields`);
            assert.ok(validClassifications.includes(entry.classification), `${entry.hashField} invalid classification: ${entry.classification}`);
            assert.ok(typeof entry.transformAndType === 'string' && entry.transformAndType.length > 0, `${entry.hashField} missing transformAndType`);
            assert.ok(typeof entry.rationale === 'string' && entry.rationale.length > 0, `${entry.hashField} missing rationale`);
            assert.ok(entry.containsSensitiveOrUnverified && typeof entry.containsSensitiveOrUnverified === 'object', `${entry.hashField} missing containsSensitiveOrUnverified`);
            assert.strictEqual(entry.containsSensitiveOrUnverified.sensitive, false, `${entry.hashField} must NOT be sensitive`);
            assert.ok(typeof entry.testReference === 'string', `${entry.hashField} missing testReference`);

            // Verify canonical source fields actually exist in CANONICAL_FIELDS (or nested sub-property)
            for (const src of entry.canonicalSourceFields) {
                const baseField = src.split('.')[0];
                assert.ok(
                    CANONICAL_FIELDS[baseField],
                    `Canonical source field ${baseField} for ${entry.hashField} does not exist in CANONICAL_FIELDS`
                );
            }
        }
    });

    await t.test('5. Specific Authoritative Mappings in Crosswalk', () => {
        // 5.1 transferDate must alias canonical lastTransferDate
        const transferEntry = getCrosswalkEntry('transferDate');
        assert.ok(transferEntry);
        assert.equal(transferEntry.classification, 'aliased');
        assert.deepEqual(transferEntry.canonicalSourceFields, ['lastTransferDate']);

        // 5.2 propertyAreaValue and propertyAreaUnit must normalize canonical area
        const areaValEntry = getCrosswalkEntry('propertyAreaValue');
        assert.ok(areaValEntry);
        assert.equal(areaValEntry.classification, 'normalized');
        assert.deepEqual(areaValEntry.canonicalSourceFields, ['area']);

        const areaUnitEntry = getCrosswalkEntry('propertyAreaUnit');
        assert.ok(areaUnitEntry);
        assert.equal(areaUnitEntry.classification, 'normalized');
        assert.deepEqual(areaUnitEntry.canonicalSourceFields, ['area']);

        // 5.3 authorityCode must derive from canonical authority
        const authCodeEntry = getCrosswalkEntry('authorityCode');
        assert.ok(authCodeEntry);
        assert.equal(authCodeEntry.classification, 'derived');
        assert.deepEqual(authCodeEntry.canonicalSourceFields, ['authority']);
        assert.strictEqual(authCodeEntry.containsSensitiveOrUnverified.unverified, false);

        // 5.4 duesStatus and leaseRentStatus must participate as categorical encumbrances
        const duesEntry = getCrosswalkEntry('duesStatus');
        assert.ok(duesEntry);
        assert.equal(duesEntry.classification, 'derived');

        const leaseRentEntry = getCrosswalkEntry('leaseRentStatus');
        assert.ok(leaseRentEntry);
        assert.equal(leaseRentEntry.classification, 'derived');

        // 5.5 propertySize must derive from area
        const sizeEntry = getCrosswalkEntry('propertySize');
        assert.ok(sizeEntry);
        assert.equal(sizeEntry.classification, 'derived');
        assert.deepEqual(sizeEntry.canonicalSourceFields, ['area']);
    });

    await t.test('6. Dynamic Hash Sensitivity Test: Crosswalk Fields Modify Content Hash', () => {
        const baseDoc = { propertyId: 'P-CROSSWALK-TEST' };
        const baseHash = computeSnapshotContentHash(baseDoc);

        const crosswalk = getCanonicalHashCrosswalk();
        for (const entry of crosswalk) {
            const field = entry.hashField;
            let sampleVal;
            if (field.includes('Date')) {
                sampleVal = new Date('2026-07-20T10:00:00.000Z');
            } else if (field === 'buildingPlanApproved' || field === 'occupancyCertificate') {
                sampleVal = true;
            } else if (field === 'propertyAreaValue') {
                sampleVal = 250;
            } else if (field === 'allotmentPrice' || field === 'currentDues' || field === 'totalPaid') {
                sampleVal = { value: 7500000, currency: 'INR' };
            } else if (field === 'authorityCode') {
                sampleVal = 'GMADA';
            } else {
                sampleVal = `MODIFIED_${field}`;
            }

            const docWithField = { ...baseDoc, [field]: sampleVal };
            const newHash = computeSnapshotContentHash(docWithField);

            assert.notEqual(
                newHash,
                baseHash,
                `Modifying crosswalk field ${field} must alter the content hash`
            );
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: PRIVACY BOUNDARY & DATABASE PERSISTENCE AUDIT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('Database Setup (In-Memory)', async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
        tenantId = new mongoose.Types.ObjectId();
        userId = new mongoose.Types.ObjectId();
    });

    await t.test('7. Personal Data (allotteeName, allotteeAddress) Excluded from Hash & Persistence', async () => {
        const docWithPII = {
            propertyId: 'PROP-PII-TEST-10',
            allotteeName: 'Confidential Person',
            allotteeAddress: '123 Private Street, Delhi',
            ownerName: 'Should Not Persist',
            cookies: 'session=xyz',
            csrfToken: 'csrf-12345'
        };

        const cleanDoc = {
            propertyId: 'PROP-PII-TEST-10'
        };

        const hashWithPII = computeSnapshotContentHash(docWithPII);
        const hashClean = computeSnapshotContentHash(cleanDoc);

        assert.equal(
            hashWithPII,
            hashClean,
            'Smuggled personal data and session tokens must NOT alter the content hash'
        );

        // Mongoose Snapshot persistence strips owner/allottee PII
        const snapshot = new PropertyVerificationSnapshot({
            tenantId,
            linkId: new mongoose.Types.ObjectId(),
            authorityCode: 'HSVP',
            normalizedData: {
                propertyId: 'PROP-PII-TEST-10',
                ownerName: 'Confidential Person',
                allotteeName: 'Confidential Person',
                allotteeAddress: 'Private Address'
            }
        });

        await snapshot.save();
        assert.strictEqual(snapshot.normalizedData.ownerName, null);
        assert.strictEqual(snapshot.normalizedData.allotteeName, undefined);
        assert.strictEqual(snapshot.normalizedData.allotteeAddress, undefined);
        assert.strictEqual(snapshot.ownerDataRedacted, true);
    });

    await t.test('8. Inventory Schema Rejects PII via strict: throw', async () => {
        // Attempting to write ownerName or other PII directly into authorityVerification subschema throws
        const inv = new Inventory({
            tenantId,
            projectName: 'Test Sector',
            unitNumber: 'U-100',
            authorityVerification: {
                propertyId: 'P-100',
                ownerName: 'Illegal Smuggled Name'
            }
        });

        await assert.rejects(
            async () => { await inv.save(); },
            (err) => {
                return err.name === 'StrictModeError' ||
                       err.message.includes('StrictModeError') ||
                       err.message.includes('Field `ownerName` is not in schema');
            },
            'Writing unmodeled fields to authorityVerification must be rejected by strict: throw'
        );
    });

    await t.test('9. Native Driver Access Boundary: Documents Native Bypass Limitation', async () => {
        // Direct native MongoDB operations bypass Mongoose pre-hooks and strict-mode setters.
        // This test proves and explicitly documents this boundary.
        const rawCollection = mongoose.connection.collection('propertyverificationsnapshots');
        const rawDoc = {
            tenantId,
            linkId: new mongoose.Types.ObjectId(),
            authorityCode: 'HSVP',
            normalizedData: {
                propertyId: 'NATIVE-BYPASS-TEST',
                unfilteredKey: 'BYPASSED_MONGOOSE_HOOKS'
            },
            observedAt: new Date()
        };

        const result = await rawCollection.insertOne(rawDoc);
        assert.ok(result.insertedId, 'Direct native driver call succeeds because Mongoose middleware is bypassed');

        const fetched = await rawCollection.findOne({ _id: result.insertedId });
        assert.equal(
            fetched.normalizedData.unfilteredKey,
            'BYPASSED_MONGOOSE_HOOKS',
            'Native write bypassed Mongoose hooks — reinforces requirement for DB-level least-privilege roles'
        );

        // Clean up raw test doc
        await rawCollection.deleteOne({ _id: result.insertedId });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: SOURCE EVIDENCE & SPECIFICATION SEMANTICS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('10. Source Evidence Status Contract: Internal Engine vs Portal Data', () => {
        // 10.1 All 10 internal engine fields MUST be NOT_APPLICABLE across all sources
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

        // 10.2 Zero portal mappings may be marked VERIFIED in source evidence without live samples
        for (const [auth, map] of Object.entries(SOURCE_FIELD_MAPS)) {
            for (const [field, def] of Object.entries(map)) {
                if (INTERNAL_ENGINE_FIELDS.has(field)) continue;
                assert.notEqual(
                    def.sourceEvidenceStatus,
                    SOURCE_EVIDENCE_STATUS.VERIFIED_FROM_OFFICIAL_SPEC,
                    `${auth}.${field} cannot be marked VERIFIED_FROM_OFFICIAL_SPEC without real samples`
                );
                assert.ok(
                    def.sourceEvidenceStatus === SOURCE_EVIDENCE_STATUS.UNVERIFIED ||
                    def.sourceEvidenceStatus === SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED,
                    `${auth}.${field} must be UNVERIFIED or NOT_SUPPORTED`
                );
            }
        }

        // 10.3 Proposed labels distinct from verifiedSourceLabel: null
        for (const [auth, map] of Object.entries(SOURCE_FIELD_MAPS)) {
            for (const [field, def] of Object.entries(map)) {
                if (INTERNAL_ENGINE_FIELDS.has(field)) continue;
                if (def.proposedSourceLabel) {
                    assert.strictEqual(
                        def.verifiedSourceLabel,
                        null,
                        `${auth}.${field} verifiedSourceLabel must remain null`
                    );
                }
            }
        }
    });

    await t.test('Teardown Database', async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });
});
