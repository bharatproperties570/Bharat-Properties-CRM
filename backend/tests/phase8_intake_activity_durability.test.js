process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Lead, { resolveLeadLookup } from '../models/Lead.js';
import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Inventory from '../models/Inventory.js';
import Project from '../models/Project.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Team from '../models/Team.js';
import Company from '../models/Company.js';
import OutboxEvent from '../models/OutboxEvent.js';
import AutomationLog from '../models/AutomationLog.js';
import SystemSetting from '../models/SystemSetting.js';

import intakeEngine, { invalidateProjectCache } from '../src/utils/intakeEngine.js';
import { createStandardizedLead } from '../services/LeadCreationEngine.js';
import { addActivity, updateActivity } from '../controllers/activity.controller.js';
import { validateExecutionAuthority } from '../src/utils/executionCoordinator.js';

describe('Phase 8 — Intake Engine Durable Convergence & Activity Durability Test Suite', () => {
    let replset;
    let adminRole;
    let testAdminUser;
    let testProject;

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
            dataScope: 'all',
            tenantId: user.tenantId || null
        }
    });

    const createMockRes = () => {
        const res = {
            statusCode: 200,
            data: null,
            headersSent: false,
            status(code) {
                if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT: Cannot set status after headers sent');
                this.statusCode = code;
                return this;
            },
            json(payload) {
                if (this.headersSent) throw new Error('ERR_HTTP_HEADERS_SENT: Cannot set headers after they are sent to the client');
                this.headersSent = true;
                this.data = payload;
                return this;
            }
        };
        return res;
    };

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000']
            }
        });
        await replset.waitUntilRunning();
        const uri = replset.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        // Pre-create collections to prevent DDL lock escalation inside transactions
        await Lead.createCollection();
        await Contact.createCollection();
        await Deal.createCollection();
        await Inventory.createCollection();
        await Project.createCollection();
        await Activity.createCollection();
        await Lookup.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Team.createCollection();
        await Company.createCollection();
        await OutboxEvent.createCollection();
        await AutomationLog.createCollection();
        await SystemSetting.createCollection();

        // Ensure minimal indexes upfront
        await OutboxEvent.ensureIndexes();
        await AutomationLog.ensureIndexes();

        // Seed Lookups
        await Lookup.create({ lookup_type: 'Source', lookup_value: 'WhatsApp' });
        await Lookup.create({ lookup_type: 'Status', lookup_value: 'New' });
        await Lookup.create({ lookup_type: 'Status', lookup_value: 'Available' });
        await Lookup.create({ lookup_type: 'DealStage', lookup_value: 'New' });
        await Lookup.create({ lookup_type: 'DealStage', lookup_value: 'Open' });
        await Lookup.create({ lookup_type: 'DealStage', lookup_value: 'Closed Lost' });

        // Seed Role and Admin User
        adminRole = await Role.create({
            name: 'super admin',
            department: 'sales',
            isSystemRole: true
        });

        testAdminUser = await User.create({
            fullName: 'Bharat Properties Super Admin',
            email: 'admin@bharatproperties.co',
            password: 'hashedpassword123',
            department: 'sales',
            role: adminRole._id,
            dataScope: 'all',
            isActive: true
        });

        // Seed Project for Intake
        testProject = await Project.create({
            name: 'Royal Palms Heights',
            description: 'Luxury residential township',
            status: 'Active'
        });
        invalidateProjectCache();
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        invalidateProjectCache();
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Inbound Buyer Lead Intake via LeadCreationEngine
    // ─────────────────────────────────────────────────────────────
    it('1. Intake: Buyer lead routes through LeadCreationEngine, resolving Contact and creating LeadCreated OutboxEvent', async () => {
        const payload = {
            mobile: '+919811122233',
            name: 'Vikram Malhotra',
            email: 'vikram.malhotra@example.com',
            message: 'Interested in buying a 3 BHK in Royal Palms Heights, price and brochure chahiye',
            source: 'WhatsApp'
        };

        const result = await intakeEngine.processIntake(payload);
        assert.equal(result.type, 'LEAD');
        assert.ok(result.data);
        assert.equal(result.data.mobile, '9811122233');

        // Verify Lead in DB
        const lead = await Lead.findById(result.data._id);
        assert.ok(lead, 'Lead document must exist in database');
        assert.equal(lead.firstName, 'Vikram');
        assert.equal(lead.lastName, 'Malhotra');
        assert.equal(lead.mobile, '9811122233');
        assert.ok(lead.contactDetails, 'Lead must have contactDetails linked');

        // Verify Contact was resolved/created and linked
        const contact = await Contact.findById(lead.contactDetails);
        assert.ok(contact, 'Linked Contact document must exist');
        assert.ok(contact.phones.some(p => p.number === '9811122233'), 'Contact phone must match');

        // Verify durable OutboxEvent creation
        const outboxEvent = await OutboxEvent.findOne({
            aggregateType: 'Lead',
            aggregateId: lead._id,
            eventType: 'LeadCreated'
        });
        assert.ok(outboxEvent, 'Durable LeadCreated OutboxEvent must be persisted');
        assert.equal(outboxEvent.provenance.source, 'WEBHOOK');
        assert.equal(outboxEvent.provenance.actorType, 'SYSTEM');
        assert.strictEqual(outboxEvent.tenantId || null, null, 'Single organisation tenantId must be null');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Intake Idempotency & Duplicate Suppression
    // ─────────────────────────────────────────────────────────────
    it('2. Intake: Suppresses duplicate inbound requests within dedup window without duplicate leads or events', async () => {
        const payload = {
            mobile: '+919822233344',
            name: 'Pooja Sharma',
            message: 'Interested in booking a 2 BHK apartment in Royal Palms Heights',
            source: 'WhatsApp'
        };

        const firstResult = await intakeEngine.processIntake(payload);
        assert.equal(firstResult.type, 'LEAD');

        // Second immediate call with exact same mobile and message
        const secondResult = await intakeEngine.processIntake(payload);
        assert.equal(secondResult.type, 'DUPLICATE');
        assert.equal(secondResult.message, 'Request already processed');

        // Verify only 1 Lead exists for this mobile
        const leadCount = await Lead.countDocuments({ mobile: '9822233344' });
        assert.equal(leadCount, 1, 'Only one Lead document must be created for duplicate intake');

        // Verify only 1 OutboxEvent exists
        const eventCount = await OutboxEvent.countDocuments({
            eventType: 'LeadCreated',
            aggregateId: firstResult.data._id
        });
        assert.equal(eventCount, 1, 'Only one OutboxEvent must be generated');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Inbound Seller Intent Creates Inventory, Contact, Deal and DealCreated OutboxEvent
    // ─────────────────────────────────────────────────────────────
    it('3. Intake: Seller scenario upserts Inventory, resolves Seller Contact, creates Deal and DealCreated OutboxEvent', async () => {
        const payload = {
            mobile: '+919833344455',
            name: 'Rajesh Verma',
            message: 'I want to sell my flat unit RPH-404 in Royal Palms Heights for sale price 85 lac',
            source: 'WhatsApp'
        };

        const result = await intakeEngine.processIntake(payload);
        assert.equal(result.type, 'DEAL');
        assert.ok(result.data, 'Deal data must be returned');

        // Verify Inventory document
        const inventory = await Inventory.findOne({
            projectId: testProject._id,
            $or: [{ unitNumber: 'RPH-404' }, { unitNo: 'RPH-404' }]
        });
        assert.ok(inventory, 'Inventory must be created or upserted');
        assert.ok(inventory.status, 'Inventory status must be populated');
        assert.equal(inventory.price.value, 8500000);

        // Verify Seller Contact linked to Inventory owners
        const sellerContact = await Contact.findOne({ 'phones.number': '9833344455' });
        assert.ok(sellerContact, 'Seller Contact must be resolved/created');
        assert.ok(inventory.owners.some(id => id.equals(sellerContact._id)), 'Inventory owners must include seller contact');

        // Verify Deal document
        const deal = await Deal.findById(result.data._id);
        assert.ok(deal, 'Deal document must exist in database');
        assert.equal(deal.price, 8500000);
        assert.equal(deal.inventoryId.toString(), inventory._id.toString());

        // Verify DealCreated OutboxEvent
        const dealEvent = await OutboxEvent.findOne({
            aggregateType: 'Deal',
            aggregateId: deal._id,
            eventType: 'DealCreated'
        });
        assert.ok(dealEvent, 'Durable DealCreated OutboxEvent must be persisted');
        assert.equal(dealEvent.payload.inventoryId.toString(), inventory._id.toString());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: External Transaction Session Propagation & Rollback Safety
    // ─────────────────────────────────────────────────────────────
    it('4. Intake: Propagates external Mongoose session correctly and rolls back on transaction abort', async () => {
        // Settle any background async promises from preceding intake
        await new Promise(resolve => setTimeout(resolve, 250));

        const session = await mongoose.startSession();
        let createdLeadId = null;

        await assert.rejects(async () => {
            await session.withTransaction(async () => {
                const payload = {
                    mobile: '+919844455566',
                    name: 'Rollback Tester',
                    message: 'Site visit for Royal Palms Heights 4 bhk',
                    source: 'Website'
                };

                const result = await intakeEngine.processIntake(payload, { session });
                assert.equal(result.type, 'LEAD');
                createdLeadId = result.data._id;

                // Explicit abort to simulate failure downstream in the caller's transaction
                throw new Error('SIMULATED_TRANSACTION_ABORT');
            });
        }, /SIMULATED_TRANSACTION_ABORT/);

        await session.endSession();

        // Verify nothing was committed to DB
        assert.ok(createdLeadId);
        const lead = await Lead.findById(createdLeadId);
        assert.strictEqual(lead, null, 'Lead must not exist after transaction rollback');

        const outbox = await OutboxEvent.findOne({ aggregateId: createdLeadId });
        assert.strictEqual(outbox, null, 'OutboxEvent must not exist after transaction rollback');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Activity Update Pre-Transaction 404 Validation
    // ─────────────────────────────────────────────────────────────
    it('5. Activity Update: Returns HTTP 404 cleanly before opening transaction when activity does not exist', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        const req = createMockReq({ id: nonExistentId.toString() }, { subject: 'Updated Subject' });
        const res = createMockRes();

        await updateActivity(req, res);

        assert.equal(res.statusCode, 404);
        assert.equal(res.data.success, false);
        assert.equal(res.data.error, 'Activity not found');
        assert.equal(res.headersSent, true);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Activity Update Transaction & Deal lastActivityAt Atomicity
    // ─────────────────────────────────────────────────────────────
    it('6. Activity Update: Updates Deal lastActivityAt within session and generates ActivityUpdated OutboxEvent', async () => {
        const deal = await Deal.create({
            name: 'Palm Residency Unit 5B',
            stage: 'Open',
            price: 7500000,
            lastActivityAt: new Date(Date.now() - 3600000) // 1 hour ago
        });

        const initialLastActivityAt = deal.lastActivityAt;

        const activity = await Activity.create({
            subject: 'Client Negotiation Call',
            type: 'Call',
            status: 'Scheduled',
            dueDate: new Date(),
            entityType: 'Deal',
            entityId: deal._id,
            assignedTo: testAdminUser._id
        });

        const req = createMockReq(
            { id: activity._id.toString() },
            {
                status: 'Completed',
                details: { outcome: 'Discussed pricing and revised payment milestones' }
            }
        );
        const res = createMockRes();

        await updateActivity(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.data.status, 'Completed');

        // Verify Deal lastActivityAt was updated
        const updatedDeal = await Deal.findById(deal._id);
        assert.ok(updatedDeal.lastActivityAt > initialLastActivityAt, 'Deal lastActivityAt must be updated');

        // Verify ActivityUpdated OutboxEvent
        const outboxEvent = await OutboxEvent.findOne({
            aggregateType: 'Activity',
            aggregateId: activity._id,
            eventType: 'ActivityUpdated'
        });
        assert.ok(outboxEvent, 'ActivityUpdated OutboxEvent must be persisted');
        assert.equal(outboxEvent.payload.statusChanged, true);
        assert.equal(outboxEvent.payload.previousStatus, 'Scheduled');
        assert.equal(outboxEvent.payload.newStatus, 'Completed');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Activity Stage Transition Propagation (No Variable Shadowing)
    // ─────────────────────────────────────────────────────────────
    it('7. Activity Update: Returns transition object without variable shadowing', async () => {
        const lead = await Lead.create({
            firstName: 'Aarav',
            lastName: 'Patel',
            mobile: '9855566677',
            stage: await resolveLeadLookup('Stage', 'Incoming')
        });

        const activity = await Activity.create({
            subject: 'First Discovery Call',
            type: 'Call',
            status: 'Pending',
            dueDate: new Date(),
            entityType: 'Lead',
            entityId: lead._id,
            assignedTo: testAdminUser._id
        });

        const req = createMockReq(
            { id: activity._id.toString() },
            {
                status: 'Completed',
                details: { callOutcome: 'Connected', completionResult: 'very interested' }
            }
        );
        const res = createMockRes();

        await updateActivity(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);
        assert.ok('transition' in res.data, 'Response data must include transition field');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Single-Organisation Guardrails & Tenant Isolation
    // ─────────────────────────────────────────────────────────────
    it('8. Single-Organisation Guardrail: Bharat Properties operates with null tenantId; explicit tenantId is preserved', async () => {
        // A. Default Single Organisation (Bharat Properties): tenantId is null
        const actReq = createMockReq(
            {},
            {
                subject: 'Site Visit Follow-up',
                type: 'Site Visit',
                status: 'Scheduled',
                dueDate: new Date(),
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId()
            }
        );
        const actRes = createMockRes();

        await addActivity(actReq, actRes);
        assert.equal(actRes.statusCode, 201);
        const actEvent = await OutboxEvent.findOne({
            aggregateId: actRes.data.data._id,
            eventType: 'ActivityCreated'
        });
        assert.ok(actEvent);
        assert.strictEqual(actEvent.tenantId || null, null, 'Bharat Properties OutboxEvent must have null tenantId');

        // B. Explicit tenant context preservation
        const customTenantId = new mongoose.Types.ObjectId();
        const tenantUser = {
            ...testAdminUser.toObject(),
            _id: new mongoose.Types.ObjectId(),
            tenantId: customTenantId
        };
        const tenantReq = createMockReq(
            {},
            {
                subject: 'Tenant Specific Activity',
                type: 'Meeting',
                status: 'Scheduled',
                dueDate: new Date(),
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId()
            },
            tenantUser
        );
        const tenantRes = createMockRes();

        await addActivity(tenantReq, tenantRes);
        assert.equal(tenantRes.statusCode, 201);
        const tenantActEvent = await OutboxEvent.findOne({
            aggregateId: tenantRes.data.data._id,
            eventType: 'ActivityCreated'
        });
        assert.ok(tenantActEvent);
        assert.equal(tenantActEvent.tenantId.toString(), customTenantId.toString(), 'Explicit tenantId must be preserved');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Execution Authority Coordination
    // ─────────────────────────────────────────────────────────────
    it('9. Execution Authority: LEGACY authority verified for intake and activity domains', async () => {
        const dealAuth = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.strictEqual(dealAuth.authorized, true);
        assert.strictEqual(dealAuth.owner, 'LEGACY');

        const leadAuth = await validateExecutionAuthority('LEGACY', 'lead_created');
        assert.strictEqual(leadAuth.authorized, true);

        const actAuth = await validateExecutionAuthority('LEGACY', 'activity_created');
        assert.strictEqual(actAuth.authorized, true);

        // Verify non-authoritative execution is rejected for coordinated event
        const shadowAuth = await validateExecutionAuthority('SHADOW_OUTBOX', 'deal_created');
        assert.strictEqual(shadowAuth.authorized, false, 'Shadow execution must be suppressed while LEGACY is authoritative');
        assert.strictEqual(shadowAuth.owner, 'LEGACY');
    });
});
