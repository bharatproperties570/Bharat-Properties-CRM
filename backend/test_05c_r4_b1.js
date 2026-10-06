import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import { DealMutationService } from './services/DealMutationService.js';
import { LeadMutationService } from './services/LeadMutationService.js';
import AIPolicyEngine from './services/ai/AIPolicyEngine.js';

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

    console.log("\n--- DEAL MUTATION TESTS ---");
    // 1. Authorized HUMAN_USER Deal mutation
    const r1 = await DealMutationService.executeVerificationUpdate(deal1._id, { price: 2000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.strictEqual(r1.deal.price, 2000);
    console.log("1. PASS");

    // 2. Unauthorized HUMAN_USER Deal mutation
    try {
        await DealMutationService.executeVerificationUpdate(deal2._id, { price: 3000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail("Should block");
    } catch(e) { assert.strictEqual(e.status, 403); console.log("2. PASS"); }

    // 5. WEBHOOK with valid authorization context
    const r5 = await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', targetId: deal2._id.toString() });
    assert.strictEqual(r5.deal.stage, 'Quote');
    console.log("5. PASS");

    // 6. WEBHOOK arbitrary unrelated Deal -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123', targetId: deal2._id.toString() });
        assert.fail("Should block");
    } catch(e) { assert.strictEqual(e.status, 403); console.log("6. PASS"); }

    // 7. WEBHOOK missing authorization context -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123' }); // missing targetId
        assert.fail("Should block");
    } catch(e) { assert.strictEqual(e.status, 403); console.log("7. PASS"); }

    // 10. SYSTEM Deal mutation -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { price: 9000 }, { actorType: 'SYSTEM', actorId: 'sys1', targetId: deal1._id.toString() });
        assert.fail("Should block");
    } catch (e) { assert.strictEqual(e.status, 403); console.log("10. PASS"); }

    console.log("\n--- LEAD MUTATION TESTS ---");
    // 3. HUMAN_USER authorized Lead
    const r3 = await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 50 }, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.strictEqual(r3.lead.ai_closing_probability, 50);
    console.log("3. PASS");

    // 4. HUMAN_USER unauthorized Lead
    try {
        await LeadMutationService.executeEnrichmentUpdate(lead2._id, { ai_closing_probability: 60 }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail("Should block");
    } catch(e) { assert.strictEqual(e.status, 403); console.log("4. PASS"); }

    // 8. SYSTEM valid enrichment
    const r8 = await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', targetId: lead1._id.toString() });
    assert.strictEqual(r8.lead.ai_closing_probability, 85);
    console.log("8. PASS");

    // 9. SYSTEM arbitrary/invalid target authority -> BLOCK
    try {
        await LeadMutationService.executeEnrichmentUpdate(lead2._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1', targetId: lead1._id.toString() });
        assert.fail("Should block");
    } catch(e) { assert.strictEqual(e.status, 403); console.log("9. PASS"); }

    // 11. WORKER without initiator -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Closed' }, { actorType: 'WORKER', actorId: 'w1' });
        assert.fail("Should block");
    } catch (e) { assert.strictEqual(e.status, 403); console.log("11. PASS"); }

    // 12. Unauthorized field -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { fakeField: 123 }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail("Should block");
    } catch (e) { assert.ok(e.message.includes("Unauthorized field")); console.log("12. PASS"); }

    // 13. Mongo operator injection -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { '$set': { stage: 'Closed' } }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail("Should block");
    } catch (e) { assert.ok(e.message.includes("Unauthorized field")); console.log("13. PASS"); }

    // 14. invalid price type -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { price: '2000' }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail("Should block");
    } catch(e) { assert.ok(e.message.includes("Invalid price")); console.log("14. PASS"); }

    // 15. invalid probability type -> BLOCK
    try {
        await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: '85' }, { actorType: 'SYSTEM', actorId: 'sys1', targetId: lead1._id.toString() });
        assert.fail("Should block");
    } catch(e) { assert.ok(e.message.includes("Invalid ai_closing_probability")); console.log("15. PASS"); }

    // 16. invalid probability range -> BLOCK
    try {
        await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 105 }, { actorType: 'SYSTEM', actorId: 'sys1', targetId: lead1._id.toString() });
        assert.fail("Should block");
    } catch(e) { assert.ok(e.message.includes("Invalid ai_closing_probability")); console.log("16. PASS"); }

    // 17. invalid Deal stage -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'NonExistent' }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail("Should block");
    } catch(e) { assert.ok(e.message.includes("Invalid Deal stage")); console.log("17. PASS"); }

    // 18. duplicate webhook -> NO-OP
    const r18 = await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Closed Won' }, { actorType: 'WEBHOOK', actorId: 'wh123', targetId: deal2._id.toString() });
    assert.ok(r18.message.includes("Idempotent NO-OP"));
    console.log("18. PASS");

    // 21. verifiedAt server-derived
    assert.ok(r5.deal.verifiedAt instanceof Date);
    console.log("21. PASS");

    // 24. empty mutation -> explicit safe NO-OP
    const r24 = await DealMutationService.executeVerificationUpdate(deal1._id, {}, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.ok(r24.message.includes("No fields to update"));
    console.log("24. PASS");

    // 25. invalid actor -> BLOCK
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { price: 2000 }, { actorType: 'INVALID', actorId: '1' });
        assert.fail("Should block");
    } catch (e) { assert.strictEqual(e.status, 403); console.log("25. PASS"); }

    console.log("\n✅ ALL TESTS PASSED");
    
    await mongoose.disconnect();
    await replSet.stop();
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
