/**
 * Phase 2.2 Security and Runtime Test Hardening Test Suite
 * 
 * Verifies:
 * 1. PropertyVerificationSnapshot mutation gaps closed (save, updateOne, updateMany,
 *    findOneAndUpdate, findOneAndReplace, replaceOne, deleteOne, deleteMany,
 *    findOneAndDelete, bulkWrite, insertMany, and native driver boundaries).
 * 2. Role/moduleAccess and approvalRights through the actual permission service
 *    and permission middleware (not just schema introspection).
 * 3. AuditLog persistence, supported event types, actor/tenant attribution,
 *    and redaction of sensitive credentials and PII.
 * 4. Field-allowlist enforcement: Inventory.status, owners, associates, tenantId,
 *    teams, department, visibleTo cannot be updated; missing/sentinel values
 *    cannot clear existing data.
 * 5. Genuine HTTP controller integration tests over an isolated HTTP test server:
 *    unauthenticated (401), unauthorized (403), missing approval-right (403),
 *    multi-tenant isolation, and policy-disabled requests (422 POLICY_REJECTED).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import express from 'express';
import jwt from 'jsonwebtoken';

import config from '../src/config/env.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import { SENTINEL } from '../services/authority/authorityFieldDictionary.js';
import { hasPermission, hasApprovalRight } from '../services/permission.service.js';
import { checkPermission, checkApprovalRight } from '../middlewares/permission.middleware.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';

describe('Phase 2.2 — Security and Runtime Test Hardening', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    // Test tenants and users
    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();

    let roleNoAccess;
    let roleViewOnly;
    let roleRunCreator;
    let roleReviewerNoAdmin;
    let roleFullAdmin;

    let userNoAccess;
    let userViewOnly;
    let userRunCreator;
    let userReviewerNoAdmin;
    let userFullAdmin;
    let userTenantB;

    let tokenNoAccess;
    let tokenViewOnly;
    let tokenRunCreator;
    let tokenReviewerNoAdmin;
    let tokenFullAdmin;
    let tokenTenantB;

    function createToken(user) {
        return jwt.sign({ id: user._id }, config.jwtSecret, { expiresIn: '2h' });
    }

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

        // Setup ephemeral Express app
        const app = express();
        app.use(express.json());
        app.use('/api/authority', authorityRoutes);
        // Error handler
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

        // 1. Roles
        roleNoAccess = await Role.create({
            name: 'Standard Agent',
            department: 'sales',
            moduleAccess: {
                authorityVerification: { view: false, create: false, edit: false, delete: false }
            },
            approvalRights: {
                manageAuthoritySettings: false,
                approveAuthorityChanges: false
            }
        });

        roleViewOnly = await Role.create({
            name: 'Authority Auditor',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: false, edit: false, delete: false }
            },
            approvalRights: {
                manageAuthoritySettings: false,
                approveAuthorityChanges: false
            }
        });

        roleRunCreator = await Role.create({
            name: 'Verification Operator',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: false, delete: false }
            },
            approvalRights: {
                manageAuthoritySettings: false,
                approveAuthorityChanges: false
            }
        });

        roleReviewerNoAdmin = await Role.create({
            name: 'Verification Reviewer (No Approval)',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: false, edit: true, delete: false }
            },
            approvalRights: {
                manageAuthoritySettings: false,
                approveAuthorityChanges: false
            }
        });

        roleFullAdmin = await Role.create({
            name: 'Authority Super Admin',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        // 2. Users (Tenant A)
        userNoAccess = await User.create({
            fullName: 'No Access User',
            email: 'noaccess@test.local',
            password: 'hashed_password_123',
            department: 'sales',
            role: roleNoAccess._id,
            tenantId: tenantA,
            isActive: true
        });

        userViewOnly = await User.create({
            fullName: 'View Only User',
            email: 'viewonly@test.local',
            password: 'hashed_password_123',
            department: 'inventory',
            role: roleViewOnly._id,
            tenantId: tenantA,
            isActive: true
        });

        userRunCreator = await User.create({
            fullName: 'Run Creator User',
            email: 'creator@test.local',
            password: 'hashed_password_123',
            department: 'inventory',
            role: roleRunCreator._id,
            tenantId: tenantA,
            isActive: true
        });

        userReviewerNoAdmin = await User.create({
            fullName: 'Reviewer Without Admin',
            email: 'reviewer@test.local',
            password: 'hashed_password_123',
            department: 'inventory',
            role: roleReviewerNoAdmin._id,
            tenantId: tenantA,
            isActive: true
        });

        userFullAdmin = await User.create({
            fullName: 'Super Admin User',
            email: 'superadmin@test.local',
            password: 'hashed_password_123',
            department: 'inventory',
            role: roleFullAdmin._id,
            tenantId: tenantA,
            isActive: true
        });

        // 3. User (Tenant B)
        userTenantB = await User.create({
            fullName: 'Tenant B Admin',
            email: 'tenantb@test.local',
            password: 'hashed_password_123',
            department: 'inventory',
            role: roleFullAdmin._id,
            tenantId: tenantB,
            isActive: true
        });

        // Tokens
        tokenNoAccess = createToken(userNoAccess);
        tokenViewOnly = createToken(userViewOnly);
        tokenRunCreator = createToken(userRunCreator);
        tokenReviewerNoAdmin = createToken(userReviewerNoAdmin);
        tokenFullAdmin = createToken(userFullAdmin);
        tokenTenantB = createToken(userTenantB);
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
    // SECTION 1: SNAPSHOT IMMUTABILITY FULL BOUNDARY COVERAGE
    // =========================================================================
    describe('1. PropertyVerificationSnapshot Mutation Hardening', () => {
        async function createSnapshot() {
            return PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                linkId: new mongoose.Types.ObjectId(),
                observedAt: new Date(),
                parserVersion: '1.2.0',
                mappingVersion: '1.2.0',
                normalizedData: {
                    propertySize: { value: '250 Sq Yards', sentinel: null }
                }
            });
        }

        it('1.1 should create a new snapshot with isSealed = true', async () => {
            const snap = await createSnapshot();
            assert.ok(snap._id);
            assert.equal(snap.isSealed, true);
        });

        it('1.2 should reject save() on existing snapshot document', async () => {
            const snap = await createSnapshot();
            snap.parserVersion = '2.0.0';
            await assert.rejects(
                () => snap.save(),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.3 should reject updateOne()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.updateOne({ _id: snap._id }, { $set: { parserVersion: '2.0.0' } }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.4 should reject updateMany()', async () => {
            await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.updateMany({}, { $set: { parserVersion: '2.0.0' } }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.5 should reject findOneAndUpdate()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.findOneAndUpdate({ _id: snap._id }, { $set: { parserVersion: '2.0.0' } }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.6 should reject findOneAndReplace()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.findOneAndReplace({ _id: snap._id }, { tenantId: tenantA, authorityCode: 'HSVP' }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.7 should reject replaceOne()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.replaceOne({ _id: snap._id }, { tenantId: tenantA, authorityCode: 'HSVP' }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.8 should reject deleteOne()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.deleteOne({ _id: snap._id }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.9 should reject deleteMany()', async () => {
            await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.deleteMany({}),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.10 should reject findOneAndDelete()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.findOneAndDelete({ _id: snap._id }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.11 should reject findByIdAndUpdate()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.findByIdAndUpdate(snap._id, { $set: { parserVersion: '2.0.0' } }),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.12 should reject findByIdAndDelete()', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.findByIdAndDelete(snap._id),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.13 should block bulkWrite() at Model layer with SNAPSHOT_IMMUTABLE', async () => {
            const snap = await createSnapshot();
            await assert.rejects(
                () => PropertyVerificationSnapshot.bulkWrite([
                    { updateOne: { filter: { _id: snap._id }, update: { $set: { parserVersion: '2.0.0' } } } }
                ]),
                (err) => err.code === 'SNAPSHOT_IMMUTABLE'
            );
        });

        it('1.14 should seal all documents created via insertMany()', async () => {
            const docs = await PropertyVerificationSnapshot.insertMany([
                {
                    tenantId: tenantA,
                    authorityCode: 'CHD',
                    linkId: new mongoose.Types.ObjectId(),
                    observedAt: new Date(),
                    parserVersion: '1.2.0',
                    mappingVersion: '1.2.0'
                },
                {
                    tenantId: tenantA,
                    authorityCode: 'GMADA',
                    linkId: new mongoose.Types.ObjectId(),
                    observedAt: new Date(),
                    parserVersion: '1.2.0',
                    mappingVersion: '1.2.0'
                }
            ]);
            assert.equal(docs.length, 2);
            assert.equal(docs[0].isSealed, true);
            assert.equal(docs[1].isSealed, true);
        });

        it('1.15 KNOWN BOUNDARY: direct native driver (collection.bulkWrite) bypasses Mongoose', async () => {
            const snap = await createSnapshot();
            const collection = mongoose.connection.db.collection('property_verification_snapshots');
            const result = await collection.bulkWrite([
                { updateOne: { filter: { _id: snap._id }, update: { $set: { parserVersion: 'bypass-test' } } } }
            ]);
            assert.equal(result.modifiedCount, 1);
            // Document limitation: True database-level immutability requires MongoDB DB-role privilege restrictions.
        });
    });

    // =========================================================================
    // SECTION 2: PERMISSION SERVICE & MIDDLEWARE REAL EXECUTION
    // =========================================================================
    describe('2. Real Permission Service & Middleware Execution', () => {
        it('2.1 hasPermission should deny authorityVerification.view for user with no access', async () => {
            const allowed = await hasPermission(userNoAccess, 'authorityVerification', 'view');
            assert.equal(allowed, false);
        });

        it('2.2 hasPermission should allow authorityVerification.view for auditor user', async () => {
            const allowed = await hasPermission(userViewOnly, 'authorityVerification', 'view');
            assert.equal(allowed, true);
        });

        it('2.3 hasPermission should deny authorityVerification.create for view-only user', async () => {
            const allowed = await hasPermission(userViewOnly, 'authorityVerification', 'create');
            assert.equal(allowed, false);
        });

        it('2.4 hasPermission should allow authorityVerification.create for operator user', async () => {
            const allowed = await hasPermission(userRunCreator, 'authorityVerification', 'create');
            assert.equal(allowed, true);
        });

        it('2.5 hasApprovalRight should deny manageAuthoritySettings for reviewer without admin rights', async () => {
            const allowed = await hasApprovalRight(userReviewerNoAdmin, 'manageAuthoritySettings');
            assert.equal(allowed, false);
        });

        it('2.6 hasApprovalRight should allow manageAuthoritySettings for super admin', async () => {
            const allowed = await hasApprovalRight(userFullAdmin, 'manageAuthoritySettings');
            assert.equal(allowed, true);
        });

        it('2.7 hasApprovalRight should deny approveAuthorityChanges for user without approval right', async () => {
            const allowed = await hasApprovalRight(userReviewerNoAdmin, 'approveAuthorityChanges');
            assert.equal(allowed, false);
        });

        it('2.8 hasApprovalRight should allow approveAuthorityChanges for super admin', async () => {
            const allowed = await hasApprovalRight(userFullAdmin, 'approveAuthorityChanges');
            assert.equal(allowed, true);
        });
    });

    // =========================================================================
    // SECTION 3: AUDITLOG PERSISTENCE, ATTRIBUTION & REDACTION
    // =========================================================================
    describe('3. AuditLog Persistence & Redaction Security', () => {
        it('3.1 should persist authority event with actor attribution and target info', async () => {
            const inventoryId = new mongoose.Types.ObjectId();
            const log = await AuditLog.logEntityUpdate(
                'authority_link_created',
                'inventory',
                inventoryId,
                'Unit 101 Link',
                userFullAdmin._id,
                { before: null, after: { compositeKey: 'HSVP:SEC1:PLOT1' } },
                'Authority link created',
                { tenantId: tenantA }
            );

            assert.ok(log._id);
            assert.equal(log.eventType, 'authority_link_created');
            assert.equal(log.targetType, 'inventory');
            assert.equal(log.userId.toString(), userFullAdmin._id.toString());
            assert.equal(log.status, 'success');
        });

        it('3.2 should redact sensitive keys (password, credential, secret, token) in metadata', async () => {
            const log = await AuditLog.logEntityUpdate(
                'authority_settings_updated',
                'authority_settings',
                new mongoose.Types.ObjectId(),
                'Settings Update',
                userFullAdmin._id,
                {
                    before: {},
                    after: {
                        apiKey: 'sensitive-api-key',
                        password: 'raw-password-123',
                        authToken: 'secret-jwt-token',
                        clientSecret: 'super-secret',
                        safeKey: 'public-value'
                    }
                },
                'Settings update with sensitive fields'
            );

            assert.equal(log.changes.after.password, '[REDACTED]');
            assert.equal(log.changes.after.authToken, '[REDACTED]');
            assert.equal(log.changes.after.clientSecret, '[REDACTED]');
            assert.equal(log.changes.after.safeKey, 'public-value');
        });

        it('3.3 should mask email and phone in PII scalar values', async () => {
            const log = await AuditLog.logEntityUpdate(
                'authority_review_submitted',
                'inventory',
                new mongoose.Types.ObjectId(),
                'Review with PII',
                userFullAdmin._id,
                {
                    before: {},
                    after: {
                        contactEmail: 'raw@example.com',
                        note: 'Contacted user at testuser@example.com with phone +919876543210'
                    }
                },
                'PII review log'
            );

            assert.equal(log.changes.after.contactEmail, '[PII_MINIMIZED]');
            assert.ok(!log.changes.after.note.includes('testuser@example.com'), 'Email must be masked');
            assert.ok(log.changes.after.note.includes('t***@example.com'), 'Email must have masked form');
            assert.ok(log.changes.after.note.includes('[PHONE_MINIMIZED]'), 'Phone number must be minimized');
        });

        it('3.4 should reject invalid authority eventType on save', async () => {
            await assert.rejects(
                () => AuditLog.create({
                    eventType: 'invalid_unsupported_authority_event',
                    targetType: 'inventory',
                    description: 'Invalid event test'
                }),
                (err) => err.name === 'ValidationError'
            );
        });
    });

    // =========================================================================
    // SECTION 4: FIELD ALLOWLIST & ANTI-CORRUPTION ENFORCEMENT
    // =========================================================================
    describe('4. Field Allowlist & Anti-Corruption Protection', () => {
        let testInventory;

        beforeEach(async () => {
            testInventory = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'UNIT-404',
                sector: 'Sector 15',
                status: 'Available',
                ownership: 'Individual',
                department: 'inventory',
                visibleTo: 'Public'
            });
        });

        it('4.1 BLOCKED_UPDATE_FIELDS must include all core and access-control fields', () => {
            const requiredBlocked = [
                'status',
                '_id',
                'tenantId',
                'createdAt',
                'updatedAt',
                'owners',
                'associates',
                'teams',
                'team',
                'assignedTo',
                'department',
                'visibleTo'
            ];
            for (const f of requiredBlocked) {
                assert.ok(BLOCKED_UPDATE_FIELDS.has(f), `BLOCKED_UPDATE_FIELDS must include ${f}`);
            }
        });

        it('4.2 ALLOWED_UPDATE_FIELDS must strictly contain only canonical authorityVerification.* fields', () => {
            for (const f of ALLOWED_UPDATE_FIELDS) {
                assert.ok(f.startsWith('authorityVerification.'), `Allowed field must be under authorityVerification.*: ${f}`);
                assert.ok(!BLOCKED_UPDATE_FIELDS.has(f), `Allowed field cannot be in blocked set: ${f}`);
            }
        });

        it('4.3 applyApprovedChanges must reject attempts to modify Inventory.status', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userFullAdmin._id,
                runMode: 'SINGLE',
                status: 'COMPLETED'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInventory._id,
                authorityCode: 'HSVP',
                sectorNumber: '15',
                propertyId: 'PLOT-1',
                compositeKey: 'HSVP:SEC15:PLOT1',
                createdBy: userFullAdmin._id
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: testInventory._id,
                linkId: link._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'status',
                        currentValue: 'Available',
                        proposedValue: 'Sold Out by Authority',
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenFullAdmin}`
                }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.equal(data.rejectedFields[0].field, 'status');

            // Verify Inventory.status was NOT mutated
            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(String(refreshed.status), String(testInventory.status));
            assert.notEqual(refreshed.status, 'Sold Out by Authority');
        });

        it('4.4 applyApprovedChanges must reject attempts to modify owners or tenantId', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userFullAdmin._id,
                runMode: 'SINGLE',
                status: 'COMPLETED'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInventory._id,
                authorityCode: 'HSVP',
                sectorNumber: '15',
                propertyId: 'PLOT-2',
                compositeKey: 'HSVP:SEC15:PLOT2',
                createdBy: userFullAdmin._id
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: testInventory._id,
                linkId: link._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'owners',
                        currentValue: [],
                        proposedValue: [new mongoose.Types.ObjectId()],
                        approved: true
                    },
                    {
                        field: 'tenantId',
                        currentValue: tenantA,
                        proposedValue: tenantB,
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenFullAdmin}`
                }
            });

            assert.equal(res.status, 422);
            const refreshed = await Inventory.findById(testInventory._id);
            assert.equal(refreshed.tenantId.toString(), tenantA.toString());
            assert.equal(refreshed.owners.length, 0);
        });

        it('4.5 applyApprovedChanges must reject null or empty string proposed values', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userFullAdmin._id,
                runMode: 'SINGLE',
                status: 'COMPLETED'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInventory._id,
                authorityCode: 'HSVP',
                sectorNumber: '15',
                propertyId: 'PLOT-3',
                compositeKey: 'HSVP:SEC15:PLOT3',
                createdBy: userFullAdmin._id
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: testInventory._id,
                linkId: link._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertySize',
                        currentValue: '500 Sq Yards',
                        proposedValue: null, // Attempting to clear existing data with null
                        approved: true
                    },
                    {
                        field: 'authorityVerification.allotmentDate',
                        currentValue: '2020-01-01',
                        proposedValue: '   ', // Empty string
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenFullAdmin}`
                }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.equal(data.rejectedFields.length, 2);
        });

        it('4.6 applyApprovedChanges must reject sentinel objects from clearing data', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userFullAdmin._id,
                runMode: 'SINGLE',
                status: 'COMPLETED'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: testInventory._id,
                authorityCode: 'HSVP',
                sectorNumber: '15',
                propertyId: 'PLOT-4',
                compositeKey: 'HSVP:SEC15:PLOT4',
                createdBy: userFullAdmin._id
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: testInventory._id,
                linkId: link._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertySize',
                        currentValue: '500 Sq Yards',
                        proposedValue: SENTINEL.NOT_RETURNED, // Sentinel object
                        approved: true
                    }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenFullAdmin}`
                }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.ok(data.rejectedFields[0].reason.includes('sentinel'));
        });

        it('4.7 applyApprovedChanges applies legitimate allowed fields and creates durable audit', async () => {
            try {
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
                            permittedFields: ['propertyId', 'sectorNumber', 'propertySize']
                        }
                    },
                    { upsert: true }
                );

                const run = await PropertyVerificationRun.create({
                    tenantId: tenantA,
                    authorityCode: 'HSVP',
                    requestedBy: userFullAdmin._id,
                    runMode: 'SINGLE',
                    status: 'COMPLETED',
                    isFixtureMode: false,
                    provenance: 'LIVE'
                });

                const link = await PropertyAuthorityLink.create({
                    tenantId: tenantA,
                    inventoryId: testInventory._id,
                    authorityCode: 'HSVP',
                    sectorNumber: '15',
                    propertyId: 'PLOT-5',
                    compositeKey: 'HSVP:SEC15:PLOT5',
                    createdBy: userFullAdmin._id
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
                    inventoryId: testInventory._id,
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
                            currentValue: 'Unknown',
                            proposedValue: '350 Sq Yards',
                            approved: true
                        }
                    ]
                });

                const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tokenFullAdmin}`
                    }
                });

                assert.equal(res.status, 200);
                const data = await res.json();
                assert.equal(data.success, true);
                assert.equal(data.data.appliedFields.length, 1);
                assert.ok(data.data.auditId);

                // Verify Inventory was updated in subdocument
                const updatedInv = await Inventory.findById(testInventory._id).lean();
                assert.equal(updatedInv.authorityVerification?.propertySize, '350 Sq Yards');
                // Ensure status was untouched
                assert.equal(String(updatedInv.status), String(testInventory.status));
            } finally {
                await AuthoritySourceSettings.findOneAndUpdate(
                    { tenantId: tenantA, authorityCode: 'HSVP' },
                    {
                        $set: {
                            isEnabled: false,
                            isPaused: false,
                            permissionStatus: 'NOT_OBTAINED',
                            reviewStatus: 'DRAFT'
                        }
                    }
                );
            }
        });
    });

    // =========================================================================
    // SECTION 5: GENUINE HTTP CONTROLLER INTEGRATION TESTS
    // =========================================================================
    describe('5. Genuine HTTP / Controller Integration Tests', () => {
        it('5.1 Unauthenticated requests return 401', async () => {
            const endpoints = [
                { method: 'GET', path: '/api/authority/settings' },
                { method: 'POST', path: '/api/authority/runs' },
                { method: 'POST', path: '/api/authority/apply/fake-id' }
            ];

            for (const ep of endpoints) {
                const res = await fetch(`${baseUrl}${ep.path}`, {
                    method: ep.method,
                    headers: { 'Content-Type': 'application/json' }
                });
                assert.equal(res.status, 401, `Endpoint ${ep.method} ${ep.path} must return 401 unauthenticated`);
            }
        });

        it('5.2 Unauthorized requests (no moduleAccess) return 403 and write AuditLog access_denied', async () => {
            const res = await fetch(`${baseUrl}/api/authority/settings`, {
                headers: { Authorization: `Bearer ${tokenNoAccess}` }
            });
            assert.equal(res.status, 403);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.ok(data.message.includes('Insufficient permissions'));

            // Check AuditLog
            const deniedLog = await AuditLog.findOne({
                userId: userNoAccess._id,
                eventType: 'access_denied'
            }).sort({ timestamp: -1 });
            assert.ok(deniedLog, 'Access denied must be recorded in AuditLog');
            assert.equal(deniedLog.metadata?.module, 'authorityVerification');
            assert.equal(deniedLog.metadata?.action, 'view');
        });

        it('5.3 Unauthorized creation request (view-only role) returns 403', async () => {
            const res = await fetch(`${baseUrl}/api/authority/runs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenViewOnly}`
                },
                body: JSON.stringify({ authorityCode: 'HSVP' })
            });
            assert.equal(res.status, 403);
        });

        it('5.4 Missing approval-right for settings update returns 403', async () => {
            const res = await fetch(`${baseUrl}/api/authority/settings/HSVP`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenReviewerNoAdmin}`
                },
                body: JSON.stringify({ isEnabled: true })
            });
            assert.equal(res.status, 403);
            const data = await res.json();
            assert.ok(data.message.includes('manageAuthoritySettings'));
        });

        it('5.5 Missing approval-right for applying approved changes returns 403', async () => {
            const fakeId = new mongoose.Types.ObjectId();
            const res = await fetch(`${baseUrl}/api/authority/apply/${fakeId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenReviewerNoAdmin}`
                }
            });
            assert.equal(res.status, 403);
            const data = await res.json();
            assert.ok(data.message.includes('approveAuthorityChanges'));
        });

        it('5.6 Multi-Tenant Isolation: Tenant A cannot view Tenant B links', async () => {
            const invB = await Inventory.create({
                tenantId: tenantB,
                unitNo: 'TENANT-B-UNIT',
                sector: 'Sector 50',
                status: 'Available'
            });

            await PropertyAuthorityLink.create({
                tenantId: tenantB,
                inventoryId: invB._id,
                authorityCode: 'HSVP',
                sectorNumber: '50',
                propertyId: 'PLOT-B',
                compositeKey: 'HSVP:SEC50:PLOTB',
                createdBy: userTenantB._id
            });

            // Tenant A queries links for Tenant B's inventory
            const res = await fetch(`${baseUrl}/api/authority/links/${invB._id}`, {
                headers: { Authorization: `Bearer ${tokenFullAdmin}` }
            });
            // Access denied / Inventory not found for Tenant A
            assert.equal(res.status, 404, 'Must return 404 access denied for Tenant B inventory');
            const data = await res.json();
            assert.equal(data.success, false);
            assert.ok(data.message.includes('Inventory not found or access denied'));
        });

        it('5.7 Multi-Tenant Isolation: Tenant A cannot apply changes to Tenant B run items', async () => {
            const invB = await Inventory.create({
                tenantId: tenantB,
                unitNo: 'TENANT-B-UNIT-2',
                sector: 'Sector 50',
                status: 'Available'
            });

            const runB = await PropertyVerificationRun.create({
                tenantId: tenantB,
                authorityCode: 'HSVP',
                requestedBy: userTenantB._id,
                runMode: 'SINGLE',
                status: 'COMPLETED'
            });

            const linkB = await PropertyAuthorityLink.create({
                tenantId: tenantB,
                inventoryId: invB._id,
                authorityCode: 'HSVP',
                sectorNumber: '50',
                propertyId: 'PLOT-B2',
                compositeKey: 'HSVP:SEC50:PLOTB2',
                createdBy: userTenantB._id
            });

            const itemB = await PropertyVerificationRunItem.create({
                tenantId: tenantB,
                runId: runB._id,
                inventoryId: invB._id,
                linkId: linkB._id,
                authorityCode: 'HSVP',
                status: 'SUCCEEDED',
                reviewerDecision: 'APPROVED',
                proposedChanges: [
                    {
                        field: 'authorityVerification.propertySize',
                        currentValue: '100',
                        proposedValue: '200',
                        approved: true
                    }
                ]
            });

            // Tenant A attempts to apply itemB
            const res = await fetch(`${baseUrl}/api/authority/apply/${itemB._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenFullAdmin}`
                }
            });
            // Item not found under Tenant A
            assert.equal(res.status, 404);
            const refreshedInv = await Inventory.findById(invB._id);
            assert.equal(refreshedInv.authorityVerification?.propertySize ?? null, null);
        });

        it('5.8 Policy-disabled requests: Attempting verification run for disabled source returns 422 POLICY_REJECTED', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'POLICY-TEST-UNIT',
                sector: 'Sector 10',
                status: 'Available'
            });

            // Ensure source settings exist and are disabled (NOT_OBTAINED)
            await AuthoritySourceSettings.ensureDefaults(tenantA);

            const res = await fetch(`${baseUrl}/api/authority/runs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenFullAdmin}`
                },
                body: JSON.stringify({
                    authorityCode: 'HSVP',
                    runMode: 'SINGLE',
                    inventoryIds: [inv._id.toString()]
                })
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.equal(data.message, 'Verification source is not activated');
            assert.equal(data.data.status, 'POLICY_REJECTED');
            assert.ok(data.blockers.length > 0);

            // Confirm that rejected request creates POLICY_REJECTED audit record
            const rejectedLog = await AuditLog.findOne({
                userId: userFullAdmin._id,
                eventType: 'authority_run_policy_rejected'
            }).sort({ timestamp: -1 });
            assert.ok(rejectedLog);

            // Confirm no inventory was modified
            const untouchedInv = await Inventory.findById(inv._id);
            assert.equal(untouchedInv.authorityVerification?.propertySize ?? null, null);
            assert.equal(untouchedInv.authorityVerification?.lastVerifiedAt ?? null, null);
        });
    });
});
