import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';
import OutboxEvent from '../models/OutboxEvent.js';
import { outboxPublisher } from '../services/OutboxPublisher.js';
import { domainEventWorker } from '../src/workers/domainEventWorker.js';
import { domainEventQueue } from '../src/queues/queueManager.js';

let replSet;

const runTests = async () => {
    try {
        console.log('Starting MongoMemoryReplSet...');
        replSet = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        const uri = replSet.getUri();
        await mongoose.connect(uri);
        console.log('Connected to MongoMemoryReplSet');

        // Test 1: Model Validation
        console.log('TEST 1: Model Validation');
        try {
            await OutboxEvent.create({ eventType: 'InvalidEvent', aggregateType: 'Lead', aggregateId: new mongoose.Types.ObjectId(), payload: {} });
            throw new Error('Should have failed validation');
        } catch (e) {
            if (!e.message.includes('validation failed')) throw e;
            console.log('✅ Model validation rejected invalid event type');
        }

        const validEvent = await OutboxEvent.create({
            eventId: uuidv4(),
            eventType: 'LeadCreated',
            aggregateType: 'Lead',
            aggregateId: new mongoose.Types.ObjectId(),
            payload: { triggerEvent: 'onCreate' }
        });
        if (validEvent.status !== 'PENDING' || validEvent.attempts !== 0) throw new Error('Default values failed');
        console.log('✅ Model validation accepted valid event');

        // Test 2: Atomic Claim
        console.log('TEST 2: Atomic Claim Concurrency');
        const event2 = await OutboxEvent.create({
            eventId: uuidv4(),
            eventType: 'DealCreated',
            aggregateType: 'Deal',
            aggregateId: new mongoose.Types.ObjectId(),
            payload: { triggerSms: true }
        });

        // Simulate concurrent publishers
        const p1 = outboxPublisher.claimEvent();
        const p2 = outboxPublisher.claimEvent();
        
        const [claim1, claim2] = await Promise.all([p1, p2]);
        
        // One should get event2 (or validEvent), the other might get the remaining one, but not the SAME one
        const claimedIds = [claim1?.eventId, claim2?.eventId].filter(Boolean);
        if (claimedIds.length !== 2) throw new Error('Failed to claim both pending events');
        if (claimedIds[0] === claimedIds[1]) throw new Error('Race condition: double claim allowed');
        
        const checkEvent = await OutboxEvent.findById(claim1._id);
        if (checkEvent.status !== 'PROCESSING' || checkEvent.attempts !== 1 || !checkEvent.lockedUntil) {
            throw new Error('Claim state mutation failed');
        }
        console.log('✅ Atomic claim concurrency works');

        // Test 3: Lease Recovery
        console.log('TEST 3: Lease Recovery');
        const staleEvent = await OutboxEvent.create({
            eventId: uuidv4(),
            eventType: 'LeadCreated',
            aggregateType: 'Lead',
            aggregateId: new mongoose.Types.ObjectId(),
            payload: { },
            status: 'PROCESSING',
            lockedUntil: new Date(Date.now() - 10000), // 10s in the past
            lockedBy: 'dead-publisher',
            attempts: 1
        });

        const recoveredEvent = await outboxPublisher.claimEvent();
        if (!recoveredEvent || recoveredEvent.eventId !== staleEvent.eventId) {
            throw new Error('Failed to recover stale processing event');
        }
        if (recoveredEvent.attempts !== 2) throw new Error('Did not increment attempts on reclaim');
        console.log('✅ Stale lease recovery works');

        // Test 4: BullMQ Job ID mapping
        console.log('TEST 4: Queue Insertion and Job ID');
        // We can't fully mock BullMQ without intercepting it, but we can verify the publish logic
        // We will just verify it does not crash when adding to the mock queue
        // (Queue is already mocked globally in tests by Redis fallback)
        try {
            await outboxPublisher.publishEvent(recoveredEvent);
            const pubCheck = await OutboxEvent.findById(recoveredEvent._id);
            if (pubCheck.status !== 'PUBLISHED') throw new Error('Did not transition to PUBLISHED');
            console.log('✅ BullMQ publication transitions state correctly');
        } catch (e) {
            if (!e.message.includes('ECONNREFUSED')) { // Ignore redis offline in test if it happens
                throw e;
            } else {
                console.log('⚠️ Redis offline, skipping full publish check');
            }
        }

        // Test 5: Worker Validation
        console.log('TEST 5: Worker Execution Envelope Validation');
        // Since we can't easily dispatch a job via BullMQ in this isolated test, we simulate the processor
        const { processDomainEvent } = await import('../src/workers/domainEventWorker.js');
        try {
            await processDomainEvent({ data: { eventId: uuidv4(), eventType: 'Unsupported', aggregateType: 'Lead', aggregateId: '123', payload: {} } });
            throw new Error('Should reject unsupported event');
        } catch(e) {
            if (!e.message.includes('Unsupported eventType')) throw e;
            console.log('✅ Worker correctly rejects unsupported events');
        }

        const validJob = { data: { eventId: uuidv4(), eventType: 'LeadCreated', aggregateType: 'Lead', aggregateId: new mongoose.Types.ObjectId().toString(), payload: {} } };
        const res = await processDomainEvent(validJob);
        if (!res.success) throw new Error('Worker failed to process valid LeadCreated event');
        console.log('✅ Worker correctly accepts LeadCreated events');

        console.log('ALL OUTBOX FOUNDATION TESTS PASSED');

    } catch (err) {
        console.error('TEST FAILED:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        if (replSet) await replSet.stop();
        domainEventQueue.close();
        domainEventWorker.close();
    }
};

runTests();
