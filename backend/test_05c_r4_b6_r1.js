import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

let passedAssertions = 0;
let failedAssertions = 0;

function assertCondition(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        passedAssertions++;
    } else {
        console.error(`❌ FAIL: ${message}`);
        failedAssertions++;
    }
}

async function assertThrows(promiseFn, expectedPattern, message) {
    try {
        await promiseFn();
        console.error(`❌ FAIL: ${message} (Did not throw)`);
        failedAssertions++;
    } catch (err) {
        if (expectedPattern && !expectedPattern.test(err.message)) {
            console.error(`❌ FAIL: ${message} (Threw wrong error: ${err.message})`);
            failedAssertions++;
        } else {
            console.log(`✅ PASS: ${message}`);
            passedAssertions++;
        }
    }
}

import Lead from './models/Lead.js';
import { AuthorityProofIssuer } from './utils/ServerAuthorityProof.js';

let mongoServer;

async function runTests() {
    try {
        console.log("Starting R4-B6-R1 tests with MongoMemoryServer...\n");
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        const generateToken = () => crypto.randomBytes(32).toString('hex');
        const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

        console.log("\n--- T-R1-01 to T-R1-04: Execution Identity Binding ---");
        const companyId = new mongoose.Types.ObjectId();
        const lead1 = await Lead.create({
            firstName: "Execution Test Lead",
            mobile: "+19999990001",
            companyId: companyId,
            enrichmentState: { status: 'REQUESTED' }
        });
        const token1 = generateToken();
        lead1.enrichmentState.claimTokenHash = hashToken(token1);
        await lead1.save();

        const jobId1 = "test-job-r1";
        const proof1 = await AuthorityProofIssuer.resolveSystemProof(lead1._id, jobId1, token1);

        assertCondition(proof1 !== null, "Proof should be created");
        assertCondition(proof1.targetId === lead1._id.toString(), "Proof must bind to target Lead (T-R1-02)");
        assertCondition(proof1.jobId === jobId1, "Proof must bind to correct Job ID (T-R1-03)");
        assertCondition(proof1.companyId === companyId.toString(), "Proof must bind to authoritative Company ID (T-R1-04)");
        assertCondition(proof1.enrichmentExecutionId !== null, "Proof must contain generated enrichmentExecutionId (T-R1-01)");
        assertCondition(proof1.enrichmentExecutionId.startsWith('exec_'), "Execution ID format should start with exec_");

        const dbLead1 = await Lead.findById(lead1._id);
        assertCondition(dbLead1.enrichmentState.status === 'CLAIMED', "Lead status should be CLAIMED");
        assertCondition(dbLead1.enrichmentState.enrichmentExecutionId === proof1.enrichmentExecutionId, "Lead should store the execution identity");


        console.log("\n--- T-R1-05: HUMAN cannot manufacture SYSTEM execution identity ---");
        const lead2 = await Lead.create({ firstName: "Human Test", mobile: "+19999990002" });
        await assertThrows(
            () => AuthorityProofIssuer.resolveSystemProof(lead2._id, 'human-job', 'fake-token'),
            /SECURITY_VIOLATION/,
            "Human requests lacking valid DB token should fail"
        );

        console.log("\n--- R1-A (T-R1-06): WEBHOOK cannot manufacture SYSTEM execution identity ---");
        const webhookMobile = "+19999990003";
        const Conversation = (await import('./models/Conversation.js')).default;
        const ServerAuthorityProof = (await import('./utils/ServerAuthorityProof.js')).ServerAuthorityProof;
        
        await Conversation.collection.insertOne({
            userPhone: webhookMobile,
            status: 'open'
        });
        
        const webhookProof = await AuthorityProofIssuer.resolveWebhookProofs(webhookMobile);
        assertCondition(webhookProof !== null, "Webhook proof should resolve successfully without throwing");
        assertCondition(webhookProof.enrichmentExecutionId === undefined, "Webhook proof MUST NOT contain enrichmentExecutionId");
        assertCondition(webhookProof.actorType !== 'SYSTEM', "Webhook proof MUST NOT contain SYSTEM actorType");
        assertCondition(!(webhookProof instanceof ServerAuthorityProof), "Webhook proof MUST NOT be a ServerAuthorityProof capability object");

        console.log("\n--- R1-B (T-R1-07): True Concurrent Claim Race ---");
        const lead3 = await Lead.create({
            firstName: "True Concurrent Race Lead",
            mobile: "+19999990004",
            enrichmentState: { status: 'REQUESTED' }
        });
        const token3 = generateToken();
        lead3.enrichmentState.claimTokenHash = hashToken(token3);
        await lead3.save();

        const claimA = AuthorityProofIssuer.resolveSystemProof(lead3._id, "concurrent-job-A", token3);
        const claimB = AuthorityProofIssuer.resolveSystemProof(lead3._id, "concurrent-job-B", token3);

        const results = await Promise.allSettled([claimA, claimB]);

        const successes = results.filter(r => r.status === 'fulfilled');
        const rejections = results.filter(r => r.status === 'rejected');

        assertCondition(successes.length === 1, "Exactly ONE claim attempt succeeds");
        assertCondition(rejections.length === 1, "Exactly ONE claim attempt fails");
        
        if (rejections.length === 1) {
            assertCondition(
                rejections[0].reason.message.includes("execution context") || rejections[0].reason.message.includes("SECURITY_VIOLATION"),
                "Failing attempt must reject with Missing execution context / SECURITY_VIOLATION"
            );
        }

        const dbLead3 = await Lead.findById(lead3._id).select('+enrichmentState.claimTokenHash');
        assertCondition(dbLead3.enrichmentState.status === 'CLAIMED', "Lead status must be CLAIMED");
        
        if (successes.length === 1) {
            const winningProof = successes[0].value;
            assertCondition(dbLead3.enrichmentState.lastJobId === winningProof.jobId, "Lead.lastJobId must equal the winning job");
            assertCondition(dbLead3.enrichmentState.enrichmentExecutionId !== null, "Lead.enrichmentExecutionId must be present");
            assertCondition(dbLead3.enrichmentState.enrichmentExecutionId === winningProof.enrichmentExecutionId, "Stored execution ID corresponds to the winning proof");
            assertCondition(dbLead3.enrichmentState.claimTokenHash === hashToken(token3), "claimTokenHash remains protected");
        }

        console.log("\n--- T-R1-08: Existing claimTokenHash protection remains intact ---");
        const lead4 = await Lead.create({
            firstName: "Hash Test Lead",
            mobile: "+19999990005",
            enrichmentState: { status: 'REQUESTED' }
        });
        const token4 = generateToken();
        lead4.enrichmentState.claimTokenHash = hashToken(token4);
        await lead4.save();

        await assertThrows(
            () => AuthorityProofIssuer.resolveSystemProof(lead4._id, 'job-wrong-token', 'wrong-token'),
            /Missing execution context/,
            "Should not allow invalid token"
        );

    } catch(err) {
        console.error(err);
    } finally {
        console.log(`\nResults: ${passedAssertions} passed, ${failedAssertions} failed.`);
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
        process.exit(failedAssertions > 0 ? 1 : 0);
    }
}

runTests();
