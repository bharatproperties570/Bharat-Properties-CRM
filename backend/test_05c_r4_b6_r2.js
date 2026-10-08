import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import crypto from 'crypto';
import Lead from './models/Lead.js';
import { AuthorityProofIssuer } from './utils/ServerAuthorityProof.js';
import { runFullLeadEnrichment } from './src/utils/enrichmentEngine.js';
import LeadScoringService from './src/services/LeadScoringService.js';
import unifiedAIService from './services/UnifiedAIService.js';
unifiedAIService.generate = async () => '{"summary": "Mock summary", "probability": 90}';

let mongoServer;

async function setup() {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoServer.getUri());
}

async function teardown() {
    await mongoose.disconnect();
    await mongoServer.stop();
}

async function createLead(companyId) {
    const claimToken = crypto.randomBytes(32).toString('hex');
    const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
    const lead = await Lead.create({
        firstName: 'Test',
        lastName: 'R2',
        mobile: Math.floor(Math.random() * 9000000000) + 1000000000 + '',
        companyId: companyId,
        enrichmentState: {
            status: 'REQUESTED',
            claimTokenHash,
            requestedAt: new Date()
        }
    });
    return { lead, claimToken };
}

async function runTests() {
    let passed = 0, failed = 0;
    const assert = (cond, msg) => { if (cond) { passed++; console.log('✅ PASS: ' + msg); } else { failed++; console.error('❌ FAIL: ' + msg); } };

    const companyId = new mongoose.Types.ObjectId();
    const otherCompanyId = new mongoose.Types.ObjectId();

    // 1. T-R2-01: Correct execution -> success
    const t1 = await createLead(companyId);
    const proof1 = await AuthorityProofIssuer.resolveSystemProof(t1.lead._id, 'job-1', t1.claimToken);
    await AuthorityProofIssuer.transitionToRunning(proof1);
    const result1 = await runFullLeadEnrichment(t1.lead._id, { authorizationProof: proof1 });
    assert(result1.success === true, 'T-R2-01 correct execution -> success');

    // 2. CLAIMED mutation -> reject (T-R2-06), RUNNING mutation -> success (T-R2-07)
    const t2 = await createLead(companyId);
    const proof2 = await AuthorityProofIssuer.resolveSystemProof(t2.lead._id, 'job-2', t2.claimToken);
    // proof2 is in CLAIMED state right now
    const result2 = await runFullLeadEnrichment(t2.lead._id, { authorizationProof: proof2 });
    assert(result2.success === false && result2.error.includes("SECURITY_VIOLATION"), 'T-R2-06 CLAIMED mutation -> reject');
    await AuthorityProofIssuer.transitionToRunning(proof2);
    const result2_running = await runFullLeadEnrichment(t2.lead._id, { authorizationProof: proof2 });
    assert(result2_running.success === true, 'T-R2-07 RUNNING mutation -> success');

    // 3. T-R2-12: Concurrent mutation
    const t3 = await createLead(companyId);
    const proof3 = await AuthorityProofIssuer.resolveSystemProof(t3.lead._id, 'job-3', t3.claimToken);
    await AuthorityProofIssuer.transitionToRunning(proof3);
    
    // Mock AI service to delay so we can simulate state change during pure computation
    const originalGenerate = unifiedAIService.generate;
    unifiedAIService.generate = async () => {
        await new Promise(r => setTimeout(r, 100)); // Delay
        return '{"summary": "Mock summary", "probability": 90}';
    };

    // Worker A attempts enrichment. While it's in the AI delay, Worker B invalidates the state.
    const attemptA = runFullLeadEnrichment(t3.lead._id, { authorizationProof: proof3 });
    
    // Wait a bit to ensure attemptA has started its pure computation phase
    await new Promise(r => setTimeout(r, 20));
    
    // Worker B invalidates execution state (e.g., job was cancelled/superseded or finalized)
    const attemptB = AuthorityProofIssuer.finalizeSystemProof(proof3, false); // FAILED

    const results = await Promise.allSettled([attemptA, attemptB]);
    
    // Restore
    unifiedAIService.generate = originalGenerate;

    const resA = results[0];
    const resB = results[1];

    assert(resA.status === 'fulfilled' && resA.value.success === false && resA.value.error.includes('SECURITY_VIOLATION'), 'T-R2-12 EXACTLY ONE: attempt A must be rejected due to state invalidation during AI');
    assert(resB.status === 'fulfilled', 'T-R2-12 EXACTLY ONE: attempt B (invalidation) succeeds');
    
    const finalLead = await Lead.findById(t3.lead._id);
    assert(finalLead.enrichmentState.status === 'FAILED', 'T-R2-12: Lead status is FAILED');
    assert(!finalLead.intent_tags || finalLead.intent_tags.length === 0, 'T-R2-12: Loser writes ZERO protected state');

    // 3b. T-R2-12B: COMPETING EXECUTIONS
    const tRace = await createLead(companyId);
    const claimTokenA = tRace.claimToken;
    const proofA = await AuthorityProofIssuer.resolveSystemProof(tRace.lead._id, 'job-A', claimTokenA);
    // Simulate execution A taking too long, getting stuck in RUNNING
    await AuthorityProofIssuer.transitionToRunning(proofA);

    // Simulate system retry: forcefully requesting it again after timeout
    const newClaimTokenB = (await import('crypto')).default.randomBytes(32).toString('hex');
    const claimTokenHashB = (await import('crypto')).default.createHash('sha256').update(newClaimTokenB).digest('hex');
    await Lead.findByIdAndUpdate(tRace.lead._id, {
        'enrichmentState.status': 'REQUESTED',
        'enrichmentState.claimTokenHash': claimTokenHashB
    });

    const proofB = await AuthorityProofIssuer.resolveSystemProof(tRace.lead._id, 'job-B', newClaimTokenB);
    await AuthorityProofIssuer.transitionToRunning(proofB);
    
    // Now B is RUNNING. A and B attempt to persist concurrently.
    const attemptRaceA = runFullLeadEnrichment(tRace.lead._id, { authorizationProof: proofA });
    const attemptRaceB = runFullLeadEnrichment(tRace.lead._id, { authorizationProof: proofB });
    const resultsRace = await Promise.allSettled([attemptRaceA, attemptRaceB]);
    
    assert(resultsRace[0].status === 'fulfilled' && resultsRace[0].value.success === false && resultsRace[0].value.error.includes('SECURITY_VIOLATION'), 'T-R2-12B: Execution A rejected via canonical predicate');
    assert(resultsRace[1].status === 'fulfilled' && resultsRace[1].value.success === true, 'T-R2-12B: Execution B succeeds');
    
    const leadRace = await Lead.findById(tRace.lead._id);
    assert(leadRace.enrichmentState.lastJobId === 'job-B', 'T-R2-12B: Winning execution state is preserved');


    // 4. Scoring bypass (T-R2-13, 14, 15)
    try {
        await LeadScoringService.computeAndSave(t1.lead._id, { triggeredBy: 'SYSTEM_ENRICHMENT' }, null);
        assert(false, 'T-R2-13 scoring without executionContext -> reject');
    } catch(e) { assert(e.message.includes('SECURITY_VIOLATION'), 'T-R2-13 scoring without executionContext -> reject'); }
    
    // 5. Wrong execution ID
    const proofBad = { ...proof1, enrichmentExecutionId: 'fake_exec_id' };
    try {
        await runFullLeadEnrichment(t1.lead._id, { authorizationProof: proofBad });
        assert(false, 'T-R2-02 wrong executionId -> reject');
    } catch(e) {
        assert(e.message.includes('Invalid authority proof'), 'T-R2-02 wrong executionId -> reject');
    }

    // 6. COMPLETED mutation -> reject (T-R2-08)

    const tComp = await createLead(companyId);
    const proofCompTrue = await AuthorityProofIssuer.resolveSystemProof(tComp.lead._id, 'job-c2', tComp.claimToken);
    await AuthorityProofIssuer.transitionToRunning(proofCompTrue);
    await runFullLeadEnrichment(tComp.lead._id, { authorizationProof: proofCompTrue });
    console.log(proofCompTrue);
    console.log(await Lead.findById(tComp.lead._id));
    try { await AuthorityProofIssuer.finalizeSystemProof(proofCompTrue, true); } catch(e) { console.error('Finalization Error:', e.message); }
    const resultComp = await runFullLeadEnrichment(tComp.lead._id, { authorizationProof: proofCompTrue });
    assert(resultComp.success === false && resultComp.error.includes("SECURITY_VIOLATION"), 'T-R2-08 COMPLETED mutation -> reject');
    
    // 7. Cross-company (T-R2-17)
    try {
        const proofWrongComp = { ...proof1, companyId: otherCompanyId.toString() };
        await AuthorityProofIssuer.getMutationPredicate(proofWrongComp);
        assert(false, 'T-R2-17 cross-company mutation -> reject');
    } catch(e) { assert(e.message.includes('SECURITY_VIOLATION'), 'T-R2-17 cross-company mutation -> reject'); }


    // 8. T-R2-FailureA: Lead succeeds but EnrichmentLog fails
    const tFailA = await createLead(companyId);
    const proofFailA = await AuthorityProofIssuer.resolveSystemProof(tFailA.lead._id, 'job-fail-A', tFailA.claimToken);
    await AuthorityProofIssuer.transitionToRunning(proofFailA);
    const EnrichmentLog = (await import('./models/EnrichmentLog.js')).default;
    const origEnrichCreate = EnrichmentLog.create;
    EnrichmentLog.create = async () => { throw new Error("Mock EnrichmentLog Failure"); };
    const IntentKeywordRule = (await import('./models/IntentKeywordRule.js')).default;
    await IntentKeywordRule.create({ keyword: 'urgent', autoTag: 'Hot', roleType: 'Buyer', intentImpact: 10, isActive: true });
    await Lead.findByIdAndUpdate(tFailA.lead._id, { notes: 'this is urgent' });
    const resultFailA = await runFullLeadEnrichment(tFailA.lead._id, { authorizationProof: proofFailA });
    assert(resultFailA.success === false && resultFailA.error.includes("Mock EnrichmentLog Failure"), 'T-R2-FailureA: EnrichmentLog failure rolls back transaction');
    const leadFailA = await Lead.findById(tFailA.lead._id);
    assert(leadFailA.intent_index === 0, 'T-R2-FailureA: Lead mutation was rolled back');
    EnrichmentLog.create = origEnrichCreate;

    // 9. T-R2-FailureB: Lead succeeds but OutboxEvent fails
    const tFailB = await createLead(companyId);
    const proofFailB = await AuthorityProofIssuer.resolveSystemProof(tFailB.lead._id, 'job-fail-B', tFailB.claimToken);
    await AuthorityProofIssuer.transitionToRunning(proofFailB);
    const OutboxEvent = (await import('./models/OutboxEvent.js')).default;
    const origOutboxCreate = OutboxEvent.create;
    OutboxEvent.create = async () => { throw new Error("Mock OutboxEvent Failure"); };
    const resultFailB = await runFullLeadEnrichment(tFailB.lead._id, { authorizationProof: proofFailB });
    assert(resultFailB.success === false && resultFailB.error.includes("Mock OutboxEvent Failure"), 'T-R2-FailureB: OutboxEvent failure rolls back transaction');
    const leadFailB = await Lead.findById(tFailB.lead._id);
    assert(leadFailB.intent_index === 0, 'T-R2-FailureB: Lead mutation was rolled back');
    OutboxEvent.create = origOutboxCreate;

    // 10. T-R2-FailureC: Scoring failure
    const tFailC = await createLead(companyId);
    const proofFailC = await AuthorityProofIssuer.resolveSystemProof(tFailC.lead._id, 'job-fail-C', tFailC.claimToken);
    await AuthorityProofIssuer.transitionToRunning(proofFailC);
    
    const origScoring = LeadScoringService.computeAndSave;
    LeadScoringService.computeAndSave = async () => { throw new Error("Mock Scoring Failure"); };
    
    const resultFailC = await runFullLeadEnrichment(tFailC.lead._id, { authorizationProof: proofFailC });
    assert(resultFailC.success === false && resultFailC.error.includes("Mock Scoring Failure"), 'T-R2-FailureC: Scoring failure rolls back transaction');
    const leadFailC = await Lead.findById(tFailC.lead._id);
    assert(leadFailC.intent_index === 0, 'T-R2-FailureC: Lead mutation was rolled back');
    assert(!leadFailC.enrichment_formula_score, 'T-R2-FailureC: Lead score fields rolled back');
    
    LeadScoringService.computeAndSave = origScoring;

    
    console.log(`\n=========================\nREAL_ASSERTIONS: ${passed}\n=========================`);
    if (failed > 0) process.exit(1);
}

setup().then(runTests).then(teardown).catch(e => { console.error(e); process.exit(1); });
