process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Contact from '../models/Contact.js';
import Lead, { resolveLeadLookup } from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Booking from '../models/Booking.js';
import Inventory from '../models/Inventory.js';
import Conversation from '../models/Conversation.js';
import Company from '../models/Company.js';
import Activity from '../models/Activity.js';
import MergeAudit from '../models/MergeAudit.js';
import OutboxEvent from '../models/OutboxEvent.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Lookup from '../models/Lookup.js';

import { classifyGroup, previewMerge, executeMerge, rollbackMerge } from '../services/contactMerge.service.js';
import { mergeContacts, rollbackContactMerge, createContact } from '../controllers/contact.controller.js';

describe('Phase 4.6 — Contact Identity Deduplication & Reversible Merge Engine Test Suite', () => {
    let replset;
    let testAdminUser;
    let adminRole;

    const createMockReq = (params = {}, body = {}, query = {}, user = testAdminUser) => ({
        params,
        body,
        query,
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
        await Contact.createCollection();
        await Lead.createCollection();
        await Deal.createCollection();
        await Booking.createCollection();
        await Inventory.createCollection();
        await Conversation.createCollection();
        await Company.createCollection();
        await Activity.createCollection();
        await MergeAudit.createCollection();
        await OutboxEvent.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Lookup.createCollection();

        // Build Partial Unique Index on Contact
        await Contact.collection.createIndex(
            { "phones.number": 1 },
            {
                unique: true,
                partialFilterExpression: {
                    "phones.number": { $type: "string" },
                    isDeleted: false,
                    isMerged: false
                }
            }
        );

        // Minimal indexes for Outbox
        await OutboxEvent.collection.createIndex({ eventId: 1 }, { unique: true });

        // Seed Role and User
        adminRole = await Role.create({
            name: 'super admin',
            department: 'sales',
            isSystemRole: true
        });

        testAdminUser = await User.create({
            fullName: 'Bharat Properties Enterprise Admin',
            email: 'admin@bharatproperties.co',
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

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Duplicate Classification Engine
    // ─────────────────────────────────────────────────────────────
    it('1. Classification: Accurately classifies SAFE_AUTO_MERGE, DO_NOT_MERGE, and REVIEW_REQUIRED groups', () => {
        const owner1 = new mongoose.Types.ObjectId();
        const owner2 = new mongoose.Types.ObjectId();

        // Group A: Same name, same owner -> SAFE_AUTO_MERGE
        const groupA = [
            { _id: new mongoose.Types.ObjectId(), name: 'Rajesh Kumar', owner: owner1, createdAt: new Date(1000) },
            { _id: new mongoose.Types.ObjectId(), name: 'Rajesh Kumar', owner: owner1, createdAt: new Date(2000) }
        ];
        const resA = classifyGroup(groupA);
        assert.equal(resA.classification, 'SAFE_AUTO_MERGE');
        assert.equal(resA.reasons.length, 0);
        assert.equal(resA.canonical._id.toString(), groupA[0]._id.toString());

        // Group B: Conflicting names -> DO_NOT_MERGE
        const groupB = [
            { _id: new mongoose.Types.ObjectId(), name: 'Rajesh Kumar', owner: owner1, createdAt: new Date(1000) },
            { _id: new mongoose.Types.ObjectId(), name: 'Suresh Sharma', owner: owner1, createdAt: new Date(2000) }
        ];
        const resB = classifyGroup(groupB);
        assert.equal(resB.classification, 'DO_NOT_MERGE');
        assert.ok(resB.reasons.some(r => r.includes('Name Conflict')));

        // Group C: Same name, conflicting owners -> REVIEW_REQUIRED
        const groupC = [
            { _id: new mongoose.Types.ObjectId(), name: 'Pooja Verma', owner: owner1, createdAt: new Date(1000) },
            { _id: new mongoose.Types.ObjectId(), name: 'Pooja Verma', owner: owner2, createdAt: new Date(2000) }
        ];
        const resC = classifyGroup(groupC);
        assert.equal(resC.classification, 'REVIEW_REQUIRED');
        assert.ok(resC.reasons.some(r => r.includes('Ownership Conflict')));
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Partial Unique Index & Soft-Delete / Merged Bypass
    // ─────────────────────────────────────────────────────────────
    it('2. Partial Unique Index: Active contacts reject duplicate phone numbers; soft-deleted and merged bypass index', async () => {
        const sharedPhone = '9811122233';

        // 1. Create first active contact
        const contact1 = await Contact.create({
            name: 'Active Contact One',
            phones: [{ number: sharedPhone, type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });
        assert.ok(contact1._id);

        // 2. Second active contact with identical phone MUST fail unique index constraint (E11000)
        await assert.rejects(async () => {
            await Contact.create({
                name: 'Active Contact Two',
                phones: [{ number: sharedPhone, type: 'Personal' }],
                isDeleted: false,
                isMerged: false
            });
        }, /E11000.*duplicate key error/);

        // 3. Soft-deleted contact with same phone MUST succeed (partial index filter: isDeleted: false)
        const softDeleted = await Contact.create({
            name: 'Soft Deleted Contact',
            phones: [{ number: sharedPhone, type: 'Personal' }],
            isDeleted: true,
            isMerged: false
        });
        assert.ok(softDeleted._id);

        // 4. Merged contact with same phone MUST succeed (partial index filter: isMerged: false)
        const mergedContact = await Contact.create({
            name: 'Merged Contact',
            phones: [{ number: sharedPhone, type: 'Personal' }],
            isDeleted: false,
            isMerged: true,
            mergedInto: contact1._id
        });
        assert.ok(mergedContact._id);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Comprehensive Reference Rewiring & Field Consolidation
    // ─────────────────────────────────────────────────────────────
    it('3. Reference Rewiring: Merging rewires Leads, Deals, Bookings, Inventory, Activities, Conversations, and Companies', async () => {
        // Setup Master & Duplicate
        const master = await Contact.create({
            name: 'Vikram Malhotra',
            phones: [{ number: '9822233344', type: 'Personal' }],
            emails: [{ address: 'vikram@malhotra.in', type: 'Personal' }],
            tags: ['VIP'],
            company: null, // to be consolidated from duplicate
            isDeleted: false,
            isMerged: false
        });

        const duplicate = await Contact.create({
            name: 'Vikram Malhotra',
            phones: [{ number: '9822233355', type: 'Work' }],
            emails: [{ address: 'vikram.work@malhotra.in', type: 'Work' }],
            tags: ['Investor', 'VIP'],
            company: 'Malhotra Enterprises',
            designation: 'Managing Director',
            isDeleted: false,
            isMerged: false
        });

        // 1. Lead referencing duplicate
        const lead = await Lead.create({
            firstName: 'Vikram',
            lastName: 'Malhotra',
            mobile: '9822233344',
            contactDetails: duplicate._id
        });

        // 2. Deal referencing duplicate in root fields and partyStructure
        const deal = await Deal.create({
            name: 'Luxury Villa 12',
            price: 15000000,
            stage: 'Open',
            owner: duplicate._id,
            buyer: duplicate._id,
            channelPartner: duplicate._id,
            associatedContact: duplicate._id,
            partyStructure: { owner: duplicate._id }
        });

        // 3. Booking referencing duplicate
        const booking = await Booking.create({
            deal: deal._id,
            bookingNumber: 'BK-9901',
            lead: duplicate._id,
            seller: duplicate._id,
            channelPartner: duplicate._id,
            status: 'Booked'
        });

        // 4. Inventory referencing duplicate in owners, associates, and ownerHistory
        const inventory = await Inventory.create({
            name: 'Tower A Unit 101',
            owners: [duplicate._id],
            associates: [{ contact: duplicate._id, relationship: 'Owner Rep' }],
            ownerHistory: [{ contactId: duplicate._id, contactName: 'Vikram Malhotra' }]
        });

        // 5. Activity referencing duplicate in entityId and relatedTo
        const activity = await Activity.create({
            type: 'Call',
            subject: 'Meeting with Vikram',
            dueDate: new Date(),
            entityType: 'Contact',
            entityId: duplicate._id,
            relatedTo: [{ id: duplicate._id, model: 'Contact' }]
        });

        // 6. Conversation referencing duplicate
        const conversation = await Conversation.create({
            contact: duplicate._id,
            channel: 'whatsapp',
            phoneNumber: '9822233344'
        });

        // 7. Company referencing duplicate in employees array
        const company = await Company.create({
            name: 'Malhotra Enterprises Ltd',
            employees: [duplicate._id]
        });

        // Execute Merge via contactMerge.service
        const preview = await previewMerge(master, duplicate);
        assert.ok(preview.referenceRewires.length >= 7, 'Preview must identify all entity references');

        const audit = await executeMerge(master._id, duplicate._id, preview, { userId: testAdminUser._id });
        assert.equal(audit.status, 'COMPLETED');
        assert.ok(audit.mergeOperationId);

        // Verify Consolidation on Master
        const updatedMaster = await Contact.findById(master._id);
        assert.equal(updatedMaster.company, 'Malhotra Enterprises');
        assert.equal(updatedMaster.designation.toString(), duplicate.designation.toString());
        assert.equal(updatedMaster.phones.length, 2);
        assert.equal(updatedMaster.emails.length, 2);
        assert.ok(updatedMaster.tags.includes('Investor'));

        // Verify Duplicate is Merged
        const updatedDuplicate = await Contact.findOne({ _id: duplicate._id }, null, { includeDeleted: true });
        assert.equal(updatedDuplicate.isMerged, true);
        assert.equal(updatedDuplicate.isDeleted, true);
        assert.equal(updatedDuplicate.mergedInto.toString(), master._id.toString());

        // Verify Reference Rewires:
        // 1. Lead
        const updatedLead = await Lead.findById(lead._id);
        assert.equal(updatedLead.contactDetails.toString(), master._id.toString());

        // 2. Deal
        const updatedDeal = await Deal.findById(deal._id);
        assert.equal(updatedDeal.owner.toString(), master._id.toString());
        assert.equal(updatedDeal.buyer.toString(), master._id.toString());
        assert.equal(updatedDeal.channelPartner.toString(), master._id.toString());
        assert.equal(updatedDeal.associatedContact.toString(), master._id.toString());
        assert.equal(updatedDeal.partyStructure.owner.toString(), master._id.toString());

        // 3. Booking
        const updatedBooking = await Booking.findById(booking._id);
        assert.equal(updatedBooking.lead.toString(), master._id.toString());
        assert.equal(updatedBooking.seller.toString(), master._id.toString());
        assert.equal(updatedBooking.channelPartner.toString(), master._id.toString());

        // 4. Inventory
        const updatedInv = await Inventory.findById(inventory._id);
        assert.ok(updatedInv.owners.some(id => id.equals(master._id)));
        assert.ok(!updatedInv.owners.some(id => id.equals(duplicate._id)));
        assert.equal(updatedInv.associates[0].contact.toString(), master._id.toString());
        assert.equal(updatedInv.ownerHistory[0].contactId.toString(), master._id.toString());

        // 5. Activity
        const updatedAct = await Activity.findById(activity._id);
        assert.equal(updatedAct.entityId.toString(), master._id.toString());
        assert.equal(updatedAct.relatedTo[0].id.toString(), master._id.toString());

        // 6. Conversation
        const updatedConvo = await Conversation.findById(conversation._id);
        assert.equal(updatedConvo.contact.toString(), master._id.toString());

        // 7. Company
        const updatedComp = await Company.findById(company._id);
        assert.ok(updatedComp.employees.some(id => id.equals(master._id)));
        assert.ok(!updatedComp.employees.some(id => id.equals(duplicate._id)));

        // 8. Durable Outbox Event
        const outboxEvent = await OutboxEvent.findOne({
            eventType: 'ContactMerged',
            aggregateId: master._id
        });
        assert.ok(outboxEvent, 'ContactMerged OutboxEvent must be persisted');
        assert.equal(outboxEvent.payload.mergeOperationId, audit.mergeOperationId);
        assert.equal(outboxEvent.provenance.source, 'HTTP');
        assert.equal(outboxEvent.provenance.actorType, 'HUMAN');
        assert.strictEqual(outboxEvent.tenantId || null, null, 'Single organisation tenantId must be null');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Lineage Flattening (Multi-Hop Pointer Prevention)
    // ─────────────────────────────────────────────────────────────
    it('4. Lineage Flattening: Merging a contact that previously absorbed other duplicates flattens all pointers directly to master', async () => {
        // Setup Master A, Duplicate B, and Leaf Duplicate C
        const contactA = await Contact.create({
            name: 'Sunil Gupta',
            phones: [{ number: '9833344455', type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        const contactB = await Contact.create({
            name: 'Sunil Gupta',
            phones: [{ number: '9833344466', type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        // Contact C was already merged into Contact B
        const contactC = await Contact.create({
            name: 'Sunil Gupta',
            phones: [{ number: '9833344477', type: 'Personal' }],
            isDeleted: true,
            isMerged: true,
            mergedInto: contactB._id
        });

        // Execute merge of B into A
        const preview = await previewMerge(contactA, contactB);
        const audit = await executeMerge(contactA._id, contactB._id, preview, { userId: testAdminUser._id });

        assert.equal(audit.status, 'COMPLETED');

        // Contact B must now point to A
        const updatedB = await Contact.findOne({ _id: contactB._id }, null, { includeDeleted: true });
        assert.equal(updatedB.mergedInto.toString(), contactA._id.toString());

        // Contact C MUST have its lineage flattened to point directly to A (not dangling to B)
        const updatedC = await Contact.findOne({ _id: contactC._id }, null, { includeDeleted: true });
        assert.equal(updatedC.mergedInto.toString(), contactA._id.toString(), 'Leaf contact lineage must be flattened directly to Master');
        assert.ok(audit.flattenedContactIds.some(id => id.equals(contactC._id)), 'Flattened IDs must be recorded in MergeAudit');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Full Reversible Merge (Rollback Engine)
    // ─────────────────────────────────────────────────────────────
    it('5. Reversible Merge: Rolling back restores duplicate state, un-consolidates fields, restores rewires and lineage without Code 40 errors', async () => {
        const master = await Contact.create({
            name: 'Anita Roy',
            phones: [{ number: '9844455566', type: 'Personal' }],
            company: null,
            designation: null,
            isDeleted: false,
            isMerged: false
        });

        const duplicate = await Contact.create({
            name: 'Anita Roy',
            phones: [{ number: '9844455577', type: 'Personal' }],
            company: 'Roy Technologies',
            designation: 'CEO',
            isDeleted: false,
            isMerged: false
        });

        const lead = await Lead.create({
            firstName: 'Anita',
            mobile: '9844455577',
            contactDetails: duplicate._id
        });

        const inv = await Inventory.create({
            name: 'Villa 55',
            owners: [duplicate._id]
        });

        // Merge
        const preview = await previewMerge(master, duplicate);
        const audit = await executeMerge(master._id, duplicate._id, preview, { userId: testAdminUser._id });
        assert.equal(audit.status, 'COMPLETED');

        // Verify state post-merge
        const postMaster = await Contact.findById(master._id);
        assert.equal(postMaster.company, 'Roy Technologies');
        assert.equal(postMaster.designation.toString(), duplicate.designation.toString());

        const postLead = await Lead.findById(lead._id);
        assert.equal(postLead.contactDetails.toString(), master._id.toString());

        // Now Rollback!
        const rolledBackAudit = await rollbackMerge(audit.mergeOperationId);
        assert.equal(rolledBackAudit.status, 'ROLLED_BACK');
        assert.equal(rolledBackAudit.rollbackAvailable, false);

        // 1. Verify Duplicate is restored
        const restoredDup = await Contact.findById(duplicate._id);
        assert.equal(restoredDup.isDeleted, false);
        assert.equal(restoredDup.isMerged, false);
        assert.strictEqual(restoredDup.mergedInto, undefined);

        // 2. Verify Master fields are un-consolidated
        const restoredMaster = await Contact.findById(master._id);
        assert.ok(!restoredMaster.company, 'Company must be un-consolidated');
        assert.ok(!restoredMaster.designation, 'Designation must be un-consolidated');

        // 3. Verify References are reverted to duplicate
        const restoredLead = await Lead.findById(lead._id);
        assert.equal(restoredLead.contactDetails.toString(), duplicate._id.toString());

        const restoredInv = await Inventory.findById(inv._id);
        assert.ok(restoredInv.owners.some(id => id.equals(duplicate._id)));
        assert.ok(!restoredInv.owners.some(id => id.equals(master._id)));

        // 4. Repeated Rollback attempt must fail
        await assert.rejects(async () => {
            await rollbackMerge(audit.mergeOperationId);
        }, /Invalid or uncompleted audit record|Rollback not available/);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Controller API Layer (mergeContacts & rollbackContactMerge)
    // ─────────────────────────────────────────────────────────────
    it('6. Controller API: mergeContacts executes multi-merge and rollbackContactMerge cleanly reverts via HTTP', async () => {
        const master = await Contact.create({
            name: 'Karan Mehra',
            phones: [{ number: '9855566677', type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        const dup1 = await Contact.create({
            name: 'Karan Mehra',
            phones: [{ number: '9855566688', type: 'Personal' }],
            designation: 'Architect',
            isDeleted: false,
            isMerged: false
        });

        // Call mergeContacts via mock HTTP req/res
        const mergeReq = createMockReq(
            {},
            {
                masterContactId: master._id.toString(),
                duplicateContactIds: [dup1._id.toString()],
                resolvedData: { designation: 'Principal Architect' }
            }
        );
        const mergeRes = createMockRes();

        await mergeContacts(mergeReq, mergeRes, err => { if (err) throw err; });

        assert.equal(mergeRes.statusCode, 200);
        assert.equal(mergeRes.data.success, true);
        assert.equal(mergeRes.data.audits.length, 1);

        const opId = mergeRes.data.audits[0];

        // Call rollbackContactMerge via mock HTTP req/res
        const rollbackReq = createMockReq({ mergeOperationId: opId });
        const rollbackRes = createMockRes();

        await rollbackContactMerge(rollbackReq, rollbackRes, err => { if (err) throw err; });

        assert.equal(rollbackRes.statusCode, 200);
        assert.equal(rollbackRes.data.success, true);
        assert.equal(rollbackRes.data.audit.status, 'ROLLED_BACK');

        // Verify duplicate is active again
        const restored = await Contact.findById(dup1._id);
        assert.equal(restored.isMerged, false);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Concurrent Duplicate Creation Returns HTTP 409 Conflict
    // ─────────────────────────────────────────────────────────────
    it('7. Duplicate Guard: createContact returns HTTP 409 Conflict when phone number already exists', async () => {
        const existingPhone = '9866677788';
        await Contact.create({
            name: 'Existing Client',
            phones: [{ number: existingPhone, type: 'Personal' }],
            isDeleted: false,
            isMerged: false
        });

        const req = createMockReq({}, {
            name: 'New Duplicate Candidate',
            phones: [{ number: existingPhone, type: 'Work' }]
        });
        const res = createMockRes();

        await createContact(req, res, err => { if (err) throw err; });

        assert.equal(res.statusCode, 409);
        assert.equal(res.data.success, false);
        assert.ok(res.data.message.includes('already exists'));
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Single-Organisation Guardrails
    // ─────────────────────────────────────────────────────────────
    it('8. Single-Organisation: Contact merge operates cleanly with null tenantId and preserves explicit tenant', async () => {
        // Single Org: null tenant
        const c1 = await Contact.create({ name: 'Single Org Alpha', phones: [{ number: '9877788899' }], isDeleted: false, isMerged: false, tenantId: null });
        const c2 = await Contact.create({ name: 'Single Org Beta', phones: [{ number: '9877788800' }], isDeleted: false, isMerged: false, tenantId: null });

        const previewSingle = await previewMerge(c1, c2);
        const auditSingle = await executeMerge(c1._id, c2._id, previewSingle);
        assert.equal(auditSingle.status, 'COMPLETED');

        const outboxSingle = await OutboxEvent.findOne({ aggregateId: c1._id, eventType: 'ContactMerged' });
        assert.strictEqual(outboxSingle.tenantId || null, null);

        // Explicit Tenant: preserved
        const tenantId = new mongoose.Types.ObjectId();
        const c3 = await Contact.create({ name: 'Tenant Alpha', phones: [{ number: '9888899911' }], isDeleted: false, isMerged: false, tenantId });
        const c4 = await Contact.create({ name: 'Tenant Beta', phones: [{ number: '9888899922' }], isDeleted: false, isMerged: false, tenantId });

        const previewTenant = await previewMerge(c3, c4);
        const auditTenant = await executeMerge(c3._id, c4._id, previewTenant, { tenantId });
        assert.equal(auditTenant.status, 'COMPLETED');

        const outboxTenant = await OutboxEvent.findOne({ aggregateId: c3._id, eventType: 'ContactMerged' });
        assert.equal(outboxTenant.tenantId.toString(), tenantId.toString());
    });
});
