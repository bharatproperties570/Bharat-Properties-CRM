import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
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
import PropertyVerificationSnapshot, {
    computeSnapshotContentHash
} from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import Lookup from '../models/Lookup.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import authorityRoutes from '../routes/authorityVerification.routes.js';

import {
    AuthorityBulkProcessor,
    safeInsertMany
} from '../services/authority/AuthorityBulkProcessor.js';

describe('Phase 4.1 — Authority Verification Reliability & Authorization Remediation', () => {
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

        const auditorRole = await Role.create({
            name: 'Authority Operational Auditor Role',
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
            fullName: 'Auditor A',
            email: 'auditor.a.phase41@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        userB = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            fullName: 'Auditor B',
            email: 'auditor.b.phase41@crm.test',
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

        invA1 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '101',
            sector: '14',
            projectName: 'Urban Greens',
            city: 'Panchkula',
            status: 'Available',
            createdBy: userA._id
        });

        invA2 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '102',
            sector: '14',
            projectName: 'Urban Greens',
            city: 'Panchkula',
            status: 'Available',
            createdBy: userA._id
        });

        invA3 = await Inventory.create({
            tenantId: tenantA,
            unitNo: '103',
            sector: '14',
            projectName: 'Urban Greens',
            city: 'Panchkula',
            status: 'Available',
            createdBy: userA._id
        });

        invB1 = await Inventory.create({
            tenantId: tenantB,
            unitNo: '201',
            sector: '22',
            projectName: 'Chandigarh Heights',
            city: 'Chandigarh',
            status: 'Available',
            createdBy: userB._id
        });
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

    // Helper to reset HSVP source back to disabled default
    async function resetSourceSettings() {
        await AuthoritySourceSettings.updateOne(
            { tenantId: tenantA, authorityCode: 'HSVP' },
            {
                $set: {
                    permissionStatus: 'NOT_OBTAINED',
                    isEnabled: false,
                    isPaused: false,
                    approvedAccessMethod: 'NONE',
                    approvalReference: null,
                    reviewStatus: 'NOT_REVIEWED',
                    permittedFields: []
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

        return { link, run, snap, item, inventory };
    }

    describe('1. Source-Specific Permitted Field Enforcement', () => {
        beforeEach(async () => {
            await configureLiveSourceSettings(['fileNumber', 'sectorNumber']);
        });

        afterEach(async () => {
            await resetSourceSettings();
        });

        it('1.1 allowed fields in permittedFields apply successfully and mutate inventory (200)', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-HSVP-9988', approved: true }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);
            assert.equal(data.data.appliedFields.length, 1);
            assert.equal(data.data.appliedFields[0].field, 'authorityVerification.fileNumber');
            assert.equal(data.data.appliedFields[0].after, 'FN-HSVP-9988');

            // Verify DB item state
            const updatedItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(updatedItem.applyState, 'APPLIED');
            assert.ok(updatedItem.appliedAt);
            assert.equal(updatedItem.appliedBy.toString(), userA._id.toString());
            assert.equal(updatedItem.applyClaim.claimedBy.toString(), userA._id.toString());

            // Verify CRM inventory mutation
            const updatedInv = await Inventory.findById(inventory._id);
            assert.equal(updatedInv.authorityVerification?.fileNumber, 'FN-HSVP-9988');
        });

        it('1.2 unauthorized field rejected with HTTP 422 UNAUTHORIZED_SOURCE_FIELDS and leaves inventory unmutated', async () => {
            // propertyCategory is NOT in permittedFields ['fileNumber', 'sectorNumber']
            const { item, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.propertyCategory', currentValue: null, proposedValue: 'Residential Plot', approved: true }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.equal(data.code, 'UNAUTHORIZED_SOURCE_FIELDS');
            assert.ok(data.rejectedFields.some(f => f.canonicalField === 'propertyCategory'));

            // Verify DB item remained UNAPPLIED
            const unchangedItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(unchangedItem.applyState, 'UNAPPLIED');

            // Verify Inventory untouched
            const unchangedInv = await Inventory.findById(inventory._id);
            assert.equal(unchangedInv.authorityVerification?.propertyCategory, undefined);
        });

        it('1.3 mixed allowed and unauthorized fields reject the entire apply operation with 422 and mutate nothing', async () => {
            // fileNumber is allowed, but duesStatus is unauthorized
            const { item, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-MIXED-1', approved: true },
                    { field: 'authorityVerification.duesStatus', currentValue: null, proposedValue: 'NO_DUES', approved: true }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.code, 'UNAUTHORIZED_SOURCE_FIELDS');
            assert.ok(data.rejectedFields.some(f => f.canonicalField === 'duesStatus'));

            // Verify atomicity: neither fileNumber nor duesStatus applied to Inventory
            const unchangedInv = await Inventory.findById(inventory._id);
            assert.equal(unchangedInv.authorityVerification?.fileNumber, undefined);
            assert.equal(unchangedInv.authorityVerification?.duesStatus, undefined);

            const unchangedItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(unchangedItem.applyState, 'UNAPPLIED');
        });

        it('1.4 empty permittedFields rejects apply with HTTP 422 UNAUTHORIZED_SOURCE_FIELDS', async () => {
            await configureLiveSourceSettings([]); // Empty permitted fields

            const { item, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-EMPTY-PERM', approved: true }
                ]
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.code, 'UNAUTHORIZED_SOURCE_FIELDS');
            assert.ok(data.rejectedFields.some(f => f.reason.includes('empty permittedFields list')));

            // Inventory unchanged
            const unchangedInv = await Inventory.findById(inventory._id);
            assert.notEqual(unchangedInv.authorityVerification?.fileNumber, 'FN-EMPTY-PERM');
        });
    });

    describe('2. Atomic and Idempotent Inventory Apply', () => {
        beforeEach(async () => {
            await configureLiveSourceSettings(['fileNumber', 'sectorNumber']);
        });

        afterEach(async () => {
            await resetSourceSettings();
        });

        it('2.1 concurrent duplicate-apply requests: exactly one succeeds (200) and other receives 409', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-CONCURRENT-1', approved: true }
                ]
            });

            // Fire two concurrent apply requests
            const [res1, res2] = await Promise.all([
                fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
                }),
                fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
                })
            ]);

            const statuses = [res1.status, res2.status].sort();
            assert.deepEqual(statuses, [200, 409], 'Exactly one request must succeed (200) and the concurrent one must receive 409');

            // Audit log should only contain ONE authority_changes_applied entry for this target
            const auditLogs = await AuditLog.find({
                eventType: 'authority_changes_applied',
                targetId: inventory._id.toString()
            });
            assert.equal(auditLogs.length, 1, 'Exactly one AuditLog entry must be recorded');

            // Inventory updated once
            const finalInv = await Inventory.findById(inventory._id);
            assert.equal(finalInv.authorityVerification?.fileNumber, 'FN-CONCURRENT-1');

            // Item in APPLIED state
            const finalItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(finalItem.applyState, 'APPLIED');
        });

        it('2.2 recoverable application state allows retry after simulated failure', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-RECOVER-1', approved: true }
                ]
            });

            // Simulate an item that failed during a previous apply attempt
            item.applyState = 'FAILED';
            item.applyError = 'Simulated prior connection timeout';
            item.applyClaim = {
                claimedBy: new mongoose.Types.ObjectId(),
                claimId: new mongoose.Types.ObjectId(),
                claimedAt: new Date(Date.now() - 60000),
                leaseExpiresAt: new Date(Date.now() - 30000)
            };
            await item.save();

            // Retry apply
            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);

            // Item is recovered to APPLIED, applyError cleared
            const recoveredItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(recoveredItem.applyState, 'APPLIED');
            assert.equal(recoveredItem.applyError, null);

            // Inventory successfully mutated
            const recoveredInv = await Inventory.findById(inventory._id);
            assert.equal(recoveredInv.authorityVerification?.fileNumber, 'FN-RECOVER-1');
        });

        it('2.3 strict multi-tenant isolation: Tenant B cannot apply Tenant A item (404)', async () => {
            const { item, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-CROSS-TENANT', approved: true }
                ]
            });

            // Tenant B calls apply on Tenant A's item
            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` }
            });

            assert.equal(res.status, 404);
            const data = await res.json();
            assert.equal(data.success, false);

            // Item remains untouched
            const untouchedItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(untouchedItem.applyState, 'UNAPPLIED');

            // Tenant A inventory untouched
            const untouchedInv = await Inventory.findById(inventory._id);
            assert.equal(untouchedInv.authorityVerification?.fileNumber, undefined);
        });
    });

    describe('3. Bulk Insert Error Handling', () => {
        it('3.1 safeInsertMany cleanly traps MongoDB code 11000 duplicate keys without crashing', async () => {
            const existingLinkId = new mongoose.Types.ObjectId();
            const existingInvId = new mongoose.Types.ObjectId();

            // Insert initial link
            await PropertyAuthorityLink.create({
                _id: existingLinkId,
                tenantId: tenantA,
                inventoryId: existingInvId,
                authorityCode: 'CHD',
                status: 'LINKED',
                createdBy: userA._id
            });

            // Attempt bulk insert containing a duplicate of the above link
            const docsToInsert = [
                {
                    tenantId: tenantA,
                    inventoryId: existingInvId,
                    authorityCode: 'CHD',
                    status: 'LINKED',
                    createdBy: userA._id
                },
                {
                    tenantId: tenantA,
                    inventoryId: new mongoose.Types.ObjectId(),
                    authorityCode: 'CHD',
                    status: 'LINKED',
                    createdBy: userA._id
                }
            ];

            const result = await safeInsertMany(PropertyAuthorityLink, docsToInsert, { ordered: false });
            assert.equal(result.duplicateCount, 1, 'Should report 1 duplicate trapped');
            assert.equal(result.insertedCount, 1, 'Should report 1 new document inserted');
        });

        it('3.2 safeInsertMany propagates unexpected validation or database errors', async () => {
            const failingModel = {
                insertMany: async () => {
                    const dbErr = new Error('Database disk full or network socket closed');
                    dbErr.code = 12586;
                    throw dbErr;
                }
            };

            await assert.rejects(
                async () => {
                    await safeInsertMany(failingModel, [{ sample: 1 }], { ordered: false });
                },
                (err) => {
                    assert.ok(err.message.includes('Database disk full'), 'Must propagate unexpected non-11000 database errors');
                    return true;
                }
            );
        });

        it('3.3 createBulkRun generates explicit failed run items for missing requested inventory IDs', async () => {
            const nonExistentInvId = new mongoose.Types.ObjectId();

            const bulkRun = await AuthorityBulkProcessor.createBulkRun({
                tenantId: tenantA,
                authorityCode: 'HSVP',
                requestedBy: userA._id,
                inventoryIds: [invA1._id, nonExistentInvId],
                runMode: 'BULK_MANUAL',
                isFixtureMode: true,
                onlyEligible: false
            });

            assert.equal(bulkRun.totalItems, 2, 'Run totalItems must equal all 2 requested IDs');

            // Verify that the missing inventory ID has an explicit FAILED run item
            const missingItem = await PropertyVerificationRunItem.findOne({
                runId: bulkRun._id,
                inventoryId: nonExistentInvId
            });

            assert.ok(missingItem, 'Explicit run item must be created for missing inventory');
            assert.equal(missingItem.status, 'FAILED');
            assert.ok(missingItem.errorMessage.includes('not found in tenant inventory'));
        });
    });

    describe('4. Worker Lease and Run Finalization Correctness', () => {
        it('4.1 active worker lease prevents premature run finalization (run remains PROCESSING)', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 2
            });

            // Item 1: completed
            await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invA1._id,
                authorityCode: 'CHD',
                status: 'SUCCEEDED',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Item 2: in flight with an active worker lease
            const futureLease = new Date(Date.now() + 60000);
            await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invA2._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_active_delay',
                claimedAt: new Date(),
                leaseExpiresAt: futureLease,
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Execute processRun
            const outcome = await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                isFixtureMode: true,
                maxWaitAttempts: 1,
                waitIntervalMs: 10
            });

            // Parent run must NOT be prematurely marked COMPLETED
            assert.equal(outcome.status, 'PROCESSING');
            const checkRun = await PropertyVerificationRun.findById(run._id);
            assert.equal(checkRun.status, 'PROCESSING', 'Run must remain PROCESSING while active leases exist');
        });

        it('4.2 delayed worker completing after wait window completes item without lost updates, and final counters are derived from DB items', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 2
            });

            await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invA1._id,
                authorityCode: 'CHD',
                status: 'SUCCEEDED',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const inFlightItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invA2._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_delayed',
                claimedAt: new Date(),
                leaseExpiresAt: new Date(Date.now() + 200), // short lease
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Simulate the delayed worker completing its item
            inFlightItem.status = 'SUCCEEDED';
            inFlightItem.leaseExpiresAt = null;
            await inFlightItem.save();

            // Run processRun now that all items are terminal
            const finalOutcome = await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                isFixtureMode: true
            });

            assert.equal(finalOutcome.status, 'COMPLETED');
            assert.equal(finalOutcome.succeededItems, 2);
            assert.equal(finalOutcome.failedItems, 0);

            const completedRun = await PropertyVerificationRun.findById(run._id);
            assert.equal(completedRun.status, 'COMPLETED');
            assert.equal(completedRun.succeededItems, 2);
        });

        it('4.3 renewItemLease extends lease for matching workerId and rejects mismatched workerId', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invA1._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'legitimate_worker_42',
                claimedAt: new Date(),
                leaseExpiresAt: new Date(Date.now() + 5000), // 5 seconds
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Matching worker renews
            const renewed = await AuthorityBulkProcessor.renewItemLease(item._id, tenantA, 'legitimate_worker_42');
            assert.ok(renewed, 'Lease renewal should succeed for matching worker');
            assert.ok(renewed.leaseExpiresAt.getTime() > Date.now() + 15000, 'Lease expiration should be extended by ~30s');

            // Mismatched worker attempts renewal
            const intruderRenewal = await AuthorityBulkProcessor.renewItemLease(item._id, tenantA, 'intruder_worker_99');
            assert.equal(intruderRenewal, null, 'Lease renewal must fail for mismatched workerId');

            // Expired lease cannot be renewed by stale worker (fails closed)
            await PropertyVerificationRunItem.updateOne(
                { _id: item._id },
                { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
            );
            const expiredRenewal = await AuthorityBulkProcessor.renewItemLease(item._id, tenantA, 'legitimate_worker_42');
            assert.equal(expiredRenewal, null, 'Lease renewal must fail closed when lease has expired');
        });

        it('4.4 stale worker with expired lease cannot finalize item or overwrite new owner state', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: invA1._id,
                authorityCode: 'CHD',
                propertyId: invA1.unitNo || '101',
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            // Step 1: Worker 1 claims item, but its lease expires in the past
            const pastLease = new Date(Date.now() - 5000);
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invA1._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_stale_1',
                claimedAt: new Date(Date.now() - 35000),
                leaseExpiresAt: pastLease,
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Step 2: Second worker reclaims the expired item
            const claimTime = new Date();
            const futureLease = new Date(claimTime.getTime() + 30000);
            const reclaimed = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    status: 'PROCESSING',
                    leaseExpiresAt: { $lt: claimTime }
                },
                {
                    $set: {
                        claimedBy: 'worker_new_owner_2',
                        claimedAt: claimTime,
                        leaseExpiresAt: futureLease
                    }
                },
                { new: true }
            );

            assert.ok(reclaimed, 'Worker 2 must successfully reclaim the expired item');
            assert.equal(reclaimed.claimedBy, 'worker_new_owner_2');

            // Step 3: Stale Worker 1 attempts to finalize the item
            const staleFinalization = await AuthorityBulkProcessor._finalizeItemWithOwnershipCheck(
                item._id,
                tenantA,
                'worker_stale_1',
                {
                    status: 'SUCCEEDED',
                    matchStatus: 'EXACT_MATCH',
                    processedAt: new Date()
                }
            );

            assert.equal(staleFinalization, null, 'Stale worker finalization must return null (fenced out)');

            // Step 4: Verify database document was not modified by stale worker
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.claimedBy, 'worker_new_owner_2', 'Item ownership must remain with Worker 2');
            assert.equal(itemInDb.status, 'PROCESSING', 'Item status must remain PROCESSING');
            assert.ok(itemInDb.leaseExpiresAt, 'Active lease must not be cleared');
            assert.equal(itemInDb.leaseExpiresAt.getTime(), futureLease.getTime(), 'Worker 2 leaseExpiresAt must be intact');
        });

        it('4.5 stale worker cannot clear active lease of new owner or cause duplicate snapshots', async () => {
            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: invA2._id,
                authorityCode: 'CHD',
                propertyId: invA2.unitNo || '102',
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            // Item claimed by Worker 1 with expired lease
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invA2._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_delayed_alpha',
                claimedAt: new Date(Date.now() - 40000),
                leaseExpiresAt: new Date(Date.now() - 10000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Worker 2 reclaims and processes item cleanly
            const worker2ClaimTime = new Date();
            const worker2Lease = new Date(worker2ClaimTime.getTime() + 30000);
            await PropertyVerificationRunItem.updateOne(
                { _id: item._id, tenantId: tenantA },
                {
                    $set: {
                        claimedBy: 'worker_active_beta',
                        claimedAt: worker2ClaimTime,
                        leaseExpiresAt: worker2Lease
                    }
                }
            );

            const updatedItemForWorker2 = await PropertyVerificationRunItem.findById(item._id);
            const worker2Result = await AuthorityBulkProcessor.processItem(updatedItemForWorker2, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_active_beta'
            });

            assert.equal(worker2Result.success, true, 'Worker 2 must successfully complete item');
            assert.ok(worker2Result.snapshotId, 'Worker 2 must produce a snapshot');

            // Stale Worker 1 now attempts processItem with stale workerId
            const staleItemDoc = await PropertyVerificationRunItem.findById(item._id);
            const staleResult = await AuthorityBulkProcessor.processItem(staleItemDoc, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_delayed_alpha'
            });

            assert.ok(staleResult.alreadyProcessed || staleResult.ownershipLost, 'Stale worker must not re-process');

            // Verify exactly ONE snapshot exists in database
            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapshots.length, 1, 'Exactly one snapshot must exist for the run item');
        });

        it('4.6 in-flight lease expiry and late completion fencing prevents duplicate snapshots, counter drift and overwrites', async () => {
            const slowInv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'SLOW-LEASE-101',
                projectName: 'Lease Expiry Fencing Test',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const slowLink = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: slowInv._id,
                authorityCode: 'CHD',
                propertyId: slowInv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const slowRun = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const slowItem = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: slowRun._id,
                inventoryId: slowInv._id,
                linkId: slowLink._id,
                authorityCode: 'CHD',
                status: 'PENDING',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Worker A claims item with deterministic short lease (40ms) and stalls in-flight
            let workerBExecuted = false;
            await AuthorityBulkProcessor.processRun(slowRun._id, {
                tenantId: tenantA,
                batchSize: 1,
                workerId: 'worker_slow_A',
                workerLeaseMs: 40,
                isFixtureMode: true,
                beforeItemProcessing: async (item, workerId) => {
                    // Simulate processing delay exceeding the 40ms worker lease
                    await new Promise(r => setTimeout(r, 60));

                    // While Worker A is delayed in-flight, Worker B reclaims and finalizes the item
                    const workerBOutcome = await AuthorityBulkProcessor.processRun(slowRun._id, {
                        tenantId: tenantA,
                        batchSize: 1,
                        workerId: 'worker_reclaim_B',
                        workerLeaseMs: 30000,
                        isFixtureMode: true
                    });

                    assert.equal(workerBOutcome.status, 'COMPLETED');
                    assert.equal(workerBOutcome.succeededItems, 1);
                    workerBExecuted = true;
                }
            });

            assert.ok(workerBExecuted, 'Worker B must have executed during Worker A in-flight delay');

            // Verify item state in DB: owned by Worker B, SUCCEEDED
            const itemInDb = await PropertyVerificationRunItem.findById(slowItem._id);
            assert.equal(itemInDb.status, 'SUCCEEDED');
            assert.equal(itemInDb.claimedBy, 'worker_reclaim_B', 'Item ownership must remain with Worker B');
            assert.ok(itemInDb.snapshotId, 'Item must have valid snapshotId from Worker B');

            // Verify exactly one snapshot exists in database
            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: slowItem._id
            });
            assert.equal(snapshots.length, 1, 'Exactly one snapshot must exist (no duplicate snapshot created by late Worker A)');

            // Verify run counters: exactly 1 processed, 1 succeeded, 0 failed (no double-counting from late Worker A)
            const finalRun = await PropertyVerificationRun.findById(slowRun._id);
            assert.equal(finalRun.status, 'COMPLETED');
            assert.equal(finalRun.processedItems, 1);
            assert.equal(finalRun.succeededItems, 1);
            assert.equal(finalRun.failedItems, 0);

            // Verify renewItemLease fails closed for stale Worker A
            const staleRenewal = await AuthorityBulkProcessor.renewItemLease(slowItem._id, tenantA, 'worker_slow_A');
            assert.equal(staleRenewal, null, 'renewItemLease must return null for stale worker after ownership transferred');

            // Retain multi-batch size coverage (1, 50, 500)
            for (const batchSize of [1, 50, 500]) {
                const count = batchSize === 500 ? 50 : (batchSize === 50 ? 10 : 2);
                const invList = [];
                const linkList = [];

                for (let i = 0; i < count; i++) {
                    const inv = await Inventory.create({
                        tenantId: tenantA,
                        unitNo: `BATCH-${batchSize}-U${i}`,
                        projectName: 'Batch Lease Test Project',
                        sector: 'Sector 17',
                        city: 'Chandigarh',
                        type: 'commercial'
                    });
                    invList.push(inv);

                    const link = await PropertyAuthorityLink.create({
                        tenantId: tenantA,
                        inventoryId: inv._id,
                        authorityCode: 'CHD',
                        propertyId: inv.unitNo,
                        sectorNumber: 'Sector 17',
                        matchEligibility: 'ELIGIBLE',
                        createdBy: userA._id
                    });
                    linkList.push(link);
                }

                const run = await PropertyVerificationRun.create({
                    tenantId: tenantA,
                    authorityCode: 'CHD',
                    requestedBy: userA._id,
                    runMode: 'BULK_MANUAL',
                    status: 'CREATED',
                    isFixtureMode: true,
                    totalItems: count
                });

                for (let i = 0; i < count; i++) {
                    await PropertyVerificationRunItem.create({
                        tenantId: tenantA,
                        runId: run._id,
                        inventoryId: invList[i]._id,
                        linkId: linkList[i]._id,
                        authorityCode: 'CHD',
                        status: 'PENDING',
                        isSynthetic: true,
                        provenance: 'SYNTHETIC_FIXTURE'
                    });
                }

                const outcome = await AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    batchSize: batchSize,
                    isFixtureMode: true,
                    workerId: `worker_batch_test_${batchSize}`
                });

                assert.equal(outcome.status, 'COMPLETED');
                assert.equal(outcome.processedItems, count);
                assert.equal(outcome.succeededItems, count);
                assert.equal(outcome.failedItems, 0);

                const finalBatchRun = await PropertyVerificationRun.findById(run._id);
                assert.equal(finalBatchRun.status, 'COMPLETED');
                assert.equal(finalBatchRun.processedItems, count);
                assert.equal(finalBatchRun.succeededItems, count);
                assert.equal(finalBatchRun.failedItems, 0);
            }
        });

        it('4.7 genuine overlapping concurrent workers via Promise.all avoid duplicate or lost counters and guarantee single snapshot per item', async () => {
            const invList = [];
            const linkList = [];
            for (let i = 1; i <= 6; i++) {
                const inv = await Inventory.create({
                    tenantId: tenantA,
                    unitNo: `CONC-CTR-${i}`,
                    projectName: 'Concurrent Worker Test',
                    sector: 'Sector 17',
                    city: 'Chandigarh',
                    type: 'commercial'
                });
                invList.push(inv);

                const link = await PropertyAuthorityLink.create({
                    tenantId: tenantA,
                    inventoryId: inv._id,
                    authorityCode: 'CHD',
                    propertyId: inv.unitNo,
                    sectorNumber: 'Sector 17',
                    matchEligibility: 'ELIGIBLE',
                    createdBy: userA._id
                });
                linkList.push(link);
            }

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 6,
                processedItems: 0,
                succeededItems: 0,
                failedItems: 0
            });

            // Item 1: PENDING
            await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invList[0]._id,
                linkId: linkList[0]._id,
                authorityCode: 'CHD',
                status: 'PENDING',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Item 2: expired lease from a dead worker
            await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: invList[1]._id,
                linkId: linkList[1]._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'dead_worker_999',
                claimedAt: new Date(Date.now() - 60000),
                leaseExpiresAt: new Date(Date.now() - 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Items 3 to 6: PENDING
            for (let i = 2; i < 6; i++) {
                await PropertyVerificationRunItem.create({
                    tenantId: tenantA,
                    runId: run._id,
                    inventoryId: invList[i]._id,
                    linkId: linkList[i]._id,
                    authorityCode: 'CHD',
                    status: 'PENDING',
                    isSynthetic: true,
                    provenance: 'SYNTHETIC_FIXTURE'
                });
            }

            // Launch genuine overlapping concurrent workers via Promise.all
            const [workerAResult, workerBResult] = await Promise.all([
                AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    batchSize: 2,
                    workerId: 'worker_concurrent_alpha',
                    maxWaitAttempts: 10,
                    waitIntervalMs: 50
                }),
                AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    batchSize: 2,
                    workerId: 'worker_concurrent_beta',
                    maxWaitAttempts: 10,
                    waitIntervalMs: 50
                })
            ]);

            // Verify both workers completed cleanly without unhandled rejections
            assert.ok(['COMPLETED', 'PROCESSING'].includes(workerAResult.status));
            assert.ok(['COMPLETED', 'PROCESSING'].includes(workerBResult.status));

            // Verify database run document reached final COMPLETED status
            const completedRun = await PropertyVerificationRun.findById(run._id);
            assert.equal(completedRun.status, 'COMPLETED');
            assert.equal(completedRun.processedItems, 6, 'Total processed items must match total items exactly');
            assert.equal(completedRun.succeededItems, 6, 'All 6 items must be SUCCEEDED');
            assert.equal(completedRun.failedItems, 0);

            // Re-verify aggregate counts directly from items
            const counts = await PropertyVerificationRunItem.aggregate([
                { $match: { runId: run._id, tenantId: tenantA } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);
            const map = Object.fromEntries(counts.map(c => [c._id, c.count]));
            assert.equal(map.SUCCEEDED, 6);
            assert.equal(map.PROCESSING || 0, 0);
            assert.equal(map.PENDING || 0, 0);

            // Verify all items have terminal SUCCEEDED status and snapshotId
            const runItems = await PropertyVerificationRunItem.find({ runId: run._id, tenantId: tenantA });
            assert.equal(runItems.length, 6);
            for (const item of runItems) {
                assert.equal(item.status, 'SUCCEEDED');
                assert.ok(item.snapshotId, 'Item must have valid snapshotId');
            }

            // Verify multi-worker participation: both workers claimed items
            const workerIds = new Set(runItems.map(it => it.claimedBy));
            assert.ok(
                workerIds.has('worker_concurrent_alpha') && workerIds.has('worker_concurrent_beta'),
                `Both concurrent workers must have participated (actual: ${Array.from(workerIds).join(', ')})`
            );

            // Verify expired lease item was reclaimed and not left to dead worker
            const deadWorkerReclaimedItem = runItems.find(it => String(it.inventoryId) === String(invList[1]._id));
            assert.notEqual(deadWorkerReclaimedItem.claimedBy, 'dead_worker_999');
            assert.ok(['worker_concurrent_alpha', 'worker_concurrent_beta'].includes(deadWorkerReclaimedItem.claimedBy));

            // Verify snapshot count: exactly one snapshot per run item
            const itemIds = runItems.map(it => it._id);
            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: { $in: itemIds }
            });
            assert.equal(snapshots.length, 6, 'Exactly one snapshot per run item must exist (no duplicates)');

            // Verify uniqueness per item
            for (const item of runItems) {
                const itemSnapshots = snapshots.filter(s => String(s.runItemId) === String(item._id));
                assert.equal(itemSnapshots.length, 1, `Item ${item._id} must have exactly one snapshot`);
            }
        });

        it('4.8 in-flight race: Worker A pauses after candidate generation before snapshot persistence, Worker A lease expires, Worker B reclaims and succeeds, Worker A cannot persist or cause adoption', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'RACE-SNAP-FENCE-1',
                projectName: 'Snapshot Race Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PENDING',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            let workerBExecuted = false;

            // Worker A claims item with short 40ms lease
            await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                batchSize: 1,
                workerId: 'worker_inflight_A',
                workerLeaseMs: 40,
                isFixtureMode: true,
                beforeSnapshotPersistence: async (runItem, workerId, candidate) => {
                    assert.equal(workerId, 'worker_inflight_A');
                    assert.ok(candidate, 'Candidate must be generated in memory before persistence hook');

                    // Simulate processing delay exceeding 40ms worker lease
                    await new Promise(r => setTimeout(r, 60));

                    // Worker B atomically reclaims and completes the expired item
                    const workerBOutcome = await AuthorityBulkProcessor.processRun(run._id, {
                        tenantId: tenantA,
                        batchSize: 1,
                        workerId: 'worker_reclaim_B',
                        workerLeaseMs: 30000,
                        isFixtureMode: true
                    });

                    assert.equal(workerBOutcome.status, 'COMPLETED');
                    assert.equal(workerBOutcome.succeededItems, 1);
                    workerBExecuted = true;
                }
            });

            assert.ok(workerBExecuted, 'Worker B must have executed while Worker A was paused before persistence');

            // Verify item state in DB: owned and finalized by Worker B, SUCCEEDED
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'SUCCEEDED');
            assert.equal(itemInDb.claimedBy, 'worker_reclaim_B', 'Item ownership must remain with Worker B');
            assert.ok(itemInDb.snapshotId, 'Item must have valid snapshotId from Worker B');

            // Verify snapshots in database: EXACTLY ONE snapshot exists
            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapshots.length, 1, 'Exactly one snapshot must exist across both workers');
            assert.equal(snapshots[0].createdByWorkerId, 'worker_reclaim_B', 'Snapshot must be attributed to Worker B, not stale Worker A');
            assert.equal(String(snapshots[0]._id), String(itemInDb.snapshotId), 'Snapshot ID must match item snapshotId');

            // Verify run counters: exactly 1 processed, 1 succeeded, 0 failed
            const finalRun = await PropertyVerificationRun.findById(run._id);
            assert.equal(finalRun.status, 'COMPLETED');
            assert.equal(finalRun.processedItems, 1, 'processedItems counter must be exactly 1');
            assert.equal(finalRun.succeededItems, 1, 'succeededItems counter must be exactly 1');
            assert.equal(finalRun.failedItems, 0, 'failedItems must be 0');
        });

        it('4.9 failure mode: Worker B reclaims after Worker A expires, but fails; late Worker A still cannot persist or finalize', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'RACE-SNAP-FAIL-1',
                projectName: 'Snapshot Race Failure Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PENDING',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            let workerBReclaimed = false;

            await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                batchSize: 1,
                workerId: 'worker_stale_fail_A',
                workerLeaseMs: 40,
                isFixtureMode: true,
                beforeSnapshotPersistence: async (runItem, workerId) => {
                    await new Promise(r => setTimeout(r, 60));

                    // Worker B atomically reclaims the item, but marks it FAILED due to an error
                    const reclaimed = await PropertyVerificationRunItem.findOneAndUpdate(
                        {
                            _id: item._id,
                            tenantId: tenantA,
                            status: 'PROCESSING',
                            leaseExpiresAt: { $lt: new Date() }
                        },
                        {
                            $set: {
                                status: 'FAILED',
                                claimedBy: 'worker_reclaim_failed_B',
                                errorMessage: 'Simulated downstream connector timeout',
                                leaseExpiresAt: null
                            }
                        },
                        { new: true }
                    );

                    assert.ok(reclaimed, 'Worker B must have reclaimed the expired item');
                    workerBReclaimed = true;
                }
            });

            assert.ok(workerBReclaimed);

            // Verify item remains FAILED by Worker B, not overwritten by late Worker A
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'FAILED');
            assert.equal(itemInDb.claimedBy, 'worker_reclaim_failed_B');
            assert.equal(itemInDb.snapshotId, null);

            // Zero snapshots must exist
            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapshots.length, 0, 'No snapshot must exist when item failed');
        });

        it('4.10 fail-closed behavior when AUTHORITY_REQUIRE_TRANSACTIONS=true and replica set transactions are unavailable', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'TX-FAILCLOSED-1',
                projectName: 'Transactions Require Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_tx_check',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            process.env.AUTHORITY_REQUIRE_TRANSACTIONS = 'true';
            try {
                // 1. Direct processItem fail-closed verification
                const itemResult = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_tx_check'
                });

                assert.equal(itemResult.success, false);
                assert.equal(itemResult.code, 'TRANSACTIONS_UNAVAILABLE');
                assert.equal(itemResult.reason, 'TRANSACTIONS_UNAVAILABLE');

                // 2. processRun fail-closed verification
                const runResult = await AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    workerId: 'worker_tx_check'
                });

                assert.equal(runResult.status, 'FAILED');
                assert.equal(runResult.code, 'TRANSACTIONS_UNAVAILABLE');
                assert.equal(runResult.reason, 'TRANSACTIONS_UNAVAILABLE');
            } finally {
                delete process.env.AUTHORITY_REQUIRE_TRANSACTIONS;
            }
        });

        it('4.11 stale worker snapshot adoption prevention: Worker B rejects adopting unfinalized snapshot created by Worker A', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'ANTI-ADOPT-1',
                projectName: 'Anti-Adoption Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_stale_creator_A',
                leaseExpiresAt: new Date(Date.now() - 5000), // Stale lease
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Simulate stale Worker A having created an unfinalized snapshot before losing lease
            const staleSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_stale_creator_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: {
                    compositeKey: link.propertyId,
                    sectorNumber: link.sectorNumber,
                    propertyId: link.propertyId
                },
                normalizedData: {
                    propertyId: link.propertyId,
                    sectorNumber: link.sectorNumber
                },
                contentHash: 'a'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Now Worker B claims the item with active lease
            item.claimedBy = 'worker_active_claim_B';
            item.leaseExpiresAt = new Date(Date.now() + 30000);
            await item.save();

            // Worker B attempts to process the item with disableOrphanRecovery: true
            const adoptResult = await AuthorityBulkProcessor.processItem(item, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_active_claim_B',
                disableOrphanRecovery: true
            });

            // Assert Worker B strictly rejects adopting Worker A's stale snapshot
            assert.equal(adoptResult.success, false);
            assert.equal(adoptResult.code, 'STALE_SNAPSHOT_ADOPTION_REJECTED');
            assert.equal(adoptResult.reason, 'STALE_SNAPSHOT_ADOPTION_REJECTED');

            // Verify item was NOT marked SUCCEEDED or bound to staleSnapshot
            const refreshedItem = await PropertyVerificationRunItem.findById(item._id);
            assert.notEqual(refreshedItem.status, 'SUCCEEDED');
            assert.notEqual(String(refreshedItem.snapshotId), String(staleSnapshot._id));
        });

        it('4.12 (Test A — Crash after snapshot insert) Worker A crashes after snapshot insert; Worker B safely recovers, cleans up orphan with audit trail, and completes item with exactly 1 accepted snapshot', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'CRASH-REC-A-1',
                projectName: 'Crash Recovery Project A',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed_A',
                leaseExpiresAt: new Date(Date.now() - 5000), // Lease expired after crash
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Simulate Worker A having created an immutable snapshot before crashing
            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: {
                    compositeKey: link.propertyId,
                    sectorNumber: link.sectorNumber,
                    propertyId: link.propertyId
                },
                normalizedData: {
                    propertyId: link.propertyId,
                    sectorNumber: link.sectorNumber
                },
                contentHash: 'f'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Worker B reclaims and processes the run
            const outcome = await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                batchSize: 1,
                workerId: 'worker_reclaim_B',
                isFixtureMode: true
            });

            assert.equal(outcome.status, 'COMPLETED');
            assert.equal(outcome.processedItems, 1);
            assert.equal(outcome.succeededItems, 1);
            assert.equal(outcome.failedItems, 0);

            // Verify item state in DB
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'SUCCEEDED');
            assert.equal(itemInDb.claimedBy, 'worker_reclaim_B');
            assert.ok(itemInDb.snapshotId);
            assert.notEqual(String(itemInDb.snapshotId), String(orphanedSnapshot._id), 'Must NOT adopt crashed worker snapshot');
            assert.equal(itemInDb.recoveryState.stage, 'ORPHAN_RECOVERED');
            assert.equal(itemInDb.recoveryState.orphanedByWorkerId, 'worker_crashed_A');
            assert.equal(itemInDb.recoveryState.recoveredByWorkerId, 'worker_reclaim_B');

            // Verify exactly one accepted snapshot exists in collection
            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapshots.length, 1, 'Exactly one accepted snapshot must exist in database');
            assert.equal(snapshots[0].createdByWorkerId, 'worker_reclaim_B');
            assert.equal(String(snapshots[0]._id), String(itemInDb.snapshotId));

            // Verify audit evidence for orphan purge
            const purgeAudit = await AuditLog.findOne({
                eventType: 'authority_orphan_snapshot_purged',
                targetId: orphanedSnapshot._id
            });
            assert.ok(purgeAudit, 'Purge audit log event must be recorded');
            assert.equal(purgeAudit.metadata?.orphanedByWorkerId, 'worker_crashed_A');
            assert.equal(purgeAudit.metadata?.recoveredByWorkerId, 'worker_reclaim_B');

            // Verify run counters reconcile
            const finalRun = await PropertyVerificationRun.findById(run._id);
            assert.equal(finalRun.processedItems, 1);
            assert.equal(finalRun.succeededItems, 1);
            assert.equal(finalRun.failedItems, 0);
        });

        it('4.13 (Test B — Cleanup failure) orphan cleanup failure records durable recovery state and audit evidence without remaining stuck', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'CLEANUP-FAIL-1',
                projectName: 'Cleanup Failure Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed_A',
                leaseExpiresAt: new Date(Date.now() - 5000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: {
                    compositeKey: link.propertyId,
                    sectorNumber: link.sectorNumber,
                    propertyId: link.propertyId
                },
                normalizedData: {
                    propertyId: link.propertyId,
                    sectorNumber: link.sectorNumber
                },
                contentHash: 'b'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Worker B claims item with active lease
            item.claimedBy = 'worker_clean_fail_B';
            item.leaseExpiresAt = new Date(Date.now() + 30000);
            await item.save();

            // Simulate orphan cleanup failure
            const failResult = await AuthorityBulkProcessor.processItem(item, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_clean_fail_B',
                beforeOrphanCleanup: async () => {
                    throw new Error('Simulated database write error during orphan purge');
                }
            });

            assert.equal(failResult.success, false);
            assert.equal(failResult.code, 'ORPHAN_CLEANUP_FAILED');
            assert.equal(failResult.reason, 'ORPHAN_CLEANUP_FAILED');
            assert.ok(failResult.error.includes('Simulated database write error'));

            // Verify durable recovery state on the RunItem
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'FAILED', 'Item must be marked FAILED rather than hanging in PROCESSING');
            assert.equal(itemInDb.recoveryState.stage, 'CLEANUP_FAILED');
            assert.ok(itemInDb.recoveryState.error.includes('Simulated database write error'));
            assert.equal(String(itemInDb.recoveryState.orphanedSnapshotId), String(orphanedSnapshot._id));
            assert.equal(itemInDb.recoveryState.orphanedByWorkerId, 'worker_crashed_A');
            assert.ok(itemInDb.recoveryState.failedAt);

            // Verify audit evidence for cleanup failure
            const failureAudit = await AuditLog.findOne({
                eventType: 'authority_orphan_cleanup_failed',
                targetId: orphanedSnapshot._id
            });
            assert.ok(failureAudit, 'Cleanup failure audit log must be recorded');
            assert.ok(failureAudit.metadata?.error?.includes('Simulated database write error'));

            // Verify repeated retries do not silently remain stuck:
            // When retried with working storage (reset status to PENDING), recovery succeeds
            itemInDb.status = 'PENDING';
            await itemInDb.save();

            const retryOutcome = await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                batchSize: 1,
                workerId: 'worker_retry_success',
                isFixtureMode: true
            });

            assert.equal(retryOutcome.status, 'COMPLETED');
            assert.equal(retryOutcome.succeededItems, 1);

            const recoveredItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(recoveredItem.status, 'SUCCEEDED');
            assert.equal(recoveredItem.recoveryState.stage, 'ORPHAN_RECOVERED');
        });

        it('4.14 (Test C — Concurrent recovery) Workers B and C concurrently attempt recovery after Worker A crash; only 1 completes item without duplicate snapshot or counter drift', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'CONC-REC-C-1',
                projectName: 'Concurrent Recovery Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1,
                processedItems: 0,
                succeededItems: 0,
                failedItems: 0
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed_A',
                leaseExpiresAt: new Date(Date.now() - 10000), // Expired
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: {
                    compositeKey: link.propertyId,
                    sectorNumber: link.sectorNumber,
                    propertyId: link.propertyId
                },
                normalizedData: {
                    propertyId: link.propertyId,
                    sectorNumber: link.sectorNumber
                },
                contentHash: 'c'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Concurrently launch Worker B and Worker C to recover the run
            const [resultB, resultC] = await Promise.all([
                AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    batchSize: 1,
                    workerId: 'worker_recovery_B',
                    isFixtureMode: true,
                    maxWaitAttempts: 5,
                    waitIntervalMs: 30
                }),
                AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    batchSize: 1,
                    workerId: 'worker_recovery_C',
                    isFixtureMode: true,
                    maxWaitAttempts: 5,
                    waitIntervalMs: 30
                })
            ]);

            assert.ok(['COMPLETED', 'PROCESSING'].includes(resultB.status));
            assert.ok(['COMPLETED', 'PROCESSING'].includes(resultC.status));

            const finalRun = await PropertyVerificationRun.findById(run._id);
            assert.equal(finalRun.status, 'COMPLETED');
            assert.equal(finalRun.processedItems, 1, 'Processed items must be exactly 1');
            assert.equal(finalRun.succeededItems, 1, 'Succeeded items must be exactly 1');
            assert.equal(finalRun.failedItems, 0, 'Failed items must be 0');

            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'SUCCEEDED');
            assert.ok(['worker_recovery_B', 'worker_recovery_C'].includes(itemInDb.claimedBy));

            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapshots.length, 1, 'Exactly one accepted snapshot must exist');
            assert.equal(snapshots[0].createdByWorkerId, itemInDb.claimedBy);
            assert.equal(String(snapshots[0]._id), String(itemInDb.snapshotId));
        });

        it('4.15 (Test D — Standalone transaction policy) AUTHORITY_REQUIRE_TRANSACTIONS=true fails closed on unsupported standalone topology without unsafe partial state', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'TX-POLICY-D-1',
                projectName: 'Transactions Policy Test',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_tx_policy_test',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            process.env.AUTHORITY_REQUIRE_TRANSACTIONS = 'true';
            try {
                // 1. Verify processItem fails closed
                const itemResult = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_tx_policy_test'
                });
                assert.equal(itemResult.success, false);
                assert.equal(itemResult.code, 'TRANSACTIONS_UNAVAILABLE');
                assert.equal(itemResult.reason, 'TRANSACTIONS_UNAVAILABLE');

                // 2. Verify processRun fails closed
                const runResult = await AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    workerId: 'worker_tx_policy_test'
                });
                assert.equal(runResult.status, 'FAILED');
                assert.equal(runResult.code, 'TRANSACTIONS_UNAVAILABLE');
                assert.equal(runResult.reason, 'TRANSACTIONS_UNAVAILABLE');

                // 3. Verify zero partial state or snapshots created
                const snapCount = await PropertyVerificationSnapshot.countDocuments({
                    tenantId: tenantA,
                    runItemId: item._id
                });
                assert.equal(snapCount, 0, 'No partial snapshot must be persisted when transactions are required');

                const unchangedItem = await PropertyVerificationRunItem.findById(item._id);
                assert.notEqual(unchangedItem.status, 'SUCCEEDED');
            } finally {
                delete process.env.AUTHORITY_REQUIRE_TRANSACTIONS;
            }
        });

        it('4.16 (Test E — Snapshot persistence/database failure) database failure during snapshot insertion finalizes item cleanly with error and supports retry', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'SNAP-DB-FAIL-E-1',
                projectName: 'Snapshot DB Fail Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_db_fail_test',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Simulate snapshot persistence failure by injecting error into create
            const originalCreate = PropertyVerificationSnapshot.create;
            PropertyVerificationSnapshot.create = async function () {
                throw new Error('Simulated MongoNetworkTimeout during snapshot write');
            };

            let failResult;
            try {
                failResult = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_db_fail_test'
                });
            } finally {
                PropertyVerificationSnapshot.create = originalCreate;
            }

            assert.equal(failResult.success, false);
            assert.equal(failResult.code, 'SNAPSHOT_PERSISTENCE_FAILED');
            assert.ok(failResult.error.includes('Simulated MongoNetworkTimeout'));

            // Verify RunItem state: cleanly marked FAILED with error message and cleared lease
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'FAILED');
            assert.ok(itemInDb.errorMessage.includes('SNAPSHOT_PERSISTENCE_FAILED'));
            assert.equal(itemInDb.leaseExpiresAt, null);

            // Zero snapshots exist
            const snapCount = await PropertyVerificationSnapshot.countDocuments({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapCount, 0, 'Zero snapshots must exist after persistence failure');

            // Verify retry behavior: reset item to PENDING and run again without error
            itemInDb.status = 'PENDING';
            itemInDb.errorMessage = null;
            await itemInDb.save();

            const retryResult = await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                batchSize: 1,
                workerId: 'worker_retry_after_fail',
                isFixtureMode: true
            });

            assert.equal(retryResult.status, 'COMPLETED');
            assert.equal(retryResult.succeededItems, 1);

            const retriedItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(retriedItem.status, 'SUCCEEDED');
            assert.ok(retriedItem.snapshotId);

            const finalSnapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(finalSnapshots.length, 1, 'Exactly one snapshot exists after retry');
        });

        it('4.17 Worker B pauses during orphan cleanup; lease expires; Worker C reclaims via atomic claim path; B fails. Verify B cannot delete C snapshot or mark C RunItem FAILED, clear C lease, or change recovery metadata', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'FENCE-REC-417-1',
                projectName: 'Lease Expiry Fencing Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed_A',
                leaseExpiresAt: new Date(Date.now() - 5000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Worker A crashed leaving orphan snapshot
            const orphanedSnapshotA = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: 'a'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Worker B claims item
            item.claimedBy = 'worker_fence_B';
            item.leaseExpiresAt = new Date(Date.now() + 30000);
            await item.save();

            let snapC = null;

            // Worker B attempts processing, but pauses in beforeOrphanCleanup while Worker C takes over
            const bResult = await AuthorityBulkProcessor.processItem(item, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_fence_B',
                beforeOrphanCleanup: async () => {
                    // Simulate Worker B lease expiring
                    await PropertyVerificationRunItem.updateOne(
                        { _id: item._id },
                        { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
                    );

                    // Worker C reclaims the item using the production atomic claim query
                    const claimTime = new Date();
                    const claimedItemC = await PropertyVerificationRunItem.findOneAndUpdate(
                        {
                            _id: item._id,
                            tenantId: tenantA,
                            $or: [
                                { status: 'PENDING' },
                                { status: 'PROCESSING', leaseExpiresAt: { $lt: claimTime } }
                            ]
                        },
                        {
                            $set: {
                                status: 'PROCESSING',
                                claimedBy: 'worker_reclaim_C',
                                claimedAt: claimTime,
                                leaseExpiresAt: new Date(claimTime.getTime() + 60000)
                            }
                        },
                        { new: true }
                    );
                    assert.ok(claimedItemC, 'Worker C must claim item via production atomic claim query');

                    // Worker C purges crashed Worker A's orphan snapshot, and creates snapshot C
                    await PropertyVerificationSnapshot.purgeOrphanedSnapshot({
                        tenantId: tenantA,
                        runItemId: item._id,
                        snapshotId: orphanedSnapshotA._id,
                        createdByWorkerId: 'worker_crashed_A'
                    });

                    snapC = await PropertyVerificationSnapshot.create({
                        tenantId: tenantA,
                        authorityCode: 'CHD',
                        linkId: link._id,
                        runItemId: item._id,
                        createdByWorkerId: 'worker_reclaim_C',
                        sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                        observedAt: new Date(),
                        isSynthetic: true,
                        provenance: 'SYNTHETIC_FIXTURE',
                        identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                        normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                        contentHash: 'c'.repeat(64),
                        isSealed: true,
                        dataQualityStatus: 'COMPLETE'
                    });

                    await PropertyVerificationRunItem.updateOne(
                        { _id: item._id },
                        {
                            $set: {
                                snapshotId: snapC._id,
                                'recoveryState.stage': 'ORPHAN_RECOVERED',
                                'recoveryState.recoveredByWorkerId': 'worker_reclaim_C',
                                'recoveryState.recoveredAt': new Date()
                            }
                        }
                    );
                }
            });

            // 1. Worker B must fail with ownershipLost
            assert.equal(bResult.success, false);
            assert.equal(bResult.reason, 'LEASE_EXPIRED_OR_PREEMPTED');
            assert.equal(bResult.ownershipLost, true);

            // 2. Verify Worker B did NOT delete Worker C snapshot
            const checkSnapC = await PropertyVerificationSnapshot.findById(snapC._id);
            assert.ok(checkSnapC, 'Worker C snapshot must NOT be deleted by stale Worker B');
            assert.equal(checkSnapC.createdByWorkerId, 'worker_reclaim_C');

            // 3. Verify Worker B did NOT mark Worker C RunItem FAILED, clear lease, or overwrite recoveryState
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'PROCESSING', 'RunItem must remain in PROCESSING under Worker C ownership');
            assert.equal(itemInDb.claimedBy, 'worker_reclaim_C');
            assert.ok(itemInDb.leaseExpiresAt > new Date(), 'Worker C lease must not be cleared by Worker B');
            assert.equal(itemInDb.recoveryState.recoveredByWorkerId, 'worker_reclaim_C', 'Recovery metadata must not be overwritten by Worker B');
        });

        it('4.18 AuditLog insertion fails after a successful cleanup attempt', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'AUDIT-FAIL-PURGE-1',
                projectName: 'Audit Purge Fail Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_audit_fail_B',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: 'd'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Intercept AuditLog.create to simulate failure when logging orphan purge
            const originalCreate = AuditLog.create;
            AuditLog.create = async function (doc) {
                const event = Array.isArray(doc) ? doc[0]?.eventType : doc?.eventType;
                if (event === 'authority_orphan_snapshot_purged') {
                    throw new Error('Simulated database error during orphan purge audit insertion');
                }
                return originalCreate.apply(this, arguments);
            };

            let result;
            try {
                result = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_audit_fail_B'
                });
            } finally {
                AuditLog.create = originalCreate;
            }

            // Confirmed snapshot deletion with failed audit must transition to ORPHAN_PURGED_AUDIT_PENDING (not CLEANUP_FAILED)
            assert.equal(result.success, false);
            assert.equal(result.reason, 'ORPHAN_PURGED_AUDIT_PENDING');
            assert.equal(result.auditPending, true);
            assert.ok(result.error.includes('Simulated database error during orphan purge audit insertion'));

            // Verify RunItem preserves audit-pending state and remains eligible for safe retry
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'PROCESSING', 'Item must remain PROCESSING to allow safe retry/reconciliation');
            assert.equal(itemInDb.recoveryState.stage, 'ORPHAN_PURGED_AUDIT_PENDING');
            assert.equal(String(itemInDb.recoveryState.orphanedSnapshotId), String(orphanedSnapshot._id));
            assert.equal(itemInDb.recoveryState.recoveredByWorkerId, 'worker_audit_fail_B');
            assert.ok(itemInDb.recoveryState.purgedAt, 'purgedAt timestamp must be recorded');
            assert.ok(itemInDb.recoveryState.error.includes('Simulated database error during orphan purge audit insertion'));

            // Verify orphan snapshot was deleted from DB
            const checkSnap = await PropertyVerificationSnapshot.findById(orphanedSnapshot._id);
            assert.equal(checkSnap, null, 'Orphaned snapshot must be purged from database');

            // Restore AuditLog and simulate retry / replacement worker claim
            const claimTime = new Date();
            const claimedItemC = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    status: 'PROCESSING'
                },
                {
                    $set: {
                        claimedBy: 'worker_reconciler_C',
                        claimedAt: claimTime,
                        leaseExpiresAt: new Date(claimTime.getTime() + 60000)
                    }
                },
                { new: true }
            );
            assert.ok(claimedItemC, 'Worker C successfully claims the item in ORPHAN_PURGED_AUDIT_PENDING state');

            // Worker C processes the item — it reconciles the missing audit event and completes successfully
            const cResult = await AuthorityBulkProcessor.processItem(claimedItemC, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_reconciler_C'
            });

            assert.equal(cResult.success, true);
            assert.ok(cResult.snapshotId);

            // Verify missing audit is now reconciled and persisted
            const reconciledAudit = await AuditLog.findOne({
                eventType: 'authority_orphan_snapshot_purged',
                targetId: orphanedSnapshot._id
            });
            assert.ok(reconciledAudit, 'Reconciled audit log must be persisted for the purged snapshot');

            // Verify RunItem completed with SUCCEEDED and ORPHAN_RECOVERED
            const finalItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(finalItem.status, 'SUCCEEDED');
            assert.equal(finalItem.recoveryState.stage, 'ORPHAN_RECOVERED');
            assert.equal(finalItem.recoveryState.recoveredByWorkerId, 'worker_reconciler_C');

            // Verify exactly 1 valid snapshot exists in DB (owned by Worker C)
            const snapshotsInDb = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapshotsInDb.length, 1);
            assert.equal(snapshotsInDb[0].createdByWorkerId, 'worker_reconciler_C');
        });

        it('4.19 AuditLog insertion fails during cleanup failure handling', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'AUDIT-FAIL-CLEAN-1',
                projectName: 'Audit Cleanup Error Fail Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_audit_cleanup_fail',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: 'e'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Simulate AuditLog.create throwing on cleanup failure recording
            const originalCreate = AuditLog.create;
            AuditLog.create = async function (doc) {
                if (doc.eventType === 'authority_orphan_cleanup_failed') {
                    throw new Error('Simulated secondary audit persistence failure');
                }
                return originalCreate.apply(this, arguments);
            };

            let result;
            try {
                result = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_audit_cleanup_fail',
                    beforeOrphanCleanup: async () => {
                        throw new Error('Primary orphan purge exception');
                    }
                });
            } finally {
                AuditLog.create = originalCreate;
            }

            assert.equal(result.success, false);
            assert.equal(result.reason, 'ORPHAN_CLEANUP_FAILED');
            assert.ok(result.error.includes('Primary orphan purge exception'));
            assert.ok(result.error.includes('Simulated secondary audit persistence failure') || result.auditError?.includes('Simulated secondary audit persistence failure'));

            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'FAILED');
            assert.equal(itemInDb.recoveryState.stage, 'CLEANUP_FAILED');
            assert.ok(itemInDb.recoveryState.error.includes('Primary orphan purge exception'));
            assert.ok(itemInDb.recoveryState.error.includes('Simulated secondary audit persistence failure'));
        });

        it('4.20 Orphan deletion returns deletedCount: 0', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'ZERO-DEL-420-1',
                projectName: 'Zero Deleted Count Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_zero_del_B',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: '1'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Stub purgeOrphanedSnapshot to return deletedCount: 0
            const originalPurge = PropertyVerificationSnapshot.purgeOrphanedSnapshot;
            PropertyVerificationSnapshot.purgeOrphanedSnapshot = async function () {
                return { acknowledged: true, deletedCount: 0, success: false };
            };

            let result;
            try {
                result = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_zero_del_B'
                });
            } finally {
                PropertyVerificationSnapshot.purgeOrphanedSnapshot = originalPurge;
            }

            assert.equal(result.success, false);
            assert.equal(result.reason, 'ORPHAN_CLEANUP_FAILED');
            assert.ok(result.error.includes('ORPHAN_DELETION_UNCONFIRMED'));

            // Verify no purge audit log was created
            const purgeAudit = await AuditLog.findOne({
                eventType: 'authority_orphan_snapshot_purged',
                targetId: orphanedSnapshot._id
            });
            assert.equal(purgeAudit, null, 'Must NOT write successful purge audit when deletedCount is 0');

            // Verify RunItem state is FAILED and stage is CLEANUP_FAILED
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'FAILED');
            assert.equal(itemInDb.recoveryState.stage, 'CLEANUP_FAILED');
            assert.ok(itemInDb.recoveryState.error.includes('ORPHAN_DELETION_UNCONFIRMED'));
        });

        it('4.21 Cleanup exceeds the worker lease duration', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'LEASE-DUR-421-1',
                projectName: 'Lease Duration Exceeded Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_timeout_B',
                leaseExpiresAt: new Date(Date.now() + 40), // Short lease: 40ms
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: '2'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            const result = await AuthorityBulkProcessor.processItem(item, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_timeout_B',
                beforeOrphanCleanup: async () => {
                    // Sleep 80ms to exceed worker lease duration
                    await new Promise(resolve => setTimeout(resolve, 80));
                }
            });

            assert.equal(result.success, false);
            assert.equal(result.reason, 'LEASE_EXPIRED_OR_PREEMPTED');
            assert.equal(result.ownershipLost, true);

            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.notEqual(itemInDb.recoveryState?.stage, 'ORPHAN_RECOVERED', 'Stale worker must not record ORPHAN_RECOVERED');
        });

        it('4.22 Concurrent workers encounter the same orphan snapshot', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'CONC-SNAP-422-1',
                projectName: 'Concurrent Orphan Snapshot Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1,
                processedItems: 0,
                succeededItems: 0,
                failedItems: 0
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed_A',
                leaseExpiresAt: new Date(Date.now() - 5000), // Expired lease
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: '3'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Concurrent execution of Worker B and Worker C attempting recovery on the same run
            const [resB, resC] = await Promise.all([
                AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    batchSize: 1,
                    workerId: 'worker_conc_B_422',
                    isFixtureMode: true,
                    maxWaitAttempts: 5,
                    waitIntervalMs: 30
                }),
                AuthorityBulkProcessor.processRun(run._id, {
                    tenantId: tenantA,
                    batchSize: 1,
                    workerId: 'worker_conc_C_422',
                    isFixtureMode: true,
                    maxWaitAttempts: 5,
                    waitIntervalMs: 30
                })
            ]);

            assert.ok(['COMPLETED', 'PROCESSING'].includes(resB.status));
            assert.ok(['COMPLETED', 'PROCESSING'].includes(resC.status));

            const finalRun = await PropertyVerificationRun.findById(run._id);
            assert.equal(finalRun.status, 'COMPLETED');
            assert.equal(finalRun.processedItems, 1);
            assert.equal(finalRun.succeededItems, 1);
            assert.equal(finalRun.failedItems, 0);

            // Exactly 1 accepted snapshot exists in DB
            const snapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snapshots.length, 1, 'Exactly one accepted snapshot must exist in database');

            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.status, 'SUCCEEDED');
            assert.equal(String(itemInDb.snapshotId), String(snapshots[0]._id));
            assert.equal(itemInDb.recoveryState.stage, 'ORPHAN_RECOVERED');
        });

        it('4.23 Simulate a process crash after snapshot deletion but before AuditLog persistence', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'CRASH-RECON-423-1',
                projectName: 'Crash Reconciliation Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed_A',
                leaseExpiresAt: new Date(Date.now() - 5000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Worker A crashed leaving an orphan snapshot
            const orphanedSnapshotA = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: '7'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Worker B claims the item
            item.claimedBy = 'worker_crashing_B';
            item.leaseExpiresAt = new Date(Date.now() + 30000);
            await item.save();

            // Worker B runs processItem, but crashes immediately after snapshot purge (simulated via afterOrphanPurged)
            try {
                await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_crashing_B',
                    afterOrphanPurged: async () => {
                        // Simulate sudden node process death / crash immediately after snapshot purge
                        await PropertyVerificationRunItem.updateOne(
                            { _id: item._id },
                            { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
                        );
                        throw new Error('SIMULATED_PROCESS_DEATH_AFTER_PURGE');
                    }
                });
            } catch (err) {
                // simulated crash
            }

            // Verify snapshot A was indeed purged from MongoDB
            const checkSnapA = await PropertyVerificationSnapshot.findById(orphanedSnapshotA._id);
            assert.equal(checkSnapA, null, 'Orphaned snapshot A was purged before the crash');

            // Worker C reclaims the item using the production atomic claim query
            const claimTime = new Date();
            const claimedItemC = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    $or: [
                        { status: 'PENDING' },
                        { status: 'PROCESSING', leaseExpiresAt: { $lt: claimTime } }
                    ]
                },
                {
                    $set: {
                        status: 'PROCESSING',
                        claimedBy: 'worker_reconciler_C',
                        claimedAt: claimTime,
                        leaseExpiresAt: new Date(claimTime.getTime() + 60000)
                    }
                },
                { new: true }
            );
            assert.ok(claimedItemC, 'Worker C successfully claims the crashed item');

            // Worker C processes the item — it reconciles the missing audit event, completes recovery, and generates snapshot C
            const cResult = await AuthorityBulkProcessor.processItem(claimedItemC, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_reconciler_C'
            });

            assert.equal(cResult.success, true);
            assert.ok(cResult.snapshotId);

            // Verify reconciled audit log was generated
            const reconciledAudit = await AuditLog.findOne({
                eventType: 'authority_orphan_snapshot_purged',
                'metadata.reconciledAfterCrash': true,
                'metadata.recoveredByWorkerId': 'worker_reconciler_C'
            });
            assert.ok(reconciledAudit, 'Reconciled audit log must be persisted for the purged snapshot');

            // Verify RunItem completed successfully
            const finalItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(finalItem.status, 'SUCCEEDED');
            assert.equal(finalItem.recoveryState.stage, 'ORPHAN_RECOVERED');
            assert.equal(finalItem.recoveryState.recoveredByWorkerId, 'worker_reconciler_C');

            // Exactly 1 valid snapshot exists in DB (owned by Worker C)
            const finalSnapshots = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(finalSnapshots.length, 1);
            assert.equal(finalSnapshots[0].createdByWorkerId, 'worker_reconciler_C');
        });

        it('4.24 Exercise standalone rollback when purge returns deletedCount: 0', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'ROLLBACK-ZERO-424-1',
                projectName: 'Rollback Zero Deleted Count Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_rollback_zero',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Mock _finalizeItemWithOwnershipCheck to simulate finalization failure (e.g. lease expired right before finalization)
            const originalFinalize = AuthorityBulkProcessor._finalizeItemWithOwnershipCheck;
            AuthorityBulkProcessor._finalizeItemWithOwnershipCheck = async function () {
                return null; // Triggers standalone rollback
            };

            // Stub purgeOrphanedSnapshot to return deletedCount: 0
            const originalPurge = PropertyVerificationSnapshot.purgeOrphanedSnapshot;
            PropertyVerificationSnapshot.purgeOrphanedSnapshot = async function () {
                return { acknowledged: true, deletedCount: 0, success: false };
            };

            let result;
            try {
                result = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_rollback_zero'
                });
            } finally {
                AuthorityBulkProcessor._finalizeItemWithOwnershipCheck = originalFinalize;
                PropertyVerificationSnapshot.purgeOrphanedSnapshot = originalPurge;
            }

            // Worker returns lease expired or preempted with ownershipLost: true
            assert.equal(result.success, false);
            assert.equal(result.reason, 'LEASE_EXPIRED_OR_PREEMPTED');
            assert.equal(result.ownershipLost, true);

            // AuditLog records authority_orphan_cleanup_failed due to unconfirmed purge
            const failureAudit = await AuditLog.findOne({
                eventType: 'authority_orphan_cleanup_failed',
                'metadata.workerId': 'worker_rollback_zero'
            });
            assert.ok(failureAudit, 'AuditLog must record cleanup failure in standalone rollback');
            assert.ok(failureAudit.description.includes('ORPHAN_DELETION_UNCONFIRMED'));
        });

        it('4.25 Simulate AuditLog failures in the standalone rollback branch', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'ROLLBACK-AUDIT-425-1',
                projectName: 'Rollback Audit Failure Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_audit_fail_rollback',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Mock _finalizeItemWithOwnershipCheck to trigger rollback
            const originalFinalize = AuthorityBulkProcessor._finalizeItemWithOwnershipCheck;
            AuthorityBulkProcessor._finalizeItemWithOwnershipCheck = async function () {
                return null;
            };

            // Intercept AuditLog.create to throw on orphan purge logging
            const originalAuditCreate = AuditLog.create;
            AuditLog.create = async function (doc) {
                const event = Array.isArray(doc) ? doc[0]?.eventType : doc?.eventType;
                if (event === 'authority_orphan_snapshot_purged') {
                    throw new Error('Simulated database error during rollback purge audit');
                }
                return originalAuditCreate.apply(this, arguments);
            };

            let result;
            try {
                result = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_audit_fail_rollback'
                });
            } finally {
                AuthorityBulkProcessor._finalizeItemWithOwnershipCheck = originalFinalize;
                AuditLog.create = originalAuditCreate;
            }

            // Worker returns lease expired or preempted safely
            assert.equal(result.success, false);
            assert.equal(result.reason, 'LEASE_EXPIRED_OR_PREEMPTED');
            assert.equal(result.ownershipLost, true);

            // Verify RunItem recoveryState recorded ORPHAN_PURGED_AUDIT_PENDING (confirmed purge, pending audit)
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.recoveryState.stage, 'ORPHAN_PURGED_AUDIT_PENDING');
            assert.ok(itemInDb.recoveryState.purgedAt, 'purgedAt timestamp must be preserved');
            assert.ok(itemInDb.recoveryState.error.includes('Simulated database error during rollback purge audit'));

            // Restore AuditLog and verify replacement worker can safely claim and reconcile
            const claimTime = new Date();
            const claimedItem = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    status: 'PROCESSING'
                },
                {
                    $set: {
                        claimedBy: 'worker_rollback_reconciler',
                        claimedAt: claimTime,
                        leaseExpiresAt: new Date(claimTime.getTime() + 60000)
                    }
                },
                { new: true }
            );
            assert.ok(claimedItem);

            const reconcileRes = await AuthorityBulkProcessor.processItem(claimedItem, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_rollback_reconciler'
            });

            assert.equal(reconcileRes.success, true);
            const finalItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(finalItem.status, 'SUCCEEDED');
            assert.equal(finalItem.recoveryState.stage, 'ORPHAN_RECOVERED');
        });

        it('4.26 Process crash after standalone rollback deletion but before audit insertion; replacement worker recovers pending audit', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'ROLLBACK-CRASH-426-1',
                projectName: 'Rollback Crash Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashing_rollback_B',
                leaseExpiresAt: new Date(Date.now() + 30000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Mock finalization to simulate ownership loss during finalization
            const originalFinalize = AuthorityBulkProcessor._finalizeItemWithOwnershipCheck;
            AuthorityBulkProcessor._finalizeItemWithOwnershipCheck = async function () {
                return null;
            };

            let capturedSnapshotId = null;
            try {
                await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_crashing_rollback_B',
                    afterRollbackPurged: async (snap) => {
                        capturedSnapshotId = snap._id;
                        // Expire lease and simulate crash before audit insertion
                        await PropertyVerificationRunItem.updateOne(
                            { _id: item._id },
                            { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } }
                        );
                        throw new Error('SIMULATED_PROCESS_DEATH_AFTER_ROLLBACK_PURGE');
                    }
                });
            } catch (err) {
                // Expected simulated crash
            } finally {
                AuthorityBulkProcessor._finalizeItemWithOwnershipCheck = originalFinalize;
            }

            assert.ok(capturedSnapshotId, 'Snapshot must have been created and captured before rollback purge');

            // Snapshot must be purged from DB
            const checkPurged = await PropertyVerificationSnapshot.findById(capturedSnapshotId);
            assert.equal(checkPurged, null, 'Snapshot must be deleted from DB by rollback purge');

            // Replacement Worker C claims the item via production atomic claim query
            const claimTime = new Date();
            const claimedItemC = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    $or: [
                        { status: 'PENDING' },
                        { status: 'PROCESSING', leaseExpiresAt: { $lt: claimTime } }
                    ]
                },
                {
                    $set: {
                        status: 'PROCESSING',
                        claimedBy: 'worker_reconciler_C',
                        claimedAt: claimTime,
                        leaseExpiresAt: new Date(claimTime.getTime() + 60000)
                    }
                },
                { new: true }
            );
            assert.ok(claimedItemC, 'Worker C successfully claims crashed rollback item');

            // Worker C processes item — detects ROLLBACK_PURGE_PENDING with purged snapshot, reconciles audit, and completes
            const cResult = await AuthorityBulkProcessor.processItem(claimedItemC, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_reconciler_C'
            });

            assert.equal(cResult.success, true);
            assert.ok(cResult.snapshotId);

            // Verify reconciled audit log was persisted
            const reconciledAudit = await AuditLog.findOne({
                eventType: 'authority_orphan_snapshot_purged',
                targetId: capturedSnapshotId,
                'metadata.reconciledAfterCrash': true
            });
            assert.ok(reconciledAudit, 'Reconciled audit log must be recorded for rolled back snapshot');

            // Verify RunItem completed SUCCEEDED and ORPHAN_RECOVERED
            const finalItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(finalItem.status, 'SUCCEEDED');
            assert.equal(finalItem.recoveryState.stage, 'ORPHAN_RECOVERED');
            assert.equal(finalItem.recoveryState.recoveredByWorkerId, 'worker_reconciler_C');

            // Exactly 1 valid snapshot in DB (owned by Worker C)
            const finalSnaps = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(finalSnaps.length, 1);
            assert.equal(finalSnaps[0].createdByWorkerId, 'worker_reconciler_C');
        });

        it('4.27 Process crash after successful audit insertion but before recovery-state completion; verify no duplicate purge audit is created', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'IDEMPOTENT-AUDIT-427-1',
                projectName: 'Idempotent Audit Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_crashed_A',
                leaseExpiresAt: new Date(Date.now() - 5000),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const orphanedSnapshot = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link._id,
                runItemId: item._id,
                createdByWorkerId: 'worker_crashed_A',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link.propertyId, sectorNumber: link.sectorNumber, propertyId: link.propertyId },
                normalizedData: { propertyId: link.propertyId, sectorNumber: link.sectorNumber },
                contentHash: 'e'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Pre-seed the audit log as if Worker B purged snapshot and logged audit, but died before setting ORPHAN_RECOVERED
            const correlationId = `orphan_purge:${tenantA}:${item._id}:${orphanedSnapshot._id}`;
            await AuditLog.create({
                eventType: 'authority_orphan_snapshot_purged',
                userId: userA._id,
                userName: 'System/AuthorityEngine',
                userEmail: 'system@crm.internal',
                targetType: 'authority_snapshot',
                targetId: orphanedSnapshot._id,
                description: `Pre-existing audit for ${orphanedSnapshot._id}`,
                correlationId,
                metadata: {
                    snapshotId: orphanedSnapshot._id,
                    runItemId: item._id,
                    tenantId: tenantA
                },
                ipAddress: '127.0.0.1',
                userAgent: 'AuthorityBulkProcessor/v4.1',
                status: 'success'
            });

            // Purge snapshot from DB using authorized purge method (simulating successful purge before crash)
            await PropertyVerificationSnapshot.purgeOrphanedSnapshot({
                tenantId: tenantA,
                runItemId: item._id,
                snapshotId: orphanedSnapshot._id,
                createdByWorkerId: 'worker_crashed_A'
            });

            // Leave RunItem in pending state (simulating crash before recovery-state completion)
            item.claimedBy = 'worker_crashing_B';
            item.leaseExpiresAt = new Date(Date.now() - 1000); // expired
            item.recoveryState = {
                stage: 'ORPHAN_DETECTED',
                orphanedSnapshotId: orphanedSnapshot._id,
                orphanedByWorkerId: 'worker_crashed_A',
                recoveredByWorkerId: 'worker_crashing_B',
                detectedAt: new Date()
            };
            await item.save();

            // Verify exactly 1 audit record exists currently
            const initialAudits = await AuditLog.find({
                eventType: 'authority_orphan_snapshot_purged',
                targetId: orphanedSnapshot._id
            });
            assert.equal(initialAudits.length, 1);

            // Replacement Worker C claims the item
            const claimTime = new Date();
            const claimedItemC = await PropertyVerificationRunItem.findOneAndUpdate(
                {
                    _id: item._id,
                    tenantId: tenantA,
                    status: 'PROCESSING',
                    leaseExpiresAt: { $lt: claimTime }
                },
                {
                    $set: {
                        claimedBy: 'worker_idempotent_C',
                        claimedAt: claimTime,
                        leaseExpiresAt: new Date(claimTime.getTime() + 60000)
                    }
                },
                { new: true }
            );
            assert.ok(claimedItemC);

            // Worker C processes the item — should detect existing audit via correlationId/targetId and not create duplicate
            const cResult = await AuthorityBulkProcessor.processItem(claimedItemC, {
                tenantId: tenantA,
                isFixtureMode: true,
                authorityCode: 'CHD',
                workerId: 'worker_idempotent_C'
            });

            assert.equal(cResult.success, true);

            // Verify no duplicate audit was inserted
            const finalAudits = await AuditLog.find({
                eventType: 'authority_orphan_snapshot_purged',
                targetId: orphanedSnapshot._id
            });
            assert.equal(finalAudits.length, 1, 'P2 Idempotency: Audit log must not be duplicated on crash recovery');

            // Verify RunItem SUCCEEDED with Worker C snapshot
            const finalItem = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(finalItem.status, 'SUCCEEDED');
            assert.equal(finalItem.recoveryState.stage, 'ORPHAN_RECOVERED');
        });

        it('4.28 Verify pending audit states cannot be silently marked ORPHAN_RECOVERED while audit is failing', async () => {
            const inv = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'AUDIT-PENDING-FAIL-428-1',
                projectName: 'Audit Pending Fail Project',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv._id,
                authorityCode: 'CHD',
                propertyId: inv.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'PROCESSING',
                isFixtureMode: true,
                totalItems: 1
            });

            const fakeSnapId = new mongoose.Types.ObjectId();
            const item = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv._id,
                linkId: link._id,
                authorityCode: 'CHD',
                status: 'PROCESSING',
                claimedBy: 'worker_audit_reconcile_C',
                leaseExpiresAt: new Date(Date.now() + 30000),
                recoveryState: {
                    stage: 'ORPHAN_PURGED_AUDIT_PENDING',
                    orphanedSnapshotId: fakeSnapId,
                    orphanedByWorkerId: 'worker_crashed_A',
                    recoveredByWorkerId: 'worker_audit_fail_B',
                    purgedAt: new Date()
                },
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Intercept AuditLog.create to simulate persistent AuditLog failure
            const originalCreate = AuditLog.create;
            AuditLog.create = async function (doc) {
                const event = Array.isArray(doc) ? doc[0]?.eventType : doc?.eventType;
                if (event === 'authority_orphan_snapshot_purged') {
                    throw new Error('Persistent AuditLog outage');
                }
                return originalCreate.apply(this, arguments);
            };

            let result;
            try {
                result = await AuthorityBulkProcessor.processItem(item, {
                    tenantId: tenantA,
                    isFixtureMode: true,
                    authorityCode: 'CHD',
                    workerId: 'worker_audit_reconcile_C'
                });
            } finally {
                AuditLog.create = originalCreate;
            }

            // Must fail closed without marking ORPHAN_RECOVERED or creating snapshot
            assert.equal(result.success, false);
            assert.equal(result.reason, 'ORPHAN_PURGED_AUDIT_PENDING');
            assert.equal(result.auditPending, true);

            // DB item must NOT be marked ORPHAN_RECOVERED
            const itemInDb = await PropertyVerificationRunItem.findById(item._id);
            assert.equal(itemInDb.recoveryState.stage, 'ORPHAN_PURGED_AUDIT_PENDING');
            assert.notEqual(itemInDb.recoveryState.stage, 'ORPHAN_RECOVERED');
            assert.notEqual(itemInDb.status, 'SUCCEEDED');

            // No snapshot must be persisted
            const snaps = await PropertyVerificationSnapshot.find({
                tenantId: tenantA,
                runItemId: item._id
            });
            assert.equal(snaps.length, 0, 'No snapshot may be persisted while required audit is pending');
        });

        it('4.29 Verify replacement worker ownership, snapshot count, and run counters remain correct across multiple items', async () => {
            const inv1 = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'BATCH-OWN-429-1',
                projectName: 'Batch Ownership Project 1',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });
            const inv2 = await Inventory.create({
                tenantId: tenantA,
                unitNo: 'BATCH-OWN-429-2',
                projectName: 'Batch Ownership Project 2',
                sector: 'Sector 17',
                city: 'Chandigarh',
                type: 'commercial'
            });

            const link1 = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv1._id,
                authorityCode: 'CHD',
                propertyId: inv1.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });
            const link2 = await PropertyAuthorityLink.create({
                tenantId: tenantA,
                inventoryId: inv2._id,
                authorityCode: 'CHD',
                propertyId: inv2.unitNo,
                sectorNumber: 'Sector 17',
                matchEligibility: 'ELIGIBLE',
                createdBy: userA._id
            });

            const run = await PropertyVerificationRun.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                requestedBy: userA._id,
                runMode: 'BULK_MANUAL',
                status: 'CREATED',
                isFixtureMode: true,
                totalItems: 2
            });

            const item1 = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv1._id,
                linkId: link1._id,
                authorityCode: 'CHD',
                status: 'PENDING',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            const item2 = await PropertyVerificationRunItem.create({
                tenantId: tenantA,
                runId: run._id,
                inventoryId: inv2._id,
                linkId: link2._id,
                authorityCode: 'CHD',
                status: 'PENDING',
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE'
            });

            // Leave orphan snapshot on item1 from a dead worker
            const orphanedSnapshot1 = await PropertyVerificationSnapshot.create({
                tenantId: tenantA,
                authorityCode: 'CHD',
                linkId: link1._id,
                runItemId: item1._id,
                createdByWorkerId: 'dead_worker_X',
                sourceReferenceUrl: 'https://authority.fixture.internal/chd',
                observedAt: new Date(),
                isSynthetic: true,
                provenance: 'SYNTHETIC_FIXTURE',
                identityEvidence: { compositeKey: link1.propertyId, sectorNumber: link1.sectorNumber, propertyId: link1.propertyId },
                normalizedData: { propertyId: link1.propertyId, sectorNumber: link1.sectorNumber },
                contentHash: 'f'.repeat(64),
                isSealed: true,
                dataQualityStatus: 'COMPLETE'
            });

            // Execute processRun with worker_batch_runner
            const processedRun = await AuthorityBulkProcessor.processRun(run._id, {
                tenantId: tenantA,
                workerId: 'worker_batch_runner'
            });

            assert.equal(processedRun.status, 'COMPLETED');
            assert.equal(processedRun.processedItems, 2);
            assert.equal(processedRun.succeededItems, 2);
            assert.equal(processedRun.failedItems, 0);

            // Verify both items succeeded and are owned by worker_batch_runner
            const finalItem1 = await PropertyVerificationRunItem.findById(item1._id);
            const finalItem2 = await PropertyVerificationRunItem.findById(item2._id);
            assert.equal(finalItem1.status, 'SUCCEEDED');
            assert.equal(finalItem2.status, 'SUCCEEDED');
            assert.equal(finalItem1.recoveryState.stage, 'ORPHAN_RECOVERED');
            assert.equal(finalItem1.recoveryState.recoveredByWorkerId, 'worker_batch_runner');

            // Verify exactly 2 valid snapshots in DB, both owned by worker_batch_runner
            const snaps1 = await PropertyVerificationSnapshot.find({ runItemId: item1._id, tenantId: tenantA });
            const snaps2 = await PropertyVerificationSnapshot.find({ runItemId: item2._id, tenantId: tenantA });
            assert.equal(snaps1.length, 1);
            assert.equal(snaps2.length, 1);
            assert.equal(snaps1[0].createdByWorkerId, 'worker_batch_runner');
            assert.equal(snaps2[0].createdByWorkerId, 'worker_batch_runner');

            // Verify old orphan snapshot was purged
            const oldSnap = await PropertyVerificationSnapshot.findById(orphanedSnapshot1._id);
            assert.equal(oldSnap, null);
        });
    });

    describe('5. Snapshot Cryptographic Integrity Verification', () => {
        beforeEach(async () => {
            await configureLiveSourceSettings(['fileNumber', 'sectorNumber']);
        });

        afterEach(async () => {
            await resetSourceSettings();
        });

        it('5.1 snapshot with valid 64-char SHA-256 hash matching normalizedData succeeds (200)', async () => {
            const { item } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-CRYPTO-OK', approved: true }
                ],
                normalizedData: { fileNumber: 'FN-CRYPTO-OK', sectorNumber: '14' }
            });

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);
        });

        it('5.2 snapshot with tampered/mismatched contentHash is rejected with HTTP 422 INVALID_SOURCE_EVIDENCE', async () => {
            const { item, snap, inventory } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-TAMPERED', approved: true }
                ],
                normalizedData: { fileNumber: 'FN-TAMPERED', sectorNumber: '14' }
            });

            // Tamper with the snapshot contentHash directly via MongoDB driver (bypassing mongoose immutable hooks)
            const tamperedHash = 'e'.repeat(64);
            await PropertyVerificationSnapshot.collection.updateOne(
                { _id: snap._id },
                { $set: { contentHash: tamperedHash } }
            );

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.success, false);
            assert.equal(data.code, 'INVALID_SOURCE_EVIDENCE');
            assert.ok(data.message.includes('cryptographic integrity verification failed'));

            // Inventory remains unchanged
            const unchangedInv = await Inventory.findById(inventory._id);
            assert.notEqual(unchangedInv.authorityVerification?.fileNumber, 'FN-TAMPERED');
        });

        it('5.3 snapshot with malformed/non-hex contentHash is rejected with HTTP 422 INVALID_SOURCE_EVIDENCE', async () => {
            const { item, snap } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-MALFORMED', approved: true }
                ]
            });

            // Set malformed non-hex hash directly in DB
            await PropertyVerificationSnapshot.collection.updateOne(
                { _id: snap._id },
                { $set: { contentHash: 'not-a-valid-hex-hash!!' } }
            );

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.code, 'INVALID_SOURCE_EVIDENCE');
            assert.ok(data.message.includes('lacks a valid cryptographic content hash'));
        });

        it('5.4 unsealed snapshot (isSealed: false) is rejected with HTTP 422 INVALID_SOURCE_EVIDENCE', async () => {
            const { item, snap } = await createLiveApplyFixture({
                proposedChanges: [
                    { field: 'authorityVerification.fileNumber', currentValue: null, proposedValue: 'FN-UNSEALED', approved: true }
                ]
            });

            // Unseal the snapshot directly in DB
            await PropertyVerificationSnapshot.collection.updateOne(
                { _id: snap._id },
                { $set: { isSealed: false } }
            );

            const res = await fetch(`${baseUrl}/api/authority/apply/${item._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` }
            });

            assert.equal(res.status, 422);
            const data = await res.json();
            assert.equal(data.code, 'INVALID_SOURCE_EVIDENCE');
            assert.ok(data.message.includes('snapshot is not sealed'));
        });
    });
});
