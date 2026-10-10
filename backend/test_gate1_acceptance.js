import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import AuditLog from './models/AuditLog.js';

let replset;
let failures = [];
let passed = 0;

function check(condition, msg) {
    if (!condition) failures.push(msg);
    else passed++;
}

async function runTests() {
    const originalCreate = AuditLog.create;
    try {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        await mongoose.connect(replset.getUri());
        
        mongoose.model('User', new mongoose.Schema({
            fullName: String, email: String, department: String
        }));

        console.log('Running AC-1 (Asynchronous error propagation)');
        AuditLog.create = async function() { throw new Error('Mocked DuplicateKey'); };
        
        let ac1Passed = false;
        try {
            await AuditLog.logUserEvent('user_login', null, null, 'Test');
        } catch (err) {
            check(err.message === 'Mocked DuplicateKey', 'AC-1: Incorrect error message');
            ac1Passed = true;
        }
        check(ac1Passed, 'AC-1: Promise did not reject');
        AuditLog.create = originalCreate;

        console.log('Running AC-3 (Redaction failure safety)');
        const poison = new Proxy({}, {
            ownKeys() { throw new Error('Poison'); }
        });
        const docAC3 = await AuditLog.logUserEvent('user_login', null, null, 'Test', { poison });
        check(docAC3.metadata._redaction_error === '[REDACTION_FAILED_PAYLOAD_DROPPED]', 'AC-3: Redaction sentinel missing');
        check(!docAC3.metadata.poison, 'AC-3: Poison data persisted');

        console.log('Running AC-6 (URL normalization table-driven tests)');
        const urlTests = [
            { input: '/api/v1/users', expected: '/api/v1/users' },
            { input: '/api\\\\v1/users', expected: '/api/v1/users' },
            { input: '/api\\\\\\\\v1/users', expected: '/api/v1/users' },
            { input: 'https://admin:123@api.com//v1/?q=secret#fragment', expected: '/v1/' },
            { input: null, expected: 'unknown' },
            { input: undefined, expected: 'unknown' },
            { input: '', expected: 'unknown' },
            { input: '   ', expected: 'unknown' },
            { input: {}, expected: 'unknown' },
            { input: '/api/token/12345', expected: '/api/token/12345' },
            { input: '/api/auth/reset-password/secret-token-123', expected: '/api/auth/reset-password/[REDACTED_TOKEN]' },
            { input: '/api/dynamicForm/public/resolve-token/abcd-5678', expected: '/api/dynamicForm/public/resolve-token/[REDACTED_TOKEN]' },
            { input: '/api/portfolios/public/share-token-999', expected: '/api/portfolios/public/[REDACTED_TOKEN]' },
            { input: '/api/public/matches/match-token-777', expected: '/api/public/matches/[REDACTED_TOKEN]' }
        ];

        for (const t of urlTests) {
            const doc = await AuditLog.logUserEvent('user_login', null, null, 'URL test', { requestInfo: { url: t.input } });
            check(doc.metadata.requestInfo.url === t.expected, `AC-6: Expected ${t.expected} for input ${t.input}, got ${doc.metadata.requestInfo.url}`);
        }

        console.log('Running AC-7 (PII minimization - Scalar & Metadata)');
        const docAC7 = await AuditLog.logEntityUpdate(
            'user_updated', 'role', null,
            'Name John Doe', // No PII
            null,
            { after: { email: 'test@example.com', phoneToken: 'secret123' } },
            'Failed login for suraj@example.com, Call +1-800-555-1234. Error at /app/x.js:12'
        );
        check(docAC7.targetName === 'Name John Doe', 'AC-7: TargetName inappropriately masked');
        check(docAC7.description.includes('s***@example.com'), 'AC-7: Description email not masked');
        check(docAC7.description.includes('[PHONE_MINIMIZED]'), 'AC-7: Description phone not masked');
        check(docAC7.changes.after.email === '[PII_MINIMIZED]', 'AC-7: Metadata email not minimized');
        check(docAC7.changes.after.phoneToken === '[REDACTED]', 'AC-7: Credential overlap not redacted');
        
        // Test errorMessage pre-save hook
        docAC7.errorMessage = "Failed to connect to Mongo at db.js:40\n    at connect (db.js:40)\n    at main (index.js:10)";
        await docAC7.save();
        check(docAC7.errorMessage.includes('[STACK_STRIPPED]'), 'AC-7: Stack trace not stripped from errorMessage');
        check(!docAC7.errorMessage.includes('at connect'), 'AC-7: Stack trace leaked');

        console.log('Running AC-8 (Options allowlist)');
        let optionsPassed = null;
        AuditLog.create = async function(docs, opts) {
            optionsPassed = opts;
            return [{ _id: 'fake' }];
        };
        await AuditLog.logUserEvent('user_login', null, null, 'Test', {}, { session: 'fake-session', customFlag: true });
        check(optionsPassed.session === 'fake-session', 'AC-8: session not forwarded');
        check(optionsPassed.customFlag === undefined, 'AC-8: customFlag leaked through allowlist');
        AuditLog.create = originalCreate;

        if (failures.length > 0) {
            console.error('FAILURES:', failures);
            process.exitCode = 1;
        } else {
            console.log(`ALL ${passed} ACCEPTANCE TESTS PASSED`);
            process.exitCode = 0;
        }
    } catch (err) {
        console.error('Test harness error:', err);
        process.exitCode = 1;
    } finally {
        AuditLog.create = originalCreate; // ensure it's restored even if an error throws
        try {
            await mongoose.disconnect();
        } finally {
            if (replset) await replset.stop();
        }
    }
}
runTests();
