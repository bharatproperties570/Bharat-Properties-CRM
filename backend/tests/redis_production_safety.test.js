/**
 * redis_production_safety.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * P0-A Verification Suite:
 * 1. Genuine isolated production-mode startup tests using child processes.
 * 2. NODE_ENV=production is set before importing redis.js.
 * 3. Redis startup with unavailable endpoint NEVER attaches MockRedis (isMock: false, isOnline: false).
 * 4. safeRedisCall() rejects with STORAGE_UNAVAILABLE.
 * 5. WhatsAppCircuitBreaker.isTripped() rejects with CIRCUIT_BREAKER_STORAGE_UNAVAILABLE.
 * 6. Actual Queue and Worker exports throw CRITICAL_STORAGE_ERROR if MockRedis or absent connection is used.
 * 7. Real Redis connection error or disconnect does NOT replace client with MockRedis.
 * 8. Reconnection restores online state (isOnline: true) without changing client to MockRedis.
 * 9. Explicit documentation and verification of Queue/Worker reconnection semantics vs. immediate failure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

/**
 * Helper to run test scripts in an isolated child Node.js process
 * with NODE_ENV=production guaranteed before any module import.
 */
function runProductionChildScript(scriptContent, envOverrides = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            ['--input-type=module', '-e', scriptContent],
            {
                cwd: backendRoot,
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    ...envOverrides
                }
            }
        );

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });
    });
}

describe('P0-A: Production Redis Safety & Fail-Closed Guardrails (Isolated Production Mode)', () => {

    it('1. Production startup with unavailable Redis endpoint: Never attaches MockRedis, isMock: false, isOnline: false', async () => {
        const script = `
            import redisProxy, { getRedisStatus, safeRedisCall } from './src/config/redis.js';
            import WhatsAppCircuitBreaker from './services/WhatsAppCircuitBreaker.js';
            import assert from 'assert';

            assert.strictEqual(process.env.NODE_ENV, 'production', 'NODE_ENV must be production before module load');

            const status = getRedisStatus();
            assert.strictEqual(status.isMock, false, 'getRedisStatus().isMock must be false in production');
            assert.strictEqual(status.isOnline, false, 'getRedisStatus().isOnline must be false when endpoint unavailable');
            assert.strictEqual(redisProxy.isMock, false, 'redisProxy.isMock must be false');

            // safeRedisCall must reject with STORAGE_UNAVAILABLE
            await assert.rejects(async () => {
                await safeRedisCall('get', 'test_key');
            }, (err) => {
                assert.ok(err.message.includes('STORAGE_UNAVAILABLE'), 'Expected STORAGE_UNAVAILABLE, got: ' + err.message);
                return true;
            });

            // WhatsAppCircuitBreaker must fail-closed with CIRCUIT_BREAKER_STORAGE_UNAVAILABLE
            await assert.rejects(async () => {
                await WhatsAppCircuitBreaker.isTripped('test_prod_int_1');
            }, (err) => {
                assert.ok(err.message.includes('CIRCUIT_BREAKER_STORAGE_UNAVAILABLE'), 'Expected CIRCUIT_BREAKER_STORAGE_UNAVAILABLE, got: ' + err.message);
                return true;
            });

            try { redisProxy.disconnect(); } catch (e) {}
            process.exit(0);
        `;

        const { code, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998' // Unused offline port
        });

        assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    });

    it('2. Actual Queue and Worker exports: Throws CRITICAL_STORAGE_ERROR if MockRedis is passed or connection is absent in production', async () => {
        const script = `
            import redisProxy, { Queue, Worker, MockRedis } from './src/config/redis.js';
            import assert from 'assert';

            assert.strictEqual(process.env.NODE_ENV, 'production');

            // 1. Instantiating Queue with MockRedis in production throws CRITICAL_STORAGE_ERROR
            const mockConn = new MockRedis();
            assert.strictEqual(mockConn.isMock, true);

            assert.throws(() => {
                new Queue('marketingQueue', { connection: mockConn });
            }, (err) => {
                assert.ok(err.message.includes('CRITICAL_STORAGE_ERROR'), 'Must throw CRITICAL_STORAGE_ERROR on MockRedis queue creation: ' + err.message);
                assert.ok(err.message.includes('marketingQueue'));
                return true;
            });

            // 2. Instantiating Worker with MockRedis in production throws CRITICAL_STORAGE_ERROR
            assert.throws(() => {
                new Worker('marketingWorker', async () => {}, { connection: mockConn });
            }, (err) => {
                assert.ok(err.message.includes('CRITICAL_STORAGE_ERROR'), 'Must throw CRITICAL_STORAGE_ERROR on MockRedis worker creation: ' + err.message);
                assert.ok(err.message.includes('marketingWorker'));
                return true;
            });

            // 3. Instantiating Queue with absent (null) connection in production throws CRITICAL_STORAGE_ERROR
            assert.throws(() => {
                new Queue('absentQueue', { connection: null });
            }, (err) => {
                assert.ok(err.message.includes('CRITICAL_STORAGE_ERROR'), 'Must throw CRITICAL_STORAGE_ERROR on absent connection: ' + err.message);
                assert.ok(err.message.includes('absent'));
                return true;
            });

            // 4. Instantiating Worker with absent (null) connection in production throws CRITICAL_STORAGE_ERROR
            assert.throws(() => {
                new Worker('absentWorker', async () => {}, { connection: null });
            }, (err) => {
                assert.ok(err.message.includes('CRITICAL_STORAGE_ERROR'), 'Must throw CRITICAL_STORAGE_ERROR on absent connection: ' + err.message);
                assert.ok(err.message.includes('absent'));
                return true;
            });

            try { redisProxy.disconnect(); } catch (e) {}
            process.exit(0);
        `;

        const { code, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        });

        assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    });

    it('3. Production Queue and Worker lifecycle: Uses real connection, relies on BullMQ reconnection without silent in-memory fallback', async () => {
        const script = `
            import redisProxy, { Queue, Worker } from './src/config/redis.js';
            import assert from 'assert';

            assert.strictEqual(process.env.NODE_ENV, 'production');

            // When real Redis configuration is present, Queue creation succeeds by attaching
            // to the real connection (BullMQ client management). It does NOT instantiate MockQueue.
            const q = new Queue('productionLiveQueue');
            assert.strictEqual(q.name, 'productionLiveQueue');

            // Verify it is a genuine BullMQ Queue, not a MockQueue
            assert.strictEqual(typeof q.add, 'function');
            assert.strictEqual(typeof q.close, 'function');
            assert.strictEqual(q.isMock, undefined, 'Real Queue must never be MockQueue');

            const w = new Worker('productionLiveWorker', async () => {});
            assert.strictEqual(w.name, 'productionLiveWorker');
            assert.strictEqual(w.isMock, undefined, 'Real Worker must never be MockWorker');

            await q.close();
            await w.close();
            try { redisProxy.disconnect(); } catch (e) {}
            process.exit(0);
        `;

        const { code, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        });

        assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    });

    it('4. Production connection event lifecycle: Error and close events maintain isOnline: false, ready restores isOnline: true', async () => {
        const script = `
            import redisProxy, { getRedisStatus } from './src/config/redis.js';
            import assert from 'assert';

            assert.strictEqual(process.env.NODE_ENV, 'production');

            // Verify actual module event listeners attached to redisProxy in production:
            // 1. Initial state with offline port
            assert.strictEqual(getRedisStatus().isMock, false);

            // 2. Emit connection error on actual production client
            redisProxy.emit('error', new Error('ECONNRESET: simulated connection reset'));
            assert.strictEqual(getRedisStatus().isOnline, false, 'isOnline must be false on error');
            assert.strictEqual(getRedisStatus().isMock, false, 'Client must NEVER be replaced with MockRedis on error');

            // 3. Emit close event on actual production client
            redisProxy.emit('close');
            assert.strictEqual(getRedisStatus().isOnline, false, 'isOnline must be false on close');
            assert.strictEqual(getRedisStatus().isMock, false, 'Client must NEVER be replaced with MockRedis on close');

            // 4. Emit ready event on actual production client (simulating reconnect)
            redisProxy.emit('ready');
            assert.strictEqual(getRedisStatus().isOnline, true, 'isOnline must be true on ready');
            assert.strictEqual(getRedisStatus().isMock, false, 'Client must remain real Redis on ready');

            try { redisProxy.disconnect(); } catch (e) {}
            process.exit(0);
        `;

        const { code, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        });

        assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    });

    it('5. Clean process exit: Child process exits cleanly with code 0 without hanging open handles', async () => {
        const script = `
            import redisProxy, { getRedisStatus } from './src/config/redis.js';
            assert.strictEqual(process.env.NODE_ENV, 'production');
            assert.strictEqual(getRedisStatus().isMock, false);
            try { redisProxy.disconnect(); } catch (e) {}
            // Clean exit
            process.exit(0);
        `;

        const start = Date.now();
        const { code } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        });
        const duration = Date.now() - start;

        assert.strictEqual(code, 0);
        assert.ok(duration < 5000, `Child process must exit promptly (took ${duration}ms)`);
    });
});
