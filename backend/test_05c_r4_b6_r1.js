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

        console.log("\n--- T-R1-06: WEBHOOK cannot manufacture SYSTEM execution identity ---");
        await assertThrows(
            () => AuthorityProofIssuer.resolveWebhookProofs("+19999990003"),
            /SECURITY_VIOLATION/,
            "Webhook proof should throw or not give enrichmentExecutionId"
        );

        console.log("\n--- T-R1-07: Duplicate/concurrent claim cannot produce two active owners ---");
        const lead3 = await Lead.create({
            firstName: "Concurrent Test Lead",
            mobile: "+19999990004",
            enrichmentState: { status: 'REQUESTED' }
        });
        const token3 = generateToken();
        lead3.enrichmentState.claimTokenHash = hashToken(token3);
        await lead3.save();

        const proof3a = await AuthorityProofIssuer.resolveSystemProof(lead3._id, "concurrent-job-1", token3);
        assertCondition(proof3a.enrichmentExecutionId !== null, "Job 1 claims successfully");

        await assertThrows(
            () => AuthorityProofIssuer.resolveSystemProof(lead3._id, "concurrent-job-2", token3),
            /Missing execution context/,
            "Job 2 should not be able to claim a CLAIMED lead"
        );

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
