import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';

let mongoServer;
let redisServer;

async function setup() {
    redisServer = new RedisMemoryServer();
    const redisHost = await redisServer.getHost();
    const redisPort = await redisServer.getPort();
    process.env.REDIS_HOST = redisHost;
    process.env.REDIS_PORT = redisPort;
    
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;
    await mongoose.connect(mongoUri);

    const AIOutputValidator = (await import('../services/ai/AIOutputValidator.js')).default;
    const AIExecutionService = (await import('../services/ai/AIExecutionService.js')).default;
    const AIGovernance = (await import('../services/ai/AIGovernance.js')).default;
    const AIExecutionContext = (await import('../services/ai/AIExecutionContext.js')).default;
    const UnifiedAIService = (await import('../services/UnifiedAIService.js')).default;

    return { AIOutputValidator, AIExecutionService, AIGovernance, AIExecutionContext, UnifiedAIService };
}

async function runTests() {
    const { AIOutputValidator, AIExecutionService, AIGovernance, AIExecutionContext, UnifiedAIService } = await setup();
    
    let generatorCalled = false;
    
    UnifiedAIService.generate = async (prompt, opts) => {
        generatorCalled = true;
        if (opts.capability === 'AI_ADDRESS_PARSING') {
            return JSON.stringify({ location: 'Loc', city: 'City', state: 'State', country: 'Country' });
        }
        if (opts.capability === 'AI_ADDRESS_CONFLICT_RESOLUTION') {
            return JSON.stringify({ 'Address PINCODE': 'UPDATE' });
        }
        if (opts.capability === 'AI_LEAD_PROFILING') {
            return JSON.stringify({ requirement: 'Buy', budgetMin: 100, budgetMax: 200, location: 'City', summary: 'Summary' });
        }
        if (opts.capability === 'AI_MARKETING_GENERATION') {
            if (prompt.includes('Email')) {
                return JSON.stringify({ subject: 'Test', body: 'Test body' });
            }
            return JSON.stringify({ content: 'Hello JSON' });
        }
        return '{}';
    };

    AIGovernance.assertEnabled = async (capability) => {
        return 'ENABLED'; 
    };

    const ctx = AIExecutionContext.fromSystem('TENANT', 'test');

    console.log('Testing A: Raw text rejected by TEXT_GENERATION_RESULT');
    assert.throws(() => AIOutputValidator.validateTextGenerationResult('Plain raw text'), /Invalid JSON/);

    console.log('Testing B: Structured text envelope accepted');
    const txt1 = AIOutputValidator.validateTextGenerationResult(JSON.stringify({ content: 'Hello JSON' }));
    assert.strictEqual(txt1.content, 'Hello JSON');

    console.log('Testing C: Extra property rejected in Text Gen envelope');
    assert.throws(() => AIOutputValidator.validateTextGenerationResult(JSON.stringify({ content: 'Hello', foo: 'bar' })), /Text Generation Schema Mismatch/);

    console.log('Testing D: Valid ADDRESS_RESULT accepted');
    const addr = AIOutputValidator.validateAddressResult(JSON.stringify({ location: 'Loc', city: 'City', state: 'State', country: 'India', pincode: '110001' }));
    assert.strictEqual(addr.location, 'Loc');

    console.log('Testing E: Valid ADDRESS_CONFLICT_RESOLUTION_RESULT accepted');
    const res = AIOutputValidator.validateAddressConflictResolutionResult(JSON.stringify({ 'Address PINCODE': 'UPDATE' }));
    assert.strictEqual(res['Address PINCODE'], 'UPDATE');

    console.log('Testing F: Unknown conflict key rejected');
    assert.throws(() => AIOutputValidator.validateAddressConflictResolutionResult(JSON.stringify({ 'Address PINCODE': 'UPDATE', 'Address INVALID': 'UPDATE' })), /Address Conflict Resolution Schema Mismatch/);

    console.log('Testing G: Invalid disposition rejected');
    assert.throws(() => AIOutputValidator.validateAddressConflictResolutionResult(JSON.stringify({ 'Address PINCODE': 'FOO' })), /Address Conflict Resolution Schema Mismatch/);

    console.log('Testing H: Valid LEAD_PROFILE_RESULT accepted');
    const lead = AIOutputValidator.validateLeadProfileResult(JSON.stringify({ requirement: 'Buy', budgetMin: 100, budgetMax: 200, location: 'City', summary: 'Summary' }));
    assert.strictEqual(lead.requirement, 'Buy');

    console.log('Testing I: Valid EMAIL_CONTENT_RESULT accepted');
    const email = AIOutputValidator.validateEmailContentResult(JSON.stringify({ subject: 'Sub', body: 'Body' }));
    assert.strictEqual(email.subject, 'Sub');

    // Mismatch tests
    async function testMismatch(capability, expectedSchema) {
        generatorCalled = false;
        await assert.rejects(
            AIExecutionService.execute({ context: ctx, capability, expectedSchema, inputData: 'test' }), 
            /does not support schema/
        );
        assert.strictEqual(generatorCalled, false, `LLM was called despite mismatch for ${capability}+${expectedSchema}`);
    }

    async function testMatch(capability, expectedSchema) {
        generatorCalled = false;
        await AIExecutionService.execute({ context: ctx, capability, expectedSchema, inputData: expectedSchema === 'EMAIL_CONTENT_RESULT' ? 'Email test' : 'Normal test' });
        assert.strictEqual(generatorCalled, true, `LLM was NOT called for match ${capability}+${expectedSchema}`);
    }

    console.log('Testing J: ADDRESS_PARSING + ADDRESS_RESULT → PASS');
    await testMatch('AI_ADDRESS_PARSING', 'ADDRESS_RESULT');

    console.log('Testing K: ADDRESS_PARSING + EMAIL_CONTENT_RESULT → BLOCK');
    await testMismatch('AI_ADDRESS_PARSING', 'EMAIL_CONTENT_RESULT');

    console.log('Testing L: ADDRESS_PARSING + TEXT_GENERATION_RESULT → BLOCK');
    await testMismatch('AI_ADDRESS_PARSING', 'TEXT_GENERATION_RESULT');

    console.log('Testing M: ADDRESS_CONFLICT_RESOLUTION + ADDRESS_CONFLICT_RESOLUTION_RESULT → PASS');
    await testMatch('AI_ADDRESS_CONFLICT_RESOLUTION', 'ADDRESS_CONFLICT_RESOLUTION_RESULT');

    console.log('Testing N: ADDRESS_CONFLICT_RESOLUTION + ADDRESS_RESULT → BLOCK');
    await testMismatch('AI_ADDRESS_CONFLICT_RESOLUTION', 'ADDRESS_RESULT');

    console.log('Testing O: LEAD_PROFILING + LEAD_PROFILE_RESULT → PASS');
    await testMatch('AI_LEAD_PROFILING', 'LEAD_PROFILE_RESULT');

    console.log('Testing P: LEAD_PROFILING + EMAIL_CONTENT_RESULT → BLOCK');
    await testMismatch('AI_LEAD_PROFILING', 'EMAIL_CONTENT_RESULT');

    console.log('Testing Q: MARKETING_GENERATION + TEXT_GENERATION_RESULT → PASS');
    await testMatch('AI_MARKETING_GENERATION', 'TEXT_GENERATION_RESULT');

    console.log('Testing R: MARKETING_GENERATION + EMAIL_CONTENT_RESULT → PASS');
    await testMatch('AI_MARKETING_GENERATION', 'EMAIL_CONTENT_RESULT');

    console.log('Testing S: MARKETING_GENERATION + ADDRESS_RESULT → BLOCK');
    await testMismatch('AI_MARKETING_GENERATION', 'ADDRESS_RESULT');

    console.log('ALL R3-G-R TESTS PASSED.');
    
    await mongoose.disconnect();
    await mongoServer.stop();
    await redisServer.stop();
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
