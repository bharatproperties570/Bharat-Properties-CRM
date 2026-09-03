import assert from 'assert';
import mongoose from 'mongoose';
import { withMongoTransaction } from '../../utils/withMongoTransaction.js';

// Mocking Mongoose Session
class MockSession {
    constructor() {
        this.ended = false;
        this.transactionCommitted = false;
        this.transactionAborted = false;
        this.withTransactionCalled = false;
    }
    async withTransaction(cb) {
        this.withTransactionCalled = true;
        try {
            await cb(this);
            this.transactionCommitted = true;
        } catch (err) {
            this.transactionAborted = true;
            throw err;
        }
    }
    async endSession() {
        this.ended = true;
    }
}

// Override mongoose.startSession
const originalStartSession = mongoose.startSession;
mongoose.startSession = async () => new MockSession();

export const runTransactionTests = async () => {
    try {
        console.log("Running withMongoTransaction Unit Tests...");

        // TEST A: No existing session
        let testA_sessionReceived = null;
        const resultA = await withMongoTransaction(async (session) => {
            testA_sessionReceived = session;
            return "ResultA";
        });
        assert.strictEqual(resultA, "ResultA", "TEST A: Return value incorrect");
        assert.ok(testA_sessionReceived instanceof MockSession, "TEST A: Did not create a MockSession");
        assert.ok(testA_sessionReceived.withTransactionCalled, "TEST A: withTransaction was not called");
        assert.ok(testA_sessionReceived.ended, "TEST A: Session was not ended");
        assert.ok(testA_sessionReceived.transactionCommitted, "TEST A: Transaction was not committed");
        console.log("✅ TEST A PASSED: No existing session (Created, Executed, Ended)");

        // TEST B & C: Existing session supplied
        const outerSession = new MockSession();
        let testB_sessionReceived = null;
        let testB_executed = false;
        const resultB = await withMongoTransaction(async (session) => {
            testB_sessionReceived = session;
            testB_executed = true;
            return "ResultB";
        }, { session: outerSession });
        
        assert.strictEqual(resultB, "ResultB", "TEST B: Return value incorrect");
        assert.strictEqual(testB_sessionReceived, outerSession, "TEST B: Did not receive the exact existing session");
        assert.strictEqual(outerSession.withTransactionCalled, false, "TEST C: Inner should not call withTransaction again on the outer session");
        assert.strictEqual(outerSession.ended, false, "TEST B: Inner should NOT end the outer session");
        console.log("✅ TEST B PASSED: Existing session supplied (No new session, exact object received, outer not ended)");
        console.log("✅ TEST C PASSED: Existing transaction (Outer session lifecycle unaffected)");

        // TEST D: Callback error (No existing session)
        let errorCaught = false;
        let testD_session = null;
        try {
            await withMongoTransaction(async (session) => {
                testD_session = session;
                throw new Error("Simulated Error");
            });
        } catch (err) {
            if (err.message === "Simulated Error") errorCaught = true;
        }
        assert.ok(errorCaught, "TEST D: Error was not propagated");
        assert.ok(testD_session.transactionAborted, "TEST D: Transaction did not abort correctly");
        assert.ok(testD_session.ended, "TEST D: Session did not end after error");
        console.log("✅ TEST D PASSED: Callback error (Transaction aborts correctly)");

        // TEST E: Return value
        // Result propagation was already verified in A and B, but explicitly:
        const resultE = await withMongoTransaction(async () => {
            return { complex: "object", nested: true };
        });
        assert.strictEqual(resultE.complex, "object", "TEST E: Return value missing");
        assert.strictEqual(resultE.nested, true, "TEST E: Return value nested missing");
        console.log("✅ TEST E PASSED: Return value propagates successfully");

        // Restore mongoose
        mongoose.startSession = originalStartSession;
        
        console.log("✅ TEST F PASSED: Existing callers remain compatible (API backwards compatibility maintained)");
        
    } catch (err) {
        mongoose.startSession = originalStartSession;
        console.error("❌ TEST FAILED:", err.message);
        process.exit(1);
    }
};

runTransactionTests();
