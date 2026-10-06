import { AIGovernanceError } from './AIGovernanceError.js';
import SystemSetting from '../../src/modules/systemSettings/system.model.js';
import AuditLog from '../../models/AuditLog.js';

const CAPABILITIES = {
    AI_LIVE_CONVERSATION: 'AI_LIVE_CONVERSATION',
    AI_DATA_EXTRACTION: 'AI_DATA_EXTRACTION',
    AI_ADDRESS_PARSING: 'AI_ADDRESS_PARSING',
    AI_ADDRESS_CONFLICT_RESOLUTION: 'AI_ADDRESS_CONFLICT_RESOLUTION',
    AI_LEAD_PROFILING: 'AI_LEAD_PROFILING',
    AI_MARKETING_GENERATION: 'AI_MARKETING_GENERATION',
    AI_MARKETING_DRAFT: 'AI_MARKETING_DRAFT',
    AI_INTERNAL_ASSIST: 'AI_INTERNAL_ASSIST',
    AI_UNCLASSIFIED: 'AI_UNCLASSIFIED'
};

const ACTIVATION_STATES = {
    DISABLED: 'DISABLED',
    ENABLED: 'ENABLED',
    REQUIRES_APPROVAL: 'REQUIRES_APPROVAL'
};

/**
 * Matrix defining capability guardrails (Risk, Default State, Actions)
 */
const CAPABILITY_MATRIX = {
    [CAPABILITIES.AI_ADDRESS_PARSING]: {
        defaultState: ACTIVATION_STATES.ENABLED,
        riskLevel: 'LEVEL_1',
        autonomousAllowed: true,
        requiresHumanApproval: false,
        allowedActions: ['EXTRACT_DATA'],
        blockedActions: ['CRM_MUTATION'],
        emergencyBehavior: 'BLOCK_ALL'
    },
    [CAPABILITIES.AI_ADDRESS_CONFLICT_RESOLUTION]: {
        defaultState: ACTIVATION_STATES.ENABLED,
        riskLevel: 'LEVEL_1',
        autonomousAllowed: true,
        requiresHumanApproval: false,
        allowedActions: ['EXTRACT_DATA'],
        blockedActions: ['CRM_MUTATION'],
        emergencyBehavior: 'BLOCK_ALL'
    },
    [CAPABILITIES.AI_LEAD_PROFILING]: {
        defaultState: ACTIVATION_STATES.ENABLED,
        riskLevel: 'LEVEL_2',
        autonomousAllowed: true,
        requiresHumanApproval: false,
        allowedActions: ['EXTRACT_DATA'],
        blockedActions: ['CRM_MUTATION'],
        emergencyBehavior: 'BLOCK_ALL'
    },
    
    [CAPABILITIES.AI_MARKETING_DRAFT]: {
        defaultState: ACTIVATION_STATES.ENABLED,
        riskLevel: 'LEVEL_1',
        autonomousAllowed: false,
        requiresHumanApproval: true,
        allowedActions: ['GENERATE_MARKETING_DRAFT'],
        blockedActions: ['PUBLISH_TO_SOCIAL', 'SEND_MARKETING_MESSAGE'],
        emergencyBehavior: 'BLOCK_ALL'
    },
    [CAPABILITIES.AI_MARKETING_GENERATION]: {
        defaultState: ACTIVATION_STATES.ENABLED,
        riskLevel: 'LEVEL_1',
        autonomousAllowed: false,
        requiresHumanApproval: true,
        allowedActions: ['GENERATE_MARKETING_DRAFT'],
        blockedActions: ['PUBLISH_TO_SOCIAL', 'SEND_MARKETING_MESSAGE'],
        emergencyBehavior: 'BLOCK_ALL'
    },
    [CAPABILITIES.AI_INTERNAL_ASSIST]: {
        defaultState: ACTIVATION_STATES.ENABLED,
        riskLevel: 'LEVEL_1',
        autonomousAllowed: true,
        requiresHumanApproval: false,
        allowedActions: ['INTERNAL_ANALYSIS'],
        blockedActions: ['CRM_MUTATION'],
        emergencyBehavior: 'BLOCK_ALL'
    },
    [CAPABILITIES.AI_DATA_EXTRACTION]: {
        defaultState: ACTIVATION_STATES.ENABLED,
        riskLevel: 'LEVEL_2',
        autonomousAllowed: true, 
        requiresHumanApproval: false,
        allowedActions: ['EXTRACT_DATA'],
        blockedActions: ['CRM_MUTATION'],
        emergencyBehavior: 'BLOCK_ALL'
    },
    [CAPABILITIES.AI_LIVE_CONVERSATION]: {
        defaultState: ACTIVATION_STATES.DISABLED, 
        riskLevel: 'LEVEL_4',
        autonomousAllowed: false,
        requiresHumanApproval: true,
        allowedActions: ['RESPOND_USER'],
        blockedActions: [],
        emergencyBehavior: 'BLOCK_ALL'
    },
    [CAPABILITIES.AI_UNCLASSIFIED]: {
        defaultState: ACTIVATION_STATES.DISABLED,
        riskLevel: 'LEVEL_4',
        autonomousAllowed: false,
        requiresHumanApproval: true,
        allowedActions: [],
        blockedActions: ['ALL'],
        emergencyBehavior: 'BLOCK_ALL'
    }
};

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
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    }

    clear() {
        this.cache.clear();
    }
}

const configCache = new TTLConfigCache(60000, 10);
const CACHE_KEY = 'ai_governance_config';

class AIGovernance {
    static get CAPABILITIES() { return CAPABILITIES; }
    static get ACTIVATION_STATES() { return ACTIVATION_STATES; }
    static get MATRIX() { return CAPABILITY_MATRIX; }

    static async assertEnabled(capability) {
        if (!capability || !Object.values(CAPABILITIES).includes(capability)) {
            throw new AIGovernanceError('UNKNOWN_CAPABILITY', capability || 'MISSING');
        }

        if (capability === CAPABILITIES.AI_UNCLASSIFIED) {
            throw new AIGovernanceError('CAPABILITY_DISABLED', capability);
        }

        const killswitch = process.env.AI_GLOBAL_KILLSWITCH;
        if (killswitch !== undefined) {
            const ksUpper = String(killswitch).trim().toUpperCase();
            if (ksUpper === 'TRUE' || ksUpper === '1') {
                throw new AIGovernanceError('GLOBAL_DISABLED', capability);
            } else if (ksUpper !== 'FALSE' && ksUpper !== '0') {
                throw new AIGovernanceError('INVALID_CONFIGURATION', capability);
            }
        }

        let config = configCache.get(CACHE_KEY);

        if (!config) {
            try {
                const setting = await SystemSetting.findOne({ key: 'ai_governance_config' }).lean();
                if (setting && setting.value) {
                    config = setting.value;
                    configCache.set(CACHE_KEY, config);
                } else {
                    throw new AIGovernanceError('CONFIG_UNAVAILABLE', capability);
                }
            } catch (err) {
                throw new AIGovernanceError('CONFIG_UNAVAILABLE', capability);
            }
        }

        // State evaluation
        const state = config[capability];
        if (!state) {
            throw new AIGovernanceError('INVALID_ACTIVATION_STATE', capability);
        }

        if (state === ACTIVATION_STATES.DISABLED) {
            throw new AIGovernanceError('CAPABILITY_DISABLED', capability);
        } else if (state !== ACTIVATION_STATES.ENABLED && state !== ACTIVATION_STATES.REQUIRES_APPROVAL) {
            throw new AIGovernanceError('INVALID_ACTIVATION_STATE', capability);
        }

        return state; 
    }

    static async updateActivationState(capability, newState, actorId) {
        if (!Object.values(CAPABILITIES).includes(capability)) {
            throw new Error(`Invalid capability: ${capability}`);
        }
        if (!Object.values(ACTIVATION_STATES).includes(newState)) {
            throw new Error(`Invalid state: ${newState}`);
        }

        let setting = await SystemSetting.findOne({ key: 'ai_governance_config' });
        let oldConfig = {};
        if (setting && setting.value) {
            oldConfig = setting.value;
        } else {
            setting = new SystemSetting({ key: 'ai_governance_config', value: {} });
        }

        const oldState = oldConfig[capability] || CAPABILITY_MATRIX[capability].defaultState;

        setting.value = { ...oldConfig, [capability]: newState };
        setting.markModified('value');
        await setting.save();

        configCache.set(CACHE_KEY, setting.value);

        try {
            await AuditLog.create({
                eventType: 'ai_activation_changed',
                description: `AI Capability ${capability} changed from ${oldState} to ${newState}`,
                metadata: {
                    capability,
                    previousState: oldState,
                    newState,
                    policyVersion: 'v1.0.0-p16-r5'
                },
                status: 'success',
                targetType: 'other',
                actorId: actorId
            });
        } catch (err) {
            console.error('AuditLog failure during activation state change', err);
        }

        return setting.value;
    }

    static _clearCache() {
        configCache.clear();
    }
}

export default AIGovernance;
