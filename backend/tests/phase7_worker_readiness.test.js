import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import app from '../app.js';
import redisProxy from '../src/config/redis.js';
import { REQUIRED_WORKERS, isWorkerRunning, evaluateWorkerReadiness } from '../src/workers/workerRegistry.js';

describe('Phase 7 — Strict Worker Readiness & Health Endpoints', () => {
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

    test('1. All required workers running → HTTP 200 on both readiness endpoints', async () => {
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

    test('3. One worker stopped → HTTP 503 on both endpoints with stopped worker identified', async () => {
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

    test('7. Unit evaluation: evaluateWorkerReadiness correctly handles paused, closed, and alias names', () => {
        // Normal list
        const normal = createHealthyWorkerList();
        const r1 = evaluateWorkerReadiness(normal);
        assert.equal(r1.ready, true);
        assert.equal(r1.expectedCount, 12);
        assert.equal(r1.activeCount, 12);

        // Alias support: domainEventQueue mapped to domain-event-queue
        const withAlias = normal.map(w => w.name === 'domain-event-queue' ? { ...w, name: 'domainEventQueue' } : w);
        const r2 = evaluateWorkerReadiness(withAlias);
        assert.equal(r2.ready, true);
        assert.equal(r2.workers['domain-event-queue'], 'running');

        // Paused worker
        const pausedList = createHealthyWorkerList();
        pausedList[0].isPaused = () => true;
        const r3 = evaluateWorkerReadiness(pausedList);
        assert.equal(r3.ready, false);
        assert.equal(r3.stopped[0], pausedList[0].name);

        // Closed worker
        const closedList = createHealthyWorkerList();
        closedList[1].closed = true;
        const r4 = evaluateWorkerReadiness(closedList);
        assert.equal(r4.ready, false);
        assert.equal(r4.stopped[0], closedList[1].name);
    });
});
