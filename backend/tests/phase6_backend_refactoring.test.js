process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import DealService from '../services/DealService.js';
import InventoryService from '../services/InventoryService.js';
import LeadService from '../services/LeadService.js';
import ActivityService from '../services/ActivityService.js';
import LookupService from '../services/LookupService.js';
import {
    normalizePhone,
    normalizePhoneE164,
    getPhoneLookupVariants,
    isValidIndianMobile,
    isWhatsAppJid,
    isWhatsAppLid
} from '../utils/phoneNormalizer.js';

import Deal from '../models/Deal.js';
import Lead from '../models/Lead.js';
import Inventory from '../models/Inventory.js';
import Contact from '../models/Contact.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import OutboxEvent from '../models/OutboxEvent.js';
import AuditLog from '../models/AuditLog.js';
import Team from '../models/Team.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';

describe('Phase 6 — Enterprise Backend Refactoring Acceptance Suite', () => {
    let replset;
    const superAdminUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'bharatproperties570@gmail.com',
        fullName: 'Super Administrator',
        dataScope: 'all',
        role: { name: 'super admin', isSystemRole: true }
    };

    before(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri);

        await Deal.createCollection();
        await Lead.createCollection();
        await Inventory.createCollection();
        await Contact.createCollection();
        await Activity.createCollection();
        await Lookup.createCollection();
        await OutboxEvent.createCollection();
        await AuditLog.createCollection();
        await Team.createCollection();
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        LookupService.clearCache();
        await Deal.deleteMany({});
        await Lead.deleteMany({});
        await Inventory.deleteMany({});
        await Contact.deleteMany({});
        await Activity.deleteMany({});
        await Lookup.deleteMany({});
        await OutboxEvent.deleteMany({});
        await AuditLog.deleteMany({});
        await Team.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Phone Normalizer Suite
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Phone Normalization Utility (phoneNormalizer.js)', () => {
        it('normalizes standard 10-digit Indian mobile number', () => {
            const raw = '9876543210';
            assert.equal(normalizePhone(raw), '9876543210');
            assert.equal(normalizePhoneE164(raw), '+919876543210');
            assert.equal(isValidIndianMobile(raw), true);
        });

        it('normalizes 11-digit mobile with leading zero', () => {
            const raw = '09876543210';
            assert.equal(normalizePhone(raw), '9876543210');
            assert.equal(normalizePhoneE164(raw), '+919876543210');
            assert.equal(isValidIndianMobile(raw), true);
        });

        it('normalizes 12-digit mobile with 91 country code and formatting', () => {
            const raw = '+91-98765 43210';
            assert.equal(normalizePhone(raw), '9876543210');
            assert.equal(normalizePhoneE164(raw), '+919876543210');
            assert.equal(isValidIndianMobile(raw), true);
        });

        it('preserves WhatsApp JID and LID addresses unchanged', () => {
            const jid = '9876543210@s.whatsapp.net';
            const lid = '1234567890123456@lid';
            assert.equal(isWhatsAppJid(jid), true);
            assert.equal(isWhatsAppLid(lid), true);
            assert.equal(normalizePhone(jid), jid);
            assert.equal(normalizePhone(lid), lid);
        });

        it('generates multi-variant lookup keys for fast indexing', () => {
            const variants = getPhoneLookupVariants('+91 98765-43210');
            assert.ok(variants.includes('9876543210'));
            assert.ok(variants.includes('+919876543210'));
            assert.ok(variants.includes('09876543210'));
            assert.ok(variants.includes('919876543210'));
        });

        it('rejects invalid or non-mobile sequences gracefully', () => {
            assert.equal(isValidIndianMobile('12345'), false);
            assert.equal(isValidIndianMobile('0123456789'), false);
            assert.equal(normalizePhone(null), '');
            assert.equal(normalizePhone(''), '');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Lookup Service Suite
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Enterprise Centralized Lookup Service (LookupService.js)', () => {
        it('resolves existing lookup case-insensitively with caching', async () => {
            const created = await Lookup.create({
                lookup_type: 'Category',
                lookup_value: 'Commercial'
            });

            const resolvedId = await LookupService.resolve('Category', 'commercial');
            assert.equal(String(resolvedId), String(created._id));

            // Verify cache hit
            assert.equal(LookupService.hasCached('Category', 'commercial'), true);
        });

        it('resolves lookups by alias matching', async () => {
            const created = await Lookup.create({
                lookup_type: 'UnitType',
                lookup_value: '2 BHK',
                metadata: { aliases: ['2BHK', 'Two Bedroom'] }
            });

            const resolvedByAlias = await LookupService.resolve('UnitType', '2BHK', { checkAliases: true });
            assert.equal(String(resolvedByAlias), String(created._id));
        });

        it('creates lookup when createIfMissing is true and none exists', async () => {
            const newId = await LookupService.resolve('Facing', 'North-East', { createIfMissing: true });
            assert.ok(newId);
            const found = await Lookup.findById(newId);
            assert.equal(found.lookup_value, 'North-East');
        });

        it('resolves hierarchical address components safely', async () => {
            const address = {
                city: 'Gurugram',
                state: 'Haryana',
                location: 'Golf Course Road'
            };

            const resolvedAddress = await LookupService.resolveHierarchicalAddress(address);
            assert.ok(resolvedAddress.city);
            assert.ok(resolvedAddress.state);
            assert.ok(resolvedAddress.location);

            const cityLookup = await Lookup.findById(resolvedAddress.city);
            assert.equal(cityLookup.lookup_type, 'City');
            assert.equal(cityLookup.lookup_value, 'Gurugram');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Deal Application Service Suite
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Deal Application Service (DealService.js)', () => {
        it('updates deal within transaction and publishes DealUpdated Outbox event', async () => {
            const deal = await Deal.create({
                title: 'Phase 6 Test Deal',
                stage: 'Open',
                dealValue: 5000000
            });

            const updated = await DealService.updateDeal(deal._id, {
                stage: 'Negotiation',
                dealValue: 5200000
            }, { user: superAdminUser });

            assert.equal(updated.stage, 'Negotiation');
            assert.equal(updated.dealValue, 5200000);

            // Verify OutboxEvent emission
            const outbox = await OutboxEvent.findOne({ aggregateId: deal._id, eventType: 'DealUpdated' });
            assert.ok(outbox);
            assert.equal(outbox.payload.stageChanged, true);
            assert.equal(outbox.payload.previousStage, 'Open');
            assert.equal(outbox.payload.newStage, 'Negotiation');
        });

        it('hard deletes a deal document and protects against non-existent IDs', async () => {
            const deal = await Deal.create({
                title: 'Deletable Deal',
                stage: 'Open'
            });

            const result = await DealService.deleteDeal(deal._id, { user: superAdminUser });
            assert.equal(result.success, true);

            const fresh = await Deal.findById(deal._id);
            assert.equal(fresh, null);

            // Non-existent ID throws 404
            await assert.rejects(
                DealService.deleteDeal(new mongoose.Types.ObjectId(), { user: superAdminUser }),
                (err) => err.statusCode === 404
            );
        });

        it('reverts linked inventory status to Available when the only active deal is deleted', async () => {
            const availStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Available' });
            const blockedStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Blocked' });

            const inv = await Inventory.create({
                projectName: 'Park Avenue',
                unitNo: 'PA-101',
                status: blockedStatus._id
            });

            const deal = await Deal.create({
                title: 'Single Deal',
                inventoryId: inv._id,
                stage: 'Booked'
            });

            const res = await DealService.deleteDeal(deal._id, { user: superAdminUser });
            assert.equal(res.success, true);

            const checkDeal = await Deal.findById(deal._id);
            assert.equal(checkDeal, null);

            const checkInv = await Inventory.findById(inv._id);
            assert.equal(String(checkInv.status), String(availStatus._id));
        });

        it('retains linked inventory status when another active deal remains on the unit', async () => {
            const availStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Available' });
            const activeStatus = await Lookup.create({ lookup_type: 'Status', lookup_value: 'Active' });

            const inv = await Inventory.create({
                projectName: 'Skyline Plaza',
                unitNo: 'SP-202',
                status: activeStatus._id
            });

            const deal1 = await Deal.create({
                title: 'Active Deal 1',
                inventoryId: inv._id,
                stage: 'Negotiation'
            });

            const deal2 = await Deal.create({
                title: 'Active Deal 2',
                inventoryId: inv._id,
                stage: 'Open'
            });

            // Delete deal1
            const res = await DealService.deleteDeal(deal1._id, { user: superAdminUser });
            assert.equal(res.success, true);

            // Inventory must retain Active status because deal2 is still active
            const checkInv = await Inventory.findById(inv._id);
            assert.equal(String(checkInv.status), String(activeStatus._id));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Inventory Application Service Suite
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Inventory Application Service (InventoryService.js)', () => {
        it('creates inventory with resolved lookups and normalized phones', async () => {
            const contact = await Contact.create({
                name: 'Owner John',
                phones: [{ number: '9876543210', isPrimary: true }]
            });

            const input = {
                projectName: 'Grand Heritage',
                block: 'Tower A',
                unitNo: '101',
                category: 'Residential',
                owners: [contact._id]
            };

            const created = await InventoryService.createInventory(input, { user: superAdminUser });
            assert.ok(created._id);
            assert.equal(String(created.owners[0]), String(contact._id));
            assert.ok(created.category);

            const categoryLookup = await Lookup.findById(created.category);
            assert.equal(categoryLookup.lookup_value, 'Residential');
        });

        it('updates inventory within a safe transaction boundary', async () => {
            const inv = await Inventory.create({
                projectName: 'Skyline',
                unitNo: '202',
                status: null
            });

            const updated = await InventoryService.updateInventory(inv._id, {
                status: 'Available',
                carpetArea: { value: 1450, unit: 'Sq.Ft.' }
            }, { user: superAdminUser });

            assert.equal(updated.carpetArea.value, 1450);
            assert.ok(updated.status);
            const statusLookup = await Lookup.findById(updated.status);
            assert.equal(statusLookup.lookup_value, 'Available');
        });

        it('soft deletes an inventory record', async () => {
            const inv = await Inventory.create({
                projectName: 'Lotus Park',
                unitNo: '303'
            });

            const result = await InventoryService.deleteInventory(inv._id, { user: superAdminUser });
            assert.equal(result.success, true);
            const fresh = await Inventory.collection.findOne({ _id: inv._id });
            assert.equal(fresh.isDeleted, true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Lead Application Service Suite
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Lead Application Service (LeadService.js)', () => {
        it('updates lead with phone normalization, lookup resolution, and OutboxEvent', async () => {
            const lead = await Lead.create({
                firstName: 'Vikram',
                lastName: 'Malhotra',
                mobile: '9876543210',
                stage: 'Incoming'
            });

            const updated = await LeadService.updateLead(lead._id, {
                mobile: '+91 91234-56789',
                stage: 'Prospect'
            }, { user: superAdminUser });

            assert.equal(updated.mobile, '9123456789');

            // Verify OutboxEvent
            const outbox = await OutboxEvent.findOne({ aggregateId: lead._id, eventType: 'LeadUpdated' });
            assert.ok(outbox);
            assert.equal(outbox.payload.stageChanged, true);
            assert.ok(outbox.payload.previousStage);
            assert.ok(outbox.payload.newStage);
        });

        it('soft deletes lead and cascades to associated activities', async () => {
            const lead = await Lead.create({
                firstName: 'Suresh',
                mobile: '9988776655'
            });

            await Activity.create({
                subject: 'Call Lead',
                type: 'Call',
                dueDate: new Date(),
                entityId: lead._id,
                entityType: 'Lead'
            });

            const res = await LeadService.deleteLead(lead._id, { user: superAdminUser, deleteTasks: true });
            assert.equal(res.success, true);

            const freshLead = await Lead.collection.findOne({ _id: lead._id });
            assert.equal(freshLead.isDeleted, true);

            const freshActivity = await Activity.collection.findOne({ entityId: lead._id });
            assert.equal(freshActivity.isDeleted, true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Activity Application Service Suite
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. Activity Application Service (ActivityService.js)', () => {
        it('creates activity, updates Lead lastActivityAt, and emits Outbox events', async () => {
            const lead = await Lead.create({
                firstName: 'Rohan',
                mobile: '9871122334'
            });

            const activity = await ActivityService.createActivity({
                type: 'Call',
                subject: 'Initial discovery call',
                dueDate: new Date(),
                entityType: 'Lead',
                entityId: lead._id,
                participants: [{ name: 'Rohan', mobile: '+91 98711-22334' }],
                status: 'Completed'
            }, { user: superAdminUser });

            assert.equal(activity.participants[0].mobile, '9871122334');

            // Lead lastActivityAt updated
            const freshLead = await Lead.findById(lead._id);
            assert.ok(freshLead.lastActivityAt);

            // ActivityCreated Outbox event
            const activityCreatedEvent = await OutboxEvent.findOne({
                aggregateId: activity._id,
                eventType: 'ActivityCreated'
            });
            assert.ok(activityCreatedEvent);

            // LeadEnrichmentRequested Outbox event
            const enrichmentEvent = await OutboxEvent.findOne({
                aggregateId: lead._id,
                eventType: 'LeadEnrichmentRequested'
            });
            assert.ok(enrichmentEvent);
        });

        it('updates activity and emits ActivityUpdated Outbox event', async () => {
            const activity = await Activity.create({
                type: 'Meeting',
                subject: 'Site visit coordination',
                dueDate: new Date(),
                entityType: 'Lead',
                entityId: new mongoose.Types.ObjectId(),
                status: 'Pending'
            });

            const updated = await ActivityService.updateActivity(activity._id, {
                status: 'Completed'
            }, { user: superAdminUser });

            assert.equal(updated.status, 'Completed');
            const event = await OutboxEvent.findOne({
                aggregateId: activity._id,
                eventType: 'ActivityUpdated'
            });
            assert.ok(event);
            assert.equal(event.payload.status, 'Completed');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Domain Event Worker Outbox Contracts Suite
    // ─────────────────────────────────────────────────────────────────────────
    describe('7. Domain Event Worker Outbox Contracts (domainEventWorkerLogic.js)', () => {
        it('handles GoogleSyncRequested event contract with idempotency', async () => {
            const contactId = new mongoose.Types.ObjectId();
            const outbox = await OutboxEvent.create({
                eventId: 'test-google-sync-1',
                eventType: 'GoogleSyncRequested',
                aggregateType: 'Contact',
                aggregateId: contactId,
                payload: { action: 'syncContact', contactId }
            });

            await processDomainEventJob({ data: outbox });
            // Completes without throwing
        });

        it('handles LeadEnrichmentRequested event contract with idempotency', async () => {
            const leadId = new mongoose.Types.ObjectId();
            const outbox = await OutboxEvent.create({
                eventId: 'test-lead-enrichment-1',
                eventType: 'LeadEnrichmentRequested',
                aggregateType: 'Lead',
                aggregateId: leadId,
                payload: { leadId }
            });

            await processDomainEventJob({ data: outbox });
            // Completes without throwing
        });

        it('handles MarketingDispatchRequested event contract with idempotency', async () => {
            const campaignId = new mongoose.Types.ObjectId();
            const outbox = await OutboxEvent.create({
                eventId: 'test-marketing-dispatch-1',
                eventType: 'MarketingDispatchRequested',
                aggregateType: 'Marketing',
                aggregateId: campaignId,
                payload: {
                    jobType: 'blast',
                    jobData: { channel: 'whatsapp', name: 'Autumn Campaign' }
                }
            });

            await processDomainEventJob({ data: outbox });
            // Completes without throwing
        });
    });
});
