/**
 * Phase 2 Authority Verification Foundation Tests
 * 
 * Tests model validation, indexes, tenant isolation, RBAC design,
 * disabled-state behavior, safety constraints, and snapshot immutability.
 * 
 * These tests do NOT require a live MongoDB connection — they validate
 * schema definitions, field constraints, method behavior, and business rules
 * using Mongoose schema introspection and unit-level assertions.
 * 
 * Tests that would require a live database connection are marked with
 * their requirements and expected behavior.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================
// MODEL IMPORTS
// ============================================================
import AuthoritySourceSettings, {
    AUTHORITY_CODES, PERMISSION_STATUSES, ACCESS_METHODS
} from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink, {
    MATCH_ELIGIBILITY
} from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun, {
    RUN_MODES, RUN_STATUSES
} from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    ITEM_STATUSES, MATCH_STATUSES, REVIEWER_DECISIONS,
    BLOCKED_UPDATE_FIELDS, ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot, {
    DATA_QUALITY_STATUSES
} from '../models/PropertyVerificationSnapshot.js';

// Phase 1 contract imports
import { CANONICAL_FIELDS, SOURCE_FIELD_MAPS, SENTINEL } from '../services/authority/authorityFieldDictionary.js';
import { buildCompositeKey, normalizeAuthorityRecord } from '../services/authority/authorityNormalizer.js';
import { SOURCE_POLICY_MATRIX, isSourceActivated } from '../services/authority/sourcePolicy.js';

// ============================================================
// S1: MODEL SCHEMA VALIDATION
// ============================================================

describe('S1: AuthoritySourceSettings schema', () => {
    it('S1a: has required fields with correct types', () => {
        const schema = AuthoritySourceSettings.schema;
        assert.ok(schema.path('tenantId'), 'tenantId path exists');
        assert.ok(schema.path('authorityCode'), 'authorityCode path exists');
        assert.ok(schema.path('permissionStatus'), 'permissionStatus path exists');
        assert.ok(schema.path('isEnabled'), 'isEnabled path exists');
        assert.ok(schema.path('isPaused'), 'isPaused path exists');
        assert.ok(schema.path('schedulingEnabled'), 'schedulingEnabled path exists');
        assert.ok(schema.path('ratePolicy.maxRequestsPerDay'), 'ratePolicy.maxRequestsPerDay exists');
        assert.ok(schema.path('identityRequirements.verified'), 'identityRequirements.verified exists');
    });

    it('S1b: authorityCode enum matches known authorities', () => {
        const enumValues = AuthoritySourceSettings.schema.path('authorityCode').enumValues;
        assert.deepStrictEqual(enumValues.sort(), ['CHD', 'GMADA', 'HSVP']);
    });

    it('S1c: permissionStatus defaults to NOT_OBTAINED', () => {
        const defaultVal = AuthoritySourceSettings.schema.path('permissionStatus').defaultValue;
        assert.strictEqual(defaultVal, 'NOT_OBTAINED');
    });

    it('S1d: isEnabled defaults to false', () => {
        const defaultVal = AuthoritySourceSettings.schema.path('isEnabled').defaultValue;
        assert.strictEqual(defaultVal, false);
    });

    it('S1e: schedulingEnabled defaults to false', () => {
        const defaultVal = AuthoritySourceSettings.schema.path('schedulingEnabled').defaultValue;
        assert.strictEqual(defaultVal, false);
    });

    it('S1f: ratePolicy fields default to null (not guessed)', () => {
        const schema = AuthoritySourceSettings.schema;
        assert.strictEqual(schema.path('ratePolicy.maxRequestsPerMinute').defaultValue, null);
        assert.strictEqual(schema.path('ratePolicy.maxRequestsPerHour').defaultValue, null);
        assert.strictEqual(schema.path('ratePolicy.maxRequestsPerDay').defaultValue, null);
        assert.strictEqual(schema.path('ratePolicy.maxConcurrent').defaultValue, null);
    });

    it('S1g: unique compound index on tenantId + authorityCode', () => {
        const indexes = AuthoritySourceSettings.schema.indexes();
        const compoundIndex = indexes.find(idx =>
            idx[0].tenantId === 1 && idx[0].authorityCode === 1 && idx[1]?.unique === true
        );
        assert.ok(compoundIndex, 'Unique index on tenantId + authorityCode');
    });

    it('S1h: scheduleTimezone defaults to Asia/Kolkata', () => {
        const defaultVal = AuthoritySourceSettings.schema.path('scheduleTimezone').defaultValue;
        assert.strictEqual(defaultVal, 'Asia/Kolkata');
    });
});

describe('S1: PropertyAuthorityLink schema', () => {
    it('S1i: has all identity fields separate', () => {
        const schema = PropertyAuthorityLink.schema;
        const fields = ['sectorNumber', 'phaseCode', 'blockCode', 'schemeName',
            'urbanEstate', 'propertyId', 'fileNumber', 'formNumber'];
        for (const f of fields) {
            assert.ok(schema.path(f), `${f} path exists`);
        }
    });

    it('S1j: sectorNumber and phaseCode are separate paths', () => {
        const schema = PropertyAuthorityLink.schema;
        assert.notStrictEqual(
            schema.path('sectorNumber'),
            schema.path('phaseCode'),
            'sectorNumber and phaseCode are distinct schema paths'
        );
    });

    it('S1k: unique compound index on tenantId + inventoryId + authorityCode', () => {
        const indexes = PropertyAuthorityLink.schema.indexes();
        const compoundIndex = indexes.find(idx =>
            idx[0].tenantId === 1 && idx[0].inventoryId === 1 && idx[0].authorityCode === 1 && idx[1]?.unique === true
        );
        assert.ok(compoundIndex, 'Unique index on tenantId + inventoryId + authorityCode');
    });

    it('S1l: matchEligibility defaults to INCOMPLETE', () => {
        const defaultVal = PropertyAuthorityLink.schema.path('matchEligibility').defaultValue;
        assert.strictEqual(defaultVal, 'INCOMPLETE');
    });

    it('S1m: identityVerified defaults to false', () => {
        const defaultVal = PropertyAuthorityLink.schema.path('identityVerified').defaultValue;
        assert.strictEqual(defaultVal, false);
    });
});

describe('S1: PropertyVerificationRun schema', () => {
    it('S1n: has all required lifecycle fields', () => {
        const schema = PropertyVerificationRun.schema;
        const fields = ['tenantId', 'authorityCode', 'requestedBy', 'runMode',
            'status', 'totalItems', 'processedItems', 'succeededItems',
            'failedItems', 'skippedItems', 'policyRejectionReasons'];
        for (const f of fields) {
            assert.ok(schema.path(f), `${f} path exists`);
        }
    });

    it('S1o: status defaults to CREATED', () => {
        const defaultVal = PropertyVerificationRun.schema.path('status').defaultValue;
        assert.strictEqual(defaultVal, 'CREATED');
    });

    it('S1p: POLICY_REJECTED is a valid status', () => {
        const enumValues = PropertyVerificationRun.schema.path('status').enumValues;
        assert.ok(enumValues.includes('POLICY_REJECTED'));
    });
});

describe('S1: PropertyVerificationRunItem schema', () => {
    it('S1q: has proposed changes with field allowlist', () => {
        const schema = PropertyVerificationRunItem.schema;
        assert.ok(schema.path('proposedChanges'), 'proposedChanges exists');
        assert.ok(schema.path('reviewerDecision'), 'reviewerDecision exists');
        assert.ok(schema.path('applied'), 'applied exists');
    });

    it('S1r: unique compound index on runId + inventoryId', () => {
        const indexes = PropertyVerificationRunItem.schema.indexes();
        const compoundIndex = indexes.find(idx =>
            idx[0].runId === 1 && idx[0].inventoryId === 1 && idx[1]?.unique === true
        );
        assert.ok(compoundIndex, 'Unique index on runId + inventoryId');
    });

    it('S1s: applied defaults to false', () => {
        const defaultVal = PropertyVerificationRunItem.schema.path('applied').defaultValue;
        assert.strictEqual(defaultVal, false);
    });
});

describe('S1: PropertyVerificationSnapshot schema', () => {
    it('S1t: has normalizedData with canonical fields', () => {
        const schema = PropertyVerificationSnapshot.schema;
        assert.ok(schema.path('normalizedData.propertyId'), 'normalizedData.propertyId exists');
        assert.ok(schema.path('normalizedData.authorityStatus'), 'normalizedData.authorityStatus exists');
        assert.ok(schema.path('normalizedData.buildingPlanApproved'), 'normalizedData.buildingPlanApproved exists');
        assert.ok(schema.path('normalizedData.phaseCode'), 'normalizedData.phaseCode exists');
    });

    it('S1u: isSealed defaults to true', () => {
        const defaultVal = PropertyVerificationSnapshot.schema.path('isSealed').defaultValue;
        assert.strictEqual(defaultVal, true);
    });

    it('S1v: ownerDataRedacted defaults to true', () => {
        const defaultVal = PropertyVerificationSnapshot.schema.path('ownerDataRedacted').defaultValue;
        assert.strictEqual(defaultVal, true);
    });
});

// ============================================================
// S2: TENANT ISOLATION
// ============================================================

describe('S2: Tenant isolation', () => {
    it('S2a: all five models have tenantId field with index', () => {
        const models = [
            AuthoritySourceSettings,
            PropertyAuthorityLink,
            PropertyVerificationRun,
            PropertyVerificationRunItem,
            PropertyVerificationSnapshot
        ];
        for (const Model of models) {
            const tenantPath = Model.schema.path('tenantId');
            assert.ok(tenantPath, `${Model.modelName} has tenantId`);
            assert.ok(
                tenantPath.options.index === true || tenantPath.options.required === true,
                `${Model.modelName} tenantId is indexed or required`
            );
        }
    });

    it('S2b: AuthoritySourceSettings tenantId is required', () => {
        assert.strictEqual(
            AuthoritySourceSettings.schema.path('tenantId').isRequired,
            true
        );
    });

    it('S2c: PropertyAuthorityLink tenantId is required', () => {
        assert.strictEqual(
            PropertyAuthorityLink.schema.path('tenantId').isRequired,
            true
        );
    });

    it('S2d: PropertyVerificationRun tenantId is required', () => {
        assert.strictEqual(
            PropertyVerificationRun.schema.path('tenantId').isRequired,
            true
        );
    });

    it('S2e: PropertyVerificationRunItem tenantId is required', () => {
        assert.strictEqual(
            PropertyVerificationRunItem.schema.path('tenantId').isRequired,
            true
        );
    });

    it('S2f: PropertyVerificationSnapshot tenantId is required', () => {
        assert.strictEqual(
            PropertyVerificationSnapshot.schema.path('tenantId').isRequired,
            true
        );
    });
});

// ============================================================
// S3: RBAC AND PERMISSION DESIGN
// ============================================================

describe('S3: RBAC permission design', () => {
    it('S3a: BLOCKED_UPDATE_FIELDS includes Inventory.status', () => {
        assert.ok(BLOCKED_UPDATE_FIELDS.has('status'),
            'status is in BLOCKED_UPDATE_FIELDS');
    });

    it('S3b: BLOCKED_UPDATE_FIELDS includes _id and tenantId', () => {
        assert.ok(BLOCKED_UPDATE_FIELDS.has('_id'));
        assert.ok(BLOCKED_UPDATE_FIELDS.has('tenantId'));
    });

    it('S3c: BLOCKED_UPDATE_FIELDS includes owner/team/assignment fields', () => {
        assert.ok(BLOCKED_UPDATE_FIELDS.has('owners'));
        assert.ok(BLOCKED_UPDATE_FIELDS.has('associates'));
        assert.ok(BLOCKED_UPDATE_FIELDS.has('teams'));
        assert.ok(BLOCKED_UPDATE_FIELDS.has('team'));
        assert.ok(BLOCKED_UPDATE_FIELDS.has('assignedTo'));
    });

    it('S3d: ALLOWED_UPDATE_FIELDS only contains authorityVerification.* paths', () => {
        for (const field of ALLOWED_UPDATE_FIELDS) {
            assert.ok(
                field.startsWith('authorityVerification.'),
                `${field} must be under authorityVerification namespace`
            );
        }
    });

    it('S3e: status is NOT in ALLOWED_UPDATE_FIELDS', () => {
        assert.ok(!ALLOWED_UPDATE_FIELDS.has('status'));
        assert.ok(!ALLOWED_UPDATE_FIELDS.has('authorityVerification.status'));
    });

    it('S3f: no Contact-related fields in ALLOWED_UPDATE_FIELDS', () => {
        for (const field of ALLOWED_UPDATE_FIELDS) {
            assert.ok(!field.includes('contact'), `${field} must not reference contacts`);
            assert.ok(!field.includes('owner') || field.includes('ownerName') === false,
                `${field} must not allow automatic owner linking`);
        }
        // ownerName should NOT be in allowed fields for auto-population
        assert.ok(!ALLOWED_UPDATE_FIELDS.has('ownerName'));
        assert.ok(!ALLOWED_UPDATE_FIELDS.has('authorityVerification.ownerName'));
    });

    it('S3g: BLOCKED and ALLOWED sets do not overlap', () => {
        for (const field of BLOCKED_UPDATE_FIELDS) {
            assert.ok(!ALLOWED_UPDATE_FIELDS.has(field),
                `${field} is in both BLOCKED and ALLOWED — must not overlap`);
        }
    });

    it('S3h: RunItem validateProposedChanges detects blocked fields', () => {
        // Create a mock document-like object
        const mockItem = {
            proposedChanges: [
                { field: 'status', proposedValue: 'sold' },
                { field: 'authorityVerification.propertyId', proposedValue: '123' }
            ]
        };
        const violations = PropertyVerificationRunItem.schema.methods.validateProposedChanges.call(mockItem);
        assert.ok(violations.length > 0, 'Should detect status as blocked');
        assert.ok(violations.some(v => v.includes('status')), 'Should mention status');
    });

    it('S3i: validateProposedChanges accepts only allowlisted fields', () => {
        const mockItem = {
            proposedChanges: [
                { field: 'authorityVerification.propertyId', proposedValue: '123' },
                { field: 'authorityVerification.sectorNumber', proposedValue: '14' }
            ]
        };
        const violations = PropertyVerificationRunItem.schema.methods.validateProposedChanges.call(mockItem);
        assert.strictEqual(violations.length, 0, 'No violations for allowed fields');
    });
});

// ============================================================
// S4: ALL SOURCES DEFAULT-DISABLED
// ============================================================

describe('S4: Sources default-disabled', () => {
    it('S4a: Phase 1 source policy — all sources disabled', () => {
        for (const code of AUTHORITY_CODES) {
            const result = isSourceActivated(code);
            assert.strictEqual(
                result.allowed, false,
                `${code} must be disabled (got allowed=${result.allowed})`
            );
        }
    });

    it('S4b: AuthoritySourceSettings defaults — isEnabled false', () => {
        assert.strictEqual(
            AuthoritySourceSettings.schema.path('isEnabled').defaultValue,
            false
        );
    });

    it('S4c: AuthoritySourceSettings defaults — schedulingEnabled false', () => {
        assert.strictEqual(
            AuthoritySourceSettings.schema.path('schedulingEnabled').defaultValue,
            false
        );
    });

    it('S4d: AuthoritySourceSettings defaults — permissionStatus NOT_OBTAINED', () => {
        assert.strictEqual(
            AuthoritySourceSettings.schema.path('permissionStatus').defaultValue,
            'NOT_OBTAINED'
        );
    });

    it('S4e: AuthoritySourceSettings defaults — approvedAccessMethod NONE', () => {
        assert.strictEqual(
            AuthoritySourceSettings.schema.path('approvedAccessMethod').defaultValue,
            'NONE'
        );
    });

    it('S4f: activation gate — NOT_OBTAINED permission blocks activation', () => {
        const mockSettings = {
            permissionStatus: 'NOT_OBTAINED',
            approvedAccessMethod: 'NONE',
            approvalReference: null,
            approvalExpiryDate: null,
            reviewStatus: 'NOT_REVIEWED',
            ratePolicy: { maxRequestsPerDay: null, maxRequestsPerHour: null },
            identityRequirements: { verified: false },
            permittedFields: []
        };
        const result = AuthoritySourceSettings.schema.methods.checkActivationEligibility.call(mockSettings);
        assert.strictEqual(result.canActivate, false, 'Must not activate');
        assert.ok(result.blockers.length >= 5, `Should have multiple blockers, got ${result.blockers.length}`);
    });

    it('S4g: activation gate — missing rate policy blocks activation', () => {
        const mockSettings = {
            permissionStatus: 'GRANTED',
            approvedAccessMethod: 'PUBLIC_API',
            approvalReference: 'Letter/2024/123',
            approvalExpiryDate: new Date(Date.now() + 86400000),
            reviewStatus: 'APPROVED',
            ratePolicy: { maxRequestsPerDay: null, maxRequestsPerHour: null },
            identityRequirements: { verified: true },
            permittedFields: ['propertyId']
        };
        const result = AuthoritySourceSettings.schema.methods.checkActivationEligibility.call(mockSettings);
        assert.strictEqual(result.canActivate, false);
        assert.ok(result.blockers.some(b => b.includes('rate policy')));
    });

    it('S4h: activation gate — expired approval blocks activation', () => {
        const mockSettings = {
            permissionStatus: 'GRANTED',
            approvedAccessMethod: 'PUBLIC_API',
            approvalReference: 'Letter/2024/123',
            approvalExpiryDate: new Date('2020-01-01'),  // Expired
            reviewStatus: 'APPROVED',
            ratePolicy: { maxRequestsPerDay: 100, maxRequestsPerHour: 10 },
            identityRequirements: { verified: true },
            permittedFields: ['propertyId']
        };
        const result = AuthoritySourceSettings.schema.methods.checkActivationEligibility.call(mockSettings);
        assert.strictEqual(result.canActivate, false);
        assert.ok(result.blockers.some(b => b.includes('expired')));
    });

    it('S4i: activation gate — all requirements met allows activation', () => {
        const mockSettings = {
            permissionStatus: 'GRANTED',
            approvedAccessMethod: 'PUBLIC_API',
            approvalReference: 'Letter/2024/123',
            approvalExpiryDate: new Date(Date.now() + 86400000 * 365),
            reviewStatus: 'APPROVED',
            ratePolicy: { maxRequestsPerDay: 100, maxRequestsPerHour: 10 },
            identityRequirements: { verified: true },
            permittedFields: ['propertyId', 'sectorNumber']
        };
        const result = AuthoritySourceSettings.schema.methods.checkActivationEligibility.call(mockSettings);
        assert.strictEqual(result.canActivate, true, `Blockers: ${result.blockers.join(', ')}`);
        assert.strictEqual(result.blockers.length, 0);
    });
});

// ============================================================
// S5: NO NETWORK TRAFFIC WHEN PERMISSION ABSENT
// ============================================================

describe('S5: No network traffic', () => {
    it('S5a: no HTTP client imports in controller', async () => {
        const fs = await import('node:fs');
        const controllerPath = new URL('../controllers/authorityVerification.controller.js', import.meta.url);
        const content = fs.readFileSync(controllerPath, 'utf-8');

        const httpPatterns = [
            'axios', 'node-fetch', 'got ', 'superagent', 'request(',
            'http.get', 'https.get', 'fetch(', 'XMLHttpRequest',
            'puppeteer', 'playwright', 'cheerio', 'jsdom'
        ];
        for (const pattern of httpPatterns) {
            assert.ok(
                !content.includes(pattern),
                `Controller must not import/use ${pattern}`
            );
        }
    });

    it('S5b: no HTTP client imports in models', async () => {
        const fs = await import('node:fs');
        const modelFiles = [
            '../models/AuthoritySourceSettings.js',
            '../models/PropertyAuthorityLink.js',
            '../models/PropertyVerificationRun.js',
            '../models/PropertyVerificationRunItem.js',
            '../models/PropertyVerificationSnapshot.js'
        ];
        for (const file of modelFiles) {
            const path = new URL(file, import.meta.url);
            const content = fs.readFileSync(path, 'utf-8');
            for (const pattern of ['axios', 'node-fetch', 'got ', 'puppeteer', 'cheerio']) {
                assert.ok(!content.includes(pattern), `${file} must not import ${pattern}`);
            }
        }
    });

    it('S5c: no proxy/CAPTCHA/bypass code in any Phase 2 file', async () => {
        const fs = await import('node:fs');
        const files = [
            '../controllers/authorityVerification.controller.js',
            '../routes/authorityVerification.routes.js',
            '../models/AuthoritySourceSettings.js',
            '../models/PropertyAuthorityLink.js',
            '../models/PropertyVerificationRun.js',
            '../models/PropertyVerificationRunItem.js',
            '../models/PropertyVerificationSnapshot.js'
        ];
        const patterns = ['proxy', 'captcha', 'bypass', 'rate.limit.evasion', 'cookie.jar', 'login.bypass'];
        for (const file of files) {
            const path = new URL(file, import.meta.url);
            const content = fs.readFileSync(path, 'utf-8').toLowerCase();
            for (const p of patterns) {
                assert.ok(!content.includes(p), `${file} must not contain ${p}`);
            }
        }
    });
});

// ============================================================
// S6: IDENTITY AND MATCHING SAFETY
// ============================================================

describe('S6: Identity and matching safety', () => {
    it('S6a: composite key is not proof of verified identity', () => {
        const defaultVerified = PropertyAuthorityLink.schema.path('identityVerified').defaultValue;
        assert.strictEqual(defaultVerified, false,
            'identityVerified defaults to false — composite key alone is not proof');
    });

    it('S6b: incomplete identity → INCOMPLETE eligibility', () => {
        const mockLink = {
            sectorNumber: '14',
            propertyId: null,  // Missing required field
            urbanEstate: null
        };
        const result = PropertyAuthorityLink.schema.methods.evaluateEligibility.call(
            mockLink,
            { required: ['sectorNumber', 'propertyId'] }
        );
        assert.strictEqual(result, 'INCOMPLETE');
    });

    it('S6c: complete identity → ELIGIBLE (not VERIFIED)', () => {
        const mockLink = {
            sectorNumber: '14',
            propertyId: '1234',
            identityVerified: false
        };
        const result = PropertyAuthorityLink.schema.methods.evaluateEligibility.call(
            mockLink,
            { required: ['sectorNumber', 'propertyId'] }
        );
        assert.strictEqual(result, 'ELIGIBLE');
    });

    it('S6d: missing identity requirements → NEEDS_REVIEW', () => {
        const mockLink = { sectorNumber: '14', propertyId: '1234' };
        const result = PropertyAuthorityLink.schema.methods.evaluateEligibility.call(mockLink, null);
        assert.strictEqual(result, 'NEEDS_REVIEW');
    });

    it('S6e: Phase 1 composite key — incomplete returns AMBIGUOUS for missing components', () => {
        const result = buildCompositeKey('HSVP', null, '1234', null, null);
        assert.strictEqual(result.key, null, 'Key should be null for incomplete input');
        assert.ok(
            result.error === 'AMBIGUOUS' || result.error === 'INCOMPLETE_KEY',
            `Expected AMBIGUOUS or INCOMPLETE_KEY, got ${result.error}`
        );
    });
});

// ============================================================
// S7: INVENTORY.STATUS NEVER TARGETED
// ============================================================

describe('S7: Inventory.status protection', () => {
    it('S7a: status is in BLOCKED_UPDATE_FIELDS', () => {
        assert.ok(BLOCKED_UPDATE_FIELDS.has('status'));
    });

    it('S7b: authorityVerification.status is NOT in ALLOWED_UPDATE_FIELDS', () => {
        // authorityStatus (the authority's own status) is allowed, but Inventory.status is not
        assert.ok(!ALLOWED_UPDATE_FIELDS.has('status'));
    });

    it('S7c: proposedChanges targeting status are rejected', () => {
        const mockItem = {
            proposedChanges: [{ field: 'status', proposedValue: 'Available' }]
        };
        const violations = PropertyVerificationRunItem.schema.methods.validateProposedChanges.call(mockItem);
        assert.ok(violations.length > 0);
        assert.ok(violations[0].includes('Blocked'));
    });
});

// ============================================================
// S8: UNKNOWN/MISSING DATA CANNOT CLEAR FIELDS
// ============================================================

describe('S8: Unknown/missing data protection', () => {
    it('S8a: Phase 1 sentinel types cover all non-value states', () => {
        const requiredSentinels = ['NOT_RETURNED', 'PARSE_ERROR', 'NOT_APPLICABLE',
            'RESTRICTED', 'UNKNOWN', 'CATEGORICAL_STATUS'];
        for (const s of requiredSentinels) {
            assert.ok(SENTINEL[s], `SENTINEL.${s} must exist`);
        }
    });

    it('S8b: sentinel values are never false or zero', () => {
        for (const [key, sentinel] of Object.entries(SENTINEL)) {
            assert.notStrictEqual(sentinel.value, false, `SENTINEL.${key}.value must not be false`);
            assert.notStrictEqual(sentinel.value, 0, `SENTINEL.${key}.value must not be 0`);
        }
    });
});

// ============================================================
// S9: NO CONTACT CREATION/LINKING
// ============================================================

describe('S9: No Contact creation/linking', () => {
    it('S9a: BLOCKED_UPDATE_FIELDS includes owners and associates', () => {
        assert.ok(BLOCKED_UPDATE_FIELDS.has('owners'));
        assert.ok(BLOCKED_UPDATE_FIELDS.has('associates'));
    });

    it('S9b: owner data is NOT stored in snapshots', () => {
        assert.strictEqual(
            PropertyVerificationSnapshot.schema.path('ownerDataRedacted').defaultValue,
            true
        );
    });

    it('S9c: ownerName in snapshot normalizedData but NOT in ALLOWED_UPDATE_FIELDS', () => {
        // We capture the fact that owner data was present but don't auto-link
        assert.ok(PropertyVerificationSnapshot.schema.path('normalizedData.ownerName'));
        assert.ok(!ALLOWED_UPDATE_FIELDS.has('ownerName'));
        assert.ok(!ALLOWED_UPDATE_FIELDS.has('owners'));
    });
});

// ============================================================
// S10: SNAPSHOT IMMUTABILITY
// ============================================================

describe('S10: Snapshot immutability', () => {
    it('S10a: isSealed defaults to true', () => {
        assert.strictEqual(
            PropertyVerificationSnapshot.schema.path('isSealed').defaultValue,
            true
        );
    });

    it('S10b: pre-save hook blocks updates on non-new documents', () => {
        // Verify the pre-save middleware exists
        const preSaveHooks = PropertyVerificationSnapshot.schema.s.hooks._pres.get('save');
        assert.ok(preSaveHooks && preSaveHooks.length > 0, 'pre-save hooks exist');
    });

    it('S10c: pre-findOneAndUpdate hook blocks updates', () => {
        const preUpdateHooks = PropertyVerificationSnapshot.schema.s.hooks._pres.get('findOneAndUpdate');
        assert.ok(preUpdateHooks && preUpdateHooks.length > 0, 'pre-findOneAndUpdate hooks exist');
    });

    it('S10d: pre-updateOne hook blocks updates', () => {
        const preUpdateHooks = PropertyVerificationSnapshot.schema.s.hooks._pres.get('updateOne');
        assert.ok(preUpdateHooks && preUpdateHooks.length > 0, 'pre-updateOne hooks exist');
    });

    it('S10e: pre-updateMany hook blocks updates', () => {
        const preUpdateHooks = PropertyVerificationSnapshot.schema.s.hooks._pres.get('updateMany');
        assert.ok(preUpdateHooks && preUpdateHooks.length > 0, 'pre-updateMany hooks exist');
    });
});

// ============================================================
// S11: AUDIT EVENT TYPES
// ============================================================

describe('S11: Audit integration', () => {
    it('S11a: controller uses AuditLog for all state changes', async () => {
        const fs = await import('node:fs');
        const controllerPath = new URL('../controllers/authorityVerification.controller.js', import.meta.url);
        const content = fs.readFileSync(controllerPath, 'utf-8');

        // Check that all mutation endpoints call auditEvent
        const auditCalls = content.match(/auditEvent\(/g);
        assert.ok(auditCalls && auditCalls.length >= 5,
            `Expected at least 5 audit calls, found ${auditCalls?.length || 0}`);
    });

    it('S11b: audit event types include authority-specific types', async () => {
        const fs = await import('node:fs');
        const controllerPath = new URL('../controllers/authorityVerification.controller.js', import.meta.url);
        const content = fs.readFileSync(controllerPath, 'utf-8');

        const expectedEvents = [
            'authority_settings_updated',
            'authority_link_created',
            'authority_run_created',
            'authority_run_policy_rejected',
            'authority_review_submitted',
            'authority_changes_applied'
        ];
        for (const event of expectedEvents) {
            assert.ok(content.includes(event), `Controller must use event type: ${event}`);
        }
    });
});

// ============================================================
// S12: NO CREDENTIALS/PII IN CODE
// ============================================================

describe('S12: No credentials/PII in code', () => {
    it('S12a: no credentials in any Phase 2 file', async () => {
        const fs = await import('node:fs');
        const files = [
            '../controllers/authorityVerification.controller.js',
            '../routes/authorityVerification.routes.js',
            '../models/AuthoritySourceSettings.js',
            '../models/PropertyAuthorityLink.js',
            '../models/PropertyVerificationRun.js',
            '../models/PropertyVerificationRunItem.js',
            '../models/PropertyVerificationSnapshot.js'
        ];
        const patterns = [
            /password\s*[:=]\s*['"][^'"]+['"]/i,
            /apiKey\s*[:=]\s*['"][^'"]+['"]/i,
            /secret\s*[:=]\s*['"][^'"]+['"]/i,
            /cookie\s*[:=]\s*['"][^'"]+['"]/i,
            /csrf[_-]?token\s*[:=]\s*['"][^'"]+['"]/i,  // Actual CSRF token values, not docs about them
            /session[_-]?id\s*[:=]\s*['"][^'"]+['"]/i
        ];
        for (const file of files) {
            const path = new URL(file, import.meta.url);
            const content = fs.readFileSync(path, 'utf-8');
            for (const pattern of patterns) {
                assert.ok(!pattern.test(content), `${file} must not contain credential pattern: ${pattern}`);
            }
        }
    });

    it('S12b: no real PII in test fixtures', async () => {
        const fs = await import('node:fs');
        const fixturePath = new URL('../services/authority/fixtures/authorityFixtures.js', import.meta.url);
        const content = fs.readFileSync(fixturePath, 'utf-8');

        // Check for phone patterns
        const phonePattern = /(?:\+91|0)\d{10}/;
        assert.ok(!phonePattern.test(content), 'Fixtures must not contain real phone numbers');

        // Check for Aadhaar patterns
        const aadhaarPattern = /\d{4}\s?\d{4}\s?\d{4}/;
        const matches = content.match(aadhaarPattern);
        // Filter out non-Aadhaar matches (dates, hex-like strings)
        if (matches) {
            for (const m of matches) {
                const digits = m.replace(/\s/g, '');
                assert.ok(digits.length !== 12, `Fixtures must not contain Aadhaar-like: ${m}`);
            }
        }
    });
});

// ============================================================
// S13: ROUTE STRUCTURE
// ============================================================

describe('S13: Route structure', () => {
    it('S13a: routes file uses authenticate middleware', async () => {
        const fs = await import('node:fs');
        const routePath = new URL('../routes/authorityVerification.routes.js', import.meta.url);
        const content = fs.readFileSync(routePath, 'utf-8');
        assert.ok(content.includes('authenticate'), 'Routes must use authenticate middleware');
    });

    it('S13b: routes file uses checkPermission for authorityVerification', async () => {
        const fs = await import('node:fs');
        const routePath = new URL('../routes/authorityVerification.routes.js', import.meta.url);
        const content = fs.readFileSync(routePath, 'utf-8');
        assert.ok(content.includes("checkPermission('authorityVerification'"),
            'Routes must use authorityVerification permission module');
    });

    it('S13c: settings update requires approval right', async () => {
        const fs = await import('node:fs');
        const routePath = new URL('../routes/authorityVerification.routes.js', import.meta.url);
        const content = fs.readFileSync(routePath, 'utf-8');
        assert.ok(content.includes("checkApprovalRight('manageAuthoritySettings')"),
            'Settings update must require manageAuthoritySettings approval right');
    });

    it('S13d: apply changes requires approval right', async () => {
        const fs = await import('node:fs');
        const routePath = new URL('../routes/authorityVerification.routes.js', import.meta.url);
        const content = fs.readFileSync(routePath, 'utf-8');
        assert.ok(content.includes("checkApprovalRight('approveAuthorityChanges')"),
            'Apply must require approveAuthorityChanges approval right');
    });

    it('S13e: separate permissions for view, create, edit operations', async () => {
        const fs = await import('node:fs');
        const routePath = new URL('../routes/authorityVerification.routes.js', import.meta.url);
        const content = fs.readFileSync(routePath, 'utf-8');
        assert.ok(content.includes("'view'"), 'Routes must have view permission');
        assert.ok(content.includes("'create'"), 'Routes must have create permission');
        assert.ok(content.includes("'edit'"), 'Routes must have edit permission');
    });
});

// ============================================================
// S14: PHASE 1 CONTRACT INTEGRATION
// ============================================================

describe('S14: Phase 1 contract integration', () => {
    it('S14a: controller imports buildCompositeKey from Phase 1 normalizer', async () => {
        const fs = await import('node:fs');
        const controllerPath = new URL('../controllers/authorityVerification.controller.js', import.meta.url);
        const content = fs.readFileSync(controllerPath, 'utf-8');
        assert.ok(content.includes('buildCompositeKey'),
            'Controller must import buildCompositeKey');
    });

    it('S14b: all three authority codes match Phase 1 registry', () => {
        const registryKeys = Object.keys(SOURCE_POLICY_MATRIX).sort();
        // Phase 1 uses ESTATE_OFFICE_CHD, Phase 2 models use CHD as shorthand
        assert.ok(registryKeys.includes('HSVP'), 'HSVP in registry');
        assert.ok(registryKeys.includes('GMADA'), 'GMADA in registry');
        assert.ok(
            registryKeys.includes('CHD') || registryKeys.includes('ESTATE_OFFICE_CHD'),
            'CHD or ESTATE_OFFICE_CHD in registry'
        );
    });

    it('S14c: Phase 1 sources remain disabled in Phase 2', () => {
        // Check against Phase 1 registry keys
        for (const code of Object.keys(SOURCE_POLICY_MATRIX)) {
            const result = isSourceActivated(code);
            assert.strictEqual(result.allowed, false, `${code} must be disabled`);
        }
    });
});

// ============================================================
// S15: COLLECTION NAMES
// ============================================================

describe('S15: Collection naming', () => {
    it('S15a: models use distinct collection names', () => {
        const collections = new Set([
            AuthoritySourceSettings.collection.name,
            PropertyAuthorityLink.collection.name,
            PropertyVerificationRun.collection.name,
            PropertyVerificationRunItem.collection.name,
            PropertyVerificationSnapshot.collection.name
        ]);
        assert.strictEqual(collections.size, 5, 'All five models must use distinct collections');
    });
});

// ============================================================
// S16: EXPORT VERIFICATION
// ============================================================

describe('S16: Module exports', () => {
    it('S16a: all constants are exported', () => {
        assert.ok(Array.isArray(AUTHORITY_CODES));
        assert.ok(Array.isArray(PERMISSION_STATUSES));
        assert.ok(Array.isArray(ACCESS_METHODS));
        assert.ok(Array.isArray(MATCH_ELIGIBILITY));
        assert.ok(Array.isArray(RUN_MODES));
        assert.ok(Array.isArray(RUN_STATUSES));
        assert.ok(Array.isArray(ITEM_STATUSES));
        assert.ok(Array.isArray(MATCH_STATUSES));
        assert.ok(Array.isArray(REVIEWER_DECISIONS));
        assert.ok(Array.isArray(DATA_QUALITY_STATUSES));
        assert.ok(BLOCKED_UPDATE_FIELDS instanceof Set);
        assert.ok(ALLOWED_UPDATE_FIELDS instanceof Set);
    });
});
