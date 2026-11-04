import test, { mock } from 'node:test';
import assert from 'node:assert';
import { getRegistry } from '../services/storage/index.js';
import S3CompatibleAdapter from '../services/storage/adapters/S3CompatibleAdapter.js';
import ProviderInstance from '../models/ProviderInstance.js';

test('Provider Factory & S3Client Construction Tests', async (t) => {
    
    await t.test('1. Factory resolves S3CompatibleAdapter correctly', async () => {
        const registry = getRegistry();
        
        // Mock DB fetch
        mock.method(ProviderInstance, 'findOne', () => {
            return {
                lean: () => ({
                    providerInstanceId: 's3-test-1',
                    providerType: 'S3_COMPATIBLE',
                    status: 'ACTIVE',
                    configurationReference: {
                        endpoint: 'http://localhost:9000',
                        region: 'us-east-1',
                        bucket: 'crm-test-documents',
                        forcePathStyle: true,
                        pathPrefix: 'prefix'
                    },
                    credentialReference: 'secret-ref-123'
                })
            };
        });

        // Mock Secret Store internal mechanism
        mock.method(registry.secretStore, 'resolveSecret', async (ref) => {
            assert.strictEqual(ref, 'secret-ref-123');
            return {
                accessKeyId: 'test-access-key',
                secretAccessKey: 'test-secret-key'
            };
        });

        const adapter = await registry.resolve('s3-test-1');
        
        assert.ok(adapter instanceof S3CompatibleAdapter, 'Must return S3CompatibleAdapter');
        assert.strictEqual(adapter.bucket, 'crm-test-documents');
        assert.strictEqual(adapter.pathPrefix, 'prefix');
        
        // Verify underlying S3Client configuration
        assert.ok(adapter.s3Client, 'Must instantiate S3Client');
        
        const clientConfig = await adapter.s3Client.config.region();
        assert.strictEqual(clientConfig, 'us-east-1');
        
        const clientEndpoint = await adapter.s3Client.config.endpoint();
        assert.strictEqual(clientEndpoint.hostname, 'localhost');
        assert.strictEqual(clientEndpoint.port, 9000);
        assert.strictEqual(clientEndpoint.protocol, 'http:');
        
        const forcePathStyle = adapter.s3Client.config.forcePathStyle;
        assert.strictEqual(forcePathStyle, true);

        // Clear mocks
        mock.restoreAll();
    });
});
