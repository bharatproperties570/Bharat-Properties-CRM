import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import { DealMutationService } from './services/DealMutationService.js';
import { LeadMutationService } from './services/LeadMutationService.js';
import { ServerAuthorityProof, AuthorityProofIssuer } from './utils/ServerAuthorityProof.js';
import { runFullLeadEnrichment } from './src/utils/enrichmentEngine.js';
import { enrichmentWorker } from './src/workers/enrichmentWorker.js';

let replSet;
let Deal, Lead, User, Activity, Conversation;

async function setup() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    Deal = (await import('./models/Deal.js')).default;
    Lead = (await import('./models/Lead.js')).default;
    User = (await import('./models/User.js')).default;
    Activity = (await import('./models/Activity.js')).default;
    Conversation = (await import('./models/Conversation.js')).default;
    
    await Deal.init();
    await Lead.init();
    await Activity.init();
    await User.init();
    await Conversation.init();
}

async function runTests() {
    await setup();
    console.log("Setting up data...");

    const dummyRoleId = new mongoose.Types.ObjectId();
    const user1 = await User.create({ fullName: 'Human 1', email: 'h1@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });
    const user3 = await User.create({ fullName: 'Human 3', email: 'h3@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });

    const deal1 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const deal2 = await Deal.create({ stage: 'Open', owner: user1._id, price: 2000 });
    
    const lead1 = await Lead.create({ firstName: 'Lead1', mobile: '1234567890', owner: user1._id });
    const lead2 = await Lead.create({ firstName: 'Lead2', mobile: '9998887776', owner: user1._id });
    
    let testsRun = 0;
    
    console.log("\n--- AUTHORITY CONSTRUCTION TESTS ---");
    
    try { new ServerAuthorityProof(lead1._id, 'SYSTEM'); assert.fail(); } catch(e) { assert.ok(e.message.includes("SECURITY_VIOLATION")); console.log("1. PASS"); testsRun++; }
    try { await AuthorityProofIssuer.resolveSystemProof(lead1._id); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_NOT_ELIGIBLE")); console.log("2. PASS"); testsRun++; }
    try { await AuthorityProofIssuer.resolveSystemProof(new mongoose.Types.ObjectId()); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_TARGET_NOT_FOUND")); console.log("3. PASS"); testsRun++; }
    try { new ServerAuthorityProof(deal1._id, 'WEBHOOK'); assert.fail(); } catch(e) { assert.ok(e.message.includes("SECURITY_VIOLATION")); console.log("4. PASS"); testsRun++; }
    try { await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys', authorizationProof: { targetId: lead1._id.toString(), actorType: 'SYSTEM', _isServerProof: true } }); assert.fail(); } catch(e) { assert.ok(e.message.includes("missing server-derived")); console.log("5. PASS"); testsRun++; }

    console.log("\n--- ELIGIBILITY TESTS ---");

    await AuthorityProofIssuer.requestSystemEnrichment(lead1._id);
    const proof6 = await AuthorityProofIssuer.resolveSystemProof(lead1._id);
    assert.ok(proof6 instanceof ServerAuthorityProof);
    assert.strictEqual(proof6.targetId, lead1._id.toString());
    console.log("6. PASS"); testsRun++;

    try { await AuthorityProofIssuer.resolveSystemProof(lead2._id); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_NOT_ELIGIBLE")); console.log("7. PASS"); testsRun++; }

    await Lead.findByIdAndUpdate(lead2._id, { $set: { 'enrichmentState.status': 'COMPLETED' } });
    try { await AuthorityProofIssuer.resolveSystemProof(lead2._id); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_NOT_ELIGIBLE")); console.log("8. PASS"); testsRun++; }

    try { await AuthorityProofIssuer.resolveSystemProof(lead1._id); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_ALREADY_CLAIMED")); console.log("9. PASS"); testsRun++; }

    await Lead.findByIdAndUpdate(lead2._id, { $set: { 'enrichmentState.status': 'FAILED' } });
    try { await AuthorityProofIssuer.resolveSystemProof(lead2._id); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_NOT_ELIGIBLE")); console.log("10. PASS"); testsRun++; }

    console.log("\n--- REPLAY TESTS ---");

    const lead11 = await Lead.create({ firstName: 'Lead11', mobile: '1111111111', owner: user1._id });
    await AuthorityProofIssuer.requestSystemEnrichment(lead11._id);
    await AuthorityProofIssuer.resolveSystemProof(lead11._id, 'job1');
    try { await AuthorityProofIssuer.resolveSystemProof(lead11._id, 'job1_replay'); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_ALREADY_CLAIMED")); console.log("11. PASS"); testsRun++; }

    await AuthorityProofIssuer.finalizeSystemProof(lead11._id, true);
    try { await AuthorityProofIssuer.resolveSystemProof(lead11._id, 'job1_replay2'); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_NOT_ELIGIBLE")); console.log("12. PASS"); testsRun++; }

    console.log("\n--- CONCURRENCY TESTS ---");

    const leadConc = await Lead.create({ firstName: 'Concurrent', mobile: '2222222222', owner: user1._id });
    await AuthorityProofIssuer.requestSystemEnrichment(leadConc._id);
    
    const p1 = AuthorityProofIssuer.resolveSystemProof(leadConc._id, 'jobW1');
    const p2 = AuthorityProofIssuer.resolveSystemProof(leadConc._id, 'jobW2');
    const results = await Promise.all([p1, p2].map(p => p.catch(e => e)));
    
    const successes = results.filter(r => r instanceof ServerAuthorityProof);
    const failures = results.filter(r => r instanceof Error);
    
    assert.strictEqual(successes.length, 1);
    assert.strictEqual(failures.length, 1);
    assert.ok(failures[0].message.includes("SYSTEM_ENRICHMENT_ALREADY_CLAIMED"));
    console.log("13 & 14. PASS"); testsRun+=2;

    const winningProof = successes[0];
    assert.strictEqual(winningProof.targetId, leadConc._id.toString());
    console.log("15. PASS"); testsRun++;

    const mut1 = LeadMutationService.executeEnrichmentUpdate(leadConc._id, { ai_closing_probability: 90 }, { actorType: 'SYSTEM', actorId: 'w1', authorizationProof: winningProof });
    const mutReal2Fn = () => LeadMutationService.executeEnrichmentUpdate(leadConc._id, { ai_closing_probability: 80 }, { actorType: 'SYSTEM', actorId: 'w2' }); 
    await mut1;
    try { await mutReal2Fn(); assert.fail(); } catch(e) { assert.ok(e.message.includes("missing server-derived")); }
    console.log("16. PASS"); testsRun++;

    console.log("\n--- STALE STATE TESTS ---");

    const leadStale = await Lead.create({ firstName: 'Stale', mobile: '3333333333', owner: user1._id });
    await AuthorityProofIssuer.requestSystemEnrichment(leadStale._id);
    
    await Lead.findByIdAndUpdate(leadStale._id, { $set: { 'enrichmentState.status': 'NONE' } });
    
    try { await AuthorityProofIssuer.resolveSystemProof(leadStale._id, 'jobStale'); assert.fail(); } catch(e) { assert.ok(e.message.includes("SYSTEM_ENRICHMENT_NOT_ELIGIBLE")); console.log("17 & 18. PASS"); testsRun+=2; }

    try { await LeadMutationService.executeEnrichmentUpdate(leadStale._id, { ai_closing_probability: 99 }, { actorType: 'SYSTEM', actorId: 'sys' }); assert.fail(); } catch(e) { assert.ok(e.message.includes("missing server-derived")); console.log("19. PASS"); testsRun++; }

    console.log("\n--- HUMAN SEPARATION TESTS ---");

    const deal20 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const r20 = await DealMutationService.executeVerificationUpdate(deal20._id, { price: 2000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.strictEqual(r20.deal.price, 2000);
    console.log("20. PASS"); testsRun++;

    try { await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 99 }, { actorType: 'SYSTEM', actorId: user1._id }); assert.fail(); } catch(e) { assert.ok(e.message.includes("missing server-derived")); console.log("21. PASS"); testsRun++; }

    try { await DealMutationService.executeVerificationUpdate(deal20._id, { price: 4000 }, { actorType: 'HUMAN_USER', actorId: user3._id }); assert.fail(); } catch(e) { assert.strictEqual(e.status, 403); console.log("22. PASS"); testsRun++; }

    console.log("\n--- AI SEPARATION TESTS ---");

    try { await LeadMutationService.executeEnrichmentUpdate(lead2._id, { ai_closing_probability: 50 }, { actorType: 'AI', actorId: 'ai1' }); assert.fail(); } catch(e) { assert.ok(e.status === 403 && e.message.includes("Unsupported actor type")); console.log("23. PASS"); testsRun++; }

    try { new ServerAuthorityProof(lead2._id, 'SYSTEM'); assert.fail(); } catch(e) { assert.ok(e.message.includes("SECURITY_VIOLATION")); console.log("24. PASS"); testsRun++; }

    console.log("\n--- INTEGRITY TESTS ---");

    const lead25 = await Lead.create({ firstName: 'Int', mobile: '4444444444', owner: user1._id });
    await AuthorityProofIssuer.requestSystemEnrichment(lead25._id);
    const proof25 = await AuthorityProofIssuer.resolveSystemProof(lead25._id);
    try { await LeadMutationService.executeEnrichmentUpdate(lead25._id, { 'enrichmentState.status': 'COMPLETED' }, { actorType: 'SYSTEM', actorId: 'sys', authorizationProof: proof25 }); assert.fail(); } catch(e) { assert.ok(e.message.includes("Unauthorized field mutation")); console.log("25. PASS"); testsRun++; }

    try { await LeadMutationService.executeEnrichmentUpdate(lead25._id, { 'enrichmentState.status': 'CLAIMED' }, { actorType: 'SYSTEM', actorId: 'sys', authorizationProof: proof25 }); assert.fail(); } catch(e) { assert.ok(e.message.includes("Unauthorized field mutation")); console.log("26. PASS"); testsRun++; }

    assert.strictEqual(proof25.provenance.authoritySource, 'SYSTEM_ENRICHMENT_CLAIM');
    console.log("27. PASS"); testsRun++;

    try { proof25.provenance.jobId = 'injected'; assert.fail(); } catch(e) { assert.ok(e instanceof TypeError); console.log("28. PASS"); testsRun++; }


    console.log("\n--- FAILURE/ROLLBACK TESTS ---");

    try { await LeadMutationService.executeEnrichmentUpdate(lead25._id, { ai_closing_probability: 'invalid' }, { actorType: 'SYSTEM', actorId: 'sys', authorizationProof: proof25 }); assert.fail(); } catch(e) { assert.ok(e.message.includes("Invalid ai_closing_probability value")); }
    const check29 = await Lead.findById(lead25._id);
    assert.strictEqual(check29.enrichmentState.status, 'CLAIMED'); 
    console.log("29. PASS"); testsRun++;

    await AuthorityProofIssuer.finalizeSystemProof(lead25._id, false);
    const check30 = await Lead.findById(lead25._id);
    assert.strictEqual(check30.enrichmentState.status, 'FAILED');
    
    await AuthorityProofIssuer.requestSystemEnrichment(lead25._id);
    const retryProof = await AuthorityProofIssuer.resolveSystemProof(lead25._id);
    assert.ok(retryProof instanceof ServerAuthorityProof);
    console.log("30. PASS"); testsRun++;

    console.log("\n--- PROOF-BOUND MUTATION TESTS ---");
    const lead31 = await Lead.create({ firstName: 'Bypass', mobile: '5555555555', owner: user1._id });
    try { await runFullLeadEnrichment(lead31._id); assert.fail(); } catch(e) { assert.ok(e.message.includes("SECURITY_VIOLATION")); console.log("31. PASS - Direct Engine Bypass Blocked"); testsRun++; }

    const lead32 = await Lead.create({ firstName: 'FailedCompletion', mobile: '6666666666', owner: user1._id });
    await AuthorityProofIssuer.requestSystemEnrichment(lead32._id);
    const workerJob = { data: { leadId: lead32._id }, id: 'job32' };
    
    
    const origFind = Lead.findByIdAndUpdate;
    Lead.findByIdAndUpdate = async function(...args) {
        if (args[0] && args[0].toString() === lead32._id.toString() && args[1] && (args[1].intent_index !== undefined || (args[1].$set && args[1].$set.intent_index !== undefined))) {
            throw new Error('Forced DB Failure in Enrichment');
        }
        return origFind.apply(this, args);
    };
    
    // Add job to queue and wait
    await AuthorityProofIssuer.requestSystemEnrichment(lead32._id);
    await new Promise(r => setTimeout(r, 500)); // wait for mock queue
    
    Lead.findByIdAndUpdate = origFind;
    
    const check32 = await Lead.findById(lead32._id);
    assert.strictEqual(check32.enrichmentState.status, 'FAILED');
    console.log("32. PASS - Failed Engine run resolves to FAILED status, not COMPLETED"); testsRun++;

    console.log(`\n✅ ALL ${testsRun} TESTS EXECUTED AND PASSED`);
    
    await mongoose.disconnect();
    await replSet.stop();
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
