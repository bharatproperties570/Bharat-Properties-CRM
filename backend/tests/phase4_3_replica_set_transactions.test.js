import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

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

describe('Phase 4.3 — Replica-Set Multi-Document ACID Transactions Suite', () => {
    let replSet;
    let testServer;
    let baseUrl;

    let tenantA, tenantB;
    let userA, userB;
    let tokenA, tokenB;

    before(async () => {
        // Spin up a 1-node replica set supporting real MongoDB transactions
        replSet = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        const mongoUri = replSet.getUri();
        await mongoose.connect(mongoUri);

        tenantA = new mongoose.Types.ObjectId();
        tenantB = new mongoose.Types.ObjectId();

        const auditorRole = await Role.create({
            name: 'Authority Operational Auditor Role 4.3 ReplSet',
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
            fullName: 'Auditor A ReplSet',
            email: 'auditor.a.replset@crm.test',
            password: 'hashed_password',
            department: 'inventory',
            role: auditorRole._id,
            isActive: true
        });

        userB = await User.create({
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            fullName: 'Auditor B ReplSet',
            email: 'auditor.b.replset@crm.test',
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

        await Inventory.init();
        await AuditLog.init();
        await PropertyVerificationRunItem.init();
        await PropertyAuthorityLink.init();
        await PropertyVerificationRun.init();
        await PropertyVerificationSnapshot.init();
    });

    after(async () => {
        if (testServer) await new Promise(r => testServer.close(r));
        await mongoose.disconnect();
        if (replSet) await replSet.stop();
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

    async function applyItemRequest(itemId, token = tokenA) {
        const res = await fetch(`${baseUrl}/api/authority/apply/${itemId}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const body = await res.json();
        return { status: res.status, body };
    }

    beforeEach(async () => {
        await configureLiveSourceSettings();
    });

    // =========================================================================
    // 1. SUCCESSFUL TRANSACTION COMMIT
    // =========================================================================
    it('1.1 executes atomic multi-document transaction committing Inventory, AuditLog, and RunItem together', async () => {
        const { inventory, item } = await createLiveApplyFixture();

        const res = await applyItemRequest(item._id);
        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data?.appliedFields?.length, 1);

        // Verify Inventory updated in DB
        const freshInv = await Inventory.findById(inventory._id);
        assert.equal(freshInv.authorityVerification?.fileNumber, 'FN-1234');
        assert.ok(freshInv.authorityVerification?.lastVerifiedAt);
        assert.ok(freshInv.authorityVerification?.applyClaimId);

        // Verify RunItem finalized in DB
        const freshItem = await PropertyVerificationRunItem.findById(item._id);
        assert.equal(freshItem.applied, true);
        assert.equal(freshItem.applyState, 'APPLIED');
        assert.equal(freshItem.applyClaim?.stage, 'COMPLETED');
        assert.equal(freshItem.applyClaim?.leaseExpiresAt, null);

        // Verify AuditLog record committed
        const audit = await AuditLog.findById(res.body.data?.auditId);
        assert.ok(audit);
        assert.equal(audit.eventType, 'authority_changes_applied');
        assert.equal(audit.targetId.toString(), inventory._id.toString());
    });

    // =========================================================================
    // 2. TRANSACTION ABORT ON AUDITLOG FAILURE
    // =========================================================================
    it('1.2 aborts entire transaction when AuditLog insertion fails, rolling back Inventory via MongoDB ACID', async () => {
        const { inventory, item } = await createLiveApplyFixture();

        // Inject AuditLog failure inside the transaction
        const origLogEntityUpdate = AuditLog.logEntityUpdate;
        AuditLog.logEntityUpdate = async function (...args) {
            throw new Error('SIMULATED_REPLSET_TRANSACTION_AUDIT_LOG_ERROR');
        };

        let res;
        try {
            res = await applyItemRequest(item._id);
        } finally {
            AuditLog.logEntityUpdate = origLogEntityUpdate;
        }

        // Verify Inventory update rolled back by transaction abort
        const freshInv = await Inventory.findById(inventory._id);
        assert.equal(freshInv.authorityVerification?.fileNumber ?? null, null, 'Inventory must be unmutated due to transaction abort');
        assert.equal(freshInv.authorityVerification?.applyClaimId ?? null, null);

        // Verify no applied AuditLog exists
        const audits = await AuditLog.find({
            eventType: 'authority_changes_applied',
            targetId: inventory._id.toString()
        });
        assert.equal(audits.length, 0, 'No applied audit log must be committed');

        // RunItem should be in FAILED / COMPENSATED state
        const freshItem = await PropertyVerificationRunItem.findById(item._id);
        assert.equal(freshItem.applied, false);
        assert.equal(freshItem.applyState, 'FAILED');
    });

    // =========================================================================
    // 3. TRANSACTION ABORT ON RUNITEM FINALIZATION FAILURE
    // =========================================================================
    it('1.3 aborts entire transaction when RunItem finalization fails, rolling back Inventory and AuditLog', async () => {
        const { inventory, item } = await createLiveApplyFixture();

        // Inject failure on the final RunItem update inside transaction
        const origUpdateOne = PropertyVerificationRunItem.updateOne;
        PropertyVerificationRunItem.updateOne = async function (...args) {
            const update = args[1] || {};
            if (update.$set && update.$set.applyState === 'APPLIED') {
                throw new Error('SIMULATED_REPLSET_TRANSACTION_RUNITEM_FINALIZATION_ERROR');
            }
            return origUpdateOne.apply(this, args);
        };

        let res;
        try {
            res = await applyItemRequest(item._id);
        } finally {
            PropertyVerificationRunItem.updateOne = origUpdateOne;
        }

        // Verify Inventory rolled back completely
        const freshInv = await Inventory.findById(inventory._id);
        assert.equal(freshInv.authorityVerification?.fileNumber ?? null, null);
        assert.equal(freshInv.authorityVerification?.applyClaimId ?? null, null);

        // Verify applied AuditLog rolled back by transaction abort
        const audits = await AuditLog.find({
            eventType: 'authority_changes_applied',
            targetId: inventory._id.toString(),
            status: { $ne: 'compensated' }
        });
        assert.equal(audits.length, 0, 'AuditLog must be rolled back by transaction abort');
    });

    // =========================================================================
    // 4. CONCURRENT DUPLICATE APPLY UNDER TRANSACTION ISOLATION
    // =========================================================================
    it('1.4 concurrent duplicate apply requests: exactly one commits (200) and other receives 409', async () => {
        const { inventory, item } = await createLiveApplyFixture();

        const [res1, res2] = await Promise.all([
            applyItemRequest(item._id),
            applyItemRequest(item._id)
        ]);

        const statuses = [res1.status, res2.status].sort();
        assert.deepEqual(statuses, [200, 409], 'Exactly one request must succeed (200) and one must receive 409');

        const freshInv = await Inventory.findById(inventory._id);
        assert.equal(freshInv.authorityVerification?.fileNumber, 'FN-1234');

        const freshItem = await PropertyVerificationRunItem.findById(item._id);
        assert.equal(freshItem.applied, true);
        assert.equal(freshItem.applyState, 'APPLIED');
    });

    // =========================================================================
    // 5. TRANSACTION INITIALIZATION FAILURE (AUTHORITY_REQUIRE_TRANSACTIONS=true)
    // =========================================================================
    it('1.5 strict fail-closed: returns 503 TRANSACTIONS_UNAVAILABLE when session startup fails with AUTHORITY_REQUIRE_TRANSACTIONS=true', async () => {
        const { item } = await createLiveApplyFixture();

        process.env.AUTHORITY_REQUIRE_TRANSACTIONS = 'true';

        // Mock mongoose.startSession to simulate session creation error
        const origStartSession = mongoose.startSession;
        mongoose.startSession = async function () {
            throw new Error('SIMULATED_REPLICA_SET_SESSION_CREATION_FAILURE');
        };

        try {
            const res = await applyItemRequest(item._id);
            assert.equal(res.status, 503, 'Must return HTTP 503 when session start fails under AUTHORITY_REQUIRE_TRANSACTIONS=true');
            assert.equal(res.body.code, 'TRANSACTIONS_UNAVAILABLE');
            assert.match(res.body.message, /Failed to initialize replica set transaction/);
        } finally {
            mongoose.startSession = origStartSession;
            delete process.env.AUTHORITY_REQUIRE_TRANSACTIONS;
        }
    });

    // =========================================================================
    // 6. MULTI-TENANT ISOLATION UNDER TRANSACTIONS
    // =========================================================================
    it('1.6 tenant isolation: Tenant B cannot apply Tenant A item under transaction isolation', async () => {
        const { inventory, item } = await createLiveApplyFixture();

        const res = await applyItemRequest(item._id, tokenB);
        assert.equal(res.status, 404, 'Cross-tenant apply must return 404');

        // Tenant A inventory remains completely untouched
        const freshInv = await Inventory.findById(inventory._id);
        assert.equal(freshInv.authorityVerification?.fileNumber ?? null, null);
        assert.equal(freshInv.authorityVerification?.applyClaimId ?? null, null);

        // Tenant A run item remains unapplied
        const freshItem = await PropertyVerificationRunItem.findById(item._id);
        assert.equal(freshItem.applied, false);
        assert.equal(freshItem.applyState, 'UNAPPLIED');
    });
});
