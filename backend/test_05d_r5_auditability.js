import mongoose from 'mongoose';
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
