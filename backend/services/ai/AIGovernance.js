import { AIGovernanceError } from './AIGovernanceError.js';
import SystemSetting from '../../src/modules/systemSettings/system.model.js';

const CAPABILITIES = {
    AI_LIVE_CONVERSATION: 'AI_LIVE_CONVERSATION',
    AI_DATA_EXTRACTION: 'AI_DATA_EXTRACTION',
    AI_MARKETING_DRAFT: 'AI_MARKETING_DRAFT',
    AI_INTERNAL_ASSIST: 'AI_INTERNAL_ASSIST',
    AI_UNCLASSIFIED: 'AI_UNCLASSIFIED'
};

// Simple Bounded TTL Cache
class TTLConfigCache {
    constructor(ttlMs = 60000, maxKeys = 10) {
        this.cache = new Map();
        this.ttlMs = ttlMs;
        this.maxKeys = maxKeys;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    set(key, value) {
        if (this.cache.size >= this.maxKeys) {
            // Evict oldest (Map iterates in insertion order)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + this.ttlMs
        });
    }

    clear() {
        this.cache.clear();
    }
}

const configCache = new TTLConfigCache(60000, 10);
const CACHE_KEY = 'ai_governance_config';

class AIGovernance {
    static get CAPABILITIES() {
        return CAPABILITIES;
    }

    /**
     * Asserts if the given capability is permitted to execute.
     * Throws AIGovernanceError if blocked.
     */
    static async assertEnabled(capability) {
        // 1. Validate Capability Registry
        if (!capability || !Object.values(CAPABILITIES).includes(capability)) {
            throw new AIGovernanceError('UNKNOWN_CAPABILITY', capability || 'MISSING');
        }

        // 2. Resolve Global Emergency Override (.env)
        const killswitch = process.env.AI_GLOBAL_KILLSWITCH;
        if (killswitch !== undefined) {
            const ksUpper = String(killswitch).trim().toUpperCase();
            if (ksUpper === 'TRUE' || ksUpper === '1') {
                throw new AIGovernanceError('GLOBAL_DISABLED', capability);
            } else if (ksUpper !== 'FALSE' && ksUpper !== '0') {
                // Malformed killswitch value
                throw new AIGovernanceError('INVALID_CONFIGURATION', capability);
            }
        }

        // 3. Resolve SystemSetting (with bounded TTL cache)
        let config = configCache.get(CACHE_KEY);

        if (!config) {
            try {
                const setting = await SystemSetting.findOne({ key: 'ai_governance_config' }).lean();
                if (setting && setting.value) {
                    config = setting.value;
                    configCache.set(CACHE_KEY, config);
                } else {
                    // Config missing in DB
                    throw new AIGovernanceError('CONFIG_UNAVAILABLE', capability);
                }
            } catch (err) {
                // MongoDB Unavailable
                throw new AIGovernanceError('CONFIG_UNAVAILABLE', capability);
            }
        }

        // 4. Apply Capability Policy
        const isEnabled = config[capability];
        if (isEnabled !== true) {
            // Evaluates undefined, null, or false as FALSE (Fail Closed)
            throw new AIGovernanceError('CAPABILITY_DISABLED', capability);
        }

        return true; // Authorized
    }

    // Exported for testing
    static _clearCache() {
        configCache.clear();
    }
}

export default AIGovernance;
