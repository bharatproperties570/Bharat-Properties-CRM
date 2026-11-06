import test, { mock } from 'node:test';
import assert from 'node:assert';
import { getRegistry, DEFAULT_PROVIDER_TYPE, DEFAULT_PROVIDER_INSTANCE_ID } from '../services/storage/index.js';
import GoogleDriveStorageAdapter from '../services/storage/adapters/GoogleDriveStorageAdapter.js';
import ProviderInstance from '../models/ProviderInstance.js';

let hasS3Sdk = false;
let S3CompatibleAdapter = null;
try {
    await import('@aws-sdk/client-s3');
    const adapterModule = await import('../services/storage/adapters/S3CompatibleAdapter.js');
    S3CompatibleAdapter = adapterModule.default;
    hasS3Sdk = true;
} catch (err) {
    hasS3Sdk = false;
}

test('Provider Factory & Registry - Google Drive (Primary)', async (t) => {
    await t.test('1. Google Drive is registered as the default primary provider type', async () => {
        assert.strictEqual(DEFAULT_PROVIDER_TYPE, 'GOOGLE_DRIVE');
        assert.strictEqual(DEFAULT_PROVIDER_INSTANCE_ID, 'google-drive-primary');
    });

    await t.test('2. Factory resolves GoogleDriveStorageAdapter with mock drive client', async () => {
        const registry = getRegistry();

        const fakeDriveClient = {
            files: {
                create: mock.fn(),
                get: mock.fn(),
                delete: mock.fn(),
                list: mock.fn()
            }
        };

        // Mock DB fetch for custom Google Drive provider instance
        mock.method(ProviderInstance, 'findOne', () => {
            return {
                lean: () => ({
                    providerInstanceId: 'drive-custom-1',
                    providerType: 'GOOGLE_DRIVE',
                    status: 'ACTIVE',
                    configurationReference: {
                        parentFolderId: 'folder-123'
                    },
                    credentialReference: 'google-auth-canonical'
                })
            };
        });

        // Mock Secret Store
        mock.method(registry.secretStore, 'resolveSecret', async (ref) => {
            return {
                driveClient: fakeDriveClient
            };
        });

        const adapter = await registry.resolve('drive-custom-1');
        assert.ok(adapter instanceof GoogleDriveStorageAdapter, 'Must return GoogleDriveStorageAdapter');
        assert.strictEqual(adapter.providerInstanceId, 'drive-custom-1');
        assert.strictEqual(adapter.config.parentFolderId, 'folder-123');

        mock.restoreAll();
    });

    await t.test('3. Factory resolves canonical google-drive-primary even if not in DB', async () => {
        const registry = getRegistry();

        const fakeDriveClient = {
            files: {
                create: mock.fn()
            }
        };

        mock.method(ProviderInstance, 'findOne', () => {
            return {
                lean: () => null // Not in DB
            };
        });

        mock.method(registry.secretStore, 'resolveSecret', async () => {
            return { driveClient: fakeDriveClient };
        });

        const adapter = await registry.resolve('google-drive-primary');
        assert.ok(adapter instanceof GoogleDriveStorageAdapter, 'Must resolve GoogleDriveStorageAdapter fallback');
        assert.strictEqual(adapter.providerInstanceId, 'google-drive-primary');

        mock.restoreAll();
    });
});

test('Provider Factory & S3Client Construction Tests (Optional S3)', { skip: !hasS3Sdk && 'AWS S3 SDK (@aws-sdk/client-s3) is not installed in this environment' }, async (t) => {
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

        mock.restoreAll();
    });
});
