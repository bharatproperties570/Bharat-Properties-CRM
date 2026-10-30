import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';

import config from '../src/config/env.js';
import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';
import { computeSnapshotContentHash } from '../services/authority/authorityNormalizer.js';
import {
    compensateApplySaga,
    reconcileInterruptedApplySaga,
    renewApplyClaimLease
} from '../controllers/authorityVerification.controller.js';

describe('Phase 4.3 — Durable Saga Crash-Safety, Compensation Integrity & Inventory Claim Fencing', () => {
    let mongoServer;
    let testServer;
    let baseUrl;

    let tenantA, tenantB;
    let userA, userB;
    let tokenA, tokenB;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        await mongoose.connect(mongoUri);

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        const auditorRole = await Role.create({
            name: 'Authority Operational Auditor Role 4.3',
            department: 'inventory',
            moduleAccess: {
                authorityVerification: { view: true, create: true, edit: true, delete: true }
            },
            approvalRights: {
                manageAuthoritySettings: true,
                approveAuthorityChanges: true
            }
        });

        userA = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            fullName: 'Auditor A 4.3',
            email: 'auditor.a.phase43@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        userB = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            fullName: 'Auditor B 4.3',
            email: 'auditor.b.phase43@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        tokenA = jwt.sign({ id: userA._id }, config.jwtSecret, { expiresIn: '2h' });
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
    });

    after(async () => {
        if (testServer) await new Promise(r => testServer.close(r));
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });

    // Helper to configure a fully authorized LIVE source setting for Tenant A
    async function configureLiveSourceSettings(permittedFields = ['fileNumber', 'sectorNumber']) {
        await AuthoritySourceSettings.updateOne(
            { tenantId: tenantA, authorityCode: 'HSVP' },
            {
                $set: {
                    permissionStatus: 'GRANTED',
                    isEnabled: true,
                    isPaused: false,
                    approvedAccessMethod: 'PUBLIC_API',
                    approvalReference: 'HSVP/IT/2026/VALID-PERMIT',
                    approvalDate: new Date(),
                    approvalExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                    reviewStatus: 'APPROVED',
                    reviewedBy: userA._id,
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

    // Helper to create a valid LIVE Run, Snapshot, Link and Item for testing apply
    async function createLiveApplyFixture(options = {}) {
        const inventory = options.inventory || await Inventory.create({
            tenantId: tenantA,
            unitNo: `Unit-${new mongoose.Types.ObjectId().toString().slice(-4)}`,
            sector: '14',
            projectName: 'Urban Greens',
            city: 'Panchkula',
            status: 'Available',
            createdBy: userA._id
        });

        const {
            proposedChanges = [{ field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-1234', approved: true }],
            normalizedData = { fileNumber: 'FN-1234', sectorNumber: '14' },
            authorityCode = 'HSVP'
        } = options;

        const link = await PropertyAuthorityLink.create({
            tenantId: tenantA,
            inventoryId: inventory._id,
            authorityCode,
            status: 'LINKED',
            linkConfidence: 'EXACT_MATCH',
            matchType: 'EXACT_MATCH',
            sourceIdentityPayload: { propertyId: inventory.unitNo, sectorNumber: inventory.sector },
            createdBy: userA._id
        });

        const run = await PropertyVerificationRun.create({
            tenantId: tenantA,
            authorityCode,
            requestedBy: userA._id,
            runMode: 'BULK_MANUAL',
            status: 'COMPLETED',
            isFixtureMode: false,
            provenance: 'LIVE',
            totalItems: 1,
            processedItems: 1,
            succeededItems: 1
        });

        const itemId = new mongoose.Types.ObjectId();

        const snapshot = await PropertyVerificationSnapshot.create({
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
            snapshotId: snapshot._id,
            inventoryId: inventory._id,
            linkId: link._id,
            authorityCode,
            status: 'SUCCEEDED',
            reviewerDecision: 'APPROVED',
            reviewedBy: options.reviewedBy || new mongoose.Types.ObjectId(),
            reviewedAt: new Date(),
            proposedChanges,
            isSynthetic: false,
            provenance: 'LIVE',
            applyState: 'UNAPPLIED'
        });

        return { inventory, link, run, snapshot, item };
    }

    async function applyItemRequest(itemId, token = null) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || tokenA}`
        };

        const res = await fetch(`${baseUrl}/api/authority/apply/${itemId}`, {
            method: 'POST',
            headers
        });
        const body = await res.json();
        return { status: res.status, body };
    }

    beforeEach(async () => {
        await configureLiveSourceSettings();
    });

    // =========================================================================
    // 1. PERSIST STAGE BEFORE INVENTORY MUTATION & CRASH RECOVERY
    // =========================================================================
    describe('1. Persist Stage Before Inventory Mutation & Interrupted Saga Recovery', () => {
        it('1.1 persists INVENTORY_MUTATING to MongoDB before touching Inventory; crash after mutation reconciles correctly', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            let persistedStageBeforeInventoryWrite = null;

            // Intercept Inventory.findOneAndUpdate to verify that PropertyVerificationRunItem
            // has already persisted applyClaim.stage = 'INVENTORY_MUTATING' before Inventory is touched.
            const origFindOneAndUpdate = Inventory.findOneAndUpdate;
            Inventory.findOneAndUpdate = async function (...args) {
                const persistedItem = await PropertyVerificationRunItem.findById(item._id);
                persistedStageBeforeInventoryWrite = persistedItem?.applyClaim?.stage;

                // Let the Inventory mutation execute
                const updated = await origFindOneAndUpdate.apply(this, args);

                // Simulate a hard process crash right after Inventory write and before INVENTORY_MUTATED stage update
                throw new Error('SIMULATED_CRASH_AFTER_INVENTORY_WRITE_BEFORE_STAGE_UPDATE');
            };

            let res;
            try {
                res = await applyItemRequest(item._id);
            } finally {
                Inventory.findOneAndUpdate = origFindOneAndUpdate;
            }

            // Verify that INVENTORY_MUTATING was already in the database when Inventory write started
            assert.equal(persistedStageBeforeInventoryWrite, 'INVENTORY_MUTATING', 'applyClaim.stage must be persisted in DB before Inventory mutation');

            // Verify that the error triggered compensation and restored Inventory
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber ?? null, null, 'Inventory must be restored on crash');
            assert.equal(freshInv.authorityVerification?.applyClaimId ?? null, null);

            // Verify RunItem is marked FAILED and stage COMPENSATED
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applied, false);
            assert.equal(freshItem.applyState, 'FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATED');
        });

        it('1.2 reconciler detects interrupted INVENTORY_MUTATING with mutated Inventory and restores state', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Simulate an interrupted saga where worker died:
            // 1) Worker set INVENTORY_MUTATING
            // 2) Worker updated Inventory with applyClaimId
            // 3) Process crashed, lease expired
            const claimId = new mongoose.Types.ObjectId();
            const pastExpiry = new Date(Date.now() - 5000);

            await Inventory.updateOne(
                { _id: inventory._id },
                {
                    $set: {
                        'authorityVerification.fileNumber': 'FN-CRASHED-VAL',
                        'authorityVerification.applyClaimId': claimId
                    }
                }
            );

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'APPLYING',
                        'applyClaim.claimId': claimId,
                        'applyClaim.stage': 'INVENTORY_MUTATING',
                        'applyClaim.leaseExpiresAt': pastExpiry,
                        'applyClaim.compensation': {
                            inventoryBefore: { 'authorityVerification.fileNumber': null, 'authorityVerification.applyClaimId': null },
                            auditId: null
                        }
                    }
                }
            );

            // Run reconciler
            const result = await reconcileInterruptedApplySaga(item._id, tenantA);
            assert.equal(result.reconciled, true);
            assert.equal(result.action, 'COMPENSATED');

            // Inventory must have been reverted
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber ?? null, null);
            assert.equal(freshInv.authorityVerification?.applyClaimId ?? null, null);

            // RunItem must be COMPENSATED
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applyState, 'FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATED');

            // Retry apply now succeeds cleanly
            const retryRes = await applyItemRequest(item._id);
            assert.equal(retryRes.status, 200);
            assert.equal(retryRes.body.success, true);

            const retriedInv = await Inventory.findById(inventory._id);
            assert.equal(retriedInv.authorityVerification?.fileNumber, 'FN-1234');
        });

        it('1.3 reconciler detects INVENTORY_MUTATING where Inventory was NOT modified and cleanly releases claim', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Worker set INVENTORY_MUTATING, but crashed BEFORE writing to Inventory
            const claimId = new mongoose.Types.ObjectId();
            const pastExpiry = new Date(Date.now() - 5000);

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'APPLYING',
                        'applyClaim.claimId': claimId,
                        'applyClaim.stage': 'INVENTORY_MUTATING',
                        'applyClaim.leaseExpiresAt': pastExpiry,
                        'applyClaim.compensation': {
                            inventoryBefore: { 'authorityVerification.fileNumber': null },
                            auditId: null
                        }
                    }
                }
            );

            // Reconciler runs
            const result = await reconcileInterruptedApplySaga(item._id, tenantA);
            assert.equal(result.reconciled, true);
            assert.equal(result.action, 'RELEASED');

            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applyState, 'FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATED');
            assert.match(freshItem.applyError, /Lease expired before mutation/);
        });
    });

    // =========================================================================
    // 2. COMPENSATION INTEGRITY & FAIL-CLOSED COMPENSATION
    // =========================================================================
    describe('2. Fail-Closed Compensation & Unresolved State Protection', () => {
        it('2.1 Inventory rollback failure marks RunItem COMPENSATION_FAILED and blocks subsequent retries', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Intercept Inventory.updateOne during compensation to simulate database failure
            const origUpdateOne = Inventory.updateOne;
            let failureInjected = false;
            Inventory.updateOne = async function (...args) {
                // If this is the compensation revert update (which sets authorityVerification.applyClaimId: null)
                const update = args[1] || {};
                if (update.$set && update.$set['authorityVerification.applyClaimId'] === null && !failureInjected) {
                    failureInjected = true;
                    throw new Error('SIMULATED_INVENTORY_REVERT_DB_ERROR');
                }
                return origUpdateOne.apply(this, args);
            };

            // Also inject failure on RunItem finalization to trigger compensation
            const origItemUpdateOne = PropertyVerificationRunItem.updateOne;
            PropertyVerificationRunItem.updateOne = async function (...args) {
                const update = args[1] || {};
                if (update.$set && update.$set.applyState === 'APPLIED') {
                    throw new Error('TRIGGER_COMPENSATION_FAILURE');
                }
                return origItemUpdateOne.apply(this, args);
            };

            try {
                await applyItemRequest(item._id);
            } finally {
                Inventory.updateOne = origUpdateOne;
                PropertyVerificationRunItem.updateOne = origItemUpdateOne;
            }

            // Verify RunItem is marked COMPENSATION_FAILED
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applyState, 'COMPENSATION_FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATION_FAILED');
            assert.match(freshItem.applyError, /Compensation failed: Inventory revert failed/);

            // Subsequent apply attempt must be strictly rejected with HTTP 422 COMPENSATION_UNRESOLVED
            const blockedRes = await applyItemRequest(item._id);
            assert.equal(blockedRes.status, 422);
            assert.equal(blockedRes.body.code, 'COMPENSATION_UNRESOLVED');
            assert.match(blockedRes.body.message, /previous application compensation failed/);
        });

        it('2.2 durable compensation audit record authority_changes_apply_compensated is recorded instead of silent deletion', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Inject failure at RunItem finalization
            const origItemUpdateOne = PropertyVerificationRunItem.updateOne;
            PropertyVerificationRunItem.updateOne = async function (...args) {
                const update = args[1] || {};
                if (update.$set && update.$set.applyState === 'APPLIED') {
                    throw new Error('TRIGGER_COMPENSATION');
                }
                return origItemUpdateOne.apply(this, args);
            };

            try {
                await applyItemRequest(item._id);
            } finally {
                PropertyVerificationRunItem.updateOne = origItemUpdateOne;
            }

            // Verify original audit record exists with status: 'compensated'
            const originalAudit = await AuditLog.findOne({
                eventType: 'authority_changes_applied',
                targetId: inventory._id.toString()
            });
            assert.ok(originalAudit, 'Original audit log must not be silently deleted');
            assert.equal(originalAudit.status, 'compensated');

            // Verify durable compensation audit event exists
            const compAudit = await AuditLog.findOne({
                eventType: 'authority_changes_apply_compensated',
                targetId: inventory._id.toString()
            });
            assert.ok(compAudit, 'Durable compensation audit record must be created');
            assert.equal(compAudit.changes?.before?.originalAuditId?.toString(), originalAudit._id.toString());
        });
    });

    // =========================================================================
    // 3. INVENTORY CLAIM FENCING & CONCURRENCY
    // =========================================================================
    describe('3. Inventory Claim Fencing & Concurrency Race Elimination', () => {
        it('3.1 Worker A pauses before Inventory write, lease expires, Worker B commits; Worker A resumes and is fenced without corrupting Worker B', async () => {
            const { inventory, item } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-WORKER-B', approved: true }
                ]
            });

            // Step 1: Worker A claims the item
            const claimIdA = new mongoose.Types.ObjectId();
            const expiryA = new Date(Date.now() - 1000); // Already expired

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'APPLYING',
                        'applyClaim.claimId': claimIdA,
                        'applyClaim.fenceToken': 1,
                        'applyClaim.leaseExpiresAt': expiryA,
                        'applyClaim.stage': 'CLAIMED'
                    }
                }
            );

            // Step 2: Worker B comes in because Worker A's lease expired.
            // Worker B acquires claim, updates Inventory with claimIdB, and completes.
            const claimIdB = new mongoose.Types.ObjectId();
            const expiryB = new Date(Date.now() + 30000);

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'APPLIED',
                        applied: true,
                        'applyClaim.claimId': claimIdB,
                        'applyClaim.fenceToken': 2,
                        'applyClaim.leaseExpiresAt': null,
                        'applyClaim.stage': 'COMPLETED'
                    }
                }
            );

            await Inventory.updateOne(
                { _id: inventory._id },
                {
                    $set: {
                        'authorityVerification.fileNumber': 'FN-WORKER-B-COMMITTED',
                        'authorityVerification.applyClaimId': claimIdB
                    }
                }
            );

            // Step 3: Worker A resumes and attempts to mutate Inventory expecting previous claimId null
            // Fenced Inventory mutation:
            const staleUpdateOps = {
                'authorityVerification.fileNumber': 'FN-WORKER-A-CORRUPTED',
                'authorityVerification.applyClaimId': claimIdA
            };

            const inventoryFilter = {
                _id: inventory._id,
                tenantId: tenantA,
                $or: [
                    { 'authorityVerification.applyClaimId': null },
                    { 'authorityVerification.applyClaimId': { $exists: false } }
                ]
            };

            const result = await Inventory.findOneAndUpdate(
                inventoryFilter,
                { $set: staleUpdateOps },
                { new: true }
            );

            // Worker A matched 0 documents because Inventory now has Worker B's claimId
            assert.equal(result, null, 'Stale Worker A must be fenced and match zero documents');

            // Verify Inventory retains Worker B's value completely uncorrupted
            const finalInv = await Inventory.findById(inventory._id);
            assert.equal(finalInv.authorityVerification?.fileNumber, 'FN-WORKER-B-COMMITTED');
            assert.equal(finalInv.authorityVerification?.applyClaimId?.toString(), claimIdB.toString());
        });

        it('3.2 atomic reconciler ownership: two concurrent reconcilers race; exactly one acquires lock', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            const claimId = new mongoose.Types.ObjectId();
            const pastExpiry = new Date(Date.now() - 5000);

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'APPLYING',
                        'applyClaim.claimId': claimId,
                        'applyClaim.stage': 'INVENTORY_MUTATED',
                        'applyClaim.leaseExpiresAt': pastExpiry,
                        'applyClaim.compensation': {
                            inventoryBefore: { 'authorityVerification.fileNumber': null },
                            auditId: null
                        }
                    }
                }
            );

            await Inventory.updateOne(
                { _id: inventory._id },
                {
                    $set: {
                        'authorityVerification.fileNumber': 'FN-MUTATED',
                        'authorityVerification.applyClaimId': claimId
                    }
                }
            );

            // Race two reconcilers concurrently
            const [rec1, rec2] = await Promise.all([
                reconcileInterruptedApplySaga(item._id, tenantA),
                reconcileInterruptedApplySaga(item._id, tenantA)
            ]);

            const successes = [rec1, rec2].filter(r => r.reconciled === true);
            const locked = [rec1, rec2].filter(r => r.reconciled === false);

            assert.equal(successes.length, 1, 'Exactly one reconciler must succeed');
            assert.equal(locked.length, 1, 'The other reconciler must receive locked/ineligible');

            // Inventory is safely restored
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber ?? null, null);
            assert.equal(freshInv.authorityVerification?.applyClaimId ?? null, null);
        });

        it('3.3 renewApplyClaimLease fails closed when lease has expired or fenceToken mismatches', async () => {
            const { item } = await createLiveApplyFixture();

            const claimId = new mongoose.Types.ObjectId();
            const activeExpiry = new Date(Date.now() + 20000);

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'APPLYING',
                        'applyClaim.claimId': claimId,
                        'applyClaim.fenceToken': 5,
                        'applyClaim.leaseExpiresAt': activeExpiry
                    }
                }
            );

            // FenceToken mismatch returns null
            const mismatchedFence = await renewApplyClaimLease(item._id, tenantA, claimId, 4, 30000);
            assert.equal(mismatchedFence, null, 'Mismatched fenceToken must return null');

            // Matching fenceToken succeeds
            const validRenewal = await renewApplyClaimLease(item._id, tenantA, claimId, 5, 45000);
            assert.ok(validRenewal, 'Matching fenceToken must succeed');
            assert.ok(validRenewal.applyClaim.leaseExpiresAt.getTime() > activeExpiry.getTime());

            // Expired lease returns null (cannot revive expired claim)
            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                { $set: { 'applyClaim.leaseExpiresAt': new Date(Date.now() - 5000) } }
            );
            const expiredRenewal = await renewApplyClaimLease(item._id, tenantA, claimId, 5, 30000);
            assert.equal(expiredRenewal, null, 'Expired claim cannot be renewed');
        });
    });
});
