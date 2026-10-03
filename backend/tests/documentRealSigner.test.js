import test, { mock } from 'node:test';
import assert from 'node:assert';
import S3CompatibleAdapter from '../services/storage/adapters/S3CompatibleAdapter.js';
import { S3Client } from '@aws-sdk/client-s3';

test('Real Cryptographic Signer Structure (Offline/Structural)', async (t) => {
    // We instantiate a REAL S3Client to prove SDK cryptographic signing works offline.
    // Real HTTP GET is blocked by local Docker unavailability.
    const s3Client = new S3Client({
        region: 'us-east-1',
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
        credentials: {
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key'
        }
    });

    const adapter = new S3CompatibleAdapter('s3-test-instance', { bucket: 'crm-test-documents' }, [], { s3Client });

    await t.test('1. Real AWS SDK v3 URL Generation offline', async () => {
        const objectKey = 'tenant-1/doc-123.pdf';
        
        const url = await adapter._getPresignedReadUrl(objectKey, 3600, {
            mimeType: 'application/pdf',
            originalFilename: 'test document.pdf'
        });

        assert.ok(url.includes('X-Amz-Signature='), 'Generated URL must contain cryptographic signature');
        assert.ok(url.includes('X-Amz-Credential=test-access-key'), 'Generated URL must contain credentials');
        assert.ok(url.includes('crm-test-documents'), 'Generated URL must contain bucket name');
        assert.ok(url.includes('tenant-1/doc-123.pdf'), 'Generated URL must contain decoded object key path');
        assert.ok(url.includes('response-content-disposition=attachment'), 'Generated URL must contain Content-Disposition');
        assert.ok(url.includes('response-content-type=application%2Fpdf'), 'Generated URL must contain Content-Type');
        assert.ok(url.includes('test%2520document.pdf'), 'Filename must be safely encoded');
    });
});
