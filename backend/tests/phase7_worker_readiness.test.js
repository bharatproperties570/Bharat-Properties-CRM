import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import app from '../app.js';
import redisProxy from '../src/config/redis.js';
import { REQUIRED_WORKERS, isWorkerRunning, evaluateWorkerReadiness } from '../src/workers/workerRegistry.js';

describe('Phase 7 — Strict Fail-Closed Worker Readiness & Health Endpoints', () => {
    let server;
    let baseUrl;
    let origDbReadyState;
    let origRedisOnline;

    const createHealthyWorkerList = () => {
        return REQUIRED_WORKERS.map(name => ({
            name,
            isRunning: () => true,
            isPaused: () => false,
            closed: false,
            closing: false
        }));
    };

    beforeEach(async () => {
        origDbReadyState = mongoose.connection.readyState;
        origRedisOnline = redisProxy.isOnline;

        // Default healthy state for tests
        Object.defineProperty(mongoose.connection, 'readyState', {
            value: 1,
            configurable: true,
            writable: true
        });

        app.locals.redisAvailable = true;
        app.locals.workers = createHealthyWorkerList();
        app.locals.workersRegistered = true;

        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
        Object.defineProperty(mongoose.connection, 'readyState', {
            value: origDbReadyState,
            configurable: true,
            writable: true
        });
        delete app.locals.redisAvailable;
        app.locals.workers = [];
        app.locals.workersRegistered = false;

        if (server && server.listening) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    test('1. Valid BullMQ-style worker → HTTP 200 on both readiness endpoints', async () => {
        // GET /api/ready
        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 200, 'Expected 200 from /api/ready when all workers running');
        const readyData = await readyRes.json();
        assert.equal(readyData.status, 'ready');
        assert.equal(readyData.workersRegistered, true);
        assert.equal(readyData.expectedWorkerCount, 12);
        assert.equal(readyData.registeredWorkerCount, 12);
        for (const reqName of REQUIRED_WORKERS) {
            assert.equal(readyData.workers[reqName], 'running', `Worker ${reqName} must report running`);
        }

        // GET /api/workers/readiness
        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 200, 'Expected 200 from /api/workers/readiness when all workers running');
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, true);
        assert.equal(workersData.expectedCount, 12);
        assert.equal(workersData.activeCount, 12);
        assert.equal(workersData.registeredCount, 12);
    });

    test('2. One worker missing → HTTP 503 on both endpoints with missing worker identified', async () => {
        // Omit marketingQueue
        app.locals.workers = createHealthyWorkerList().filter(w => w.name !== 'marketingQueue');

        // GET /api/ready
        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 from /api/ready when one worker missing');
        const readyData = await readyRes.json();
        assert.equal(readyData.status, 'not_ready');
        assert.ok(Array.isArray(readyData.missingWorkers));
        assert.ok(readyData.missingWorkers.includes('marketingQueue'));
        assert.equal(readyData.workers.marketingQueue, 'missing');

        // GET /api/workers/readiness
        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503, 'Expected 503 from /api/workers/readiness when one worker missing');
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.missingWorkers.includes('marketingQueue'));
        assert.equal(workersData.activeCount, 11);
    });

    test('3. One worker stopped (isRunning() returning false) → HTTP 503 on both endpoints', async () => {
        // Mark cronQueue as stopped
        const workers = createHealthyWorkerList();
        const cron = workers.find(w => w.name === 'cronQueue');
        cron.isRunning = () => false;
        app.locals.workers = workers;

        // GET /api/ready
        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 from /api/ready when one worker stopped');
        const readyData = await readyRes.json();
        assert.equal(readyData.status, 'not_ready');
        assert.ok(Array.isArray(readyData.stoppedWorkers));
        assert.ok(readyData.stoppedWorkers.includes('cronQueue'));
        assert.equal(readyData.workers.cronQueue, 'stopped');

        // GET /api/workers/readiness
        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503, 'Expected 503 from /api/workers/readiness when one worker stopped');
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.stoppedWorkers.includes('cronQueue'));
        assert.equal(workersData.activeCount, 11);
    });

    test('4. Registration flag true but worker array incomplete → HTTP 503', async () => {
        // Flag set to true but only 3 workers supplied
        app.locals.workersRegistered = true;
        app.locals.workers = createHealthyWorkerList().slice(0, 3);

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 when workers array incomplete despite flag');
        const readyData = await readyRes.json();
        assert.equal(readyData.status, 'not_ready');
        assert.equal(readyData.missingWorkers.length, 9);

        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503, 'Expected 503 from /api/workers/readiness when incomplete');
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.equal(workersData.missingWorkers.length, 9);
    });

    test('5. MongoDB disconnected → /api/ready returns HTTP 503', async () => {
        // Simulate MongoDB disconnect
        Object.defineProperty(mongoose.connection, 'readyState', {
            value: 0, // disconnected
            configurable: true,
            writable: true
        });

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 from /api/ready when MongoDB disconnected');
        const readyData = await readyRes.json();
        assert.equal(readyData.status, 'not_ready');
        assert.equal(readyData.database, 0);
        assert.equal(readyData.reason, 'MongoDB disconnected');
    });

    test('6. Redis unavailable → /api/ready returns HTTP 503', async () => {
        // Simulate Redis unavailable
        app.locals.redisAvailable = false;

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 from /api/ready when Redis unavailable');
        const readyData = await readyRes.json();
        assert.equal(readyData.status, 'not_ready');
        assert.equal(readyData.reason, 'Redis is unavailable');
    });

    test('7. Worker missing isRunning() method → HTTP 503 on both endpoints', async () => {
        const workers = createHealthyWorkerList();
        const target = workers.find(w => w.name === 'distributionQueue');
        delete target.isRunning;
        app.locals.workers = workers;

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 when worker lacks isRunning');
        const readyData = await readyRes.json();
        assert.ok(readyData.stoppedWorkers.includes('distributionQueue'));

        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503, 'Expected 503 from /api/workers/readiness when worker lacks isRunning');
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.stoppedWorkers.includes('distributionQueue'));
    });

    test('8. Worker missing isPaused() method → HTTP 503 on both endpoints', async () => {
        const workers = createHealthyWorkerList();
        const target = workers.find(w => w.name === 'enrichmentQueue');
        delete target.isPaused;
        app.locals.workers = workers;

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 when worker lacks isPaused');
        const readyData = await readyRes.json();
        assert.ok(readyData.stoppedWorkers.includes('enrichmentQueue'));

        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503);
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.stoppedWorkers.includes('enrichmentQueue'));
    });

    test('9. Worker with neither lifecycle method → HTTP 503 on both endpoints', async () => {
        const workers = createHealthyWorkerList();
        const target = workers.find(w => w.name === 'notificationQueue');
        delete target.isRunning;
        delete target.isPaused;
        app.locals.workers = workers;

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 when worker lacks both methods');
        const readyData = await readyRes.json();
        assert.ok(readyData.stoppedWorkers.includes('notificationQueue'));

        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503);
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.stoppedWorkers.includes('notificationQueue'));
    });

    test('10. isRunning() returning non-boolean → HTTP 503 on both endpoints', async () => {
        const workers = createHealthyWorkerList();
        const target = workers.find(w => w.name === 'googleSyncQueue');
        target.isRunning = () => 'truthy_string'; // Non-boolean truthy
        app.locals.workers = workers;

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 when isRunning returns non-boolean');
        const readyData = await readyRes.json();
        assert.ok(readyData.stoppedWorkers.includes('googleSyncQueue'));

        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503);
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.stoppedWorkers.includes('googleSyncQueue'));
    });

    test('11. isPaused() returning non-boolean → HTTP 503 on both endpoints', async () => {
        const workers = createHealthyWorkerList();
        const target = workers.find(w => w.name === 'whatsapp_baileys_outbound');
        target.isPaused = () => 0; // Non-boolean falsy
        app.locals.workers = workers;

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 when isPaused returns non-boolean');
        const readyData = await readyRes.json();
        assert.ok(readyData.stoppedWorkers.includes('whatsapp_baileys_outbound'));

        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503);
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.stoppedWorkers.includes('whatsapp_baileys_outbound'));
    });

    test('12. Lifecycle method throwing an exception → HTTP 503 on both endpoints (fail-closed)', async () => {
        const workers = createHealthyWorkerList();
        const target = workers.find(w => w.name === 'UnifiedIntakeQueue');
        target.isRunning = () => { throw new Error('Simulated socket fault during inspection'); };
        app.locals.workers = workers;

        const readyRes = await fetch(`${baseUrl}/api/ready`);
        assert.equal(readyRes.status, 503, 'Expected 503 when lifecycle method throws');
        const readyData = await readyRes.json();
        assert.ok(readyData.stoppedWorkers.includes('UnifiedIntakeQueue'));

        const workersRes = await fetch(`${baseUrl}/api/workers/readiness`);
        assert.equal(workersRes.status, 503);
        const workersData = await workersRes.json();
        assert.equal(workersData.ready, false);
        assert.ok(workersData.stoppedWorkers.includes('UnifiedIntakeQueue'));
    });

    test('13. Unit test: isWorkerRunning() strict fail-closed contract matrix', () => {
        // 1. Valid BullMQ worker
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => false }), true);

        // 2. Missing isRunning()
        assert.equal(isWorkerRunning({ isPaused: () => false }), false);

        // 3. Missing isPaused()
        assert.equal(isWorkerRunning({ isRunning: () => true }), false);

        // 4. Neither method
        assert.equal(isWorkerRunning({}), false);
        assert.equal(isWorkerRunning(null), false);
        assert.equal(isWorkerRunning(undefined), false);
        assert.equal(isWorkerRunning("worker"), false);

        // 5. isRunning returning non-boolean
        assert.equal(isWorkerRunning({ isRunning: () => 1, isPaused: () => false }), false);
        assert.equal(isWorkerRunning({ isRunning: () => "yes", isPaused: () => false }), false);
        assert.equal(isWorkerRunning({ isRunning: () => ({}), isPaused: () => false }), false);

        // 6. isPaused returning non-boolean
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => 0 }), false);
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => "" }), false);
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => null }), false);

        // 7. Exception thrown
        assert.equal(isWorkerRunning({ isRunning: () => { throw new Error('crash'); }, isPaused: () => false }), false);
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => { throw new Error('crash'); } }), false);

        // 8. Explicit closed / closing / paused flags
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => false, closed: true }), false);
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => false, closing: true }), false);
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => false, paused: true }), false);

        // 9. Running true but paused true
        assert.equal(isWorkerRunning({ isRunning: () => true, isPaused: () => true }), false);

        // 10. Running false and paused false
        assert.equal(isWorkerRunning({ isRunning: () => false, isPaused: () => false }), false);
    });
});
