/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — PHASE 3A FIXTURE ADAPTER TEST SUITE
 * ============================================================================
 * 
 *  Verifies isolated fixture adapter contracts for:
 *    - HSVP
 *    - Chandigarh Estate Office (CHD)
 *    - GMADA
 * 
 *  Enforces:
 *    - Synthetic fixture parsing and canonical normalization
 *    - Zero outbound network activity (prohibited methods + import inspection)
 *    - Source disabled gates (authorizationStatus: NOT_OBTAINED)
 *    - Categorical litigation / mortgage preservation & sentinel protection
 *    - Verification candidate assembly without Inventory / Role / Contact mutations
 *    - Human-review requirement and failure isolation
 * 
 *  Run: node --test tests/phase3a_fixture_adapters.test.js
 * 
 *  @version 3.0.0-phase3a
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import BaseFixtureAdapter from '../services/authority/BaseFixtureAdapter.js';
import HsvpFixtureAdapter from '../services/authority/HsvpFixtureAdapter.js';
import ChandigarhFixtureAdapter from '../services/authority/ChandigarhFixtureAdapter.js';
import GmadaFixtureAdapter from '../services/authority/GmadaFixtureAdapter.js';
import {
    getAdapter,
    getAllAdapters,
    isKnownAuthority,
    executeFixturePipeline,
    executeLiveVerification
} from '../services/authority/adapterRegistry.js';
import {
    HSVP_SYNTHETIC,
    CHD_SYNTHETIC,
    GMADA_SYNTHETIC
} from '../services/authority/fixtures/syntheticPhase3AFixtures.js';
import Inventory from '../models/Inventory.js';
import Role from '../models/Role.js';

let mongod;

before(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
});

after(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongod) {
        await mongod.stop();
    }
});

describe('--- PHASE 3A: FIXTURE-ONLY ADAPTER CONTRACTS ---', () => {

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. Adapter Interface & Registry Fail-Closed Gate
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('1. Registry: Resolves known adapters, fails closed on unknown authority codes', () => {
        const hsvp = getAdapter('HSVP');
        const chd = getAdapter('CHD');
        const gmada = getAdapter('GMADA');

        assert.ok(hsvp instanceof HsvpFixtureAdapter);
        assert.ok(chd instanceof ChandigarhFixtureAdapter);
        assert.ok(gmada instanceof GmadaFixtureAdapter);

        assert.strictEqual(hsvp.getAuthorityCode(), 'HSVP');
        assert.strictEqual(chd.getAuthorityCode(), 'CHD');
        assert.strictEqual(gmada.getAuthorityCode(), 'GMADA');

        // Case insensitivity
        assert.ok(getAdapter('hsvp') instanceof HsvpFixtureAdapter);
        assert.ok(getAdapter('chd') instanceof ChandigarhFixtureAdapter);
        assert.ok(getAdapter('gmada') instanceof GmadaFixtureAdapter);

        // Fail closed on unknown authority code
        assert.throws(
            () => getAdapter('DDA'),
            /UNKNOWN_AUTHORITY/
        );
        assert.throws(
            () => getAdapter(''),
            /UNKNOWN_AUTHORITY/
        );
        assert.throws(
            () => getAdapter(null),
            /UNKNOWN_AUTHORITY/
        );

        // isKnownAuthority
        assert.strictEqual(isKnownAuthority('HSVP'), true);
        assert.strictEqual(isKnownAuthority('CHD'), true);
        assert.strictEqual(isKnownAuthority('GMADA'), true);
        assert.strictEqual(isKnownAuthority('UNKNOWN_AUTH'), false);

        // Base class directly rejects unknown authority in constructor
        assert.throws(
            () => new BaseFixtureAdapter('INVALID_CODE', 'Invalid Authority'),
            /UNKNOWN_AUTHORITY/
        );

        // getAllAdapters returns exactly 3 adapters
        const all = getAllAdapters();
        assert.strictEqual(all.length, 3);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. Strict Source-Disabled Boundary & Network Call Prohibitions
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('2. Boundary: Sources remain strictly disabled and live calls throw fatal errors', async () => {
        const adapters = getAllAdapters();

        for (const adapter of adapters) {
            // Must report source is NOT activated
            assert.strictEqual(adapter.isSourceActivated(), false, `${adapter.getAuthorityCode()} must be disabled`);

            // Live fetch must throw fatal error
            await assert.rejects(
                () => adapter.fetchLive(),
                /NETWORK_PROHIBITED/
            );

            // Scraper must throw fatal error
            await assert.rejects(
                () => adapter.scrapePortal(),
                /SCRAPER_PROHIBITED/
            );
        }

        // Registry executeLiveVerification throws SOURCE_DISABLED error
        assert.throws(
            () => executeLiveVerification('HSVP', { propertyId: '101' }),
            /SOURCE_DISABLED/
        );
    });

    test('3. Architecture Gate: Adapter source files contain ZERO outbound networking imports', () => {
        const adapterFiles = [
            'BaseFixtureAdapter.js',
            'HsvpFixtureAdapter.js',
            'ChandigarhFixtureAdapter.js',
            'GmadaFixtureAdapter.js',
            'adapterRegistry.js'
        ];

        const forbiddenModules = [
            'http', 'https', 'node-fetch', 'axios', 'request',
            'puppeteer', 'playwright', 'child_process', 'net', 'dgram', 'tls'
        ];

        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        const authorityDir = path.resolve(currentDir, '../services/authority');

        for (const fileName of adapterFiles) {
            const filePath = path.join(authorityDir, fileName);
            assert.ok(fs.existsSync(filePath), `File exists: ${fileName}`);
            const content = fs.readFileSync(filePath, 'utf8');

            for (const mod of forbiddenModules) {
                const importPattern = new RegExp(`(?:import|require)\\s*.*['"]${mod}['"]`, 'i');
                assert.strictEqual(
                    importPattern.test(content),
                    false,
                    `File ${fileName} must NOT import forbidden networking module "${mod}"`
                );
            }
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. Validation, Sanitization & PII Scrubbing
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('4. Validation: Strips credentials, network configs, PII, and sanitizes script injection', () => {
        const adapter = getAdapter('HSVP');

        // 1. Non-object rejection
        const invalid1 = adapter.validateFixture(null);
        assert.strictEqual(invalid1.isValid, false);
        assert.ok(invalid1.errors[0].includes('non-null plain Object'));

        const invalid2 = adapter.validateFixture(['array', 'not', 'allowed']);
        assert.strictEqual(invalid2.isValid, false);

        // 2. Sanitization of network directives, credentials, PII, and scripts
        const dirtyFixture = {
            'Property No.': '101<script>alert("hack")</script>',
            'Remarks': 'General notes<script>alert("hack")</script>',
            'Sector': 'Sector 14',
            'Urban Estate': 'Urban Estate Panchkula',
            'url': 'https://outbound-target.local',
            'endpoint': '/api/scrape',
            'apiKey': 'secret_key_12345',
            'password': 'compromised_password',
            'allotteeName': 'Confidential Citizen Name',
            'aadhaar': '1234-5678-9012',
            'pan': 'ABCDE1234F',
            'Outstanding Dues': 'Rs. 0'
        };

        const result = adapter.validateFixture(dirtyFixture);
        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.errors.length, 0);

        // General remarks string has script sanitized
        assert.strictEqual(result.sanitizedData['Remarks'], 'General notes');

        // Identifier is rejected rather than silently transformed to '101'
        assert.strictEqual(result.sanitizedData['Property No.'].isRejected, true);
        assert.strictEqual(result.sanitizedData['Property No.'].error, 'MALFORMED_IDENTIFIER');

        // Network parameters stripped
        assert.strictEqual(result.sanitizedData.url, undefined);
        assert.strictEqual(result.sanitizedData.endpoint, undefined);

        // Credentials stripped
        assert.strictEqual(result.sanitizedData.apiKey, undefined);
        assert.strictEqual(result.sanitizedData.password, undefined);

        // PII scrubbed
        assert.strictEqual(result.sanitizedData.allotteeName, undefined);
        assert.strictEqual(result.sanitizedData.aadhaar, undefined);
        assert.strictEqual(result.sanitizedData.pan, undefined);

        // Warnings recorded for each stripping and rejection
        assert.ok(result.warnings.some(w => w.includes('script/HTML injection sanitized')));
        assert.ok(result.warnings.some(w => w.includes('Malformed identifier rejected')));
        assert.ok(result.warnings.some(w => w.includes('Forbidden network parameter stripped')));
        assert.ok(result.warnings.some(w => w.includes('Credential parameter stripped')));
        assert.ok(result.warnings.some(w => w.includes('Personal information parameter scrubbed')));
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. HSVP Fixture Adapter Contract Tests
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('5. HSVP: Valid structured fixture normalization, composite key and hash determinism', () => {
        const adapter = getAdapter('HSVP');

        // Valid structured
        const val = adapter.validateFixture(HSVP_SYNTHETIC.VALID_STRUCTURED.rawData);
        assert.strictEqual(val.isValid, true);

        const parsed = adapter.parseFixture(val.sanitizedData);
        const norm = adapter.normalizeRecord(parsed);

        assert.strictEqual(norm.authority, 'HSVP');
        assert.strictEqual(norm.propertyId.normalized, '101');
        assert.strictEqual(norm.sectorNumber.normalized, '14');
        assert.strictEqual(norm.sectorNumber.raw, 'Sector 14');
        assert.strictEqual(norm.urbanEstate, 'Urban Estate Panchkula');
        assert.strictEqual(norm.duesStatus, 'CLEAR');
        assert.strictEqual(norm.litigationStatus.controlledString, 'NO_LITIGATION');
        assert.strictEqual(norm.mortgageStatus.controlledString, 'NO_MORTGAGE');
        assert.strictEqual(norm.buildingPlanApproved.value, true);
        assert.strictEqual(norm.occupancyCertificate.value, false);

        // Composite key must be COMPLETE (HSVP:URBAN_ESTATE:SECTOR:PHASE:PROP_ID)
        assert.strictEqual(norm._compositeKey.key, 'HSVP:PANCHKULA:14::101');

        // Content hash must be 64-char sha256 hex
        assert.strictEqual(typeof norm._contentHash, 'string');
        assert.strictEqual(norm._contentHash.length, 64);

        // Hash determinism: re-running normalization produces identical hash
        const norm2 = adapter.normalizeRecord(parsed);
        assert.strictEqual(norm._contentHash, norm2._contentHash);
    });

    test('6. HSVP: Ambiguous composite key when Urban Estate is missing', () => {
        const adapter = getAdapter('HSVP');
        const val = adapter.validateFixture(HSVP_SYNTHETIC.MISSING_URBAN_ESTATE_AMBIGUOUS.rawData);
        const parsed = adapter.parseFixture(val.sanitizedData);
        const norm = adapter.normalizeRecord(parsed);

        // Missing urban estate in HSVP causes AMBIGUOUS error in composite key
        assert.strictEqual(norm._compositeKey.error, 'AMBIGUOUS');
        assert.strictEqual(norm._compositeKey.key, null);
    });

    test('7. HSVP: Contradictory dates and categorical observations generate quality warnings', () => {
        // Contradictory dates
        const candDates = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.CONTRADICTORY_DATES.rawData);
        assert.ok(
            candDates.dataQualityWarnings.some(w => w.includes('Contradictory dates: possessionDate occurs prior to allotmentDate')),
            'Must flag possession prior to allotment date'
        );

        // Categorical litigation observation
        const candLit = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.CATEGORICAL_LITIGATION_OBSERVATION.rawData);
        assert.ok(
            candLit.dataQualityWarnings.some(w => w.includes('Categorical litigation observation present')),
            'Must flag categorical litigation observation'
        );
        assert.strictEqual(
            candLit.normalizedFacts.litigationStatus.controlledString,
            'CWP 4567/2022 pending before High Court of Punjab & Haryana'
        );

        // Categorical mortgage observation
        const candMort = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.CATEGORICAL_MORTGAGE_OBSERVATION.rawData);
        assert.ok(
            candMort.dataQualityWarnings.some(w => w.includes('Categorical mortgage observation present')),
            'Must flag categorical mortgage observation'
        );
        assert.strictEqual(
            candMort.normalizedFacts.mortgageStatus.controlledString,
            'Under mortgage with State Bank of India Sector 14 Panchkula'
        );
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. Chandigarh Estate Office (CHD) Fixture Adapter Contract Tests
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('8. CHD: Freehold vs. Leasehold tenure and ground rent status derivation', () => {
        // Freehold property
        const candFreehold = executeFixturePipeline('CHD', CHD_SYNTHETIC.VALID_FREEHOLD_STRUCTURED.rawData);
        assert.strictEqual(candFreehold.authorityCode, 'CHD');
        assert.strictEqual(candFreehold.normalizedFacts.allotmentMode, 'Auction Freehold');
        assert.strictEqual(candFreehold.normalizedFacts.leaseRentStatus, 'NOT_APPLICABLE');
        assert.strictEqual(candFreehold.normalizedFacts.duesStatus, 'CLEAR');
        assert.strictEqual(candFreehold.compositeKey, 'CHD::22-B::CHD/2021/R-202');

        // Leasehold property with ground rent
        const candLeasehold = executeFixturePipeline('CHD', CHD_SYNTHETIC.VALID_LEASEHOLD_WITH_GROUND_RENT.rawData);
        assert.strictEqual(candLeasehold.normalizedFacts.duesStatus, 'PENDING');
        assert.strictEqual(candLeasehold.normalizedFacts.leaseRentStatus, 'UNKNOWN'); // General status never infers paid
    });

    test('9. CHD: Explicit negative court case and categorical observation handling', () => {
        // Explicit negative court case
        const candNeg = executeFixturePipeline('CHD', CHD_SYNTHETIC.EXPLICIT_NEGATIVE_COURT_CASE.rawData);
        assert.strictEqual(candNeg.normalizedFacts.litigationStatus.controlledString, 'NO_LITIGATION');
        assert.strictEqual(candNeg.normalizedFacts.mortgageStatus.controlledString, 'NO_MORTGAGE');

        // Categorical court case observation
        const candCat = executeFixturePipeline('CHD', CHD_SYNTHETIC.CATEGORICAL_COURT_CASE_OBSERVATION.rawData);
        assert.strictEqual(
            candCat.normalizedFacts.litigationStatus.controlledString,
            'Civil Suit No. 89/2021 pending before Court of Civil Judge Senior Division Chandigarh'
        );
        assert.ok(candCat.dataQualityWarnings.some(w => w.includes('Categorical litigation observation present')));
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. GMADA Fixture Adapter Contract Tests
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('10. GMADA: Disambiguates Sector vs. Phase from combined location labels', () => {
        // Sector 66A IT City
        const candSector = executeFixturePipeline('GMADA', GMADA_SYNTHETIC.VALID_IT_CITY_SECTOR_66A.rawData);
        assert.strictEqual(candSector.normalizedFacts.sectorNumber.normalized, '66A');
        assert.strictEqual(candSector.normalizedFacts.sectorNumber.raw, 'Sector 66A');
        assert.strictEqual(candSector.compositeKey, 'GMADA::66A::GMADA/MOH/2021/P-303');

        // Aerocity Phase 2
        const candPhase = executeFixturePipeline('GMADA', GMADA_SYNTHETIC.VALID_AEROCITY_PHASE.rawData);
        assert.strictEqual(candPhase.normalizedFacts.phaseCode.normalized, '2');

        // Ambiguous Sector / Phase string
        const candAmbiguous = executeFixturePipeline('GMADA', GMADA_SYNTHETIC.AMBIGUOUS_SECTOR_PHASE.rawData);
        assert.ok(
            candAmbiguous.dataQualityWarnings.some(w => w.includes('Ambiguous GMADA location string') || w.includes('Missing sector coordinate')),
            'Should warn on combined ambiguous location label'
        );
    });

    test('11. GMADA: Partial identity without plot number triggers quality rejection', () => {
        const candMissing = executeFixturePipeline('GMADA', GMADA_SYNTHETIC.MISSING_IDENTITY_PARTIAL.rawData);
        assert.strictEqual(candMissing.status, 'REJECTED_QUALITY');
        assert.ok(candMissing.dataQualityWarnings.some(w => w.includes('Missing property identifier')));
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7. Verification Candidate Assembly & Comparison Engine
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('12. Candidate Engine: Matching evidence, proposed changes, and sentinel overwrite protection', () => {
        const adapter = getAdapter('HSVP');

        // Synthetic CRM Inventory Context
        const inventoryContext = {
            _id: new mongoose.Types.ObjectId(),
            propertyId: '101',
            sectorNumber: 'Sector 14',
            authorityVerification: {
                propertyId: '101',
                sectorNumber: 'Sector 14',
                duesStatus: 'PENDING',
                litigationStatus: 'NO_LITIGATION'
            }
        };

        const val = adapter.validateFixture(HSVP_SYNTHETIC.VALID_STRUCTURED.rawData);
        const parsed = adapter.parseFixture(val.sanitizedData);
        const norm = adapter.normalizeRecord(parsed);

        const candidate = adapter.buildVerificationCandidate(norm, inventoryContext);

        // Match Evidence
        assert.strictEqual(candidate.matchEvidence.confidence, 'EXACT');
        assert.deepStrictEqual(candidate.matchEvidence.matchedFields, ['propertyId', 'sectorNumber']);
        assert.strictEqual(candidate.matchEvidence.conflictingFields.length, 0);

        // Proposed Changes
        const duesChange = candidate.proposedChanges.find(c => c.field === 'authorityVerification.duesStatus');
        assert.ok(duesChange, 'Must have proposed change for duesStatus');
        assert.strictEqual(duesChange.currentCrmValue, 'PENDING');
        assert.strictEqual(duesChange.proposedAuthorityValue, 'CLEAR');
        assert.strictEqual(duesChange.action, 'PROPOSED_UPDATE');

        const litigationChange = candidate.proposedChanges.find(c => c.field === 'authorityVerification.litigationStatus');
        assert.ok(litigationChange);
        assert.strictEqual(litigationChange.action, 'NOOP'); // Both are NO_LITIGATION

        // SENTINEL OVERWRITE PROTECTION:
        // When authority fact is missing / sentinel, action MUST be REJECT_SENTINEL
        const transferDateChange = candidate.proposedChanges.find(c => c.field === 'authorityVerification.transferDate');
        assert.ok(transferDateChange);
        assert.strictEqual(transferDateChange.action, 'REJECT_SENTINEL');
        assert.ok(transferDateChange.rationale.includes('MUST NEVER overwrite CRM inventory'));

        // Governance assertions
        assert.strictEqual(candidate.requiresHumanReview, true, 'Must always require human review');
        assert.strictEqual(candidate.isApplied, false, 'Candidate must never be applied automatically');
        assert.strictEqual(candidate.status, 'READY_FOR_REVIEW');
    });

    test('13. Candidate Engine: Conflicting sector coordinate flags AMBIGUOUS/CONFLICT', () => {
        const adapter = getAdapter('HSVP');

        // CRM Inventory context has Sector 4, while fixture has Sector 14
        const conflictingInventory = {
            _id: new mongoose.Types.ObjectId(),
            propertyId: '101',
            sectorNumber: 'Sector 4'
        };

        const val = adapter.validateFixture(HSVP_SYNTHETIC.VALID_STRUCTURED.rawData);
        const parsed = adapter.parseFixture(val.sanitizedData);
        const norm = adapter.normalizeRecord(parsed);

        const candidate = adapter.buildVerificationCandidate(norm, conflictingInventory);

        assert.strictEqual(candidate.matchEvidence.confidence, 'CONFLICT');
        assert.deepStrictEqual(candidate.matchEvidence.conflictingFields, ['sectorNumber']);
        assert.strictEqual(candidate.status, 'FLAGGED_AMBIGUOUS');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 8. Zero Mutation Invariant: No CRM Documents Created or Altered
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('14. Zero Mutation: Adapter execution does NOT create or mutate any Inventory or Role document', async () => {
        // Pre-count documents in database
        const inventoryCountBefore = await Inventory.countDocuments();
        const roleCountBefore = await Role.countDocuments();

        // Run all three adapters through multiple fixtures
        executeFixturePipeline('HSVP', HSVP_SYNTHETIC.VALID_STRUCTURED.rawData);
        executeFixturePipeline('CHD', CHD_SYNTHETIC.VALID_FREEHOLD_STRUCTURED.rawData);
        executeFixturePipeline('GMADA', GMADA_SYNTHETIC.VALID_IT_CITY_SECTOR_66A.rawData);
        executeFixturePipeline('HSVP', HSVP_SYNTHETIC.SECURITY_INJECTION_ATTEMPT.rawData);

        // Post-count documents in database
        const inventoryCountAfter = await Inventory.countDocuments();
        const roleCountAfter = await Role.countDocuments();

        assert.strictEqual(inventoryCountBefore, inventoryCountAfter, 'Inventory count must not change');
        assert.strictEqual(roleCountBefore, roleCountAfter, 'Role count must not change');
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 9. Failure Isolation: Malformed Fixtures Do Not Pollute Subsequent Runs
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    test('15. Failure Isolation: Malformed fixture produces safe error without breaking adapter state', () => {
        // 1. Execute completely malformed fixture
        const malformedCand = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.MALFORMED_TYPES.rawData);
        assert.ok(malformedCand);
        assert.ok(malformedCand.dataQualityWarnings.length > 0);

        // 2. Immediately execute valid structured fixture on same adapter
        const validCand = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.VALID_STRUCTURED.rawData);
        assert.strictEqual(validCand.status, 'READY_FOR_REVIEW');
        assert.strictEqual(validCand.compositeKey, 'HSVP:PANCHKULA:14::101');
        assert.strictEqual(validCand.normalizedFacts.propertyId.normalized, '101');
    });
});
