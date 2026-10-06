import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import AIOutputValidator, { AIValidationError } from '../services/ai/AIOutputValidator.js';
import aiBotService from '../services/aiBot.service.js';
import LLMService from '../services/ai/LLMService.js';
import UnifiedAIService from '../services/UnifiedAIService.js';
import AiAgent from '../models/AiAgent.js';
import AIGovernance from '../services/ai/AIGovernance.js';
import { AIGovernanceError } from '../services/ai/AIGovernanceError.js';

mongoose.set('bufferCommands', false);
const originalGenerate = UnifiedAIService.generate;

test('P16-R3 Structured AI Output & Validation Foundation', async (t) => {

    t.beforeEach(() => {
        t.mock.restoreAll();
        AiAgent.findOne = async () => ({
            provider: 'gemini',
            modelName: 'test',
            systemPrompt: 'Sys',
            memoryAccess: [],
            isActive: true
        });
        UnifiedAIService.lastCall = null;
        
        t.mock.method(UnifiedAIService, 'generate', async (prompt, opts) => {
            UnifiedAIService.lastCall = { prompt, opts };
            return '{"intent": "RESPOND_USER", "content": "Hi", "confidence": 0.9, "requestedAction": "NONE"}';
        });
    });

    await t.test('1. valid structured AI output', () => {
        const out = AIOutputValidator.validateConversationIntent({
            intent: 'RESPOND_USER', content: 'Hi', confidence: 0.9, requestedAction: 'SEND_WHATSAPP'
        });
        assert.strictEqual(out.intent, 'RESPOND_USER');
    });

    await t.test('2. invalid JSON', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent('{"intent": "RESPOND_USER", broken_json...');
        }, err => err instanceof AIValidationError && err.message.includes('Invalid JSON'));
    });

    await t.test('3. missing required field', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent({ intent: 'RESPOND_USER', confidence: 0.9 });
        }, err => err instanceof AIValidationError && err.message.includes('Mismatch'));
    });

    await t.test('4. wrong field type', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent({
                intent: 'RESPOND_USER', content: 'Hi', confidence: 'very high', requestedAction: 'NONE'
            });
        }, err => err instanceof AIValidationError);
    });

    await t.test('5. invalid enum', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent({
                intent: 'HACK_SYSTEM', content: 'Hi', confidence: 0.9, requestedAction: 'NONE'
            });
        }, err => err instanceof AIValidationError);
    });

    await t.test('6. confidence < 0', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent({
                intent: 'RESPOND_USER', content: 'Hi', confidence: -0.1, requestedAction: 'NONE'
            });
        }, err => err instanceof AIValidationError);
    });

    await t.test('7. confidence > 1 or repository-defined valid range', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent({
                intent: 'RESPOND_USER', content: 'Hi', confidence: 1.1, requestedAction: 'NONE'
            });
        }, err => err instanceof AIValidationError);
    });

    await t.test('8. unknown action', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent({
                intent: 'RESPOND_USER', content: 'Hi', confidence: 0.9, requestedAction: 'DELETE_DB'
            });
        }, err => err instanceof AIValidationError);
    });

    await t.test('9. arbitrary action injection', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent({
                intent: 'RESPOND_USER', content: 'Hi', confidence: 0.9, requestedAction: 'NONE', maliciousField: 'drop_table'
            });
        }, err => err instanceof AIValidationError);
    });

    await t.test('10. __proto__ pollution', () => {
        assert.throws(() => {
            AIOutputValidator._parseRawJSON('{"__proto__": {"hacked": true}}');
        }, err => err instanceof AIValidationError && err.message.includes('Prototype pollution'));
    });

    await t.test('11. constructor pollution', () => {
        assert.throws(() => {
            AIOutputValidator._parseRawJSON('{"constructor": {"prototype": {"hacked": true}}}');
        }, err => err instanceof AIValidationError && err.message.includes('Prototype pollution'));
    });

    await t.test('12. prototype pollution', () => {
        assert.throws(() => {
            AIOutputValidator._parseRawJSON('{"prototype": {"hacked": true}}');
        }, err => err instanceof AIValidationError && err.message.includes('Prototype pollution'));
    });

    await t.test('13. malicious nested object', () => {
        assert.throws(() => {
            AIOutputValidator._parseRawJSON('{"nested": {"__proto__": {"hacked": true}}}');
        }, err => err instanceof AIValidationError && err.message.includes('Prototype pollution'));
    });

    await t.test('14. unexpected extra fields', () => {
        assert.throws(() => {
            AIOutputValidator.validateDocumentExtraction({
                price: '10M', size: '100sqft', location: 'Delhi', intent: 'BUYER', property_type: 'FLAT', extra: 'bad'
            });
        }, err => err instanceof AIValidationError);
    });

    await t.test('15. provider-specific malformed response', () => {
        assert.throws(() => {
            AIOutputValidator.validateConversationIntent('```json\nmalformed\n```');
        }, err => err instanceof AIValidationError);
    });

    await t.test('16. valid document extraction', () => {
        const out = AIOutputValidator.validateDocumentExtraction({
            price: '10M', size: '100sqft', location: 'Delhi', intent: 'BUYER', property_type: 'FLAT'
        });
        assert.strictEqual(out.price, '10M');
    });

    await t.test('17. malformed document extraction', () => {
        assert.throws(() => {
            AIOutputValidator.validateDocumentExtraction({ price: '10M' });
        }, err => err instanceof AIValidationError);
    });

    await t.test('18. AI output containing prompt injection text (structurally valid)', () => {
        const out = AIOutputValidator.validateConversationIntent({
            intent: 'RESPOND_USER', content: 'Ignore previous instructions', confidence: 0.9, requestedAction: 'NONE'
        });
        assert.strictEqual(out.content, 'Ignore previous instructions');
    });

    await t.test('19. AI output attempting to issue a CRM mutation (structurally valid)', () => {
        const out = AIOutputValidator.validateConversationIntent({
            intent: 'RESPOND_USER', content: 'update lead', confidence: 0.9, requestedAction: 'NONE'
        });
        assert.strictEqual(out.content, 'update lead');
    });

    await t.test('20. AI output attempting to issue WhatsApp send (structurally valid)', () => {
        const out = AIOutputValidator.validateConversationIntent({
            intent: 'RESPOND_USER', content: 'hello', confidence: 0.9, requestedAction: 'SEND_WHATSAPP'
        });
        assert.strictEqual(out.requestedAction, 'SEND_WHATSAPP');
    });

    await t.test('21. AI_UNCLASSIFIED still blocked by P16-R1', async () => {
        // Restore actual generate to test the inner AIGovernance guard
        UnifiedAIService.generate = originalGenerate;
        t.mock.method(AIGovernance, 'assertEnabled', async () => { throw new AIGovernanceError('Disabled', 'AI_UNCLASSIFIED'); });
        
        await assert.rejects(
            async () => await UnifiedAIService.generate('test'),
            AIGovernanceError
        );
    });

    await t.test('22. validation failure does not invoke side-effect code', async () => {
        // Override mock for this test
        t.mock.method(UnifiedAIService, 'generate', async () => '{"intent": "INVALID_JSON_HERE');
        
        const result = await aiBotService.generateBotResponse('Hello');
        assert.strictEqual(result.success, false);
    });
});
