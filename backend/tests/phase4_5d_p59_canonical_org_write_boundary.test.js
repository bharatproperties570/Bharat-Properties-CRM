/**
 * Phase 4.5-D PR #60 Regression Test Suite:
 * Canonical Organization Enforcement, Database Write-Path Closure & Audit Privacy Finalization
 *
 * Verifies:
 * Area 1: Single Organization Enforcement & Identity Immutability (Finding A)
 * Area 2: Complete bulkWrite Protection (Finding B)
 * Area 3: Direct insertMany Restriction (Finding C)
 * Area 4: Audit PII Protection & Citizen Names (Finding D)
 * Area 5: Environment Classification Safety (Finding E)
 * Area 6: HMAC Capability Scope & Replay Protection (Finding F)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING,
    verifyCanonicalOrganizationContext,
    getCanonicalOrganizationContext
} from '../config/canonicalOrganization.js';

import AuthoritySourceSettings, {
    createAuthorizedInternalWorkflowToken,
    verifyAuthorizedInternalWorkflow,
    INTERNAL_WORKFLOW_OPTION
} from '../models/AuthoritySourceSettings.js';

import AuditLog, { maskScalarPII } from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import {
    isEnvironmentProductionOrUnsafe,
    isProductionEnvironment,
    verifyDatabaseEnvironmentSafety
} from '../services/authority/databaseEnvironmentSafety.js';

import {
    getSourceSettings,
    getSourceSettingByCode,
    recordSourceApprover,
    reviewSourceApproval,
    applyApprovedChanges
} from '../controllers/authorityVerification.controller.js';

let mongoServer;
const canonicalTenantId = CANONICAL_ORGANIZATION_ID;
const nonCanonicalTenantId = new mongoose.Types.ObjectId('111111111111111111111111');

let testRole;
let canonicalUser;
let nonCanonicalUser;
let noTenantUser;

function createMockRes() {
    return {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };
}

test.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await User.createCollection();
    await Role.createCollection();
    await AuditLog.createCollection();
    await AuthoritySourceSettings.createCollection();

    testRole = await Role.create({
        name: 'P60 Compliance Role',
        department: 'accounts',
        tenantId: canonicalTenantId,
        permissions: ['authorityVerification.view', 'authorityVerification.edit', 'authorityVerification.approve'],
        approvalRights: {
            manageAuthoritySettings: true,
            approveAuthorityChanges: true
        }
    });

    canonicalUser = await User.create({
        fullName: 'Canonical Operator',
        email: 'canonical@bharatproperties.test',
        password: 'Password123!',
        department: 'accounts',
        tenantId: canonicalTenantId,
        role: testRole._id,
        isActive: true,
        status: 'active'
    });

    nonCanonicalUser = await User.create({
        fullName: 'Foreign Tenant Operator',
        email: 'foreign@otherorg.test',
        password: 'Password123!',
        department: 'accounts',
        tenantId: nonCanonicalTenantId,
        role: testRole._id,
        isActive: true,
        status: 'active'
    });

    noTenantUser = {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'No Tenant User',
        email: 'notenant@test.local',
        role: testRole._id
        // tenantId omitted intentionally
    };

    // Initialize defaults safely for canonical org
    await AuthoritySourceSettings.ensureDefaults(canonicalTenantId);
});

test.after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

// ============================================================================
// AREA 1: SINGLE ORGANIZATION ENFORCEMENT & IDENTITY IMMUTABILITY (FINDING A)
// ============================================================================

test('Area 1.1: Canonical Organization Context invariants', () => {
    assert.strictEqual(CANONICAL_ORGANIZATION_ID_STRING, '000000000000000000000001');
    assert.strictEqual(canonicalTenantId.toString(), '000000000000000000000001');

    const ctx = getCanonicalOrganizationContext();
    assert.strictEqual(ctx.organizationId.toString(), '000000000000000000000001');
    assert.strictEqual(ctx.organizationName, 'Bharat Properties');
    assert.strictEqual(ctx.model, 'SINGLE_ORGANIZATION');
    assert.strictEqual(ctx.tenantDevelopmentStatus, 'HOLD');
});

test('Area 1.2: Controller rejects user without tenantId (no fallback to user._id)', async () => {
    const req = {
        user: noTenantUser,
        body: {},
        query: {},
        headers: {}
    };
    const res = createMockRes();
    await getSourceSettings(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'Tenant context required');
});

test('Area 1.3: Controller rejects user with non-canonical tenantId with 403 ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
    const req = {
        user: nonCanonicalUser,
        body: {},
        query: {},
        headers: {}
    };
    const res = createMockRes();
    await getSourceSettings(req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
});

test('Area 1.4: Controller rejects client overrides in body, query, and headers', async () => {
    // Body override attempt
    {
        const req = {
            user: canonicalUser,
            body: { tenantId: '111111111111111111111111' },
            query: {},
            headers: {}
        };
        const res = createMockRes();
        await getSourceSettings(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
    }

    // Query override attempt
    {
        const req = {
            user: canonicalUser,
            body: {},
            query: { tenantId: '111111111111111111111111' },
            headers: {}
        };
        const res = createMockRes();
        await getSourceSettings(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
    }

    // Header override attempt
    {
        const req = {
            user: canonicalUser,
            body: {},
            query: {},
            headers: { 'x-tenant-id': '111111111111111111111111' }
        };
        const res = createMockRes();
        await getSourceSettings(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
    }
});

test('Area 1.5: ensureDefaults rejects non-canonical organization ID with ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.ensureDefaults(nonCanonicalTenantId);
        },
        (err) => {
            assert.strictEqual(err.message, 'ORGANIZATION_OVERRIDE_PROHIBITED');
            return true;
        }
    );
});

test('Area 1.6: ensureDefaults establishes GRANTED permission with OWNER_ATTESTED evidence basis for canonical organization', async () => {
    const docs = await AuthoritySourceSettings.getAllForTenant(canonicalTenantId);
    assert.strictEqual(docs.length, 3);
    for (const doc of docs) {
        assert.strictEqual(doc.permissionStatus, 'GRANTED');
        assert.strictEqual(doc.evidenceBasis, 'OWNER_ATTESTED_AUTHORITY_PERMISSION');
        assert.strictEqual(doc.approvedAccessMethod, 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION');
        assert.strictEqual(doc.isEnabled, false);
        assert.strictEqual(doc.schedulingEnabled, false);
        assert.strictEqual(doc.reviewStatus, 'UNDER_REVIEW');
    }
});

test('Area 1.7: tenantId is immutable on save()', async () => {
    const doc = await AuthoritySourceSettings.findOne({ tenantId: canonicalTenantId, authorityCode: 'HSVP' });
    assert.ok(doc);

    doc.tenantId = nonCanonicalTenantId;
    await assert.rejects(
        async () => {
            await doc.save();
        },
        (err) => {
            assert.strictEqual(err.code, 'IMMUTABLE_IDENTITY_PROHIBITED');
            return true;
        }
    );
});

test('Area 1.8: tenantId and authorityCode are immutable across Mongoose update operators', async () => {
    // updateOne attempting to mutate tenantId via $set
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                { $set: { tenantId: nonCanonicalTenantId } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'IMMUTABLE_IDENTITY_PROHIBITED');
            return true;
        }
    );

    // updateOne attempting to mutate authorityCode via $set
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateOne(
                { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                { $set: { authorityCode: 'GMADA' } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'IMMUTABLE_IDENTITY_PROHIBITED');
            return true;
        }
    );

    // findOneAndUpdate attempting to rename tenantId via $rename
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                { $rename: { tenantId: 'oldTenantId' } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'IMMUTABLE_IDENTITY_PROHIBITED');
            return true;
        }
    );

    // updateMany attempting to unset authorityCode via $unset
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.updateMany(
                { tenantId: canonicalTenantId },
                { $unset: { authorityCode: 1 } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'IMMUTABLE_IDENTITY_PROHIBITED');
            return true;
        }
    );
});

test('Area 1.9: Query filter targeting non-canonical organization is prohibited', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: nonCanonicalTenantId, authorityCode: 'HSVP' },
                { $set: { notes: 'Forbidden query' } }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
            return true;
        }
    );
});

// ============================================================================
// AREA 2: COMPLETE BULKWRITE PROTECTION (FINDING B)
// ============================================================================

test('Area 2.1: bulkWrite deleteOne and deleteMany throw BULK_DELETE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                { deleteOne: { filter: { tenantId: canonicalTenantId, authorityCode: 'HSVP' } } }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'BULK_DELETE_PROHIBITED');
            return true;
        }
    );

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                { deleteMany: { filter: { tenantId: canonicalTenantId } } }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'BULK_DELETE_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.2: bulkWrite replaceOne throws DIRECT_BULK_WRITE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    replaceOne: {
                        filter: { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                        replacement: { tenantId: canonicalTenantId, authorityCode: 'HSVP', isEnabled: false }
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.3: bulkWrite insertOne with non-canonical tenantId throws ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    insertOne: {
                        document: {
                            tenantId: nonCanonicalTenantId,
                            authorityCode: 'HSVP',
                            permissionStatus: 'NOT_OBTAINED'
                        }
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.4: bulkWrite update mutating identity fields throws IMMUTABLE_IDENTITY_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                        update: { $set: { tenantId: nonCanonicalTenantId } }
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'IMMUTABLE_IDENTITY_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.5: bulkWrite upsert with non-canonical tenantId in filter or setOnInsert throws ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: nonCanonicalTenantId, authorityCode: 'HSVP' },
                        update: { $setOnInsert: { isEnabled: false } },
                        upsert: true
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
            return true;
        }
    );

    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                        update: { $setOnInsert: { tenantId: nonCanonicalTenantId } },
                        upsert: true
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.6: bulkWrite touching protected fields without ensureDefaults token throws DIRECT_BULK_WRITE_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite([
                {
                    updateOne: {
                        filter: { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                        update: { $set: { isEnabled: true } }
                    }
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            return true;
        }
    );
});

test('Area 2.7: bulkWrite ensureDefaults cannot initialize active or approved states', async () => {
    const token = createAuthorizedInternalWorkflowToken('ensureDefaults', { tenantId: canonicalTenantId });
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.bulkWrite(
                [
                    {
                        updateOne: {
                            filter: { tenantId: canonicalTenantId, authorityCode: 'HSVP' },
                            update: {
                                $setOnInsert: {
                                    tenantId: canonicalTenantId,
                                    authorityCode: 'HSVP',
                                    isEnabled: true // Prohibited active initialization
                                }
                            },
                            upsert: true
                        }
                    }
                ],
                { [INTERNAL_WORKFLOW_OPTION]: token }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_BULK_WRITE_PROHIBITED');
            return true;
        }
    );
});

// ============================================================================
// AREA 3: INSERTMANY RESTRICTION (FINDING C)
// ============================================================================

test('Area 3.1: Direct AuthoritySourceSettings.insertMany() throws DIRECT_INSERT_MANY_PROHIBITED', async () => {
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.insertMany([
                {
                    tenantId: canonicalTenantId,
                    authorityCode: 'HSVP',
                    permissionStatus: 'NOT_OBTAINED'
                }
            ]);
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_INSERT_MANY_PROHIBITED');
            return true;
        }
    );
});

test('Area 3.2: Authorized insertMany with active/approved state throws DIRECT_INSERT_MANY_PROHIBITED', async () => {
    const token = createAuthorizedInternalWorkflowToken('internal_seed', { tenantId: canonicalTenantId });
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.insertMany(
                [
                    {
                        tenantId: canonicalTenantId,
                        authorityCode: 'HSVP',
                        isEnabled: true
                    }
                ],
                { [INTERNAL_WORKFLOW_OPTION]: token }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'DIRECT_INSERT_MANY_PROHIBITED');
            return true;
        }
    );
});

test('Area 3.3: Authorized insertMany with non-canonical tenantId throws ORGANIZATION_OVERRIDE_PROHIBITED', async () => {
    const token = createAuthorizedInternalWorkflowToken('internal_seed', { tenantId: canonicalTenantId });
    await assert.rejects(
        async () => {
            await AuthoritySourceSettings.insertMany(
                [
                    {
                        tenantId: nonCanonicalTenantId,
                        authorityCode: 'HSVP',
                        isEnabled: false
                    }
                ],
                { [INTERNAL_WORKFLOW_OPTION]: token }
            );
        },
        (err) => {
            assert.strictEqual(err.code, 'ORGANIZATION_OVERRIDE_PROHIBITED');
            return true;
        }
    );
});

// ============================================================================
// AREA 4: AUDIT PII PROTECTION & CITIZEN NAMES (FINDING D)
// ============================================================================

test('Area 4.1: Citizen names in audit description are masked to [PII_MINIMIZED]', () => {
    const testCases = [
        'Citizen Rahul Sharma filed application for Sector 14',
        'Allottee Amit Kumar requested review',
        'Resident Sunita Devi verified property details',
        'Applicant Vikram Singh submitted papers',
        'Buyer Rohit Verma confirmed transaction',
        'Shri Ramesh Chand updated record',
        'Smt Priya Patel transferred plot',
        'Mr. John Doe inspected site',
        'Mrs. Jane Smith verified ledger'
    ];

    for (const text of testCases) {
        const masked = maskScalarPII(text);
        assert.ok(masked.includes('[PII_MINIMIZED]'), `Failed to mask: "${text}" -> "${masked}"`);
        assert.ok(!masked.includes('Rahul Sharma'), `Leaked Rahul Sharma in: ${masked}`);
        assert.ok(!masked.includes('Amit Kumar'), `Leaked Amit Kumar in: ${masked}`);
        assert.ok(!masked.includes('Sunita Devi'), `Leaked Sunita Devi in: ${masked}`);
    }
});

test('Area 4.2: Standalone 6-digit postal PIN codes in audit description are masked to [ADDRESS_MINIMIZED]', () => {
    const text = 'Property located at Sector 14 Panchkula 134109 and Chandigarh 160022';
    const masked = maskScalarPII(text);
    assert.ok(!masked.includes('134109'));
    assert.ok(!masked.includes('160022'));
    assert.ok(masked.includes('[ADDRESS_MINIMIZED]'));
});

test('Area 4.3: AuditLog.create() and .save() sanitize citizen names and PIN codes', async () => {
    const entry = await AuditLog.create({
        eventType: 'authority_settings_updated',
        action: 'CITIZEN_INSPECTION_AUDIT',
        actorId: canonicalUser._id,
        targetType: 'authority_settings',
        targetId: canonicalUser._id,
        description: 'Citizen Rahul Sharma visited Panchkula 134109 to review plot records',
        metadata: {
            allotteeName: 'Citizen Rahul Sharma',
            buyerName: 'Amit Kumar',
            tenantId: canonicalTenantId
        }
    });

    assert.ok(!entry.description.includes('Rahul Sharma'));
    assert.ok(!entry.description.includes('134109'));
    assert.ok(entry.description.includes('[PII_MINIMIZED]'));
    assert.ok(entry.description.includes('[ADDRESS_MINIMIZED]'));
    assert.strictEqual(entry.metadata.allotteeName, '[PII_MINIMIZED]');
    assert.strictEqual(entry.metadata.buyerName, '[PII_MINIMIZED]');
});

test('Area 4.4: AuditLog write paths (insertMany, updateOne, findOneAndUpdate, bulkWrite) sanitize citizen names', async () => {
    // 1. insertMany
    const inserted = await AuditLog.insertMany([
        {
            eventType: 'authority_settings_updated',
            action: 'BATCH_AUDIT_CITIZEN',
            actorId: canonicalUser._id,
            description: 'Allottee Rajesh Kumar with PIN 134109 registered'
        }
    ]);
    assert.ok(!inserted[0].description.includes('Rajesh Kumar'));
    assert.ok(inserted[0].description.includes('[PII_MINIMIZED]'));
    assert.ok(inserted[0].description.includes('[ADDRESS_MINIMIZED]'));

    // 2. updateOne
    await AuditLog.updateOne(
        { _id: inserted[0]._id },
        { $set: { description: 'Updated for Resident Sunita Devi at PIN 160017' } }
    );
    const updated = await AuditLog.findById(inserted[0]._id);
    assert.ok(!updated.description.includes('Sunita Devi'));
    assert.ok(!updated.description.includes('160017'));
    assert.ok(updated.description.includes('[PII_MINIMIZED]'));

    // 3. findOneAndUpdate
    const fau = await AuditLog.findOneAndUpdate(
        { _id: inserted[0]._id },
        { $set: { description: 'Fau check for Citizen Rahul Sharma' } },
        { new: true }
    );
    assert.ok(!fau.description.includes('Rahul Sharma'));
    assert.ok(fau.description.includes('[PII_MINIMIZED]'));

    // 4. bulkWrite
    await AuditLog.bulkWrite([
        {
            updateOne: {
                filter: { _id: inserted[0]._id },
                update: { $set: { description: 'Bulk updated for Applicant Vikram Singh' } }
            }
        }
    ]);
    const bulkUpdated = await AuditLog.findById(inserted[0]._id);
    assert.ok(!bulkUpdated.description.includes('Vikram Singh'));
    assert.ok(bulkUpdated.description.includes('[PII_MINIMIZED]'));
});

// ============================================================================
// AREA 5: ENVIRONMENT CLASSIFICATION SAFETY (FINDING E)
// ============================================================================

test('Area 5.1: All environment variables unset is classified as UNSAFE (fail closed)', () => {
    const emptyEnv = {
        NODE_ENV: undefined,
        APP_ENV: undefined,
        APPLICATION_ENV: undefined,
        ENVIRONMENT: undefined,
        STAGE: undefined
    };
    assert.strictEqual(isEnvironmentProductionOrUnsafe(emptyEnv), true);
});

test('Area 5.2: Unknown environment labels are classified as UNSAFE (fail closed)', () => {
    for (const unknown of ['uat', 'custom_env', 'preprod', 'preview', 'testing_unknown', 'unknown_env']) {
        const env = { NODE_ENV: unknown };
        assert.strictEqual(isEnvironmentProductionOrUnsafe(env), true, `Expected ${unknown} to be unsafe`);
    }
});

test('Area 5.3: Conflicting environment indicators are classified as UNSAFE (fail closed)', () => {
    const conflicting = {
        NODE_ENV: 'test',
        APP_ENV: 'production'
    };
    assert.strictEqual(isEnvironmentProductionOrUnsafe(conflicting), true);

    const conflicting2 = {
        NODE_ENV: 'production',
        APPLICATION_ENV: 'development'
    };
    assert.strictEqual(isEnvironmentProductionOrUnsafe(conflicting2), true);
});

test('Area 5.4: Explicit production labels are classified as UNSAFE', () => {
    for (const prod of ['production', 'prod', 'live', 'primary']) {
        const env = { NODE_ENV: prod };
        assert.strictEqual(isEnvironmentProductionOrUnsafe(env), true);
    }
});

test('Area 5.5: Consistent non-production test environment is classified as safe', () => {
    const validTest = {
        NODE_ENV: 'test',
        APP_ENV: 'test',
        APPLICATION_ENV: 'test'
    };
    assert.strictEqual(isEnvironmentProductionOrUnsafe(validTest), false);
});

// ============================================================================
// AREA 6: HMAC CAPABILITY SCOPE & REPLAY PROTECTION (FINDING F)
// ============================================================================

test('Area 6.1: Token binds workflowName, tenantId, targetId, evidenceVersion, nonce, and timestamp', () => {
    const token = createAuthorizedInternalWorkflowToken('recordSourceApprover', {
        tenantId: canonicalTenantId,
        authorityCode: 'HSVP',
        targetId: 'HSVP',
        evidenceVersion: 2
    });

    assert.strictEqual(token.workflowName, 'recordSourceApprover');
    assert.strictEqual(token.tenantId, CANONICAL_ORGANIZATION_ID_STRING);
    assert.strictEqual(token.targetId, 'HSVP');
    assert.strictEqual(token.evidenceVersion, '2');
    assert.ok(token.nonce && typeof token.nonce === 'string');
    assert.ok(token.timestamp && typeof token.timestamp === 'number');
    assert.ok(token.hmac && typeof token.hmac === 'string');

    // Valid verification
    const verified = verifyAuthorizedInternalWorkflow(
        { [INTERNAL_WORKFLOW_OPTION]: token },
        ['recordSourceApprover'],
        { tenantId: canonicalTenantId, authorityCode: 'HSVP', evidenceVersion: 2 }
    );
    assert.strictEqual(verified, true);
});

test('Area 6.2: Token replay is strictly prohibited (single-use nonce)', () => {
    const token = createAuthorizedInternalWorkflowToken('testWorkflow', {
        tenantId: canonicalTenantId
    });

    // First use succeeds
    const firstUse = verifyAuthorizedInternalWorkflow(
        { [INTERNAL_WORKFLOW_OPTION]: token },
        ['testWorkflow']
    );
    assert.strictEqual(firstUse, true);

    // Second use with identical token/nonce fails (Replay detected)
    const secondUse = verifyAuthorizedInternalWorkflow(
        { [INTERNAL_WORKFLOW_OPTION]: token },
        ['testWorkflow']
    );
    assert.strictEqual(secondUse, false);
});

test('Area 6.3: Context tampering invalidates token', () => {
    // 1. Tampered tenantId
    {
        const token = createAuthorizedInternalWorkflowToken('tamperTest', { tenantId: canonicalTenantId });
        token.tenantId = nonCanonicalTenantId.toString(); // Tampered!
        const verified = verifyAuthorizedInternalWorkflow({ [INTERNAL_WORKFLOW_OPTION]: token }, ['tamperTest']);
        assert.strictEqual(verified, false);
    }

    // 2. Tampered workflowName
    {
        const token = createAuthorizedInternalWorkflowToken('workflowA', { tenantId: canonicalTenantId });
        token.workflowName = 'workflowB'; // Tampered!
        const verified = verifyAuthorizedInternalWorkflow({ [INTERNAL_WORKFLOW_OPTION]: token }, ['workflowA', 'workflowB']);
        assert.strictEqual(verified, false);
    }

    // 3. Tampered targetId / authorityCode
    {
        const token = createAuthorizedInternalWorkflowToken('targetTest', {
            tenantId: canonicalTenantId,
            authorityCode: 'HSVP'
        });
        const verified = verifyAuthorizedInternalWorkflow(
            { [INTERNAL_WORKFLOW_OPTION]: token },
            ['targetTest'],
            { authorityCode: 'GMADA' } // Mismatched target!
        );
        assert.strictEqual(verified, false);
    }

    // 4. Tampered evidenceVersion
    {
        const token = createAuthorizedInternalWorkflowToken('verTest', {
            tenantId: canonicalTenantId,
            evidenceVersion: 1
        });
        const verified = verifyAuthorizedInternalWorkflow(
            { [INTERNAL_WORKFLOW_OPTION]: token },
            ['verTest'],
            { evidenceVersion: 2 } // Mismatched version!
        );
        assert.strictEqual(verified, false);
    }
});

test('Area 6.4: Expired token (> 5 min) is rejected', () => {
    const expiredTimestamp = Date.now() - 360000; // 6 minutes ago
    const token = createAuthorizedInternalWorkflowToken('expireTest', { tenantId: canonicalTenantId });
    token.timestamp = expiredTimestamp; // Expired!
    const verified = verifyAuthorizedInternalWorkflow({ [INTERNAL_WORKFLOW_OPTION]: token }, ['expireTest']);
    assert.strictEqual(verified, false);
});
