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
            reviewedBy: options.reviewedBy || new mongoose.Types.ObjectId(),
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
