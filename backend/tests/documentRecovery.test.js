import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import DocumentService from '../services/storage/DocumentService.js';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import mongoose from 'mongoose';

test('Orphan Reconciliation & Recovery Architecture', async (t) => {
    t.afterEach(() => { mock.restoreAll(); });

    await t.test('Concurrent Retry uses Option B (New Version)', async () => {
        let docState = 'UPLOADING';
        const mockDoc = {
            get state() { return docState; },
            set state(s) { docState = s; },
            save: async () => {},
            session: () => mockDoc
        };

        const mockLatestVersion = {
            versionNumber: 1,
            session: () => mockLatestVersion
        };
        
        mock.method(Document, 'findOne', () => ({ session: async () => mockDoc }));
        mock.method(DocumentVersion, 'findOne', () => ({ session: async () => mockLatestVersion }));
        
        mock.method(mongoose, 'startSession', async () => ({
            withTransaction: async (cb) => await cb({}),
            endSession: async () => {}
        }));

        const service = new DocumentService({
            accessService: { authorizeAccess: async () => true }
        });

        let saveCalled = false;
        mock.method(DocumentVersion.prototype, 'save', async function() {
            saveCalled = true;
            this._id = 'new_id';
        });

        const newVersion = await service.createDocumentVersion({_id: 'u1'}, 'doc1', { providerInstanceId: 's3-1', logicalKey: 'k' });
        
        assert.strictEqual(saveCalled, true);
        assert.strictEqual(newVersion.versionNumber, 2);
        assert.strictEqual(docState, 'PENDING', 'Document state is reset to PENDING for the new upload retry');
    });

    await t.test('Observability Context is attached on failure', async () => {
        let docState = 'PENDING';
        const mockDoc = {
            get state() { return docState; },
            set state(s) { docState = s; },
            save: async () => {}
        };
        
        const mockVer = {
            providerInstanceId: 's3-1',
            objectKey: 'doc1/v1',
            save: async () => {}
        };
        
        mock.method(Document, 'findOne', async () => mockDoc);
        mock.method(DocumentVersion, 'findOne', async () => mockVer);

        const service = new DocumentService({
            accessService: { authorizeAccess: async () => ({ versionId: 'v1' }) },
            registry: { resolve: async () => ({ put: async () => { throw new Error('S3 Crash'); } }) }
        });

        try {
            await service.uploadFile({_id:'u1'}, 'doc1', 'v1', Buffer.from('data'), 'application/pdf', 100, 'f.pdf');
            assert.fail('Should throw');
        } catch (err) {
            assert.strictEqual(err.message, 'S3 Crash');
            assert.ok(err.uploadContext, 'Upload context must be attached for observability');
            assert.strictEqual(err.uploadContext.objectKey, 'doc1/v1');
            assert.strictEqual(err.uploadContext.providerInstanceId, 's3-1');
        }
    });
});
