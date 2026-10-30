import { describe, it, before, after } from 'node:test';
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
import authorityRoutes from '../routes/authorityVerification.routes.js';

import { AuthorityBulkProcessor } from '../services/authority/AuthorityBulkProcessor.js';

describe('Phase 4 — Controlled Bulk Verification Engine & Batch Processing', () => {
    let mongoServer;
    let testServer;
    let baseUrl;
    let tenantA, tenantB;
    let userA, userB;
    let tokenA, tokenB;
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

        tokenA = jwt.sign({ id: userA._id }, config.jwtSecret, { expiresIn: '2h' });
        tokenB = jwt.sign({ id: userB._id }, config.jwtSecret, { expiresIn: '2h' });

        // Initialize Express test server for real HTTP API validation
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
            city: 'Panchkula',
            status: 'Available',
            createdBy: userA._id
        });

        invA2 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '102',
            sector: '14',
            projectName: 'Urban Heights',
            city: 'Panchkula',
            status: 'Available',
            createdBy: userA._id
        });

        invA3 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '103',
            sector: '14',
            projectName: 'Urban Heights',
            city: 'Panchkula',
            status: 'Booked',
            createdBy: userA._id
        });

        // Seed Inventory for Tenant B
        invB1 = await Inventory.create({
            tenantId: tenantB,
            unitNo: '201',
            sector: '15',
            projectName: 'Green Valley',
            city: 'Chandigarh',
            status: 'Available',
            createdBy: userB._id
        });
    });

    after(async () => {
        if (testServer) {
            await new Promise((resolve) => testServer.close(resolve));
        }
        await mongoose.disconnect();
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    describe('1. Live Boundary Fail-Closed Gate', () => {
        it('1.1 live bulk run is immediately marked POLICY_REJECTED when source authorization is NOT_OBTAINED', async () => {
            const run = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invA2._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: false // Live request!
            });

            assert.equal(run.status, 'POLICY_REJECTED');
            assert.equal(run.isFixtureMode, false);
            assert.equal(run.provenance, 'LIVE');
            assert.ok(run.policyRejectionReasons.length > 0);
            assert.match(run.policyRejectionReasons[0], /NOT_OBTAINED|not effectively active/i);

            // Verify AuditLog record was emitted
            const log = await AuditLog.findOne({
                eventType: 'authority_run_policy_rejected',
                targetId: run._id.toString()
            });
            assert.ok(log, 'Audit log must record policy rejection');
        });

        it('1.2 unknown authority code throws an explicit validation error', async () => {
            await assert.rejects(async () => {
                await AuthorityBulkProcessor.createBulkRun({
                    tenantId: tenantA,
                    authorityCode: 'UNKNOWN_AUTH',
                    requestedBy: userA._id,
                    inventoryIds: [invA1._id]
                });
            }, /INVALID_AUTHORITY/);
        });
    });

    describe('2. Demonstration Bulk Run Creation & Item Seeding', () => {
        let createdRun;

        it('2.1 creates run in CREATED state with items and synthetic provenance when in fixture mode', async () => {
            createdRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invA2._id, invA3._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            assert.equal(createdRun.status, 'CREATED');
            assert.equal(createdRun.isFixtureMode, true);
            assert.equal(createdRun.provenance, 'SYNTHETIC_FIXTURE');
            assert.equal(createdRun.totalItems, 3);

            // Verify items were seeded
            const items = await PropertyVerificationRunItem.find({ runId: createdRun._id });
            assert.equal(items.length, 3);
            for (const item of items) {
                assert.equal(item.status, 'PENDING');
                assert.equal(item.authorityCode, 'HSVP');
                assert.equal(item.isSynthetic, true);
                assert.equal(item.provenance, 'SYNTHETIC_FIXTURE');
                assert.ok(item.linkId, 'Item must be linked to a PropertyAuthorityLink');
            }
        });

        it('2.2 duplicate run item creation is prevented by unique compound index', async () => {
            await assert.rejects(async () => {
                await PropertyVerificationRunItem.create({
                    tenantId: tenantA,
                    runId: createdRun._id,
                    inventoryId: invA1._id, // Duplicate in this run
                    linkId: new mongoose.Types.ObjectId(),
                    authorityCode: 'HSVP',
                    status: 'PENDING'
                });
            }, /E11000.*duplicate key/);
        });
    });

    describe('3. Bounded Batch Processing Execution & Concurrency Protection', () => {
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

        it('3.1 processes items in bounded batches and updates run counters with synthetic provenance', async () => {
            const progressReports = [];
            const outcome = await AuthorityBulkProcessor.processRun(runToProcess._id, {
                tenantId: tenantA,
                batchSize: 1, // Force multiple chunks
                isFixtureMode: true,
                onProgress: (p) => progressReports.push(p)
            });

            assert.equal(outcome.status, 'COMPLETED');
            assert.equal(outcome.processedItems, 2);
            assert.equal(outcome.succeededItems, 2);
            assert.equal(outcome.failedItems, 0);

            // Verify DB state of run
            const refreshedRun = await PropertyVerificationRun.findById(runToProcess._id);
            assert.equal(refreshedRun.status, 'COMPLETED');
            assert.equal(refreshedRun.isFixtureMode, true);
            assert.equal(refreshedRun.provenance, 'SYNTHETIC_FIXTURE');
            assert.equal(refreshedRun.processedItems, 2);
            assert.equal(refreshedRun.succeededItems, 2);
            assert.ok(refreshedRun.completedAt instanceof Date);

            // Verify items transitioned to SUCCEEDED with snapshots
            const items = await PropertyVerificationRunItem.find({ runId: runToProcess._id });
            assert.equal(items.length, 2);
            for (const item of items) {
                assert.equal(item.status, 'SUCCEEDED');
                assert.equal(item.isSynthetic, true);
                assert.equal(item.provenance, 'SYNTHETIC_FIXTURE');
                assert.ok(item.snapshotId, 'Item must reference an immutable snapshot');

                // Check Snapshot has explicit synthetic provenance
                const snap = await PropertyVerificationSnapshot.findById(item.snapshotId);
                assert.ok(snap, 'Snapshot must exist');
                assert.equal(snap.isSealed, true);
                assert.equal(snap.isSynthetic, true);
                assert.equal(snap.provenance, 'SYNTHETIC_FIXTURE');
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

        it('3.4 concurrent workers processing the same run claim items atomically without duplicate snapshots', async () => {
            // Seed 4 separate inventory items
            const invC1 = await Inventory.create({ tenantId: tenantA, unitNo: 'C1', sector: '14', city: 'Panchkula', createdBy: userA._id });
            const invC2 = await Inventory.create({ tenantId: tenantA, unitNo: 'C2', sector: '14', city: 'Panchkula', createdBy: userA._id });
            const invC3 = await Inventory.create({ tenantId: tenantA, unitNo: 'C3', sector: '14', city: 'Panchkula', createdBy: userA._id });
            const invC4 = await Inventory.create({ tenantId: tenantA, unitNo: 'C4', sector: '14', city: 'Panchkula', createdBy: userA._id });

            const concurrentRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invC1._id, invC2._id, invC3._id, invC4._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            // Launch two workers concurrently with batchSize: 1
            const [worker1, worker2] = await Promise.all([
                AuthorityBulkProcessor.processRun(concurrentRun._id, { tenantId: tenantA, batchSize: 1, isFixtureMode: true }),
                AuthorityBulkProcessor.processRun(concurrentRun._id, { tenantId: tenantA, batchSize: 1, isFixtureMode: true })
            ]);

            assert.equal(worker1.status, 'COMPLETED');
            assert.equal(worker2.status, 'COMPLETED');

            // Verify total snapshots created is exactly 4 (zero duplicates)
            const snapshots = await PropertyVerificationSnapshot.find({ tenantId: tenantA, authorityCode: 'HSVP', runItemId: { $in: await PropertyVerificationRunItem.find({ runId: concurrentRun._id }).distinct('_id') } });
            assert.equal(snapshots.length, 4, 'Must create exactly 1 snapshot per item without duplicate concurrent writes');

            const refreshed = await PropertyVerificationRun.findById(concurrentRun._id);
            assert.equal(refreshed.processedItems, 4);
            assert.equal(refreshed.succeededItems, 4);
        });
    });

    describe('4. Error Isolation, Incomplete Identity & Zero Fallback Values', () => {
        it('4.1 missing identity fields remain INCOMPLETE and are rejected without fallback 101 or 14', async () => {
            // Create inventory missing unitNo and sector
            const invIncomplete = await Inventory.create({
                tenantId: tenantA,
                projectName: 'Nameless Enclave',
                // unitNo is missing!
                // sector is missing!
                createdBy: userA._id
            });

            const incompleteRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'GMADA',
                requestedBy: userA._id,
                inventoryIds: [invIncomplete._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            // Verify the link created is marked INCOMPLETE (never ELIGIBLE with fallback values)
            const link = await PropertyAuthorityLink.findOne({ inventoryId: invIncomplete._id, authorityCode: 'GMADA' });
            assert.ok(link, 'Link must be created');
            assert.equal(link.matchEligibility, 'INCOMPLETE', 'Missing identity must be marked INCOMPLETE');
            assert.equal(link.propertyId, null, 'Must NOT invent fallback propertyId 101');
            assert.equal(link.sectorNumber, null, 'Must NOT invent fallback sectorNumber 14');

            // Process run
            const outcome = await AuthorityBulkProcessor.processRun(incompleteRun._id, {
                tenantId: tenantA,
                isFixtureMode: true
            });

            assert.equal(outcome.status, 'FAILED');
            assert.equal(outcome.failedItems, 1);

            const runItem = await PropertyVerificationRunItem.findOne({ runId: incompleteRun._id });
            assert.equal(runItem.status, 'FAILED');
            assert.match(runItem.errorMessage, /incomplete identity/i);
        });

        it('4.2 an item with deleted inventory fails gracefully without aborting the run', async () => {
            const invTemp = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'TEMP-999',
                sector: '14',
                city: 'Panchkula',
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

            // Delete invTemp before processing
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

    describe('5. Safe Pause, Cancellation, Resume & Recovery', () => {
        let pauseRunTarget;

        before(async () => {
            pauseRunTarget = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, invA2._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });
        });

        it('5.1 pauseRun transitions run to PAUSED with audit metadata and halts processing', async () => {
            // Real pauseRun method
            const paused = await AuthorityBulkProcessor.pauseRun(
                pauseRunTarget._id,
                tenantA,
                userA._id,
                'Maintenance pause requested'
            );

            assert.equal(paused.status, 'PAUSED');
            assert.equal(paused.pauseReason, 'Maintenance pause requested');
            assert.equal(paused.pausedBy.toString(), userA._id.toString());
            assert.ok(paused.pausedAt instanceof Date);

            // Attempting to process paused run halts immediately
            const outcome = await AuthorityBulkProcessor.processRun(pauseRunTarget._id, {
                tenantId: tenantA,
                isFixtureMode: true
            });
            assert.equal(outcome.status, 'PAUSED');

            // Audit log check
            const pauseLog = await AuditLog.findOne({
                eventType: 'authority_run_paused',
                targetId: pauseRunTarget._id.toString()
            });
            assert.ok(pauseLog, 'Must emit authority_run_paused audit log');
        });

        it('5.2 resumeRun transitions from PAUSED to PROCESSING and completes remaining items', async () => {
            const resumedOutcome = await AuthorityBulkProcessor.resumeRun(
                pauseRunTarget._id,
                tenantA,
                { isFixtureMode: true, batchSize: 50, userId: userA._id }
            );

            assert.equal(resumedOutcome.status, 'COMPLETED');
            assert.equal(resumedOutcome.processedItems, 2);
            assert.equal(resumedOutcome.succeededItems, 2);

            const refreshed = await PropertyVerificationRun.findById(pauseRunTarget._id);
            assert.equal(refreshed.status, 'COMPLETED');
            assert.equal(refreshed.pausedAt, null);

            const resumeLog = await AuditLog.findOne({
                eventType: 'authority_run_resumed',
                targetId: pauseRunTarget._id.toString()
            });
            assert.ok(resumeLog, 'Must emit authority_run_resumed audit log');
        });

        it('5.3 cancelRun transitions to CANCELLED and prevents further processing', async () => {
            const cancelTarget = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                inventoryIds: [invA1._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            const cancelled = await AuthorityBulkProcessor.cancelRun(cancelTarget._id, tenantA, userA._id, 'User abort');
            assert.equal(cancelled.status, 'CANCELLED');

            const outcome = await AuthorityBulkProcessor.processRun(cancelTarget._id, {
                tenantId: tenantA,
                isFixtureMode: true
            });
            assert.equal(outcome.status, 'CANCELLED');
        });

        it('5.4 HTTP API: POST /runs/:runId/pause and POST /runs/:runId/resume perform lifecycle transitions', async () => {
            const httpRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            // Pause via HTTP API
            const pauseRes = await fetch(`${baseUrl}/api/authority/runs/${httpRun._id}/pause`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenA}`
                },
                body: JSON.stringify({ reason: 'API pause check' })
            });
            assert.equal(pauseRes.status, 200);
            const pauseBody = await pauseRes.json();
            assert.equal(pauseBody.success, true);
            assert.equal(pauseBody.data.status, 'PAUSED');

            // Resume via HTTP API
            const resumeRes = await fetch(`${baseUrl}/api/authority/runs/${httpRun._id}/resume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenA}`
                },
                body: JSON.stringify({ isFixtureMode: true })
            });
            assert.equal(resumeRes.status, 200);
            const resumeBody = await resumeRes.json();
            assert.equal(resumeBody.success, true);
            assert.equal(resumeBody.data.status, 'COMPLETED');
        });
    });

    describe('6. Synthetic Fixture Protection & Server-side HTTP 422 Rejection on Apply', () => {
        let fixtureItem;

        before(async () => {
            // Create a synthetic fixture run and item
            const fixRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true
            });

            await AuthorityBulkProcessor.processRun(fixRun._id, {
                tenantId: tenantA,
                isFixtureMode: true
            });

            fixtureItem = await PropertyVerificationRunItem.findOne({ runId: fixRun._id });

            // Approve all proposed changes for this item
            fixtureItem.reviewerDecision = 'APPROVED';
            fixtureItem.proposedChanges.forEach(pc => { pc.approved = true; });
            await fixtureItem.save();
        });

        it('6.1 server-side applyApprovedChanges rejects synthetic fixture snapshot with HTTP 422', async () => {
            // Record original inventory state before apply attempt
            const originalInv = await Inventory.findById(invA1._id).lean();

            const applyRes = await fetch(`${baseUrl}/api/authority/apply/${fixtureItem._id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenA}`
                }
            });

            assert.equal(applyRes.status, 422, 'Must return 422 Unprocessable Entity for synthetic fixture items');
            const body = await applyRes.json();
            assert.equal(body.success, false);
            assert.equal(body.code, 'SYNTHETIC_FIXTURE_BLOCKED');
            assert.match(body.message, /synthetic fixture/i);

            // CRITICAL INVARIANCE: Verify Inventory was NEVER modified
            const postInv = await Inventory.findById(invA1._id).lean();
            assert.deepEqual(postInv.status, originalInv.status);
            assert.equal(postInv.authorityVerification?.lastVerifiedAt, undefined);
            assert.equal(postInv.authorityVerification?.verificationSnapshotId, undefined);
        });
    });

    describe('7. Multi-Tenant Isolation', () => {
        it('7.1 Tenant B cannot process or access Tenant A verification run', async () => {
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
                    tenantId: tenantB,
                    isFixtureMode: true
                });
            }, /RUN_NOT_FOUND/);

            // Tenant B attempts to cancel Tenant A run
            await assert.rejects(async () => {
                await AuthorityBulkProcessor.cancelRun(runA._id, tenantB, userB._id);
            }, /RUN_NOT_FOUND/);
        });

        it('7.2 Tenant B cannot view Tenant A run progress', async () => {
            const runA = await PropertyVerificationRun.findOne({ tenantId: tenantA });
            await assert.rejects(async () => {
                await AuthorityBulkProcessor.getRunProgress(runA._id, tenantB);
            }, /RUN_NOT_FOUND/);
        });
    });

    describe('8. Audit Trail Integrity', () => {
        it('8.1 verifies complete audit logging across run lifecycle', async () => {
            const auditEvents = await AuditLog.find({
                eventType: { $in: ['authority_run_created', 'authority_run_completed', 'authority_run_cancelled', 'authority_run_paused', 'authority_run_resumed'] }
            });
            assert.ok(auditEvents.length >= 4, 'Audit logs must capture run lifecycle transitions');
        });
    });
});
