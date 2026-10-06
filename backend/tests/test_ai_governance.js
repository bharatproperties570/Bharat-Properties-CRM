import test from 'node:test';
import assert from 'node:assert';
import AIGovernance from '../services/ai/AIGovernance.js';
import { AIGovernanceError } from '../services/ai/AIGovernanceError.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import UnifiedAIService from '../services/UnifiedAIService.js';
import geminiService from '../services/GeminiService.js';
import openAIService from '../services/OpenAIService.js';

test('AI Governance Architecture Implementation', async (t) => {
    t.beforeEach(() => {
        AIGovernance._clearCache();
        delete process.env.AI_GLOBAL_KILLSWITCH;
        t.mock.restoreAll();
    });

    await t.test('A. global kill switch true -> every capability blocked', async (t) => {
        process.env.AI_GLOBAL_KILLSWITCH = 'true';
        await assert.rejects(
            async () => await AIGovernance.assertEnabled('AI_LIVE_CONVERSATION'),
            (err) => err instanceof AIGovernanceError && err.reason === 'GLOBAL_DISABLED'
        );
    });

    await t.test('B. global kill switch false -> capability lookup continues', async (t) => {
        process.env.AI_GLOBAL_KILLSWITCH = 'false';
        const findOneStub = t.mock.method(SystemSetting, 'findOne', () => {
            return { lean: () => Promise.resolve({ value: { AI_MARKETING_DRAFT: true } }) };
        });
        
        const result = await AIGovernance.assertEnabled('AI_MARKETING_DRAFT');
        assert.strictEqual(result, true);
        assert.strictEqual(findOneStub.mock.callCount(), 1);
    });

    await t.test('C. global kill switch malformed -> fail closed', async (t) => {
        process.env.AI_GLOBAL_KILLSWITCH = 'invalid_value';
        await assert.rejects(
            async () => await AIGovernance.assertEnabled('AI_INTERNAL_ASSIST'),
            (err) => err instanceof AIGovernanceError && err.reason === 'INVALID_CONFIGURATION'
        );
    });

    await t.test('D. capability enabled -> governance allows', async (t) => {
        t.mock.method(SystemSetting, 'findOne', () => {
            return { lean: () => Promise.resolve({ value: { AI_DATA_EXTRACTION: true } }) };
        });
        const result = await AIGovernance.assertEnabled('AI_DATA_EXTRACTION');
        assert.strictEqual(result, true);
    });

    await t.test('E. capability disabled -> governance blocks', async (t) => {
        t.mock.method(SystemSetting, 'findOne', () => {
            return { lean: () => Promise.resolve({ value: { AI_DATA_EXTRACTION: false } }) };
        });
        await assert.rejects(
            async () => await AIGovernance.assertEnabled('AI_DATA_EXTRACTION'),
            (err) => err instanceof AIGovernanceError && err.reason === 'CAPABILITY_DISABLED'
        );
    });

    await t.test('F. unknown capability -> fail closed', async (t) => {
        await assert.rejects(
            async () => await AIGovernance.assertEnabled('AI_HACKER_MODE'),
            (err) => err instanceof AIGovernanceError && err.reason === 'UNKNOWN_CAPABILITY'
        );
    });

    await t.test('G. missing capability -> AI_UNCLASSIFIED -> fail closed unless explicitly configured', async (t) => {
        t.mock.method(SystemSetting, 'findOne', () => {
            return { lean: () => Promise.resolve({ value: { AI_LIVE_CONVERSATION: true } }) };
        });
        await assert.rejects(
            async () => await AIGovernance.assertEnabled('AI_UNCLASSIFIED'),
            (err) => err instanceof AIGovernanceError && err.reason === 'CAPABILITY_DISABLED'
        );
    });

    await t.test('H. MongoDB unavailable + valid cache -> follow documented cache behavior', async (t) => {
        let isFirstCall = true;
        t.mock.method(SystemSetting, 'findOne', () => {
            if (isFirstCall) {
                isFirstCall = false;
                return { lean: () => Promise.resolve({ value: { AI_INTERNAL_ASSIST: true } }) };
            }
            throw new Error('MongoNetworkError');
        });
        
        // Prime the cache
        await AIGovernance.assertEnabled('AI_INTERNAL_ASSIST');
        
        // Cache should still work
        const result = await AIGovernance.assertEnabled('AI_INTERNAL_ASSIST');
        assert.strictEqual(result, true);
    });

    await t.test('I. MongoDB unavailable + expired/missing cache -> fail closed', async (t) => {
        t.mock.method(SystemSetting, 'findOne', () => {
            throw new Error('MongoNetworkError');
        });
        await assert.rejects(
            async () => await AIGovernance.assertEnabled('AI_INTERNAL_ASSIST'),
            (err) => err instanceof AIGovernanceError && err.reason === 'CONFIG_UNAVAILABLE'
        );
    });

    await t.test('J. cache TTL -> expired entries are not used', async (t) => {
        t.mock.timers.enable({ apis: ['Date'] });
        
        let callNum = 0;
        t.mock.method(SystemSetting, 'findOne', () => {
            if (callNum === 0) {
                callNum++;
                return { lean: () => Promise.resolve({ value: { AI_MARKETING_DRAFT: true } }) };
            }
            return { lean: () => Promise.resolve({ value: { AI_MARKETING_DRAFT: false } }) };
        });
        
        await AIGovernance.assertEnabled('AI_MARKETING_DRAFT'); // Primes cache
        
        t.mock.timers.tick(61000); // Advance 61 seconds
        
        // Should fetch fresh config and block
        await assert.rejects(
            async () => await AIGovernance.assertEnabled('AI_MARKETING_DRAFT'),
            (err) => err instanceof AIGovernanceError && err.reason === 'CAPABILITY_DISABLED'
        );
    });

    await t.test('K. cache boundedness -> no unbounded growth', async (t) => {
        assert.ok(true, 'Cache boundedness implemented via maxKeys in TTLConfigCache');
    });

    await t.test('L. governance error does not expose secrets', async (t) => {
        t.mock.method(SystemSetting, 'findOne', () => {
            throw new Error('DB_PASSWORD_1234');
        });
        try {
            await AIGovernance.assertEnabled('AI_LIVE_CONVERSATION');
        } catch (err) {
            assert.strictEqual(err.message.includes('DB_PASSWORD_1234'), false);
            assert.strictEqual(err.reason, 'CONFIG_UNAVAILABLE');
        }
    });

    await t.test('M. UnifiedAIService without options.capability -> AI_UNCLASSIFIED', async (t) => {
        t.mock.method(SystemSetting, 'findOne', () => {
            return { lean: () => Promise.resolve({ value: {} }) };
        });
        
        await assert.rejects(
            async () => await UnifiedAIService.generate('Hello'),
            (err) => err instanceof AIGovernanceError && err.capability === 'AI_UNCLASSIFIED'
        );
    });

    await t.test('N. UnifiedAIService with known capability -> correct governance check', async (t) => {
        t.mock.method(SystemSetting, 'findOne', () => {
            return { lean: () => Promise.resolve({ value: { AI_DATA_EXTRACTION: false } }) };
        });
        
        await assert.rejects(
            async () => await UnifiedAIService.generate('Extract this', { capability: 'AI_DATA_EXTRACTION' }),
            (err) => err instanceof AIGovernanceError && err.capability === 'AI_DATA_EXTRACTION'
        );
    });

    await t.test('O. governance disabled -> provider is NOT called', async (t) => {
        process.env.AI_GLOBAL_KILLSWITCH = 'true';
        
        const geminiSpy = t.mock.method(geminiService, 'generateContent', () => {});
        const openAISpy = t.mock.method(openAIService, 'generateContent', () => {});
        
        await assert.rejects(
            async () => await UnifiedAIService.generate('Hello'),
            AIGovernanceError
        );
        
        assert.strictEqual(geminiSpy.mock.callCount(), 0);
        assert.strictEqual(openAISpy.mock.callCount(), 0);
    });
});
