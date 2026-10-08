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

        const leadWebhook = await Lead.create({ firstName: "Webhook Target", mobile: "+19999990111", enrichmentState: { status: 'REQUESTED' } });
        await assertThrows(
            () => AuthorityProofIssuer.resolveSystemProof(leadWebhook._id, "webhook-job", webhookProof),
            /The "data" argument must be of type string|Missing execution context/i,
            "Webhook proof cannot be passed to resolveSystemProof() to obtain SYSTEM enrichment authority"
        );
        
        const dbLeadWebhook = await Lead.findById(leadWebhook._id);
        assertCondition(dbLeadWebhook.enrichmentState.status === 'REQUESTED', "No CLAIMED state created via webhook spoof");
        assertCondition(dbLeadWebhook.enrichmentState.enrichmentExecutionId === undefined, "No enrichmentExecutionId created via webhook spoof");
        assertCondition(dbLeadWebhook.enrichmentState.lastJobId === undefined, "No lastJobId binding created via webhook spoof");

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
            
            await assertThrows(
                () => AuthorityProofIssuer.resolveSystemProof(lead3._id, "concurrent-job-loser", token3),
                /Missing execution context/,
                "No second claim can be created by retrying the losing job (R1-B-09)"
            );
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

        console.log("\n--- T-R1-09: Finalization Binding (R1-E) ---");
        
        // 1. wrong execution identity -> rejected
        const lead6 = await Lead.create({ firstName: "Finalization Bad Exec", mobile: "+19999990006", enrichmentState: { status: 'REQUESTED' } });
        const token6 = generateToken();
        lead6.enrichmentState.claimTokenHash = hashToken(token6);
        await lead6.save();
        const proof6 = await AuthorityProofIssuer.resolveSystemProof(lead6._id, "job-6", token6);
        await Lead.updateOne({ _id: lead6._id }, { $set: { "enrichmentState.enrichmentExecutionId": "exec_stolen" } });
        await assertThrows(() => AuthorityProofIssuer.finalizeSystemProof(proof6, true), /SECURITY_VIOLATION: Finalization failed or unauthorized state/, "Finalization with mismatched execution identity in DB rejected");

        // 2. wrong jobId -> rejected
        const lead7 = await Lead.create({ firstName: "Finalization Bad Job", mobile: "+19999990007", enrichmentState: { status: 'REQUESTED' } });
        const token7 = generateToken();
        lead7.enrichmentState.claimTokenHash = hashToken(token7);
        await lead7.save();
        const proof7 = await AuthorityProofIssuer.resolveSystemProof(lead7._id, "job-7", token7);
        await Lead.updateOne({ _id: lead7._id }, { $set: { "enrichmentState.lastJobId": "job-wrong" } });
        await assertThrows(() => AuthorityProofIssuer.finalizeSystemProof(proof7, true), /SECURITY_VIOLATION: Finalization failed or unauthorized state/, "Finalization with wrong jobId in DB rejected");

        // 3. stale/losing execution -> rejected
        const lead8 = await Lead.create({ firstName: "Finalization Stale", mobile: "+19999990008", enrichmentState: { status: 'REQUESTED' } });
        const token8 = generateToken();
        lead8.enrichmentState.claimTokenHash = hashToken(token8);
        await lead8.save();
        const proof8 = await AuthorityProofIssuer.resolveSystemProof(lead8._id, "job-8", token8);
        await Lead.updateOne({ _id: lead8._id }, { $set: { "enrichmentState.status": "COMPLETED" } });
        await assertThrows(() => AuthorityProofIssuer.finalizeSystemProof(proof8, true), /SECURITY_VIOLATION: Finalization failed or unauthorized state/, "Finalization of already completed (stale) execution rejected");

        // 4. correct execution identity -> allowed
        const lead9 = await Lead.create({ firstName: "Finalization Good", mobile: "+19999990009", enrichmentState: { status: 'REQUESTED' } });
        const token9 = generateToken();
        lead9.enrichmentState.claimTokenHash = hashToken(token9);
        await lead9.save();
        const proof9 = await AuthorityProofIssuer.resolveSystemProof(lead9._id, "job-9", token9);
        await AuthorityProofIssuer.finalizeSystemProof(proof9, true);
        const dbLead9 = await Lead.findById(lead9._id);
        assertCondition(dbLead9.enrichmentState.status === 'COMPLETED', "Lead status should be COMPLETED");

        console.log("\n--- T-R1-10: Finalization Wrong Lead (R1-E-02) ---");
        const leadA = await Lead.create({ firstName: "Finalization Lead A", mobile: "+19999990010", enrichmentState: { status: 'REQUESTED' } });
        const tokenA = generateToken();
        leadA.enrichmentState.claimTokenHash = hashToken(tokenA);
        await leadA.save();
        const proofForLeadA = await AuthorityProofIssuer.resolveSystemProof(leadA._id, "job-A", tokenA);

        const leadB = await Lead.create({ firstName: "Finalization Lead B", mobile: "+19999990011", enrichmentState: { status: 'REQUESTED' } });

        // Explicitly invoke against mismatched Lead B context using the actual production API
        const { LeadMutationService } = await import('./services/LeadMutationService.js');
        
        await assertThrows(
            () => LeadMutationService.executeEnrichmentUpdate(leadB._id, { ai_closing_probability: 85 }, {
                actorType: 'SYSTEM',
                actorId: 'worker-1',
                authorizationProof: proofForLeadA
            }),
            /SYSTEM authorization proof mismatched or forged/,
            "Explicit invocation against mismatched Lead B context rejected"
        );

        const dbLeadAAfter = await Lead.findById(leadA._id);
        const dbLeadBAfter = await Lead.findById(leadB._id);
        
        assertCondition(dbLeadAAfter.enrichmentState.status === 'CLAIMED', "Lead A remains unchanged (status CLAIMED)");
        assertCondition(dbLeadBAfter.enrichmentState.status === 'REQUESTED', "Lead B remains unchanged (status REQUESTED)");

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
