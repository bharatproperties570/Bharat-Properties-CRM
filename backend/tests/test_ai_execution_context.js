import test from 'node:test';
import assert from 'node:assert';
import AIExecutionContext from '../services/ai/AIExecutionContext.js';

test('AIExecutionContext - Complete Suite', async (t) => {
    
    await t.test('Creation: valid HUMAN_USER context succeeds', () => {
        const reqUser = {
            _id: 'user_123',
            tenantId: 'tenant_abc',
            roles: ['ADMIN'],
            permissions: ['READ_ALL', 'UPDATE_DEAL']
        };
        
        const ctx = AIExecutionContext.fromHttpRequest(reqUser, 'trace-01');
        assert.strictEqual(ctx.tenantId, 'tenant_abc');
        assert.strictEqual(ctx.actorType, 'HUMAN_USER');
        assert.strictEqual(ctx.actorId, 'user_123');
        assert.strictEqual(ctx.correlationId, 'trace-01');
        assert.strictEqual(ctx.sourceChannel, 'HTTP_API');
        assert.deepStrictEqual(ctx.roles, ['ADMIN']);
        assert.deepStrictEqual(ctx.permissions, ['READ_ALL', 'UPDATE_DEAL']);
        assert.ok(ctx.timestamp instanceof Date);
    });

    await t.test('Creation: valid WEBHOOK context succeeds', () => {
        const integration = {
            _id: 'integration_456',
            tenantId: 'tenant_def'
        };
        const ctx = AIExecutionContext.fromWebhook(integration);
        assert.strictEqual(ctx.tenantId, 'tenant_def');
        assert.strictEqual(ctx.actorType, 'WEBHOOK');
        assert.strictEqual(ctx.actorId, 'integration_456');
        assert.ok(ctx.correlationId.length > 10, 'Should auto-generate correlationId');
    });

    await t.test('Creation: valid SYSTEM context succeeds', () => {
        const ctx = AIExecutionContext.fromSystem('tenant_sys', 'cron_job_daily');
        assert.strictEqual(ctx.tenantId, 'tenant_sys');
        assert.strictEqual(ctx.actorType, 'SYSTEM');
        assert.strictEqual(ctx.actorId, 'cron_job_daily');
    });

    await t.test('Required identity: missing tenantId rejected', () => {
        assert.throws(() => {
            AIExecutionContext.fromHttpRequest({ _id: 'user_123' }); // No tenantId
        }, /tenantId is strictly required/);
    });

    await t.test('Required identity: missing actorId rejected', () => {
        assert.throws(() => {
            new AIExecutionContext({
                tenantId: 'tenant_1',
                actorType: 'HUMAN_USER'
                // missing actorId
            });
        }, /actorId is strictly required/);
    });

    await t.test('Required identity: invalid actorType rejected', () => {
        assert.throws(() => {
            new AIExecutionContext({
                tenantId: 'tenant_1',
                actorId: 'agent_1',
                actorType: 'AI_AGENT' // Not in ALLOWED_ACTOR_TYPES
            });
        }, /Invalid actorType: AI_AGENT/);
    });

    await t.test('Immutability: properties cannot be mutated', () => {
        const ctx = AIExecutionContext.fromSystem('tenant_test', 'system_1');
        
        assert.throws(() => {
            ctx.tenantId = 'hacked_tenant';
        }, TypeError, 'Should throw TypeError in strict mode or object frozen');
        
        assert.throws(() => {
            ctx.actorId = 'hacked_actor';
        }, TypeError);

        assert.throws(() => {
            ctx.actorType = 'HUMAN_USER';
        }, TypeError);
        
        assert.throws(() => {
            ctx.roles.push('SUPER_ADMIN');
        }, TypeError, 'Should throw TypeError when modifying frozen array');
    });

    await t.test('Trust boundary: LLM-like input cannot overwrite properties (Adversarial Tests)', () => {
        // Test A: Attempt to inject tenantId
        const baseInputA = { tenantId: 'OTHER_TENANT' };
        const ctxA = new AIExecutionContext({
            tenantId: 'REAL_TENANT',
            actorId: 'actor_1',
            actorType: 'SYSTEM'
        });
        // Try merging LLM input (common vulnerability pattern)
        const mergedA = Object.assign({}, ctxA, baseInputA);
        // We verify that Object.assign DOES NOT overwrite the immutable instance. 
        // Note: Object.assign on a frozen object in strict mode might throw, or just create a plain object.
        // The real test is that you CANNOT construct the object with untrusted keys seamlessly, 
        // because the constructor ignores everything except explicit trustedParams mapped manually.
        
        assert.strictEqual(ctxA.tenantId, 'REAL_TENANT');
        assert.throws(() => {
            Object.assign(ctxA, baseInputA);
        }, TypeError);

        // Test B, C: Same for actorId and permissions
        assert.throws(() => { Object.assign(ctxA, { actorId: 'ADMIN_USER' }); }, TypeError);
        assert.throws(() => { Object.assign(ctxA, { permissions: ['DELETE_ALL'] }); }, TypeError);

        // Test D: Constructing with nulls fails closed
        assert.throws(() => {
            new AIExecutionContext({ tenantId: null, actorId: null, actorType: 'SYSTEM' });
        }, /tenantId is strictly required/);
    });

    await t.test('Correlation: correlationId generated if absent and preserved if supplied', () => {
        const ctxGenerated = AIExecutionContext.fromSystem('t1', 's1');
        assert.ok(ctxGenerated.correlationId);

        const ctxSupplied = AIExecutionContext.fromSystem('t1', 's1', 'my-trace-999');
        assert.strictEqual(ctxSupplied.correlationId, 'my-trace-999');
    });

    await t.test('Worker serialization: round-trip preserves context', () => {
        const originalCtx = AIExecutionContext.fromHttpRequest({
            _id: 'user_mq',
            tenantId: 'tenant_mq',
            roles: ['MANAGER']
        }, 'trace-mq');

        const serialized = originalCtx.toJSON();
        const deserialized = AIExecutionContext.fromSerialized(serialized);

        assert.strictEqual(deserialized.tenantId, 'tenant_mq');
        assert.strictEqual(deserialized.actorId, 'user_mq');
        assert.strictEqual(deserialized.actorType, 'HUMAN_USER');
        assert.strictEqual(deserialized.correlationId, 'trace-mq');
        assert.deepStrictEqual(deserialized.roles, ['MANAGER']);
        // Verify time preservation (allow small drift or string conversion)
        assert.strictEqual(deserialized.timestamp.toISOString(), originalCtx.timestamp.toISOString());
    });

    await t.test('Worker serialization: malformed serialized context rejected', () => {
        assert.throws(() => {
            AIExecutionContext.fromSerialized(null);
        }, /Invalid serialized context data/);

        assert.throws(() => {
            AIExecutionContext.fromSerialized({ actorId: 'user_1' }); // missing tenantId
        }, /tenantId is strictly required/);
    });

});
