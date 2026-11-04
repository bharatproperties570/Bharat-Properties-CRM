
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { getDownloadUrl } from '../controllers/documentAPI.controller.js';
import DocumentService from '../services/storage/DocumentService.js';
import { ObjectNotFoundError, StorageError, ProviderUnavailableError } from '../services/storage/StorageErrors.js';
import { AccessDeniedError, LifecycleRestrictionError } from '../services/storage/DocumentAccessService.js';

test('Phase 11.8.1-R1 - API Integration (Download URL)', async (t) => {
    t.beforeEach(() => {
        mock.method(DocumentService.prototype, 'getDownloadUrl', async (user, documentId, versionId, expiryMs) => {
            if (documentId === 'auth-denied') throw new AccessDeniedError('Access denied');
            if (documentId === 'missing') throw new ObjectNotFoundError('CRM', documentId);
            if (documentId === 'lifecycle-blocked') throw new LifecycleRestrictionError('MALWARE_POLICY');
            if (documentId === 'provider-fail') throw new ProviderUnavailableError('s3', 'Provider down');
            if (documentId === 'internal-fail') throw new StorageError('Unknown error');
            
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

    await t.test('11. API Integration - Authorized request returns 200 with URL', async () => {
        const req = { params: { documentId: 'doc-valid' }, query: {}, user: { id: 'u1' } };
        const res = createRes();
        await getDownloadUrl(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.url.includes('doc-valid'));
        assert.ok(res.body.data.expiresAt > 0);
        assert.strictEqual(res.body.data.documentId, 'doc-valid');
    });

    await t.test('11. API Integration - Unauthorized returns 404 (IDOR mask)', async () => {
        const req = { params: { documentId: 'auth-denied' }, query: {}, user: { id: 'u1' } };
        const res = createRes();
        await getDownloadUrl(req, res);
        
        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.body.success, false);
    });

    await t.test('11. API Integration - Missing document returns 404', async () => {
        const req = { params: { documentId: 'missing' }, query: {}, user: { id: 'u1' } };
        const res = createRes();
        await getDownloadUrl(req, res);
        
        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.body.success, false);
    });

    await t.test('11. API Integration - Lifecycle restriction returns 409', async () => {
        const req = { params: { documentId: 'lifecycle-blocked' }, query: {}, user: { id: 'u1' } };
        const res = createRes();
        await getDownloadUrl(req, res);
        
        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.body.success, false);
    });

    await t.test('11. API Integration - Provider failure returns safe 5xx', async () => {
        const req = { params: { documentId: 'provider-fail' }, query: {}, user: { id: 'u1' } };
        const res = createRes();
        await getDownloadUrl(req, res);
        
        assert.strictEqual(res.statusCode, 503); // ProviderUnavailableError mapped to 503
        assert.strictEqual(res.body.success, false);
        assert.ok(!res.body.error.includes('credentials'));
    });

    await t.test('11. API Integration - Internal failure returns safe 5xx', async () => {
        const req = { params: { documentId: 'internal-fail' }, query: {}, user: { id: 'u1' } };
        const res = createRes();
        await getDownloadUrl(req, res);
        
        assert.strictEqual(res.statusCode, 500);
        assert.strictEqual(res.body.success, false);
    });

    await t.test('11. API Integration - Expiry security: Client query cannot override expiry', async () => {
        // Set env var to known value
        process.env.DOCUMENT_URL_EXPIRY_MS = '900000';
        
        let interceptedExpiry = null;
        
        mock.method(DocumentService.prototype, 'getDownloadUrl', async (user, documentId, versionId, expiryMs) => {
            interceptedExpiry = expiryMs;
            return {
                url: 'https://signed.example.com/doc-valid?sig=123',
                expiresAt: Date.now() + expiryMs,
                documentId,
                versionId: 'v1'
            };
        });

        const req = { params: { documentId: 'doc-valid' }, query: { expiresIn: '999999999' }, user: { id: 'u1' } };
        
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

        const { getDownloadUrl } = await import('../controllers/documentAPI.controller.js');
        await getDownloadUrl(req, res);
            
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(interceptedExpiry, 900000, 'Controller MUST use server config, ignoring client expiresIn');
    });
});
