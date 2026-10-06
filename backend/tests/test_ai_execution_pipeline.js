import test from 'node:test';
import assert from 'node:assert';
import AIExecutionService, { AIExecutionServiceError } from '../services/ai/AIExecutionService.js';
import AIExecutionContext from '../services/ai/AIExecutionContext.js';
import AIGovernance from '../services/ai/AIGovernance.js';
import UnifiedAIService from '../services/UnifiedAIService.js';

test('AIExecutionService - Pipeline Contract', async (t) => {
    
    const baseContext = AIExecutionContext.fromSystem('tenant_sys', 'sys_123', 'trace-01');

    // MOCK AIGovernance to prevent MongoDB/Redis hanging
    const originalAssertEnabled = AIGovernance.assertEnabled;
    t.after(() => {
        AIGovernance.assertEnabled = originalAssertEnabled;
    });

    AIGovernance.assertEnabled = async (capability) => {
        if (capability === 'AI_UNCLASSIFIED') {
            throw new Error('CAPABILITY_DISABLED');
        }
        return true;
    };

    await t.test('Context: missing context rejected', async () => {
        await assert.rejects(
            AIExecutionService.execute({}),
            (err) => err.code === 'INVALID_CONTEXT'
        );
    });

    await t.test('Capability: missing capability rejected', async () => {
        await assert.rejects(
            AIExecutionService.execute({ context: baseContext }),
            (err) => err.code === 'MISSING_CAPABILITY'
        );
    });

    await t.test('Capability: unknown capability rejected', async () => {
        await assert.rejects(
            AIExecutionService.execute({ context: baseContext, capability: 'AI_HACK_SYSTEM' }),
            (err) => err.code === 'UNKNOWN_CAPABILITY'
        );
    });

    await t.test('Schema: missing schema rejected', async () => {
        await assert.rejects(
            AIExecutionService.execute({ 
                context: baseContext, 
                capability: 'AI_DATA_EXTRACTION' 
            }),
            (err) => err.code === 'MISSING_SCHEMA'
        );
    });

    await t.test('Schema: unknown schema rejected', async () => {
        await assert.rejects(
            AIExecutionService.execute({ 
                context: baseContext, 
                capability: 'AI_DATA_EXTRACTION',
                expectedSchema: 'HACKED_SCHEMA' 
            }),
            (err) => err.code === 'UNKNOWN_SCHEMA'
        );
    });

    await t.test('Mutation: mutation capability is blocked while R3-D is uncertified', async () => {
        await assert.rejects(
            AIExecutionService.execute({
                context: baseContext,
                capability: 'AI_LIVE_CONVERSATION',
                expectedSchema: 'CONVERSATION_INTENT'
            }),
            (err) => err.code === 'MUTATION_DISABLED'
        );
    });

    await t.test('Governance: governance failure prevents LLM call', async () => {
        await assert.rejects(
            AIExecutionService.execute({
                context: baseContext,
                capability: 'AI_UNCLASSIFIED',
                expectedSchema: 'DOCUMENT_EXTRACTION'
            }),
            (err) => err.code === 'GOVERNANCE_BLOCKED'
        );
    });

    await t.test('R2 & LLM: raw input sanitized, LLM failure handled', async () => {
        const originalGenerate = UnifiedAIService.generate;
        
        let receivedPrompt = '';
        UnifiedAIService.generate = async (prompt, opts) => {
            receivedPrompt = prompt;
            throw new Error('API Rate Limit Exceeded');
        };

        const maliciousInput = { name: 'John Doe', phone: '9876543210', internalId: 'deal-secret-123' };
        
        await assert.rejects(
            AIExecutionService.execute({
                context: baseContext,
                capability: 'AI_DATA_EXTRACTION',
                expectedSchema: 'DOCUMENT_EXTRACTION',
                inputData: maliciousInput
            }),
            (err) => err.code === 'LLM_FAILED'
        );

        // phone should be masked by AIDataPolicy
        assert.ok(receivedPrompt.includes('[REDACTED_PHONE]'));
        assert.ok(!receivedPrompt.includes('9876543210'));

        UnifiedAIService.generate = originalGenerate;
    });

    await t.test('R3: valid output accepted, malformed rejected', async () => {
        const originalGenerate = UnifiedAIService.generate;
        
        UnifiedAIService.generate = async () => {
            return `\`\`\`json\n{"price": "50L", "size": "2BHK", "location": "Pune", "intent": "BUYER", "property_type": "Apartment"}\n\`\`\``;
        };

        const successResult = await AIExecutionService.execute({
            context: baseContext,
            capability: 'AI_DATA_EXTRACTION',
            expectedSchema: 'DOCUMENT_EXTRACTION',
            inputData: 'Some plain text'
        });

        assert.strictEqual(successResult.intent, 'BUYER');
        
        UnifiedAIService.generate = async () => {
            return `{"price": "50L", missing the rest of json`;
        };

        await assert.rejects(
            AIExecutionService.execute({
                context: baseContext,
                capability: 'AI_DATA_EXTRACTION',
                expectedSchema: 'DOCUMENT_EXTRACTION',
                inputData: 'Some text'
            }),
            (err) => err.code === 'OUTPUT_VALIDATION_FAILED'
        );

        UnifiedAIService.generate = async () => {
            return `{"price": "50L", "size": "2BHK", "property_type": "Apartment"}`;
        };

        await assert.rejects(
            AIExecutionService.execute({
                context: baseContext,
                capability: 'AI_DATA_EXTRACTION',
                expectedSchema: 'DOCUMENT_EXTRACTION',
                inputData: 'Some text'
            }),
            (err) => err.code === 'OUTPUT_VALIDATION_FAILED'
        );

        UnifiedAIService.generate = originalGenerate;
    });
});
