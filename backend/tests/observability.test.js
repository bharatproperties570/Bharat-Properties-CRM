import assert from 'assert';
import { logger, correlationStore } from '../src/utils/logger.js';
import { correlationMiddleware } from '../src/middlewares/correlation.middleware.js';
import { Writable } from 'stream';
import pino from 'pino';
import api from '@opentelemetry/api';

// We'll create a local pino instance mirroring the main one for capturing stream
const capturedLogs = [];
const stream = new Writable({
    write(chunk, encoding, callback) {
        capturedLogs.push(JSON.parse(chunk.toString()));
        callback();
    }
});

const testLogger = pino({
    level: 'info',
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'error.config.headers.authorization',
            'password',
            '*.password',
            '*.*.password',
            'token',
            '*.token',
            '*.*.token',
            'secret',
            '*.secret',
            '*.*.secret'
        ],
        censor: '[REDACTED]',
        remove: false
    },
    mixin() {
        const metadata = {};
        const reqId = correlationStore.getStore();
        if (reqId) metadata.reqId = reqId;

        const span = api.trace.getSpan(api.context.active());
        if (span) {
            const spanContext = span.spanContext();
            metadata.traceId = spanContext.traceId;
            metadata.spanId = spanContext.spanId;
        }
        return metadata;
    }
}, stream);

async function runTests() {
    console.log("Running Observability Tests...");

    // Test 1: JSON Schema
    testLogger.info({ route: "/api/test" }, "Test message");
    const log1 = capturedLogs.pop();
    assert.strictEqual(log1.msg, "Test message");
    assert.strictEqual(log1.route, "/api/test");
    assert.ok(log1.time, "Timestamp is missing");
    assert.ok(log1.level, "Level is missing");

    // Test 2: Redaction & Nested Redaction
    testLogger.info({ 
        password: "my-secret-password", 
        req: { headers: { authorization: "Bearer token123", cookie: "session=1" } },
        error: { config: { headers: { authorization: "Basic XYZ" } } },
        nested: { deep: { token: "secret-token", secret: "foo" } }
    }, "Secret test");
    const log2 = capturedLogs.pop();
    assert.strictEqual(log2.password, "[REDACTED]");
    assert.strictEqual(log2.req.headers.authorization, "[REDACTED]");
    assert.strictEqual(log2.req.headers.cookie, "[REDACTED]");
    assert.strictEqual(log2.error.config.headers.authorization, "[REDACTED]");
    assert.strictEqual(log2.nested.deep.token, "[REDACTED]");
    assert.strictEqual(log2.nested.deep.secret, "[REDACTED]");

    // Test 3: Correlation ID Generation (Missing header)
    const mockReqMissing = { headers: {} };
    const mockResMissing = { setHeader: (k, v) => mockResMissing.headers[k] = v, headers: {} };
    
    correlationMiddleware(mockReqMissing, mockResMissing, () => {
        const generatedId = mockResMissing.headers['x-request-id'];
        assert.ok(generatedId, "Should generate a UUID");
        assert.strictEqual(generatedId.length, 36, "Should be valid UUID length");
        
        testLogger.info({}, "Inside middleware");
        const log3 = capturedLogs.pop();
        assert.strictEqual(log3.reqId, generatedId, "Logger should capture reqId from AsyncLocalStorage");
    });

    // Test 4: Correlation ID Validation (Valid header)
    const mockReqValid = { headers: { 'x-request-id': 'custom-id-123' } };
    const mockResValid = { setHeader: (k, v) => mockResValid.headers[k] = v, headers: {} };
    
    correlationMiddleware(mockReqValid, mockResValid, () => {
        assert.strictEqual(mockResValid.headers['x-request-id'], 'custom-id-123');
    });

    // Test 5: Correlation ID Rejection (Invalid chars)
    const mockReqInvalidChars = { headers: { 'x-request-id': 'invalid_id; drop table' } };
    const mockResInvalidChars = { setHeader: (k, v) => mockResInvalidChars.headers[k] = v, headers: {} };
    
    correlationMiddleware(mockReqInvalidChars, mockResInvalidChars, () => {
        assert.notStrictEqual(mockResInvalidChars.headers['x-request-id'], 'invalid_id; drop table');
        assert.ok(mockResInvalidChars.headers['x-request-id'].length === 36, "Should generate a new UUID");
    });

    // Test 6: OTel Span Context
    const originalGetSpan = api.trace.getSpan;
    api.trace.getSpan = () => ({
        spanContext: () => ({ traceId: 'test-trace-123', spanId: 'test-span-456' })
    });
    
    testLogger.info({}, "Testing span");
    const logSpan = capturedLogs.pop();
    assert.strictEqual(logSpan.traceId, 'test-trace-123', "traceId should exist");
    assert.strictEqual(logSpan.spanId, 'test-span-456', "spanId should exist");
    
    // Restore
    api.trace.getSpan = originalGetSpan;

    console.log("✅ All Observability Tests Passed!");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
