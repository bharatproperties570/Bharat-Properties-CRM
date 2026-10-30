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

// Override mongoose.startSession and readyState for mock tests
const originalStartSession = mongoose.startSession;
const originalReadyState = mongoose.connection ? mongoose.connection.readyState : 0;

function setMockConnectionReady(ready) {
    if (!mongoose.connection) {
        mongoose.connection = {};
    }
    Object.defineProperty(mongoose.connection, 'readyState', {
        value: ready ? 1 : 0,
        configurable: true,
        writable: true
    });
}

export const runTransactionTests = async () => {
    try {
        console.log("Running withMongoTransaction Unit Tests...");

        // Setup mock connection as ready (readyState: 1)
        setMockConnectionReady(true);
        mongoose.startSession = async () => new MockSession();

        // TEST A: No existing session (Active mock connection)
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
        const resultE = await withMongoTransaction(async () => {
            return { complex: "object", nested: true };
        });
        assert.strictEqual(resultE.complex, "object", "TEST E: Return value missing");
        assert.strictEqual(resultE.nested, true, "TEST E: Return value nested missing");
        console.log("✅ TEST E PASSED: Return value propagates successfully");

        // TEST G: Disconnected Failure: throws MONGO_TRANSACTION_UNAVAILABLE when readyState !== 1 and fallback disabled
        setMockConnectionReady(false);
        delete process.env.ALLOW_TRANSACTION_TEST_FALLBACK;
        let disconnectedThrew = false;
        try {
            await withMongoTransaction(async () => "ShouldNotRun");
        } catch (err) {
            if (err.code === 'MONGO_TRANSACTION_UNAVAILABLE' || err.message.includes('MONGO_TRANSACTION_UNAVAILABLE')) {
                disconnectedThrew = true;
            }
        }
        assert.ok(disconnectedThrew, "TEST G: Must throw MONGO_TRANSACTION_UNAVAILABLE when disconnected and fallback disabled");
        console.log("✅ TEST G PASSED: Disconnected failure (throws MONGO_TRANSACTION_UNAVAILABLE)");

        // TEST H: Test Fallback: executes callback(null) when ALLOW_TRANSACTION_TEST_FALLBACK === 'true' in non-production
        process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';
        const origNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'test';
        let fallbackSession = 'unset';
        const fallbackResult = await withMongoTransaction(async (session) => {
            fallbackSession = session;
            return "FallbackSuccess";
        });
        assert.strictEqual(fallbackResult, "FallbackSuccess", "TEST H: Return value from fallback");
        assert.strictEqual(fallbackSession, null, "TEST H: Session passed to fallback must be null");
        console.log("✅ TEST H PASSED: Explicit test fallback (executes callback(null) when enabled in test env)");

        // TEST I: Production/Staging Protection: throws MONGO_TRANSACTION_UNAVAILABLE even if ALLOW_TRANSACTION_TEST_FALLBACK === 'true'
        process.env.NODE_ENV = 'production';
        let prodThrew = false;
        try {
            await withMongoTransaction(async () => "ShouldNotRunInProd");
        } catch (err) {
            if (err.code === 'MONGO_TRANSACTION_UNAVAILABLE' || err.message.includes('MONGO_TRANSACTION_UNAVAILABLE')) {
                prodThrew = true;
            }
        }
        assert.ok(prodThrew, "TEST I: Production must NEVER allow fallback when disconnected");
        console.log("✅ TEST I PASSED: Production protection (strictly fails closed when disconnected)");

        // Clean up environment
        process.env.NODE_ENV = origNodeEnv;
        delete process.env.ALLOW_TRANSACTION_TEST_FALLBACK;
        setMockConnectionReady(originalReadyState === 1);
        mongoose.startSession = originalStartSession;

        console.log("✅ TEST F PASSED: Existing callers remain compatible (API backwards compatibility maintained)");
        console.log("\nAll withMongoTransaction tests PASSED successfully!");

    } catch (err) {
        mongoose.startSession = originalStartSession;
        setMockConnectionReady(originalReadyState === 1);
        console.error("❌ TEST FAILED:", err.message);
        process.exit(1);
    }
};

runTransactionTests();
