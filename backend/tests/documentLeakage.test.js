
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { getDownloadUrl } from '../controllers/documentAPI.controller.js';
import DocumentService from '../services/storage/DocumentService.js';
import { StorageError } from '../services/storage/StorageErrors.js';

test('Phase 11.8.1-R1 - Error Information Leakage & URL Logging', async (t) => {
    t.beforeEach(() => {
        mock.method(DocumentService.prototype, 'getDownloadUrl', async (user, documentId, versionId, expiryMs) => {
            if (documentId === 'leak-test') {
                const err = new StorageError('Provider signing failed: Missing credentials for bucket XYZ');
                err.url = 'https://s3.secret.com/doc?sig=secret123';
                throw err;
            }
            return {
                url: `https://signed.example.com/${documentId}?sig=123`,
                expiresAt: Date.now() + expiryMs,
                documentId,
                versionId: 'v1'
            };
        });
    });

    t.afterEach(() => {
        mock.restoreAll();
    });

    const createRes = () => {
        const res = {
            statusCode: null,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.body = data;
                return this;
            }
        };
        return res;
    };

    await t.test('13. Error Leakage - Ensure credentials and URLs do not leak to client', async () => {
        const req = { params: { documentId: 'leak-test' }, query: {}, user: { id: 'u1' } };
        const res = createRes();
        
        let interceptedLogs = '';
        const originalError = console.error;
        console.error = (msg) => { interceptedLogs += msg; };
        
        await getDownloadUrl(req, res);
        
        console.error = originalError; // Restore immediately
        
        // Ensure 500 response
        assert.strictEqual(res.statusCode, 500);
        
        // Ensure body does NOT contain secrets
        const responseString = JSON.stringify(res.body);
        assert.ok(!responseString.includes('XYZ'));
        assert.ok(!responseString.includes('credentials'));
        assert.ok(!responseString.includes('secret123'));
        
        // The error payload should be a generic sanitized message like "Internal storage error" or at least not leak
        // Note: Currently handleDomainError defaults to just a generic 500 without leaking message if it's an unhandled error, 
        // Wait, handleDomainError for unknown errors usually logs and returns "Internal Server Error". Let's verify it doesn't leak.
    });
});
