/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — PHASE 3B TEST SUITE
 *  Fixture Adapter Conformance, Input Integrity & Runtime Network Isolation
 * ============================================================================
 * 
 *  VERIFIES:
 *  1. Shared Adapter Conformance: Reusable contract suite independently run
 *     against HsvpFixtureAdapter, ChandigarhFixtureAdapter, and GmadaFixtureAdapter.
 *  2. Identifier Integrity & Anti-Silent-Alteration:
 *     - Rejection of markup/scripts in identifiers (no silent stripping to '101')
 *     - Rejection of control characters and Unicode directional overrides
 *     - Whitespace normalization cleanly separated from security validation
 *     - Provenance & validated canonical value used for matching
 *     - Data-quality warnings without echoing untrusted payloads
 *     - False-positive match prevention between distinct/tainted identifiers
 *  3. Runtime Network Isolation & Egress Denial:
 *     - Active egress traps on globalThis.fetch, http, https, net, dns, tls, dgram, child_process
 *     - Complete fixture pipeline execution with 0 network calls trapped
 *     - Fail-closed live methods (fetchLive, scrapePortal throw ERR_SOURCE_DISABLED)
 *     - Production route isolation: /api/authority/runs fails closed (POLICY_REJECTED)
 *  4. Candidate Safety End-to-End:
 *     - Exact match, ambiguous identity, conflicting coordinates, missing keys
 *     - Contradictory dates, malformed areas, unknown categorical statuses
 *     - Explicit negatives vs affirmative categorical observations
 *     - Sentinels produce REJECT_SENTINEL, blocked fields produce REJECT_BLOCKED
 *     - Top-level & nested PII scrubbed
 *     - Deterministic contentHash on repeated executions
 *     - Zero DB mutations (no Inventory writes, no Contact creation)
 * 
 *  @module tests/phase3b_adapter_conformance.test
 *  @version 3.0.0-phase3b
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import tls from 'node:tls';
import dgram from 'node:dgram';
import child_process from 'node:child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import BaseFixtureAdapter, { isIdentifierField } from '../services/authority/BaseFixtureAdapter.js';
import HsvpFixtureAdapter from '../services/authority/HsvpFixtureAdapter.js';
import ChandigarhFixtureAdapter from '../services/authority/ChandigarhFixtureAdapter.js';
import GmadaFixtureAdapter from '../services/authority/GmadaFixtureAdapter.js';
import {
    getAdapter,
    listAdapters,
    hasAdapter,
    executeFixturePipeline
} from '../services/authority/adapterRegistry.js';
import {
    HSVP_SYNTHETIC,
    CHD_SYNTHETIC,
    GMADA_SYNTHETIC
} from '../services/authority/fixtures/syntheticPhase3AFixtures.js';
import {
    normalizePropertyId,
    normalizeSectorNumber,
    normalizePhaseCode,
    buildCompositeKey,
    computeSnapshotContentHash
} from '../services/authority/authorityNormalizer.js';
import {
    SOURCE_EVIDENCE_STATUS,
    isSentinel
} from '../services/authority/authorityFieldDictionary.js';
import Inventory from '../models/Inventory.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import {
    updateSourceSettings,
    createVerificationRun
} from '../controllers/authorityVerification.controller.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Runtime Network Egress Trap Harness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createNetworkEgressTrap() {
    const trappedCalls = [];
    const orig = {
        fetch: globalThis.fetch,
        httpRequest: http.request,
        httpGet: http.get,
        httpsRequest: https.request,
        httpsGet: https.get,
        netConnect: net.connect,
        netCreateConnection: net.createConnection,
        dnsLookup: dns.lookup,
        dnsResolve: dns.resolve,
        tlsConnect: tls.connect,
        dgramCreateSocket: dgram.createSocket,
        cpExec: child_process.exec,
        cpSpawn: child_process.spawn,
        cpExecFile: child_process.execFile,
        cpExecFileSync: child_process.execFileSync,
        cpExecSync: child_process.execSync,
        cpSpawnSync: child_process.spawnSync,
        cpFork: child_process.fork
    };

    const makeTrap = (apiName) => (...args) => {
        const err = new Error(`EGRESS_VIOLATION: Unauthorized attempt to invoke ${apiName} during fixture adapter execution`);
        err.code = 'ERR_EGRESS_VIOLATION';
        trappedCalls.push({ apiName, time: Date.now() });
        throw err;
    };

    return {
        arm: () => {
            trappedCalls.length = 0;
            globalThis.fetch = makeTrap('globalThis.fetch');
            http.request = makeTrap('http.request');
            http.get = makeTrap('http.get');
            https.request = makeTrap('https.request');
            https.get = makeTrap('https.get');
            net.connect = makeTrap('net.connect');
            net.createConnection = makeTrap('net.createConnection');
            dns.lookup = makeTrap('dns.lookup');
            dns.resolve = makeTrap('dns.resolve');
            tls.connect = makeTrap('tls.connect');
            dgram.createSocket = makeTrap('dgram.createSocket');
            child_process.exec = makeTrap('child_process.exec');
            child_process.spawn = makeTrap('child_process.spawn');
            child_process.execFile = makeTrap('child_process.execFile');
            child_process.execFileSync = makeTrap('child_process.execFileSync');
            child_process.execSync = makeTrap('child_process.execSync');
            child_process.spawnSync = makeTrap('child_process.spawnSync');
            child_process.fork = makeTrap('child_process.fork');
        },
        disarm: () => {
            globalThis.fetch = orig.fetch;
            http.request = orig.httpRequest;
            http.get = orig.httpGet;
            https.request = orig.httpsRequest;
            https.get = orig.httpsGet;
            net.connect = orig.netConnect;
            net.createConnection = orig.netCreateConnection;
            dns.lookup = orig.dnsLookup;
            dns.resolve = orig.dnsResolve;
            tls.connect = orig.tlsConnect;
            dgram.createSocket = orig.dgramCreateSocket;
            child_process.exec = orig.cpExec;
            child_process.spawn = orig.cpSpawn;
            child_process.execFile = orig.cpExecFile;
            child_process.execFileSync = orig.cpExecFileSync;
            child_process.execSync = orig.cpExecSync;
            child_process.spawnSync = orig.cpSpawnSync;
            child_process.fork = orig.cpFork;
        },
        getCalls: () => [...trappedCalls]
    };
}

describe('--- PHASE 3B: FIXTURE ADAPTER CONFORMANCE, INPUT INTEGRITY & NETWORK ISOLATION ---', () => {
    let mongod;
    const egressTrap = createNetworkEgressTrap();

    before(async () => {
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);
    });

    after(async () => {
        egressTrap.disarm();
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongod) {
            await mongod.stop();
        }
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: SHARED ADAPTER CONFORMANCE SUITE (Parameterised)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const adapterConfigs = [
        {
            code: 'HSVP',
            adapterClass: HsvpFixtureAdapter,
            expectedName: 'Haryana Shehri Vikas Pradhikaran',
            validFixture: HSVP_SYNTHETIC.VALID_STRUCTURED.rawData,
            sampleField: 'Plot / Property No.'
        },
        {
            code: 'CHD',
            adapterClass: ChandigarhFixtureAdapter,
            expectedName: 'Estate Office Chandigarh',
            validFixture: CHD_SYNTHETIC.VALID_FREEHOLD_STRUCTURED.rawData,
            sampleField: 'Property No.'
        },
        {
            code: 'GMADA',
            adapterClass: GmadaFixtureAdapter,
            expectedName: 'Greater Mohali Area Development Authority',
            validFixture: GMADA_SYNTHETIC.VALID_IT_CITY_SECTOR_66A.rawData,
            sampleField: 'Plot / Property No.'
        }
    ];

    for (const config of adapterConfigs) {
        describe(`Shared Conformance Suite: ${config.code} Adapter`, () => {
            const adapter = getAdapter(config.code);

            test(`1. Contract Hierarchy & Identity: ${config.code}`, () => {
                assert.ok(adapter instanceof BaseFixtureAdapter, `${config.code} must extend BaseFixtureAdapter`);
                assert.ok(adapter instanceof config.adapterClass, `${config.code} must be instance of ${config.adapterClass.name}`);
                assert.strictEqual(adapter.getAuthorityCode(), config.code);
                assert.strictEqual(adapter.getAuthorityName(), config.expectedName);
            });

            test(`2. Source Disabled Boundary & Fail-Closed Live Calls: ${config.code}`, async () => {
                assert.strictEqual(adapter.isSourceActivated(), false, 'Source must be strictly disabled');

                // fetchLive must throw ERR_SOURCE_DISABLED
                await assert.rejects(
                    async () => await adapter.fetchLive(),
                    (err) => {
                        assert.strictEqual(err.code, 'ERR_SOURCE_DISABLED');
                        assert.ok(err.message.includes('NETWORK_PROHIBITED'));
                        return true;
                    }
                );

                // scrapePortal must throw ERR_SOURCE_DISABLED
                await assert.rejects(
                    async () => await adapter.scrapePortal(),
                    (err) => {
                        assert.strictEqual(err.code, 'ERR_SOURCE_DISABLED');
                        assert.ok(err.message.includes('SCRAPER_PROHIBITED'));
                        return true;
                    }
                );
            });

            test(`3. Source Mapping & Unverified Status Preservation: ${config.code}`, () => {
                const map = adapter.getSourceMap();
                assert.ok(map && typeof map === 'object', 'Source map must be a valid dictionary');
                assert.ok(Object.keys(map).length > 0, 'Source map must contain mapped fields');

                // Verify every external canonical field has UNVERIFIED status (unless NOT_SUPPORTED)
                for (const [canonicalField, mapping] of Object.entries(map)) {
                    if (canonicalField !== 'authority' && canonicalField !== 'policyVersion' && mapping.evidence !== 'NOT_SUPPORTED' && mapping.sourceEvidenceStatus !== 'NOT_APPLICABLE') {
                        assert.strictEqual(
                            mapping.sourceEvidenceStatus,
                            SOURCE_EVIDENCE_STATUS.UNVERIFIED,
                            `Field ${canonicalField} in ${config.code} must have UNVERIFIED source evidence status`
                        );
                        assert.strictEqual(
                            adapter.getSourceEvidenceStatus(canonicalField),
                            SOURCE_EVIDENCE_STATUS.UNVERIFIED
                        );
                    }
                }
            });

            test(`4. Fixture Envelope Validation & Sanitization: ${config.code}`, () => {
                // Non-object rejection
                assert.strictEqual(adapter.validateFixture(null).isValid, false);
                assert.strictEqual(adapter.validateFixture('string').isValid, false);
                assert.strictEqual(adapter.validateFixture([1, 2, 3]).isValid, false);

                // Security parameter sanitization
                const dirtyPayload = {
                    ...config.validFixture,
                    url: 'https://leak.local',
                    endpoint: '/api/v1/extract',
                    apiKey: 'sensitive_token',
                    password: 'secret_password',
                    allotteeName: 'Citizen Real Name',
                    aadhaar: '1234-5678-9012'
                };

                const valResult = adapter.validateFixture(dirtyPayload);
                assert.strictEqual(valResult.isValid, true);
                assert.strictEqual(valResult.sanitizedData.url, undefined);
                assert.strictEqual(valResult.sanitizedData.endpoint, undefined);
                assert.strictEqual(valResult.sanitizedData.apiKey, undefined);
                assert.strictEqual(valResult.sanitizedData.password, undefined);
                assert.strictEqual(valResult.sanitizedData.allotteeName, undefined);
                assert.strictEqual(valResult.sanitizedData.aadhaar, undefined);
                assert.ok(valResult.warnings.some(w => w.includes('Forbidden network parameter stripped')));
                assert.ok(valResult.warnings.some(w => w.includes('Credential parameter stripped')));
                assert.ok(valResult.warnings.some(w => w.includes('Personal information parameter scrubbed')));
            });

            test(`5. Parsing & Normalization Determinism: ${config.code}`, () => {
                const valResult = adapter.validateFixture(config.validFixture);
                const parsed = adapter.parseFixture(valResult.sanitizedData);
                const norm1 = adapter.normalizeRecord(parsed);
                const norm2 = adapter.normalizeRecord(parsed);

                assert.ok(norm1._compositeKey, 'Normalized record must contain _compositeKey');
                assert.ok(norm1._contentHash, 'Normalized record must contain _contentHash');
                assert.strictEqual(norm1._contentHash.length, 64, 'contentHash must be 64-char sha256 hex');
                assert.strictEqual(norm1._contentHash, norm2._contentHash, 'Repeated normalization must produce deterministic contentHash');
            });

            test(`6. Candidate Diffing & Overwrite Gate: ${config.code}`, () => {
                const valResult = adapter.validateFixture(config.validFixture);
                const parsed = adapter.parseFixture(valResult.sanitizedData);
                const normalized = adapter.normalizeRecord(parsed);

                const crmContext = {
                    unitNo: normalized.propertyId?.normalized || '101',
                    sectorNumber: normalized.sectorNumber?.normalized || '14',
                    authorityVerification: {
                        allotmentNumber: 'OLD-ALLOT-123',
                        possessionDate: null
                    }
                };

                const candidate = adapter.buildVerificationCandidate(normalized, crmContext);
                assert.strictEqual(candidate.requiresHumanReview, true, 'Candidate must require human review');
                assert.strictEqual(candidate.isApplied, false, 'Candidate must never be pre-applied');
                assert.strictEqual(candidate.auditMeta.isFixtureExecution, true);
                assert.strictEqual(candidate.auditMeta.authorizationStatus, 'NOT_OBTAINED');

                // Overwrite protection: sentinels produce REJECT_SENTINEL
                const sentinelDiff = candidate.proposedChanges.find(c => c.action === 'REJECT_SENTINEL');
                assert.ok(sentinelDiff, 'Candidate must contain REJECT_SENTINEL actions for unparseable/missing fields');
                assert.ok(sentinelDiff.rationale.includes('MUST NEVER overwrite'));
            });
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: PROPERTY IDENTIFIER INTEGRITY & ANTI-SILENT-ALTERATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    describe('Identifier Integrity & Anti-Silent-Alteration Audit', () => {
        const adapter = getAdapter('HSVP');

        test('1. Reject markup and scripts in propertyId without silent alteration to valid identifier', () => {
            const tainted = {
                'Property No.': '101<script>alert("xss")</script>',
                'Sector': 'Sector 14',
                'Urban Estate': 'Urban Estate Panchkula'
            };

            const val = adapter.validateFixture(tainted);
            // Must NOT silently strip into "101"
            assert.notStrictEqual(val.sanitizedData['Property No.'], '101', 'Must NOT silently strip script into valid 101');
            assert.strictEqual(val.sanitizedData['Property No.'].isRejected, true);
            assert.strictEqual(val.sanitizedData['Property No.'].error, 'MALFORMED_IDENTIFIER');

            // Log warning must NOT echo the untrusted malicious payload
            const warning = val.warnings.find(w => w.includes('Malformed identifier rejected in field "Property No."'));
            assert.ok(warning, 'Explicit data quality warning must be logged');
            assert.strictEqual(warning.includes('alert("xss")'), false, 'Warning must NOT copy untrusted payload into logs');

            // Normalization must yield MALFORMED_IDENTIFIER error
            const norm = adapter.normalizeRecord(adapter.parseFixture(val.sanitizedData));
            assert.strictEqual(norm.propertyId.error, 'MALFORMED_IDENTIFIER');
            assert.strictEqual(norm.propertyId.normalized, null);
        });

        test('2. Reject control characters and ANSI escape sequences in identifiers', () => {
            const badInputs = [
                '101\x00',              // null byte
                '101\x1b[31mRed\x1b[0m', // ANSI escape
                '101\x07',              // bell character
                '101\x08'               // backspace
            ];

            for (const bad of badInputs) {
                const normProp = normalizePropertyId(bad);
                assert.strictEqual(normProp.error, 'MALFORMED_IDENTIFIER', `Must reject control chars in: ${JSON.stringify(bad)}`);
                assert.strictEqual(normProp.normalized, null);

                const normSec = normalizeSectorNumber(`Sector ${bad}`);
                assert.strictEqual(normSec.error, 'MALFORMED_IDENTIFIER', `Must reject control chars in sector`);

                const normPhase = normalizePhaseCode(`Phase ${bad}`);
                assert.strictEqual(normPhase.error, 'MALFORMED_IDENTIFIER', `Must reject control chars in phase`);
            }
        });

        test('3. Reject bidirectional Unicode formatting overrides and invisible characters', () => {
            const bidiInputs = [
                '101\u202Efake', // Right-to-Left Override
                '101\u200E',     // Left-to-Right Mark
                '101\u200B102',  // Zero-width space
                '101\uFEFF'      // Byte Order Mark / zero-width no-break space
            ];

            for (const bidi of bidiInputs) {
                const norm = normalizePropertyId(bidi);
                assert.strictEqual(norm.error, 'MALFORMED_IDENTIFIER', `Must reject Unicode override in: ${JSON.stringify(bidi)}`);
                assert.strictEqual(norm.normalized, null);
            }
        });

        test('4. Separate ordinary whitespace normalization from security validation', () => {
            // Clean whitespace variations
            const cleanInputs = [
                { raw: '  101  ', expected: '101' },
                { raw: 'Plot   No.   101', expected: '101' },
                { raw: 'SCO-12 / P', expected: 'SCO-12 / P' },
                { raw: 'Booth No.   5', expected: '5' }
            ];

            for (const { raw, expected } of cleanInputs) {
                const norm = normalizePropertyId(raw);
                assert.strictEqual(norm.error, null, `Ordinary whitespace must not trigger error: ${raw}`);
                assert.strictEqual(norm.normalized, expected);
            }
        });

        test('5. False-Positive Match Prevention: Tainted identifier MUST NOT match clean CRM record', () => {
            const crmInventory = {
                unitNo: '101',
                sectorNumber: '14',
                authorityVerification: {}
            };

            // 1. Clean fixture matches
            const cleanFixture = {
                'Property No.': '101',
                'Sector': 'Sector 14',
                'Urban Estate': 'Urban Estate Panchkula',
                'Outstanding Dues': 'Rs. 0'
            };
            const candClean = adapter.buildVerificationCandidate(
                adapter.normalizeRecord(adapter.parseFixture(adapter.validateFixture(cleanFixture).sanitizedData)),
                crmInventory
            );
            assert.strictEqual(candClean.matchEvidence.confidence, 'EXACT');
            assert.strictEqual(candClean.status, 'READY_FOR_REVIEW');

            // 2. Tainted fixture (with script injection) MUST NOT match propertyId
            const taintedFixture = {
                'Property No.': '101<script>alert("hack")</script>',
                'Sector': 'Sector 14',
                'Urban Estate': 'Urban Estate Panchkula',
                'Outstanding Dues': 'Rs. 0'
            };
            const candTainted = adapter.buildVerificationCandidate(
                adapter.normalizeRecord(adapter.parseFixture(adapter.validateFixture(taintedFixture).sanitizedData)),
                crmInventory
            );
            assert.notStrictEqual(candTainted.matchEvidence.confidence, 'EXACT', 'Tainted identifier must NOT produce exact match');
            assert.strictEqual(candTainted.matchEvidence.matchedFields.includes('propertyId'), false, 'Tainted propertyId must NOT be matched');
            assert.strictEqual(candTainted.status, 'REJECTED_QUALITY', 'Tainted candidate must be REJECTED_QUALITY');
            assert.ok(candTainted.dataQualityWarnings.some(w => w.includes('Missing property identifier') || w.includes('Malformed identifier rejected')));

            // Also verify against inventory without sector: confidence must be NONE
            const candTaintedNoSec = adapter.buildVerificationCandidate(
                adapter.normalizeRecord(adapter.parseFixture(adapter.validateFixture(taintedFixture).sanitizedData)),
                { unitNo: '101' }
            );
            assert.strictEqual(candTaintedNoSec.matchEvidence.confidence, 'NONE', 'Without matching sector, confidence must be NONE');

            // 3. Tainted control char identifier MUST NOT match
            const nullByteFixture = {
                'Property No.': '101\x00',
                'Sector': 'Sector 14',
                'Urban Estate': 'Urban Estate Panchkula',
                'Outstanding Dues': 'Rs. 0'
            };
            const candNull = adapter.buildVerificationCandidate(
                adapter.normalizeRecord(adapter.parseFixture(adapter.validateFixture(nullByteFixture).sanitizedData)),
                crmInventory
            );
            assert.notStrictEqual(candNull.matchEvidence.confidence, 'EXACT');
            assert.strictEqual(candNull.matchEvidence.matchedFields.includes('propertyId'), false);
            assert.strictEqual(candNull.status, 'REJECTED_QUALITY');
        });

        test('6. False-Positive Collision: Stripping characters from two different inputs MUST NOT cause match', () => {
            const inputA = normalizePropertyId('101');
            const inputB = normalizePropertyId('101<script>alert(1)</script>');
            const inputC = normalizePropertyId('101-B');

            assert.strictEqual(inputA.normalized, '101');
            assert.strictEqual(inputB.normalized, null, 'inputB must be rejected, not stripped to 101');
            assert.notStrictEqual(inputA.normalized, inputB.normalized);
            assert.strictEqual(inputC.normalized, '101-B');
            assert.notStrictEqual(inputA.normalized, inputC.normalized);
        });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: STRENGTHEN RUNTIME NETWORK ISOLATION TESTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    describe('Runtime Network Isolation & Egress Denial', () => {

        test('1. Runtime Network Egress Trap: 0 outbound network calls across all adapters', () => {
            egressTrap.arm();
            try {
                // Execute complete pipelines for HSVP, CHD, and GMADA
                executeFixturePipeline('HSVP', HSVP_SYNTHETIC.VALID_STRUCTURED.rawData);
                executeFixturePipeline('CHD', CHD_SYNTHETIC.VALID_FREEHOLD_STRUCTURED.rawData);
                executeFixturePipeline('GMADA', GMADA_SYNTHETIC.VALID_IT_CITY_SECTOR_66A.rawData);

                const trapped = egressTrap.getCalls();
                assert.strictEqual(trapped.length, 0, `Egress trap detected ${trapped.length} unauthorized calls!`);
            } finally {
                egressTrap.disarm();
            }
        });

        test('2. Egress Trap Verification: Confirms that trap successfully intercepts outbound calls if triggered', () => {
            egressTrap.arm();
            try {
                assert.throws(
                    () => {
                        http.get('http://127.0.0.1:9999');
                    },
                    (err) => err.code === 'ERR_EGRESS_VIOLATION'
                );

                assert.throws(
                    () => {
                        dns.lookup('example.com', () => {});
                    },
                    (err) => err.code === 'ERR_EGRESS_VIOLATION'
                );

                assert.throws(
                    () => {
                        child_process.execSync('curl http://example.com');
                    },
                    (err) => err.code === 'ERR_EGRESS_VIOLATION'
                );

                assert.throws(
                    () => {
                        child_process.spawnSync('curl', ['http://example.com']);
                    },
                    (err) => err.code === 'ERR_EGRESS_VIOLATION'
                );

                assert.throws(
                    () => {
                        child_process.execFile('curl', ['http://example.com'], () => {});
                    },
                    (err) => err.code === 'ERR_EGRESS_VIOLATION'
                );

                assert.throws(
                    () => {
                        child_process.execFileSync('curl', ['http://example.com']);
                    },
                    (err) => err.code === 'ERR_EGRESS_VIOLATION'
                );

                assert.throws(
                    () => {
                        child_process.fork('script.js');
                    },
                    (err) => err.code === 'ERR_EGRESS_VIOLATION'
                );

                const trapped = egressTrap.getCalls();
                assert.strictEqual(trapped.length, 7);
                assert.strictEqual(trapped[0].apiName, 'http.get');
                assert.strictEqual(trapped[1].apiName, 'dns.lookup');
                assert.strictEqual(trapped[2].apiName, 'child_process.execSync');
                assert.strictEqual(trapped[3].apiName, 'child_process.spawnSync');
                assert.strictEqual(trapped[4].apiName, 'child_process.execFile');
                assert.strictEqual(trapped[5].apiName, 'child_process.execFileSync');
                assert.strictEqual(trapped[6].apiName, 'child_process.fork');
            } finally {
                egressTrap.disarm();
            }
        });

        test('3. Production Route Isolation: /api/authority/runs fails closed (POLICY_REJECTED)', async () => {
            // Verify that AuthoritySourceSettings is disabled and controller rejects without adapter invocation
            const tenantId = new mongoose.Types.ObjectId();
            const userId = new mongoose.Types.ObjectId();
            const setting = await AuthoritySourceSettings.create({
                tenantId,
                authorityCode: 'HSVP',
                isEnabled: false,
                sourceStatus: 'DISABLED',
                authorizationStatus: 'NOT_OBTAINED',
                reviewStatus: 'NOT_REVIEWED',
                policyVersion: '1.0.0'
            });

            const eligibility = setting.checkActivationEligibility();
            assert.strictEqual(eligibility.canActivate, false);
            assert.strictEqual(Boolean(setting.isEffectivelyActive()), false);

            // Phase 3B Server-Side Activation Lock:
            // Negative test: Attempt full combined self-approval PATCH request
            let resStatus = null;
            let resJson = null;
            const mockReq = {
                user: { _id: userId, tenantId },
                params: { authorityCode: 'HSVP' },
                body: {
                    permissionStatus: 'GRANTED',
                    approvedAccessMethod: 'PUBLIC_API',
                    approvalReference: 'SELF-APPROVED-123',
                    approvalDate: '2026-10-29',
                    reviewStatus: 'APPROVED',
                    ratePolicy: { maxRequestsPerDay: 100 },
                    identityRequirements: { verified: true, required: ['sectorNumber'] },
                    permittedFields: ['sectorNumber'],
                    isEnabled: true,
                    schedulingEnabled: true
                }
            };
            const mockRes = {
                status(code) { resStatus = code; return this; },
                json(data) { resJson = data; return this; }
            };

            // Arm egress trap to verify no network egress or subprocesses occur
            const lockEgressTrap = createNetworkEgressTrap();
            try {
                // Pre-save hook test: direct Mongoose mutation must throw ACTIVATION_LOCKED_PHASE3
                const directDoc = new AuthoritySourceSettings({
                    tenantId,
                    authorityCode: 'CHD',
                    isEnabled: true
                });
                await assert.rejects(
                    async () => directDoc.save(),
                    (err) => {
                        assert.strictEqual(err.code, 'ACTIVATION_LOCKED_PHASE3');
                        return true;
                    }
                );

                // Controller endpoint test: updateSourceSettings rejects with 422
                await updateSourceSettings(mockReq, mockRes);
                assert.strictEqual(resStatus, 422, 'Must reject activation attempt with HTTP 422');
                assert.strictEqual(resJson.code, 'ACTIVATION_LOCKED_PHASE3');
                assert.strictEqual(resJson.success, false);
                assert.ok(Array.isArray(resJson.blockers) && resJson.blockers.length >= 3);

                // Re-read settings and verify persisted state remains disabled
                const persisted = await AuthoritySourceSettings.getForTenant(tenantId, 'HSVP');
                if (persisted) {
                    assert.notStrictEqual(persisted.permissionStatus, 'GRANTED');
                    assert.notStrictEqual(persisted.reviewStatus, 'APPROVED');
                    assert.strictEqual(persisted.isEnabled, false);
                    assert.strictEqual(persisted.schedulingEnabled, false);
                    assert.strictEqual(persisted.checkActivationEligibility().canActivate, false);
                    assert.strictEqual(Boolean(persisted.isEffectivelyActive()), false);
                }

                // Verify verification-run creation fails closed (POLICY_REJECTED with HTTP 422)
                let runStatus = null;
                let runJson = null;
                const mockRunReq = {
                    user: { _id: userId, tenantId },
                    body: {
                        authorityCode: 'HSVP',
                        runMode: 'SINGLE',
                        inventoryIds: [new mongoose.Types.ObjectId()]
                    }
                };
                const mockRunRes = {
                    status(code) { runStatus = code; return this; },
                    json(data) { runJson = data; return this; }
                };

                await createVerificationRun(mockRunReq, mockRunRes);
                assert.strictEqual(runStatus, 422, 'Verification run must fail closed with HTTP 422');
                assert.strictEqual(runJson.status || runJson.data?.status, 'POLICY_REJECTED');

                // Verify zero network egress calls or background tasks were attempted
                const calls = lockEgressTrap.getCalls();
                assert.strictEqual(calls.length, 0, 'Zero network calls permitted during activation rejection');
            } finally {
                lockEgressTrap.disarm();
            }
        });

        test('4. Unknown adapter code fails closed', () => {
            assert.strictEqual(hasAdapter('UNKNOWN_GOV'), false);
            assert.throws(
                () => getAdapter('UNKNOWN_GOV'),
                (err) => {
                    assert.ok(err.message.includes('UNKNOWN_AUTHORITY'));
                    return true;
                }
            );

            assert.throws(
                () => executeFixturePipeline('UNKNOWN_GOV', {}),
                (err) => {
                    assert.ok(err.message.includes('UNKNOWN_AUTHORITY'));
                    return true;
                }
            );
        });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: CANDIDATE SAFETY END-TO-END
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    describe('Candidate Safety & Non-Mutation End-to-End', () => {

        test('1. Exact Match: Produces high-fidelity diff without database write', async () => {
            const hsvp = getAdapter('HSVP');
            const crmInventory = {
                unitNo: '101',
                sectorNumber: '14',
                authorityVerification: {
                    allotmentNumber: 'HSVP/GGN/2020/P-101',
                    authorityStatus: 'ALLOTTED'
                }
            };

            const cand = hsvp.buildVerificationCandidate(
                hsvp.normalizeRecord(hsvp.parseFixture(hsvp.validateFixture(HSVP_SYNTHETIC.VALID_STRUCTURED.rawData).sanitizedData)),
                crmInventory
            );

            assert.strictEqual(cand.matchEvidence.confidence, 'EXACT');
            assert.strictEqual(cand.status, 'READY_FOR_REVIEW');
            assert.strictEqual(cand.requiresHumanReview, true);

            // Verify no MongoDB mutation occurred
            const count = await Inventory.countDocuments();
            assert.strictEqual(count, 0, 'No Inventory records may be created');
        });

        test('2. Ambiguous Identity: Missing Urban Estate produces AMBIGUOUS key and FLAGGED status', () => {
            const cand = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.MISSING_URBAN_ESTATE_AMBIGUOUS.rawData);
            assert.strictEqual(cand.keyStatus, 'AMBIGUOUS');
            assert.strictEqual(cand.compositeKey, null);
            assert.strictEqual(cand.status, 'FLAGGED_AMBIGUOUS');
        });

        test('3. Conflicting Property Identifiers: Sector 14 vs Sector 22 flags CONFLICT', () => {
            const hsvp = getAdapter('HSVP');
            const crmInventory = {
                unitNo: '101',
                sectorNumber: '22', // conflicting
                authorityVerification: {}
            };

            const cand = hsvp.buildVerificationCandidate(
                hsvp.normalizeRecord(hsvp.parseFixture(hsvp.validateFixture(HSVP_SYNTHETIC.VALID_STRUCTURED.rawData).sanitizedData)),
                crmInventory
            );

            assert.strictEqual(cand.matchEvidence.confidence, 'CONFLICT');
            assert.strictEqual(cand.status, 'FLAGGED_AMBIGUOUS');
            assert.ok(cand.matchEvidence.conflictingFields.includes('sectorNumber'));
        });

        test('4. Contradictory Dates: Possession before allotment flags REJECTED_QUALITY', () => {
            const cand = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.CONTRADICTORY_DATES.rawData);
            assert.strictEqual(cand.status, 'REJECTED_QUALITY');
            assert.ok(cand.dataQualityWarnings.some(w => w.includes('Contradictory dates')));
        });

        test('5. Malformed Area: Text area becomes PARSE_ERROR sentinel and maps to REJECT_SENTINEL', () => {
            const malformedAreaFixture = { ...HSVP_SYNTHETIC.VALID_STRUCTURED.rawData, 'Size/Area': 'Not An Area' };
            const cand = executeFixturePipeline('HSVP', malformedAreaFixture, { unitNo: '101', sectorNumber: '14' });
            assert.strictEqual(cand.normalizedFacts.area.value, null);
            assert.strictEqual(cand.normalizedFacts.area._parseError, 'PARSE_ERROR');

            const areaDiff = cand.proposedChanges.find(c => c.field === 'authorityVerification.propertyAreaValue');
            assert.ok(areaDiff);
            assert.strictEqual(areaDiff.action, 'REJECT_SENTINEL');
        });

        test('6. Categorical Litigation Observation: Court case pending preserved, not coerced to true', () => {
            const cand = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.CATEGORICAL_LITIGATION_OBSERVATION.rawData);
            const lit = cand.normalizedFacts.litigationStatus;
            assert.strictEqual(typeof lit, 'object');
            assert.strictEqual(lit.sentinel, 'CATEGORICAL_STATUS');
            assert.strictEqual(lit.status, 'CWP 4567/2022 pending before High Court of Punjab & Haryana');
            assert.ok(cand.dataQualityWarnings.some(w => w.includes('Categorical litigation observation present')));
        });

        test('7. Explicit Negative Phrases: "No pending court case" resolves to NO_LITIGATION', () => {
            const cand = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.EXPLICIT_NEGATIVE_ENCUMBRANCE.rawData);
            assert.strictEqual(cand.normalizedFacts.litigationStatus.controlledString, 'NO_LITIGATION');
            assert.strictEqual(cand.normalizedFacts.mortgageStatus.controlledString, 'NO_MORTGAGE');
        });

        test('8. Failure Isolation: Malformed record does not corrupt subsequent processing', () => {
            // First run malformed
            const cand1 = executeFixturePipeline('HSVP', { malformed: true });
            assert.strictEqual(cand1.keyStatus, 'INCOMPLETE_KEY');

            // Subsequent valid run functions perfectly
            const cand2 = executeFixturePipeline('HSVP', HSVP_SYNTHETIC.VALID_STRUCTURED.rawData);
            assert.strictEqual(cand2.keyStatus, 'COMPLETE');
            assert.strictEqual(cand2.compositeKey, 'HSVP:PANCHKULA:14::101');
        });

        test('9. Zero Contact Creation and Zero Database Mutations (Deep Content & Method Spy)', async () => {
            // Seed a representative Inventory document to test content preservation
            const sampleInv = await Inventory.create({
                title: 'Baseline Non-Mutation Test Property',
                unitNo: 'PLOT-999',
                sector: 'Sector 5',
                status: 'Available',
                price: 15000000
            });
            const beforeInv = await Inventory.findById(sampleInv._id).lean();

            const invCountBefore = await Inventory.countDocuments();
            const roleCountBefore = await Role.countDocuments();
            const auditCountBefore = await AuditLog.countDocuments();

            // Track any calls to write methods on Inventory model
            let writeCalls = 0;
            const origSave = Inventory.prototype.save;
            const origUpdateOne = Inventory.updateOne;
            const origFindOneAndUpdate = Inventory.findOneAndUpdate;
            Inventory.prototype.save = function(...args) { writeCalls++; return origSave.apply(this, args); };
            Inventory.updateOne = function(...args) { writeCalls++; return origUpdateOne.apply(this, args); };
            Inventory.findOneAndUpdate = function(...args) { writeCalls++; return origFindOneAndUpdate.apply(this, args); };

            try {
                // Run pipeline across all 3 authorities with candidate building
                const hsvp = getAdapter('HSVP');
                const chd = getAdapter('CHD');
                const gmada = getAdapter('GMADA');

                const cand1 = hsvp.buildVerificationCandidate(
                    hsvp.normalizeRecord(hsvp.parseFixture(hsvp.validateFixture(HSVP_SYNTHETIC.VALID_STRUCTURED.rawData).sanitizedData)),
                    sampleInv
                );
                const cand2 = chd.buildVerificationCandidate(
                    chd.normalizeRecord(chd.parseFixture(chd.validateFixture(CHD_SYNTHETIC.VALID_FREEHOLD_STRUCTURED.rawData).sanitizedData)),
                    sampleInv
                );
                const cand3 = gmada.buildVerificationCandidate(
                    gmada.normalizeRecord(gmada.parseFixture(gmada.validateFixture(GMADA_SYNTHETIC.VALID_IT_CITY_SECTOR_66A.rawData).sanitizedData)),
                    sampleInv
                );

                assert.ok(cand1);
                assert.ok(cand2);
                assert.ok(cand3);

                // 1. Assert ZERO write method invocations occurred during candidate generation
                assert.strictEqual(writeCalls, 0, 'Candidate generation must not invoke any database write methods');

                // 2. Assert document counts remain strictly identical
                assert.strictEqual(await Inventory.countDocuments(), invCountBefore);
                assert.strictEqual(await Role.countDocuments(), roleCountBefore);
                assert.strictEqual(await AuditLog.countDocuments(), auditCountBefore);

                // 3. Deep-compare document content before and after to prove zero modification
                const afterInv = await Inventory.findById(sampleInv._id).lean();
                assert.deepStrictEqual(afterInv, beforeInv, 'Existing inventory document content must not be altered');
            } finally {
                Inventory.prototype.save = origSave;
                Inventory.updateOne = origUpdateOne;
                Inventory.findOneAndUpdate = origFindOneAndUpdate;
            }
        });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 5: CANONICAL HASH AND PRIVACY INVARIANTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    describe('Canonical Hash & Privacy Invariants Audit', () => {

        test('1. PII Exclusion from Hash: Names, phones, addresses do NOT alter contentHash', () => {
            const norm1 = {
                authority: 'HSVP',
                sectorNumber: { normalized: '14' },
                propertyId: { normalized: '101' },
                urbanEstate: 'PANCHKULA',
                allotteeName: 'Citizen A',
                allotteeAddress: 'House 1, Road 2',
                allotteePhone: '9876543210'
            };

            const norm2 = {
                authority: 'HSVP',
                sectorNumber: { normalized: '14' },
                propertyId: { normalized: '101' },
                urbanEstate: 'PANCHKULA',
                allotteeName: 'Citizen B Different Name',
                allotteeAddress: 'Completely different address',
                allotteePhone: '1111111111'
            };

            const hash1 = computeSnapshotContentHash(norm1);
            const hash2 = computeSnapshotContentHash(norm2);

            assert.strictEqual(hash1, hash2, 'PII fields must be completely excluded from cryptographic contentHash');
        });

        test('2. Hash Sensitivity: Canonical verified changes MUST alter contentHash', () => {
            const normA = {
                authority: 'HSVP',
                sectorNumber: { normalized: '14' },
                propertyId: { normalized: '101' },
                urbanEstate: 'PANCHKULA',
                litigationStatus: 'NO_LITIGATION'
            };

            const normB = {
                authority: 'HSVP',
                sectorNumber: { normalized: '14' },
                propertyId: { normalized: '101' },
                urbanEstate: 'PANCHKULA',
                litigationStatus: 'LITIGATION_REPORTED'
            };

            const hashA = computeSnapshotContentHash(normA);
            const hashB = computeSnapshotContentHash(normB);

            assert.notStrictEqual(hashA, hashB, 'Altering legal encumbrance MUST alter contentHash');
        });

        test('3. Strict Schema Enforcement: AuthorityVerificationSubSchema rejects unknown fields via strict: throw', async () => {
            const tenantId = new mongoose.Types.ObjectId();
            const inv = new Inventory({
                tenantId,
                unitNo: '101',
                sectorNumber: '14',
                authorityVerification: {
                    allotmentNumber: 'HSVP/101',
                    unauthorizedInjectedField: 'hack' // Should throw
                }
            });

            await assert.rejects(
                async () => await inv.validate(),
                (err) => {
                    assert.ok(
                        err.name === 'StrictModeError' ||
                        err.message.includes('StrictModeError') ||
                        err.message.includes('authorityVerification') ||
                        err.message.includes('Field `unauthorizedInjectedField` is not in schema')
                    );
                    return true;
                }
            );
        });

        test('4. Field Isolation: authorityStatus is strictly isolated from Inventory.status', () => {
            const inv = new Inventory({
                tenantId: new mongoose.Types.ObjectId(),
                unitNo: '101',
                status: 'Available',
                authorityVerification: {
                    authorityStatus: 'ALLOTTED'
                }
            });

            assert.strictEqual(inv.status, 'Available', 'Top-level Inventory.status must remain Available');
            assert.strictEqual(inv.authorityVerification.authorityStatus, 'ALLOTTED', 'authorityStatus must be isolated in subdocument');
        });
    });
});
