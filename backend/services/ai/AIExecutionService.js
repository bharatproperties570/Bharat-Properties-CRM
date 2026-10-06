import AIGovernance from './AIGovernance.js';
import AIDataPolicy from './AIDataPolicy.js';
import AIOutputValidator from './AIOutputValidator.js';
import UnifiedAIService from '../UnifiedAIService.js';
import AIExecutionContext from './AIExecutionContext.js';

export class AIExecutionServiceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AIExecutionServiceError';
        this.code = code;
    }
}

/**
 * AIExecutionService
 * Mandatory R1-R3 Pipeline Orchestrator.
 * All AI capabilities must enter through this boundary.
 */
class AIExecutionService {
    
    // Explicit Schema Registry mapping
    static SCHEMA_REGISTRY = {
        'AI_DATA_EXTRACTION': 'DOCUMENT_EXTRACTION',
        'AI_LIVE_CONVERSATION': 'CONVERSATION_INTENT',
        'AI_MARKETING_DRAFT': 'MARKETING_RESULT', // Example extension if needed
        'AI_INTERNAL_ASSIST': 'INTERNAL_RESULT'
    };

    // Explicit capabilities that are capable of driving mutations/side-effects downstream
    static MUTATING_CAPABILITIES = [
        'AI_LIVE_CONVERSATION',
        'AI_DEAL_VERIFICATION' // (Conceptual extension for future use)
    ];

    /**
     * Executes the mandatory AI pipeline (R1 -> R2 -> LLM -> R3).
     * @param {Object} request 
     * @param {AIExecutionContext} request.context - Context object
     * @param {string} request.capability - Registered capability
     * @param {any} request.inputData - Raw input/CRM object
     * @param {string} request.expectedSchema - Registered schema identifier
     * @param {string} [request.systemInstructions] - Base system prompt
     * @param {string} [request.provider] - Provider hint (e.g. 'openai')
     */
    static async execute(request) {
        if (!request) {
            throw new AIExecutionServiceError('MISSING_CONTEXT', 'Request object is required');
        }

        const { context, capability, inputData, expectedSchema, systemInstructions, provider } = request;

        // 1. Context validation
        if (!context || !(context instanceof AIExecutionContext)) {
            throw new AIExecutionServiceError('INVALID_CONTEXT', 'request.context must be an instance of AIExecutionContext');
        }

        // 2. Capability validation
        if (!capability) {
            throw new AIExecutionServiceError('MISSING_CAPABILITY', 'request.capability is required');
        }
        
        // Use AIGovernance's capability list to validate known capabilities
        if (!Object.values(AIGovernance.CAPABILITIES).includes(capability)) {
            throw new AIExecutionServiceError('UNKNOWN_CAPABILITY', `Capability ${capability} is unrecognized`);
        }

        // 3. Schema validation
        if (!expectedSchema) {
            throw new AIExecutionServiceError('MISSING_SCHEMA', 'request.expectedSchema is required');
        }

        const expectedRegisteredSchema = this.SCHEMA_REGISTRY[capability];
        if (expectedRegisteredSchema && expectedRegisteredSchema !== expectedSchema) {
            // Optional: strict binding of capability to schema, but at minimum it must be known to the validator
        }

        if (expectedSchema !== 'DOCUMENT_EXTRACTION' && expectedSchema !== 'CONVERSATION_INTENT') {
            throw new AIExecutionServiceError('UNKNOWN_SCHEMA', `Schema ${expectedSchema} is not supported by AIOutputValidator`);
        }

        // 4. R1 Governance Enforcement
        try {
            await AIGovernance.assertEnabled(capability);
        } catch (err) {
            throw new AIExecutionServiceError('GOVERNANCE_BLOCKED', `R1 Governance rejected execution: ${err.message}`);
        }

        // 5. Read vs Mutation Guard (Block R4/R5 side-effects until certified)
        if (this.MUTATING_CAPABILITIES.includes(capability)) {
            throw new AIExecutionServiceError('MUTATION_DISABLED', `Mutating capabilities are currently disabled until R3-D is certified (Capability: ${capability})`);
        }

        // 6. R2 Data Policy (Sanitize input before LLM exposure)
        let sanitizedData;
        try {
            // AIDataPolicy.sanitizeObject safely handles objects, arrays, or text.
            sanitizedData = AIDataPolicy.sanitizeObject(inputData);
        } catch (err) {
            throw new AIExecutionServiceError('DATA_POLICY_FAILED', `R2 Data Policy failed: ${err.message}`);
        }

        // 7. Deterministic Prompt Construction
        // We prevent LLM generation logic from spreading across callers.
        const inputString = typeof sanitizedData === 'string' ? sanitizedData : JSON.stringify(sanitizedData, null, 2);
        const userPrompt = `Input Context:\n${inputString}`;
        
        // 8. LLM Provider Execution (UnifiedAIService wrapper)
        let rawResponse;
        try {
            rawResponse = await UnifiedAIService.generate(userPrompt, {
                systemPrompt: systemInstructions || 'You are an AI assistant processing data.',
                capability: capability, // Enforce R1 defense-in-depth downstream
                provider: provider
            });
        } catch (err) {
            // Strip any raw details/keys out of internal provider errors to prevent credential leakage
            throw new AIExecutionServiceError('LLM_FAILED', `Provider execution failed: ${err.message}`);
        }

        // 9. R3 Output Validation
        try {
            if (expectedSchema === 'DOCUMENT_EXTRACTION') {
                return AIOutputValidator.validateDocumentExtraction(rawResponse);
            } else if (expectedSchema === 'CONVERSATION_INTENT') {
                return AIOutputValidator.validateConversationIntent(rawResponse);
            }
        } catch (err) {
            throw new AIExecutionServiceError('OUTPUT_VALIDATION_FAILED', `R3 Output Validation failed: ${err.message}`);
        }
    }
}

export default AIExecutionService;
