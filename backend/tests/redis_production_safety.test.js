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
 * 7. Offline production Queue and Worker constructors: Attaches genuine BullMQ classes without in-memory fallback.
 * 8. Simulated event-handler state transitions (error/close/ready) maintain fail-closed state without Mock replacement.
 * 9. Natural child-process shutdown: removes process.exit(0), disconnects handles, exits naturally with code 0.
 * 10. Genuine provisioned Redis connection lifecycle and actual BullMQ enqueue/worker integration in CI.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

/**
 * Checks if a TCP port is currently open and accepting connections.
 */
function isPortOpen(port, host = '127.0.0.1', timeoutMs = 400) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host, timeout: timeoutMs });
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
    });
}

/**
 * Helper to run test scripts in an isolated child Node.js process
 * with NODE_ENV=production guaranteed before any module import.
 * Enforces a bounded timeout: if the process does not exit naturally,
 * the helper kills the child with SIGTERM and rejects the promise.
 */
function runProductionChildScript(scriptContent, envOverrides = {}, timeoutMs = 8000) {
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
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            reject(new Error(`Child process timed out after ${timeoutMs}ms without natural exit.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`));
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (!timedOut) {
                resolve({ code, signal, stdout, stderr });
            }
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

            // Disconnect production Redis client without reconnect retry to permit natural process termination
            redisProxy.disconnect(false);
        `;

        const { code, signal, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998' // Unused offline port
        });

        assert.strictEqual(signal, null, 'Child process must exit naturally without termination signal');
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

            redisProxy.disconnect(false);
        `;

        const { code, signal, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        });

        assert.strictEqual(signal, null, 'Child process must exit naturally without termination signal');
        assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    });

    it('3. Offline production Queue and Worker constructors: Attaches genuine BullMQ classes without in-memory MockQueue/MockWorker fallback when Redis is offline', async () => {
        const script = `
            import redisProxy, { Queue, Worker } from './src/config/redis.js';
            import assert from 'assert';

            assert.strictEqual(process.env.NODE_ENV, 'production');

            // Offline constructor verification on intentionally unavailable port 59998:
            // When Redis is offline in production, Queue creation succeeds by attaching
            // genuine BullMQ class structures (which rely on BullMQ native offline buffering and reconnection).
            // It strictly forbids falling back to in-memory MockQueue or MockWorker.
            const q = new Queue('productionOfflineQueue');
            assert.strictEqual(q.name, 'productionOfflineQueue');

            // Verify it is a genuine BullMQ Queue, not an in-memory MockQueue
            assert.strictEqual(typeof q.add, 'function');
            assert.strictEqual(typeof q.close, 'function');
            assert.strictEqual(q.isMock, undefined, 'Queue must be genuine BullMQ Queue, never MockQueue');

            // Pass autorun: false to Worker to verify class constructor without hanging on offline blocking loop
            const w = new Worker('productionOfflineWorker', async () => {}, { autorun: false });
            assert.strictEqual(w.name, 'productionOfflineWorker');
            assert.strictEqual(w.isMock, undefined, 'Worker must be genuine BullMQ Worker, never MockWorker');

            await q.close();
            await w.close();
            redisProxy.disconnect(false);
        `;

        const { code, signal, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        });

        assert.strictEqual(signal, null, 'Child process must exit naturally without termination signal');
        assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    });

    it('4. Simulated event-handler state transitions: Simulated error and close events maintain isOnline: false, ready restores isOnline: true', async () => {
        const script = `
            import redisProxy, { getRedisStatus } from './src/config/redis.js';
            import assert from 'assert';

            assert.strictEqual(process.env.NODE_ENV, 'production');

            // Verify actual module event listeners attached to redisProxy in production:
            // 1. Initial state with offline port
            assert.strictEqual(getRedisStatus().isMock, false);

            // 2. Simulated error event delivery on actual production client
            redisProxy.emit('error', new Error('ECONNRESET: simulated connection reset'));
            assert.strictEqual(getRedisStatus().isOnline, false, 'isOnline must be false on error event');
            assert.strictEqual(getRedisStatus().isMock, false, 'Client must NEVER be replaced with MockRedis on error');

            // 3. Simulated close event delivery on actual production client
            redisProxy.emit('close');
            assert.strictEqual(getRedisStatus().isOnline, false, 'isOnline must be false on close event');
            assert.strictEqual(getRedisStatus().isMock, false, 'Client must NEVER be replaced with MockRedis on close');

            // 4. Simulated ready event delivery on actual production client
            redisProxy.emit('ready');
            assert.strictEqual(getRedisStatus().isOnline, true, 'isOnline must be true on ready event');
            assert.strictEqual(getRedisStatus().isMock, false, 'Client must remain real Redis on ready');

            redisProxy.disconnect(false);
        `;

        const { code, signal, stderr, stdout } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        });

        assert.strictEqual(signal, null, 'Child process must exit naturally without termination signal');
        assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    });

    it('4b. Genuine provisioned Redis connection lifecycle (CI / Provisioned Redis): Client connects, becomes ready, and executes commands', async () => {
        const hasLiveRedis = await isPortOpen(6379, '127.0.0.1');

        if (process.env.CI || hasLiveRedis) {
            assert.ok(hasLiveRedis, 'In CI environment, Redis service on 127.0.0.1:6379 must be reachable');

            const script = `
                import redisProxy, { getRedisStatus } from './src/config/redis.js';
                import assert from 'assert';

                assert.strictEqual(process.env.NODE_ENV, 'production');

                // Await genuine connection readiness
                if (!getRedisStatus().isOnline) {
                    await new Promise((resolve) => redisProxy.once('ready', resolve));
                }

                assert.strictEqual(getRedisStatus().isOnline, true, 'Real Redis connection must establish and report isOnline: true');
                assert.strictEqual(getRedisStatus().isMock, false, 'Production Redis client must never be MockRedis');

                const pingRes = await redisProxy.ping();
                assert.strictEqual(pingRes, 'PONG', 'Real Redis connection must respond to PING with PONG');

                redisProxy.disconnect(false);
            `;

            const { code, signal, stderr, stdout } = await runProductionChildScript(script, {
                REDIS_HOST: '127.0.0.1',
                REDIS_PORT: '6379'
            });

            assert.strictEqual(signal, null, 'Child process must exit naturally without termination signal');
            assert.strictEqual(code, 0, `Child process failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
        } else {
            console.log('ℹ️ Local environment without real Redis: Genuine Redis connection lifecycle verification deferred to CI runner.');
        }
    });

    it('5. Natural child-process shutdown: Child process exits naturally with code 0 without hanging open handles or forced process.exit', async () => {
        const script = `
            import redisProxy, { getRedisStatus } from './src/config/redis.js';
            import assert from 'assert';
            assert.strictEqual(process.env.NODE_ENV, 'production');
            assert.strictEqual(getRedisStatus().isMock, false);

            // Cleanly disconnect socket without reconnect timer
            redisProxy.disconnect(false);
            // Notice: NO process.exit(0) is called. The process must exit naturally via Node event loop drain.
        `;

        const start = Date.now();
        const { code, signal } = await runProductionChildScript(script, {
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: '59998'
        }, 5000);
        const duration = Date.now() - start;

        assert.strictEqual(signal, null, 'Child process must exit naturally without being terminated by a signal');
        assert.strictEqual(code, 0, 'Child process must exit naturally with code 0');
        assert.ok(duration < 5000, `Child process must exit naturally and promptly (took ${duration}ms)`);
    });

    it('6. Actual BullMQ enqueue/worker integration (Real Redis 7 in CI): End-to-end job processing backed by live Redis', async () => {
        const hasLiveRedis = await isPortOpen(6379, '127.0.0.1');

        if (process.env.CI || hasLiveRedis) {
            assert.ok(hasLiveRedis, 'In CI environment, Redis service on 127.0.0.1:6379 must be reachable');

            const script = `
                import redisProxy, { Queue, Worker } from './src/config/redis.js';
                import assert from 'assert';

                assert.strictEqual(process.env.NODE_ENV, 'production');

                const uniqueQueueName = 'ci-test-queue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                const uniqueJobId = 'ci-job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                const testPayload = { task: 'verify_real_bullmq_processing', timestamp: Date.now() };

                let workerResolve;
                let workerReject;
                const workerCompletedPromise = new Promise((resolve, reject) => {
                    workerResolve = resolve;
                    workerReject = reject;
                });
                workerCompletedPromise.catch(() => {});

                let queue;
                let worker;
                let testError = null;

                try {
                    queue = new Queue(uniqueQueueName);
                    assert.strictEqual(queue.isMock, undefined, 'Must be genuine BullMQ Queue, not MockQueue');

                    // Instantiate Worker. Note: do not resolve from inside the processor before it returns.
                    worker = new Worker(uniqueQueueName, async (job) => {
                        assert.strictEqual(job.id, uniqueJobId);
                        assert.deepStrictEqual(job.data, testPayload);
                        return { success: true, processedAt: Date.now() };
                    });
                    assert.strictEqual(worker.isMock, undefined, 'Must be genuine BullMQ Worker, not MockWorker');

                    // Register listener for the actual BullMQ Worker 'completed' event
                    worker.on('completed', (job, result) => {
                        workerResolve({ job, result });
                    });
                    worker.on('failed', (job, err) => {
                        workerReject(err);
                    });

                    // Enqueue one uniquely identified job
                    const job = await queue.add('testJob', testPayload, { jobId: uniqueJobId });
                    assert.strictEqual(job.id, uniqueJobId);

                    // Await actual Worker 'completed' event with named bounded timeout wrapped in try/finally
                    let completionTimer = null;
                    let completedData;
                    try {
                        const timeoutPromise = new Promise((_, reject) => {
                            completionTimer = setTimeout(() => {
                                reject(new Error('Timed out waiting for BullMQ Worker completed event'));
                            }, 10000);
                        });

                        completedData = await Promise.race([
                            workerCompletedPromise,
                            timeoutPromise
                        ]);
                    } finally {
                        if (completionTimer !== null) {
                            clearTimeout(completionTimer);
                            completionTimer = null;
                        }
                    }

                    // Verify completed event attributes
                    assert.strictEqual(completedData.job.id, uniqueJobId, 'Completed event must contain unique test job ID');
                    assert.deepStrictEqual(completedData.job.data, testPayload, 'Completed event job data must match payload');
                    assert.strictEqual(completedData.result.success, true);

                    // Verify job state directly in real Redis
                    const retrievedJob = await queue.getJob(uniqueJobId);
                    assert.ok(retrievedJob, 'Job must exist in real Redis');
                    assert.deepStrictEqual(retrievedJob.data, testPayload);
                    const state = await retrievedJob.getState();
                    assert.strictEqual(state, 'completed', 'Job state in real Redis must be completed');
                } catch (err) {
                    testError = err;
                } finally {
                    const cleanupErrors = [];

                    // 1. Close Worker first so no additional jobs are picked up
                    try {
                        if (worker) {
                            await worker.close();
                        }
                    } catch (e) {
                        cleanupErrors.push(new Error('Failed to close BullMQ Worker: ' + e.message));
                    }

                    // 2. Pause and drain the unique test queue
                    try {
                        if (queue) {
                            await queue.pause();
                            await queue.drain();
                        }
                    } catch (e) {
                        cleanupErrors.push(new Error('Failed to pause/drain BullMQ Queue: ' + e.message));
                    }

                    // 3. Remove test job and obliterate unique queue
                    try {
                        if (queue) {
                            const jobToRemove = await queue.getJob(uniqueJobId);
                            if (jobToRemove) {
                                await jobToRemove.remove();
                            }
                            await queue.obliterate({ force: true });
                        }
                    } catch (e) {
                        cleanupErrors.push(new Error('Failed to obliterate BullMQ Queue: ' + e.message));
                    }

                    // 4. Verify unique job is absent after queue cleanup
                    try {
                        if (queue) {
                            const postCleanupJob = await queue.getJob(uniqueJobId);
                            assert.ok(!postCleanupJob, 'Unique job must be absent from Redis after cleanup');
                        }
                    } catch (e) {
                        cleanupErrors.push(new Error('Post-cleanup verification failed: ' + e.message));
                    }

                    // 5. Close Queue
                    try {
                        if (queue) {
                            await queue.close();
                        }
                    } catch (e) {
                        cleanupErrors.push(new Error('Failed to close BullMQ Queue: ' + e.message));
                    }

                    // 6. Ensure Redis client shutdown is attempted even if queue cleanup fails
                    try {
                        if (redisProxy && typeof redisProxy.disconnect === 'function') {
                            redisProxy.disconnect(false);
                        }
                    } catch (e) {
                        cleanupErrors.push(new Error('Failed to disconnect Redis client: ' + e.message));
                    }

                    // Propagate errors: preserve original test failure without masking, fail on cleanup failures
                    if (testError) {
                        if (cleanupErrors.length > 0) {
                            const cleanupSummary = cleanupErrors.map(e => e.message).join('; ');
                            testError.message = testError.message + ' (Teardown failures: ' + cleanupSummary + ')';
                            testError.cleanupErrors = cleanupErrors;
                            if (typeof AggregateError === 'function') {
                                testError.cause = new AggregateError(cleanupErrors, 'Teardown failures');
                            }
                        }
                        throw testError;
                    }

                    if (cleanupErrors.length > 0) {
                        if (typeof AggregateError === 'function' && cleanupErrors.length > 1) {
                            throw new AggregateError(cleanupErrors, 'Cleanup failed with ' + cleanupErrors.length + ' errors: ' + cleanupErrors.map(e => e.message).join('; '));
                        }
                        throw cleanupErrors[0];
                    }
                }
            `;

            const { code, signal, stderr, stdout } = await runProductionChildScript(script, {
                REDIS_HOST: '127.0.0.1',
                REDIS_PORT: '6379'
            }, 15000);

            assert.strictEqual(signal, null, 'Child process must exit naturally without termination signal');
            assert.strictEqual(code, 0, `BullMQ CI test failed with code ${code}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
        } else {
            console.log('ℹ️ CI-only BullMQ test: Local environment does not have real Redis 7 running on port 6379. Deferred to CI runner.');
        }
    });
});
