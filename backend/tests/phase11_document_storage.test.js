process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../app.js';
import config from '../src/config/env.js';
import User from '../models/User.js';
import { deleteFileFromDrive, getFileMetadata } from '../services/drive.service.js';
import { publishPendingEvents, outboxPublisher } from '../services/OutboxPublisher.js';

describe('Phase 11 — Document Storage & Retention Acceptance Suite', () => {
    const testUserId = '65d123456789abcdef012345';
    let validToken;
    let server;
    let baseUrl;
    let originalFindById;
    const testUploads = [];

    before(async () => {
        // Reduce mongoose buffer timeout for fast failure of unmocked DB calls in isolated test
        mongoose.set('bufferTimeoutMS', 150);

        // Stub User.findById for fast in-memory user authentication
        originalFindById = User.findById;
        User.findById = (id) => ({
            populate: () => ({
                lean: async () => {
                    if (String(id) === String(testUserId)) {
                        return {
                            _id: testUserId,
                            name: 'Admin User',
                            email: 'admin@bharatproperties.com',
                            role: { name: 'admin' },
                            isActive: true,
                            dataScope: 'all',
                            tenantId: null
                        };
                    }
                    return null;
                }
            })
        });

        validToken = jwt.sign(
            { id: testUserId, email: 'admin@bharatproperties.com', role: 'admin' },
            config.jwtSecret,
            { expiresIn: '1h' }
        );

        // Ensure uploads directory exists
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    after(async () => {
        // Restore User.findById
        if (originalFindById) {
            User.findById = originalFindById;
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        // Cleanup any lingering test files in uploads
        testUploads.forEach(filePath => {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {}
            }
        });

        // Ensure process exits cleanly after completing test suite
        setTimeout(() => process.exit(0), 100);
    });

    it('1. Authentication Gate: Rejects unauthenticated upload requests with 401', async () => {
        const formData = new FormData();
        formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');

        const res = await fetch(`${baseUrl}/api/upload`, {
            method: 'POST',
            body: formData
        });

        assert.strictEqual(res.status, 401, 'Should reject unauthenticated POST /api/upload');
    });

    it('2. Authentication Gate: Rejects unauthenticated delete and metadata requests with 401', async () => {
        const delRes = await fetch(`${baseUrl}/api/upload/some-file-id`, {
            method: 'DELETE'
        });
        assert.strictEqual(delRes.status, 401, 'Should reject unauthenticated DELETE');

        const metaRes = await fetch(`${baseUrl}/api/upload/metadata/some-file-id`, {
            method: 'GET'
        });
        assert.strictEqual(metaRes.status, 401, 'Should reject unauthenticated GET metadata');
    });

    it('3. Single File Upload: Uploads document with fallback to local storage', async () => {
        const fileContent = 'Single test document content for Phase 11';
        const formData = new FormData();
        formData.append('entityType', 'deal');
        formData.append('entityName', 'deal-101');
        formData.append('docCategory', 'agreements');
        formData.append('docType', 'Token Receipt');
        formData.append('file', new Blob([fileContent], { type: 'text/plain' }), 'token_receipt.txt');

        const res = await fetch(`${baseUrl}/api/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${validToken}`
            },
            body: formData
        });

        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.ok(data.fileId, 'Must return a fileId');
        assert.ok(data.url, 'Must return a url');
        assert.ok(['local', 'google_drive'].includes(data.storage), 'Storage must be local or google_drive');

        if (data.storage === 'local') {
            const localPath = path.join(process.cwd(), 'uploads', data.fileId);
            testUploads.push(localPath);
            assert.ok(fs.existsSync(localPath), 'File should exist on disk in uploads/');
            assert.strictEqual(fs.readFileSync(localPath, 'utf8'), fileContent);
        }
    });

    it('4. Multiple File Upload: Uploads batch with resilient per-file storage handling', async () => {
        const formData = new FormData();
        formData.append('entityType', 'property');
        formData.append('entityName', 'plot-42');
        formData.append('files', new Blob(['Doc 1 content'], { type: 'text/plain' }), 'doc1.txt');
        formData.append('files', new Blob(['Doc 2 content'], { type: 'text/plain' }), 'doc2.txt');

        const res = await fetch(`${baseUrl}/api/upload/multiple`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${validToken}`
            },
            body: formData
        });

        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.ok(Array.isArray(data.data), 'Should return array of uploaded file results');
        assert.strictEqual(data.data.length, 2);

        data.data.forEach(item => {
            assert.strictEqual(item.success, true);
            assert.ok(item.fileId);
            assert.ok(item.url);
            if (item.storage === 'local') {
                testUploads.push(path.join(process.cwd(), 'uploads', item.fileId));
            }
        });
    });

    it('5. Metadata Inspection: Fetches metadata for existing document', async () => {
        // Create a local test file directly in uploads
        const testFileName = `test-meta-${Date.now()}.txt`;
        const testFilePath = path.join(process.cwd(), 'uploads', testFileName);
        fs.writeFileSync(testFilePath, 'Metadata test file contents');
        testUploads.push(testFilePath);

        const res = await fetch(`${baseUrl}/api/upload/metadata/${testFileName}`, {
            headers: {
                'Authorization': `Bearer ${validToken}`
            }
        });

        assert.strictEqual(res.status, 200);
        const json = await res.json();
        assert.strictEqual(json.success, true);
        assert.strictEqual(json.data.fileName, testFileName);
        assert.strictEqual(json.data.storage, 'local');
        assert.strictEqual(json.data.size, 'Metadata test file contents'.length);
    });

    it('6. Document Deletion & Retention: Deletes file and verifies removal', async () => {
        const testFileName = `test-delete-${Date.now()}.txt`;
        const testFilePath = path.join(process.cwd(), 'uploads', testFileName);
        fs.writeFileSync(testFilePath, 'File to be deleted');

        const delRes = await fetch(`${baseUrl}/api/upload/${testFileName}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${validToken}`
            }
        });

        assert.strictEqual(delRes.status, 200);
        const delJson = await delRes.json();
        assert.strictEqual(delJson.success, true);
        assert.strictEqual(delJson.storage, 'local');
        assert.strictEqual(fs.existsSync(testFilePath), false, 'File must be unlinked from disk');

        // Verify subsequent metadata fetch returns 404
        const metaRes = await fetch(`${baseUrl}/api/upload/metadata/${testFileName}`, {
            headers: {
                'Authorization': `Bearer ${validToken}`
            }
        });

        assert.strictEqual(metaRes.status, 404);
        const metaJson = await metaRes.json();
        assert.strictEqual(metaJson.success, false);
    });

    it('7. Path Traversal Safety: Prevents directory escape when querying metadata or deleting', async () => {
        const metaRes = await fetch(`${baseUrl}/api/upload/metadata/..%2F..%2Fpackage.json`, {
            headers: {
                'Authorization': `Bearer ${validToken}`
            }
        });

        assert.strictEqual(metaRes.status, 404);

        const delRes = await fetch(`${baseUrl}/api/upload/..%2F..%2Fpackage.json`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${validToken}`
            }
        });

        assert.ok(fs.existsSync(path.join(process.cwd(), 'package.json')), 'Root package.json must remain safe');
    });

    it('8. Service Layer: deleteFileFromDrive and getFileMetadata handle invalid or missing inputs', async () => {
        await assert.rejects(
            async () => deleteFileFromDrive(''),
            /File ID is required/
        );

        await assert.rejects(
            async () => getFileMetadata(''),
            /File ID is required/
        );
    });

    it('9. Phase 4.6I Outbox Reliability: Verifies publishPendingEvents contract and export', async () => {
        assert.strictEqual(typeof publishPendingEvents, 'function', 'publishPendingEvents must be an exported function');
        assert.strictEqual(typeof outboxPublisher.claimEvent, 'function', 'claimEvent must be a function');
        assert.strictEqual(typeof outboxPublisher.publishEvent, 'function', 'publishEvent must be a function');

        // Verify that publishPendingEvents handles empty/no-event state cleanly without throwing
        const originalClaim = outboxPublisher.claimEvent;
        try {
            outboxPublisher.claimEvent = async () => null; // No events pending
            const published = await publishPendingEvents(null, 10);
            assert.strictEqual(published, 0, 'Should publish 0 events when queue is empty');
        } finally {
            outboxPublisher.claimEvent = originalClaim;
        }
    });
});
