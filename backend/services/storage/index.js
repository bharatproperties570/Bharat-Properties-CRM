import ProviderRegistry from './ProviderRegistry.js';
import DocumentService from './DocumentService.js';
import S3CompatibleAdapter from './adapters/S3CompatibleAdapter.js';
import { S3Client } from '@aws-sdk/client-s3';

const configureRegistry = (registry) => {
    registry.registerAdapterFactory('S3_COMPATIBLE', async (instanceDoc, secrets) => {
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
 * Enterprise Production Boundary
 * 
 * The CRM repository does not yet possess a concrete production SecretStore 
 * (e.g. AWS Secrets Manager, HashiCorp Vault). 
 * To prevent bypassing the abstraction with dummy objects, this placeholder 
 * strictly FAILS CLOSED if production resolves secrets through it.
 * 
 * For isolated testing, a concrete TestSecretStore must be injected directly
 * into ProviderRegistry.
 */
class ProductionSecretStoreBoundary {
    async resolveSecret(credentialReference) {
        throw new Error('Production SecretStore is not yet implemented. Cannot safely resolve credentials.');
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

export default { getService, getRegistry };
