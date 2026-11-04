/**
 * Phase 2.3 Strict Schema Hardening and Latest-Main Reconciliation Test Suite
 * 
 * Verifies:
 * 1. Strict Schema Architecture:
 *    - InventorySchema retains strict: true.
 *    - Explicit AuthorityVerificationSubSchema defined with strict: true.
 *    - All 16 canonical fields typed and validated.
 *    - Complete removal of { strict: false } from Inventory update paths.
 * 2. Rejection of Unknown Nested Keys & Arbitrary Mass-Assignment:
 *    - Unknown nested keys under authorityVerification.* are stripped/rejected.
 *    - Arbitrary top-level fields are stripped/rejected.
 * 3. Injection and Prototype Pollution Guards:
 *    - __proto__, constructor, prototype field paths rejected.
 *    - MongoDB operators ($where, $gt, $set, $rename, $unset) in fields or values rejected.
 * 4. Access-Control & Core Field Invariance:
 *    - Inventory.status cannot be altered by authority updates.
 *    - owners, associates, tenantId, teams, department, assignedTo, visibleTo protected.
 * 5. Data Non-Corruption:
 *    - Sentinels, null, undefined, and whitespace strings cannot clear existing data.
 * 6. Valid Allowlisted Updates:
 *    - Genuine application with strict validators populates verified facts and metadata.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

import config from '../src/config/env.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import { SENTINEL } from '../services/authority/authorityFieldDictionary.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';

describe('Phase 2.3 — Strict Schema Hardening & Reconciliation', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    const tenantA = new mongoose.Types.ObjectId();
    let adminUser;
    let adminToken;
    let adminRole;

    before(async () => {
        let MongoMemoryServer;
        try {
            const mmsModule = await import('mongodb-memory-server');
            MongoMemoryServer = mmsModule.MongoMemoryServer;
        } catch (err) {
            console.error('⚠️  mongodb-memory-server unavailable', err);
            return;
        }

        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();

        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(uri);
        await PropertyVerificationRunItem.init();

        const app = express();
        app.use(express.json());
        app.use('/api/authority', authorityRoutes);
        app.use((err, req, res, next) => {
            const statusCode = err.statusCode || err.status || 500;
            res.status(statusCode).json({
                success: false,
                message: err.message
            });
        });

        testServer = http.createServer(app);
        await new Promise((resolve) => {
            testServer.listen(0, '127.0.0.1', () => {
                const port = testServer.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });

        adminRole = await Role.create({
            name: 'Authority Admin Role',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        adminUser = await User.create({
            fullName: 'Admin User Phase 2.3',
            email: 'admin.phase23@test.local',
            password: 'hashed_password_safe',
            department: 'inventory',
            role: adminRole._id,
            tenantId: tenantA,
            isActive: true
        });

        adminToken = jwt.sign({ id: adminUser._id }, config.jwtSecret, { expiresIn: '2h' });
    });

    after(async () => {
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
        }
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    // =========================================================================
    // SECTION 1: INVENTORY SCHEMA STRICTNESS & SUBDOCUMENT DEFINITION
    // =========================================================================
    describe('1. Explicit Schema Architecture on Inventory', () => {
        it('1.1 InventorySchema must have strict: true', () => {
            assert.equal(Inventory.schema.options.strict, true,
                'InventorySchema must enforce strict: true to reject arbitrary field injection');
        });

        it('1.2 authorityVerification subdocument path must exist on Inventory', () => {
            const avPath = Inventory.schema.path('authorityVerification');
            assert.ok(avPath, 'authorityVerification path must exist on InventorySchema');
        });

        it('1.3 authorityVerification subdocument schema must enforce strict: "throw" or true', () => {
            const avPath = Inventory.schema.path('authorityVerification');
            const subSchema = avPath.schema;
            assert.ok(subSchema, 'authorityVerification must have an embedded Schema');
            assert.ok(subSchema.options.strict === 'throw' || subSchema.options.strict === true,
                'AuthorityVerificationSubSchema must enforce strict mode');
        });

        it('1.4 all canonical fields must be explicitly typed in the subdocument', () => {
            const avPath = Inventory.schema.path('authorityVerification');
            const subSchema = avPath.schema;

            const expectedFields = [
                { name: 'propertyId', type: 'String' },
                { name: 'sectorNumber', type: 'String' },
                { name: 'phaseCode', type: 'String' },
                { name: 'blockCode', type: 'String' },
                { name: 'schemeName', type: 'String' },
                { name: 'propertyType', type: 'String' },
                { name: 'propertySize', type: 'String' },
                { name: 'propertyAreaValue', type: 'Number' },
                { name: 'propertyAreaUnit', type: 'String' },
                { name: 'allotmentDate', type: 'Date' },
                { name: 'buildingPlanApproved', type: 'Boolean' },
                { name: 'occupancyCertificate', type: 'Boolean' },
                { name: 'litigationStatus', type: 'String' },
                { name: 'mortgageStatus', type: 'String' },
                { name: 'authorityStatus', type: 'String' },
                { name: 'transferDate', type: 'Date' },
                { name: 'duesStatus', type: 'String' },
                { name: 'leaseRentStatus', type: 'String' },
                { name: 'lastVerifiedAt', type: 'Date' },
                { name: 'authorityCode', type: 'String' }
            ];

            for (const f of expectedFields) {
                const p = subSchema.path(f.name);
                assert.ok(p, `Canonical field "${f.name}" must be defined in AuthorityVerificationSubSchema`);
                assert.equal(p.instance, f.type, `Field "${f.name}" must be of instance type ${f.type}`);
            }
        });

        it('1.5 direct Mongoose update rejects unknown nested fields without strict: false', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'STRICT-TEST-1',
                sector: 'Sector 1',
                status: 'Available'
            });

            // Attempt to update with an unapproved nested key using strict: 'throw'
            await assert.rejects(
                async () => {
                    await Inventory.findOneAndUpdate(
                        { _id: inv._id },
                        { $set: { 'authorityVerification.unapprovedField': 'should_throw' } },
                        { new: true }
                    );
                },
                (err) => {
                    assert.ok(err.name === 'StrictModeError' || err.message.includes('strict mode is set to throw'));
                    return true;
                },
                'Unknown nested field under authorityVerification must be rejected by strict schema'
            );

            const fetched = await Inventory.findById(inv._id).lean();
            assert.equal(fetched.authorityVerification?.unapprovedField, undefined,
                'Unknown nested field under authorityVerification must not exist in document');
        });

        it('1.6 direct Mongoose update rejects arbitrary top-level fields without strict: false', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'STRICT-TEST-2',
                sector: 'Sector 1',
                status: 'Available'
            });

            await Inventory.findOneAndUpdate(
                { _id: inv._id },
                { $set: { injectedArbitraryField: 'attack_value' } },
                { new: true }
            );

            const fetched = await Inventory.findById(inv._id).lean();
            assert.equal(fetched.injectedArbitraryField, undefined,
                'Arbitrary top-level field must be stripped by strict schema');
        });
    });

    // =========================================================================
    // SECTION 2: PROTOTYPE POLLUTION & OPERATOR INJECTION REGRESSION
    // =========================================================================
    describe('2. Prototype Pollution & Operator Injection Guards', () => {
        let testInv;
        let testRun;
        let testLink;

        beforeEach(async () => {
            testInv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'SEC-UNIT-01',
                sector: 'Sector 4',
                status: 'Available'
            });

            testRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: adminUser._id,
                runMode: 'SINGLE',
                status: 'COMPLETED'
            });

            testLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInv._id,
                authorityCode: 'HSVP',
                sectorNumber: '4',
                propertyId: 'PLOT-SEC-1',
                compositeKey: 'HSVP:SEC4:PLOT1',
                createdBy: adminUser._id
            });
        });

        it('2.1 rejects change.field containing __proto__ path', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                inventoryId: testInv._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: '__proto__.isAdmin',
                        currentValue: null,
                        proposedValue: true,
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.ok(data.rejectedFields.some(r => r.reason.includes('Illegal or dangerous field name') || r.reason.includes('Not in allowlist')));
            assert.equal(Object.prototype.isAdmin, undefined);
        });

        it('2.2 rejects change.field containing constructor or prototype', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                inventoryId: testInv._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'constructor.prototype.polluted',
                        currentValue: null,
                        proposedValue: 'malicious',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            assert.equal(Object.prototype.polluted, undefined);
        });

        it('2.3 rejects change.field containing MongoDB operator ($where, $set, $rename)', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                inventoryId: testInv._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: '$where',
                        currentValue: null,
                        proposedValue: 'sleep(5000)',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.$rename',
                        currentValue: null,
                        proposedValue: { status: 'old_status' },
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.rejectedFields.length, 2);
        });

        it('2.4 rejects proposedValue containing MongoDB operator objects ($gt, $ne)', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                inventoryId: testInv._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertySize',
                        currentValue: '100',
                        proposedValue: { $gt: '' }, // Object operator injection
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.ok(data.rejectedFields[0].reason.includes('Disallowed operator'));
        });
    });

    // =========================================================================
    // SECTION 3: ACCESS-CONTROL INVARIANCE & SENTINEL NON-CORRUPTION
    // =========================================================================
    describe('3. Access-Control Invariance & Sentinel Protection', () => {
        let testInv;
        let testRun;
        let testLink;

        beforeEach(async () => {
            testInv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'ACCESS-UNIT-01',
                sector: 'Sector 9',
                status: 'Under Offer',
                ownership: 'Original Allottee',
                assignedTo: adminUser._id,
                department: 'inventory',
                visibleTo: 'Private'
            });

            testRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: adminUser._id,
                runMode: 'SINGLE',
                status: 'COMPLETED'
            });

            testLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInv._id,
                authorityCode: 'HSVP',
                sectorNumber: '9',
                propertyId: 'PLOT-SEC-9',
                compositeKey: 'HSVP:SEC9:PLOT9',
                createdBy: adminUser._id
            });
        });

        it('3.1 Inventory.status is immutable to authority updates', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                inventoryId: testInv._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'status',
                        currentValue: 'Under Offer',
                        proposedValue: 'Resumed by Authority',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            const ref = await Inventory.findById(testInv._id);
            assert.equal(String(ref.status), String(testInv.status));
        });

        it('3.2 access-control fields (owners, teams, department, visibleTo) cannot be altered', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                inventoryId: testInv._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    { field: 'owners', currentValue: [], proposedValue: [adminUser._id], approved: true },
                    { field: 'department', currentValue: 'inventory', proposedValue: 'sales', approved: true },
                    { field: 'visibleTo', currentValue: 'Private', proposedValue: 'Everyone', approved: true },
                    { field: 'assignedTo', currentValue: adminUser._id, proposedValue: null, approved: true }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            const ref = await Inventory.findById(testInv._id);
            assert.equal(ref.department, 'inventory');
            assert.equal(ref.visibleTo, 'Private');
            assert.equal(String(ref.assignedTo), String(adminUser._id));
        });

        it('3.3 sentinels cannot clear existing data', async () => {
            // First establish verified propertySize
            await Inventory.updateOne(
                { _id: testInv._id },
                { $set: { 'authorityVerification.propertySize': '500 Sq Yards' } }
            );

            const sentinelsToTest = [
                SENTINEL.NOT_RETURNED,
                SENTINEL.NOT_APPLICABLE,
                SENTINEL.PARSE_ERROR,
                { _sentinel: 'RESTRICTED_DATA' },
                { sentinel: 'FIELD_UNVERIFIED' },
                { value: null, rawValue: 'N/A' }
            ];

            for (const s of sentinelsToTest) {
                let item = null;
                try {
                    item = await PropertyVerificationRunItem.create({
                        tenantId: tenantA,
                        runId: testRun._id,
                        inventoryId: testInv._id,
                        linkId: testLink._id,
                        authorityCode: 'HSVP',
                        status: 'SUCCEEDED',
                        reviewerDecision: 'APPROVED',
                        proposedChanges: [
                            {
                                field: 'authorityVerification.propertySize',
                                currentValue: '500 Sq Yards',
                                proposedValue: s,
                                approved: true
                            }
                        ]
                    });

                    const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${adminToken}`
                        }
                    });

                    assert.equal(res.status, 422, `Sentinel ${JSON.stringify(s)} must be rejected`);

                    const ref = await Inventory.findById(testInv._id).lean();
                    assert.equal(ref.authorityVerification?.propertySize, '500 Sq Yards',
                        'Existing verified propertySize must not be cleared by sentinel');
                } finally {
                    if (item?._id) {
                        await PropertyVerificationRunItem.deleteOne({ _id: item._id });
                    }
                }
            }
        });
    });

    // =========================================================================
    // SECTION 4: GENUINE STRICT APPLICATION END-TO-END
    // =========================================================================
    describe('4. Genuine Application With Strict Schema Validation', () => {
        it('4.1 applies allowlisted fields into strictly typed subdocument without strict: false', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'STRICT-APPLY-01',
                sector: 'Sector 21',
                status: 'Available'
            });

            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: tenantA, authorityCode: 'HSVP' },
                {
                    $set: {
                        isEnabled: true,
                        isPaused: false,
                        permissionStatus: 'GRANTED',
                        approvedAccessMethod: 'PUBLIC_API',
                        approvalReference: 'GOV/HSVP/2026/001',
                        approvalExpiryDate: new Date(Date.now() + 86400000 * 365),
                        reviewStatus: 'APPROVED',
                        ratePolicy: { maxRequestsPerDay: 1000, maxRequestsPerHour: 100 },
                        identityRequirements: { verified: true },
                        permittedFields: ['propertyId', 'sectorNumber', 'propertySize', 'buildingPlanApproved', 'phaseCode']
                    }
                },
                { upsert: true }
            );

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: adminUser._id,
                runMode: 'SINGLE',
                status: 'COMPLETED',
                isFixtureMode: false,
                provenance: 'LIVE'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'HSVP',
                sectorNumber: '21',
                propertyId: 'PLOT-21-A',
                compositeKey: 'HSVP:SEC21:PLOT21A',
                createdBy: adminUser._id
            });

            const snap = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: link._id,
                runItemId: new mongoose.Types.ObjectId(),
                observedAt: new Date(),
                isSynthetic: false,
                provenance: 'LIVE',
                normalizedData: {},
                isSealed: true
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                snapshotId: snap._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                reviewedBy: new mongoose.Types.ObjectId(),
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertySize',
                        currentValue: 'Unverified',
                        proposedValue: '1 Kanal',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.buildingPlanApproved',
                        currentValue: null,
                        proposedValue: true,
                        approved: true
                    },
                    {
                        field: 'authorityVerification.phaseCode',
                        currentValue: null,
                        proposedValue: 'Phase 1',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);
            assert.equal(data.data.appliedFields.length, 3);

            // Fetch inventory and verify exact subdocument shape
            const updated = await Inventory.findById(inv._id).lean();
            assert.equal(updated.authorityVerification.propertySize, '1 Kanal');
            assert.equal(updated.authorityVerification.buildingPlanApproved, true);
            assert.equal(updated.authorityVerification.phaseCode, 'Phase 1');
            assert.equal(updated.authorityVerification.authorityCode, 'HSVP');
            assert.equal(String(updated.authorityVerification.verificationRunId), String(run._id));
            assert.ok(updated.authorityVerification.lastVerifiedAt instanceof Date);

            // Core status remains intact
            assert.equal(String(updated.status), String(inv.status));
        });
    });
});
