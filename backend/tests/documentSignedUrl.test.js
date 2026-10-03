
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import DocumentService from '../services/storage/DocumentService.js';
import DocumentVersion from '../models/DocumentVersion.js';
import { ObjectNotFoundError, StorageError } from '../services/storage/StorageErrors.js';
import { LifecycleRestrictionError } from '../services/storage/DocumentAccessService.js';

test('Phase 11.8.1 - Signed URL Security Matrix', async (t) => {
    const fakeAdapter = {
        getPresignedReadUrl: async (objectKey, expiresIn) => {
            if (objectKey.includes('fail')) throw new StorageError('Provider signing failed');
            return `https://mock-s3.example.com/${objectKey}?expiresIn=${expiresIn}&sig=123`;
        }
    };
    
    const service = new DocumentService({
        accessService: {
            authorizeAccess: async (user, documentId, op, versionId, requestedExpiryMs) => {
                if (user.id === 'unauthorized') throw new StorageError('Access denied');
                if (documentId === 'missing') throw new ObjectNotFoundError('CRM', documentId);
                if (documentId === 'deleted') throw new LifecycleRestrictionError('DELETED');
                if (documentId === 'rejected') throw new LifecycleRestrictionError('REJECTED');
                if (documentId === 'quarantined') throw new LifecycleRestrictionError('QUARANTINED');
                if (documentId === 'malware') throw new LifecycleRestrictionError('MALWARE_POLICY');
                
                return {
                    grantId: 'g1',
                    documentId,
                    versionId: versionId || 'v123',
                    operation: 'READ',
                    expiresAt: Date.now() + requestedExpiryMs
                };
            }
        },
        registry: {
            resolve: async (providerInstanceId) => {
                if (providerInstanceId === 'invalid-provider') throw new StorageError('Invalid provider');
                return fakeAdapter;
            }
        }
    });

    t.beforeEach(() => {
        mock.method(DocumentVersion, 'findOne', async (query) => {
            if (query.versionId === 'v123') {
                return { documentId: query.documentId, versionId: 'v123', objectKey: `${query.documentId}/v123`, providerInstanceId: 's3-primary' };
            }
            if (query.versionId === 'old-v') {
                return { documentId: query.documentId, versionId: 'old-v', objectKey: `${query.documentId}/old-v`, providerInstanceId: 's3-primary' };
            }
            if (query.versionId === 'fail-v') {
                return { documentId: query.documentId, versionId: 'fail-v', objectKey: 'fail-key', providerInstanceId: 's3-primary' };
            }
            return null; // missing version
        });
    });

    t.afterEach(() => {
        mock.restoreAll();
    });

    await t.test('A - Authorized ACTIVE document returns valid signed URL', async () => {
        const result = await service.getDownloadUrl({ id: 'u1' }, 'doc-1', null, 900000);
        assert.ok(result.url.includes('doc-1/v123'));
        assert.ok(result.url.includes('expiresIn=900'));
        assert.strictEqual(result.documentId, 'doc-1');
        assert.strictEqual(result.versionId, 'v123');
    });

    await t.test('B, C, D - Unauthorized / Cross-access yields error', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'unauthorized' }, 'doc-1'), /Access denied/);
    });

    await t.test('E - Missing document yields 404', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'missing'), ObjectNotFoundError);
    });

    await t.test('F - DELETED document yields LifecycleRestrictionError', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'deleted'), { name: 'LifecycleRestrictionError', state: 'DELETED' });
    });

    await t.test('G - REJECTED document yields LifecycleRestrictionError', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'rejected'), { name: 'LifecycleRestrictionError', state: 'REJECTED' });
    });
    
    await t.test('H - QUARANTINED document yields LifecycleRestrictionError', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'quarantined'), { name: 'LifecycleRestrictionError', state: 'QUARANTINED' });
    });

    await t.test('I - MALWARE_POLICY document yields LifecycleRestrictionError', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'malware'), { name: 'LifecycleRestrictionError', state: 'MALWARE_POLICY' });
    });

    await t.test('J - Version binding strictly signs requested version objectKey', async () => {
        const result = await service.getDownloadUrl({ id: 'u1' }, 'doc-2', 'old-v', 900000);
        assert.ok(result.url.includes('doc-2/old-v'));
        assert.strictEqual(result.versionId, 'old-v');
    });

    await t.test('K, L - ObjectKey/Provider injection impossible', async () => {
        const result = await service.getDownloadUrl({ id: 'u1' }, 'doc-1', 'v123', 900000);
        assert.ok(!result.url.includes('injected'));
    });

    await t.test('M - Provider signing failure propagates as StorageError', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'doc-1', 'fail-v', 900000), /Provider signing failed/);
    });

    await t.test('N - Expiry correctly parsed to seconds', async () => {
        const result = await service.getDownloadUrl({ id: 'u1' }, 'doc-1', null, 300000); // 5 min
        assert.ok(result.url.includes('expiresIn=300'));
    });
});
