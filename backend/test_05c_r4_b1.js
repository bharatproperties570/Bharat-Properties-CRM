import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import { DealMutationService } from './services/DealMutationService.js';
import { LeadMutationService } from './services/LeadMutationService.js';
import { ServerAuthorityProof } from './utils/ServerAuthorityProof.js';

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
    
    console.log("\n--- AUTHORITY TESTS ---");
    // 1. WEBHOOK with no authorization proof -> BLOCK
    try { await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123' }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived")); testsRun++; }

    // 2. WEBHOOK with mismatched target -> BLOCK
    try { 
        const badProof = new ServerAuthorityProof(deal1._id, 'WEBHOOK');
        await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', authorizationProof: badProof }); 
        assert.fail(); 
    } catch(e) { assert.ok(e.message.includes("mismatched or forged")); testsRun++; }

    // 3. WEBHOOK with forged/self-created target proof -> BLOCK (using POJO instead of class instance)
    try { 
        const forgedProof = { targetId: deal2._id.toString(), actorType: 'WEBHOOK', _isServerProof: true };
        await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', authorizationProof: forgedProof }); 
        assert.fail(); 
    } catch(e) { assert.ok(e.message.includes("missing server-derived")); testsRun++; }

    // 4. WEBHOOK with legitimate server-derived proof -> ALLOW
    const goodProof = new ServerAuthorityProof(deal2._id, 'WEBHOOK');
    const r4 = await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', authorizationProof: goodProof });
    assert.strictEqual(r4.deal.stage, 'Quote');
    testsRun++;

    // 5. SYSTEM with no authorization proof -> BLOCK
    try { await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1' }); assert.fail(); }
    catch(e) { assert.ok(e.message.includes("missing server-derived")); testsRun++; }

    // 6. SYSTEM with mismatched target -> BLOCK
    try {
        const badSysProof = new ServerAuthorityProof(lead2._id, 'SYSTEM');
        await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', authorizationProof: badSysProof });
        assert.fail();
    } catch(e) { assert.ok(e.message.includes("mismatched or forged")); testsRun++; }

    // 7. SYSTEM with forged/self-created target proof -> BLOCK
    try {
        const forgedSysProof = { targetId: lead1._id.toString(), actorType: 'SYSTEM' };
        await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', authorizationProof: forgedSysProof });
        assert.fail();
    } catch(e) { assert.ok(e.message.includes("missing server-derived")); testsRun++; }

    // 8. SYSTEM with legitimate server-derived proof -> ALLOW
    const goodSysProof = new ServerAuthorityProof(lead1._id, 'SYSTEM');
    const r8 = await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', authorizationProof: goodSysProof });
    assert.strictEqual(r8.lead.ai_closing_probability, 85);
    testsRun++;

    // 9. HUMAN_USER authorized target -> ALLOW
    const r9 = await DealMutationService.executeVerificationUpdate(deal1._id, { price: 2000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.strictEqual(r9.deal.price, 2000);
    testsRun++;

    // 10. HUMAN_USER unauthorized target -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal2._id, { price: 3000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail();
    } catch(e) { assert.strictEqual(e.status, 403); testsRun++; }


    console.log("\n--- TRANSACTION & CONCURRENCY TESTS ---");
    
    // A. Deal mutation + Activity success -> both committed
    const dealA = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const proofA = new ServerAuthorityProof(dealA._id, 'WEBHOOK');
    await DealMutationService.executeVerificationUpdate(dealA._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proofA });
    
    const checkDealA = await Deal.findById(dealA._id);
    const checkActA = await Activity.findOne({ entityId: dealA._id });
    assert.strictEqual(checkDealA.stage, 'Booked');
    assert.ok(checkActA);
    testsRun++; // A

    // B. Activity creation failure -> Deal mutation rolled back
    const dealB = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const proofB = new ServerAuthorityProof(dealB._id, 'WEBHOOK');
    
    const originalActivityCreate = Activity.create;
    Activity.create = async function() { throw new Error("Mocked Activity Failure"); };
    
    try {
        await DealMutationService.executeVerificationUpdate(dealB._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proofB });
        assert.fail();
    } catch (e) {
        assert.ok(e.message.includes("Mocked Activity Failure"));
    }
    
    Activity.create = originalActivityCreate;
    
    const checkDealB = await Deal.findById(dealB._id);
    assert.strictEqual(checkDealB.stage, 'Open'); // Rolled back!
    assert.strictEqual(checkDealB.verifiedAt, undefined);
    testsRun++; // B

    // C. Transaction abort -> Deal unchanged, Activity absent (Already tested by B effectively, counting as C)
    const checkActB = await Activity.findOne({ entityId: dealB._id });
    assert.strictEqual(checkActB, null);
    testsRun++; // C

    // D. Concurrent webhook attempts against same Deal
    const dealD = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const proofD = new ServerAuthorityProof(dealD._id, 'WEBHOOK');
    
    const p1 = DealMutationService.executeVerificationUpdate(dealD._id, { stage: 'Booked' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proofD });
    const p2 = DealMutationService.executeVerificationUpdate(dealD._id, { stage: 'Closed Won' }, { actorType: 'WEBHOOK', actorId: 'wh1', authorizationProof: proofD });
    
    const results = await Promise.all([p1, p2].map(p => p.catch(e => e)));
    
    const successCount = results.filter(r => r.deal && r.deal.stage).length;
    const noopCount = results.filter(r => r.message && r.message.includes("Idempotent NO-OP")).length;
    
    if (successCount !== 1 || (noopCount !== 1 && !results.some(r => r instanceof Error && (r.message.includes("WriteConflict") || r.message.includes("TransientTransactionError"))))) {
        console.error("CONCURRENCY RESULTS:", results);
    }
    assert.strictEqual(successCount, 1);
    assert.ok(noopCount === 1 || results.some(r => r instanceof Error));
    
    const actCount = await Activity.countDocuments({ entityId: dealD._id });
    assert.strictEqual(actCount, 1);
    testsRun++; // D

    // E. verifiedAt remains server-derived
    const checkDealD = await Deal.findById(dealD._id);
    assert.ok(checkDealD.verifiedAt instanceof Date);
    testsRun++; // E

    // F. caller-supplied verifiedAt is ignored/rejected (rejected because it's not in ALLOWED_FIELDS)
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { verifiedAt: new Date() }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail();
    } catch (e) { assert.ok(e.message.includes("Unauthorized field")); testsRun++; } // F

    // G. caller-supplied Activity object is ignored/rejected
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { activity: { fake: true } }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail();
    } catch (e) { assert.ok(e.message.includes("Unauthorized field")); testsRun++; } // G

    console.log(`\n✅ ALL ${testsRun} TESTS PASSED`);
    
    await mongoose.disconnect();
    await replSet.stop();
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
