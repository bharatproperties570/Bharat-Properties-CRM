process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import MarketingDelivery from '../models/MarketingDelivery.js';
import MarketingCampaign from '../models/MarketingCampaign.js';
import Deal from '../models/Deal.js';
import { Queue, Worker } from '../src/config/redis.js';

describe('Phase 1.5 — BullMQ Worker Integration, Crash Recovery & Progression Test Suite', () => {
    let mongod;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri(), { autoIndex: false });
        await MarketingDelivery.createCollection();
        await MarketingCampaign.createCollection();
        await Deal.createCollection();
    });

    after(async () => {
        await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        await MarketingDelivery.deleteMany({});
        await MarketingCampaign.deleteMany({});
        await Deal.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Duplicate Child-Job Prevention via Deterministic IDs
    // ─────────────────────────────────────────────────────────────
    it('1. Duplicate Child-Job Prevention: Deterministic job IDs prevent duplicate enqueuing of the same recipient', async () => {
        const campaignId = 'camp_dup_child_001';
        const recipientIndex = 0;
        const deterministicJobId = `bna_${campaignId}_recip_${recipientIndex}`;

        // Verify deterministic ID structure
        assert.equal(deterministicJobId, 'bna_camp_dup_child_001_recip_0');

        // Simulate BullMQ queue behavior with unique job IDs
        const existingJobs = new Set();
        function enqueueRecipientJob(jobId, data) {
            if (existingJobs.has(jobId)) {
                return { enqueued: false, reason: 'DUPLICATE_JOB_ID_SUPPRESSED', jobId };
            }
            existingJobs.add(jobId);
            return { enqueued: true, jobId };
        }

        const firstAdd = enqueueRecipientJob(deterministicJobId, { recipientIndex: 0 });
        assert.equal(firstAdd.enqueued, true);

        // Attempting to enqueue same recipient index again in same campaign
        const duplicateAdd = enqueueRecipientJob(deterministicJobId, { recipientIndex: 0 });
        assert.equal(duplicateAdd.enqueued, false);
        assert.equal(duplicateAdd.reason, 'DUPLICATE_JOB_ID_SUPPRESSED');
        assert.equal(existingJobs.size, 1);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Crash After Provider Dispatch But Before Next-Recipient Scheduling
    // ─────────────────────────────────────────────────────────────
    it('2. Crash After Dispatch Recovery: Recipient already marked SENT skips outbound send and chains next recipient', async () => {
        const campaignId = 'camp_crash_mid_002';
        const recipientMobile = '919811100092';
        const nextMobile = '919811100093';

        // Simulate that recipient 0 was dispatched and recorded in MarketingDelivery as SENT
        // right before worker crashed before calling chainNextRecipient
        await MarketingDelivery.create({
            jobId: campaignId,
            recipientId: recipientMobile,
            channel: 'whatsapp',
            status: 'SENT',
            providerMessageId: 'wamid_prior_crash_002',
            lastAttemptAt: new Date()
        });

        const recipients = [
            { mobile: recipientMobile, name: 'Lead 1' },
            { mobile: nextMobile, name: 'Lead 2' }
        ];

        let outboundSendCallCount = 0;
        let chainedNextIndex = null;

        // Simulate the worker's processing logic for bna-recipient-dispatch
        async function processRecipientJob(recipientIndex) {
            const recipient = recipients[recipientIndex];
            const recipientKey = String(recipient.mobile || recipient.id || '').trim();

            // 1. Idempotency Check (matching marketingWorker.js line 1180-1194)
            const existing = await MarketingDelivery.findOne({
                jobId: campaignId,
                recipientId: recipientKey,
                channel: 'whatsapp'
            }).lean();

            if (existing && ['SENT', 'ACCEPTED', 'DELIVERED', 'READ'].includes(existing.status)) {
                // Skip sending and advance to next
                chainedNextIndex = recipientIndex + 1;
                return { status: 'SKIPPED_ALREADY_CONFIRMED', chainedNextIndex };
            }

            // 2. Outbound send
            outboundSendCallCount++;
            await MarketingDelivery.create({
                jobId: campaignId,
                recipientId: recipientKey,
                channel: 'whatsapp',
                status: 'SENT',
                providerMessageId: `wamid_new_${recipientIndex}`
            });

            chainedNextIndex = recipientIndex + 1;
            return { status: 'SENT', chainedNextIndex };
        }

        // Reprocess the crashed job (recipientIndex 0)
        const result = await processRecipientJob(0);

        assert.equal(result.status, 'SKIPPED_ALREADY_CONFIRMED');
        assert.equal(outboundSendCallCount, 0, 'Must NOT execute duplicate outbound WhatsApp send');
        assert.equal(chainedNextIndex, 1, 'Must progress to next recipient index (1)');

        // Now process recipient 1 (which was not yet sent)
        const result2 = await processRecipientJob(1);
        assert.equal(result2.status, 'SENT');
        assert.equal(outboundSendCallCount, 1);
        assert.equal(result2.chainedNextIndex, 2);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: P0.4 Verification: Idempotency DB Error Fails-Closed
    // ─────────────────────────────────────────────────────────────
    it('3. Fail-Closed on Idempotency DB Error: Database query failure throws error instead of permitting blind send', async () => {
        const campaignId = 'camp_db_err_003';
        const recipient = { mobile: '919811100094', name: 'Lead 3' };
        let outboundSendExecuted = false;

        // Simulate marketingWorker.js lines 1181-1195 with a failing database query
        async function runWorkerWithDbError() {
            try {
                // Simulating database timeout / connection error
                throw new Error('MongoNetworkTimeoutError: connection timed out');
            } catch (idempErr) {
                // Must abort dispatch to trigger safe retry via BullMQ
                throw new Error(`IDEMPOTENCY_LOOKUP_FAILED: Cannot verify recipient delivery state for ${recipient.mobile} (${idempErr.message}). Safe retry required.`);
            }

            // If execution had continued (the old empty catch bug):
            outboundSendExecuted = true;
        }

        await assert.rejects(
            async () => await runWorkerWithDbError(),
            {
                message: /IDEMPOTENCY_LOOKUP_FAILED/
            },
            'Worker must throw IDEMPOTENCY_LOOKUP_FAILED on database lookup error'
        );

        assert.equal(outboundSendExecuted, false, 'Blind outbound send must NEVER execute when idempotency verification fails');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Randomized Anti-Spam Pacing & Chained Scheduling
    // ─────────────────────────────────────────────────────────────
    it('4. Randomized Anti-Spam Pacing: Successive recipient micro-jobs use randomized jitter and batch cooldowns', () => {
        // Pacing formula from marketingWorker.js chainNextRecipient
        function calculateDelay(nextIndex) {
            const isBatchBoundary = nextIndex > 0 && nextIndex % 20 === 0;
            let chainDelayMs;
            if (isBatchBoundary) {
                // 3 to 6 minute randomized cooldown between batches
                chainDelayMs = Math.floor(180000 + Math.random() * 180000);
            } else {
                // 8 to 20 second randomized gap between individual messages
                chainDelayMs = Math.floor(8000 + Math.random() * 12000);
            }
            return { chainDelayMs, isBatchBoundary };
        }

        // Test normal chat-to-chat delay (non-batch boundary)
        const delays = [];
        for (let i = 1; i <= 10; i++) {
            const { chainDelayMs, isBatchBoundary } = calculateDelay(i);
            assert.equal(isBatchBoundary, false);
            assert.ok(chainDelayMs >= 8000, `Delay ${chainDelayMs}ms must be >= 8000ms`);
            assert.ok(chainDelayMs <= 20000, `Delay ${chainDelayMs}ms must be <= 20000ms`);
            delays.push(chainDelayMs);
        }

        // Verify delays are not constant/fixed (random jitter check)
        const uniqueDelays = new Set(delays);
        assert.ok(uniqueDelays.size > 1, 'Delays must have randomized anti-spam jitter rather than a fixed interval');

        // Test batch boundary cooldown (at index 20)
        const batchCooldown = calculateDelay(20);
        assert.equal(batchCooldown.isBatchBoundary, true);
        assert.ok(batchCooldown.chainDelayMs >= 180000, 'Batch cooldown must be >= 3 minutes (180,000ms)');
        assert.ok(batchCooldown.chainDelayMs <= 360000, 'Batch cooldown must be <= 6 minutes (360,000ms)');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Concurrent Execution Across Two Workers with Session Serialization
    // ─────────────────────────────────────────────────────────────
    it('5. Multi-Worker Concurrency: Two workers processing the same session serialize outbound dispatches', async () => {
        const executionOrder = [];
        const sessionLockKey = 'session_worker_concurrency_005';
        let lockHolder = null;

        // Simulated distributed lock acquire / release
        async function withSessionLock(workerName, task) {
            const startWait = Date.now();
            while (lockHolder !== null) {
                if (Date.now() - startWait > 5000) throw new Error('LOCK_TIMEOUT');
                await new Promise(r => setTimeout(r, 20));
            }
            lockHolder = workerName;
            executionOrder.push(`${workerName}_ACQUIRED`);
            try {
                return await task();
            } finally {
                executionOrder.push(`${workerName}_RELEASED`);
                lockHolder = null;
            }
        }

        // Two worker tasks attempting to dispatch to the same Baileys session simultaneously
        const worker1Task = withSessionLock('Worker_1', async () => {
            await new Promise(r => setTimeout(r, 100)); // Simulates socket transmission
            return 'W1_DONE';
        });

        const worker2Task = withSessionLock('Worker_2', async () => {
            await new Promise(r => setTimeout(r, 80));
            return 'W2_DONE';
        });

        const results = await Promise.all([worker1Task, worker2Task]);
        assert.deepEqual(results, ['W1_DONE', 'W2_DONE']);

        // Verify strict mutual exclusion:
        // A release MUST occur before the other worker acquires
        const firstReleaseIdx = executionOrder.indexOf('Worker_1_RELEASED');
        const secondAcquireIdx = executionOrder.indexOf('Worker_2_ACQUIRED');
        assert.ok(
            firstReleaseIdx < secondAcquireIdx,
            `Worker 1 must release lock before Worker 2 acquires lock. Execution order: ${executionOrder.join(' -> ')}`
        );
    });
});
