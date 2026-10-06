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

class AIExecutionService {
    
    static SCHEMA_COMPATIBILITY_REGISTRY = {
        'AI_DATA_EXTRACTION': ['DOCUMENT_EXTRACTION'],
        'AI_LIVE_CONVERSATION': ['CONVERSATION_INTENT'],
        'AI_ADDRESS_PARSING': ['ADDRESS_RESULT'],
        'AI_ADDRESS_CONFLICT_RESOLUTION': ['ADDRESS_CONFLICT_RESOLUTION_RESULT'],
        'AI_LEAD_PROFILING': ['LEAD_PROFILE_RESULT'],
        'AI_MARKETING_GENERATION': ['TEXT_GENERATION_RESULT', 'EMAIL_CONTENT_RESULT'],
        'AI_INTERNAL_ASSIST': ['INTERNAL_RESULT']
    };

    static MUTATING_CAPABILITIES = [
        'AI_LIVE_CONVERSATION',
        'AI_DEAL_VERIFICATION'
    ];

    static async execute(request) {
        if (!request) {
            throw new AIExecutionServiceError('MISSING_CONTEXT', 'Request object is required');
        }

        const { context, capability, inputData, expectedSchema, systemInstructions, provider } = request;

        if (!context || !(context instanceof AIExecutionContext)) {
            throw new AIExecutionServiceError('INVALID_CONTEXT', 'request.context must be an instance of AIExecutionContext');
        }

        if (!capability) {
            throw new AIExecutionServiceError('MISSING_CAPABILITY', 'request.capability is required');
        }
        
        if (!Object.values(AIGovernance.CAPABILITIES).includes(capability)) {
            throw new AIExecutionServiceError('UNKNOWN_CAPABILITY', `Capability ${capability} is unrecognized`);
        }

        if (!expectedSchema) {
            throw new AIExecutionServiceError('MISSING_SCHEMA', 'request.expectedSchema is required');
        }

        const globalAllowedSchemas = [
            'DOCUMENT_EXTRACTION', 'CONVERSATION_INTENT', 
            'ADDRESS_RESULT', 'ADDRESS_CONFLICT_RESOLUTION_RESULT',
            'LEAD_PROFILE_RESULT', 'TEXT_GENERATION_RESULT', 'EMAIL_CONTENT_RESULT'
        ];

        if (!globalAllowedSchemas.includes(expectedSchema)) {
            throw new AIExecutionServiceError('UNKNOWN_SCHEMA', `Schema ${expectedSchema} is not supported by AIOutputValidator`);
        }

        try {
            await AIGovernance.assertEnabled(capability);
        } catch (err) {
            throw new AIExecutionServiceError('GOVERNANCE_BLOCKED', `R1 Governance rejected execution: ${err.message}`);
        }

        const allowedSchemasForCap = this.SCHEMA_COMPATIBILITY_REGISTRY[capability];
        if (!allowedSchemasForCap || !allowedSchemasForCap.includes(expectedSchema)) {
            throw new AIExecutionServiceError('SCHEMA_CAPABILITY_MISMATCH', `Capability ${capability} does not support schema ${expectedSchema}`);
        }

        if (this.MUTATING_CAPABILITIES.includes(capability)) {
            throw new AIExecutionServiceError('MUTATION_DISABLED', `Mutating capabilities are currently disabled until R3-D is certified (Capability: ${capability})`);
        }

        let sanitizedData;
        try {
            sanitizedData = AIDataPolicy.sanitizeObject(inputData);
        } catch (err) {
            throw new AIExecutionServiceError('DATA_POLICY_FAILED', `R2 Data Policy failed: ${err.message}`);
        }

        const inputString = typeof sanitizedData === 'string' ? sanitizedData : JSON.stringify(sanitizedData, null, 2);
        
        // Preserve baseline prompt construction
        const userPrompt = typeof inputData === 'string' && inputData.length > 50 
                           ? inputString 
                           : `Input Context:\n${inputString}`;
        
        let rawResponse;
        try {
            rawResponse = await UnifiedAIService.generate(userPrompt, {
                systemPrompt: systemInstructions || 'You are an AI assistant processing data.',
                capability: capability,
                provider: provider
            });
        } catch (err) {
            throw new AIExecutionServiceError('LLM_FAILED', `Provider execution failed: ${err.message}`);
        }

        try {
            if (expectedSchema === 'DOCUMENT_EXTRACTION') return AIOutputValidator.validateDocumentExtraction(rawResponse);
            if (expectedSchema === 'CONVERSATION_INTENT') return AIOutputValidator.validateConversationIntent(rawResponse);
            if (expectedSchema === 'ADDRESS_RESULT') return AIOutputValidator.validateAddressResult(rawResponse);
            if (expectedSchema === 'ADDRESS_CONFLICT_RESOLUTION_RESULT') return AIOutputValidator.validateAddressConflictResolutionResult(rawResponse);
            if (expectedSchema === 'LEAD_PROFILE_RESULT') return AIOutputValidator.validateLeadProfileResult(rawResponse);
            if (expectedSchema === 'TEXT_GENERATION_RESULT') return AIOutputValidator.validateTextGenerationResult(rawResponse);
            if (expectedSchema === 'EMAIL_CONTENT_RESULT') return AIOutputValidator.validateEmailContentResult(rawResponse);
        } catch (err) {
            throw new AIExecutionServiceError('OUTPUT_VALIDATION_FAILED', `R3 Output Validation failed: ${err.message}`);
        }
    }
}

export default AIExecutionService;
