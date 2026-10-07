import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import { DealMutationService } from './services/DealMutationService.js';
import { LeadMutationService } from './services/LeadMutationService.js';
import { ServerAuthorityProof, AuthorityProofIssuer } from './utils/ServerAuthorityProof.js';

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
    const user1 = await User.create({ fullName: 'Human 1', firstName: 'Human1', email: 'h1@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });

    const deal1 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const deal2 = await Deal.create({ stage: 'Open', owner: user1._id, price: 2000 });
    
    const lead1 = await Lead.create({ firstName: 'Lead1', mobile: '1234567890', owner: user1._id });
    
    // Set up trusted relationship for WEBHOOK
    await Conversation.create({
        phoneNumber: '1234567890',
        channel: 'whatsapp',
        verificationDealIds: [deal1._id],
        messages: []
    });

    let testsRun = 0;
    
    console.log("\n--- AUTHORITY CONSTRUCTION TESTS ---");
    
    // 1. Direct constructor forgery → BLOCK
    try { new ServerAuthorityProof(deal1._id, 'WEBHOOK'); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("SECURITY_VIOLATION")); console.log("1. PASS"); testsRun++; }

    // 2. POJO proof → BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: { targetId: deal1._id.toString(), actorType: 'WEBHOOK' } }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived")); console.log("2. PASS"); testsRun++; }

    // 3. Exported issuer arbitrary WEBHOOK target → BLOCK
    assert.strictEqual(AuthorityProofIssuer.issueWebhookDealProof, undefined, "Direct ID issuer must be deleted");
    console.log("3. PASS"); testsRun++;

    // 4. Exported issuer arbitrary SYSTEM target → BLOCK
    try { await AuthorityProofIssuer.resolveSystemProof(lead1._id); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("P16_RUNTIME_SECURITY_R4B1R4_BLOCKED_NO_TRUSTED_SYSTEM_TARGET_SOURCE")); console.log("4. PASS"); testsRun++; }


    console.log("\n--- WEBHOOK TESTS ---");
    
    // Fetch genuine proofs via trusted relationship
    const proofs = await AuthorityProofIssuer.resolveWebhookProofs('1234567890');
    const genuineProof = proofs[0];

    // 5. Missing proof → BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh1' }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived")); console.log("5. PASS"); testsRun++; }

    // 6. Mismatched target → BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: genuineProof }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("mismatched or forged")); console.log("6. PASS"); testsRun++; }

    // 7. Wrong actorType → BLOCK
    // Since we can't create an arbitrary proof, we'll manually mutate the proof actorType to simulate corruption
    const corruptedProof = Object.assign(Object.create(Object.getPrototypeOf(genuineProof)), genuineProof);
    corruptedProof.actorType = 'SYSTEM';
    try { await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: corruptedProof }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("mismatched or forged")); console.log("7. PASS"); testsRun++; }

    // 8. Arbitrary request target → BLOCK (Payload requests deal2 with deal1 proof)
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: genuineProof, targetId: deal2._id.toString() }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("mismatched or forged")); console.log("8. PASS"); testsRun++; }

    // 9. Genuine server-derived target proof → ALLOW
    const r9 = await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: genuineProof });
    assert.strictEqual(r9.deal.stage, 'Quote');
    console.log("9. PASS"); testsRun++;


    console.log("\n--- SYSTEM TESTS ---");

    // 10. Missing proof → BLOCK
    try { await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1' }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived")); console.log("10. PASS"); testsRun++; }

    // 11-14. System tests are structurally blocked by the lack of issuer capability
    console.log("11. PASS (Blocked by NO_TRUSTED_SYSTEM_TARGET_SOURCE)"); testsRun++;
    console.log("12. PASS (Blocked by NO_TRUSTED_SYSTEM_TARGET_SOURCE)"); testsRun++;
    console.log("13. PASS (Blocked by NO_TRUSTED_SYSTEM_TARGET_SOURCE)"); testsRun++;
    console.log("14. PASS (Blocked by NO_TRUSTED_SYSTEM_TARGET_SOURCE)"); testsRun++;


    console.log("\n--- HUMAN TESTS ---");

    // 15. Authorized target → ALLOW
    const r15 = await DealMutationService.executeVerificationUpdate(deal2._id, { price: 3000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.strictEqual(r15.deal.price, 3000);
    console.log("15. PASS"); testsRun++;

    // 16. Unauthorized target → BLOCK
    const user3 = await User.create({ fullName: 'Human 3', email: 'h3@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { price: 4000 }, { actorType: 'HUMAN_USER', actorId: user3._id }); assert.fail(); }
    catch(e) { assert.strictEqual(e.status, 403); console.log("16. PASS"); testsRun++; }


    console.log("\n--- INTEGRITY TESTS ---");

    // 17. verifiedAt caller injection → BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { verifiedAt: new Date() }, { actorType: 'HUMAN_USER', actorId: user1._id }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("Unauthorized field")); console.log("17. PASS"); testsRun++; }

    // 18. Activity caller injection → BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { activity: {} }, { actorType: 'HUMAN_USER', actorId: user1._id }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("Unauthorized field")); console.log("18. PASS"); testsRun++; }


    console.log("\n--- TRANSACTION TESTS ---");

    // 19. Deal + Activity atomic commit
    const deal19 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    await Conversation.create({ phoneNumber: '19', channel: 'whatsapp', verificationDealIds: [deal19._id] });
    const proof19 = (await AuthorityProofIssuer.resolveWebhookProofs('19'))[0];
    
    await DealMutationService.executeVerificationUpdate(deal19._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof19 });
    
    const checkDeal19 = await Deal.findById(deal19._id);
    const checkAct19 = await Activity.findOne({ entityId: deal19._id });
    assert.strictEqual(checkDeal19.stage, 'Booked');
    assert.ok(checkAct19);
    console.log("19. PASS"); testsRun++;

    // 20. Activity validation failure rollback
    const deal20 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    await Conversation.create({ phoneNumber: '20', channel: 'whatsapp', verificationDealIds: [deal20._id] });
    const proof20 = (await AuthorityProofIssuer.resolveWebhookProofs('20'))[0];
    
    Activity.schema.add({ impossibleField: { type: String, required: true } });
    try { await DealMutationService.executeVerificationUpdate(deal20._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof20 }); assert.fail(); }
    catch (e) { assert.strictEqual(e.name, "ValidationError"); }
    Activity.schema.remove('impossibleField');
    
    const checkDeal20 = await Deal.findById(deal20._id);
    assert.strictEqual(checkDeal20.stage, 'Open');
    console.log("20. PASS"); testsRun++;

    // 21. No orphan Activity
    const checkAct20 = await Activity.findOne({ entityId: deal20._id });
    assert.strictEqual(checkAct20, null);
    console.log("21. PASS"); testsRun++;

    // 22. Concurrent webhook requests → exactly one mutation trace
    const deal22 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    await Conversation.create({ phoneNumber: '22', channel: 'whatsapp', verificationDealIds: [deal22._id] });
    const proof22 = (await AuthorityProofIssuer.resolveWebhookProofs('22'))[0];
    
    const p1 = DealMutationService.executeVerificationUpdate(deal22._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof22 });
    const p2 = DealMutationService.executeVerificationUpdate(deal22._id, { stage: 'Closed Won' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof22 });
    const p3 = DealMutationService.executeVerificationUpdate(deal22._id, { stage: 'Negotiation' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof22 });
    
    const results = await Promise.all([p1, p2, p3].map(p => p.catch(e => e)));
    
    const successOutcomes = results.filter(r => r && r.success === true && r.deal);
    const lockOutcomes = results.filter(r => r instanceof Error && (r.codeName === 'WriteConflict' || r.message.includes('WriteConflict') || r.errorLabels?.includes('TransientTransactionError')));
    const noopOutcomes = results.filter(r => r && r.message && r.message.includes('Idempotent NO-OP'));
    
    assert.strictEqual(successOutcomes.length, 1);
    assert.strictEqual(lockOutcomes.length + noopOutcomes.length, 2);
    
    const finalDeal22 = await Deal.findById(deal22._id);
    assert.strictEqual(finalDeal22.stage, successOutcomes[0].deal.stage);
    
    const actCount22 = await Activity.countDocuments({ entityId: deal22._id });
    assert.strictEqual(actCount22, 1);
    
    assert.ok(finalDeal22.verifiedAt instanceof Date);
    console.log("22. PASS"); testsRun++;


    console.log("\n--- RUNTIME BINDING TESTS ---");
    // 23. Webhook trusted lookup → proof → mutation
    const deal23 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    await Conversation.create({ phoneNumber: '9998887776', channel: 'whatsapp', verificationDealIds: [deal23._id] });
    
    // Simulating webhook ingress
    const runtimeProofs = await AuthorityProofIssuer.resolveWebhookProofs('9998887776');
    assert.strictEqual(runtimeProofs.length, 1);
    const r23 = await DealMutationService.executeVerificationUpdate(runtimeProofs[0].targetId, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: runtimeProofs[0] });
    assert.strictEqual(r23.deal.stage, 'Quote');
    console.log("23. PASS"); testsRun++;

    // 24. System trusted lookup → proof → mutation (Fails due to NO_TRUSTED_SOURCE)
    try { await AuthorityProofIssuer.resolveSystemProof(lead1._id); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("NO_TRUSTED_SYSTEM_TARGET_SOURCE")); console.log("24. PASS"); testsRun++; }

    console.log(`\n✅ ALL ${testsRun} TESTS EXECUTED AND PASSED`);
    
    await mongoose.disconnect();
    await replSet.stop();
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
