import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert';
import { exec } from 'child_process';
import http from 'http';
import express from 'express';
import FailedJobLog from '../models/FailedJobLog.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Team from '../models/Team.js';
import Notification from '../models/Notification.js';
import adminQueueRoutes from '../src/routes/admin.queue.routes.js';
import * as queueManager from '../src/queues/queueManager.js';
import { writeFailedJobLog } from '../src/utils/failedJobLogger.js';

import { notificationWorker } from '../src/workers/notificationWorker.js';
import { marketingWorker } from '../src/workers/marketingWorker.js';
import { Queue as BullQueue, Worker as BullWorker, UnrecoverableError } from 'bullmq';
import IORedis from 'ioredis';
import redisConnection from '../src/config/redis.js';

const redisConfig = { host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379, maxRetriesPerRequest: null, retryStrategy: () => null };

async function runTests() {
    console.log('--- C9 Integration Test Suite ---');

    let replSet;
    let app, server;
    const port = 3001;
    let hasRedis = false;

    // Check Redis availability
    try {
        const testRedis = new IORedis(redisConfig);
        testRedis.on('error', () => {}); 
        await testRedis.ping();
        hasRedis = true;
        testRedis.disconnect();
    } catch (e) {
        console.warn('⚠️  Real Redis is UNAVAILABLE. Genuine BullMQ tests will fail or be skipped.');
    }

    // TEST A - Real Queue Configuration
    console.log('[Test A] Verifying Queue Configurations');
    const { enrichmentQueue, notificationQueue, cronQueue, googleSyncQueue, marketingQueue, distributionQueue, domainEventQueue } = queueManager;
    
    const verifyQueueOpts = (q, expectedAttempts, expectedDelay, expectedRmc, expectedRmf) => {
        const opts = q.opts.defaultJobOptions || {};
        assert.strictEqual(opts.attempts, expectedAttempts, `${q.name} attempts`);
        if (opts.backoff) {
            assert.strictEqual(opts.backoff.type, 'exponential', `${q.name} backoff type`);
            assert.strictEqual(opts.backoff.delay, expectedDelay, `${q.name} backoff delay`);
        }
        if (typeof expectedRmc === 'boolean') {
            assert.strictEqual(opts.removeOnComplete, expectedRmc, `${q.name} rmc`);
            assert.strictEqual(opts.removeOnFail, expectedRmf, `${q.name} rmf`);
        } else {
            assert.strictEqual(opts.removeOnComplete?.count, expectedRmc, `${q.name} rmc`);
            assert.strictEqual(opts.removeOnFail?.count, expectedRmf, `${q.name} rmf`);
        }
    };

    verifyQueueOpts(enrichmentQueue, 3, 5000, 50, 100);
    verifyQueueOpts(notificationQueue, 3, 5000, 50, 100);
    verifyQueueOpts(cronQueue, 3, 10000, 20, 50);
    verifyQueueOpts(googleSyncQueue, 3, 5000, 50, 100);
    verifyQueueOpts(marketingQueue, 3, 5000, 100, 200);
    verifyQueueOpts(distributionQueue, 12, 900000, true, false);
    verifyQueueOpts(domainEventQueue, 3, 5000, true, false);
    console.log('✅ Queue Configurations verified');

    // MARKETING LIMITER TEST
    console.log('[Test] Verifying Marketing Queue Limiter Configuration');
    // Marketing worker is exported from marketingWorker.js. It has opts.limiter in BullMQ v4/v5?
    // Let's just assert on the actual worker's limiter options if present, otherwise assume it's defined in the processor setup.
    // The instructions: "asserting that the actual production marketingQueue contains: limiter.max === 20, limiter.duration === 60000"
    // Wait, in bullmq, limiters are usually on the Worker.
    assert(marketingWorker.opts.limiter, 'Marketing worker must have limiter configured');
    assert.strictEqual(marketingWorker.opts.limiter.max, 20, 'Marketing limiter max must be 20');
    assert.strictEqual(marketingWorker.opts.limiter.duration, 60000, 'Marketing limiter duration must be 60000');
    console.log('✅ Marketing Queue Limiter Configuration verified');

    console.log('[Setup] Starting Memory MongoDB');
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());

    if (!hasRedis) {
        console.warn('⚠️  ABORTING: Real Redis connection is required to perform genuine BullMQ tests B, C, D, E, Limiter execution, and I.');
        console.error('❌ Integration Test Failed due to missing Redis infrastructure.');
        process.exit(1);
    }

    // Since we abort if no Redis, the below code is only executed on a valid test runner.
    const bRedis = new IORedis(redisConfig);

    // TEST B & E - Genuine BullMQ Retry Execution & Terminal Exhaustion
    console.log('[Test B & E] Testing Real BullMQ Retry & Exhaustion');
    const qRetry = new BullQueue('test_retry', { connection: bRedis, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 50 } } });
    
    let execCount = 0;
    const wRetry = new BullWorker('test_retry', async (job) => {
        execCount++;
        throw new Error('Transient network error');
    }, { connection: bRedis });

    // Attach FailedJobLog logger as in production
    let bResolve;
    const bPromise = new Promise(r => bResolve = r);

    // Attach FailedJobLog logger as in production
    wRetry.on('failed', async (job, err) => {
        await writeFailedJobLog(job, err);
        if (job.attemptsMade < 3) {
            const intermediateLog = await FailedJobLog.findOne({ jobId: job.id });
            assert(!intermediateLog, 'No terminal FailedJobLog should be created for intermediate attempts');
        } else if (job.attemptsMade === 3) {
            bResolve();
        }
    });

    const bJob = await qRetry.add('test', {});
    await bPromise;

    assert.strictEqual(execCount, 3, 'Must attempt exactly 3 times');
    // Verify FailedJobLog
    const bLog = await FailedJobLog.findOne({ jobId: bJob.id });
    assert(bLog, 'Terminal FailedJobLog must exist');
    assert.strictEqual(bLog.attemptsMade, 3);
    assert.strictEqual(bLog.status, 'TERMINAL');

    await qRetry.close();
    await wRetry.close();
    console.log('✅ Real Retry & Exhaustion verified');
    
    // TEST C - Real BullMQ Backoff
    console.log('[Test C] Testing Real BullMQ Backoff');
    const qBackoff = new BullQueue('test_backoff', { connection: bRedis, defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 200 } } });
    let executionTimes = [];
    const wBackoff = new BullWorker('test_backoff', async (job) => {
        executionTimes.push(Date.now());
        throw new Error('Fail to trigger backoff');
    }, { connection: bRedis });

    const cJob = await qBackoff.add('test', {});
    await new Promise(resolve => {
        wBackoff.on('failed', (job, err) => {
            if (job.attemptsMade === 2) resolve();
        });
    });
    
    assert.strictEqual(executionTimes.length, 2);
    const delay = executionTimes[1] - executionTimes[0];
    assert(delay >= 180 && delay < 2000, `Backoff delay was ${delay}ms, expected ~200ms`);

    await qBackoff.close();
    await wBackoff.close();
    console.log('✅ Real Backoff verified');

    // TEST D - Real BullMQ UnrecoverableError
    console.log('[Test D] Testing Real UnrecoverableError');
    const qUnrec = new BullQueue('test_unrec', { connection: bRedis, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 50 } } });
    let unrecExec = 0;
    const wUnrec = new BullWorker('test_unrec', async (job) => {
        unrecExec++;
        throw new UnrecoverableError('Fatal error');
    }, { connection: bRedis });
    
    let dResolve;
    const dPromise = new Promise(r => dResolve = r);

    wUnrec.on('failed', async (job, err) => {
        await writeFailedJobLog(job, err);
        dResolve();
    });

    const dJob = await qUnrec.add('test', {});
    await dPromise;

    // Need slight delay to ensure bullmq doesn't retry (it shouldn't, but wait to be sure)
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(unrecExec, 1, 'UnrecoverableError must stop retries immediately');
    const dLog = await FailedJobLog.findOne({ jobId: dJob.id });
    assert(dLog);
    assert.strictEqual(dLog.errorType, 'UNRECOVERABLE_ERROR');
    
    await qUnrec.close();
    await wUnrec.close();
    console.log('✅ Real UnrecoverableError handling verified');

    // TEST MARKETING LIMITER MECHANICS
    console.log('[Test] Verifying Limiter Mechanics');
    const qLimiter = new BullQueue('test_limiter', { connection: bRedis });
    let limiterExec = 0;
    const wLimiter = new BullWorker('test_limiter', async (job) => {
        limiterExec++;
    }, { connection: bRedis, limiter: { max: 2, duration: 1000 } });

    await qLimiter.add('1', {});
    await qLimiter.add('2', {});
    await qLimiter.add('3', {});

    await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(limiterExec, 2, 'Limiter must stop after 2 executions');
    await new Promise(r => setTimeout(r, 1000));
    assert.strictEqual(limiterExec, 3, 'Limiter must process remaining job after duration');
    
    await qLimiter.close();
    await wLimiter.close();
    console.log('✅ Limiter mechanics verified');

    // TEST F: Idempotency (Preserved from 119.3)
    console.log('[Test F] Testing Idempotent Upsert');
    const fakeJob = { id: 'idemp-123', queueName: 'q', name: 'j', attemptsMade: 3, opts: { attempts: 3 } };
    await writeFailedJobLog(fakeJob, new Error('Fail'));
    await writeFailedJobLog(fakeJob, new Error('Fail'));
    const fCount = await FailedJobLog.countDocuments({ jobId: 'idemp-123' });
    assert.strictEqual(fCount, 1, 'Must not duplicate FailedJobLog on race condition');
    console.log('✅ Idempotency verified');

    // TEST G: NotificationWorker (Preserved from 119.3)
    console.log('[Test G] Testing Notification Worker');
    
    const notifUserId = new mongoose.Types.ObjectId();
    
    const completion = new Promise((resolve, reject) => {
        const onCompleted = (job) => {
            if (job.data.userId.toString() === notifUserId.toString()) {
                notificationWorker.off('completed', onCompleted);
                notificationWorker.off('failed', onFailed);
                resolve(job);
            }
        };

        const onFailed = (job, err) => {
            if (job?.data?.userId?.toString() === notifUserId.toString()) {
                notificationWorker.off('completed', onCompleted);
                notificationWorker.off('failed', onFailed);
                reject(err);
            }
        };

        notificationWorker.on('completed', onCompleted);
        notificationWorker.on('failed', onFailed);
    });

    const notifJob = await queueManager.notificationQueue.add('sendNotification', { 
        userId: notifUserId, 
        type: 'alert', 
        message: 'Hello' 
    });
    
    await completion;
    
    const notifDoc = await Notification.findOne({ user: notifUserId });
    assert(notifDoc, 'Notification must be created by worker');
    assert.strictEqual(notifDoc.title, 'System Alert', 'Fallback title applied');
    console.log('✅ NotificationWorker verified');

    // TEST H & I: Admin API & Real Redis Failure
    console.log('[Test H & I] Testing Admin API & Real Redis Failure');
    
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
    const adminRole = new Role({ name: 'superadmin', department: 'sales' });
    const salesRole = new Role({ name: 'sales', department: 'sales' });
    await adminRole.save({ validateBeforeSave: false });
    await salesRole.save({ validateBeforeSave: false });
    
    const adminUser = new User({ 
        name: 'Admin', email: 'admin@test.com', password: 'password', role: adminRole._id, fullName: 'Admin User', department: 'sales', isActive: true 
    });
    const regularUser = new User({ 
        name: 'User', email: 'user@test.com', password: 'password', role: salesRole._id, fullName: 'Regular User', department: 'sales', isActive: true 
    });
    await adminUser.save({ validateBeforeSave: false });
    await regularUser.save({ validateBeforeSave: false });
    const adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET);
    const userToken = jwt.sign({ id: regularUser._id }, process.env.JWT_SECRET);

    app = express();
    app.use('/queues', adminQueueRoutes);
    server = http.createServer(app).listen(port);

    const res401 = await fetch(`http://localhost:${port}/queues`);
    assert.strictEqual(res401.status, 401);

    const res403 = await fetch(`http://localhost:${port}/queues`, { headers: { 'Authorization': `Bearer ${userToken}` } });
    assert.strictEqual(res403.status, 403);

    // Test 200 with Real Redis
    const res200 = await fetch(`http://localhost:${port}/queues`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.strictEqual(res200.status, 200);

    // Test 503 by killing Redis or providing an unreachable Redis instance internally.
    // Instead of monkey-patching ES module exports, we simulate an outage by disconnecting the real underlying Redis connection.
    redisConnection.disconnect();
    
    const res503 = await fetch(`http://localhost:${port}/queues`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    assert.strictEqual(res503.status, 503, 'Must return 503 on real Redis outage');

    console.log('✅ Admin API (401, 403, 200) & Real Redis 503 verified');

    // TEST J: Shutdown
    console.log('[Test J] Testing Graceful Shutdown Process');
    const childOutput = await new Promise(resolve => {
        const child = exec('node backend/src/server.js', { env: { ...process.env, PORT: 0, NODE_ENV: 'test', JWT_SECRET: 'test' } });
        let output = '';
        child.stdout.on('data', d => { 
            output += d; 
            if (d.includes('running on port')) child.kill('SIGTERM'); 
        });
        child.on('exit', () => resolve(output));
    });
    assert(childOutput.includes('Received SIGTERM'));
    assert(childOutput.includes('Closing 9 active workers'));
    assert(childOutput.includes('Shutdown complete'));
    console.log('✅ Graceful shutdown verified safely via isolated process');

    server.close();
    await mongoose.disconnect();
    await replSet.stop();
    bRedis.disconnect();

    console.log('\n✅ ALL C9 INTEGRATION TESTS COMPLETED SUCCESSFULLY');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Integration Test Failed:', err);
    process.exit(1);
});
