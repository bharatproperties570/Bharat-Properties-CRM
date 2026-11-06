import ProviderRegistry from './ProviderRegistry.js';
import DocumentService from './DocumentService.js';
import { ProviderUnavailableError } from './StorageErrors.js';

export const DEFAULT_PROVIDER_TYPE = 'GOOGLE_DRIVE';
export const DEFAULT_PROVIDER_INSTANCE_ID = 'google-drive-primary';

const configureRegistry = (registry) => {
    // 1. Primary: Google Drive Adapter Factory
    registry.registerAdapterFactory('GOOGLE_DRIVE', async (instanceDoc, secrets) => {
        const { default: GoogleDriveStorageAdapter } = await import('./adapters/GoogleDriveStorageAdapter.js');
        const { getDriveService } = await import('../../utils/googleAuth.js');

        const config = instanceDoc.configurationReference || {};
        let driveClient = null;

        if (secrets && secrets.driveClient) {
            driveClient = secrets.driveClient;
        } else if (secrets && secrets.serviceAccountJson) {
            try {
                const { google } = await import('googleapis');
                const creds = typeof secrets.serviceAccountJson === 'string'
                    ? JSON.parse(secrets.serviceAccountJson)
                    : secrets.serviceAccountJson;
                const auth = new google.auth.JWT(
                    creds.client_email,
                    null,
                    creds.private_key,
                    ['https://www.googleapis.com/auth/drive']
                );
                driveClient = google.drive({ version: 'v3', auth });
            } catch (jwtErr) {
                throw new ProviderUnavailableError(
                    instanceDoc.providerInstanceId,
                    `Failed to parse Google Drive service account credentials: ${jwtErr.message}`
                );
            }
        } else {
            driveClient = await getDriveService();
        }

        if (!driveClient) {
            throw new ProviderUnavailableError(
                instanceDoc.providerInstanceId,
                `CRITICAL: Google Drive service could not be authenticated for provider ${instanceDoc.providerInstanceId}. Runtime fails closed.`
            );
        }

        return new GoogleDriveStorageAdapter(
            instanceDoc.providerInstanceId,
            config,
            instanceDoc.capabilities || [
                'PUT', 'READ', 'DELETE', 'HEAD', 'COPY', 'ENUMERATE', 'PRESIGNED_READ'
            ],
            { driveClient }
        );
    });

    // 2. Optional: S3-Compatible Adapter Factory (Lazily Imported Only When Invoked)
    registry.registerAdapterFactory('S3_COMPATIBLE', async (instanceDoc, secrets) => {
        let S3CompatibleAdapter;
        let S3Client;
        try {
            const adapterModule = await import('./adapters/S3CompatibleAdapter.js');
            S3CompatibleAdapter = adapterModule.default;
            const awsModule = await import('@aws-sdk/client-s3');
            S3Client = awsModule.S3Client;
        } catch (importErr) {
            throw new ProviderUnavailableError(
                instanceDoc.providerInstanceId,
                `CRITICAL: Optional S3 dependencies could not be loaded: ${importErr.message}`
            );
        }

        const config = instanceDoc.configurationReference || {};
        const { endpoint, region, bucket, forcePathStyle } = config;

        const clientConfig = {
            region: region || 'us-east-1'
        };

        if (endpoint) {
            clientConfig.endpoint = endpoint;
        }
        if (forcePathStyle) {
            clientConfig.forcePathStyle = true;
        }

        // FAIL CLOSED: We MUST NOT silently construct an unusable client if secrets are missing
        if (!secrets || !secrets.accessKeyId || !secrets.secretAccessKey) {
            throw new Error(`CRITICAL: Missing S3 credentials for provider instance ${instanceDoc.providerInstanceId}. Runtime fails closed.`);
        }

        clientConfig.credentials = {
            accessKeyId: secrets.accessKeyId,
            secretAccessKey: secrets.secretAccessKey
        };

        const s3Client = new S3Client(clientConfig);

        return new S3CompatibleAdapter(
            instanceDoc.providerInstanceId,
            { bucket, pathPrefix: config.pathPrefix },
            instanceDoc.capabilities,
            { s3Client }
        );
    });
};

/**
 * Enterprise Production Boundary SecretStore
 * 
 * Supports canonical Google Drive integration (via googleAuth.js / systemSettings / env),
 * while maintaining fail-closed boundary for external vaults or missing S3 secrets.
 */
class ProductionSecretStoreBoundary {
    async resolveSecret(credentialReference) {
        if (!credentialReference || credentialReference === 'google-auth-canonical' || credentialReference.startsWith('google-')) {
            return { providerType: 'GOOGLE_DRIVE', reference: credentialReference };
        }
        throw new Error(`Production SecretStore is not yet implemented for external reference: ${credentialReference}. Cannot safely resolve credentials.`);
    }
}

let _registryInstance = null;

export const getRegistry = () => {
    if (!_registryInstance) {
        const productionSecretStore = new ProductionSecretStoreBoundary();
        _registryInstance = new ProviderRegistry(productionSecretStore);
        configureRegistry(_registryInstance);
    }
    return _registryInstance;
};

export const getService = () => {
    return new DocumentService({ registry: getRegistry() });
};

export default { getService, getRegistry, DEFAULT_PROVIDER_TYPE, DEFAULT_PROVIDER_INSTANCE_ID };
