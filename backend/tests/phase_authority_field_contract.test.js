/**
 * ============================================================================
 *  AUTHORITY PROPERTY VERIFICATION — PHASE 1.2 CONTRACT TESTS
 *  Tests the canonical field dictionary, normalizers, fixtures & source policy.
 *
 *  Phase 1.2 changes over 1.1:
 *    - S6b  Categorical: Pending/Rejected → CATEGORICAL_STATUS (not false)
 *    - S6c  Litigation/mortgage negative-phrasing safety
 *    - S6d  No substring inference for litigation/mortgage
 *    - S1e  phaseCode and blockCode in canonical fields
 *    - S2b  phaseCode/blockCode in all three source maps
 *    - S3b  CATEGORICAL_STATUS and NEEDS_REVIEW sentinels
 *    - S9b  Phase collision in composite keys
 *    - S9c  phaseCode in key pattern
 *    - S10-S12 updated for CATEGORICAL_STATUS
 *
 *  Run with:
 *    node --test backend/tests/phase_authority_field_contract.test.js
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    EVIDENCE_STATUS,
    SENTINEL,
    isSentinel,
    sentinelType,
    AREA_UNIT_REGISTRY,
    AUTHORITY_REGISTRY,
    CANONICAL_FIELDS,
    SOURCE_FIELD_MAPS,
    parseAreaString,
} from '../services/authority/authorityFieldDictionary.js';

import {
    parseAuthorityDate,
    parseCurrencyAmount,
    normalizeBooleanStatus,
    normalizeCategoricalBoolean,
    normalizePropertyId,
    normalizeSectorNumber,
    normalizePhaseCode,
    classifyLocationComponent,
    buildCompositeKey,
    AUTHORITY_IDENTITY_REQUIREMENTS,
    normalizeAuthorityRecord,
} from '../services/authority/authorityNormalizer.js';

import {
    SOURCE_POLICY_MATRIX,
    isSourceActivated,
    PERMISSION_STATUS,
} from '../services/authority/sourcePolicy.js';

import {
    HSVP_FIXTURES,
    ESTATE_OFFICE_CHD_FIXTURES,
    GMADA_FIXTURES,
    AREA_VARIATIONS,
    DATE_VARIATIONS,
    BOOLEAN_EDGE_CASES,
    CATEGORICAL_WORDS_NOT_UNIVERSAL_BOOLEAN,
    CATEGORICAL_BOOLEAN_BY_FIELD,
    CURRENCY_VARIATIONS,
    DUPLICATE_PROPERTY_IDS,
    PHASE_COLLISION_CASES,
    AMBIGUOUS_KEY_CASES,
    SECTOR_NORMALIZATION,
    PHASE_NORMALIZATION,
    LOCATION_CLASSIFICATION,
    SECTOR_PHASE_COLLISION_PREVENTION,
    PROPERTY_ID_NORMALIZATION,
    LITIGATION_MORTGAGE_SAFETY,
} from '../services/authority/fixtures/authorityFixtures.js';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 1: FIELD DICTIONARY STRUCTURAL INTEGRITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test('--- PHASE 1.2: AUTHORITY FIELD CONTRACT TEST SUITE ---', async (t) => {

    await t.test('S1: Field Dictionary — all canonical fields have required metadata', () => {
        for (const [fieldName, fieldDef] of Object.entries(CANONICAL_FIELDS)) {
            assert.ok(fieldDef.type, `${fieldName} missing type`);
            assert.ok(fieldDef.description, `${fieldName} missing description`);
            assert.ok(fieldDef.crm_mapping, `${fieldName} missing crm_mapping`);
            assert.ok(typeof fieldDef.required === 'boolean', `${fieldName} missing required flag`);
        }
    });

    await t.test('S1: authorityStatus never maps to Inventory.status', () => {
        const f = CANONICAL_FIELDS.authorityStatus;
        assert.ok(f);
        assert.ok(f.crm_mapping !== 'status' && !f.crm_mapping.includes('Inventory.status'));
        assert.ok(f.crm_mapping.startsWith('authorityVerification.'));
    });

    await t.test('S1: Inventory.status is never a target for any authority field', () => {
        for (const [n, f] of Object.entries(CANONICAL_FIELDS)) {
            assert.ok(f.crm_mapping !== 'status' && f.crm_mapping !== 'Inventory.status',
                `${n} must not map to Inventory.status`);
        }
    });

    await t.test('S1: owner fields marked as not auto-linked', () => {
        for (const field of ['allotteeName', 'allotteeAddress']) {
            assert.ok(CANONICAL_FIELDS[field]);
            assert.ok(
                CANONICAL_FIELDS[field].description.toLowerCase().includes('not auto-linked'),
                `${field} description must state NOT auto-linked`);
        }
    });

    await t.test('S1: sectorNumber description does not conflate sector and phase', () => {
        const desc = CANONICAL_FIELDS.sectorNumber.description;
        assert.ok(!desc.includes('Sector/phase number'));
        assert.ok(desc.toLowerCase().includes('sector'));
    });

    await t.test('S1e: phaseCode exists as a canonical field distinct from sectorNumber', () => {
        assert.ok(CANONICAL_FIELDS.phaseCode, 'phaseCode must exist');
        assert.ok(CANONICAL_FIELDS.phaseCode.crm_mapping === 'authorityVerification.phaseCode');
        assert.ok(CANONICAL_FIELDS.phaseCode.description.toLowerCase().includes('phase'));
        assert.notEqual(CANONICAL_FIELDS.phaseCode.crm_mapping, CANONICAL_FIELDS.sectorNumber.crm_mapping,
            'phaseCode and sectorNumber must have different crm_mappings');
    });

    await t.test('S1e: blockCode exists as a canonical field', () => {
        assert.ok(CANONICAL_FIELDS.blockCode, 'blockCode must exist');
        assert.ok(CANONICAL_FIELDS.blockCode.crm_mapping === 'authorityVerification.blockCode');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 2: SOURCE FIELD MAPS COMPLETENESS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S2: Source maps — all three authorities present', () => {
        assert.ok(SOURCE_FIELD_MAPS.HSVP);
        assert.ok(SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD);
        assert.ok(SOURCE_FIELD_MAPS.GMADA);
    });

    await t.test('S2: Source maps — every map covers all canonical fields', () => {
        const canonicalKeys = Object.keys(CANONICAL_FIELDS);
        const excluded = ['verificationStatus', 'matchConfidence', 'matchStrategy',
            'verifiedAt', 'verifiedBy', 'source', 'rawSnapshotHash', 'snapshotContentHash'];
        const required = canonicalKeys.filter(k => !excluded.includes(k));
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const mapKeys = Object.keys(SOURCE_FIELD_MAPS[auth]);
            for (const key of required) {
                assert.ok(mapKeys.includes(key), `${auth} map missing canonical field: ${key}`);
            }
        }
    });

    await t.test('S2: Source maps — every mapping has valid evidence status', () => {
        const valid = Object.values(EVIDENCE_STATUS);
        for (const [auth, map] of Object.entries(SOURCE_FIELD_MAPS)) {
            for (const [field, m] of Object.entries(map)) {
                assert.ok(valid.includes(m.evidence), `${auth}.${field} invalid evidence: ${m.evidence}`);
            }
        }
    });

    await t.test('S2: Source maps — no invented selectors or endpoint URLs', () => {
        for (const [auth, map] of Object.entries(SOURCE_FIELD_MAPS)) {
            for (const [field, m] of Object.entries(map)) {
                if (m.sourceLabel) {
                    assert.ok(
                        !m.sourceLabel.startsWith('#') && !m.sourceLabel.startsWith('.') &&
                        !m.sourceLabel.startsWith('//') && !m.sourceLabel.includes('querySelector'),
                        `${auth}.${field} sourceLabel looks like a selector`);
                }
            }
        }
    });

    await t.test('S2b: phaseCode and blockCode present in all three source maps', () => {
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            assert.ok(SOURCE_FIELD_MAPS[auth].phaseCode, `${auth} missing phaseCode in source map`);
            assert.ok(SOURCE_FIELD_MAPS[auth].blockCode, `${auth} missing blockCode in source map`);
        }
    });

    await t.test('S2b: GMADA sectorNumber notes warn about ambiguous label', () => {
        const notes = SOURCE_FIELD_MAPS.GMADA.sectorNumber.notes;
        assert.ok(notes.includes('UNVERIFIED'), 'GMADA sectorNumber must note UNVERIFIED');
        assert.ok(notes.toLowerCase().includes('phase') || notes.toLowerCase().includes('ambiguous'),
            'GMADA sectorNumber must warn about sector/phase ambiguity');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 3: SENTINEL VALUES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S3: Sentinels — all sentinel types are distinguishable', () => {
        const types = [
            SENTINEL.FALSE, SENTINEL.NOT_RETURNED, SENTINEL.NOT_APPLICABLE,
            SENTINEL.PARSE_ERROR, SENTINEL.RESTRICTED, SENTINEL.UNKNOWN,
            SENTINEL.CATEGORICAL_STATUS, SENTINEL.NEEDS_REVIEW,
        ];
        const names = types.map(s => s._sentinel);
        assert.equal(new Set(names).size, names.length, 'Sentinel type names must be unique');
    });

    await t.test('S3: isSentinel correctly identifies sentinels', () => {
        assert.ok(isSentinel(SENTINEL.FALSE));
        assert.ok(isSentinel(SENTINEL.NOT_RETURNED));
        assert.ok(isSentinel(SENTINEL.CATEGORICAL_STATUS));
        assert.ok(isSentinel(SENTINEL.NEEDS_REVIEW));
        assert.ok(!isSentinel(null));
        assert.ok(!isSentinel(false));
        assert.ok(!isSentinel(0));
        assert.ok(!isSentinel(''));
        assert.ok(!isSentinel({}));
    });

    await t.test('S3: sentinelType returns correct type string', () => {
        assert.equal(sentinelType(SENTINEL.FALSE), 'FALSE');
        assert.equal(sentinelType(SENTINEL.NOT_RETURNED), 'NOT_RETURNED');
        assert.equal(sentinelType(SENTINEL.CATEGORICAL_STATUS), 'CATEGORICAL_STATUS');
        assert.equal(sentinelType(SENTINEL.NEEDS_REVIEW), 'NEEDS_REVIEW');
        assert.equal(sentinelType(null), null);
    });

    await t.test('S3b: CATEGORICAL_STATUS sentinel exists and is distinct from PARSE_ERROR', () => {
        assert.ok(SENTINEL.CATEGORICAL_STATUS);
        assert.notEqual(SENTINEL.CATEGORICAL_STATUS._sentinel, SENTINEL.PARSE_ERROR._sentinel);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 4: AREA PARSING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S4: Area parsing — all fixture variations', () => {
        for (const { raw, expected } of AREA_VARIATIONS) {
            const r = parseAreaString(raw);
            assert.equal(r.value, expected.value, `parseAreaString("${raw}") value`);
            assert.equal(r.unit, expected.unit, `parseAreaString("${raw}") unit`);
            assert.equal(r.mode, expected.mode, `parseAreaString("${raw}") mode`);
            if (expected.error) assert.equal(r.error, expected.error);
        }
    });

    await t.test('S4: no implicit unit conversion', () => {
        assert.equal(AREA_UNIT_REGISTRY.MARLA.sqftFactor, null);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 5: DATE PARSING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S5: Date parsing — all fixture variations', () => {
        for (const { raw, expected } of DATE_VARIATIONS) {
            const r = parseAuthorityDate(raw);
            if (expected.sentinel) {
                assert.equal(r.sentinel, expected.sentinel, `date("${raw}") sentinel`);
                assert.equal(r.date, null);
            } else {
                assert.ok(r.date instanceof Date, `date("${raw}") should be Date`);
                assert.equal(r.date.getUTCFullYear(), expected.year);
                assert.equal(r.date.getUTCMonth() + 1, expected.month);
                assert.equal(r.date.getUTCDate(), expected.day);
            }
        }
    });

    await t.test('S5: missing date never becomes epoch zero', () => {
        assert.equal(parseAuthorityDate(null).date, null);
        assert.equal(parseAuthorityDate(null).sentinel, 'NOT_RETURNED');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 6: BOOLEAN / STATUS NORMALIZATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S6: universal yes/no edge cases (16)', () => {
        assert.equal(BOOLEAN_EDGE_CASES.length, 16);
        for (const { raw, expected } of BOOLEAN_EDGE_CASES) {
            const r = normalizeBooleanStatus(raw);
            assert.equal(r.value, expected.value, `bool(${JSON.stringify(raw)}) value`);
            assert.equal(r.sentinel, expected.sentinel, `bool(${JSON.stringify(raw)}) sentinel`);
        }
    });

    await t.test('S6: missing never becomes false', () => {
        for (const v of [null, undefined, '']) {
            const r = normalizeBooleanStatus(v);
            assert.equal(r.value, null);
            assert.equal(r.sentinel, 'NOT_RETURNED');
        }
    });

    await t.test('S6: explicit No is false, not unknown', () => {
        const r = normalizeBooleanStatus('No');
        assert.equal(r.value, false);
        assert.equal(r.sentinel, null);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 6a: CATEGORICAL WORDS — must NOT resolve via universal boolean
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S6a: categorical words return PARSE_ERROR from universal normalizer', () => {
        for (const { raw, expected } of CATEGORICAL_WORDS_NOT_UNIVERSAL_BOOLEAN) {
            const r = normalizeBooleanStatus(raw);
            assert.equal(r.value, expected.value, `bool("${raw}") must be null`);
            assert.equal(r.sentinel, 'PARSE_ERROR', `bool("${raw}") must be PARSE_ERROR`);
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 6b: FIELD-SPECIFIC CATEGORICAL BOOLEAN (Phase 1.2)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S6b: categorical boolean by field — all fixture cases', () => {
        for (const { raw, field, expected, note } of CATEGORICAL_BOOLEAN_BY_FIELD) {
            const r = normalizeCategoricalBoolean(raw, field);
            assert.equal(r.value, expected.value,
                `catBool(${JSON.stringify(raw)}, "${field}") value: got ${r.value}, want ${expected.value}. ${note || ''}`);
            assert.equal(r.sentinel, expected.sentinel,
                `catBool(${JSON.stringify(raw)}, "${field}") sentinel: got ${r.sentinel}, want ${expected.sentinel}. ${note || ''}`);
        }
    });

    await t.test('S6b: Pending MUST NOT be coerced to false for buildingPlanApproved', () => {
        const r = normalizeCategoricalBoolean('Pending', 'buildingPlanApproved');
        assert.equal(r.value, null, 'Pending must not be false');
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    await t.test('S6b: Rejected MUST NOT be coerced to false for buildingPlanApproved', () => {
        const r = normalizeCategoricalBoolean('Rejected', 'buildingPlanApproved');
        assert.equal(r.value, null, 'Rejected must not be false');
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    await t.test('S6b: Pending MUST NOT be coerced to false for occupancyCertificate', () => {
        const r = normalizeCategoricalBoolean('Pending', 'occupancyCertificate');
        assert.equal(r.value, null);
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    await t.test('S6b: Under review MUST NOT be coerced to true or false', () => {
        for (const f of ['buildingPlanApproved', 'occupancyCertificate']) {
            const r = normalizeCategoricalBoolean('Under review', f);
            assert.equal(r.value, null, `Under review for ${f} must not be coerced`);
            assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 6c: LITIGATION / MORTGAGE NEGATIVE-PHRASING SAFETY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S6c: litigation/mortgage safety — all fixture cases', () => {
        for (const tc of LITIGATION_MORTGAGE_SAFETY) {
            const r = normalizeCategoricalBoolean(tc.raw, tc.field);
            assert.equal(r.value, tc.expectedValue,
                `catBool("${tc.raw}", "${tc.field}") value: got ${r.value}, want ${tc.expectedValue}. ${tc.note}`);
            assert.equal(r.sentinel, tc.expectedSentinel,
                `catBool("${tc.raw}", "${tc.field}") sentinel: got ${r.sentinel}, want ${tc.expectedSentinel}. ${tc.note}`);
        }
    });

    await t.test('S6c: "No pending court case" must be false (explicit negative)', () => {
        const r = normalizeCategoricalBoolean('No pending court case', 'litigationStatus');
        assert.equal(r.value, false);
        assert.equal(r.sentinel, null);
    });

    await t.test('S6c: "Court case pending" must NOT be true (observation only)', () => {
        const r = normalizeCategoricalBoolean('Court case pending', 'litigationStatus');
        assert.equal(r.value, null, '"Court case pending" must not become true');
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    await t.test('S6c: "Matter disposed" must NOT be true or false', () => {
        const r = normalizeCategoricalBoolean('Matter disposed', 'litigationStatus');
        assert.equal(r.value, null);
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    await t.test('S6d: "Not under mortgage" must be false (explicit negative)', () => {
        const r = normalizeCategoricalBoolean('Not under mortgage', 'mortgageStatus');
        assert.equal(r.value, false);
        assert.equal(r.sentinel, null);
    });

    await t.test('S6d: "Mortgage cleared" must be false (no current mortgage)', () => {
        const r = normalizeCategoricalBoolean('Mortgage cleared', 'mortgageStatus');
        assert.equal(r.value, false);
    });

    await t.test('S6d: "Under mortgage with SBI" must NOT become true via substring', () => {
        const r = normalizeCategoricalBoolean('Under mortgage with SBI', 'mortgageStatus');
        assert.equal(r.value, null, 'Descriptive text must not become true');
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    await t.test('S6d: "Loan not applicable" must NOT become true via substring', () => {
        const r = normalizeCategoricalBoolean('Loan not applicable', 'mortgageStatus');
        assert.equal(r.value, null, '"Loan" keyword in negated context must not become true');
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    await t.test('S6d: "Litigation pending in High Court" must NOT become true', () => {
        const r = normalizeCategoricalBoolean('Litigation pending in High Court', 'litigationStatus');
        assert.equal(r.value, null, 'Descriptive litigation text must not become true');
        assert.equal(r.sentinel, 'CATEGORICAL_STATUS');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 7: CURRENCY PARSING
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S7: currency — all fixtures with sentinel', () => {
        for (const { raw, expected } of CURRENCY_VARIATIONS) {
            const r = parseCurrencyAmount(raw);
            assert.equal(r.value, expected.value, `currency(${JSON.stringify(raw)}) value`);
            assert.equal(r.sentinel, expected.sentinel, `currency(${JSON.stringify(raw)}) sentinel`);
            assert.equal(r.currency, 'INR');
        }
    });

    await t.test('S7: zero is distinct from missing', () => {
        const z = parseCurrencyAmount('Rs. 0');
        assert.equal(z.value, 0);
        assert.equal(z.sentinel, null);
        const m = parseCurrencyAmount(null);
        assert.equal(m.value, null);
        assert.equal(m.sentinel, 'NOT_RETURNED');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 8: PROPERTY ID / SECTOR / PHASE NORMALIZATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S8: property ID — all fixtures', () => {
        for (const { raw, expected } of PROPERTY_ID_NORMALIZATION) {
            assert.equal(normalizePropertyId(raw).normalized, expected);
        }
    });

    await t.test('S8: sector — all fixtures (8 cases)', () => {
        assert.equal(SECTOR_NORMALIZATION.length, 8);
        for (const { raw, expected } of SECTOR_NORMALIZATION) {
            assert.equal(normalizeSectorNumber(raw).normalized, expected);
        }
    });

    await t.test('S8: "Phase XI" NOT stripped by normalizeSectorNumber', () => {
        assert.equal(normalizeSectorNumber('Phase XI').normalized, 'PHASE XI');
    });

    await t.test('S8a: phase — all fixtures (7 cases)', () => {
        assert.equal(PHASE_NORMALIZATION.length, 7);
        for (const { raw, expected } of PHASE_NORMALIZATION) {
            assert.equal(normalizePhaseCode(raw).normalized, expected);
        }
    });

    await t.test('S8a: "Sector 14" NOT stripped by normalizePhaseCode', () => {
        assert.equal(normalizePhaseCode('Sector 14').normalized, 'SECTOR 14');
    });

    await t.test('S8b: location classification — all fixtures', () => {
        for (const { raw, expectedType, expectedNormalized } of LOCATION_CLASSIFICATION) {
            const r = classifyLocationComponent(raw);
            assert.equal(r.type, expectedType, `classify("${raw}") type`);
            assert.equal(r.normalized, expectedNormalized, `classify("${raw}") normalized`);
        }
    });

    await t.test('S8c: Sector XI and Phase XI must not be conflated', () => {
        const s = classifyLocationComponent('Sector XI');
        const p = classifyLocationComponent('Phase XI');
        assert.equal(s.type, 'sector');
        assert.equal(p.type, 'phase');
        assert.notEqual(s.type, p.type);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 9: COMPOSITE KEY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S9: duplicate property IDs produce unique keys', () => {
        const keys = new Set();
        for (const rec of DUPLICATE_PROPERTY_IDS.records) {
            const r = buildCompositeKey(rec.authority, rec.sector, rec.propertyId, rec.urbanEstate, rec.phase);
            assert.ok(r.key, `Key null for ${JSON.stringify(rec)}`);
            keys.add(r.key);
        }
        assert.equal(keys.size, DUPLICATE_PROPERTY_IDS.expectedUniqueKeys);
    });

    await t.test('S9: incomplete input returns INCOMPLETE_KEY', () => {
        assert.equal(buildCompositeKey('', '14', '1234').error, 'INCOMPLETE_KEY');
        assert.equal(buildCompositeKey('HSVP', '14', '').error, 'INCOMPLETE_KEY');
    });

    await t.test('S9: parts is an object with named components including phase', () => {
        const r = buildCompositeKey('HSVP', 'Sector 14', '1234', 'Kurukshetra', 'Phase-II');
        assert.ok(r.parts);
        assert.ok('authority' in r.parts);
        assert.ok('phase' in r.parts);
        assert.ok('propertyId' in r.parts);
    });

    await t.test('S9a: ambiguous key cases — all fixtures', () => {
        for (const { description, input, expectedError } of AMBIGUOUS_KEY_CASES) {
            const r = buildCompositeKey(input.authority, input.sector, input.propertyId, input.urbanEstate, input.phase);
            if (expectedError) {
                assert.equal(r.key, null, `${description}: key should be null`);
                assert.equal(r.error, expectedError, `${description}: error should be ${expectedError}`);
            } else {
                assert.ok(r.key, `${description}: key should be non-null`);
                assert.equal(r.error, null);
            }
        }
    });

    await t.test('S9a: HSVP without urbanEstate is AMBIGUOUS', () => {
        const r = buildCompositeKey('HSVP', 'Sector 14', '1234', null);
        assert.equal(r.error, 'AMBIGUOUS');
        assert.ok(r.missingComponents.includes('urbanEstate'));
    });

    await t.test('S9a: authority identity requirements declared per authority', () => {
        assert.ok(AUTHORITY_IDENTITY_REQUIREMENTS.HSVP.required.includes('urbanEstate'));
        assert.ok(AUTHORITY_IDENTITY_REQUIREMENTS.ESTATE_OFFICE_CHD);
        assert.ok(AUTHORITY_IDENTITY_REQUIREMENTS.GMADA);
    });

    await t.test('S9b: same propertyId across different phases produces different keys', () => {
        const keys = new Set();
        for (const rec of PHASE_COLLISION_CASES.records) {
            const r = buildCompositeKey(rec.authority, rec.sector, rec.propertyId, rec.urbanEstate, rec.phase);
            assert.ok(r.key, `Key null for ${JSON.stringify(rec)}`);
            keys.add(r.key);
        }
        assert.equal(keys.size, PHASE_COLLISION_CASES.expectedUniqueKeys,
            `Phase-distinct records must produce ${PHASE_COLLISION_CASES.expectedUniqueKeys} unique keys`);
    });

    await t.test('S9c: phaseCode participates in key but does not substitute for sectorNumber', () => {
        // Same authority+sector+property but different phase → different keys
        const k1 = buildCompositeKey('GMADA', '66A', '1234', null, 'Phase-I');
        const k2 = buildCompositeKey('GMADA', '66A', '1234', null, 'Phase-II');
        assert.ok(k1.key);
        assert.ok(k2.key);
        assert.notEqual(k1.key, k2.key, 'Different phases must produce different keys');

        // Phase does not fill in for missing sector
        const k3 = buildCompositeKey('GMADA', '', '1234', null, 'Phase-I');
        assert.equal(k3.error, 'AMBIGUOUS', 'Phase alone cannot satisfy sectorNumber requirement');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 10: FULL RECORD — HSVP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S10: HSVP happy path', () => {
        const { error, record } = normalizeAuthorityRecord('HSVP', HSVP_FIXTURES.HAPPY_PATH.rawData, SOURCE_FIELD_MAPS.HSVP);
        assert.equal(error, null);
        assert.equal(record.authority, 'HSVP');
        assert.equal(record.propertyId.normalized, '1234');
        assert.equal(record.sectorNumber.normalized, '14');
        assert.equal(record.area.value, 10);
        assert.equal(record.area.unit, 'MARLA');
        assert.equal(record.allotmentMode, 'Allotment');
        assert.equal(record.authorityStatus, 'Allotted');
        assert.equal(record.allotmentPrice.value, 1250000);
        assert.ok(record.allotmentDate.date instanceof Date);
        // Boolean: No → false
        assert.equal(record.litigationStatus.value, false);
        assert.equal(record.mortgageStatus.value, false);
        // Categorical: Approved → true
        assert.equal(record.buildingPlanApproved.value, true);
        // Categorical: Not Issued → false
        assert.equal(record.occupancyCertificate.value, false);
    });

    await t.test('S10: HSVP partial → sentinels', () => {
        const { record } = normalizeAuthorityRecord('HSVP', HSVP_FIXTURES.PARTIAL.rawData, SOURCE_FIELD_MAPS.HSVP);
        for (const field of HSVP_FIXTURES.PARTIAL.expectedSentinels) {
            const val = record[field];
            assert.ok(val !== undefined, `${field} missing`);
            const hasSentinel = isSentinel(val) ||
                (typeof val === 'object' && val !== null && (val.sentinel === 'NOT_RETURNED' || val._sentinel === 'NOT_RETURNED'));
            assert.ok(hasSentinel, `${field} should be NOT_RETURNED, got: ${JSON.stringify(val)}`);
        }
    });

    await t.test('S10: HSVP empty result', () => {
        const { record } = normalizeAuthorityRecord('HSVP', {}, SOURCE_FIELD_MAPS.HSVP);
        assert.ok(record);
        assert.equal(record.authority, 'HSVP');
    });

    await t.test('S10: HSVP masked fields', () => {
        const { record } = normalizeAuthorityRecord('HSVP', HSVP_FIXTURES.MASKED.rawData, SOURCE_FIELD_MAPS.HSVP);
        assert.equal(record.allotteeName, '****');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 11: ESTATE OFFICE CHD
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S11: CHD happy path', () => {
        const { error, record } = normalizeAuthorityRecord(
            'ESTATE_OFFICE_CHD', ESTATE_OFFICE_CHD_FIXTURES.HAPPY_PATH.rawData, SOURCE_FIELD_MAPS.ESTATE_OFFICE_CHD
        );
        assert.equal(error, null);
        assert.equal(record.authority, 'ESTATE_OFFICE_CHD');
        assert.equal(record.area.value, 500);
        assert.equal(record.area.unit, 'SQ_YARD');
        assert.equal(record.allotmentMode, 'Auction');
        assert.equal(record.mortgageStatus.value, true); // "Yes" → true
        assert.equal(record.occupancyCertificate.value, true); // "Issued" → true
        assert.equal(record.allotmentPrice.value, 4500000);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 12: GMADA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S12: GMADA happy path', () => {
        const { error, record } = normalizeAuthorityRecord(
            'GMADA', GMADA_FIXTURES.HAPPY_PATH.rawData, SOURCE_FIELD_MAPS.GMADA
        );
        assert.equal(error, null);
        assert.equal(record.authority, 'GMADA');
        assert.equal(record.area.value, 300);
        assert.equal(record.area.unit, 'SQ_YARD');
        assert.equal(record.allotmentMode, 'eAuction');
        assert.equal(record.allotmentPrice.value, 3550000);
        assert.equal(record.currentDues.value, 500000);
        // Building plan "Not Applied" → false
        assert.equal(record.buildingPlanApproved.value, false);
    });

    await t.test('S12: GMADA sectorNumber with "Sector 66A" classified as sector', () => {
        const { record } = normalizeAuthorityRecord(
            'GMADA', GMADA_FIXTURES.HAPPY_PATH.rawData, SOURCE_FIELD_MAPS.GMADA
        );
        // "Sector 66A" starts with "Sector" prefix → classified as sector
        assert.ok(record.sectorNumber);
        assert.equal(record.sectorNumber.normalized, '66A');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 13: SOURCE POLICY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S13: all sources disabled', () => {
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const p = SOURCE_POLICY_MATRIX[auth];
            assert.equal(p.isEnabled, false);
            assert.equal(p.permissionStatus, PERMISSION_STATUS.NOT_OBTAINED);
        }
    });

    await t.test('S13: isSourceActivated returns false for all', () => {
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            assert.equal(isSourceActivated(auth).allowed, false);
        }
    });

    await t.test('S13: unknown authority returns false', () => {
        const r = isSourceActivated('FICTIONAL');
        assert.equal(r.allowed, false);
    });

    await t.test('S13: no rate limits guessed', () => {
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const p = SOURCE_POLICY_MATRIX[auth];
            assert.equal(p.maxRequestsPerMinute, null);
            assert.equal(p.maxRequestsPerDay, null);
            assert.equal(p.maxConcurrentRequests, null);
        }
    });

    await t.test('S13: scheduling disabled', () => {
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            assert.equal(SOURCE_POLICY_MATRIX[auth].schedulingEnabled, false);
        }
    });

    await t.test('S13: activation checklists all MISSING', () => {
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            for (const item of SOURCE_POLICY_MATRIX[auth].activationChecklist) {
                assert.equal(item.status, 'MISSING');
            }
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 14: AUTHORITY REGISTRY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S14: all three authorities in registry', () => {
        for (const auth of ['HSVP', 'ESTATE_OFFICE_CHD', 'GMADA']) {
            const e = AUTHORITY_REGISTRY[auth];
            assert.ok(e);
            assert.equal(e.id, auth);
            assert.ok(e.fullName);
            assert.equal(e.permissionStatus, 'NOT_OBTAINED');
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SECTION 15: SECURITY INVARIANTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await t.test('S15: no credentials in fixtures', () => {
        const pat = /\bcookie[s]?\b|session_?id|csrf_?token|password|secret_?key|Bearer\s/i;
        const raw = JSON.stringify([
            ...Object.values(HSVP_FIXTURES).map(f => f.rawData),
            ...Object.values(ESTATE_OFFICE_CHD_FIXTURES).map(f => f.rawData),
            ...Object.values(GMADA_FIXTURES).map(f => f.rawData),
        ].filter(Boolean));
        assert.ok(!pat.test(raw));
    });

    await t.test('S15: no real PII in fixtures', () => {
        const pat = /\b\d{10}\b|\b\d{12}\b|@.*\.com|@.*\.in/;
        const s = JSON.stringify({ ...HSVP_FIXTURES, ...ESTATE_OFFICE_CHD_FIXTURES, ...GMADA_FIXTURES });
        assert.ok(!pat.test(s));
    });

    await t.test('S15: normalizeAuthorityRecord rejects null', () => {
        assert.equal(normalizeAuthorityRecord('HSVP', null, SOURCE_FIELD_MAPS.HSVP).error, 'INVALID_INPUT');
        assert.equal(normalizeAuthorityRecord('HSVP', undefined, SOURCE_FIELD_MAPS.HSVP).error, 'INVALID_INPUT');
    });
});
