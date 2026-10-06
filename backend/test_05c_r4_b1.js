import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import assert from 'assert';
import { DealMutationService } from './services/DealMutationService.js';
import { LeadMutationService } from './services/LeadMutationService.js';
import AIPolicyEngine from './services/ai/AIPolicyEngine.js';

let mongoServer;
let Deal, Lead, User, Activity;

async function setup() {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    Deal = (await import('./models/Deal.js')).default;
    Lead = (await import('./models/Lead.js')).default;
    User = (await import('./models/User.js')).default;
    Activity = (await import('./models/Activity.js')).default;
}

async function runTests() {
    await setup();
    console.log("Setting up data...");

    const dummyRoleId = new mongoose.Types.ObjectId();

    const user1 = await User.create({ fullName: 'Human 1', firstName: 'Human1', email: 'h1@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });
    const user2 = await User.create({ fullName: 'Human 2', firstName: 'Human2', email: 'h2@test.com', dataScope: 'assigned', role: dummyRoleId, department: 'sales', password: 'test' });

    const deal1 = await Deal.create({ stage: 'Open', owner: user1._id, price: 1000 });
    const deal2 = await Deal.create({ stage: 'Open', owner: user2._id, price: 1000 });
    const lead1 = await Lead.create({ firstName: 'Lead1', mobile: '123' });

    console.log("\n--- DEAL MUTATION TESTS ---");
    // A. Authorized HUMAN_USER Deal mutation
    console.log("A. Authorized HUMAN_USER Deal mutation");
    const rA = await DealMutationService.executeVerificationUpdate(deal1._id, { price: 2000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
    assert.strictEqual(rA.deal.price, 2000);

    // B. Unauthorized HUMAN_USER Deal mutation (user1 tries to edit deal2)
    console.log("B. Unauthorized HUMAN_USER Deal mutation");
    try {
        await DealMutationService.executeVerificationUpdate(deal2._id, { price: 3000 }, { actorType: 'HUMAN_USER', actorId: user1._id });
        assert.fail("Should have blocked");
    } catch(e) {
        assert.strictEqual(e.status, 403);
    }

    // C. Authorized WEBHOOK Deal verification
    console.log("C. Authorized WEBHOOK Deal verification");
    // Removing runValidators temporarily to simulate the bypass if needed, but 'Quote' is in the enum.
    const rC = await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Quote' }, { actorType: 'WEBHOOK', actorId: 'wh123' });
    assert.strictEqual(rC.deal.stage, 'Quote');

    // T. verifiedAt server derivation & R/S. Duplicate/Concurrent verification (Idempotency)
    console.log("T/R. verifiedAt server derivation & Idempotency");
    assert.ok(rC.deal.verifiedAt instanceof Date);
    const rC2 = await DealMutationService.executeVerificationUpdate(deal2._id, { stage: 'Closed Won' }, { actorType: 'WEBHOOK', actorId: 'wh123' });
    assert.ok(rC2.message.includes("Idempotent NO-OP"));

    // F. SYSTEM attempting Deal mutation
    console.log("F. SYSTEM attempting Deal mutation");
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { price: 9000 }, { actorType: 'SYSTEM', actorId: 'sys1' });
        assert.fail("Should have blocked");
    } catch (e) {
        assert.strictEqual(e.status, 403);
    }

    // K. Unauthorized field
    console.log("K. Unauthorized field");
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { fakeField: 123 }, { actorType: 'WEBHOOK', actorId: 'wh123' });
        assert.fail("Should have blocked");
    } catch (e) {
        assert.ok(e.message.includes("Unauthorized field mutation"));
    }

    // M. Mongo operator injection
    console.log("M. Mongo operator injection");
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { '$set': { stage: 'Closed' } }, { actorType: 'WEBHOOK', actorId: 'wh123' });
        assert.fail("Should have blocked");
    } catch (e) {
        assert.ok(e.message.includes("Unauthorized field mutation"));
    }

    // H. WORKER privilege escalation attempt
    console.log("H. WORKER privilege escalation attempt");
    try {
        await DealMutationService.executeVerificationUpdate(deal1._id, { stage: 'Closed' }, { actorType: 'WORKER', actorId: 'w1' });
        assert.fail("Should have blocked");
    } catch (e) {
        assert.strictEqual(e.status, 403);
    }

    console.log("\n--- LEAD ENRICHMENT TESTS ---");
    // E. SYSTEM authorized Lead enrichment
    console.log("E. SYSTEM authorized Lead enrichment");
    const rE = await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 85 }, { actorType: 'SYSTEM', actorId: 'sys1' });
    assert.strictEqual(rE.lead.ai_closing_probability, 85);

    // D. WEBHOOK attempting Lead mutation
    console.log("D. WEBHOOK attempting Lead mutation");
    try {
        await LeadMutationService.executeEnrichmentUpdate(lead1._id, { ai_closing_probability: 99 }, { actorType: 'WEBHOOK', actorId: 'wh1' });
        assert.fail("Should have blocked");
    } catch (e) {
        assert.strictEqual(e.status, 403);
    }

    console.log("\n--- AIPolicyEngine Auth Tests ---");
    const resA = await AIPolicyEngine.authorize({ action: 'VERIFICATION_UPDATE' }, { actorType: 'WEBHOOK', actorId: '1' }, 'AI_DEAL_VERIFICATION');
    assert.strictEqual(resA.decision, 'ALLOW');

    const resB = await AIPolicyEngine.authorize({ action: 'ENRICHMENT_UPDATE' }, { actorType: 'WEBHOOK', actorId: '1' }, 'AI_LEAD_ENRICHMENT');
    assert.strictEqual(resB.decision, 'BLOCK');
    assert.strictEqual(resB.reasonCode, 'BLOCKED_UNAUTHORIZED_ACTOR');

    console.log("\n✅ ALL TESTS PASSED");
    
    await mongoose.disconnect();
    await mongoServer.stop();
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
