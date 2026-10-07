import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import { DealMutationService } from './services/DealMutationService.js';
import { LeadMutationService } from './services/LeadMutationService.js';
import { ServerAuthorityProof, AuthorityProofIssuer } from './utils/ServerAuthorityProof.js';

let replSet;
let Deal, Lead, User, Activity;

async function setup() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    Deal = (await import('./models/Deal.js')).default;
    Lead = (await import('./models/Lead.js')).default;
    User = (await import('./models/User.js')).default;
    Activity = (await import('./models/Activity.js')).default;
    await Deal.init();
    await Lead.init();
    await Activity.init();
    await User.init();
}

async function runTests() {
    await setup();
    console.log("Setting up data...");

    const dummyRoleId = new mongoose.Types.ObjectId();
    const user1 = await User.create({ fullName: 'Human 1', firstName: 'Human1', email: 'h1@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });
    const user2 = await User.create({ fullName: 'Human 2', firstName: 'Human2', email: 'h2@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });

    const deal1 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const deal2 = await Deal.create({ stage: 'Open', owner: user2._id, price: 1000 });
    
    const lead1 = await Lead.create({ firstName: 'Lead1', mobile: '123', owner: user1._id });
    const lead2 = await Lead.create({ firstName: 'Lead2', mobile: '124', owner: user2._id });

    let testsRun = 0;
    
    console.log("\n--- WEBHOOK AUTHORITY TESTS ---");
    
    // 1. WEBHOOK: No proof -> BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123' }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived authorization proof")); console.log("1. PASS"); testsRun++; }

    // 2. WEBHOOK: POJO proof -> BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', authorizationProof: { targetId: deal2._id.toString(), actorType: 'WEBHOOK', _isServerProof: true } }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived authorization proof")); console.log("2. PASS"); testsRun++; }

    // 3. WEBHOOK: Proof with mismatched target -> BLOCK
    try { 
        const badProof = AuthorityProofIssuer.issueWebhookDealProof(deal1._id);
        await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', authorizationProof: badProof }); 
        assert.fail(); 
    } catch(e) { assert.ok(e.message.includes("mismatched or forged")); console.log("3. PASS"); testsRun++; }

    // 4. WEBHOOK: Proof with wrong actorType -> BLOCK
    try { 
        const badActorProof = AuthorityProofIssuer.issueSystemLeadProof(deal2._id);
        await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', authorizationProof: badActorProof }); 
        assert.fail(); 
    } catch(e) { assert.ok(e.message.includes("mismatched or forged")); console.log("4. PASS"); testsRun++; }

    // 5. WEBHOOK: Arbitrary/self-created ServerAuthorityProof -> BLOCK
    try { 
        new ServerAuthorityProof(deal2._id, 'WEBHOOK');
        assert.fail();
    } catch(e) { assert.ok(e.message.includes("SECURITY_VIOLATION")); console.log("5. PASS"); testsRun++; }

    // 6. WEBHOOK: Server-derived legitimate proof -> ALLOW
    const goodProof = AuthorityProofIssuer.issueWebhookDealProof(deal2._id);
    const r6 = await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', authorizationProof: goodProof });
    assert.strictEqual(r6.deal.stage, 'Quote');
    console.log("6. PASS"); testsRun++;

    // 7. WEBHOOK: Forged target with otherwise valid-looking actorId -> BLOCK
    try { 
        await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', targetId: deal1._id.toString() }); 
        assert.fail(); 
    } catch(e) { assert.ok(e.message.includes("missing server-derived authorization proof")); console.log("7. PASS"); testsRun++; }


    console.log("\n--- SYSTEM AUTHORITY TESTS ---");

    // 8. SYSTEM: No proof -> BLOCK
    try { await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1' }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived authorization proof")); console.log("8. PASS"); testsRun++; }

    // 9. SYSTEM: POJO proof -> BLOCK
    try { await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', authorizationProof: { targetId: lead1._id.toString(), actorType: 'SYSTEM' } }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived authorization proof")); console.log("9. PASS"); testsRun++; }

    // 10. SYSTEM: Mismatched target -> BLOCK
    try {
        const badSysProof = AuthorityProofIssuer.issueSystemLeadProof(lead2._id);
        await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', authorizationProof: badSysProof });
        assert.fail();
    } catch(e) { assert.ok(e.message.includes("mismatched or forged")); console.log("10. PASS"); testsRun++; }

    // 11. SYSTEM: Wrong actorType -> BLOCK
    try {
        const badSysActorProof = AuthorityProofIssuer.issueWebhookDealProof(lead1._id);
        await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', authorizationProof: badSysActorProof });
        assert.fail();
    } catch(e) { assert.ok(e.message.includes("mismatched or forged")); console.log("11. PASS"); testsRun++; }

    // 12. SYSTEM: Arbitrary/self-created proof -> BLOCK
    try { 
        new ServerAuthorityProof(lead1._id, 'SYSTEM'); 
        assert.fail(); 
    } catch(e) { assert.ok(e.message.includes("SECURITY_VIOLATION")); console.log("12. PASS"); testsRun++; }

    // 13. SYSTEM: Legitimate server-derived proof -> ALLOW
    const goodSysProof = AuthorityProofIssuer.issueSystemLeadProof(lead1._id);
    const r13 = await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', authorizationProof: goodSysProof });
    assert.strictEqual(r13.lead.ai_closing_probability, 85);
    console.log("13. PASS"); testsRun++;

    // 14. SYSTEM: Arbitrary target with valid-looking system actor -> BLOCK
    try {
        await LeadMutationService.executeEnrichmentUpdate(lead2._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'system-cron', targetId: lead2._id.toString() });
        assert.fail();
    } catch(e) { assert.ok(e.message.includes("missing server-derived authorization proof")); console.log("14. PASS"); testsRun++; }


    console.log("\n--- HUMAN_USER TESTS ---");

    // 15. HUMAN_USER: Authorized target -> ALLOW
    const r15 = await DealMutationService.executeVerificationUpdate(deal1._id, { price: 2000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.strictEqual(r15.deal.price, 2000);
    console.log("15. PASS"); testsRun++;

    // 16. HUMAN_USER: Unauthorized target -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal2._id, { price: 3000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail();
    } catch(e) { assert.strictEqual(e.status, 403); console.log("16. PASS"); testsRun++; }


    console.log("\n--- PROOF INTEGRITY TESTS ---");

    // 17. Caller cannot provide verifiedAt
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { verifiedAt: new Date() }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail();
    } catch (e) { assert.ok(e.message.includes("Unauthorized field")); console.log("17. PASS"); testsRun++; }

    // 18. Caller cannot provide Activity
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { activity: { fake: true } }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail();
    } catch (e) { assert.ok(e.message.includes("Unauthorized field")); console.log("18. PASS"); testsRun++; }

    // 19. Caller cannot manufacture authorization from targetId alone
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh123', targetId: deal1._id.toString() });
        assert.fail();
    } catch (e) { assert.ok(e.message.includes("missing server-derived authorization proof")); console.log("19. PASS"); testsRun++; }


    console.log("\n--- TRANSACTION TESTS ---");

    // 20. Success commits Deal + Activity
    const deal20 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const proof20 = AuthorityProofIssuer.issueWebhookDealProof(deal20._id);
    await DealMutationService.executeVerificationUpdate(deal20._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof20 });
    
    const checkDeal20 = await Deal.findById(deal20._id);
    const checkAct20 = await Activity.findOne({ entityId: deal20._id });
    assert.strictEqual(checkDeal20.stage, 'Booked');
    assert.ok(checkAct20);
    console.log("20. PASS"); testsRun++;

    // 21. Activity failure rolls back Deal (Genuine Mongoose Validation Failure)
    // To cause genuine failure, we will monkey-patch the payload just before Activity.create,
    // or we can pass invalid data if possible. The service hardcodes valid fields for Activity.
    // Let's temporarily make Activity strictly require a field that the service doesn't provide.
    const deal21 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const proof21 = AuthorityProofIssuer.issueWebhookDealProof(deal21._id);
    
    // Monkey patch the model schema temporarily to enforce a failing validation
    Activity.schema.add({ impossibleRequiredField: { type: String, required: true } });
    
    try {
        await DealMutationService.executeVerificationUpdate(deal21._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof21 });
        assert.fail();
    } catch (e) {
        assert.strictEqual(e.name, "ValidationError");
        assert.ok(e.errors.impossibleRequiredField);
    }
    
    // Revert schema change
    Activity.schema.remove('impossibleRequiredField');
    
    const checkDeal21 = await Deal.findById(deal21._id);
    assert.strictEqual(checkDeal21.stage, 'Open'); // Rolled back!
    assert.strictEqual(checkDeal21.verifiedAt, undefined);
    console.log("21. PASS"); testsRun++;

    // 22. Transaction abort leaves no Activity
    const checkAct21 = await Activity.findOne({ entityId: deal21._id });
    assert.strictEqual(checkAct21, null);
    console.log("22. PASS"); testsRun++;

    // 23. Concurrent requests produce exactly one mutation trace
    const deal23 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const proof23 = AuthorityProofIssuer.issueWebhookDealProof(deal23._id);
    
    const p1 = DealMutationService.executeVerificationUpdate(deal23._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof23 });
    const p2 = DealMutationService.executeVerificationUpdate(deal23._id, { stage: 'Closed Won' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof23 });
    const p3 = DealMutationService.executeVerificationUpdate(deal23._id, { stage: 'Negotiation' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proof23 });
    
    const results = await Promise.all([p1, p2, p3].map(p => p.catch(e => e)));
    
    const successOutcomes = results.filter(r => r && r.success === true && r.deal);
    const lockOutcomes = results.filter(r => r instanceof Error && (r.codeName === 'WriteConflict' || r.message.includes('WriteConflict') || r.errorLabels?.includes('TransientTransactionError')));
    const noopOutcomes = results.filter(r => r && r.message && r.message.includes('Idempotent NO-OP'));
    
    assert.strictEqual(successOutcomes.length, 1, "Expected exactly 1 successful mutation");
    assert.strictEqual(successOutcomes.length + lockOutcomes.length + noopOutcomes.length, 3, "Expected exactly 3 classified outcomes");
    
    const finalDeal = await Deal.findById(deal23._id);
    assert.strictEqual(finalDeal.stage, successOutcomes[0].deal.stage, "Final deal state must match the single successful mutation");
    
    const actCount = await Activity.countDocuments({ entityId: deal23._id });
    assert.strictEqual(actCount, 1, "Exactly 1 Activity must be created");
    
    assert.ok(finalDeal.verifiedAt instanceof Date, "verifiedAt must exist exactly once");
    console.log("23. PASS"); testsRun++;

    console.log(`\n✅ ALL ${testsRun} TESTS EXECUTED AND PASSED`);
    
    await mongoose.disconnect();
    await replSet.stop();
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
