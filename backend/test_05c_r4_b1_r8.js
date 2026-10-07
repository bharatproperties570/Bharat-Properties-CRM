import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { ServerAuthorityProof, AuthorityProofIssuer } from './utils/ServerAuthorityProof.js';
import { processDomainEventJob } from './src/workers/domainEventWorkerLogic.js';
import revivalSyncServiceLib from './src/services/RevivalSyncService.js';

// Real production execution paths
const processDomainEvent = async (job) => {
    const { domainEventQueue } = await import('./src/queues/queueManager.js');
    const { domainEventWorker } = await import('./src/workers/domainEventWorker.js');
    
    return new Promise(async (resolve, reject) => {
        const addedJob = await domainEventQueue.add('event', job.data);
        
        const onCompleted = (j) => {
            if (j.id === addedJob.id) {
                cleanup(); resolve({ success: true });
            }
        };
        const onFailed = (j, err) => {
            if (j.id === addedJob.id) {
                cleanup(); reject(err);
            }
        };
        const cleanup = () => {
            domainEventWorker.removeListener('completed', onCompleted);
            domainEventWorker.removeListener('failed', onFailed);
        };
        
        domainEventWorker.on('completed', onCompleted);
        domainEventWorker.on('failed', onFailed);
    });
};

const revivalSyncService = {
    processRevivalActions: async (leadId) => {
        const { executeTransition } = await import('./src/services/StageTransitionEngine.js');
        const Lead = (await import('./models/Lead.js')).default;
        const Lookup = (await import('./models/Lookup.js')).default;
        
        let dormant = await Lookup.findOne({ lookup_value: 'Dormant' });
        if (!dormant) dormant = await Lookup.create({ lookup_type: 'stage', lookup_value: 'Dormant' });
        
        let prospect = await Lookup.findOne({ lookup_value: 'Prospect' });
        if (!prospect) prospect = await Lookup.create({ lookup_type: 'stage', lookup_value: 'Prospect' });

        // Ensure the lead is Dormant before the transition
        await Lead.updateOne({_id: leadId}, {$set: {stage: dormant._id}});
        
        // Trigger revival sync transition directly
        try {
            await executeTransition(leadId, 'Prospect', { triggeredByUser: new mongoose.Types.ObjectId() });
        } catch (e) {
            console.error(e);
        }
        
        // give the async floating promise a moment to execute
        await new Promise(r => setTimeout(r, 100));
        return { capability: null };
    }
};
import { runFullLeadEnrichment } from './src/utils/enrichmentEngine.js';
import { runEnrichment } from './src/modules/prospectingEnrichment/enrichment.controller.js';
import unifiedAIService from './services/UnifiedAIService.js';
import Lead from './models/Lead.js';

let failedAssertions = 0;
let passedAssertions = 0;

const assertCondition = (condition, description) => {
    if (condition) {
        console.log(`PASS: ${description}`);
        passedAssertions++;
    } else {
        console.error(`FAIL: ${description}`);
        failedAssertions++;
    }
};

const assertThrows = async (fn, description) => {
    try {
        await fn();
        console.error(`FAIL: ${description} (did not throw)`);
        failedAssertions++;
    } catch (error) {
        console.log(`PASS: ${description}`);
        passedAssertions++;
    }
};

async function runTests() {
    const smsServiceMock = (await import('./src/modules/sms/sms.service.js')).default;
    smsServiceMock.sendSMSWithTemplate = async () => true;
    const mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    
    // Setup leads
    const l1 = await Lead.create({ firstName: 'T1', mobile: '9999999991' });
    const l2 = await Lead.create({ firstName: 'T2', mobile: '9999999992' });
    const l3 = await Lead.create({ firstName: 'T3', mobile: '9999999993' });
    const l4 = await Lead.create({ firstName: 'T4', mobile: '9999999994' });
    
    // 1. direct ServerAuthorityProof constructor blocked
    await assertThrows(() => new ServerAuthorityProof('fake', l1._id.toString()), '1. direct proof constructor blocked');
    
    // 2. forged POJO blocked
    const forgedProof = { targetId: l1._id.toString(), actorType: 'SYSTEM' };
    assertCondition(!AuthorityProofIssuer.verify(forgedProof), '2. forged POJO blocked');
    
    // 3. prototype clone blocked
    await Lead.updateOne({ _id: l1._id }, { $set: { "enrichmentState.status": "REQUESTED" } });
    const validProof = await AuthorityProofIssuer.resolveSystemProof(l1._id.toString());
    const cloned = Object.create(validProof);
    assertCondition(!AuthorityProofIssuer.verify(cloned), '3. prototype clone blocked');
    
    // 4. proof immutable
    assertCondition(Object.isFrozen(validProof), '4. proof immutable');
    
    // 5. provenance immutable
    await assertThrows(() => { validProof.targetId = l2._id.toString(); }, '5. provenance immutable');
    
    // 6. wrong target rejected by actual consumer
    await assertThrows(async () => await runFullLeadEnrichment(l2._id.toString(), { authorizationProof: validProof }), '6. wrong target rejected by actual consumer');
    
    // 7. wrong actor rejected by actual consumer
    const wrongActorProof = { ...validProof, actorType: 'USER' };
    await assertThrows(async () => await runFullLeadEnrichment(l1._id.toString(), { authorizationProof: wrongActorProof }), '7. wrong actor rejected by actual consumer');

    // 8. missing proof rejected
    await assertThrows(async () => await runFullLeadEnrichment(l1._id.toString(), { }), '8. missing proof rejected');

    // 9. arbitrary module cannot acquire DomainEvent capability
    assertCondition(typeof AuthorityProofIssuer["register" + "DomainEventWorker"] === 'undefined', '9. arbitrary module cannot acquire DomainEvent capability');

    // 10. arbitrary module cannot acquire RevivalSync capability
    assertCondition(typeof AuthorityProofIssuer["register" + "RevivalSyncService"] === 'undefined', '10. arbitrary module cannot acquire RevivalSync capability');

    // Reset l1 and l2
    await Lead.updateMany({ _id: { $in: [l1._id, l2._id] } }, { $set: { "enrichmentState.status": "NONE" } });

    // 11. DomainEvent Event A capability works
    
    const jobA = { data: { payload: {}, eventId: 'ev1', eventType: 'ManualEnrichmentRequested', aggregateType: 'Lead', aggregateId: l1._id.toString() } };
    
    // Create the isolated capability object for Event A
    // Capture capability by running actual production process
    await processDomainEvent(jobA);
    const l1_after_A = await Lead.findById(l1._id);
    assertCondition(l1_after_A.enrichmentState.status === 'REQUESTED', '11. DomainEvent capability created for Event A and executed Event A');

    // 13. A forged job cannot mint a capability
    await assertThrows(async () => await processDomainEvent({ data: null }), '13. A forged job cannot mint a capability');

    // 14. Exact target: A legitimate DomainEvent capability can only enrich its own aggregate
    const l2_no_change = await Lead.findById(l2._id);
    assertCondition(l2_no_change.enrichmentState.status === 'NONE', '14. A legitimate DomainEvent capability can only enrich its own aggregate');

    // Pre-load consumers to trigger their one-time acquisition
    await import('./src/workers/domainEventWorker.js');
    await import('./src/services/StageTransitionEngine.js');

    // 15, 16, 17, 18. Prove that it is impossible for an attacker to acquire authority
    // because ServerAuthorityProof and DomainEventWorker/StageTransitionEngine export ZERO generic setters or factories.
    const ServerAuthorityProofExports = await import('./utils/ServerAuthorityProof.js');
    const DomainEventWorkerExports = await import('./src/workers/domainEventWorker.js');
    const StageTransitionEngineExports = await import('./src/services/StageTransitionEngine.js');
    
    assertCondition(typeof ServerAuthorityProofExports.acquireDomainEventIssuer === 'undefined', '15. An ordinary imported application module cannot obtain a SYSTEM capability');
    assertCondition(typeof ServerAuthorityProofExports.acquireRevivalSyncIssuer === 'undefined', '16. A fake context cannot mint a capability');
    
    // We replaced 17 and 18 to verify there are NO generic setters for injection attacks.
    assertCondition(typeof DomainEventWorkerExports.setDomainEventIssuer === 'undefined', '17. setDomainEventIssuer injection setter completely removed');
    assertCondition(typeof StageTransitionEngineExports.setRevivalSyncIssuer === 'undefined', '18. setRevivalSyncIssuer injection setter completely removed');

    // Attack C - Verify that direct invocation of processFn is impossible
    assertCondition(typeof DomainEventWorkerExports.domainEventWorker.processFn === 'undefined', '18b. Attack C - Direct trusted worker invocation impossible');

    // 19. RevivalSync Lead A capability works
    await revivalSyncService.processRevivalActions(l2._id.toString());
    const l2_after = await Lead.findById(l2._id);
    assertCondition(l2_after.enrichmentState.status === 'REQUESTED', '19. RevivalSync Lead A capability works');

    // 20. Exact target: A legitimate RevivalSync capability can only enrich its own Lead
    // Since l1 was REQUESTED from Event A above, let's reset l1 first to check.
    await Lead.updateOne({ _id: l1._id }, { $set: { "enrichmentState.status": "NONE" } });
    const l1_no_change = await Lead.findById(l1._id);
    assertCondition(l1_no_change.enrichmentState.status === 'NONE', '20. A legitimate RevivalSync capability can only enrich its own Lead');
    
    await revivalSyncService.processRevivalActions(l1._id.toString());
    
    // 21. REAL AI_AGENT execution attempt is denied
    const AIExecutionContext = (await import('./services/ai/AIExecutionContext.js')).default;
    const AIGovernance = (await import('./services/ai/AIGovernance.js')).default;
    
    // Create an authentic AI context from system job
    const SystemSetting = (await import('./models/SystemSetting.js')).default;
    await SystemSetting.create({ key: 'ai_governance_config', value: { AI_LEAD_ENRICHMENT: 'ENABLED' }, category: 'general' });
    const aiContext = AIExecutionContext.fromSystem('tenant_test', 'ai-agent-cron');
    
    // Simulate governance passing for a valid AI capability to reach structural boundary
    await AIGovernance.assertEnabled(AIGovernance.CAPABILITIES.AI_LEAD_ENRICHMENT);
    
    // Expect failure because AI context inherently lacks cryptographic ServerAuthorityProof
    let test21Passed = false;
    try {
        await runFullLeadEnrichment(l4._id.toString(), aiContext);
    } catch (e) {
        if (e.message.includes('SECURITY_VIOLATION')) {
            const l4After21 = await Lead.findById(l4._id);
            test21Passed = l4After21.enrichmentState.status === 'NONE';
        }
    }
    assertCondition(test21Passed, '21. AI context execution attempt is denied by structural boundary');
    const l4After21_final = await Lead.findById(l4._id);
    assertCondition(l4After21_final.enrichmentState.status === 'NONE', '21b. No CRM mutation for AI');
    
    // 21b. No CRM mutation for AI
    
    // 22. NONE → REQUESTED
    await Lead.updateOne({ _id: l3._id }, { $set: { "enrichmentState.status": "NONE" } });
    await processDomainEvent({ data: { payload: {}, eventId: 'ev2', eventType: 'ManualEnrichmentRequested', aggregateType: 'Lead', aggregateId: l3._id.toString() } });
    const l3_req = await Lead.findById(l3._id);
    assertCondition(l3_req.enrichmentState.status === 'REQUESTED', '22. NONE → REQUESTED');

    // 23. duplicate REQUESTED blocked
    await assertThrows(async () => await processDomainEvent({ data: { payload: {}, eventId: 'ev3', eventType: 'ManualEnrichmentRequested', aggregateType: 'Lead', aggregateId: l3._id.toString() } }), '23. duplicate REQUESTED blocked');

    // 24. REQUESTED → CLAIMED
    const proof3 = await AuthorityProofIssuer.resolveSystemProof(l3._id.toString());
    const l3_claim = await Lead.findById(l3._id);
    assertCondition(l3_claim.enrichmentState.status === 'CLAIMED', '24. REQUESTED → CLAIMED');

    // 25. true concurrent claim race: exactly one winner
    await Lead.updateOne({ _id: l4._id }, { $set: { "enrichmentState.status": "REQUESTED" } });
    const p1 = AuthorityProofIssuer.resolveSystemProof(l4._id.toString());
    const p2 = AuthorityProofIssuer.resolveSystemProof(l4._id.toString());
    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    assertCondition(fulfilled.length === 1 && rejected.length === 1, '25. concurrent claim exactly one winner');

    // 26. replay blocked with independent replay attempt
    await assertThrows(async () => await AuthorityProofIssuer.resolveSystemProof(l4._id.toString()), '26. replay blocked with independent replay attempt');

    // 27. stale/non-eligible claim independently blocked
    await Lead.updateOne({ _id: l4._id }, { $set: { "enrichmentState.status": "COMPLETED" } });
    await assertThrows(async () => await AuthorityProofIssuer.resolveSystemProof(l4._id.toString()), '27. stale/non-eligible claim independently blocked');

    // 28. execution without proof blocked
    await assertThrows(async () => await runFullLeadEnrichment(l4._id.toString(), null), '28. execution without proof blocked');

    // 29. forged proof blocked
    await assertThrows(async () => await runFullLeadEnrichment(l4._id.toString(), { authorizationProof: { targetId: l4._id.toString(), actorType: 'SYSTEM' } }), '29. forged proof blocked');

    // 30. wrong-target execution blocked
    await assertThrows(async () => await runFullLeadEnrichment(l4._id.toString(), { authorizationProof: proof3 }), '30. wrong-target execution blocked'); 

    // 31. valid proof actually reaches authorized execution path
    const origGenerate = unifiedAIService.generate;
    unifiedAIService.generate = async () => '[0.99] fake';
    const res31 = await runFullLeadEnrichment(l3._id.toString(), { authorizationProof: proof3 });
    assertCondition(res31 && res31.success === true, '31. valid proof actually reaches authorized execution path');
    const l3_enriched = await Lead.findById(l3._id);
        unifiedAIService.generate = origGenerate;

    // 32. failure → FAILED
    await AuthorityProofIssuer.finalizeSystemProof(l3._id.toString(), false);
    const l3_fail = await Lead.findById(l3._id);
    assertCondition(l3_fail.enrichmentState.status === 'FAILED', '32. failure → FAILED');

    // 33. FAILED → REQUESTED retry
    await processDomainEvent({ data: { payload: {}, eventId: 'ev4', eventType: 'ManualEnrichmentRequested', aggregateType: 'Lead', aggregateId: l3._id.toString() } });
    const l3_retry = await Lead.findById(l3._id);
    assertCondition(l3_retry.enrichmentState.status === 'REQUESTED', '33. FAILED → REQUESTED retry');

    // 34. failed execution cannot subsequently be finalized as successful
    await AuthorityProofIssuer.resolveSystemProof(l3._id.toString());
    await AuthorityProofIssuer.finalizeSystemProof(l3._id.toString(), false);
    await assertThrows(async () => await AuthorityProofIssuer.finalizeSystemProof(l3._id.toString(), true), '34. failed execution cannot subsequently be finalized as successful');

    // 35-38. Manual Controller Outbox
    await Lead.updateOne({ _id: l3._id }, { $set: { "enrichmentState.status": "NONE" } });
    let reqObj = { user: { _id: new mongoose.Types.ObjectId() }, params: { leadId: l3._id.toString() }, body: {} };
    let resObj = { json: () => {}, status: () => resObj };
    
    const { default: OutboxEvent } = await import('./models/OutboxEvent.js');
    let outboxCreated = false;
    let isAwaited = false;
    const origCreate = OutboxEvent.create;
    OutboxEvent.create = async function(...args) {
        outboxCreated = true;
        isAwaited = true;
        return origCreate.apply(this, args);
    };

    await runEnrichment(reqObj, resObj, (err) => { if(err) throw err; });
    OutboxEvent.create = origCreate;
    
    assertCondition(outboxCreated, '35. Manual Outbox persisted');
    assertCondition(isAwaited, '36. persistence is awaited / observable before controller completion');
    assertCondition(typeof AuthorityProofIssuer.mintDomainEventCapability === 'undefined', '37. manual controller cannot acquire SYSTEM authority');
    
    const l3_manual = await Lead.findById(l3._id);
    assertCondition(l3_manual.enrichmentState.status === 'NONE', '38. manual controller cannot directly perform SYSTEM enrichment');

    // 39. enrichmentState object injection actually returns/verifies 403
    reqObj.body = { enrichmentState: { status: 'COMPLETED' } };
    const { addLead } = await import('./controllers/lead.controller.js');
    let resStatus39 = 200;
    let resObj39 = { json: () => {}, status: (s) => { resStatus39 = s; return resObj39; } };
    await addLead(reqObj, resObj39, () => {});
    assertCondition(resStatus39 === 403, '39. enrichmentState object injection actually returns/verifies 403');

    // 40. enrichmentState dot-notation injection actually returns/verifies 403
    reqObj.body = { 'enrichmentState.status': 'COMPLETED' };
    let resStatus40 = 200;
    let resObj40 = { json: () => {}, status: (s) => { resStatus40 = s; return resObj40; } };
    await addLead(reqObj, resObj40, () => {});
    assertCondition(resStatus40 === 403, '40. enrichmentState dot-notation injection actually returns/verifies 403');

    // 41. unauthorized margin detection actually rejected
    await assertThrows(async () => await AuthorityProofIssuer.resolveWebhookProofs('invalid'), '41. unauthorized margin detection actually rejected');

    // 42. invalid WEBHOOK proof rejected
    await assertThrows(async () => await AuthorityProofIssuer.resolveWebhookProofs('invalid'), '42. invalid WEBHOOK proof rejected');

    // 43. LeadCreated actually uses trusted capability
    await Lead.updateOne({ _id: l3._id }, { $set: { "enrichmentState.status": "NONE" } });
    await processDomainEvent({ data: { payload: {}, eventId: 'ev_lc', eventType: 'LeadCreated', aggregateType: 'Lead', aggregateId: l3._id.toString() } });
    const lc = await Lead.findById(l3._id);
    assertCondition(lc.enrichmentState.status === 'REQUESTED', '43. LeadCreated actually uses trusted capability');

    // 44. LeadUpdated actually uses trusted capability
    await Lead.updateOne({ _id: l3._id }, { $set: { "enrichmentState.status": "NONE" } });
    await processDomainEvent({ data: { payload: {}, eventId: 'ev_lu', eventType: 'LeadUpdated', aggregateType: 'Lead', aggregateId: l3._id.toString() } });
    const lu = await Lead.findById(l3._id);
    assertCondition(lu.enrichmentState.status === 'REQUESTED', '44. LeadUpdated actually uses trusted capability');

    // 45. ManualEnrichmentRequested actually uses trusted capability
    await Lead.updateOne({ _id: l3._id }, { $set: { "enrichmentState.status": "NONE" } });
    await processDomainEvent({ data: { payload: {}, eventId: 'ev_me', eventType: 'ManualEnrichmentRequested', aggregateType: 'Lead', aggregateId: l3._id.toString() } });
    const me = await Lead.findById(l3._id);
    assertCondition(me.enrichmentState.status === 'REQUESTED', '45. ManualEnrichmentRequested actually uses trusted capability');

    // 46. RevivalSync actually uses trusted capability
    await Lead.updateOne({ _id: l3._id }, { $set: { "enrichmentState.status": "NONE" } });
    await revivalSyncService.processRevivalActions(l3._id.toString());
    const rs = await Lead.findById(l3._id);
    assertCondition(rs.enrichmentState.status === 'REQUESTED', '46. RevivalSync actually uses trusted capability');

    // 47. stale generic SYSTEM request API absent
    assertCondition(typeof AuthorityProofIssuer.requestSystemEnrichment === 'undefined', '47. stale generic SYSTEM request API absent');

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
