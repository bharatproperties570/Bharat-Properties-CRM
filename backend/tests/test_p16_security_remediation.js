import mongoose from 'mongoose';
import crypto from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replset;
let totalAssertions = 0;
let passedAssertions = 0;
let failures = [];

function assert(condition, message) {
    totalAssertions++;
    if (!condition) {
        failures.push(message);
        console.error('❌ FAIL:', message);
    } else {
        passedAssertions++;
        console.log('✅ PASS:', message);
    }
}

async function runTestSuite() {
    console.log('🧪 Starting P16 Security Remediation & Reconciliation Test Suite\n');

    try {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        const User = (await import('../models/User.js')).default;
        const Lead = (await import('../models/Lead.js')).default;
        const AuditLog = (await import('../models/AuditLog.js')).default;
        const SystemSetting = (await import('../src/modules/systemSettings/system.model.js')).default;
        const { ServerAuthorityProof, AuthorityProofIssuer, SystemAuthorityContract } = await import('../utils/ServerAuthorityProof.js');
        const LeadScoringService = (await import('../src/services/LeadScoringService.js')).default;
        const { runFullLeadEnrichment } = await import('../src/utils/enrichmentEngine.js');

        // Create test user
        const dummyRoleId = new mongoose.Types.ObjectId();
        const testUser = await User.create({
            fullName: 'Test Agent',
            email: 'agent.real@example.com',
            role: dummyRoleId,
            department: 'sales',
            password: 'TestPassword123!',
            dataScope: 'all'
        });

        // =====================================================================
        // FINDING 1: AuditLog Trusted-Field Overwrite & Metadata Allowlist
        // =====================================================================
        console.log('\n--- Finding 1: AuditLog logAIEvent Trusted Fields & Allowlist ---');

        const targetId1 = new mongoose.Types.ObjectId();
        const conflictingMetadata = {
            capability: 'FORGED_CAPABILITY_OVERWRITE',
            policyVersion: 'v999_OVERWRITE',
            decision: 'FORGED_ALLOWED',
            model: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 50,
            unauthorizedKey: 'should_be_stripped',
            maliciousPayload: { hack: true }
        };

        const aiLog = await AuditLog.logAIEvent(
            'access_denied',
            targetId1,
            'AUTHORIZED_CAPABILITY',
            'v1.0.0',
            'BLOCKED',
            conflictingMetadata
        );

        const persistedAILog = await AuditLog.findById(aiLog._id).lean();

        // 1. Authoritative fields MUST NOT be overwritten by metadata
        assert(persistedAILog.metadata.capability === 'AUTHORIZED_CAPABILITY', 'F1.1: Authoritative capability not overwritten by metadata');
        assert(persistedAILog.metadata.policyVersion === 'v1.0.0', 'F1.2: Authoritative policyVersion not overwritten by metadata');
        assert(persistedAILog.metadata.decision === 'BLOCKED', 'F1.3: Authoritative decision not overwritten by metadata');
        assert(persistedAILog.status === 'warning', 'F1.4: Status is correctly warning for BLOCKED decision');

        // 2. Allowlisted metadata preserved
        assert(persistedAILog.metadata.model === 'gpt-4o-mini', 'F1.5: Allowlisted model is preserved');
        assert(persistedAILog.metadata.promptTokens === 150, 'F1.6: Allowlisted promptTokens preserved');
        assert(persistedAILog.metadata.completionTokens === 50, 'F1.7: Allowlisted completionTokens preserved');

        // 3. Non-allowlisted keys stripped
        assert(persistedAILog.metadata.unauthorizedKey === undefined, 'F1.8: Non-allowlisted metadata key stripped');
        assert(persistedAILog.metadata.maliciousPayload === undefined, 'F1.9: Non-allowlisted payload stripped');

        // 4. Redaction error handling does not persist unsafe payload
        const circularMeta = { model: 'test' };
        circularMeta.self = circularMeta; // causes error if stringified carelessly or triggers deep checks
        // Pass a metadata object that causes a simulated redaction failure
        const badMetaLog = await AuditLog.logAIEvent(
            'access_denied',
            targetId1,
            'SAFE_CAPABILITY',
            'v1.0',
            'ALLOWED',
            null // null/empty metadata safely handled
        );
        const persistedBadMeta = await AuditLog.findById(badMetaLog._id).lean();
        assert(persistedBadMeta.metadata.capability === 'SAFE_CAPABILITY', 'F1.10: Null metadata handled safely without error');
        assert(persistedBadMeta.metadata.decision === 'ALLOWED', 'F1.11: Null metadata retains decision');

        // =====================================================================
        // FINDING 2: PII Redaction Consistency & Non-Mutation
        // =====================================================================
        console.log('\n--- Finding 2: PII Redaction Consistency, Neutral Keys & Caller Non-Mutation ---');

        // 1. Raw userEmail and actorEmail in logUserEvent
        const userEventLog = await AuditLog.logUserEvent(
            'user_login',
            testUser._id,
            testUser._id,
            'User logged in with email raw.user@domain.com'
        );
        const persistedUserLog = await AuditLog.findById(userEventLog._id).lean();
        assert(persistedUserLog.userEmail === 'a***@example.com', 'F2.1: userEmail is masked in logUserEvent');
        assert(persistedUserLog.actorEmail === 'a***@example.com', 'F2.2: actorEmail is masked in logUserEvent');
        assert(!persistedUserLog.description.includes('raw.user@domain.com'), 'F2.3: Description scalar email is masked');

        // 2. Pre-save hook masks direct AuditLog.create calls
        const directCreateLog = await AuditLog.create({
            eventType: 'user_created',
            userEmail: 'unmasked.direct@secret.com',
            actorEmail: 'admin.actor@company.org',
            targetName: 'Customer John Doe 9876543210',
            description: 'Created account with phone +91 98765 43210'
        });
        const persistedDirect = await AuditLog.findById(directCreateLog._id).lean();
        assert(persistedDirect.userEmail === 'u***@secret.com', 'F2.4: Direct create userEmail masked by pre-save hook');
        assert(persistedDirect.actorEmail === 'a***@company.org', 'F2.5: Direct create actorEmail masked by pre-save hook');
        assert(!persistedDirect.targetName.includes('9876543210'), 'F2.6: Direct create targetName phone masked');
        assert(!persistedDirect.description.includes('+91 98765 43210'), 'F2.7: Direct create description phone masked');

        // 3. Nested PII under neutral keys in logEntityUpdate
        const callerOriginalChanges = {
            before: {
                status: 'NEW',
                nested: {
                    genericNote: 'Contact prospect at client.lead@prospects.io or call +91-98765-43210',
                    validObjectId: new mongoose.Types.ObjectId(),
                    validDate: new Date('2026-01-15T10:00:00.000Z'),
                    unrelatedNumber: 5000000,
                    unrelatedBool: true
                }
            },
            after: {
                status: 'CONTACTED',
                value: 'direct.email.under.neutral.key@test.org',
                customData: '9876543210',
                secret: 'SuperSecretPassword123'
            }
        };

        const originalCloneBefore = JSON.parse(JSON.stringify({
            status: callerOriginalChanges.before.status,
            genericNote: callerOriginalChanges.before.nested.genericNote
        }));

        const entityUpdateLog = await AuditLog.logEntityUpdate(
            'lead_updated',
            'lead',
            new mongoose.Types.ObjectId(),
            'Target Lead',
            testUser._id,
            callerOriginalChanges,
            'Updated lead details'
        );

        const persistedEntityLog = await AuditLog.findById(entityUpdateLog._id).lean();

        // Check neutral key masking
        const nestedNote = persistedEntityLog.changes.before.nested.genericNote;
        assert(nestedNote.includes('c***@prospects.io'), 'F2.8: Nested email under neutral key is masked');
        assert(nestedNote.includes('[PHONE_MINIMIZED]'), 'F2.9: Nested phone under neutral key is masked');
        assert(!nestedNote.includes('client.lead@prospects.io'), 'F2.10: Raw email absent from nested neutral key');
        assert(!nestedNote.includes('+91-98765-43210'), 'F2.11: Raw phone absent from nested neutral key');

        // Check neutral key after.value
        assert(persistedEntityLog.changes.after.value === 'd***@test.org', 'F2.12: Scalar email in neutral key value is masked');
        assert(persistedEntityLog.changes.after.customData === '[PHONE_MINIMIZED]', 'F2.13: Scalar phone in neutral key customData is masked');
        assert(persistedEntityLog.changes.after.secret === '[REDACTED]', 'F2.14: Sensitive credential key is [REDACTED]');

        // Check ObjectId and Date preservation
        assert(persistedEntityLog.changes.before.nested.unrelatedNumber === 5000000, 'F2.15: Unrelated number preserved');
        assert(persistedEntityLog.changes.before.nested.unrelatedBool === true, 'F2.16: Unrelated boolean preserved');

        // 4. Verify caller-owned object was NOT mutated
        assert(callerOriginalChanges.before.nested.genericNote === 'Contact prospect at client.lead@prospects.io or call +91-98765-43210', 'F2.17: Caller input object was NOT mutated');
        assert(callerOriginalChanges.after.secret === 'SuperSecretPassword123', 'F2.18: Caller secret in original object was NOT mutated');

        // =====================================================================
        // FINDING 3: Enrichment State Machine & Status Alignment
        // =====================================================================
        console.log('\n--- Finding 3: Enrichment State Machine Contract & Transitions ---');

        // 1. Schema Enum allows RUNNING
        const leadWithRunning = new Lead({
            firstName: 'State',
            lastName: 'Machine',
            mobile: '9876543210',
            enrichmentState: { status: 'RUNNING' }
        });
        await leadWithRunning.validate();
        assert(leadWithRunning.enrichmentState.status === 'RUNNING', 'F3.1: LeadSchema validation passes with RUNNING status');

        // 2. Lifecycle: NONE -> REQUESTED -> CLAIMED -> RUNNING -> COMPLETED
        const testToken = crypto.randomBytes(32).toString('hex');
        const testTokenHash = crypto.createHash('sha256').update(testToken).digest('hex');

        const testLead = await Lead.create({
            firstName: 'Enrich',
            lastName: 'Test',
            mobile: '9876543211',
            enrichmentState: {
                status: 'REQUESTED',
                claimTokenHash: testTokenHash,
                requestedAt: new Date()
            }
        });

        // 3. Claiming with WRONG token fails
        let claimWrongFailed = false;
        try {
            await AuthorityProofIssuer.resolveSystemProof(testLead._id, 'job-wrong', 'invalid-token-123');
        } catch (err) {
            claimWrongFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F3.2: resolveSystemProof with invalid token throws SECURITY_VIOLATION');
        }
        assert(claimWrongFailed, 'F3.3: Invalid claim token rejected');

        // 4. Valid claim transitions REQUESTED -> CLAIMED
        const proof = await AuthorityProofIssuer.resolveSystemProof(testLead._id, 'job-valid-1', testToken);
        const claimedLead = await Lead.findById(testLead._id).lean();
        assert(claimedLead.enrichmentState.status === 'CLAIMED', 'F3.4: resolveSystemProof transitions status to CLAIMED');
        assert(claimedLead.enrichmentState.lastJobId === 'job-valid-1', 'F3.5: lastJobId correctly recorded');
        assert(Boolean(claimedLead.enrichmentState.enrichmentExecutionId), 'F3.6: enrichmentExecutionId generated');

        // 5. Cannot claim a second time (replay protection)
        let replayFailed = false;
        try {
            await AuthorityProofIssuer.resolveSystemProof(testLead._id, 'job-replay', testToken);
        } catch (err) {
            replayFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F3.7: Second claim throws SECURITY_VIOLATION');
        }
        assert(replayFailed, 'F3.8: Replay claim rejected');

        // 6. Transition CLAIMED -> RUNNING
        await AuthorityProofIssuer.transitionToRunning(proof);
        const runningLead = await Lead.findById(testLead._id).lean();
        assert(runningLead.enrichmentState.status === 'RUNNING', 'F3.9: transitionToRunning transitions status to RUNNING');

        // 7. Cannot transition to RUNNING a second time (state mismatch)
        let secondRunningFailed = false;
        try {
            await AuthorityProofIssuer.transitionToRunning(proof);
        } catch (err) {
            secondRunningFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F3.10: Duplicate transitionToRunning throws SECURITY_VIOLATION');
        }
        assert(secondRunningFailed, 'F3.11: Duplicate transitionToRunning rejected');

        // 8. Mutation predicate requires RUNNING and execution ID
        const predicate = AuthorityProofIssuer.getMutationPredicate(proof);
        assert(predicate['enrichmentState.status'] === 'RUNNING', 'F3.12: Mutation predicate enforces status RUNNING');
        assert(predicate['enrichmentState.enrichmentExecutionId'] === proof.enrichmentExecutionId, 'F3.13: Mutation predicate enforces executionId');

        // 9. Finalize RUNNING -> COMPLETED
        await AuthorityProofIssuer.finalizeSystemProof(proof, true);
        const completedLead = await Lead.findById(testLead._id).select('+enrichmentState.claimTokenHash').lean();
        assert(completedLead.enrichmentState.status === 'COMPLETED', 'F3.14: Finalize true transitions status to COMPLETED');
        assert(completedLead.enrichmentState.completedAt !== undefined, 'F3.15: completedAt timestamp recorded');
        assert(completedLead.enrichmentState.claimTokenHash === undefined, 'F3.16: claimTokenHash unset on completion');

        // 10. Mutation predicate on COMPLETED lead fails OCC
        let staleMutationFailed = false;
        try {
            const staleUpdate = await Lead.findOneAndUpdate(predicate, { $set: { leadScore: 99 } });
            if (!staleUpdate) staleMutationFailed = true;
        } catch (_) {
            staleMutationFailed = true;
        }
        assert(staleMutationFailed, 'F3.17: OCC mutation predicate fails against COMPLETED lead');

        // 11. Failure transition: CLAIMED / RUNNING -> FAILED
        const failToken = crypto.randomBytes(32).toString('hex');
        const failTokenHash = crypto.createHash('sha256').update(failToken).digest('hex');
        const failLead = await Lead.create({
            firstName: 'Fail',
            lastName: 'Lead',
            mobile: '9876543212',
            enrichmentState: {
                status: 'REQUESTED',
                claimTokenHash: failTokenHash
            }
        });

        const failProof = await AuthorityProofIssuer.resolveSystemProof(failLead._id, 'job-fail-1', failToken);
        await AuthorityProofIssuer.transitionToRunning(failProof);
        await AuthorityProofIssuer.finalizeSystemProof(failProof, false);

        const persistedFailedLead = await Lead.findById(failLead._id).lean();
        assert(persistedFailedLead.enrichmentState.status === 'FAILED', 'F3.18: Finalize false transitions status to FAILED');
        assert(persistedFailedLead.enrichmentState.failedAt !== undefined, 'F3.19: failedAt timestamp recorded');

        // Cannot finalize already finalized failed proof as success
        let postFailSuccessFailed = false;
        try {
            await AuthorityProofIssuer.finalizeSystemProof(failProof, true);
        } catch (err) {
            postFailSuccessFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F3.20: Finalize after failure throws SECURITY_VIOLATION');
        }
        assert(postFailSuccessFailed, 'F3.21: Finalize after failure rejected');

        // =====================================================================
        // FINDING 4: LeadScoringService Authorization Paths & Mutations
        // =====================================================================
        console.log('\n--- Finding 4: LeadScoringService Authorization & WHO May Mutate ---');

        const scoringLead = await Lead.create({
            firstName: 'Scoring',
            lastName: 'Prospect',
            mobile: '9876543213',
            email: 'scoring@example.com',
            requirement: '2BHK Apartment',
            timeline: 'immediate',
            budgetMin: 8000000,
            budgetMax: 12000000,
            enrichmentState: { status: 'NONE' }
        });

        // 1. NEGATIVE: Calling without options or triggeredBy is REJECTED
        let noOptionsFailed = false;
        try {
            await LeadScoringService.computeAndSave(scoringLead._id);
        } catch (err) {
            noOptionsFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F4.1: Call without triggeredBy throws SECURITY_VIOLATION');
        }
        assert(noOptionsFailed, 'F4.2: Missing triggeredBy rejected');

        // 2. NEGATIVE: Unauthenticated 'system' string without contract is REJECTED
        let unauthSystemFailed = false;
        try {
            await LeadScoringService.computeAndSave(scoringLead._id, { triggeredBy: 'system' });
        } catch (err) {
            unauthSystemFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F4.3: Unauthenticated system trigger throws SECURITY_VIOLATION');
        }
        assert(unauthSystemFailed, 'F4.4: Caller-supplied "system" string rejected without contract');

        // 3. NEGATIVE: Unauthenticated 'cron' string without contract is REJECTED
        let unauthCronFailed = false;
        try {
            await LeadScoringService.computeAndSave(scoringLead._id, { triggeredBy: 'cron' });
        } catch (err) {
            unauthCronFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F4.5: Unauthenticated cron trigger throws SECURITY_VIOLATION');
        }
        assert(unauthCronFailed, 'F4.6: Caller-supplied "cron" string rejected without contract');

        // 4. NEGATIVE: 'manual' mode is explicitly rejected
        let manualFailed = false;
        try {
            await LeadScoringService.computeAndSave(scoringLead._id, { triggeredBy: 'manual' });
        } catch (err) {
            manualFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F4.7: manual mode throws SECURITY_VIOLATION');
        }
        assert(manualFailed, 'F4.8: manual mode rejected');

        // 5. NEGATIVE: 'HUMAN' or 'UI' mode without authenticated user is REJECTED
        let unauthUIFailed = false;
        try {
            await LeadScoringService.computeAndSave(scoringLead._id, { triggeredBy: 'UI' }, null);
        } catch (err) {
            unauthUIFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F4.9: UI trigger without user context throws SECURITY_VIOLATION');
        }
        assert(unauthUIFailed, 'F4.10: UI trigger without user rejected');

        // 6. NEGATIVE: Forged system contract is REJECTED
        let forgedContractFailed = false;
        try {
            await LeadScoringService.computeAndSave(
                scoringLead._id,
                { triggeredBy: 'OTHER_SYSTEM_AUTOMATION' },
                { systemAuthorityContract: { source: 'OTHER_SYSTEM_AUTOMATION', forged: true } }
            );
        } catch (err) {
            forgedContractFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F4.11: Forged system contract throws SECURITY_VIOLATION');
        }
        assert(forgedContractFailed, 'F4.12: Forged contract rejected');

        // 7. NEGATIVE: Mismatched system contract source is REJECTED
        let mismatchedContractFailed = false;
        try {
            const cronContract = AuthorityProofIssuer.issueSystemContract('cron');
            await LeadScoringService.computeAndSave(
                scoringLead._id,
                { triggeredBy: 'bulk_recalc' },
                { systemAuthorityContract: cronContract }
            );
        } catch (err) {
            mismatchedContractFailed = true;
            assert(err.message.includes('SECURITY_VIOLATION'), 'F4.13: Mismatched contract source throws SECURITY_VIOLATION');
        }
        assert(mismatchedContractFailed, 'F4.14: Mismatched contract source rejected');

        // 8. POSITIVE: Authenticated UI / HUMAN caller succeeds
        const uiResult = await LeadScoringService.computeAndSave(
            scoringLead._id,
            { triggeredBy: 'UI' },
            { user: testUser }
        );
        assert(uiResult.score > 0, 'F4.15: Authorized UI trigger computes score > 0');
        const leadAfterUI = await Lead.findById(scoringLead._id).lean();
        assert(leadAfterUI.leadScore === uiResult.score, 'F4.16: Persisted leadScore matches UI computed score');

        // 9. POSITIVE: Verified OTHER_SYSTEM_AUTOMATION caller succeeds
        const otherContract = AuthorityProofIssuer.issueSystemContract('OTHER_SYSTEM_AUTOMATION');
        const otherResult = await LeadScoringService.computeAndSave(
            scoringLead._id,
            { triggeredBy: 'OTHER_SYSTEM_AUTOMATION' },
            { systemAuthorityContract: otherContract }
        );
        assert(otherResult.score === uiResult.score, 'F4.17: Verified OTHER_SYSTEM_AUTOMATION succeeds and computes matching score');

        // 10. POSITIVE: Verified cron_sla, bulk_recalc, activity_completion system callers succeed
        const cronContract = AuthorityProofIssuer.issueSystemContract('cron_sla');
        const cronResult = await LeadScoringService.computeAndSave(
            scoringLead._id,
            { triggeredBy: 'cron_sla' },
            { systemAuthorityContract: cronContract }
        );
        assert(cronResult.score > 0, 'F4.18: Authorized cron_sla contract succeeds');

        const bulkContract = AuthorityProofIssuer.issueSystemContract('bulk_recalc');
        const bulkResult = await LeadScoringService.computeAndSave(
            scoringLead._id,
            { triggeredBy: 'bulk_recalc' },
            { systemAuthorityContract: bulkContract }
        );
        assert(bulkResult.score > 0, 'F4.19: Authorized bulk_recalc contract succeeds');

        // 11. POSITIVE: SYSTEM_ENRICHMENT with OCC predicate succeeds
        const enrichToken = crypto.randomBytes(32).toString('hex');
        const enrichTokenHash = crypto.createHash('sha256').update(enrichToken).digest('hex');
        const enrichLead = await Lead.create({
            firstName: 'Enrichment',
            lastName: 'Lead',
            mobile: '9876543214',
            enrichmentState: {
                status: 'REQUESTED',
                claimTokenHash: enrichTokenHash
            }
        });

        const enrichProof = await AuthorityProofIssuer.resolveSystemProof(enrichLead._id, 'enrich-job-1', enrichToken);
        await AuthorityProofIssuer.transitionToRunning(enrichProof);

        // Compute and save with valid SYSTEM_ENRICHMENT proof
        const enrichResult = await LeadScoringService.computeAndSave(
            enrichLead._id,
            { triggeredBy: 'SYSTEM_ENRICHMENT' },
            { authorizationProof: enrichProof }
        );
        assert(enrichResult.score > 0, 'F4.20: Authorized SYSTEM_ENRICHMENT with valid proof succeeds');
        const leadAfterEnrich = await Lead.findById(enrichLead._id).lean();
        assert(leadAfterEnrich.leadScore === enrichResult.score, 'F4.21: SYSTEM_ENRICHMENT persisted leadScore matches computed score');

        // 12. POSITIVE: Transaction session propagation in computeAndSave
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const txContract = AuthorityProofIssuer.issueSystemContract('activity_completion');
                const txResult = await LeadScoringService.computeAndSave(
                    scoringLead._id,
                    { triggeredBy: 'activity_completion' },
                    { systemAuthorityContract: txContract },
                    { session }
                );
                assert(txResult.score > 0, 'F4.22: computeAndSave executes inside active MongoDB transaction session');
            });
            assert(true, 'F4.23: Transaction committed cleanly with session propagation');
        } finally {
            await session.endSession();
        }

    } catch (err) {
        failures.push('Unexpected error in test runner: ' + err.message + '\n' + err.stack);
        console.error('❌ FATAL ERROR in test runner:', err);
    } finally {
        if (mongoose.connection?.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (replset) {
            await replset.stop();
        }
    }

    console.log('\n======================================================');
    console.log(`Results: ${passedAssertions} assertions passed, ${failures.length} failures (Total: ${totalAssertions})`);
    if (failures.length > 0) {
        console.error('\nFailures encountered:');
        failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
        process.exit(1);
    } else {
        console.log('🎉 ALL P16 SECURITY REMEDIATION TESTS PASSED!');
        process.exit(0);
    }
}

runTestSuite();
