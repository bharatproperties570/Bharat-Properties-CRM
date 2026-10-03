
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import DocumentService from '../services/storage/DocumentService.js';
import S3CompatibleAdapter from '../services/storage/adapters/S3CompatibleAdapter.js';
import DocumentVersion from '../models/DocumentVersion.js';
import { ObjectNotFoundError, StorageError, ProviderUnavailableError } from '../services/storage/StorageErrors.js';
import { LifecycleRestrictionError } from '../services/storage/DocumentAccessService.js';

test('Phase 11.8.1-R1 - Signed URL Hardening', async (t) => {
    let authorizeCalledAt = 0;
    let signerCalledAt = 0;

    const fakeAdapter = {
        getPresignedReadUrl: async (objectKey, expiresIn, options) => {
            signerCalledAt = Date.now();
            
            if (objectKey.includes('signer-throws')) throw new StorageError('Provider signing failed');
            if (objectKey.includes('signer-unavailable')) throw new ProviderUnavailableError('s3', 'Unavailable');
            if (objectKey.includes('signer-invalid')) return 'invalid-url';
            if (objectKey.includes('signer-empty')) return '';
            if (objectKey.includes('signer-wrong')) return `https://s3.example.com/wrong-object`;
            
            return `https://mock-s3.example.com/${objectKey}?expiresIn=${expiresIn}&sig=123`;
        }
    };
    
    const service = new DocumentService({
        accessService: {
            authorizeAccess: async (user, documentId, op, versionId, requestedExpiryMs) => {
                authorizeCalledAt = Date.now();
                // small delay to ensure timestamp diff
                await new Promise(r => setTimeout(r, 10));

                if (user.id === 'unauthorized') throw new StorageError('Access denied');
                if (documentId === 'missing') throw new ObjectNotFoundError('CRM', documentId);
                
                const blockedStates = ['PENDING', 'UPLOADING', 'PROCESSING', 'CONTENT_VALIDATION', 'MALWARE_POLICY', 'REJECTED', 'QUARANTINED', 'DELETED'];
                
                for (const state of blockedStates) {
                    if (documentId === state.toLowerCase()) {
                        throw new LifecycleRestrictionError(state.toUpperCase());
                    }
                }
                
                if (versionId === 'wrong-doc-v') {
                    throw new ObjectNotFoundError('CRM', 'wrong-doc-v');
                }

                return {
                    grantId: 'g1',
                    documentId,
                    versionId: versionId || 'v-active',
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
        authorizeCalledAt = 0;
        signerCalledAt = 0;
        
        mock.method(DocumentVersion, 'findOne', async (query) => {
            const v = query.versionId;
            if (v === 'wrong-doc-v') return { documentId: 'other-doc', versionId: 'wrong-doc-v', objectKey: 'other/wrong-doc-v', providerInstanceId: 's3' };
            
            if (v) return { documentId: query.documentId, versionId: v, objectKey: `${query.documentId}/${v}`, providerInstanceId: 's3' };
            return null;
        });
    });

    t.afterEach(() => {
        mock.restoreAll();
    });

    await t.test('6. Authorization Call Order - strictly before signing', async () => {
        await service.getDownloadUrl({ id: 'u1' }, 'doc-1', null, 900000);
        assert.ok(authorizeCalledAt > 0, 'authorizeCalledAt must be set');
        assert.ok(signerCalledAt > 0, 'signerCalledAt must be set');
        assert.ok(authorizeCalledAt < signerCalledAt, 'Authorization MUST precede signing');
    });

    await t.test('7. Version Security - V1 (No versionId -> currentVersionId)', async () => {
        const result = await service.getDownloadUrl({ id: 'u1' }, 'doc-v1', null, 900000);
        assert.ok(result.url.includes('doc-v1/v-active'));
    });

    await t.test('7. Version Security - V2 (Explicit valid versionId)', async () => {
        const result = await service.getDownloadUrl({ id: 'u1' }, 'doc-v2', 'v-explicit', 900000);
        assert.ok(result.url.includes('doc-v2/v-explicit'));
    });

    await t.test('7. Version Security - V3/V4 (Invalid/Wrong doc versionId)', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'doc-v4', 'wrong-doc-v'), ObjectNotFoundError);
    });

    await t.test('8. Lifecycle Tests (All blocked states)', async () => {
        const states = ['pending', 'uploading', 'processing', 'content_validation', 'malware_policy', 'rejected', 'quarantined', 'deleted'];
        for (const state of states) {
            await assert.rejects(service.getDownloadUrl({ id: 'u1' }, state), { name: 'LifecycleRestrictionError', state: state.toUpperCase() });
        }
    });

    await t.test('10. Signer Failure - S1: Signer throws', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'signer-throws', 'v1'), StorageError);
    });

    await t.test('10. Signer Failure - S2: Signer unavailable', async () => {
        await assert.rejects(service.getDownloadUrl({ id: 'u1' }, 'signer-unavailable', 'v1'), ProviderUnavailableError);
    });

    // Test the actual adapter logic
    await t.test('10. Signer Failure - S3/S4: Invalid/empty URL or wrong object', async () => {
        const adapter = new S3CompatibleAdapter('s3-1', { bucket: 'test-bucket' }, []);
        // Inject a bad presigner
        adapter.s3Presigner = {
            getSignedUrl: async () => 'invalid-url'
        };
        await assert.rejects(adapter._getPresignedReadUrl('doc-1/v1', 900), StorageError, /Signer returned an invalid or empty URL/);
        
        adapter.s3Presigner.getSignedUrl = async () => '';
        await assert.rejects(adapter._getPresignedReadUrl('doc-1/v1', 900), StorageError, /Signer returned an invalid or empty URL/);

        adapter.s3Presigner.getSignedUrl = async () => 'https://test-bucket.s3.amazonaws.com/wrong-object';
        await assert.rejects(adapter._getPresignedReadUrl('doc-1/v1', 900), StorageError, /Signer returned a URL for the wrong object/);
    });

    await t.test('1. Critical Finding - Genuine URL required or throw', async () => {
        const adapter = new S3CompatibleAdapter('s3-1', { bucket: 'test-bucket' }, []);
        // NO presigner injected!
        await assert.rejects(adapter._getPresignedReadUrl('doc-1/v1', 900), ProviderUnavailableError, /No compatible S3 signer available/);
    });
});
