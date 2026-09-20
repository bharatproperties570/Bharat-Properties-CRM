import mongoose from 'mongoose';
import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import '../models/Lookup.js';
import '../models/Contact.js';
import OutboxEvent from '../models/OutboxEvent.js';
import Deal from '../models/Deal.js';
import Lead from '../models/Lead.js';
import AuditLog from '../models/AuditLog.js';
import AutomationLog from '../models/AutomationLog.js';
import Inventory from '../models/Inventory.js';
import SystemSetting from '../models/SystemSetting.js';
import { createStandardizedDeal } from '../services/DealCreationEngine.js';

let replSet;
let testLead;
let testSource;

describe("R56 Stage 2: DealCreationEngine durable Outbox integration", () => {
    before(async () => {
        replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replSet.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        // Pre-create ALL collections for transaction safety
        await Promise.all([
            Deal.createCollection(),
            OutboxEvent.createCollection(),
            AuditLog.createCollection(),
            Lead.createCollection(),
            AutomationLog.createCollection(),
            Inventory.createCollection(),
            SystemSetting.createCollection()
        ]);

        testLead = await Lead.create({
            firstName: 'Deal',
            lastName: 'Tester',
            mobile: '+919999999900',
            requirement: 'Buy'
        });
        const LookupModel = mongoose.model('Lookup');
        testSource = await LookupModel.create({ lookup_type: 'Source', lookup_value: 'Direct' });
    });

    after(async () => {
        await mongoose.disconnect();
        if (replSet) await replSet.stop();
    });

    it("Creates Deal and OutboxEvent atomically (SUCCESS PATH)", async () => {
        const input = {
            source: testSource._id,
            dealData: {
                stage: 'Open',
                projectName: 'Test Project',
                documents: [{ name: 'Test Doc', url: 'http://test.com/doc' }]
            },
            linkage: { leadId: testLead._id },
            ownerInfo: {
                owner: new mongoose.Types.ObjectId(),
                associatedContact: new mongoose.Types.ObjectId()
            }
        };

        const result = await createStandardizedDeal(input, {
            triggerDistribution: true,
            triggerMarketing: true,
            triggerSms: false,
            triggerDocumentSync: true
        });

        assert.strictEqual(result.success, true);
        assert.ok(result.deal);

        // POST-COMMIT CUTOVER (C) - Ensure the tasks array is empty
        assert.deepStrictEqual(result.postCommitTasks, []);

        // Verify Deal
        const deal = await Deal.findById(result.deal._id);
        assert.ok(deal);
        assert.strictEqual(deal.projectName, 'Test Project');

        // Verify OutboxEvent
        const events = await OutboxEvent.find({ aggregateId: deal._id });
        assert.strictEqual(events.length, 1);
        const event = events[0];

        assert.ok(event.eventId);
        assert.strictEqual(event.eventType, 'DealCreated');
        assert.strictEqual(event.aggregateType, 'Deal');
        assert.strictEqual(event.aggregateId.toString(), deal._id.toString());
        assert.strictEqual(event.status, 'PENDING');

        // Check payload correctly mapped
        assert.strictEqual(event.payload.triggerDistribution, true);
        assert.strictEqual(event.payload.triggerMarketing, true);
        assert.strictEqual(event.payload.triggerSms, false);
        assert.strictEqual(event.payload.inventoryId, null);
        assert.strictEqual(event.payload.documents.length, 1);
        assert.strictEqual(event.payload.documents[0].name, 'Test Doc');
    });

    it("Fails atomically using REAL MongoDB duplicate key error (ROLLBACK)", async () => {
        // Force a DB error during OutboxEvent insertion
        await OutboxEvent.collection.createIndex({ eventType: 1 }, { unique: true });

        const input = {
            source: testSource._id,
            dealData: {
                stage: 'Open',
                projectName: 'Fail Project'
            },
            linkage: { leadId: testLead._id },
            ownerInfo: {
                owner: new mongoose.Types.ObjectId(),
                associatedContact: new mongoose.Types.ObjectId()
            }
        };

        let capturedError = null;
        try {
            await createStandardizedDeal(input, {});
        } catch (err) {
            capturedError = err;
        }

        assert.ok(capturedError, 'Should have thrown an error');

        // DealCreationEngine overwrites err.code to 'TRANSACTION_FAILED'.
        // So we assert on that instead of 11000, and ensure it contains duplicate key info if possible.
        assert.strictEqual(capturedError.code, 'TRANSACTION_FAILED');
        assert.ok(capturedError.message.includes('E11000 duplicate key error'), 'Message should indicate duplicate key');

        // Verify rollback: Deal MUST NOT exist
        const deal = await Deal.findOne({ projectName: 'Fail Project' });
        assert.strictEqual(deal, null, 'Deal should have been rolled back');

        await OutboxEvent.collection.dropIndex('eventType_1');
    });
});
