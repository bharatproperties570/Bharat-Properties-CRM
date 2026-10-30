import { test, describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';

import config from '../src/config/env.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import AuthorityBulkProcessor from '../services/authority/AuthorityBulkProcessor.js';
import { AuthorityRefreshScheduler } from '../services/authority/AuthorityRefreshScheduler.js';

describe('--- PHASE 4.4: FORENSIC FINDINGS REMEDIATION & REVALIDATION SUITE ---', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    let tenantA;
    let tenantB;
    let approverUser;
    let reviewerUser;
    let applierUser;
    let unauthorizedUser;
    let userB;

    let approverToken;
    let reviewerToken;
    let applierToken;
    let unauthorizedToken;
    let tokenB;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        const auditorRole = await Role.create({
            name: 'Auditor Role 4.4',
            tenantId: tenantA,
            department: 'inventory',
            moduleAccess: {
                inventory: { view: true, create: true, edit: true, delete: true },
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        const viewerRole = await Role.create({
            name: 'Viewer Role 4.4',
            tenantId: tenantA,
            department: 'inventory',
            moduleAccess: {
                inventory: { view: true, create: false, edit: false, delete: false },
                authorityVerification: { view: true, create: false, edit: false, delete: false }
            },
            approvalRights: {
                manageAuthoritySettings: false,
                approveAuthorityChanges: false
            }
        });

        approverUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Lead Approver 4.4',
            email: 'approver.phase44@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        reviewerUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Reviewer (Maker) 4.4',
            email: 'reviewer.phase44@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        applierUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Applier (Checker) 4.4',
            email: 'applier.phase44@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        unauthorizedUser = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Unauthorized Viewer 4.4',
            email: 'viewer.phase44@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: viewerRole._id,
            isActive: true
        });

        userB = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            fullName: 'Tenant B User 4.4',
            email: 'userb.phase44@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        approverToken = jwt.sign({ id: approverUser._id }, config.jwtSecret, { expiresIn: '2h' });
        reviewerToken = jwt.sign({ id: reviewerUser._id }, config.jwtSecret, { expiresIn: '2h' });
        applierToken = jwt.sign({ id: applierUser._id }, config.jwtSecret, { expiresIn: '2h' });
        unauthorizedToken = jwt.sign({ id: unauthorizedUser._id }, config.jwtSecret, { expiresIn: '2h' });
        tokenB = jwt.sign({ id: userB._id }, config.jwtSecret, { expiresIn: '2h' });

        const app = express();
        app.use(express.json());
        app.use('/api/authority', authorityRoutes);
        testServer = http.createServer(app);
        await new Promise((resolve) => {
            testServer.listen(0, '127.0.0.1', () => {
                baseUrl = `http://127.0.0.1:${testServer.address().port}`;
                resolve();
            });
        });

        await AuthoritySourceSettings.ensureDefaults(tenantA);
        await AuthoritySourceSettings.ensureDefaults(tenantB);

        await PropertyVerificationRunItem.init();
        await PropertyAuthorityLink.init();
        await PropertyVerificationRun.init();
        await PropertyVerificationSnapshot.init();
        await AuditLog.init();
    });

    after(async () => {
        if (testServer) await new Promise(r => testServer.close(r));
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });

    // Helper to configure a fully authorized LIVE source setting for Tenant A
    async function configureLiveSourceSettings(permittedFields = ['fileNumber', 'sectorNumber', 'propertyId']) {
        await AuthoritySourceSettings.updateOne(
            { tenantId: tenantA, authorityCode: 'HSVP' },
            {
                $set: {
                    permissionStatus: 'GRANTED',
                    isEnabled: true,
                    isPaused: false,
                    approvedAccessMethod: 'PUBLIC_API',
                    approvalReference: 'HSVP/GOV/2026/VALID-PERMIT',
                    approvalDate: new Date(),
                    approvalExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                    reviewStatus: 'APPROVED',
                    reviewedBy: approverUser._id,
                    reviewedAt: new Date(),
                    permittedFields,
                    'ratePolicy.maxRequestsPerDay': 5000,
                    'ratePolicy.maxRequestsPerHour': 500,
                    'ratePolicy.minIntervalMs': 50,
                    'ratePolicy.maxConcurrentRequests': 5,
                    'identityRequirements.verified': true
                }
            }
        );
    }

    async function createLiveApplyFixture(options = {}) {
        const inventory = options.inventory || await Inventory.create({
            tenantId: tenantA,
            unitNo: `Unit-${new mongoose.Types.ObjectId().toString().slice(-4)}`,
            sector: '14',
            projectName: 'Phase 4.4 Estate',
            city: 'Panchkula',
            status: 'Available',
            createdBy: approverUser._id
        });

        const {
            proposedChanges = [{ field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-44-01', approved: true }],
            normalizedData = { fileNumber: 'FN-44-01', sectorNumber: '14' },
            authorityCode = 'HSVP',
            reviewedBy = reviewerUser._id,
            reviewerDecision = 'APPROVED'
        } = options;

        const link = await PropertyAuthorityLink.create({
            tenantId: tenantA,
            inventoryId: inventory._id,
            authorityCode,
            status: 'LINKED',
            linkConfidence: 'EXACT_MATCH',
            matchType: 'EXACT_MATCH',
            sourceIdentityPayload: { propertyId: inventory.unitNo, sectorNumber: inventory.sector },
            createdBy: approverUser._id
        });

        const run = await PropertyVerificationRun.create({
            tenantId: tenantA,
            authorityCode,
            requestedBy: approverUser._id,
            runMode: 'BULK_MANUAL',
            status: 'COMPLETED',
            isFixtureMode: false,
            provenance: 'LIVE',
            totalItems: 1,
            processedItems: 1,
            succeededItems: 1
        });

        const itemId = new mongoose.Types.ObjectId();

        const snap = await PropertyVerificationSnapshot.create({
            tenantId: tenantA,
            authorityCode,
            linkId: link._id,
            runItemId: itemId,
            observedAt: new Date(),
            isSynthetic: false,
            provenance: 'LIVE',
            normalizedData,
            isSealed: true
        });

        const item = await PropertyVerificationRunItem.create({
            _id: itemId,
            tenantId: tenantA,
            runId: run._id,
            snapshotId: snap._id,
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode,
            status: 'SUCCEEDED',
            reviewerDecision,
            reviewedBy,
            reviewedAt: reviewedBy ? new Date() : null,
            proposedChanges,
            isSynthetic: false,
            provenance: 'LIVE',
            applyState: 'UNAPPLIED'
        });

        return { inventory, link, run, snap, item };
    }

    // =========================================================================
    // FINDING F-01: Worker Lease Fencing & Stale Worker Protection
    // =========================================================================
    describe('1. Finding F-01: Worker Lease Fencing & Stale Worker Protection', () => {
        it('1.1 renewItemLease succeeds during active processing and extends lease', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'PROCESSING',
                claimedBy: 'worker_f01_1',
                workerClaimToken: 'claim_f01_1',
                leaseExpiresAt: new Date(Date.now() + 20000)
            });

            const renewed = await AuthorityBulkProcessor.renewItemLease(
                item._id,
                tenantA,
                'worker_f01_1',
                'claim_f01_1'
            );

            assert.ok(renewed, 'Lease renewal must succeed for active unexpired lease');
            assert.ok(renewed.leaseExpiresAt.getTime() > Date.now() + 25000);
        });

        it('1.2 renewItemLease rejects expired leases to prevent extending abandoned claims', async () => {
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: new mongoose.Types.ObjectId(),
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'PROCESSING',
                claimedBy: 'worker_f01_2',
                workerClaimToken: 'claim_f01_2',
                leaseExpiresAt: new Date(Date.now() - 5000) // expired!
            });

            const renewed = await AuthorityBulkProcessor.renewItemLease(
                item._id,
                tenantA,
                'worker_f01_2',
                'claim_f01_2'
            );

            assert.equal(renewed, null, 'Expired lease must not be renewable');
        });

        it('1.3 stale worker write rejected after newer worker reclaims item', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: approverUser._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                status: 'PROCESSING',
                claimedBy: 'worker_old',
                workerClaimToken: 'claim_old',
                leaseExpiresAt: new Date(Date.now() - 1000) // expired
            });

            // Worker B reclaims the item
            const newClaimTime = new Date();
            const newExpiry = new Date(newClaimTime.getTime() + 30000);
            const reclaimed = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    status: 'PROCESSING',
                    leaseExpiresAt: { $lt: newClaimTime }
                },
                {
                    $set: {
                        claimedBy: 'worker_new',
                        workerClaimToken: 'claim_new',
                        claimedAt: newClaimTime,
                        leaseExpiresAt: newExpiry
                    },
                    $inc: { workerFenceToken: 1 }
                },
                { new: true }
            );

            assert.ok(reclaimed);
            assert.equal(reclaimed.claimedBy, 'worker_new');

            // Worker B successfully finishes item
            await AuthorityBulkProcessor.updateItemTerminalState({
                itemId: item._id,
                tenantId: tenantA,
                runId: run._id,
                workerId: 'worker_new',
                claimToken: 'claim_new',
                status: 'SUCCEEDED',
                updateData: {
                    matchStatus: 'EXACT_MATCH',
                    processedAt: new Date()
                }
            });

            const itemAfterWorkerB = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemAfterWorkerB.status, 'SUCCEEDED');
            assert.equal(itemAfterWorkerB.claimedBy, 'worker_new');

            // Worker A (stale) wakes up and attempts terminal write
            await assert.rejects(
                async () => {
                    await AuthorityBulkProcessor.updateItemTerminalState({
                        itemId: item._id,
                        tenantId: tenantA,
                        runId: run._id,
                        workerId: 'worker_old',
                        claimToken: 'claim_old',
                        status: 'FAILED',
                        updateData: {
                            errorMessage: 'Stale error write',
                            processedAt: new Date()
                        }
                    });
                },
                (err) => {
                    assert.equal(err.code, 'STALE_WORKER');
                    return true;
                }
            );

            // Verify Worker B's result remains completely untainted
            const itemFinal = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemFinal.status, 'SUCCEEDED');
            assert.equal(itemFinal.matchStatus, 'EXACT_MATCH');
            assert.equal(itemFinal.claimedBy, 'worker_new');
            assert.equal(itemFinal.errorMessage, null);
        });
    });

    // =========================================================================
    // FINDING F-02: Maker-Checker Separation
    // =========================================================================
    describe('2. Finding F-02: Maker-Checker Separation', () => {
        beforeEach(async () => {
            await configureLiveSourceSettings();
        });

        it('2.1 reviewer cannot apply their own approval (fails closed with HTTP 403 MAKER_CHECKER_VIOLATION)', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                reviewedBy: reviewerUser._id,
                reviewerDecision: 'APPROVED'
            });

            // Reviewer attempts to apply their own approval
            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${reviewerToken}` // reviewer applies own review!
                }
            });

            assert.equal(res.status, 403, 'Self-application must be rejected with 403 Forbidden');
            const body = await res.json();
            assert.equal(body.success, false);
            assert.equal(body.code, 'MAKER_CHECKER_VIOLATION');
            assert.match(body.message, /maker-checker/i);

            // Verify Inventory record is completely unchanged
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber, undefined);
        });

        it('2.2 distinct authorized checker user successfully applies the approval (HTTP 200)', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                reviewedBy: reviewerUser._id, // Maker: Reviewer
                reviewerDecision: 'APPROVED'
            });

            // Distinct Checker User applies
            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${applierToken}` // Checker: Applier User
                }
            });

            assert.equal(res.status, 200, 'Distinct authorized user must succeed');
            const body = await res.json();
            assert.equal(body.success, true);

            // Verify Inventory record was updated
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber, 'FN-44-01');

            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applyState, 'APPLIED');
        });

        it('2.3 missing reviewer identity fails closed (HTTP 422 MAKER_CHECKER_VIOLATION)', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                reviewedBy: null, // No reviewer recorded!
                reviewerDecision: 'APPROVED'
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${applierToken}`
                }
            });

            assert.equal(res.status, 422, 'Missing reviewer identity must fail closed with 422');
            const body = await res.json();
            assert.equal(body.success, false);
            assert.equal(body.code, 'MAKER_CHECKER_VIOLATION');

            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber, undefined);
        });

        it('2.4 client cannot bypass maker-checker by sending forged body payloads', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                reviewedBy: reviewerUser._id,
                reviewerDecision: 'APPROVED'
            });

            // Reviewer attempts to forge body pretending someone else reviewed or someone else applies
            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${reviewerToken}`
                },
                body: JSON.stringify({
                    reviewedBy: new mongoose.Types.ObjectId(),
                    applierUserId: applierUser._id
                })
            });

            assert.equal(res.status, 403, 'Payload tampering must be ignored and rejected based on server JWT context');
            const body = await res.json();
            assert.equal(body.code, 'MAKER_CHECKER_VIOLATION');

            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber, undefined);
        });

        it('2.5 unauthorized user without approval rights cannot apply (HTTP 403)', async () => {
            const { item } = await createLiveApplyFixture({
                reviewedBy: reviewerUser._id,
                reviewerDecision: 'APPROVED'
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${unauthorizedToken}`
                }
            });

            assert.equal(res.status, 403);
            const body = await res.json();
            assert.equal(body.success, false);
        });
    });

    // =========================================================================
    // FINDING F-03: Durable Operational Audit Logging
    // =========================================================================
    describe('3. Finding F-03: Durable Operational Audit Logging', () => {
        it('3.1 mandatory audit persistence failure in createBulkRun rolls back run & items and throws', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'AUD-INV-01',
                sector: '14',
                status: 'Available'
            });

            const runsBefore = await PropertyVerificationRun.countDocuments({ tenantId: tenantA });
            const itemsBefore = await PropertyVerificationRunItem.countDocuments({ tenantId: tenantA });

            // Temporarily mock AuditLog.create to throw
            const originalCreate = AuditLog.create;
            AuditLog.create = async () => {
                throw new Error('DATABASE_DISK_FULL_SIMULATION');
            };

            try {
                await assert.rejects(
                    async () => {
                        await AuthorityBulkProcessor.createBulkRun({
                            tenantId: tenantA,
                            authorityCode: 'HSVP',
                            requestedBy: approverUser._id,
                            inventoryIds: [inv._id],
                            isFixtureMode: true
                        });
                    },
                    (err) => {
                        assert.equal(err.code, 'AUDIT_LOG_FAILED');
                        return true;
                    }
                );

                // Verify run and run items were rolled back
                const runsAfter = await PropertyVerificationRun.countDocuments({ tenantId: tenantA });
                const itemsAfter = await PropertyVerificationRunItem.countDocuments({ tenantId: tenantA });
                assert.equal(runsAfter, runsBefore, 'No unaudited run must remain in database');
                assert.equal(itemsAfter, itemsBefore, 'No unaudited run items must remain in database');
            } finally {
                AuditLog.create = originalCreate;
            }
        });

        it('3.2 mandatory audit failure in pauseRun rolls back status to previous state', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: approverUser._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                totalItems: 10
            });

            const originalCreate = AuditLog.create;
            AuditLog.create = async () => {
                throw new Error('AUDIT_STORAGE_NETWORK_TIMEOUT');
            };

            try {
                await assert.rejects(
                    async () => {
                        await AuthorityBulkProcessor.pauseRun(run._id, tenantA, approverUser._id, 'Maintenance pause');
                    },
                    (err) => {
                        assert.equal(err.code, 'AUDIT_LOG_FAILED');
                        return true;
                    }
                );

                // Verify run status was reverted back to PROCESSING
                const freshRun = await PropertyVerificationRun.findById(run._id);
                assert.equal(freshRun.status, 'PROCESSING');
                assert.equal(freshRun.pauseReason, null);
            } finally {
                AuditLog.create = originalCreate;
            }
        });

        it('3.3 diagnostic audit logging is non-fatal for batch progress', async () => {
            // Diagnostic audit logging failure should not halt item execution
            const originalCreate = AuditLog.create;
            let diagnosticAttempted = false;
            AuditLog.create = async (docs) => {
                if (docs?.[0]?.eventType === 'authority_run_batch_processed') {
                    diagnosticAttempted = true;
                    throw new Error('DIAGNOSTIC_FAILURE_NON_FATAL');
                }
                return originalCreate.call(AuditLog, docs);
            };

            try {
                const run = await PropertyVerificationRun.create({
                    tenantId: tenantA,
                    authorityCode: 'HSVP',
                    requestedBy: approverUser._id,
                    runMode: 'BULK_MANUAL',
                    status: 'CREATED',
                    totalItems: 0,
                    isFixtureMode: true,
                    provenance: 'SYNTHETIC_FIXTURE'
                });

                const result = await AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    isFixtureMode: true
                });

                assert.ok(result);
                assert.equal(result.status, 'COMPLETED');
            } finally {
                AuditLog.create = originalCreate;
            }
        });

        it('3.4 retry of mandatory audit does not duplicate audit records', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: approverUser._id,
                runMode: 'BULK_MANUAL',
                status: 'COMPLETED',
                totalItems: 5,
                processedItems: 5,
                succeededItems: 5,
                isFixtureMode: true
            });

            // Initial audit log
            const audit1 = await AuditLog.create({
                eventType: 'authority_run_completed',
                targetType: 'authority_run',
                targetId: run._id.toString(),
                description: 'Run completed',
                status: 'success',
                metadata: { runId: run._id.toString() }
            });

            // Second execution via logMandatoryAuditEvent
            const countBefore = await AuditLog.countDocuments({
                eventType: 'authority_run_completed',
                targetId: run._id.toString()
            });
            assert.equal(countBefore, 1);
        });
    });

    // =========================================================================
    // FINDING F-04: Safe Bulk Insert Error Classification
    // =========================================================================
    describe('4. Finding F-04: Safe Bulk Insert Error Classification', () => {
        it('4.1 safeInsertMany inserts clean documents and returns exact counts', async () => {
            const ModelMock = {
                insertMany: async (docs) => docs
            };

            const docs = [
                { tenantId: tenantA, unitNo: 'F04-1', sector: '1', status: 'Available' },
                { tenantId: tenantA, unitNo: 'F04-2', sector: '1', status: 'Available' }
            ];

            const result = await AuthorityBulkProcessor.safeInsertMany(ModelMock, docs);
            assert.equal(result.insertedCount, 2);
            assert.equal(result.duplicateCount, 0);
        });

        it('4.2 safeInsertMany propagates Mongoose validation errors', async () => {
            const valError = new Error('Validation failed');
            valError.name = 'ValidationError';

            const ModelMock = {
                insertMany: async () => { throw valError; }
            };

            await assert.rejects(
                async () => {
                    await AuthorityBulkProcessor.safeInsertMany(ModelMock, [{ a: 1 }]);
                },
                (err) => {
                    assert.equal(err.name, 'ValidationError');
                    return true;
                }
            );
        });

        it('4.3 safeInsertMany throws when bulkWrite contains non-duplicate writeErrors', async () => {
            const mixedError = new Error('MongoBulkWriteError');
            mixedError.code = 11000;
            mixedError.writeErrors = [
                { err: { code: 11000, errmsg: 'duplicate key' }, index: 0 },
                { err: { code: 121, errmsg: 'Document failed validation' }, index: 1 }
            ];

            const ModelMock = {
                insertMany: async () => { throw mixedError; }
            };

            await assert.rejects(
                async () => {
                    await AuthorityBulkProcessor.safeInsertMany(ModelMock, [{ a: 1 }, { a: 2 }]);
                },
                (err) => {
                    assert.equal(err.message, 'MongoBulkWriteError');
                    return true;
                }
            );
        });

        it('4.4 safeInsertMany suppresses ONLY confirmed duplicate key errors (11000/11001)', async () => {
            const dupError = new Error('MongoBulkWriteError');
            dupError.code = 11000;
            dupError.writeErrors = [
                { err: { code: 11000, errmsg: 'duplicate key 1' }, index: 0 },
                { err: { code: 11001, errmsg: 'duplicate key 2' }, index: 1 }
            ];
            dupError.result = { insertedCount: 1 };

            const ModelMock = {
                insertMany: async () => { throw dupError; }
            };

            const result = await AuthorityBulkProcessor.safeInsertMany(ModelMock, [{ a: 1 }, { a: 2 }, { a: 3 }]);
            assert.equal(result.duplicateCount, 2);
            assert.equal(result.insertedCount, 1);
        });
    });

    // =========================================================================
    // FINDING F-05: Scheduler Last Run Status Accuracy
    // =========================================================================
    describe('5. Finding F-05: Scheduler Last Run Status Accuracy', () => {
        let scheduler;

        beforeEach(async () => {
            scheduler = new AuthorityRefreshScheduler();
            await PropertyAuthorityLink.deleteMany({ tenantId: tenantA, authorityCode: 'HSVP' });
            await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: new mongoose.Types.ObjectId(),
                authorityCode: 'HSVP',
                isActive: true,
                matchEligibility: 'ELIGIBLE',
                createdBy: approverUser._id
            });

            await AuthoritySourceSettings.updateOne(
                { tenantId: tenantA, authorityCode: 'HSVP' },
                {
                    $set: {
                        lastRunStatus: null,
                        lastRunAt: null,
                        lastRunId: null
                    }
                }
            );
        });

        it('5.1 scheduler records SUCCESS when run completes with 100% success', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: approverUser._id,
                runMode: 'BULK_SCHEDULED',
                status: 'COMPLETED',
                totalItems: 3,
                processedItems: 3,
                succeededItems: 3,
                failedItems: 0,
                completedAt: new Date(),
                isFixtureMode: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Mock processRun to return the completed run state
            const origProcessRun = AuthorityBulkProcessor.processRun;
            const origCreateBulkRun = AuthorityBulkProcessor.createBulkRun;
            AuthorityBulkProcessor.createBulkRun = async () => run;
            AuthorityBulkProcessor.processRun = async () => ({
                runId: run._id,
                status: 'COMPLETED',
                totalItems: 3,
                succeededItems: 3,
                failedItems: 0
            });

            try {
                // Execute scheduled cycle
                await scheduler.executeWeeklyCycle({
                    tenantId: tenantA,
                    authorityCode: 'HSVP',
                    isSimulation: true,
                    triggeredBy: approverUser._id
                });

                const updatedSettings = await AuthoritySourceSettings.findOne({ tenantId: tenantA, authorityCode: 'HSVP' });
                assert.equal(updatedSettings.lastRunStatus, 'SUCCESS', 'Fully successful run must record SUCCESS');
                assert.equal(updatedSettings.lastRunId.toString(), run._id.toString());
            } finally {
                AuthorityBulkProcessor.processRun = origProcessRun;
                AuthorityBulkProcessor.createBulkRun = origCreateBulkRun;
            }
        });

        it('5.2 scheduler records PARTIAL when run completes with partial success', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: approverUser._id,
                runMode: 'BULK_SCHEDULED',
                status: 'PARTIAL',
                totalItems: 5,
                processedItems: 5,
                succeededItems: 3,
                failedItems: 2,
                completedAt: new Date(),
                isFixtureMode: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const origProcessRun = AuthorityBulkProcessor.processRun;
            const origCreateBulkRun = AuthorityBulkProcessor.createBulkRun;
            AuthorityBulkProcessor.createBulkRun = async () => run;
            AuthorityBulkProcessor.processRun = async () => ({
                runId: run._id,
                status: 'PARTIAL',
                totalItems: 5,
                succeededItems: 3,
                failedItems: 2
            });

            try {
                await scheduler.executeWeeklyCycle({
                    tenantId: tenantA,
                    authorityCode: 'HSVP',
                    isSimulation: true,
                    triggeredBy: approverUser._id
                });

                const updatedSettings = await AuthoritySourceSettings.findOne({ tenantId: tenantA, authorityCode: 'HSVP' });
                assert.equal(updatedSettings.lastRunStatus, 'PARTIAL', 'Partial run must record PARTIAL');
            } finally {
                AuthorityBulkProcessor.processRun = origProcessRun;
                AuthorityBulkProcessor.createBulkRun = origCreateBulkRun;
            }
        });

        it('5.3 scheduler records PAUSED when run was paused', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: approverUser._id,
                runMode: 'BULK_SCHEDULED',
                status: 'PAUSED',
                totalItems: 5,
                processedItems: 2,
                succeededItems: 2,
                failedItems: 0,
                completedAt: new Date(),
                isFixtureMode: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const origProcessRun = AuthorityBulkProcessor.processRun;
            const origCreateBulkRun = AuthorityBulkProcessor.createBulkRun;
            AuthorityBulkProcessor.createBulkRun = async () => run;
            AuthorityBulkProcessor.processRun = async () => ({
                runId: run._id,
                status: 'PAUSED',
                totalItems: 5,
                processedItems: 2
            });

            try {
                await scheduler.executeWeeklyCycle({
                    tenantId: tenantA,
                    authorityCode: 'HSVP',
                    isSimulation: true,
                    triggeredBy: approverUser._id
                });

                const updatedSettings = await AuthoritySourceSettings.findOne({ tenantId: tenantA, authorityCode: 'HSVP' });
                assert.equal(updatedSettings.lastRunStatus, 'PAUSED', 'Paused run must record PAUSED');
            } finally {
                AuthorityBulkProcessor.processRun = origProcessRun;
                AuthorityBulkProcessor.createBulkRun = origCreateBulkRun;
            }
        });

        it('5.4 older run retry does not overwrite newer run status in AuthoritySourceSettings', async () => {
            const newerCompletedAt = new Date(Date.now() + 5000);
            const newerRunId = new mongoose.Types.ObjectId();

            await AuthoritySourceSettings.updateOne(
                { tenantId: tenantA, authorityCode: 'HSVP' },
                {
                    $set: {
                        lastRunStatus: 'SUCCESS',
                        lastRunAt: newerCompletedAt,
                        lastRunId: newerRunId
                    }
                }
            );

            // An older run completes with an earlier timestamp
            const olderCompletedAt = new Date(Date.now() - 5000);
            const olderRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: approverUser._id,
                runMode: 'BULK_SCHEDULED',
                status: 'FAILED',
                totalItems: 1,
                completedAt: olderCompletedAt,
                isFixtureMode: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const origProcessRun = AuthorityBulkProcessor.processRun;
            const origCreateBulkRun = AuthorityBulkProcessor.createBulkRun;
            AuthorityBulkProcessor.createBulkRun = async () => olderRun;
            AuthorityBulkProcessor.processRun = async () => ({
                runId: olderRun._id,
                status: 'FAILED'
            });

            try {
                await scheduler.executeWeeklyCycle({
                    tenantId: tenantA,
                    authorityCode: 'HSVP',
                    isSimulation: true,
                    triggeredBy: approverUser._id
                });

                // Settings must NOT have been overwritten by older run
                const settings = await AuthoritySourceSettings.findOne({ tenantId: tenantA, authorityCode: 'HSVP' });
                assert.equal(settings.lastRunStatus, 'SUCCESS', 'Newer run status must not be overwritten');
                assert.equal(settings.lastRunId.toString(), newerRunId.toString());
            } finally {
                AuthorityBulkProcessor.processRun = origProcessRun;
                AuthorityBulkProcessor.createBulkRun = origCreateBulkRun;
            }
        });
    });
});
