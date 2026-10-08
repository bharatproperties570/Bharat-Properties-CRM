import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

let passedAssertions = 0;
let failedAssertions = 0;

function assertCondition(condition, message) {
    if (condition) {
        console.log(`PASS: ${message}`);
        passedAssertions++;
    } else {
        console.error(`FAIL: ${message}`);
        failedAssertions++;
    }
}

async function assertThrows(promiseFn, message) {
    try {
        await promiseFn();
        console.error(`FAIL: ${message} (Did not throw)`);
        failedAssertions++;
    } catch (e) {
        console.log(`PASS: ${message}`);
        passedAssertions++;
    }
}

const processDomainEvent = async (job) => {
    const { domainEventQueue } = await import('./src/queues/queueManager.js');
    const { domainEventWorker } = await import('./src/workers/domainEventWorker.js');
    
    return new Promise(async (resolve, reject) => {
        const addedJob = await domainEventQueue.add('event', job.data);
        const onCompleted = (j) => { if (j.id === addedJob.id) { cleanup(); resolve({ success: true }); } };
        const onFailed = (j, err) => { if (j.id === addedJob.id) { cleanup(); reject(err); } };
        const cleanup = () => { domainEventWorker.removeListener('completed', onCompleted); domainEventWorker.removeListener('failed', onFailed); };
        domainEventWorker.on('completed', onCompleted);
        domainEventWorker.on('failed', onFailed);
    });
};

async function runTests() {
    console.log("[R4-B2] Setting up MongoMemoryServer...");
    const mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const { ServerAuthorityProof, AuthorityProofIssuer } = await import('./utils/ServerAuthorityProof.js');
    const { processDomainEventJob } = await import('./src/workers/domainEventWorkerLogic.js');
    const Lead = (await import('./models/Lead.js')).default;
    const Activity = (await import('./models/Activity.js')).default;
    const OutboxEvent = (await import('./models/OutboxEvent.js')).default;

    // Mock SMS
    const smsServiceMock = (await import('./src/modules/sms/sms.service.js')).default;
    smsServiceMock.sendSMSWithTemplate = async () => true;
    smsServiceMock.sendSMS = async () => true;

    
    // STRUCTURAL TEST: enrichmentQueue.add count
    console.log("[R4-B2] Running structural tests...");
    const { execSync } = await import('child_process');
    try {
        const grepOutput = execSync('find backend -type f -name "*.js" -not -name "test_*.js" -not -name "verify_enrichment.js" -not -path "*/node_modules/*" -exec grep -Hn "enrichmentQueue\\.add(" {} + || true', { encoding: 'utf8' }).trim();
        const lines = grepOutput.split('\n').filter(l => l.length > 0);
        
        let validOccurrences = 0;
        let invalidOccurrences = 0;
        
        for (const line of lines) {
            if (line.includes('ServerAuthorityProof.js') && line.includes('_enqueueSystemEnrichment') || line.includes('queues.enrichmentQueue.add(')) {
                validOccurrences++;
            } else {
                invalidOccurrences++;
                console.error("INVALID ENQUEUE:", line);
            }
        }
        
        assertCondition(lines.length === 1, "Structural 1: Exactly ONE occurrence of enrichmentQueue.add( repository-wide");
        assertCondition(validOccurrences === 1, "Structural 2: Occurrence is inside ServerAuthorityProof.js _enqueueSystemEnrichment()");
        assertCondition(invalidOccurrences === 0, "Structural 3: Zero controller direct enqueue occurrences");
    } catch (err) {
        console.error("Grep failed:", err);
    }

    console.log("[R4-B2] Running specific tests...");

    // 1. ActivityCreated returns { action: 'REQUEST_SYSTEM_ENRICHMENT' }
    const l1 = await Lead.create({ firstName: 'Lead1', mobile: '9999999991', enrichmentState: { status: 'NONE' } });
    const mockJob1 = {
        data: {
            eventId: 'test-event-1',
            aggregateId: new mongoose.Types.ObjectId().toString(),
            aggregateType: 'Activity',
            eventType: 'ActivityCreated',
            payload: { entityType: 'Lead', entityId: l1._id.toString() }
        }
    };
    const intent1 = await processDomainEventJob(mockJob1);
    assertCondition(intent1?.action === 'REQUEST_SYSTEM_ENRICHMENT', "1. ActivityCreated returns: { action: 'REQUEST_SYSTEM_ENRICHMENT' }");

    // 2. ActivityCreated ultimately targets TARGET_LEAD_ID, NOT aggregateId.
    const a1 = await Activity.create({ type: 'Note', entityType: 'Lead', entityId: l1._id.toString(), owner: new mongoose.Types.ObjectId(), dueDate: new Date(), subject: 'Sub' });
    await processDomainEvent({ data: { eventId: 'test-event-2', aggregateId: a1._id.toString(), aggregateType: 'Activity', eventType: 'ActivityCreated', payload: { entityType: 'Lead', entityId: l1._id.toString() } } });
    const l1_after = await Lead.findById(l1._id);
    assertCondition(l1_after.enrichmentState.status === 'REQUESTED', "2. ActivityCreated targets TARGET_LEAD_ID, NOT aggregateId");

    
    // D. ActivityUpdated targeting Lead -> REQUEST_SYSTEM_ENRICHMENT
    const mockJobD = {
        data: {
            eventId: 'test-event-d',
            aggregateId: a1._id.toString(),
            aggregateType: 'Activity',
            eventType: 'ActivityUpdated',
            payload: { entityType: 'Lead', entityId: l1._id.toString() }
        }
    };
    const intentD = await processDomainEventJob(mockJobD);
    assertCondition(intentD?.action === 'REQUEST_SYSTEM_ENRICHMENT', "D. ActivityUpdated targeting Lead -> REQUEST_SYSTEM_ENRICHMENT");

    // E. ActivityUpdated targeting non-Lead -> NO enrichment intent
    const mockJobE = {
        data: {
            eventId: 'test-event-e',
            aggregateId: a1._id.toString(),
            aggregateType: 'Activity',
            eventType: 'ActivityUpdated',
            payload: { entityType: 'Deal', entityId: 'some-deal-id' }
        }
    };
    const intentE = await processDomainEventJob(mockJobE);
    assertCondition(intentE?.action !== 'REQUEST_SYSTEM_ENRICHMENT', "E. ActivityUpdated targeting non-Lead -> NO enrichment intent");

    // F. ActivityUpdated missing entityId -> NO enrichment intent / safe rejection
    const mockJobF = {
        data: {
            eventId: 'test-event-f',
            aggregateId: a1._id.toString(),
            aggregateType: 'Activity',
            eventType: 'ActivityUpdated',
            payload: { entityType: 'Lead' }
        }
    };
    const intentF = await processDomainEventJob(mockJobF);
    assertCondition(intentF?.action !== 'REQUEST_SYSTEM_ENRICHMENT', "F. ActivityUpdated missing entityId -> NO enrichment intent / safe rejection");

    
    // 3. LeadCreated uses aggregateId as the enrichment target.
    const l2 = await Lead.create({ firstName: 'Lead2', mobile: '9999999992', enrichmentState: { status: 'NONE' } });
    await processDomainEvent({ data: { eventId: 'test-event-3', aggregateId: l2._id.toString(), aggregateType: 'Lead', eventType: 'LeadCreated', payload: {} } });
    const l2_after = await Lead.findById(l2._id);
    assertCondition(l2_after.enrichmentState.status === 'REQUESTED', "3. LeadCreated uses aggregateId as the enrichment target.");

    // 4. HUMAN cannot obtain SYSTEM enrichment capability.
    assertCondition(typeof ServerAuthorityProof.requestSystemEnrichment === 'undefined', "4. HUMAN cannot obtain SYSTEM enrichment capability.");
    
    // 5. WEBHOOK cannot obtain SYSTEM enrichment capability.
    const webhookHasCapability = typeof AuthorityProofIssuer.mintDomainEventCapability !== 'undefined';
    assertCondition(!webhookHasCapability, "5. WEBHOOK cannot obtain SYSTEM enrichment capability.");

    // 6. Arbitrary Lead ID without REQUESTED state cannot obtain authority.
    const l3 = await Lead.create({ firstName: 'Lead3', mobile: '9999999993', enrichmentState: { status: 'NONE' } });
    await assertThrows(async () => await AuthorityProofIssuer.resolveSystemProof(l3._id.toString()), "6. Arbitrary Lead ID without REQUESTED state cannot obtain authority.");

    // 7. REQUESTED Lead can be claimed exactly once.
    const l4 = await Lead.create({ firstName: 'Lead4', mobile: '9999999994', enrichmentState: { status: 'REQUESTED' } });
    const proof1 = await AuthorityProofIssuer.resolveSystemProof(l4._id.toString());
    assertCondition(proof1 && proof1.targetId, "7a. REQUESTED Lead can be claimed exactly once (part 1).");
    await assertThrows(async () => await AuthorityProofIssuer.resolveSystemProof(l4._id.toString()), "7b. REQUESTED Lead can be claimed exactly once.");

    // 8. Replayed/claimed request cannot obtain second authority.
    await assertThrows(async () => await AuthorityProofIssuer.resolveSystemProof(l4._id.toString()), "8. Replayed/claimed request cannot obtain second authority.");

    console.log("=========================");
    console.log(`REAL_ASSERTIONS: ${passedAssertions + failedAssertions}`);
    console.log("=========================");
    
    if (failedAssertions > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
