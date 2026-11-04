process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Project from '../models/Project.js';
import Contact from '../models/Contact.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Lookup from '../models/Lookup.js';
import Activity from '../models/Activity.js';
import { importDeals } from '../controllers/deal.controller.js';
import { acquireLock, releaseLock, withLock, LockAcquisitionError, LockReleaseError } from '../utils/redisLock.js';

describe('Phase 12 — Bulk Deal Import Safety & Distributed Locking Suite', () => {
    let replset;
    let testAdminUser;
    let adminRole;
    let testProject;
    let testInventory;
    let availableLookup;
    let activeLookup;

    const createMockReq = (body = {}, user = testAdminUser) => ({
        body,
        headers: { 'x-correlation-id': 'test-correlation-p12' },
        user: {
            _id: user._id,
            id: user._id.toString(),
            name: user.fullName || 'Admin User',
            email: user.email,
            role: { name: 'super admin' },
            dataScope: 'all',
            tenantId: null
        }
    });

    const createMockRes = () => {
        const res = {
            statusCode: 200,
            data: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.data = payload;
                return this;
            }
        };
        return res;
    };

    before(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri);

        // Pre-create collections
        await Deal.createCollection();
        await Inventory.createCollection();
        await Project.createCollection();
        await Contact.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Lookup.createCollection();
        await Activity.createCollection();
        const OutboxEvent = mongoose.model('OutboxEvent');
        await OutboxEvent.createCollection();
        const AutomationLog = mongoose.model('AutomationLog');
        await AutomationLog.createCollection();
        const SystemSetting = mongoose.model('SystemSetting');
        await SystemSetting.createCollection();

        // Seed Lookups
        availableLookup = await Lookup.findOneAndUpdate(
            { lookup_type: 'Status', lookup_value: 'Available' },
            { lookup_type: 'Status', lookup_value: 'Available', is_active: true },
            { upsert: true, new: true }
        );
        activeLookup = await Lookup.findOneAndUpdate(
            { lookup_type: 'Status', lookup_value: 'Active' },
            { lookup_type: 'Status', lookup_value: 'Active', is_active: true },
            { upsert: true, new: true }
        );

        // Seed Role
        adminRole = await Role.create({
            name: 'super admin',
            department: 'sales',
            isSystemRole: true
        });

        // Seed User
        testAdminUser = await User.create({
            fullName: 'Bharat Properties Super Admin',
            email: 'bharatproperties570@gmail.com',
            password: 'hashedpassword123',
            department: 'sales',
            role: adminRole._id,
            dataScope: 'all',
            isActive: true
        });

        // Seed Project
        testProject = await Project.create({
            name: 'Grand Orchard',
            location: 'Sector 62, Gurgaon',
            status: 'Under Construction'
        });

        // Seed Inventory
        testInventory = await Inventory.create({
            projectName: testProject.name,
            projectId: testProject._id,
            block: 'Tower A',
            unitNo: 'A-101',
            status: availableLookup._id,
            price: 8500000
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    // ─────────────────────────────────────────────────────────────
    // 1. DISTRIBUTED LOCKING (redisLock.js)
    // ─────────────────────────────────────────────────────────────
    describe('1. Distributed Lock Engine (redisLock.js)', () => {
        it('1.1 should acquire and release lock with valid token', async () => {
            const lockKey = 'test-lock-deal-1';
            const handle = await acquireLock(lockKey, { ttl: 5000 });
            assert.ok(handle.token, 'Must return an ownership token');
            assert.strictEqual(handle.key, lockKey);

            // Releasing with valid handle should return true
            const released = await releaseLock(handle);
            assert.strictEqual(released, true);
        });

        it('1.2 should reject concurrent acquisition while lock is held', async () => {
            const lockKey = 'test-lock-deal-concurrent';
            const handle1 = await acquireLock(lockKey, { ttl: 5000 });

            // Concurrent attempt must throw LockAcquisitionError
            await assert.rejects(
                async () => {
                    await acquireLock(lockKey, { ttl: 5000 });
                },
                (err) => err instanceof LockAcquisitionError
            );

            // Release handle1
            await releaseLock(handle1);

            // Now second acquisition succeeds
            const handle2 = await acquireLock(lockKey, { ttl: 5000 });
            assert.ok(handle2.token);
            await releaseLock(handle2);
        });

        it('1.3 should reject release with mismatched token', async () => {
            const lockKey = 'test-lock-token-mismatch';
            const handle = await acquireLock(lockKey, { ttl: 5000 });

            // Wrong token release must throw LockReleaseError
            await assert.rejects(
                async () => {
                    await releaseLock({ key: lockKey, token: 'wrong-token-12345' });
                },
                (err) => err instanceof LockReleaseError
            );

            // Clean up with genuine handle
            await releaseLock(handle);
        });

        it('1.4 should execute callback within withLock and auto-release', async () => {
            const lockKey = 'test-lock-withlock';
            let executed = false;

            const result = await withLock(lockKey, { ttl: 5000 }, async (handle) => {
                assert.ok(handle.token);
                executed = true;
                return 'SUCCESS_PAYLOAD';
            });

            assert.strictEqual(executed, true);
            assert.strictEqual(result, 'SUCCESS_PAYLOAD');

            // Key must be free after withLock completes
            const handleAfter = await acquireLock(lockKey, { ttl: 5000 });
            assert.ok(handleAfter.token);
            await releaseLock(handleAfter);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. BULK DEAL IMPORT SAFETY (importDeals)
    // ─────────────────────────────────────────────────────────────
    describe('2. Bulk Deal Import Controller (importDeals)', () => {
        it('2.1 rejects non-array or invalid data format with 400', async () => {
            const req = createMockReq({ data: 'not-an-array' });
            const res = createMockRes();

            await importDeals(req, res);
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.data.success, false);
            assert.strictEqual(res.data.error, 'Invalid data format');
        });

        it('2.2 imports valid deals with bounded concurrency and returns structured results', async () => {
            // Create a second inventory unit for clean import
            const inv2 = await Inventory.create({
                projectName: testProject.name,
                projectId: testProject._id,
                block: 'Tower B',
                unitNo: 'B-202',
                status: availableLookup._id,
                price: 9500000
            });

            const req = createMockReq({
                data: [
                    {
                        projectName: testProject.name,
                        projectId: testProject._id.toString(),
                        inventoryId: inv2._id.toString(),
                        block: 'Tower B',
                        unitNo: 'B-202',
                        price: 9500000,
                        stage: 'Open',
                        ownerName: 'Seller Sharma',
                        ownerPhone: '9876543210'
                    }
                ]
            });
            const res = createMockRes();

            await importDeals(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.importedCount, 1);
            assert.strictEqual(res.data.duplicateCount, 0);
            assert.strictEqual(res.data.otherErrorCount, 0);
            assert.strictEqual(res.data.results[0].status, 'SUCCESS');
            assert.ok(res.data.results[0].dealId);

            // Verify deal document was persisted in MongoDB
            const createdDeal = await Deal.findById(res.data.results[0].dealId);
            assert.ok(createdDeal);
            assert.strictEqual(createdDeal.projectName, testProject.name);
            assert.strictEqual(createdDeal.unitNo, 'B-202');
            assert.strictEqual(createdDeal.stage, 'Open');
        });

        it('2.3 detects coordinate conflict: project mismatch between ID and name', async () => {
            const req = createMockReq({
                data: [
                    {
                        projectName: 'Mismatched Name Enclave',
                        projectId: testProject._id.toString(),
                        block: 'Tower A',
                        unitNo: 'A-101',
                        price: 5000000
                    }
                ]
            });
            const res = createMockRes();

            await importDeals(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.data.importedCount, 0);
            assert.strictEqual(res.data.otherErrorCount, 1);
            assert.strictEqual(res.data.results[0].status, 'FAILED');
            assert.strictEqual(res.data.results[0].errorCode, 'INVALID_PROJECT');
        });

        it('2.4 detects coordinate conflict: inventoryId block mismatch', async () => {
            const req = createMockReq({
                data: [
                    {
                        projectName: testProject.name,
                        projectId: testProject._id.toString(),
                        inventoryId: testInventory._id.toString(),
                        block: 'Wrong Block', // inventory is 'Tower A'
                        unitNo: 'A-101',
                        price: 8500000
                    }
                ]
            });
            const res = createMockRes();

            await importDeals(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.data.importedCount, 0);
            assert.strictEqual(res.data.otherErrorCount, 1);
            assert.strictEqual(res.data.results[0].status, 'FAILED');
            assert.strictEqual(res.data.results[0].errorCode, 'INVENTORY_COORDINATE_CONFLICT');
        });

        it('2.5 detects ambiguous inventory when multiple units match coordinates', async () => {
            // Seed two inventory units with duplicate coordinates (e.g. without block)
            const ambProject = await Project.create({ name: 'Ambiguous Hills' });
            await Inventory.create({ projectName: 'Ambiguous Hills', projectId: ambProject._id, unitNo: 'UNIT-DUP-1', status: availableLookup._id });
            await Inventory.create({ projectName: 'Ambiguous Hills', projectId: ambProject._id, unitNo: 'UNIT-DUP-1', status: availableLookup._id });

            const req = createMockReq({
                data: [
                    {
                        projectName: 'Ambiguous Hills',
                        unitNo: 'UNIT-DUP-1',
                        price: 6000000
                    }
                ]
            });
            const res = createMockRes();

            await importDeals(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.data.importedCount, 0);
            assert.strictEqual(res.data.otherErrorCount, 1);
            assert.strictEqual(res.data.results[0].status, 'FAILED');
            assert.strictEqual(res.data.results[0].errorCode, 'INVENTORY_AMBIGUOUS');
        });

        it('2.6 detects duplicate deal protection without failing entire batch', async () => {
            // Create a dedicated inventory unit
            const dupInv = await Inventory.create({
                projectName: testProject.name,
                projectId: testProject._id,
                block: 'Tower C',
                unitNo: 'C-303',
                status: availableLookup._id,
                price: 7000000
            });

            // Create first deal on this unit
            const req1 = createMockReq({
                data: [
                    {
                        projectName: testProject.name,
                        projectId: testProject._id.toString(),
                        inventoryId: dupInv._id.toString(),
                        block: 'Tower C',
                        unitNo: 'C-303',
                        price: 7000000,
                        stage: 'Open'
                    }
                ]
            });
            const res1 = createMockRes();
            await importDeals(req1, res1);
            assert.strictEqual(res1.data.importedCount, 1);

            // Now attempt to import batch containing:
            // Row 0: duplicate deal on dupInv
            // Row 1: fresh valid deal on a new inventory unit
            const freshInv = await Inventory.create({
                projectName: testProject.name,
                projectId: testProject._id,
                block: 'Tower D',
                unitNo: 'D-404',
                status: availableLookup._id,
                price: 8000000
            });

            const req2 = createMockReq({
                data: [
                    {
                        projectName: testProject.name,
                        projectId: testProject._id.toString(),
                        inventoryId: dupInv._id.toString(),
                        block: 'Tower C',
                        unitNo: 'C-303',
                        price: 7200000,
                        stage: 'Open'
                    },
                    {
                        projectName: testProject.name,
                        projectId: testProject._id.toString(),
                        inventoryId: freshInv._id.toString(),
                        block: 'Tower D',
                        unitNo: 'D-404',
                        price: 8000000,
                        stage: 'Open'
                    }
                ]
            });
            const res2 = createMockRes();
            await importDeals(req2, res2);

            assert.strictEqual(res2.statusCode, 200);
            assert.strictEqual(res2.data.importedCount, 1, 'Fresh deal must succeed');
            assert.strictEqual(res2.data.duplicateCount, 1, 'Duplicate deal must be counted in duplicateCount');
            assert.strictEqual(res2.data.results[0].status, 'FAILED');
            assert.strictEqual(res2.data.results[0].errorCode, 'DUPLICATE_INVENTORY');
            assert.strictEqual(res2.data.results[1].status, 'SUCCESS');
        });

        it('2.7 rejects inactive or non-existent assignedTo user', async () => {
            const fakeUserId = new mongoose.Types.ObjectId();
            const req = createMockReq({
                data: [
                    {
                        projectName: testProject.name,
                        unitNo: 'NONEXISTENT-UNIT',
                        price: 5000000,
                        assignedTo: fakeUserId.toString()
                    }
                ]
            });
            const res = createMockRes();

            await importDeals(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.data.importedCount, 0);
            assert.strictEqual(res.data.results[0].status, 'FAILED');
            assert.strictEqual(res.data.results[0].errorCode, 'INVALID_ASSIGNED_USER');
        });
    });
});
