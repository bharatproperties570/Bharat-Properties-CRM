/**
 * Phase 2.4 Strict-Mode Semantics, Schema Alignment & Upstream Reconciliation
 * 
 * Verifies:
 * 1. Mongoose 8 Strict-Mode Semantics & Schema Options:
 *    - AuthorityVerificationSubSchema enforces strict: 'throw' and _id: false.
 *    - InventorySchema enforces strict: true.
 *    - Inventory.authorityVerification defaults to undefined (omitted from new docs).
 *    - Direct updates with unknown nested fields throw StrictModeError rather than silently stripping.
 * 2. Explicit Rejection in Authority Apply API (4xx, No Silent Stripping):
 *    - Rejects unknown nested field paths with HTTP 422 and returns rejectedFields.
 *    - Rejects forbidden fields, prototype pollution, and MongoDB operators with 422.
 *    - Rejects mixed payloads (valid + invalid) with 422; no Inventory fields modified on rejection.
 * 3. Canonical Field Alignment & Strict Types:
 *    - allotmentDate, transferDate, possessionDate strictly typed as Date.
 *    - Separate numeric area (propertyAreaValue: Number) and area unit (propertyAreaUnit: String).
 *    - No implicit area-unit conversions.
 *    - sectorNumber, phaseCode, blockCode kept separate.
 *    - Categorical legal statuses (litigation, mortgage, dues, leaseRent, authorityStatus) distinct from booleans.
 *    - buildingPlanApproved and occupancyCertificate strictly typed as Boolean.
 * 4. Backward Compatibility for Existing Inventory:
 *    - Newly created Inventory does not contain authorityVerification subdocument in MongoDB.
 *    - Normal CRM updates to unrelated fields succeed without adding authorityVerification.
 *    - Legacy documents with authorityVerification: null do not trigger PathNotViable (code 28).
 * 5. Security Invariance:
 *    - Inventory.status remains untouched.
 *    - Ownership, tenancy, and access-control cannot be overwritten.
 *    - Snapshot immutability is maintained.
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
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import { SENTINEL } from '../services/authority/authorityFieldDictionary.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';

describe('Phase 2.4 — Strict-Mode Semantics, Schema Alignment & Reconciliation', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    const tenantA = new mongoose.Types.ObjectId();
    let adminUser;
    let adminToken;
    let adminRole;
    let testSnapshot;

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
            name: 'Authority Admin Role 2.4',
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
            fullName: 'Admin User Phase 2.4',
            email: 'admin.phase24@test.local',
            password: 'hashed_password_safe',
            department: 'inventory',
            role: adminRole._id,
            tenantId: tenantA,
            isActive: true
        });

        adminToken = jwt.sign({ id: adminUser._id }, config.jwtSecret, { expiresIn: '2h' });

        testSnapshot = await PropertyVerificationSnapshot.create({
            tenantId: tenantA,
            authorityCode: 'HSVP',
            linkId: new mongoose.Types.ObjectId(),
            runItemId: new mongoose.Types.ObjectId(),
            observedAt: new Date(),
            isSynthetic: false,
            provenance: 'LIVE',
            normalizedData: {},
            isSealed: true
        });
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
    // 1. Mongoose 8 Strict-Mode Semantics & Schema Options
    // =========================================================================
    describe('1. Mongoose 8 Strict-Mode Semantics & Schema Configuration', () => {
        it('1.1 AuthorityVerificationSubSchema enforces strict: "throw" and _id: false', () => {
            const avPath = Inventory.schema.path('authorityVerification');
            assert.ok(avPath, 'authorityVerification path must exist on InventorySchema');
            const subSchema = avPath.schema;
            assert.ok(subSchema, 'authorityVerification must have an embedded Schema');
            assert.equal(subSchema.options.strict, 'throw',
                'AuthorityVerificationSubSchema must enforce strict: "throw" to prevent silent stripping');
            assert.equal(subSchema.options._id, false,
                'AuthorityVerificationSubSchema must have _id: false');
        });

        it('1.2 InventorySchema enforces overall strict: true', () => {
            assert.equal(Inventory.schema.options.strict, true,
                'Root InventorySchema must remain strict: true for overall CRM backward compatibility');
        });

        it('1.3 Inventory.authorityVerification defaults to undefined (not empty object)', () => {
            const avPath = Inventory.schema.path('authorityVerification');
            assert.equal(avPath.defaultValue, undefined,
                'authorityVerification must default to undefined so it is omitted from new documents');
        });

        it('1.4 direct Mongoose update with unknown nested field throws StrictModeError', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'STRICT-DIRECT-1',
                sector: 'Sector 10',
                status: 'Available'
            });

            await assert.rejects(
                async () => {
                    await Inventory.findOneAndUpdate(
                        { _id: inv._id },
                        { $set: { 'authorityVerification.unexpectedNestedKey': 'attack_val' } },
                        { new: true }
                    );
                },
                (err) => {
                    assert.ok(err.name === 'StrictModeError' || err.message.includes('strict mode is set to throw'),
                        `Expected StrictModeError but got ${err.name}: ${err.message}`);
                    return true;
                },
                'Mongoose must throw StrictModeError on unknown nested subdocument path'
            );

            // Verify the field was not persisted
            const raw = await Inventory.collection.findOne({ _id: inv._id });
            assert.equal(raw.authorityVerification, undefined,
                'Document must not have authorityVerification created on failed update');
        });
    });

    // =========================================================================
    // 2. Explicit Rejection in Authority Apply API (4xx, No Silent Stripping)
    // =========================================================================
    describe('2. Authority Apply API Strict Rejection (No Silent Stripping)', () => {
        let testInventory;
        let testRun;
        let testLink;

        beforeEach(async () => {
            testInventory = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'APPLY-STRICT-TEST',
                sector: 'Sector 45',
                price: 15000000,
                status: 'Available'
            });

            testLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInventory._id,
                authorityCode: 'HSVP',
                identity: { propertyId: 'P-9988', sectorNumber: '45' },
                matchEligibility: 'ELIGIBLE',
                createdBy: adminUser._id
            });

            testRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                runMode: 'SINGLE',
                status: 'COMPLETED',
                requestedBy: adminUser._id
            });
        });

        it('2.1 rejects unknown nested field paths with HTTP 422 and rejectedFields details', async () => {
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.completelyUnknownSubField',
                        currentValue: null,
                        proposedValue: 'unauthorized_payload',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422, 'Must return 422 Unprocessable Entity for unknown nested fields');
            const body = await res.json();
            assert.equal(body.success, false);
            assert.ok(body.message.includes('Validation failed') || body.message.includes('unknown') || body.message.includes('No approved fields'));
            assert.ok(body.rejectedFields.some(r => r.field === 'authorityVerification.completelyUnknownSubField'));

            // Verify Inventory was NOT modified
            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(refreshed.authorityVerification, undefined);
        });

        it('2.2 rejects mixed proposed changes (valid + unknown nested field) and mutates NO fields', async () => {
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: 'P-VALID-123',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.injectedArbitraryKey',
                        currentValue: null,
                        proposedValue: 'malicious_inject',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422, 'Must return 422 when any approved field is unknown');
            const body = await res.json();
            assert.equal(body.success, false);
            assert.ok(body.rejectedFields.some(r => r.field === 'authorityVerification.injectedArbitraryKey'));

            // CRITICAL: Ensure NO fields were applied (the valid propertyId must NOT have been saved)
            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(refreshed.authorityVerification, undefined,
                'Inventory must remain completely untouched when update contains unknown fields');
            assert.equal(runItem.applied, false, 'Run item must not be marked applied');
        });

        it('2.3 rejects forbidden fields (e.g. owners, status, tenantId) with 422 and zero mutation', async () => {
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'status',
                        currentValue: 'Available',
                        proposedValue: 'Sold Out by Authority',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            const body = await res.json();
            assert.equal(body.success, false);
            assert.ok(body.rejectedFields.some(r => r.field === 'status' && r.reason === 'Blocked field'));

            const refreshed = await Inventory.findById(testInventory._id);
            assert.notEqual(refreshed.status, 'Sold Out by Authority');
        });

        it('2.4 rejects MongoDB operators in field or value with 422 and zero mutation', async () => {
            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: { $gt: '' },
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 422);
            const body = await res.json();
            assert.equal(body.success, false);
            assert.ok(body.rejectedFields.some(r => r.reason.includes('Disallowed operator')));

            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(refreshed.authorityVerification, undefined);
        });
    });

    // =========================================================================
    // 3. Canonical Field Alignment & Strict Types
    // =========================================================================
    describe('3. Canonical Field Alignment & Strict Types', () => {
        let testInventory;
        let testRun;
        let testLink;

        beforeEach(async () => {
            for (const code of ['HSVP', 'GMADA', 'CHD']) {
                await AuthoritySourceSettings.findOneAndUpdate(
                    { tenantId: tenantA, authorityCode: code },
                    {
                        $set: {
                            isEnabled: true,
                            isPaused: false,
                            permissionStatus: 'GRANTED',
                            approvedAccessMethod: 'PUBLIC_API',
                            approvalReference: `GOV/${code}/2026/001`,
                            approvalExpiryDate: new Date(Date.now() + 86400000 * 365),
                            reviewStatus: 'APPROVED',
                            ratePolicy: { maxRequestsPerDay: 1000, maxRequestsPerHour: 100 },
                            identityRequirements: { verified: true },
                            permittedFields: [
                                'propertyId', 'sectorNumber', 'propertySize', 'propertyAreaValue', 'propertyAreaUnit',
                                'allotmentDate', 'transferDate', 'phaseCode', 'blockCode', 'litigationStatus',
                                'mortgageStatus', 'duesStatus', 'leaseRentStatus', 'buildingPlanApproved', 'occupancyCertificate'
                            ]
                        }
                    },
                    { upsert: true }
                );
            }

            testInventory = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'CANONICAL-TEST-1',
                sector: 'Sector 21',
                status: 'Available'
            });

            testLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInventory._id,
                authorityCode: 'HSVP',
                identity: { propertyId: 'P-CANONICAL-1', sectorNumber: '21' },
                matchEligibility: 'ELIGIBLE',
                createdBy: adminUser._id
            });

            testRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                runMode: 'SINGLE',
                status: 'COMPLETED',
                requestedBy: adminUser._id,
                isFixtureMode: false,
                provenance: 'LIVE'
            });

            testSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: testLink._id,
                runItemId: new mongoose.Types.ObjectId(),
                observedAt: new Date(),
                isSynthetic: false,
                provenance: 'LIVE',
                normalizedData: {},
                isSealed: true
            });
        });

        it('3.1 allotmentDate and transferDate are typed as Date and persist as Date objects', async () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('allotmentDate').instance, 'Date');
            assert.equal(subSchema.path('transferDate').instance, 'Date');
            assert.equal(subSchema.path('possessionDate').instance, 'Date');

            const allotmentDateStr = '2019-06-15T00:00:00.000Z';
            const transferDateStr = '2022-11-20T00:00:00.000Z';

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.allotmentDate',
                        currentValue: null,
                        proposedValue: allotmentDateStr,
                        approved: true
                    },
                    {
                        field: 'authorityVerification.transferDate',
                        currentValue: null,
                        proposedValue: transferDateStr,
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 200);
            const refreshed = await Inventory.findById(testInventory._id);
            assert.ok(refreshed.authorityVerification.allotmentDate instanceof Date);
            assert.equal(refreshed.authorityVerification.allotmentDate.toISOString(), allotmentDateStr);
            assert.ok(refreshed.authorityVerification.transferDate instanceof Date);
            assert.equal(refreshed.authorityVerification.transferDate.toISOString(), transferDateStr);
        });

        it('3.2 separate numeric area (propertyAreaValue) and area unit (propertyAreaUnit) without implicit conversion', async () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('propertyAreaValue').instance, 'Number');
            assert.equal(subSchema.path('propertyAreaUnit').instance, 'String');
            assert.equal(subSchema.path('propertySize').instance, 'String');

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'GMADA',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertySize',
                        currentValue: null,
                        proposedValue: '10 Marla (Auction)',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.propertyAreaValue',
                        currentValue: null,
                        proposedValue: 10,
                        approved: true
                    },
                    {
                        field: 'authorityVerification.propertyAreaUnit',
                        currentValue: null,
                        proposedValue: 'MARLA',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 200);
            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(refreshed.authorityVerification.propertySize, '10 Marla (Auction)');
            assert.equal(refreshed.authorityVerification.propertyAreaValue, 10);
            assert.equal(refreshed.authorityVerification.propertyAreaUnit, 'MARLA');
            // Confirm numeric value 10 was NOT converted to sq yards or sq ft implicitly
            assert.equal(refreshed.authorityVerification.propertyAreaValue, 10);
        });

        it('3.3 sectorNumber, phaseCode, and blockCode are separate fields and not conflated', async () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('sectorNumber').instance, 'String');
            assert.equal(subSchema.path('phaseCode').instance, 'String');
            assert.equal(subSchema.path('blockCode').instance, 'String');

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'CHD',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.sectorNumber',
                        currentValue: null,
                        proposedValue: 'Sector 34',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.phaseCode',
                        currentValue: null,
                        proposedValue: 'Phase 2',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.blockCode',
                        currentValue: null,
                        proposedValue: 'Block B',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 200);
            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(refreshed.authorityVerification.sectorNumber, 'Sector 34');
            assert.equal(refreshed.authorityVerification.phaseCode, 'Phase 2');
            assert.equal(refreshed.authorityVerification.blockCode, 'Block B');
        });

        it('3.4 categorical legal statuses are distinct from booleans', async () => {
            const subSchema = Inventory.schema.path('authorityVerification').schema;
            assert.equal(subSchema.path('litigationStatus').instance, 'String');
            assert.equal(subSchema.path('mortgageStatus').instance, 'String');
            assert.equal(subSchema.path('authorityStatus').instance, 'String');
            assert.equal(subSchema.path('buildingPlanApproved').instance, 'Boolean');
            assert.equal(subSchema.path('occupancyCertificate').instance, 'Boolean');

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: testRun._id,
                snapshotId: testSnapshot._id,
                inventoryId: testInventory._id,
                linkId: testLink._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.litigationStatus',
                        currentValue: null,
                        proposedValue: 'Court case pending in High Court',
                        approved: true
                    },
                    {
                        field: 'authorityVerification.buildingPlanApproved',
                        currentValue: null,
                        proposedValue: true,
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 200);
            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(typeof refreshed.authorityVerification.litigationStatus, 'string');
            assert.equal(refreshed.authorityVerification.litigationStatus, 'Court case pending in High Court');
            assert.equal(typeof refreshed.authorityVerification.buildingPlanApproved, 'boolean');
            assert.equal(refreshed.authorityVerification.buildingPlanApproved, true);
        });

        after(async () => {
            for (const code of ['HSVP', 'GMADA', 'CHD']) {
                await AuthoritySourceSettings.findOneAndUpdate(
                    { tenantId: tenantA, authorityCode: code },
                    { $set: { isEnabled: false, permissionStatus: 'NOT_OBTAINED' } }
                );
            }
        });
    });

    // =========================================================================
    // 4. Backward Compatibility for Existing Inventory
    // =========================================================================
    describe('4. Backward Compatibility for Existing Inventory', () => {
        it('4.1 creating new Inventory document does NOT add authorityVerification key to MongoDB', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'NO-AUTH-DOC',
                sector: 'Sector 5',
                price: 8500000,
                status: 'Available'
            });

            // Inspect the raw document directly in MongoDB collection (bypassing Mongoose schema getters)
            const rawDoc = await Inventory.collection.findOne({ _id: inv._id });
            assert.equal('authorityVerification' in rawDoc, false,
                'MongoDB document must NOT store an empty authorityVerification property on creation');
        });

        it('4.2 normal CRM updates to unrelated Inventory fields do NOT create authorityVerification', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'NORMAL-UPDATE-DOC',
                sector: 'Sector 8',
                price: 12000000,
                status: 'Available'
            });

            // Perform regular CRM price and remarks update
            await Inventory.findByIdAndUpdate(inv._id, {
                $set: {
                    price: 12500000,
                    remarks: 'Price revised after client meeting'
                }
            }, { new: true });

            const rawDoc = await Inventory.collection.findOne({ _id: inv._id });
            assert.equal('authorityVerification' in rawDoc, false,
                'Regular CRM updates must not cause authorityVerification to be written to MongoDB');
            assert.equal(rawDoc.price, 12500000);
            assert.equal(rawDoc.remarks, 'Price revised after client meeting');
        });

        it('4.3 legacy document with authorityVerification: null is safely updated without PathNotViable', async () => {
            // Simulate an older document in MongoDB that had authorityVerification explicitly set to null
            const legacyInsert = await Inventory.collection.insertOne({
                tenantId: tenantA,
                unitNo: 'LEGACY-NULL-DOC',
                sector: 'Sector 12',
                price: 9000000,
                status: 'Available',
                authorityVerification: null,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: legacyInsert.insertedId,
                authorityCode: 'HSVP',
                identity: { propertyId: 'P-LEGACY-NULL', sectorNumber: '12' },
                matchEligibility: 'ELIGIBLE',
                createdBy: adminUser._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                runMode: 'SINGLE',
                status: 'COMPLETED',
                requestedBy: adminUser._id,
                isFixtureMode: false,
                provenance: 'LIVE'
            });

            const snap43 = await PropertyVerificationSnapshot.create({
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

            const runItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                snapshotId: snap43._id,
                inventoryId: legacyInsert.insertedId,
                linkId: link._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                isSynthetic: false,
                provenance: 'LIVE',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertyId',
                        currentValue: null,
                        proposedValue: 'P-LEGACY-RESOLVED',
                        approved: true
                    }
                ]
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
                        permittedFields: ['propertyId']
                    }
                },
                { upsert: true }
            );

            const res = await fetch(`${baseUrl}/api/authority/apply/${runItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`
                }
            });

            assert.equal(res.status, 200, 'Legacy document update must succeed without PathNotViable code 28');
            const rawUpdated = await Inventory.collection.findOne({ _id: legacyInsert.insertedId });
            assert.ok(rawUpdated.authorityVerification);
            assert.equal(rawUpdated.authorityVerification.propertyId, 'P-LEGACY-RESOLVED');

            await AuthoritySourceSettings.findOneAndUpdate(
                { tenantId: tenantA, authorityCode: 'HSVP' },
                { $set: { isEnabled: false, permissionStatus: 'NOT_OBTAINED' } }
            );
        });

        it('4.4 JSON serialization of Inventory without authority data is clean', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'JSON-TEST-DOC',
                sector: 'Sector 15',
                status: 'Available'
            });

            const json = inv.toJSON();
            assert.equal(json.authorityVerification, undefined,
                'toJSON() must not produce an empty authorityVerification object');
        });
    });

    // =========================================================================
    // 5. Security Invariance
    // =========================================================================
    describe('5. Security Controls & Invariance Verification', () => {
        it('5.1 PropertyVerificationSnapshot mutation guards remain active (append-only)', async () => {
            const snap = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: new mongoose.Types.ObjectId(),
                parserVersion: '1.2.0',
                mappingVersion: '1.2.0',
                isSealed: true
            });

            await assert.rejects(
                async () => {
                    await PropertyVerificationSnapshot.updateOne({ _id: snap._id }, { isSealed: false });
                },
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );

            await assert.rejects(
                async () => {
                    await PropertyVerificationSnapshot.deleteOne({ _id: snap._id });
                },
                (err) => {
                    assert.equal(err.code, 'SNAPSHOT_IMMUTABLE');
                    return true;
                }
            );
        });

        it('5.2 all authority sources remain disabled (NOT_OBTAINED) with zero live network calls', async () => {
            const res = await fetch(`${baseUrl}/api/authority/settings`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });

            assert.equal(res.status, 200);
            const body = await res.json();
            assert.equal(body.success, true);
            for (const setting of body.data) {
                assert.equal(setting.isEnabled, false, `Authority ${setting.authorityCode} must be disabled`);
                assert.equal(setting.permissionStatus, 'NOT_OBTAINED', `Authority ${setting.authorityCode} must have NOT_OBTAINED permission`);
                assert.equal(setting.effectivelyActive, false, `Authority ${setting.authorityCode} must not be effectively active`);
            }
        });
    });
});
