import { StageTransitionEngine } from '../../utils/ServerAuthorityProof.js';
import { DEFAULT_STAGE_RULES } from './StageTransitionEngineConstants.js';

export const resolveTransition = (...args) => StageTransitionEngine.resolveTransition(...args);
export const evaluateAndTransition = (...args) => StageTransitionEngine.evaluateAndTransition(...args);
export const executeTransition = (...args) => StageTransitionEngine.executeTransition(...args);
export const loadTransitionRules = (...args) => StageTransitionEngine.loadTransitionRules(...args);
export const validateRequiredFields = (...args) => StageTransitionEngine.validateRequiredFields(...args);
export const invalidateRulesCache = (...args) => StageTransitionEngine.invalidateRulesCache(...args);

export { DEFAULT_STAGE_RULES };

export default {
    resolveTransition,
    evaluateAndTransition,
    executeTransition,
    loadTransitionRules,
    validateRequiredFields,
    invalidateRulesCache,
    DEFAULT_STAGE_RULES
};
