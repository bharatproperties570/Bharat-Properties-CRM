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
import {
    compensateApplySaga,
    reconcileInterruptedApplySaga,
    renewApplyClaimLease
} from '../controllers/authorityVerification.controller.js';

describe('Phase 4.2 — Final Apply Reliability & Bulk Concurrency Remediation', () => {
    let mongoServer;
    let testServer;
    let baseUrl;
    let tenantA, tenantB;
    let userA, userB;
    let tokenA, tokenB;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        const auditorRole = await Role.create({
            name: 'Authority Operational Auditor Role 4.2',
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
            fullName: 'Auditor A 4.2',
            email: 'auditor.a.phase42@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        userB = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            fullName: 'Auditor B 4.2',
            email: 'auditor.b.phase42@crm.test',
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
            reviewerDecision: 'APPROVED',
            reviewedBy: userA._id,
            reviewedAt: new Date(),
            proposedChanges,
            isSynthetic: false,
            provenance: 'LIVE',
            applyState: 'UNAPPLIED'
        });

        return { inventory, link, run, snap, item };
    }

    async function applyItemRequest(itemId, token = tokenA) {
        const resp = await fetch(`${baseUrl}/api/authority/apply/${itemId}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const body = await resp.json();
        return { status: resp.status, body };
    }

    // =========================================================================
    // 1. APPLY ATOMICITY ON STANDALONE MONGODB (DURABLE RECOVERABLE SAGA)
    // =========================================================================
    describe('1. Apply Atomicity on Standalone MongoDB (Durable Saga & Compensation)', () => {
        beforeEach(async () => {
            await configureLiveSourceSettings(['fileNumber', 'sectorNumber']);
        });

        it('1.1 Inventory update success followed by AuditLog failure triggers compensation, restoring original Inventory', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Intercept AuditLog.logEntityUpdate to inject failure
            const origLog = AuditLog.logEntityUpdate;
            AuditLog.logEntityUpdate = async () => {
                throw new Error('SIMULATED_AUDIT_LOG_DATABASE_FAILURE');
            };

            let res;
            try {
                res = await applyItemRequest(item._id);
            } finally {
                AuditLog.logEntityUpdate = origLog; // restore
            }

            assert.equal(res.status, 500, 'Expected 500 due to AuditLog error');

            // Verify Inventory was restored to pre-apply state (compensation executed)
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber, null, 'Inventory fileNumber must be reverted to null');
            assert.equal(freshInv.authorityVerification?.applyClaimId, null, 'Inventory applyClaimId must be cleared');

            // Verify AuditLog has zero entries for this inventory
            const auditLogs = await AuditLog.find({
                eventType: 'authority_changes_applied',
                targetId: inventory._id.toString()
            });
            assert.equal(auditLogs.length, 0, 'No audit log entry should exist');

            // Verify RunItem is marked FAILED and stage is COMPENSATED
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applied, false);
            assert.equal(freshItem.applyState, 'FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATED');
            assert.equal(freshItem.applyClaim?.leaseExpiresAt, null);
            assert.match(freshItem.applyError, /SIMULATED_AUDIT_LOG_DATABASE_FAILURE/);
        });

        it('1.2 AuditLog success followed by RunItem finalization failure triggers compensation, reverting Inventory and removing AuditLog', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Intercept PropertyVerificationRunItem.updateOne to inject failure on the final update
            const origUpdateOne = PropertyVerificationRunItem.updateOne;
            let callCount = 0;
            PropertyVerificationRunItem.updateOne = async function (...args) {
                const query = args[0] || {};
                const update = args[1] || {};
                // Let stage updates pass, but fail on finalization (where applyState: 'APPLIED')
                if (update.$set && update.$set.applyState === 'APPLIED') {
                    throw new Error('SIMULATED_RUNITEM_FINALIZATION_FAILURE');
                }
                return origUpdateOne.apply(this, args);
            };

            let res;
            try {
                res = await applyItemRequest(item._id);
            } finally {
                PropertyVerificationRunItem.updateOne = origUpdateOne;
            }

            assert.equal(res.status, 500, 'Expected 500 due to RunItem finalization failure');

            // Verify Inventory was reverted
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber, null, 'Inventory must be restored to null');
            assert.equal(freshInv.authorityVerification?.applyClaimId, null);

            // Verify durable compensation audit record was created linked to original claim
            const compAuditLogs = await AuditLog.find({
                eventType: 'authority_changes_apply_compensated',
                targetId: inventory._id.toString()
            });
            assert.equal(compAuditLogs.length, 1, 'Durable compensation audit event must be recorded instead of silent deletion');

            // Verify RunItem state
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applied, false);
            assert.equal(freshItem.applyState, 'FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATED');
        });

        it('1.3 Process interruption between mutation stages is safely reconciled upon retry', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Simulate an interrupted process:
            // Worker acquired claim, mutated inventory, stage set to INVENTORY_MUTATED, but process crashed before AuditLog
            const claimId = new mongoose.Types.ObjectId();
            const pastExpiry = new Date(Date.now() - 5000); // lease expired 5 seconds ago

            await Inventory.updateOne(
                { _id: inventory._id },
                {
                    $set: {
                        'authorityVerification.fileNumber': 'FN-ORPHANED',
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
                        'applyClaim.leaseExpiresAt': pastExpiry,
                        'applyClaim.stage': 'INVENTORY_MUTATED',
                        'applyClaim.compensation.inventoryBefore': {
                            'authorityVerification.fileNumber': null
                        }
                    }
                }
            );

            // Directly run reconciliation on the interrupted saga
            const reconRes = await reconcileInterruptedApplySaga(item._id, tenantA);
            assert.equal(reconRes.reconciled, true);
            assert.equal(reconRes.action, 'COMPENSATED');

            // Verify orphaned inventory mutation was rolled back by reconciler
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber, null);
            assert.equal(freshInv.authorityVerification?.applyClaimId, null);

            // Verify RunItem is marked FAILED/COMPENSATED and ready for retry
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applyState, 'FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATED');
            assert.equal(freshItem.applyClaim?.leaseExpiresAt, null);
        });

        it('1.4 Retry after each failure mode cleanly succeeds and mutates inventory atomically', async () => {
            // Take the item from failure 1.1 / 1.3
            const { inventory, item } = await createLiveApplyFixture({
                proposedChanges: [{ field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-RETRY-SUCCESS', approved: true }],
                normalizedData: { fileNumber: 'FN-RETRY-SUCCESS', sectorNumber: '14' }
            });

            // Simulate prior failure
            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'FAILED',
                        applyError: 'Prior network failure'
                    }
                }
            );

            // Retry apply request
            const res = await applyItemRequest(item._id);
            assert.equal(res.status, 200, 'Retry must succeed with 200');
            assert.equal(res.body.success, true);
            assert.equal(res.body.data.appliedFields.length, 1);

            // Verify Inventory now correctly reflects the applied change
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification.fileNumber, 'FN-RETRY-SUCCESS');
            assert.equal(freshInv.authorityVerification.authorityCode, 'HSVP');
            assert.ok(freshInv.authorityVerification.applyClaimId, 'applyClaimId must be set');

            // Verify AuditLog entry was created
            const auditLogs = await AuditLog.find({
                eventType: 'authority_changes_applied',
                targetId: inventory._id.toString()
            });
            assert.equal(auditLogs.length, 1);
            assert.equal(auditLogs[0].description.includes('HSVP'), true);

            // Verify RunItem is APPLIED
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applied, true);
            assert.equal(freshItem.applyState, 'APPLIED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPLETED');
            assert.equal(freshItem.applyClaim?.leaseExpiresAt, null);
        });

        it('1.5 Invariant audit: zero inconsistent Inventory, AuditLog, and RunItem combinations', async () => {
            // Verify across all items created in tests:
            const allItems = await PropertyVerificationRunItem.find({ tenantId: tenantA });
            for (const itm of allItems) {
                const inv = await Inventory.findById(itm.inventoryId);
                const audits = await AuditLog.find({
                    eventType: 'authority_changes_applied',
                    targetId: itm.inventoryId.toString()
                });

                if (itm.applyState === 'APPLIED') {
                    assert.equal(itm.applied, true);
                    assert.ok(inv.authorityVerification?.lastVerifiedAt, 'Applied inventory must have lastVerifiedAt');
                    assert.equal(audits.length >= 1, true, 'Applied item must have corresponding audit log');
                } else {
                    assert.equal(itm.applied, false);
                    const activeAudits = audits.filter(a => a.status !== 'compensated');
                    assert.equal(activeAudits.length, 0, 'Unapplied/failed item must not have an active applied audit log');
                }
            }
        });

        it('1.6 Strict fail-closed when AUTHORITY_REQUIRE_TRANSACTIONS=true and transactions unavailable', async () => {
            const { item } = await createLiveApplyFixture();

            process.env.AUTHORITY_REQUIRE_TRANSACTIONS = 'true';
            try {
                const res = await applyItemRequest(item._id);
                assert.equal(res.status, 503, 'Must return 503 when transactions required but unavailable');
                assert.equal(res.body.code, 'TRANSACTIONS_UNAVAILABLE');
            } finally {
                delete process.env.AUTHORITY_REQUIRE_TRANSACTIONS;
            }
        });
    });

    // =========================================================================
    // 2. APPLY CLAIM FENCING AND LEASE CORRECTNESS
    // =========================================================================
    describe('2. Apply Claim Fencing and Lease Correctness', () => {
        beforeEach(async () => {
            await configureLiveSourceSettings(['fileNumber', 'sectorNumber']);
        });

        it('2.1 Expired claim prevents stale worker from finalizing; conditional check triggers compensation', async () => {
            const { inventory, item } = await createLiveApplyFixture();

            // Intercept PropertyVerificationRunItem.findOneAndUpdate to advance lease into past after claim
            const origFindOneAndUpdate = PropertyVerificationRunItem.findOneAndUpdate;
            PropertyVerificationRunItem.findOneAndUpdate = async function (...args) {
                const res = await origFindOneAndUpdate.apply(this, args);
                if (res && res._id.toString() === item._id.toString() && res.applyState === 'APPLYING') {
                    // Simulate claim lease expiration before finalization
                    res.applyClaim.leaseExpiresAt = new Date(Date.now() - 1000);
                    await PropertyVerificationRunItem.updateOne(
                        { _id: res._id },
                        { $set: { 'applyClaim.leaseExpiresAt': new Date(Date.now() - 1000) } }
                    );
                }
                return res;
            };

            let res;
            try {
                res = await applyItemRequest(item._id);
            } finally {
                PropertyVerificationRunItem.findOneAndUpdate = origFindOneAndUpdate;
            }

            assert.equal(res.status, 409, 'Expected 409 CLAIM_PREEMPTED when lease expires');
            assert.equal(res.body.code, 'CLAIM_PREEMPTED');

            // Inventory must NOT retain the proposed mutation
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification?.fileNumber ?? null, null);
            assert.equal(freshInv.authorityVerification?.applyClaimId ?? null, null);

            // RunItem must remain unapplied
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applied, false);
            assert.equal(freshItem.applyState, 'FAILED');
            assert.equal(freshItem.applyClaim?.stage, 'COMPENSATED');
        });

        it('2.2 Preempted claim: delayed Worker 1 cannot corrupt Worker 2 which acquired subsequent claim', async () => {
            const { inventory, item } = await createLiveApplyFixture({
                proposedChanges: [{ field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-WORKER2-WINS', approved: true }],
                normalizedData: { fileNumber: 'FN-WORKER2-WINS', sectorNumber: '14' }
            });

            // Simulate Worker 1 acquired claim with claimId 1
            const claimId1 = new mongoose.Types.ObjectId();
            const claimId2 = new mongoose.Types.ObjectId();

            // Worker 2 acquires claim with fenceToken 2 and applies successfully
            await Inventory.updateOne(
                { _id: inventory._id },
                {
                    $set: {
                        'authorityVerification.fileNumber': 'FN-WORKER2-WINS',
                        'authorityVerification.applyClaimId': claimId2
                    }
                }
            );

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applied: true,
                        applyState: 'APPLIED',
                        'applyClaim.claimId': claimId2,
                        'applyClaim.fenceToken': 2,
                        'applyClaim.stage': 'COMPLETED',
                        'applyClaim.leaseExpiresAt': null
                    }
                }
            );

            // Worker 1 now attempts compensation or finalization using claimId 1
            await compensateApplySaga({
                itemId: item._id,
                tenantId: tenantA,
                inventoryId: inventory._id,
                claimId: claimId1,
                stage: 'INVENTORY_MUTATED',
                compensation: {
                    inventoryBefore: { 'authorityVerification.fileNumber': null }
                },
                errorMsg: 'Worker 1 timed out'
            });

            // Verify that Worker 1's compensation DID NOT overwrite Worker 2's mutation!
            const freshInv = await Inventory.findById(inventory._id);
            assert.equal(freshInv.authorityVerification.fileNumber, 'FN-WORKER2-WINS', 'Worker 2 data must remain intact');
            assert.equal(freshInv.authorityVerification.applyClaimId.toString(), claimId2.toString());

            // RunItem remains APPLIED by Worker 2
            const freshItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(freshItem.applied, true);
            assert.equal(freshItem.applyState, 'APPLIED');
        });

        it('2.3 renewApplyClaimLease extends active lease and fails closed for mismatched or expired claims', async () => {
            const { item } = await createLiveApplyFixture();

            const claimId = new mongoose.Types.ObjectId();
            const futureExpiry = new Date(Date.now() + 15000);

            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                {
                    $set: {
                        applyState: 'APPLYING',
                        'applyClaim.claimId': claimId,
                        'applyClaim.leaseExpiresAt': futureExpiry
                    }
                }
            );

            // Valid renewal by owner
            const renewed = await renewApplyClaimLease(item._id, tenantA, claimId, 45000);
            assert.ok(renewed, 'Expected lease renewal to succeed');
            assert.ok(renewed.applyClaim.leaseExpiresAt.getTime() > futureExpiry.getTime());

            // Mismatched claimId rejected
            const mismatchedClaimId = new mongoose.Types.ObjectId();
            const rejectedRenewal = await renewApplyClaimLease(item._id, tenantA, mismatchedClaimId, 30000);
            assert.equal(rejectedRenewal, null, 'Mismatched claimId must return null');

            // Expired lease cannot be revived
            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                { $set: { 'applyClaim.leaseExpiresAt': new Date(Date.now() - 5000) } }
            );
            const expiredRenewal = await renewApplyClaimLease(item._id, tenantA, claimId, 30000);
            assert.equal(expiredRenewal, null, 'Expired lease must fail closed on renewal');
        });
    });
});
