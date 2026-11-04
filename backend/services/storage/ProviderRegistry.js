import ProviderInstance from '../../models/ProviderInstance.js';
import { ProviderUnavailableError } from './StorageErrors.js';

/**
 * ProviderRegistry resolves providerInstanceId to actual Adapter implementations.
 * It does NOT establish concrete connections itself, but delegates to registered adapter factories.
 */
export default class ProviderRegistry {
    constructor(secretStore) {
        this.secretStore = secretStore; // External dependency injection for credentials
        this.factories = new Map(); // providerType -> factory function
        this.activeAdapters = new Map(); // providerInstanceId -> initialized StorageAdapter
    }

    /**
     * Register a factory function for a specific provider type.
     * @param {string} providerType (e.g. S3_COMPATIBLE)
     * @param {Function} factoryFn async (instanceConfig, secretReference) => StorageAdapter
     */
    registerAdapterFactory(providerType, factoryFn) {
        this.factories.set(providerType, factoryFn);
    }

    /**
     * Resolves a provider instance to a concrete StorageAdapter.
     * Instantiates it via the factory and caches it.
     * @param {string} providerInstanceId 
     * @returns {Promise<StorageAdapter>}
     */
    async resolve(providerInstanceId) {
        // Return cached adapter if already initialized
        if (this.activeAdapters.has(providerInstanceId)) {
            return this.activeAdapters.get(providerInstanceId);
        }

        // Fetch instance config from DB
        const instanceDoc = await ProviderInstance.findOne({ providerInstanceId }).lean();
        if (!instanceDoc) {
            throw new ProviderUnavailableError(providerInstanceId, 'Instance configuration not found in registry');
        }

        if (instanceDoc.status !== 'ACTIVE') {
            throw new ProviderUnavailableError(providerInstanceId, `Instance status is ${instanceDoc.status}`);
        }

        const factoryFn = this.factories.get(instanceDoc.providerType);
        if (!factoryFn) {
            throw new ProviderUnavailableError(
                providerInstanceId, 
                `No adapter factory registered for type ${instanceDoc.providerType}`
            );
        }

        // Resolve credentials via external SecretStore using the abstract reference
        const secrets = await this.secretStore.resolveSecret(instanceDoc.credentialReference);

        // Instantiate concrete adapter
        const adapter = await factoryFn(instanceDoc, secrets);
        
        // Ensure instantiated adapter honors the capability model
        adapter.capabilities = instanceDoc.capabilities || [];

        // Cache it
        this.activeAdapters.set(providerInstanceId, adapter);
        return adapter;
    }

    /**
     * Clears cached adapter (e.g. on credential rotation).
     * @param {string} providerInstanceId 
     */
    invalidate(providerInstanceId) {
        this.activeAdapters.delete(providerInstanceId);
    }
}
