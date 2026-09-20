import mongoose from 'mongoose';
import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import '../models/Lookup.js';
import '../models/Contact.js';
import OutboxEvent from '../models/OutboxEvent.js';
import Lead from '../models/Lead.js';
import { createStandardizedLead } from '../services/LeadCreationEngine.js';

let replSet;

describe("R56 Stage 1: LeadCreationEngine durable Outbox integration", () => {
    before(async () => {
        replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replSet.getUri();
        await mongoose.connect(uri);
    });

    after(async () => {
        await mongoose.disconnect();
        if (replSet) await replSet.stop();
    });

    it("Creates Lead and OutboxEvent atomically", async () => {
        const leadData = {
            firstName: 'R56',
            lastName: 'Test',
            mobile: '+919999999991',
            requirement: 'Buy',
            triggerEvent: 'onCreate'
        };

        const result = await createStandardizedLead(leadData, { triggerEvent: 'onTest' });

        assert.strictEqual(result.success, true);
        assert.ok(result.lead);
        assert.strictEqual(result.assignment, null);

        // Verify Lead
        const lead = await Lead.findById(result.lead._id);
        assert.ok(lead);
        assert.strictEqual(lead.firstName, 'R56');

        // Verify OutboxEvent
        const events = await OutboxEvent.find({ aggregateId: lead._id });
        assert.strictEqual(events.length, 1);
        const event = events[0];

        assert.ok(event.eventId);
        assert.strictEqual(event.eventType, 'LeadCreated');
        assert.strictEqual(event.aggregateType, 'Lead');
        assert.strictEqual(event.aggregateId.toString(), lead._id.toString());
        assert.strictEqual(event.payload.triggerEvent, 'onTest');
        assert.strictEqual(event.status, 'PENDING');
    });

    it("Fails atomically using REAL MongoDB duplicate key error", async () => {
        // We create a temporary unique index on eventType to FORCE a MongoDB E11000
        // Because the previous test already created a 'LeadCreated' event,
        // this next insertion will definitively fail at the MongoDB level.
        await OutboxEvent.collection.createIndex({ eventType: 1 }, { unique: true });

        const leadData = {
            firstName: 'R56_Fail_DB',
            lastName: 'Test',
            mobile: '+918888888882'
        };

        let capturedError = null;
        try {
            await createStandardizedLead(leadData);
        } catch (err) {
            capturedError = err;
        }

        assert.ok(capturedError, 'Should have thrown an error');
        assert.strictEqual(capturedError.code, 11000, 'Should be a MongoDB Duplicate Key Error');
        assert.ok(capturedError.message.includes('duplicate key error'), 'Message should indicate duplicate key');

        // Verify rollback: the lead MUST NOT exist because the transaction aborted
        const lead = await Lead.findOne({ firstName: 'R56_Fail_DB' });
        assert.strictEqual(lead, null, 'Lead should have been rolled back');

        // Cleanup the temporary index
        await OutboxEvent.collection.dropIndex('eventType_1');
    });
});
