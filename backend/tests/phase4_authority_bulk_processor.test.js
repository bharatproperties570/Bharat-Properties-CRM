import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import AuthoritySourceSettings from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import { AuthorityBulkProcessor } from '../services/authority/AuthorityBulkProcessor.js';

describe('Phase 4 — Controlled Bulk Verification Engine & Batch Processing', () => {
    let mongoServer;
    let tenantA, tenantB;
    let userA, userB;
    let invA1, invA2, invA3, invB1;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        const testRole = await Role.create({
            name: 'Authority Bulk Auditor Role',
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
            fullName: 'Test Auditor A',
            email: 'auditor.a@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: testRole._id,
            isActive: true
        });

        userB = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            fullName: 'Test Auditor B',
            email: 'auditor.b@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: testRole._id,
            isActive: true
        });

        // Initialize default settings (sources default to disabled/NOT_OBTAINED)
        await AuthoritySourceSettings.ensureDefaults(tenantA);
        await AuthoritySourceSettings.ensureDefaults(tenantB);

        // Ensure indexes are built in MongoMemoryServer
        await PropertyVerificationRunItem.init();
        await PropertyAuthorityLink.init();
        await PropertyVerificationRun.init();
        await PropertyVerificationSnapshot.init();

        // Seed Inventory records for Tenant A
        invA1 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '101',
            sector: '14',
            projectName: 'Urban Heights',
            status: 'Available',
            createdBy: userA._id
        });

        invA2 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '102',
            sector: '14',
            projectName: 'Urban Heights',
            status: 'Available',
            createdBy: userA._id
        });

        invA3 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '103',
            sector: '14',
            projectName: 'Urban Heights',
            status: 'Booked',
            createdBy: userA._id
        });

        // Seed Inventory for Tenant B
        invB1 = await Inventory.create({
            tenantId: tenantB,
            unitNo: '201',
            sector: '15',
            projectName: 'Green Valley',
            status: 'Available',
            createdBy: userB._id
        });
    });

    after(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    describe('1. Live Boundary Fail-Closed Gate', () => {
        it('1.1 live bulk run is immediately marked POLICY_REJECTED when source authorization is NOT_OBTAINED', async () => {
            const run = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invA2._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: false // Live request
            });

            assert.equal(run.status, 'POLICY_REJECTED');
            assert.ok(run.completedAt instanceof Date);
            assert.ok(run.policyRejectionReasons.length > 0);
            assert.match(run.errorSummary, /prohibited/i);

            // Audit record emitted
            const audit = await AuditLog.findOne({
                eventType: 'authority_run_policy_rejected',
                targetId: run._id.toString()
            });
            assert.ok(audit, 'AuditLog entry should be present for policy rejection');
        });

        it('1.2 unknown authority code throws an explicit validation error', async () => {
            await assert.rejects(async () => {
                await AuthorityBulkProcessor.createBulkRun({
                    tenantId: tenantA,
                    authorityCode: 'UNKNOWN_MUNICIPALITY',
                    requestedBy: userA._id,
                    inventoryIds: [invA1._id]
                });
            }, /INVALID_AUTHORITY/);
        });
    });

    describe('2. Demonstration Bulk Run Creation & Item Seeding', () => {
        let createdRun;

        it('2.1 creates run in CREATED state with items when in fixture mode', async () => {
            createdRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invA2._id, invA3._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            assert.equal(createdRun.status, 'CREATED');
            assert.equal(createdRun.totalItems, 3);
            assert.equal(createdRun.processedItems, 0);

            // Verify items seeded in database
            const items = await PropertyVerificationRunItem.find({ runId: createdRun._id, tenantId: tenantA });
            assert.equal(items.length, 3);
            items.forEach(it => {
                assert.equal(it.status, 'PENDING');
                assert.equal(it.authorityCode, 'HSVP');
            });
        });

        it('2.2 duplicate run item creation is prevented by unique compound index', async () => {
            const items = await PropertyVerificationRunItem.find({ runId: createdRun._id });
            const duplicateItem = new PropertyVerificationRunItem({
                tenantId: tenantA,
                runId: createdRun._id,
                inventoryId: invA1._id,
                linkId: items[0].linkId,
                authorityCode: 'HSVP',
                status: 'PENDING'
            });

            await assert.rejects(async () => {
                await duplicateItem.save();
            }, /E11000/);
        });
    });

    describe('3. Bounded Batch Processing Execution', () => {
        let runToProcess;

        before(async () => {
            runToProcess = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invA2._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });
        });

        it('3.1 processes items in bounded batches and updates run counters', async () => {
            const progressReports = [];
            const outcome = await AuthorityBulkProcessor.processRun(runToProcess._id, {
                tenantId: tenantA,
                batchSize: 1, // Test bounded batch size 1 to force multiple chunk iterations
                isFixtureMode: true,
                onProgress: (p) => progressReports.push(p)
            });

            assert.equal(outcome.status, 'COMPLETED');
            assert.equal(outcome.processedItems, 2);
            assert.equal(outcome.succeededItems, 2);
            assert.equal(outcome.failedItems, 0);
            assert.ok(progressReports.length >= 2, 'Should have reported progress across batches');

            // Verify DB state of run
            const refreshedRun = await PropertyVerificationRun.findById(runToProcess._id);
            assert.equal(refreshedRun.status, 'COMPLETED');
            assert.equal(refreshedRun.processedItems, 2);
            assert.equal(refreshedRun.succeededItems, 2);
            assert.ok(refreshedRun.completedAt instanceof Date);

            // Verify items transitioned to SUCCEEDED with snapshots
            const items = await PropertyVerificationRunItem.find({ runId: runToProcess._id });
            assert.equal(items.length, 2);
            for (const item of items) {
                assert.equal(item.status, 'SUCCEEDED');
                assert.ok(item.snapshotId, 'Item must reference an immutable snapshot');
                assert.ok(item.proposedChanges.length > 0, 'Item should contain proposed changes');

                // Check Snapshot
                const snap = await PropertyVerificationSnapshot.findById(item.snapshotId);
                assert.ok(snap, 'Snapshot must exist');
                assert.equal(snap.isSealed, true);
                assert.ok(snap.contentHash, 'Snapshot must have cryptographic content hash');
                assert.equal(snap.ownerDataRedacted, true);
            }
        });

        it('3.2 proposed changes strictly adhere to ALLOWED_UPDATE_FIELDS and never include BLOCKED_UPDATE_FIELDS', async () => {
            const items = await PropertyVerificationRunItem.find({ runId: runToProcess._id });
            for (const item of items) {
                for (const pc of item.proposedChanges) {
                    assert.ok(ALLOWED_UPDATE_FIELDS.has(pc.field), `Field ${pc.field} must be in ALLOWED_UPDATE_FIELDS`);
                    assert.ok(!BLOCKED_UPDATE_FIELDS.has(pc.field), `Field ${pc.field} must NOT be in BLOCKED_UPDATE_FIELDS`);
                    assert.notEqual(pc.field, 'status', 'CRM Inventory.status must never be in proposedChanges');
                }
            }
        });

        it('3.3 processing an already completed run is idempotent', async () => {
            const outcome = await AuthorityBulkProcessor.processRun(runToProcess._id, {
                tenantId: tenantA,
                batchSize: 50,
                isFixtureMode: true
            });

            assert.equal(outcome.alreadyCompleted, true);
            assert.equal(outcome.status, 'COMPLETED');
        });
    });

    describe('4. Error Isolation & Partial Failures', () => {
        it('4.1 an item with deleted inventory fails gracefully without aborting the run', async () => {
            // Create dummy inventory and run
            const invTemp = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'TEMP-999',
                sector: '14',
                projectName: 'Temp',
                status: 'Available',
                createdBy: userA._id
            });

            const mixedRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'GMADA',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invTemp._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            // Delete invTemp from database before processing to simulate a missing document error
            await Inventory.findByIdAndDelete(invTemp._id);

            const outcome = await AuthorityBulkProcessor.processRun(mixedRun._id, {
                tenantId: tenantA,
                batchSize: 50,
                isFixtureMode: true
            });

            assert.equal(outcome.status, 'PARTIAL');
            assert.equal(outcome.processedItems, 2);
            assert.equal(outcome.succeededItems, 1);
            assert.equal(outcome.failedItems, 1);

            const failedItem = await PropertyVerificationRunItem.findOne({
                runId: mixedRun._id,
                inventoryId: invTemp._id
            });
            assert.equal(failedItem.status, 'FAILED');
            assert.match(failedItem.errorMessage, /not found/i);
        });
    });

    describe('5. Safe Cancellation & Resume', () => {
        let cancelRunTarget;

        before(async () => {
            cancelRunTarget = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invA2._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });
        });

        it('5.1 cancelRun transitions run to CANCELLED with audit metadata', async () => {
            const cancelled = await AuthorityBulkProcessor.cancelRun(
                cancelRunTarget._id,
                tenantA,
                userA._id,
                'Operator requested abort'
            );

            assert.equal(cancelled.status, 'CANCELLED');
            assert.equal(cancelled.cancellationReason, 'Operator requested abort');
            assert.equal(cancelled.cancelledBy.toString(), userA._id.toString());
            assert.ok(cancelled.cancelledAt instanceof Date);

            // Calling processRun on cancelled run should abort immediately
            const outcome = await AuthorityBulkProcessor.processRun(cancelRunTarget._id, {
                tenantId: tenantA,
                isFixtureMode: true
            });
            assert.equal(outcome.status, 'CANCELLED');
        });

        it('5.2 resumeRun resets run to PROCESSING and completes remaining items', async () => {
            const resumedOutcome = await AuthorityBulkProcessor.resumeRun(
                cancelRunTarget._id,
                tenantA,
                { isFixtureMode: true, batchSize: 50 }
            );

            assert.equal(resumedOutcome.status, 'COMPLETED');
            assert.equal(resumedOutcome.processedItems, 2);
            assert.equal(resumedOutcome.succeededItems, 2);

            const refreshed = await PropertyVerificationRun.findById(cancelRunTarget._id);
            assert.equal(refreshed.status, 'COMPLETED');
        });
    });

    describe('6. Multi-Tenant Isolation', () => {
        it('6.1 Tenant B cannot process or access Tenant A verification run', async () => {
            const runA = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            // Tenant B attempts to process Tenant A run
            await assert.rejects(async () => {
                await AuthorityBulkProcessor.processRun(runA._id, {
                    tenantId: tenantB, // Wrong tenant
                    isFixtureMode: true
                });
            }, /RUN_NOT_FOUND/);

            // Tenant B attempts to cancel Tenant A run
            await assert.rejects(async () => {
                await AuthorityBulkProcessor.cancelRun(runA._id, tenantB, userB._id);
            }, /RUN_NOT_FOUND/);
        });

        it('6.2 Tenant B cannot view Tenant A run progress', async () => {
            const runA = await PropertyVerificationRun.findOne({ tenantId: tenantA });
            await assert.rejects(async () => {
                await AuthorityBulkProcessor.getRunProgress(runA._id, tenantB);
            }, /RUN_NOT_FOUND/);
        });
    });

    describe('7. Audit Trail Integrity', () => {
        it('7.1 verifies complete audit logging across run lifecycle', async () => {
            const auditEvents = await AuditLog.find({
                eventType: { $in: ['authority_run_created', 'authority_run_completed', 'authority_run_cancelled'] }
            });
            assert.ok(auditEvents.length >= 3, 'Audit logs must capture run lifecycle transitions');
        });
    });
});
