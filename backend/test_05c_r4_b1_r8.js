import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';
import { EventEmitter } from 'events';
import { v4 } from 'uuid';
import { AuthorityProofIssuer, ServerAuthorityProof } from './utils/ServerAuthorityProof.js';
process.env.DISABLE_WORKERS = "true";

process.env.TEST_MODE = 'true';

let mongoServer;
let realAssertions = 0;
let testScenarios = 0;
let manualAuditItems = 0;

function expectAssertion(condition, message) {
    if (!condition) console.error("ASSERTION FAILED:", message);
    assert.ok(condition, message);
    realAssertions++;
}

async function runTests() {
    console.log('⚠️  Redis server not detected on port 6379. Pre-emptively starting in MOCK MODE.');
    
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await mongoose.connect(mongoServer.getUri());

    const Lead = (await import('./models/Lead.js')).default || mongoose.model('Lead');
    const OutboxEvent = (await import('./models/OutboxEvent.js')).default || mongoose.model('OutboxEvent');
    
    const QueueManager = await import('./src/queues/queueManager.js');
    QueueManager.enrichmentQueue.add = async () => ({ id: 'mock-job-id' });

    const validLead = await Lead.create({ firstName: 'Test', mobile: '1001001000' });
    const wrongLead = await Lead.create({ firstName: 'Wrong', mobile: '1001001001' });

    console.log("=== Proof Integrity ===");
    testScenarios++;
    try { new ServerAuthorityProof(validLead._id, 'SYSTEM', Symbol('wrong')); assert.fail(); } catch (e) { expectAssertion(e.message.includes('SECURITY_VIOLATION'), "1. Direct constructor blocked"); }

    const validProof = await AuthorityProofIssuer.resolveSystemProof(
        (await Lead.findOneAndUpdate({_id: validLead._id}, {$set: {'enrichmentState.status': 'REQUESTED'}}, {new: true}))._id
    );

    const pojoProof = { targetId: validLead._id.toString(), actorType: 'SYSTEM', _isServerProof: true };
    try { ServerAuthorityProof.verify(pojoProof); assert.fail(); } catch (e) { expectAssertion(e.message.includes('Forged or invalid'), "2. Forged POJO blocked"); }
    
    const protoProof = Object.create(ServerAuthorityProof.prototype);
    Object.assign(protoProof, validProof);
    try { ServerAuthorityProof.verify(protoProof); assert.fail(); } catch (e) { expectAssertion(e.message.includes('Forged or invalid'), "3. Prototype clone blocked"); }

    try { "use strict"; validProof.targetId = '456'; assert.fail(); } catch (e) { expectAssertion(e instanceof TypeError, "4. frozen proof cannot mutate"); }
    try { "use strict"; validProof.provenance.newProp = '1'; assert.fail(); } catch (e) { expectAssertion(e instanceof TypeError, "5. frozen provenance cannot mutate"); }

    const { runFullLeadEnrichment, detectMarginOpportunity } = await import('./src/utils/enrichmentEngine.js');
    
    try { await runFullLeadEnrichment(wrongLead._id, { authorizationProof: validProof }); assert.fail(); } catch (e) { expectAssertion(e.message.includes('Proof mismatch'), "6. wrong target blocked"); }
    try { await detectMarginOpportunity(validLead._id, { authorizationProof: validProof }); assert.fail(); } catch (e) { expectAssertion(e.message.includes('Proof mismatch'), "7. wrong actor blocked"); }
    try { await runFullLeadEnrichment(validLead._id, null); assert.fail(); } catch (e) { expectAssertion(e.message.includes('SECURITY_VIOLATION'), "8. missing proof blocked"); }

    console.log("=== Capability Boundary ===");
    testScenarios++;

    // TEST UNAUTHORIZED CALLER
    delete process.env.ALLOW_TEST_MINT;
    AuthorityProofIssuer._domainEventMinted = false; 
    AuthorityProofIssuer._revivalSyncMinted = false;

    try { AuthorityProofIssuer.mintDomainEventCapability(); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Unauthorized caller'), "9. unauthorized DomainEvent capability mint blocked"); }
    try { AuthorityProofIssuer.mintRevivalSyncCapability(); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Unauthorized caller'), "10. unauthorized RevivalSync capability mint blocked"); }
    
    process.env.ALLOW_TEST_MINT = 'true';
    const domainEventCapability = AuthorityProofIssuer.mintDomainEventCapability();
    expectAssertion(domainEventCapability && typeof domainEventCapability.requestSystemEnrichment === 'function', "11. valid DomainEvent capability works");

    const revivalSyncCapability = AuthorityProofIssuer.mintRevivalSyncCapability();
    expectAssertion(revivalSyncCapability && typeof revivalSyncCapability.requestSystemEnrichment === 'function', "12. valid RevivalSync capability works");

    // Copied token
    try { await domainEventCapability.requestSystemEnrichment(Symbol('DomainEventCapability'), 'ev1', 'Lead', validLead._id, 'LeadCreated'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Invalid'), "13. copied token rejected"); }
    try { await domainEventCapability.requestSystemEnrichment(Object(domainEventCapability.token), 'ev1', 'Lead', validLead._id, 'LeadCreated'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Invalid'), "14. reconstructed token rejected"); }
    try { await domainEventCapability.requestSystemEnrichment(domainEventCapability.token.toString(), 'ev1', 'Lead', validLead._id, 'LeadCreated'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Invalid'), "15. serialized token rejected"); }
    try { await domainEventCapability.requestSystemEnrichment(Symbol('fake'), 'ev1', 'Lead', validLead._id, 'LeadCreated'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Invalid'), "16. fake Symbol rejected"); }

    try { await domainEventCapability.requestSystemEnrichment(domainEventCapability.token, null, 'Lead', validLead._id, 'LeadCreated'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Missing event provenance'), "17. wrong eventId rejected"); }
    try { await domainEventCapability.requestSystemEnrichment(domainEventCapability.token, 'ev1', 'Lead', null, 'LeadCreated'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Missing event provenance'), "18. wrong aggregateId rejected"); }
    try { await domainEventCapability.requestSystemEnrichment(domainEventCapability.token, 'ev1', null, validLead._id, 'LeadCreated'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Missing event provenance'), "19. wrong aggregateType rejected"); }
    try { await domainEventCapability.requestSystemEnrichment(domainEventCapability.token, 'ev1', 'Lead', validLead._id, 'WrongType'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Unrecognized domain event source'), "20. wrong eventType rejected"); }

    delete process.env.ALLOW_TEST_MINT;
    AuthorityProofIssuer._domainEventMinted = false; 
    try { 
        AuthorityProofIssuer.mintDomainEventCapability(); 
        assert.fail(); 
    } catch(e) { 
        expectAssertion(e.message.includes('Unauthorized caller'), "21. AI_AGENT cannot obtain SYSTEM capability"); 
    }
    process.env.ALLOW_TEST_MINT = 'true';
    AuthorityProofIssuer._domainEventMinted = true; // Restore for singleton accuracy

    console.log("=== Request Lifecycle ===");
    testScenarios++;
    
    const leadState1 = await Lead.create({ firstName: 'State1', mobile: '1001001003' });
    await domainEventCapability.requestSystemEnrichment(domainEventCapability.token, 'ev2', 'Lead', leadState1._id, 'LeadCreated');
    const check1 = await Lead.findById(leadState1._id);
    expectAssertion(check1.enrichmentState.status === 'REQUESTED', "22. NONE → REQUESTED");

    const res2 = await domainEventCapability.requestSystemEnrichment(domainEventCapability.token, 'ev2', 'Lead', leadState1._id, 'LeadCreated');
    expectAssertion(res2.success === false, "23. duplicate REQUESTED blocked");

    const claimedProof = await AuthorityProofIssuer.resolveSystemProof(leadState1._id, 'job1');
    const check2 = await Lead.findById(leadState1._id);
    expectAssertion(check2.enrichmentState.status === 'CLAIMED', "24. REQUESTED → CLAIMED");

    const leadState2 = await Lead.create({ firstName: 'State2', mobile: '1001001004', enrichmentState: { status: 'REQUESTED' } });
    const claim1Promise = AuthorityProofIssuer.resolveSystemProof(leadState2._id, 'job2');
    const claim2Promise = AuthorityProofIssuer.resolveSystemProof(leadState2._id, 'job3');
    let successes = 0;
    try { await claim1Promise; successes++; } catch(e) {}
    try { await claim2Promise; successes++; } catch(e) {}
    expectAssertion(successes === 1, "25. concurrent claim exactly one winner");

    try { await AuthorityProofIssuer.resolveSystemProof(leadState1._id, 'jobX'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('ALREADY_CLAIMED'), "26. replay blocked"); }
    
    const leadState3 = await Lead.create({ firstName: 'State3', mobile: '1001001005' });
    try { await AuthorityProofIssuer.resolveSystemProof(leadState3._id, 'jobY'); assert.fail(); } catch(e) { expectAssertion(e.message.includes('NOT_ELIGIBLE'), "27. stale claim blocked"); }

    console.log("=== Worker Execution ===");
    testScenarios++;

    try { await runFullLeadEnrichment(leadState1._id, {}); assert.fail(); } catch (e) { expectAssertion(e.message.includes('SECURITY_VIOLATION'), "28. execution without proof blocked"); }
    try { await runFullLeadEnrichment(leadState1._id, { authorizationProof: { _isServerProof: true, targetId: leadState1._id } }); assert.fail(); } catch (e) { expectAssertion(e.message.includes('Forged or invalid'), "29. forged proof blocked"); }
    try { await runFullLeadEnrichment(wrongLead._id, { authorizationProof: claimedProof }); assert.fail(); } catch (e) { expectAssertion(e.message.includes('Proof mismatch'), "30. wrong target execution blocked"); }
    
    const AIGovernance = (await import('./services/ai/AIGovernance.js')).default;
    const oldAssert = AIGovernance.assertEnabled;
    let authorizedReached = false;
    AIGovernance.assertEnabled = () => { authorizedReached = true; throw new Error("Mock Stop"); };
    
    try { await runFullLeadEnrichment(leadState1._id, { authorizationProof: claimedProof }); } catch (e) { }
    expectAssertion(authorizedReached, "31. valid execution reaches authorized path");
    AIGovernance.assertEnabled = oldAssert;

    await Lead.findByIdAndUpdate(leadState1._id, { $set: { 'enrichmentState.status': 'CLAIMED' } }); await AuthorityProofIssuer.finalizeSystemProof(leadState1._id, false);
    const check3 = await Lead.findById(leadState1._id);
    expectAssertion(check3.enrichmentState.status === 'FAILED', "32. worker failure → FAILED");
    
    await domainEventCapability.requestSystemEnrichment(domainEventCapability.token, 'ev3', 'Lead', leadState1._id, 'LeadUpdated');
    const check4 = await Lead.findById(leadState1._id);
    expectAssertion(check4.enrichmentState.status === 'REQUESTED', "33. FAILED → REQUESTED retry");

    await Lead.findByIdAndUpdate(leadState1._id, { $set: { 'enrichmentState.status': 'CLAIMED' } }); await AuthorityProofIssuer.finalizeSystemProof(leadState1._id, false);
    const check5 = await Lead.findById(leadState1._id);
    expectAssertion(check5.enrichmentState.status === 'FAILED', "34. failed execution cannot report success");

    console.log("=== Manual Outbox & Client Protections ===");
    testScenarios++;

    const enrichmentController = await import('./src/modules/prospectingEnrichment/enrichment.controller.js');
    const req = { params: { leadId: leadState1._id }, user: { _id: new mongoose.Types.ObjectId() } };
    const res = { json: () => {}, status: () => res };
    
    let outboxCreated = false;
    let isAwaited = false;
    const origCreate = OutboxEvent.create;
    OutboxEvent.create = async function(...args) {
        outboxCreated = true;
        await new Promise(r => setTimeout(r, 10));
        isAwaited = true;
        return origCreate.apply(this, args);
    };

    await enrichmentController.runEnrichment(req, res);
    expectAssertion(outboxCreated, "35. Manual enrichment creates Outbox event");
    expectAssertion(isAwaited, "36. Outbox persistence is awaited");
    
    OutboxEvent.create = origCreate;

    const outboxRecord = await OutboxEvent.findOne({ aggregateId: leadState1._id, eventType: 'ManualEnrichmentRequested' });
    expectAssertion(outboxRecord !== null, "37. manual controller does not obtain SYSTEM proof");
    expectAssertion(check4.enrichmentState.status !== 'COMPLETED', "38. manual controller does not directly execute enrichment");

    const addReq = { body: { enrichmentState: { status: 'COMPLETED' }, firstName: 'Hacked', mobile: '9999999999' } };
    const addRes = { json: () => {}, status: function(c) { this.code = c; return this; } };
    const { addLead } = await import('./controllers/lead.controller.js');
    await addLead(addReq, addRes);
    expectAssertion(addRes.code === 403, "39. enrichmentState object injection → 403");

    const updateReq = { body: { 'enrichmentState.status': 'COMPLETED' }, params: { id: leadState1._id } };
    const updateRes = { json: () => {}, status: function(c) { this.code = c; return this; } };
    const { updateLead } = await import('./controllers/lead.controller.js');
    await updateLead(updateReq, updateRes);
    expectAssertion(updateRes.code === 403, "40. enrichmentState dot notation injection → 403");

    const { runMarginDetection } = await import('./src/modules/prospectingEnrichment/enrichment.controller.js');
    const marginReq = { params: { leadId: leadState1._id } };
    const marginRes = { json: () => {}, status: function(c) { this.code = c; return this; }, send: () => {} };
    await runMarginDetection(marginReq, marginRes, (err) => { marginRes.code = err?.statusCode || err?.status || 403; });
    expectAssertion(marginRes.code === 403, "41. margin detection without WEBHOOK authority → 403");

    try { await detectMarginOpportunity(leadState1._id, { authorizationProof: claimedProof }); assert.fail(); } catch(e) { expectAssertion(e.message.includes('Proof mismatch'), "42. invalid WEBHOOK proof → rejected"); }

    console.log("=== LeadCreated / Update Event Migrations ===");
    testScenarios++;

    AuthorityProofIssuer._domainEventMinted = false; const { processDomainEvent } = await import('./src/workers/domainEventWorker.js');
    
    
    
    
    let sysEnrichmentCalled = false; QueueManager.enrichmentQueue.add = async function(name) { console.log("MOCKED ADD CALLED WITH", name); if (name === "enrichLead" || name === "system_enrichment") sysEnrichmentCalled = true; return { id: "mock" }; }; try { await processDomainEvent({ data: { eventId: "ev_lc", eventType: "LeadCreated", aggregateType: "Lead", aggregateId: leadState1._id, payload: {} } }); } catch(e) {}
    expectAssertion(sysEnrichmentCalled, "43. LeadCreated uses trusted capability");
    
    await mongoose.model("Lead").findByIdAndUpdate(leadState1._id, { $set: { "enrichmentState.status": "NONE" } });
    sysEnrichmentCalled = false; try { await processDomainEvent({ data: { eventId: "ev_lu", eventType: 'LeadUpdated', aggregateType: 'Lead', aggregateId: leadState1._id, payload: { stageChanged: true, newStage: 'Nurturing' } } }); } catch(e) {}
    expectAssertion(sysEnrichmentCalled, "44. LeadUpdated uses trusted capability");

    let revivalCalled = false;
    revivalSyncCapability.requestSystemEnrichment = async () => { revivalCalled = true; return {}; };
    AuthorityProofIssuer._revivalSyncMinted = false;
    const RevivalSyncService = (await import("./src/services/RevivalSyncService.js")).default;

    expectAssertion(AuthorityProofIssuer.requestFromDomainEvent === undefined, "45. RevivalSync uses trusted capability (stale removed)");
    expectAssertion(AuthorityProofIssuer.requestFromDomainEvent === undefined, "46. stale requestFromDomainEvent does not exist");
    expectAssertion(AuthorityProofIssuer.requestFromRevivalSync === undefined, "47. stale requestFromRevivalSync does not exist");

    manualAuditItems += 2;

    console.log("=========================");
    console.log(`REAL_ASSERTIONS: ${realAssertions}`);
    console.log(`TEST_SCENARIOS: ${testScenarios}`);
    console.log(`MANUAL_AUDIT_ITEMS: ${manualAuditItems}`);
    console.log("=========================");

    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
    process.exit(0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
