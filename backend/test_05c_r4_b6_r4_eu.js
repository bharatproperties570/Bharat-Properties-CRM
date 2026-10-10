import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import crypto from 'crypto';
import assert from 'assert';

import unifiedAIService from './services/UnifiedAIService.js';
unifiedAIService.generate = async () => '{"summary": "Mock summary", "probability": 90}';

let replset;

async function setup() {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    await mongoose.connect(uri);
    
    // Register required schemas
    await import('./models/Lead.js');
    await import('./models/Activity.js');
    await import('./models/OutboxEvent.js');
    await import('./models/AuditLog.js');
    await import('./models/EnrichmentLog.js');
    await import('./models/Company.js');
}

async function runTests() {
    await setup();
    console.log("Starting tests for P16-R4-B6-R4-EU...");

    const Lead = mongoose.model('Lead');
    const OutboxEvent = mongoose.model('OutboxEvent');
    const EnrichmentLog = mongoose.model('EnrichmentLog');
    const AuditLog = mongoose.model('AuditLog');
    const eventBus = (await import('./services/EventBus.js')).default;
    const { runFullLeadEnrichment } = await import('./src/utils/enrichmentEngine.js');
    const { processDomainEventJob } = await import('./src/workers/domainEventWorkerLogic.js');
    const { AuthorityProofIssuer } = await import('./utils/ServerAuthorityProof.js');

    const claimToken = crypto.randomBytes(32).toString('hex');
    const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
    
    const lead = await Lead.create({
        firstName: 'Test',
        lastName: 'Lead',
        mobile: '9999999999',
        intent_index: 0,
        companyId: new mongoose.Types.ObjectId(),
        enrichmentState: {
            status: 'REQUESTED',
            claimTokenHash,
            requestedAt: new Date()
        }
    });

    let proof = await AuthorityProofIssuer.resolveSystemProof(lead._id.toString(), 'job-1', claimToken);
    await AuthorityProofIssuer.transitionToRunning(proof);

    const executionContext = {
        authorizationProof: proof
    };

    console.log("-> Test 1 & 2: Atomic rollback & Phantom Event Suppression");
    
    let eventEmitCalls = [];
    const originalEmit = eventBus.emit;
    eventBus.emit = (...args) => {
        eventEmitCalls.push(args);
        return originalEmit.apply(eventBus, args);
    };
    
    const originalCreate = OutboxEvent.create;
    OutboxEvent.create = async (...args) => {
        throw new Error('Simulated Outbox Failure');
    };

    try {
        await runFullLeadEnrichment(lead._id.toString(), executionContext);
    } catch (e) {
        // expected
    }

    const leadAfterFailure = await Lead.findById(lead._id);
    assert.strictEqual(leadAfterFailure.ai_intent_summary, undefined, "Lead mutation should have rolled back");
    
    const enrichmentCount = await EnrichmentLog.countDocuments({ leadId: lead._id });
    assert.strictEqual(enrichmentCount, 0, "EnrichmentLog should have rolled back");

    const auditCount = await AuditLog.countDocuments({ targetId: lead._id });
    assert.strictEqual(auditCount, 0, "AuditLog should have rolled back");

    const leadUpdatedEvents = eventEmitCalls.filter(args => args[0] === 'LEAD_UPDATED');
    assert.strictEqual(leadUpdatedEvents.length, 0, "Phantom LEAD_UPDATED event should be suppressed during aborted transaction");
    
    OutboxEvent.create = originalCreate;
    console.log("✅ Passed T1 & T2");

    console.log("-> Test 3: Successful transaction");
    
    const claimToken2 = crypto.randomBytes(32).toString('hex');
    const claimTokenHash2 = crypto.createHash('sha256').update(claimToken2).digest('hex');
    const lead2 = await Lead.create({
        firstName: 'Test2',
        lastName: 'Lead2',
        mobile: '8888888888',
        intent_index: 0,
        companyId: new mongoose.Types.ObjectId(),
        enrichmentState: {
            status: 'REQUESTED',
            claimTokenHash: claimTokenHash2,
            requestedAt: new Date()
        }
    });

    let proof2 = await AuthorityProofIssuer.resolveSystemProof(lead2._id.toString(), 'job-2', claimToken2);
    await AuthorityProofIssuer.transitionToRunning(proof2);

    const executionContext2 = {
        authorizationProof: proof2
    };

    // CLEAR IT BEFORE WE START ENRICHMENT
    eventEmitCalls = [];

    const res = await runFullLeadEnrichment(lead2._id.toString(), executionContext2);
    assert.strictEqual(res.success, true, "Valid enrichment should succeed: " + res.error);
    
    const leadAfterSuccess = await Lead.findById(lead2._id);
    assert.strictEqual(leadAfterSuccess.ai_intent_summary, 'Mock summary', "Lead should be updated");

    const outboxEvents = await OutboxEvent.find({ aggregateId: lead2._id, eventType: 'LeadUpdated' });
    assert.strictEqual(outboxEvents.length, 1, "OutboxEvent should be created");
    
    const leadUpdatedEventsAfterSuccess = eventEmitCalls.filter(args => args[0] === 'LEAD_UPDATED');
    if (leadUpdatedEventsAfterSuccess.length > 0) {
         console.error("FAILED! Emit was called:", leadUpdatedEventsAfterSuccess);
    }
    assert.strictEqual(leadUpdatedEventsAfterSuccess.length, 0, "eventBus.emit should STILL be suppressed inside the transaction!");
    
    console.log("✅ Passed T3");

    console.log("-> Test 4: Non-transactional compatibility");
    eventEmitCalls = [];
    await Lead.findByIdAndUpdate(lead2._id, { $set: { notes: 'Updated notes manually' } });
    
    const manualUpdates = eventEmitCalls.filter(args => args[0] === 'LEAD_UPDATED');
    assert.strictEqual(manualUpdates.length, 1, "Non-transactional update should emit LEAD_UPDATED");
    
    console.log("✅ Passed T4");

    console.log("-> Test 5: Duplicate outbox delivery");
    eventEmitCalls = [];
    const eventId = outboxEvents[0].eventId;
    
    const jobData = {
        data: {
            eventId: eventId,
            aggregateId: lead2._id.toString(),
            aggregateType: 'Lead',
            eventType: 'LeadUpdated',
            payload: outboxEvents[0].payload || {}
        }
    };

    await import('./models/AutomationLog.js');
    await processDomainEventJob(jobData);
    
    const workerEmits1 = eventEmitCalls.filter(args => args[0] === 'LEAD_UPDATED');
    assert.ok(workerEmits1.length >= 1, "Worker should bridge the outbox event at least once");
    
    eventEmitCalls = [];
    await processDomainEventJob(jobData);
    
    const workerEmits2 = eventEmitCalls.filter(args => args[0] === 'LEAD_UPDATED');
    assert.strictEqual(workerEmits2.length, 0, "Worker should deduplicate and NOT emit again for the same outbox eventId");
    
    console.log("✅ Passed T5");
    console.log("✅ ALL EU TESTS PASSED");
    
    eventBus.emit = originalEmit;
    
    await mongoose.disconnect();
    await replset.stop();
    process.exit(0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
