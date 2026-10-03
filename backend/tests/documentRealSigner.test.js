import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import S3CompatibleAdapter from '../services/storage/adapters/S3CompatibleAdapter.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

test('Real MinIO Integration Test (Phase 11.8.1-R7)', async (t) => {
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

    const payloadString = 'Bharat Properties Enterprise Document Storage R7 Test Payload';
    const payloadBuffer = Buffer.from(payloadString, 'utf-8');
    const originalChecksum = crypto.createHash('sha256').update(payloadBuffer).digest('hex');
    const originalSize = payloadBuffer.length;
    const objectKey = 'tenant-7/doc-R7.pdf';
    const mimeType = 'application/pdf';

    await t.test('1. Real S3Client Upload (PutObjectCommand)', async () => {
        const command = new PutObjectCommand({
            Bucket: 'crm-test-documents',
            Key: objectKey,
            Body: payloadBuffer,
            ContentType: mimeType
        });
        await s3Client.send(command);
    });

    let generatedUrl = '';
    await t.test('2. Real Presigned URL Generation', async () => {
        generatedUrl = await adapter._getPresignedReadUrl(objectKey, 3600, {
            mimeType: mimeType,
            originalFilename: 'test document spaces.pdf'
        });
        assert.ok(generatedUrl.includes('X-Amz-Signature='), 'Must contain signature');
        assert.ok(generatedUrl.includes('response-content-disposition='), 'Must contain content-disposition');
    });

    await t.test('3. Real HTTP Download and Byte Integrity', async () => {
        const response = await fetch(generatedUrl);
        assert.strictEqual(response.status, 200, 'HTTP GET must return 200 OK');

        const arrayBuffer = await response.arrayBuffer();
        const downloadedBuffer = Buffer.from(arrayBuffer);
        const downloadedChecksum = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');

        assert.strictEqual(downloadedBuffer.length, originalSize, 'Downloaded size must match');
        assert.strictEqual(downloadedChecksum, originalChecksum, 'Downloaded SHA-256 must match exactly');
        assert.strictEqual(response.headers.get('content-type'), mimeType, 'Content-Type must match exactly');
        assert.ok(response.headers.get('content-disposition').includes('filename="test%20document%20spaces.pdf"'), 'Content-Disposition must match');
    });

    await t.test('4. Private Direct Access Denial', async () => {
        const rawUrl = 'http://localhost:9000/crm-test-documents/' + objectKey;
        const response = await fetch(rawUrl);
        assert.strictEqual(response.status, 403, 'Direct access without signature MUST be denied');
    });

    await t.test('5. Wrong Object / Signature Binding', async () => {
        const alteredUrl = generatedUrl.replace('doc-R7.pdf', 'doc-X.pdf');
        const response = await fetch(alteredUrl);
        assert.notStrictEqual(response.status, 200, 'Signature bound to original object must be rejected if path is altered');
    });

    await t.test('6. Expiry Test', async () => {
        const shortLivedUrl = await adapter._getPresignedReadUrl(objectKey, 2, {
            mimeType: mimeType,
            originalFilename: 'test document spaces.pdf'
        });

        // Test before expiry
        const responseBefore = await fetch(shortLivedUrl);
        assert.strictEqual(responseBefore.status, 200, 'Must succeed before expiry');

        // Wait 3 seconds
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Test after expiry
        const responseAfter = await fetch(shortLivedUrl);
        assert.strictEqual(responseAfter.status, 403, 'Must be rejected by storage engine after expiry');
    });
});

test('Real MinIO Content-Disposition Header Injection Security', async (t) => {
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

    const filenames = [
        'normal document.pdf',
        'unicode \u2705 test.pdf',
        'quotes "test".pdf',
        'special characters &<>*?.pdf',
        'crlf \r\n injection.pdf'
    ];

    for (const filename of filenames) {
        await t.test(`Test filename: ${filename}`, async () => {
            const url = await adapter._getPresignedReadUrl('tenant-7/doc-R7.pdf', 3600, {
                mimeType: 'application/pdf',
                originalFilename: filename
            });
            const response = await fetch(url);
            assert.strictEqual(response.status, 200);
            const cd = response.headers.get('content-disposition');
            assert.ok(cd.includes('attachment'), 'Must be attachment');
            // Ensure no raw CR or LF made it into the header
            assert.ok(!cd.includes('\r'), 'Must not contain raw CR');
            assert.ok(!cd.includes('\n'), 'Must not contain raw LF');
        });
    }
});
