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

        if (secrets && secrets.accessKeyId && secrets.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: secrets.accessKeyId,
                secretAccessKey: secrets.secretAccessKey
            };
        }

        const s3Client = new S3Client(clientConfig);
        
        return new S3CompatibleAdapter(
            instanceDoc.providerInstanceId,
            { bucket, pathPrefix: config.pathPrefix },
            instanceDoc.capabilities,
            { s3Client }
        );
    });
};

let _registryInstance = null;

export const getRegistry = () => {
    if (!_registryInstance) {
        const dummySecretStore = {
            resolveSecret: async (ref) => {
                // In production, this would call AWS Secrets Manager or Vault
                // For now, return empty unless mapped via env
                return {};
            }
        };
        _registryInstance = new ProviderRegistry(dummySecretStore);
        configureRegistry(_registryInstance);
    }
    return _registryInstance;
};

export const getService = () => {
    return new DocumentService({ registry: getRegistry() });
};

export default { getService, getRegistry };
