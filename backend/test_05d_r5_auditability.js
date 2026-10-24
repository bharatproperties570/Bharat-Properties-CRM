import mongoose from 'mongoose';
import LeadScoringService from './src/services/LeadScoringService.js';
import Lead from './models/Lead.js';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replset;
let totalAssertions = 0;
let passedAssertions = 0;
let failures = [];

function assert(condition, failMsg) {
    totalAssertions++;
    if (!condition) {
        failures.push(failMsg);
    } else {
        passedAssertions++;
    }
}

async function runTest() {
    try {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        const User = (await import('./models/User.js')).default;
        await import('./models/Lead.js');
        const AuditLog = (await import('./models/AuditLog.js')).default;
        const Lead = mongoose.model('Lead');

        // T1: logEntityUpdate legacy & new
        try {
            const log = await AuditLog.logEntityUpdate(
                'lead_updated', 'lead', new mongoose.Types.ObjectId(), 'Test Lead', null,
                { before: 'a', after: 'b' }, 'Legacy Test'
            );
            assert(log && log.eventType === 'lead_updated', "T1: Legacy log failed");
            assert(log.correlationId === undefined, "T1: Correlation ID should be absent");
        } catch(err) { failures.push("T1 Error: " + err.message); }

        // T2 & 3: logEntityUpdate explicit correlationId
        try {
            const logWithCorr = await AuditLog.logEntityUpdate(
                'lead_updated', 'lead', new mongoose.Types.ObjectId(), 'Test Lead', null,
                { before: 'x', after: 'y' }, 'Correlation Test', { correlationId: 'abc-123' }
            );
            assert(logWithCorr.correlationId === 'abc-123', "T2: Explicit correlation failed");
        } catch(err) { failures.push("T2 Error: " + err.message); }

        // T4, 5, 6: logEntityUpdate redaction (extended for R5.1 sensitive keys)
        try {
            const sensitivePayload = {
                normal: "business_data",
                password: "super_secret",
                token: "12345",
                nested: { secret: "hidden", credential: "abc" },
                authorizationProof: "proof1",
                authorization_proof: "proof2",
                "access-token": "proof3"
            };
            const changes = { before: {}, after: sensitivePayload };
            const redactedLog = await AuditLog.logEntityUpdate(
                'lead_updated', 'lead', new mongoose.Types.ObjectId(), 'Test Lead', null, changes, 'Redaction Test'
            );
            assert(sensitivePayload.password === "super_secret", "T6: Caller object mutated!");

            const dbLog = await AuditLog.findById(redactedLog._id).lean();
            const after = dbLog.changes.after;
            assert(after.normal === "business_data", "T4: Normal field lost");

            // Assert all 7 forms are redacted
            assert(after.password === "[REDACTED]", "T5: password not redacted");
            assert(after.token === "[REDACTED]", "T5: token not redacted");
            assert(after.nested.credential === "[REDACTED]", "T5: nested credential not redacted");
            assert(after.nested.secret === "[REDACTED]", "T5: nested secret not redacted");
            assert(after.authorizationProof === "[REDACTED]", "T5: authorizationProof not redacted");
            assert(after.authorization_proof === "[REDACTED]", "T5: authorization_proof not redacted");
            assert(after["access-token"] === "[REDACTED]", "T5: access-token not redacted");
        } catch(err) { failures.push("T4/T5/T6 Error: " + err.message); }

        // T7: logDataTransfer legacy & options
        try {
            const logTransfer = await AuditLog.logDataTransfer(
                new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(),
                'leads', 5, 'Transfer Test'
            );
            assert(logTransfer.eventType === 'data_transferred', "T7: logDataTransfer legacy failed");

            const logTransferOptions = await AuditLog.logDataTransfer(
                new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(),
                'leads', 5, 'Transfer Options Test', { correlationId: 'transfer-123' }
            );
            const dbTransfer = await AuditLog.findById(logTransferOptions._id).lean();
            assert(dbTransfer.correlationId === 'transfer-123', "T7: logDataTransfer options failed");
        } catch(err) { failures.push("T7 Error: " + err.message); }

        // T8: logPermissionChange legacy & options
        try {
            const before = { role: 'agent', password: '123' };
            const after = { role: 'admin', password: '456' };

            const logPerm = await AuditLog.logPermissionChange(
                new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(),
                'role_changed', before, after, 'Perm Test'
            );

            const dbPerm = await AuditLog.findById(logPerm._id).lean();
            assert(dbPerm.metadata.changes.before.password === '[REDACTED]', "T8: logPermissionChange redaction failed");

            const logPermOpt = await AuditLog.logPermissionChange(
                new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(),
                'role_changed', before, after, 'Perm Test', { correlationId: 'perm-123' }
            );
            assert(logPermOpt.correlationId === 'perm-123', "T8: logPermissionChange options failed");
        } catch (err) { failures.push("T8 Error: " + err.message); }

        // T9: logEntityUpdate Tx Rollback
        let session9;
        try {
            session9 = await mongoose.startSession();
            session9.startTransaction();
            const user = new Lead({ firstName: 'Tx', lastName: 'Rollback', mobile: '9999999999' });
            await user.save({ session: session9 });
            const txLog = await AuditLog.logEntityUpdate(
                'lead_updated', 'lead', user._id, 'Test Lead', null,
                { before: {}, after: { id: user._id } }, 'Tx Test', { session: session9 }
            );
            await session9.abortTransaction();

            const txLogExists = await AuditLog.findById(txLog._id).lean();
            const userExists = await Lead.findById(user._id).lean();
            assert(!txLogExists, "T9: Transaction rollback failed - AuditLog persisted");
            assert(!userExists, "T9: Transaction rollback failed - User persisted");
        } catch(err) {
            if (session9) await session9.abortTransaction().catch(() => {});
            failures.push("T9 Error: " + err.message);
        } finally {
            if (session9) await session9.endSession();
        }

        // T10: Supported Value Types
        try {
            const testId = new mongoose.Types.ObjectId();
            const testDate = new Date();
            const supportedPayload = { id: testId, date: testDate };
            const suppLog = await AuditLog.logEntityUpdate(
                'lead_updated', 'lead', new mongoose.Types.ObjectId(), 'Test Lead', null,
                { after: supportedPayload }, 'Supported Type Test'
            );
            const dbLog = await AuditLog.findById(suppLog._id).lean();
            const after = dbLog.changes.after;
            assert(after.id.toString() === testId.toString(), "T10: ObjectId was corrupted");
            assert(new Date(after.date).getTime() === testDate.getTime(), "T10: Date was corrupted");
        } catch (err) { failures.push("T10 Error: " + err.message); }

        // T11: logPermissionChange Tx Rollback
        let session11;
        try {
            session11 = await mongoose.startSession();
            session11.startTransaction();
            const user = new Lead({ firstName: 'Perm', lastName: 'Tx', mobile: '8888888888' });
            await user.save({ session: session11 });
            const txLog = await AuditLog.logPermissionChange(
                new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(),
                'role_changed', {}, {}, 'Tx Perm Test', { session: session11 }
            );
            await session11.abortTransaction();
            assert(!(await AuditLog.findById(txLog._id).lean()), "T11: logPermissionChange Tx rollback failed - AuditLog persisted");
            assert(!(await Lead.findById(user._id).lean()), "T11: logPermissionChange Tx rollback failed - Lead persisted");
        } catch(err) {
            if (session11) await session11.abortTransaction().catch(() => {});
            failures.push("T11 Error: " + err.message);
        } finally {
            if (session11) await session11.endSession();
        }

        // T12: logDataTransfer Tx Rollback
        let session12;
        try {
            session12 = await mongoose.startSession();
            session12.startTransaction();
            const user = new Lead({ firstName: 'Transfer', lastName: 'Tx', mobile: '7777777777' });
            await user.save({ session: session12 });
            const txLog = await AuditLog.logDataTransfer(
                new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(),
                'leads', 5, 'Tx Transfer Test', { session: session12 }
            );
            await session12.abortTransaction();
            assert(!(await AuditLog.findById(txLog._id).lean()), "T12: logDataTransfer Tx rollback failed - AuditLog persisted");
            assert(!(await Lead.findById(user._id).lean()), "T12: logDataTransfer Tx rollback failed - Lead persisted");
        } catch(err) {
            if (session12) await session12.abortTransaction().catch(() => {});
            failures.push("T12 Error: " + err.message);
        } finally {
            if (session12) await session12.endSession();
        }

        // T13: logDataTransfer Explicit Redaction Failure Test
        try {
            const toxicDataType = { get toxic() { throw new Error("Poison!"); } };
            const logTransferFail = await AuditLog.logDataTransfer(
                new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(),
                toxicDataType, 5, 'Transfer Fail Test'
            );
            const dbFail = await AuditLog.findById(logTransferFail._id).lean();
            assert(dbFail.metadata && dbFail.metadata._redaction_error === '[REDACTION_FAILED_PAYLOAD_DROPPED]', "T13: logDataTransfer did not safely handle exception");
            assert(dbFail.metadata.toxic === undefined && dbFail.metadata.dataType === undefined, "T13: logDataTransfer leaked payload on failure");
        } catch(err) { failures.push("T13 Error: " + err.message); }

        // T14: Circular Reference Handling
        try {
            const circObj = { normal: "data" };
            circObj.self = circObj; // Create circular reference

            const logCirc = await AuditLog.logEntityUpdate(
                'lead_updated', 'lead', new mongoose.Types.ObjectId(), 'Test Lead', null,
                { before: {}, after: circObj }, 'Circular Test'
            );

            const dbCirc = await AuditLog.findById(logCirc._id).lean();
            assert(dbCirc.changes.after.self === '[CIRCULAR_REFERENCE]', "T14: Circular reference not correctly flagged");
            assert(dbCirc.changes.after.normal === 'data', "T14: Valid sibling data lost in circular ref handling");
            assert(circObj.self === circObj, "T14: Caller-owned circular object was mutated!");
        } catch(err) { failures.push("T14 Error: " + err.message); }

        // T15: Maximum Depth Handling
        try {
            const deepObj = { level: 1, child: { level: 2, child: { level: 3, child: { level: 4, child: { level: 5, child: { level: 6 } } } } } };

            const logDeep = await AuditLog.logEntityUpdate(
                'lead_updated', 'lead', new mongoose.Types.ObjectId(), 'Test Lead', null,
                { before: {}, after: deepObj }, 'Max Depth Test'
            );

            const dbDeep = await AuditLog.findById(logDeep._id).lean();
            assert(dbDeep.changes.after.level === 1, "T15: Depth 1 missing");
            assert(dbDeep.changes.after.child.level === 2, "T15: Depth 2 missing");
            assert(dbDeep.changes.after.child.child.level === 3, "T15: Depth 3 missing");
            assert(dbDeep.changes.after.child.child.child.level === 4, "T15: Depth 4 missing");
            assert(dbDeep.changes.after.child.child.child.child === '[MAX_DEPTH_EXCEEDED]', "T15: Max depth limit missing or at wrong level");
        } catch(err) { failures.push("T15 Error: " + err.message); }

        // T16: Best-effort Audit Failure Survival in computeAndSave()
        const originalLogEntityUpdate = AuditLog.logEntityUpdate;
        try {
            const leadT16 = new Lead({
                firstName: 'Best', lastName: 'Effort', mobile: '1122334455', email: 't16@test.com',
                requirement: '3BHK', timeline: 'immediate', budgetMin: 15000000
            });
            await leadT16.save();
            const initialLead = await Lead.findById(leadT16._id).lean();
            assert(initialLead.leadScore === undefined || initialLead.leadScore === 0, "T16: Lead score should initially be 0 or undefined");

            let mockCalled = false;
            AuditLog.logEntityUpdate = async () => {
                mockCalled = true;
                throw new Error('Simulated Audit Failure');
            };

            const result = await LeadScoringService.computeAndSave(leadT16._id, { triggeredBy: 'system' });

            assert(mockCalled, "T16: AuditLog.logEntityUpdate was not called");

            const updatedLeadT16 = await Lead.findById(leadT16._id).lean();
            assert(updatedLeadT16.leadScore > 0, "T16: Lead score was NOT updated - best-effort policy violated!");
            assert(updatedLeadT16.leadScore === result.score, "T16: Persisted score does not match computed result");

        } catch(err) {
            failures.push("T16 Error: " + err.message);
        } finally {
            AuditLog.logEntityUpdate = originalLogEntityUpdate;
        }

        // === T17 to T21: Timestamp Persistence and OCC ===
        const crypto = (await import('crypto')).default;
        const { AuthorityProofIssuer } = await import('./utils/ServerAuthorityProof.js');
        const { calculateIntentIndex, runFullLeadEnrichment } = await import('./src/utils/enrichmentEngine.js');
        const unifiedAIService = (await import('./services/UnifiedAIService.js')).default;
        const OutboxEvent = (await import('./models/OutboxEvent.js')).default;

        async function setupAuthorizedLead() {
            const lead = new Lead({ firstName: 'AuthTest', mobile: '5551234567' });
            await lead.save();
            const claimToken = crypto.randomBytes(32).toString('hex');
            const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
            await Lead.updateOne({ _id: lead._id }, {
                $set: {
                    "enrichmentState.status": "REQUESTED",
                    "enrichmentState.claimTokenHash": claimTokenHash
                }
            });
            const proof = await AuthorityProofIssuer.resolveSystemProof(lead._id, 'test_job', claimToken);
            await Lead.updateOne({ _id: lead._id }, { $set: { "enrichmentState.status": "RUNNING" } });
            return { leadId: lead._id, executionContext: { authorizationProof: proof } };
        }

        // T17: calculateIntentIndex
        try {
            const { leadId, executionContext } = await setupAuthorizedLead();
            await calculateIntentIndex(leadId, executionContext);
            const dbLead = await Lead.findById(leadId).lean();
            assert(dbLead.enrichment_formula_score >= 0, "T17: formula score missing");
            assert(dbLead.enrichment_last_run instanceof Date, "T17: enrichment_last_run not persisted as Date");
        } catch (e) { failures.push("T17 Error: " + e.message); }

        // T18: runFullLeadEnrichment with stubbed AI
        const origGenerate = unifiedAIService.generate;
        try {
            unifiedAIService.generate = async () => JSON.stringify({ summary: "Stub", probability: 90 });
            const { leadId, executionContext } = await setupAuthorizedLead();
            const res = await runFullLeadEnrichment(leadId, executionContext);
            assert(res.success !== false, "T18: runFullLeadEnrichment failed: " + res.error);
            const dbLead = await Lead.findById(leadId).lean();
            assert(dbLead.enrichment_formula_score >= 0, "T18: formula score missing");
            assert(dbLead.enrichment_last_run instanceof Date, "T18: enrichment_last_run not persisted as Date");
        } catch (e) { failures.push("T18 Error: " + e.message); }
        finally { unifiedAIService.generate = origGenerate; }

        // T19: Failure behavior (No false timestamp update)
        try {
            unifiedAIService.generate = async () => { throw new Error("AI Timeout"); };
            const { leadId, executionContext } = await setupAuthorizedLead();
            let threw = false;
            try {
                const res = await runFullLeadEnrichment(leadId, executionContext);
                if (res && res.success === false) threw = true;
            } catch(err) { threw = true; }
            assert(threw, "T19: Expected error not caught/returned");
            const dbLead = await Lead.findById(leadId).lean();
            assert(dbLead.enrichment_last_run === undefined, "T19: enrichment_last_run falsely updated on failure");

            // Verify pre-existing timestamp is preserved untouched on failure
            const priorTimestamp = new Date("2026-01-01T00:00:00.000Z");
            const { leadId: leadId2, executionContext: ctx2 } = await setupAuthorizedLead();
            await Lead.updateOne({ _id: leadId2 }, { $set: { enrichment_last_run: priorTimestamp } });
            let threw2 = false;
            try {
                const res2 = await runFullLeadEnrichment(leadId2, ctx2);
                if (res2 && res2.success === false) threw2 = true;
            } catch(err) { threw2 = true; }
            assert(threw2, "T19: Expected error not caught/returned for pre-existing timestamp");
            const dbLead2 = await Lead.findById(leadId2).lean();
            assert(dbLead2.enrichment_last_run && dbLead2.enrichment_last_run.getTime() === priorTimestamp.getTime(), "T19: Pre-existing enrichment_last_run altered on failure");
        } catch (e) { failures.push("T19 Error: " + e.message); }
        finally { unifiedAIService.generate = origGenerate; }

        // T20: Transaction rollback
        const origOutboxEventCreate = OutboxEvent.create.bind(OutboxEvent);
        try {
            unifiedAIService.generate = async () => JSON.stringify({ summary: "Stub", probability: 90 });
            let failurePointReached = false;
            OutboxEvent.create = async () => {
                failurePointReached = true;
                throw new Error("DB Crash during Tx");
            };
            const { leadId, executionContext } = await setupAuthorizedLead();
            let threw = false;
            try {
                const res = await runFullLeadEnrichment(leadId, executionContext);
                if (res && res.success === false) threw = true;
            } catch(err) { threw = true; }
            assert(threw, "T20: Expected Tx error not caught/returned");
            assert(failurePointReached, "T20: Injected OutboxEvent failure point was not reached");
            const dbLead = await Lead.findById(leadId).lean();
            assert(dbLead.enrichment_last_run === undefined, "T20: enrichment_last_run not rolled back!");
            assert(dbLead.enrichment_formula_score == null, "T20: enrichment_formula_score not rolled back!");
        } catch (e) { failures.push("T20 Error: " + e.message); }
        finally {
            unifiedAIService.generate = origGenerate;
            OutboxEvent.create = origOutboxEventCreate;
        }

        // T21: Invalid/stale proof
        try {
            const { leadId, executionContext } = await setupAuthorizedLead();
            // Sabotage the status to make proof stale
            await Lead.updateOne({ _id: leadId }, { $set: { "enrichmentState.status": "COMPLETED" } });
            let threw = false;
            try {
                await calculateIntentIndex(leadId, executionContext);
            } catch(err) {
                threw = true;
                assert(err.message.includes('SECURITY_VIOLATION'), "T21: Error wasn't SECURITY_VIOLATION");
            }
            assert(threw, "T21: Expected security violation not thrown");
            const dbLead = await Lead.findById(leadId).lean();
            assert(dbLead.enrichment_last_run === undefined, "T21: Lead incorrectly mutated despite stale proof");
        } catch (e) { failures.push("T21 Error: " + e.message); }



    } finally {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        if (replset) await replset.stop();
    }

    if (failures.length > 0) {
        console.error("Failures:");
        failures.forEach(f => console.error(f));
        console.error(`Passed ${passedAssertions} of ${totalAssertions} assertions.`);
        process.exit(1);
    } else {
        console.log(`All R5 Auditability verification tests PASSED. (${passedAssertions}/${totalAssertions} assertions executed)`);
        process.exit(0);
    }
}
runTest().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
