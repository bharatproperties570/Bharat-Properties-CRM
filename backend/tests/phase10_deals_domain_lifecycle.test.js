process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { addDeal, updateDeal, closeDeal, deleteDeal, verifyDeal } from '../controllers/deal.controller.js';

describe('Phase 10 — Deals Domain Lifecycle Hardening Suite', () => {
    let replset;
    let testAdminUser;
    let adminRole;
    let availableLookup;
    let activeLookup;
    let soldOutLookup;
    let blockedLookup;

    const createMockReq = (params = {}, body = {}, user = testAdminUser) => ({
        params,
        body,
        headers: {},
        user: {
            _id: user._id,
            id: user._id.toString(),
            name: user.fullName || 'Admin User',
            email: user.email,
            role: { name: 'super admin' },
            dataScope: 'all'
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
        // Start in-memory replica set for full transaction support
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri);

        // Pre-create collections to prevent DDL lock escalation inside multi-document transactions
        await Deal.createCollection();
        await Inventory.createCollection();
        await Activity.createCollection();
        await Lookup.createCollection();
        await User.createCollection();
        await Role.createCollection();
        const OutboxEvent = mongoose.model('OutboxEvent');
        await OutboxEvent.createCollection();
        const AutomationLog = mongoose.model('AutomationLog');
        await AutomationLog.createCollection();
        const SystemSetting = mongoose.model('SystemSetting');
        await SystemSetting.createCollection();

        // Seed Lookups for Inventory statuses
        availableLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Available' });
        activeLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Active' });
        soldOutLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Sold Out' });
        blockedLookup = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Blocked' });

        // Seed Role and Admin user with system owner privileges for unrestricted test visibility
        adminRole = await Role.create({
            name: 'super admin',
            department: 'sales',
            isSystemRole: true
        });

        testAdminUser = await User.create({
            fullName: 'Bharat Properties Super Admin',
            email: 'bharatproperties570@gmail.com',
            password: 'hashedpassword123',
            department: 'sales',
            role: adminRole._id,
            dataScope: 'all',
            isActive: true
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    it('1. Stage Validation: Rejects invalid deal stage enum with 400 Bad Request', async () => {
        const deal = await Deal.create({
            projectName: 'Validation Heights',
            unitNo: 'VH-101',
            stage: 'Open',
            stageHistory: [{ stage: 'Open', enteredAt: new Date() }]
        });

        const req = createMockReq({ id: deal._id.toString() }, { stage: 'INVALID_STAGE_NAME_XYZ' });
        const res = createMockRes();

        await updateDeal(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.data.success, false);
        assert.match(res.data.error, /Invalid deal stage/);

        // Verify stage in DB remained unchanged
        const freshDeal = await Deal.findById(deal._id).lean();
        assert.equal(freshDeal.stage, 'Open');
    });

    it('2. Stage Progression: Updates stage, stageChangedAt, and records stageHistory audit trail', async () => {
        const deal = await Deal.create({
            projectName: 'Audit Towers',
            unitNo: 'AT-202',
            stage: 'Open',
            stageHistory: [{ stage: 'Open', enteredAt: new Date(Date.now() - 3600000) }]
        });

        const req = createMockReq(
            { id: deal._id.toString() },
            { stage: 'Quote', triggeredBy: 'manual_override', reason: 'Official quote presented to buyer' }
        );
        const res = createMockRes();

        await updateDeal(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.data.stage, 'Quote');

        const updated = await Deal.findById(deal._id).lean();
        assert.equal(updated.stage, 'Quote');
        assert.ok(updated.stageChangedAt instanceof Date);
        assert.equal(updated.stageHistory.length, 2);

        // Previous stage closed
        const [firstStage, secondStage] = updated.stageHistory;
        assert.equal(firstStage.stage, 'Open');
        assert.ok(firstStage.exitedAt instanceof Date);
        assert.equal(typeof firstStage.daysInStage, 'number');

        // New stage active
        assert.equal(secondStage.stage, 'Quote');
        assert.equal(secondStage.triggeredBy, 'manual_override');
        assert.match(secondStage.reason, /Official quote presented/);
    });

    it('3. Closed Lost Transition: Normalizes loss metadata and creates Activity timeline entry', async () => {
        const inv = await Inventory.create({
            projectName: 'Loss Analysis Plaza',
            unitNo: 'LAP-303',
            status: activeLookup._id
        });

        const deal = await Deal.create({
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id,
            stage: 'Negotiation',
            stageHistory: [{ stage: 'Negotiation', enteredAt: new Date(Date.now() - 86400000 * 3) }]
        });

        const req = createMockReq(
            { id: deal._id.toString() },
            {
                stage: 'Closed Lost',
                lossReasons: ['Price Issue', 'Client postponed'],
                marketPrice: 6500000,
                reason: 'Budget mismatch with seller counter'
            }
        );
        const res = createMockRes();

        await updateDeal(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);

        const updated = await Deal.findById(deal._id).lean();
        assert.equal(updated.stage, 'Closed Lost');
        assert.equal(updated.closingDetails.isClosed, true);
        assert.deepEqual(updated.closingDetails.lossReasons, ['Price Issue', 'Client postponed']);
        assert.equal(updated.closingDetails.lostPrice, 6500000);
        assert.ok(updated.closingDetails.lostDate instanceof Date);

        // Verify Activity created on Inventory timeline
        const activity = await Activity.findOne({
            entityId: inv._id,
            entityType: 'Inventory'
        }).lean();

        assert.ok(activity, 'Activity record should be created on Inventory');
        assert.match(activity.subject, /Deal Lost after/);
        assert.equal(activity.status, 'Completed');
        assert.equal(activity.priority, 'Normal');

        // Verify Inventory status reverted to Available (single active deal lost)
        const updatedInv = await Inventory.findById(inv._id).lean();
        assert.equal(String(updatedInv.status), String(availableLookup._id));
    });

    it('4. Closed Won Transition: Syncs linked Inventory to Sold Out and captures closedPrice', async () => {
        const inv = await Inventory.create({
            projectName: 'Victory Greens',
            unitNo: 'VG-404',
            status: activeLookup._id
        });

        const deal = await Deal.create({
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id,
            stage: 'Negotiation'
        });

        const req = createMockReq(
            { id: deal._id.toString() },
            {
                stage: 'Closed Won',
                closedPrice: 9200000
            }
        );
        const res = createMockRes();

        await updateDeal(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);

        const updatedDeal = await Deal.findById(deal._id).lean();
        assert.equal(updatedDeal.stage, 'Closed Won');
        assert.equal(updatedDeal.closedPrice, 9200000);
        assert.equal(updatedDeal.closingDetails.isClosed, true);

        const updatedInv = await Inventory.findById(inv._id).lean();
        assert.equal(String(updatedInv.status), String(soldOutLookup._id));
    });

    it('5. Booked Transition: Syncs linked Inventory status to Blocked', async () => {
        const inv = await Inventory.create({
            projectName: 'Booking Residency',
            unitNo: 'BR-505',
            status: availableLookup._id
        });

        const deal = await Deal.create({
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id,
            stage: 'Open'
        });

        const req = createMockReq({ id: deal._id.toString() }, { stage: 'Booked' });
        const res = createMockRes();

        await updateDeal(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);

        const updatedInv = await Inventory.findById(inv._id).lean();
        assert.equal(String(updatedInv.status), String(blockedLookup._id));
    });

    it('6. Multiple Active Deals: Retains Inventory active status until all linked deals terminate', async () => {
        const inv = await Inventory.create({
            projectName: 'Multi-Deal Complex',
            unitNo: 'MDC-606',
            status: activeLookup._id
        });

        const dealA = await Deal.create({
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id,
            stage: 'Open'
        });

        const dealB = await Deal.create({
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id,
            stage: 'Negotiation'
        });

        // Cancel Deal A — Deal B is still active, so inventory must NOT revert to Available
        const reqA = createMockReq({ id: dealA._id.toString() }, { stage: 'Cancelled' });
        const resA = createMockRes();
        await updateDeal(reqA, resA);

        assert.equal(resA.statusCode, 200);
        let currentInv = await Inventory.findById(inv._id).lean();
        assert.notEqual(String(currentInv.status), String(availableLookup._id), 'Inventory must stay active while Deal B remains open');

        // Cancel Deal B — All active deals terminated, now inventory reverts to Available
        const reqB = createMockReq({ id: dealB._id.toString() }, { stage: 'Cancelled' });
        const resB = createMockRes();
        await updateDeal(reqB, resB);

        assert.equal(resB.statusCode, 200);
        currentInv = await Inventory.findById(inv._id).lean();
        assert.equal(String(currentInv.status), String(availableLookup._id), 'Inventory must revert to Available when all active deals terminate');
    });

    it('7. Duplicate Active Deal Protection: Rejects creation of duplicate active deal on same inventory', async () => {
        const inv = await Inventory.create({
            projectName: 'Dup Protection Enclave',
            unitNo: 'DPE-707',
            status: availableLookup._id
        });

        // Create first deal via addDeal controller
        const req1 = createMockReq({}, {
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id.toString(),
            price: 5000000,
            stage: 'Open'
        });
        const res1 = createMockRes();
        await addDeal(req1, res1);
        assert.equal(res1.statusCode, 201);
        assert.ok(res1.data.data);

        // Attempt second active deal on the same inventory unit
        const req2 = createMockReq({}, {
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id.toString(),
            price: 5200000,
            stage: 'Open'
        });
        const res2 = createMockRes();
        await addDeal(req2, res2);

        assert.equal(res2.statusCode, 409);
        assert.match(res2.data.error, /DUPLICATE DEAL DETECTED/);
    });

    it('8. Delete Deal Safety: Reverts Inventory status only when no remaining active deals exist', async () => {
        const inv = await Inventory.create({
            projectName: 'Delete Safe Court',
            unitNo: 'DSC-808',
            status: activeLookup._id
        });

        const deal = await Deal.create({
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id,
            stage: 'Open'
        });

        const req = createMockReq({ id: deal._id.toString() });
        const res = createMockRes();

        await deleteDeal(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);

        const checkDeal = await Deal.findById(deal._id).lean();
        assert.equal(checkDeal, null);

        const checkInv = await Inventory.findById(inv._id).lean();
        assert.equal(String(checkInv.status), String(availableLookup._id));
    });

    it('9. Deal Verification: Confirms status, updates tags, and writes Activity record', async () => {
        const deal = await Deal.create({
            projectName: 'Verification Manor',
            unitNo: 'VM-909',
            stage: 'Open',
            tags: ['Unverified', 'Luxury']
        });

        const req = createMockReq(
            { id: deal._id.toString() },
            { notes: 'Buyer verified via WhatsApp voice call', verificationMethod: 'phone_call' }
        );
        const res = createMockRes();

        await verifyDeal(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);

        const verified = await Deal.findById(deal._id).lean();
        assert.equal(verified.verificationStatus, 'confirmed');
        assert.equal(verified.isQualified, true);
        assert.ok(verified.tags.includes('Verified'));
        assert.ok(!verified.tags.includes('Unverified'));
        assert.match(verified.remarks, /\[Deal Verified\]/);

        // Verify Activity record
        const activity = await Activity.findOne({
            entityId: deal._id,
            entityType: 'Deal'
        }).lean();

        assert.ok(activity);
        assert.equal(activity.subject, 'Deal Verified');
        assert.equal(activity.status, 'Completed');
    });

    it('10. Official Close Endpoint: closeDeal transitions stage, records closedPrice, and marks Sold Out', async () => {
        const inv = await Inventory.create({
            projectName: 'Closing Garden',
            unitNo: 'CG-1010',
            status: activeLookup._id
        });

        const deal = await Deal.create({
            projectName: inv.projectName,
            unitNo: inv.unitNo,
            inventoryId: inv._id,
            stage: 'Negotiation'
        });

        const req = createMockReq(
            { id: deal._id.toString() },
            {
                checklist: { noc: true, keysHandedOver: true, finalPaymentReceived: true },
                remarks: 'Deal officially closed with registry completed',
                closedPrice: 11500000
            }
        );
        const res = createMockRes();

        await closeDeal(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);

        const closedDeal = await Deal.findById(deal._id).lean();
        assert.equal(closedDeal.stage, 'Closed');
        assert.equal(closedDeal.closedPrice, 11500000);
        assert.equal(closedDeal.closingDetails.isClosed, true);
        assert.equal(closedDeal.closingDetails.checklist.keysHandedOver, true);

        const closedInv = await Inventory.findById(inv._id).lean();
        assert.equal(String(closedInv.status), String(soldOutLookup._id));
    });
});
