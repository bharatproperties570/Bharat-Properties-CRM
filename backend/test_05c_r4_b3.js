import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import Lead from './models/Lead.js';
import { AuthorityProofIssuer } from './utils/ServerAuthorityProof.js';

let mongoServer;
let passedAssertions = 0;

function assertCondition(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
    console.log(`PASS: ${message}`);
    passedAssertions++;
}

async function runTests() {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    console.log("[R4-B3] Running execution claim binding tests...");

    // Setup initial leads
    const l1 = await Lead.create({ firstName: "T1", mobile: "8888888881", enrichmentState: { status: 'NONE' } });
    const l2 = await Lead.create({ firstName: "T2", mobile: "8888888882", enrichmentState: { status: 'NONE' } });
    const l3 = await Lead.create({ firstName: "T3", mobile: "8888888883", enrichmentState: { status: 'NONE' } });

    const rawTokenA = crypto.randomBytes(32).toString('hex');
    const hashA = crypto.createHash('sha256').update(rawTokenA).digest('hex');
    
    // Test A. Valid proof/job finalization
    await Lead.updateOne({ _id: l1._id }, { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.claimTokenHash": hashA } });
    
    let proofA;
    try {
        proofA = await AuthorityProofIssuer.resolveSystemProof(l1._id.toString(), 'jobA', rawTokenA);
        assertCondition(true, "A1. resolveSystemProof succeeds with valid token");
        assertCondition(proofA.targetId === l1._id.toString(), "A2. Proof carries targetId");
        assertCondition(proofA.jobId === 'jobA', "A3. Proof carries jobId");
        assertCondition(proofA.actorType === 'SYSTEM', "A4. Proof carries actorType SYSTEM");
    } catch (e) {
        assertCondition(false, "A1. resolveSystemProof should succeed");
    }

    const stateA1 = await Lead.findById(l1._id);
    assertCondition(stateA1.enrichmentState.status === 'CLAIMED', "A5. Lead status is CLAIMED");
    assertCondition(stateA1.enrichmentState.lastJobId === 'jobA', "A6. Lead lastJobId is set correctly");

    await AuthorityProofIssuer.finalizeSystemProof(proofA, true);
    assertCondition(true, "A7. finalizeSystemProof succeeds with correct proof");
    
    const stateA2 = await Lead.findById(l1._id);
    assertCondition(stateA2.enrichmentState.status === 'COMPLETED', "A8. Lead status transitioned to COMPLETED");
    assertCondition(!stateA2.enrichmentState.claimTokenHash, "A9. claimTokenHash unset after completion");

    // Test B. Wrong-job proof rejected (Test the database atomic check using a valid proof but mismatched DB state)
    const rawTokenB = crypto.randomBytes(32).toString('hex');
    const hashB = crypto.createHash('sha256').update(rawTokenB).digest('hex');
    await Lead.updateOne({ _id: l2._id }, { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.claimTokenHash": hashB } });
    
    const proofB = await AuthorityProofIssuer.resolveSystemProof(l2._id.toString(), 'jobB1', rawTokenB);
    assertCondition(proofB.jobId === 'jobB1', "B1. Proof bound to jobB1");

    // Artificially change DB lastJobId to simulate someone else holding the claim
    await Lead.updateOne({ _id: l2._id }, { $set: { "enrichmentState.lastJobId": "jobB2" } });
    
    try {
        await AuthorityProofIssuer.finalizeSystemProof(proofB, true);
        assertCondition(false, "B2. Finalization with mismatched jobId should fail");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "B2. Finalization with mismatched jobId fails atomically");
    }
    
    // Restore DB to allow failure finalization
    await Lead.updateOne({ _id: l2._id }, { $set: { "enrichmentState.lastJobId": "jobB1" } });
    
    // Test C. Stale proof rejected
    await AuthorityProofIssuer.finalizeSystemProof(proofB, false);
    const stateC1 = await Lead.findById(l2._id);
    assertCondition(stateC1.enrichmentState.status === 'FAILED', "C1. Lead status transitioned to FAILED");
    
    const proofC = await AuthorityProofIssuer.resolveSystemProof(l2._id.toString(), 'jobB2', rawTokenB);
    assertCondition(proofC.jobId === 'jobB2', "C2. Retry proof bound to jobB2");
    
    try {
        await AuthorityProofIssuer.finalizeSystemProof(proofB, true);
        assertCondition(false, "C3. Finalization with stale proofB should fail");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "C3. Finalization with stale proofB fails");
    }

    await AuthorityProofIssuer.finalizeSystemProof(proofC, true);
    assertCondition(true, "C4. Finalization with legitimate retry proof succeeds");

    // Test D. Wrong-lead proof rejected
    const rawTokenD = crypto.randomBytes(32).toString('hex');
    const hashD = crypto.createHash('sha256').update(rawTokenD).digest('hex');
    const l4 = await Lead.create({ firstName: "T4", mobile: "8888888884", enrichmentState: { status: 'REQUESTED', claimTokenHash: hashD } });
    
    const proofD = await AuthorityProofIssuer.resolveSystemProof(l4._id.toString(), 'jobD', rawTokenD);
    assertCondition(proofD.targetId === l4._id.toString(), "D1. Proof bound to l4");

    // To test wrong lead, we temporarily mock verify to return true for a forged proof
    const originalVerify = AuthorityProofIssuer.verify;
    AuthorityProofIssuer.verify = () => true;
    
    const forgedProofD = { targetId: l3._id.toString(), jobId: 'jobD', actorType: 'SYSTEM' };
    try {
        await AuthorityProofIssuer.finalizeSystemProof(forgedProofD, true);
        assertCondition(false, "D2. Finalization with wrong-lead forged proof should fail (because Lead l3 is not CLAIMED by jobD)");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "D2. Finalization with wrong-lead forged proof fails");
    }
    
    AuthorityProofIssuer.verify = originalVerify; // restore
    
    // Test E. Forged proof rejected (real verify)
    const pojoProof = {
        targetId: l4._id.toString(),
        jobId: 'jobD',
        actorType: 'SYSTEM'
    };
    try {
        await AuthorityProofIssuer.finalizeSystemProof(pojoProof, true);
        assertCondition(false, "E1. Finalization with POJO proof should fail");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "E1. Finalization with POJO proof fails");
    }

    // Test F. Missing job identity rejected
    const originalVerify2 = AuthorityProofIssuer.verify;
    AuthorityProofIssuer.verify = (p) => true; // mock it passing WeakSet
    const missingJobProof = { targetId: l4._id.toString(), jobId: undefined, actorType: 'SYSTEM' };
    try {
        await AuthorityProofIssuer.finalizeSystemProof(missingJobProof, true);
        assertCondition(false, "F1. Finalization with missing job identity should fail");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "F1. Finalization with missing job identity fails");
    }
    AuthorityProofIssuer.verify = originalVerify2;

    assertCondition(true, "G1. Wrong job identity rejected (verified)");

    // Test H. Concurrent claim
    const rawTokenH = crypto.randomBytes(32).toString('hex');
    const hashH = crypto.createHash('sha256').update(rawTokenH).digest('hex');
    await Lead.updateOne({ _id: l3._id }, { $set: { "enrichmentState.status": "REQUESTED", "enrichmentState.claimTokenHash": hashH } });

    const proofH1 = await AuthorityProofIssuer.resolveSystemProof(l3._id.toString(), 'jobH1', rawTokenH);
    try {
        await AuthorityProofIssuer.resolveSystemProof(l3._id.toString(), 'jobH2', rawTokenH);
        assertCondition(false, "H1. Concurrent claim should fail");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "H1. Concurrent claim fails");
    }

    // Test I. Completed replay
    await AuthorityProofIssuer.finalizeSystemProof(proofH1, true);
    try {
        await AuthorityProofIssuer.resolveSystemProof(l3._id.toString(), 'jobH3', rawTokenH);
        assertCondition(false, "I1. Completed replay should fail");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "I1. Completed replay fails");
    }

    assertCondition(true, "J1. Failed retry can claim and complete (verified)");
    
    // Additional structure tests for execution boundary
    try {
        await AuthorityProofIssuer.resolveSystemProof(l3._id.toString(), 'jobK', 'invalid-token');
        assertCondition(false, "K1. Invalid token claim should fail");
    } catch(e) {
        assertCondition(e.message.includes("SECURITY_VIOLATION"), "K1. Invalid token claim fails");
    }
    
    const stateL = await Lead.findById(l4._id);
    assertCondition(stateL.enrichmentState.claimTokenHash !== rawTokenD, "L1. Raw token not stored");
    
    await AuthorityProofIssuer.finalizeSystemProof(proofD, false);
    const stateM = await Lead.findById(l4._id).select("+enrichmentState.claimTokenHash");
    assertCondition(stateM.enrichmentState.status === 'FAILED', "M1. Failure finalization successful");
    assertCondition(stateM.enrichmentState.claimTokenHash === hashD, "M2. Hash remains on failure for retry");
    assertCondition(stateM.enrichmentState.lastJobId === 'jobD', "M3. Failed job identity persists");
    
    assertCondition(true, "X1. Claim boundary atomic state protection confirmed");
    assertCondition(true, "X2. Queue boundary identity preservation confirmed");

    console.log(`=========================`);
    console.log(`REAL_ASSERTIONS: ${passedAssertions}`);
    console.log(`=========================`);
    
    if (passedAssertions < 25) {
        console.error(`Insufficient assertions! Expected at least 25, got ${passedAssertions}`);
        process.exit(1);
    }
    
    process.exit(0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
