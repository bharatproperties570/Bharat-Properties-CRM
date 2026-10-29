import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import DocumentService from '../services/storage/DocumentService.js';
import DocumentAccessService from '../services/storage/DocumentAccessService.js';
import { StorageError } from '../services/storage/StorageErrors.js';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';

test('Document Storage Failure Consistency', async (t) => {
    t.afterEach(() => { mock.restoreAll(); });

    await t.test('CASE 2: Storage PUT fails -> UPLOADING state', async () => {
        let docState = 'PENDING';
        let docSaved = 0;
        
        const mockDoc = {
            get state() { return docState; },
            set state(s) { docState = s; },
            save: async () => { docSaved++; }
        };
        const mockVer = { save: async () => {} };

        mock.method(Document, 'findOne', async () => mockDoc);
        mock.method(DocumentVersion, 'findOne', async () => mockVer);

        const service = new DocumentService({
            accessService: { authorizeAccess: async () => ({ versionId: 'v1' }) },
            registry: { resolve: async () => ({ put: async () => { throw new Error('S3 Network Error'); } }) }
        });

        // We bypass MIME checks by passing valid types
        await assert.rejects(
            service.uploadFile({_id:'u1'}, 'doc1', 'v1', Buffer.from('data'), 'application/pdf', 100, 'file.pdf'),
            { message: 'S3 Network Error' }
        );

        assert.strictEqual(docState, 'UPLOADING', 'Document should be stuck in UPLOADING state');
        assert.strictEqual(docSaved, 1, 'Document should have been saved once (to UPLOADING) before PUT');
    });

    await t.test('CASE 3 & 4: Storage succeeds, DB fails -> UPLOADING state + Orphan', async () => {
        let docState = 'PENDING';
        
        const mockDoc = {
            get state() { return docState; },
            set state(s) { docState = s; },
            save: mock.fn(async () => {
                if (docState === 'MALWARE_POLICY') {
                    throw new Error('Mongo connection lost');
                }
            })
        };
        const mockVer = { save: async () => {} };

        mock.method(Document, 'findOne', async () => mockDoc);
        mock.method(DocumentVersion, 'findOne', async () => mockVer);

        let putCalled = false;
        const service = new DocumentService({
            accessService: { authorizeAccess: async () => ({ versionId: 'v1' }) },
            registry: { resolve: async () => ({ put: async () => { putCalled = true; return { sizeBytes: 100 }; } }) }
        });

        await assert.rejects(
            service.uploadFile({_id:'u1'}, 'doc1', 'v1', Buffer.from('data'), 'application/pdf', 100, 'file.pdf'),
            { message: 'Mongo connection lost' }
        );

        assert.strictEqual(putCalled, true, 'Storage PUT must have succeeded');
        // Document state inside memory is MALWARE_POLICY, but DB save failed!
        // So the actual DB state remains UPLOADING (from the first save).
        assert.strictEqual(mockDoc.save.mock.calls.length, 2, 'Should have attempted second save');
    });

    await t.test('Idempotency/Retry Gap: Cannot retry failed upload on same version', async () => {
        const mockDoc = { state: 'UPLOADING', save: async () => {} };
        mock.method(Document, 'findOne', async () => mockDoc);
        mock.method(DocumentVersion, 'findOne', async () => ({ save: async () => {} }));

        const service = new DocumentService({
            accessService: { authorizeAccess: async () => ({ versionId: 'v1' }) },
            registry: { resolve: async () => ({ put: async () => ({}) }) }
        });

        await assert.rejects(
            service.uploadFile({_id:'u1'}, 'doc1', 'v1', Buffer.from('data'), 'application/pdf', 100, 'file.pdf'),
            { name: 'LifecycleTransitionError', message: 'Invalid lifecycle transition from UPLOADING to UPLOADING' }
        );
    });

    await t.test('Logical Delete Consistency', async () => {
        let docState = 'ACTIVE';
        const mockDoc = {
            get state() { return docState; },
            set state(s) { docState = s; },
            save: async () => {}
        };
        mock.method(Document, 'findOne', async () => mockDoc);

        const service = new DocumentService({
            accessService: { authorizeAccess: async () => ({ versionId: 'v1' }) }
        });

        const res = await service.deleteDocument({_id:'u1'}, 'doc1');
        assert.strictEqual(docState, 'DELETED', 'Document state must be DELETED');
        assert.strictEqual(res.state, 'DELETED');
    });

});

test('Download Failure Contract', async (t) => {
    t.afterEach(() => { mock.restoreAll(); });

    await t.test('Authorization before storage access', async () => {
        let authCalled = false;
        let getCalled = false;

        const service = new DocumentService({
            accessService: { authorizeAccess: async () => { authCalled = true; return { versionId: 'v1' }; } },
            registry: { resolve: async () => ({ read: async () => { getCalled = true; return {}; } }) }
        });
        
        mock.method(DocumentVersion, 'findOne', async () => ({ objectKey: 'obj' }));
        
        await service.readDocumentStream({_id:'u1'}, 'doc1');
        
        assert.strictEqual(authCalled, true);
        assert.strictEqual(getCalled, true);
    });

    await t.test('Storage Failure propagates', async () => {
        const service = new DocumentService({
            accessService: { authorizeAccess: async () => ({ versionId: 'v1' }) },
            registry: { resolve: async () => ({ read: async () => { throw new Error('S3 Download Error'); } }) }
        });
        
        mock.method(DocumentVersion, 'findOne', async () => ({ objectKey: 'obj' }));

        await assert.rejects(
            service.readDocumentStream({_id:'u1'}, 'doc1'),
            { message: 'S3 Download Error' }
        );
    });
});
