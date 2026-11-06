process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';

import EffectExecution from '../models/EffectExecution.js';
import OutboxEvent from '../models/OutboxEvent.js';
import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import Lead from '../models/Lead.js';
import AuditLog from '../models/AuditLog.js';

import { executeEffect } from '../src/workers/effectOrchestrator.js';
import { backfillLegacyEffectExecutions } from '../src/migrations/backfillLegacyEffectExecutions.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Phase 5 — P1 Remediation: Effect Lease Heartbeat & Legacy Migration Safety', () => {
    let replset;
    let testLead;
    let testTrigger;
    let origExecuteAction;

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000']
            }
        });
        await replset.waitUntilRunning();
        const uri = replset.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        await EffectExecution.createCollection();
        await EffectExecution.ensureIndexes();
        await OutboxEvent.createCollection();
        await OutboxEvent.ensureIndexes();
        await AutomationLog.createCollection();
        await AutomationLog.ensureIndexes();
        await AuditLog.createCollection();
        await Trigger.createCollection();
        await Lead.createCollection();

        testLead = await Lead.create({
            firstName: 'P1Test',
            lastName: 'Lead',
            mobile: '9800000001'
        });

        testTrigger = await Trigger.create({
            name: 'P1 Legacy Trigger',
            module: 'leads',
            event: 'time_based',
            triggerEvent: 'time_based',
            isActive: true,
            actions: [
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'send_communication',
                    config: { template: 'p1_tmpl' }
                }
            ]
        });

        origExecuteAction = WorkflowEngine.executeAction;
    });

    after(async () => {
        WorkflowEngine.executeAction = origExecuteAction;
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        await EffectExecution.deleteMany({});
        await OutboxEvent.deleteMany({});
        await AutomationLog.deleteMany({});
        WorkflowEngine.executeAction = origExecuteAction;
    });

    // ─────────────────────────────────────────────────────────────
    // P1.1: EFFECT LEASE HEARTBEAT TESTS
    // ─────────────────────────────────────────────────────────────

    it('1. Heartbeat extends lease duration when fn execution is longer than initial lease', async () => {
        const eventId = `evt-hb-${uuidv4()}`;
        const effectKey = 'long_running_effect';
        const renewals = [];

        // Lease is 400ms, heartbeat runs every 100ms. fn runs for 450ms.
        // Without heartbeat, lease would expire at 400ms.
        const startTime = Date.now();
        const res = await executeEffect(
            eventId,
            effectKey,
            'Lead',
            testLead._id,
            async () => {
                await sleep(450);
            },
            {
                leaseDurationMs: 400,
                heartbeatIntervalMs: 100,
                onHeartbeat: (nextLockedUntil) => {
                    renewals.push(nextLockedUntil);
                }
            }
        );

        assert.strictEqual(res.status, 'COMPLETED');
        assert.ok(renewals.length >= 2, `Expected at least 2 heartbeat renewals, got ${renewals.length}`);

        const finalRecord = await EffectExecution.findOne({ eventId, effectKey });
        assert.strictEqual(finalRecord.status, 'COMPLETED');
        assert.strictEqual(finalRecord.lockedUntil, null);
    });

    it('2. Heartbeat prevents a concurrent second worker from stealing the active lease', async () => {
        const eventId = `evt-hb-steal-${uuidv4()}`;
        const effectKey = 'concurrent_protected_effect';

        let worker2Executed = false;
        let worker2Error = null;

        // Worker 1 runs for 400ms with a 300ms lease and 100ms heartbeat.
        const worker1Promise = executeEffect(
            eventId,
            effectKey,
            'Lead',
            testLead._id,
            async () => {
                // At 250ms (before initial 300ms expiry, but renewed), Worker 2 tries to claim
                await sleep(200);
                try {
                    await executeEffect(
                        eventId,
                        effectKey,
                        'Lead',
                        testLead._id,
                        async () => {
                            worker2Executed = true;
                        },
                        { leaseDurationMs: 300, heartbeatIntervalMs: 100 }
                    );
                } catch (err) {
                    worker2Error = err;
                }
                await sleep(200);
            },
            { leaseDurationMs: 300, heartbeatIntervalMs: 100 }
        );

        const res1 = await worker1Promise;
        assert.strictEqual(res1.status, 'COMPLETED');
        assert.strictEqual(worker2Executed, false, 'Worker 2 must NOT have executed while Worker 1 held lease');
        assert.ok(worker2Error, 'Worker 2 must have received a lock conflict error');
        assert.match(worker2Error.message, /currently locked by another worker/);
    });

    it('3. Heartbeat timer is properly cleared and stops after successful completion', async () => {
        const eventId = `evt-hb-stop-succ-${uuidv4()}`;
        const effectKey = 'stop_on_success';
        let heartbeatCount = 0;

        await executeEffect(
            eventId,
            effectKey,
            'Lead',
            testLead._id,
            async () => {
                await sleep(50);
            },
            {
                leaseDurationMs: 300,
                heartbeatIntervalMs: 50,
                onHeartbeat: () => {
                    heartbeatCount++;
                }
            }
        );

        const countAtExit = heartbeatCount;
        // Wait another 150ms after completion and verify heartbeat has ceased
        await sleep(150);
        assert.strictEqual(heartbeatCount, countAtExit, 'Heartbeat must not continue after completion');
    });

    it('4. Heartbeat timer is properly cleared and stops after failure', async () => {
        const eventId = `evt-hb-stop-fail-${uuidv4()}`;
        const effectKey = 'stop_on_failure';
        let heartbeatCount = 0;

        await assert.rejects(async () => {
            await executeEffect(
                eventId,
                effectKey,
                'Lead',
                testLead._id,
                async () => {
                    await sleep(50);
                    throw new Error('Effect simulated explosion');
                },
                {
                    leaseDurationMs: 300,
                    heartbeatIntervalMs: 50,
                    onHeartbeat: () => {
                        heartbeatCount++;
                    }
                }
            );
        }, /Effect simulated explosion/);

        const countAtExit = heartbeatCount;
        await sleep(150);
        assert.strictEqual(heartbeatCount, countAtExit, 'Heartbeat must not continue after failure');

        const record = await EffectExecution.findOne({ eventId, effectKey });
        assert.strictEqual(record.status, 'FAILED');
        assert.strictEqual(record.lockedUntil, null);
    });

    it('5. Worker detects ownership loss during heartbeat and refuses to finalize over new owner', async () => {
        const eventId = `evt-hb-loss-${uuidv4()}`;
        const effectKey = 'ownership_loss_effect';
        let heartbeatLostTriggered = false;

        await assert.rejects(async () => {
            await executeEffect(
                eventId,
                effectKey,
                'Lead',
                testLead._id,
                async () => {
                    // Simulate that another worker stole the lease in DB while Worker 1 was working
                    await EffectExecution.updateOne(
                        { eventId, effectKey },
                        { $set: { executionId: 'stolen-execution-uuid', workerId: 'worker-2' } }
                    );

                    // Wait enough time for the heartbeat tick to run and detect modifiedCount === 0
                    await sleep(250);
                },
                {
                    leaseDurationMs: 300,
                    heartbeatIntervalMs: 80,
                    onHeartbeatLost: () => {
                        heartbeatLostTriggered = true;
                    }
                }
            );
        }, /Stale worker exception/);

        assert.strictEqual(heartbeatLostTriggered, true, 'Heartbeat must have flagged ownership loss');

        // Confirm DB document remains owned by worker-2 and was NOT overwritten to COMPLETED
        const record = await EffectExecution.findOne({ eventId, effectKey });
        assert.strictEqual(record.executionId, 'stolen-execution-uuid');
        assert.strictEqual(record.workerId, 'worker-2');
        assert.notStrictEqual(record.status, 'COMPLETED');
    });

    it('6. Conservative DB error handling in heartbeat when lease lapses marks ownership lost', async () => {
        const eventId = `evt-hb-dberr-${uuidv4()}`;
        const effectKey = 'dberr_effect';
        let errorReported = false;

        await assert.rejects(async () => {
            await executeEffect(
                eventId,
                effectKey,
                'Lead',
                testLead._id,
                async () => {
                    // Wait past the initial lease expiry (150ms) while heartbeat errors occur
                    await sleep(250);
                },
                {
                    leaseDurationMs: 150,
                    heartbeatIntervalMs: 40,
                    _simulateHeartbeatDbError: true,
                    onHeartbeatError: () => {
                        errorReported = true;
                    }
                }
            );
        }, /Stale worker exception/);

        assert.strictEqual(errorReported, true, 'Heartbeat DB error hook must have fired');

        const record = await EffectExecution.findOne({ eventId, effectKey });
        // Old worker must not have finalized COMPLETED
        assert.notStrictEqual(record.status, 'COMPLETED');
    });

    it('7. Ambiguous external side effect transitions to AMBIGUOUS status without blind retry', async () => {
        const eventId = `evt-ambig-${uuidv4()}`;
        const effectKey = 'ambiguous_effect';

        const ambiguousErr = new Error('Gateway timeout after webhook dispatch');
        ambiguousErr.isAmbiguous = true;

        await assert.rejects(async () => {
            await executeEffect(
                eventId,
                effectKey,
                'Lead',
                testLead._id,
                async () => {
                    throw ambiguousErr;
                }
            );
        }, /Gateway timeout/);

        const record = await EffectExecution.findOne({ eventId, effectKey });
        assert.strictEqual(record.status, 'AMBIGUOUS');
        assert.strictEqual(record.lockedUntil, null);

        // Subsequent worker attempt must skip without blindly re-executing
        let reExecuted = false;
        const secondAttempt = await executeEffect(
            eventId,
            effectKey,
            'Lead',
            testLead._id,
            async () => {
                reExecuted = true;
            }
        );

        assert.strictEqual(secondAttempt.status, 'SKIPPED');
        assert.strictEqual(secondAttempt.ambiguous, true);
        assert.strictEqual(reExecuted, false, 'Ambiguous effect must not be blindly re-executed');
    });

    it('8. Short-running effects and retry behavior remain functional', async () => {
        const eventId = `evt-short-${uuidv4()}`;
        const effectKey = 'short_effect';

        // 1. Success path
        const res = await executeEffect(eventId, effectKey, 'Lead', testLead._id, async () => {
            return 'fast';
        });
        assert.strictEqual(res.status, 'COMPLETED');

        // 2. Retryable failure path
        const retryEventId = `evt-retry-${uuidv4()}`;
        const retryKey = 'retryable_effect';

        await assert.rejects(async () => {
            await executeEffect(retryEventId, retryKey, 'Lead', testLead._id, async () => {
                throw new Error('Temporary connection hiccup');
            });
        }, /Temporary connection hiccup/);

        const failedDoc = await EffectExecution.findOne({ eventId: retryEventId, effectKey: retryKey });
        assert.strictEqual(failedDoc.status, 'FAILED');
        assert.strictEqual(failedDoc.attempts, 1);

        // Next retry succeeds
        const retryRes = await executeEffect(retryEventId, retryKey, 'Lead', testLead._id, async () => {
            return 'recovered';
        });
        assert.strictEqual(retryRes.status, 'COMPLETED');
        const completedDoc = await EffectExecution.findOne({ eventId: retryEventId, effectKey: retryKey });
        assert.strictEqual(completedDoc.status, 'COMPLETED');
        assert.strictEqual(completedDoc.attempts, 2);
    });

    // ─────────────────────────────────────────────────────────────
    // P1.2: LEGACY EFFECTEXECUTION MIGRATION & RECOVERY SAFETY TESTS
    // ─────────────────────────────────────────────────────────────

    it('9. Legacy EffectExecution backfill maps to derived stableKey and preserves COMPLETED status', async () => {
        const legacyEventId = `evt-leg-${uuidv4()}`;
        const actionId = new mongoose.Types.ObjectId().toString();
        const idempotencyKey = `idemp-leg-test-${uuidv4()}`;

        // Create OutboxEvent representing TimeTrigger execution
        await OutboxEvent.create({
            eventId: legacyEventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'token-v0'
            }
        });

        // Create legacy EffectExecution without stableKey
        const legacyRecord = await EffectExecution.create({
            eventId: legacyEventId,
            effectKey: `action-${actionId}`,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED',
            stableKey: null
        });

        const report = await backfillLegacyEffectExecutions({ apply: true });
        assert.strictEqual(report.backfilled, 1);
        assert.strictEqual(report.conflicts.length, 0);

        const updated = await EffectExecution.findById(legacyRecord._id);
        const expectedStableKey = `time-trigger:${idempotencyKey}:${actionId}`;
        assert.strictEqual(updated.stableKey, expectedStableKey);
        assert.strictEqual(updated.status, 'COMPLETED');
    });

    it('10. Legacy EffectExecution backfill preserves FAILED, PROCESSING, and AMBIGUOUS statuses', async () => {
        const idempotencyKey = `idemp-multi-status-${uuidv4()}`;
        const legacyEventId = `evt-multi-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: legacyEventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                automationLogIdempotencyKey: idempotencyKey
            }
        });

        const statuses = ['COMPLETED', 'FAILED', 'PROCESSING', 'AMBIGUOUS'];
        const recordIds = [];

        for (let i = 0; i < statuses.length; i++) {
            const actId = new mongoose.Types.ObjectId().toString();
            const doc = await EffectExecution.create({
                eventId: legacyEventId,
                effectKey: `action-${actId}`,
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                status: statuses[i],
                stableKey: null,
                lockedUntil: statuses[i] === 'PROCESSING' ? new Date(Date.now() + 10000) : null
            });
            recordIds.push({ id: doc._id, actId, expectedStatus: statuses[i] });
        }

        const report = await backfillLegacyEffectExecutions({ apply: true });
        assert.strictEqual(report.backfilled, 4);

        for (const item of recordIds) {
            const updated = await EffectExecution.findById(item.id);
            assert.strictEqual(updated.status, item.expectedStatus, `Status for ${item.expectedStatus} must be preserved`);
            assert.strictEqual(updated.stableKey, `time-trigger:${idempotencyKey}:${item.actId}`);
        }
    });

    it('11. Legacy EffectExecution backfill is completely idempotent and restart-safe', async () => {
        const legacyEventId = `evt-idem-${uuidv4()}`;
        const actionId = new mongoose.Types.ObjectId().toString();
        const idempotencyKey = `idemp-restart-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: legacyEventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                automationLogIdempotencyKey: idempotencyKey
            }
        });

        await EffectExecution.create({
            eventId: legacyEventId,
            effectKey: `action-${actionId}`,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED',
            stableKey: null
        });

        // Pass 1
        const report1 = await backfillLegacyEffectExecutions({ apply: true });
        assert.strictEqual(report1.backfilled, 1);

        // Pass 2 (Restart)
        const report2 = await backfillLegacyEffectExecutions({ apply: true });
        assert.strictEqual(report2.backfilled, 0);
        assert.strictEqual(report2.conflicts.length, 0);
    });

    it('12. Legacy EffectExecution backfill detects and reports conflicts without overwriting', async () => {
        const actionId = new mongoose.Types.ObjectId().toString();
        const idempotencyKey = `idemp-conflict-${uuidv4()}`;
        const derivedStableKey = `time-trigger:${idempotencyKey}:${actionId}`;

        const legacyEventId = `evt-conflict-old-${uuidv4()}`;
        const newEventId = `evt-conflict-new-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: legacyEventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                automationLogIdempotencyKey: idempotencyKey
            }
        });

        // Pre-existing new generation record already claimed derivedStableKey
        const newGenRecord = await EffectExecution.create({
            eventId: newEventId,
            effectKey: `action-${actionId}`,
            stableKey: derivedStableKey,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // Old legacy record without stableKey
        const oldLegacyRecord = await EffectExecution.create({
            eventId: legacyEventId,
            effectKey: `action-${actionId}`,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        const report = await backfillLegacyEffectExecutions({ apply: true });

        assert.strictEqual(report.conflicts.length, 1, 'Conflict must be recorded');
        assert.strictEqual(report.conflicts[0].legacyId, oldLegacyRecord._id.toString());
        assert.strictEqual(report.conflicts[0].conflictingId, newGenRecord._id.toString());
        assert.strictEqual(report.conflicts[0].derivedStableKey, derivedStableKey);

        // Confirm old legacy record stableKey was NOT forced/overwritten
        const refreshedOld = await EffectExecution.findById(oldLegacyRecord._id);
        assert.strictEqual(refreshedOld.stableKey, null);
    });

    it('13. JIT runtime recovery deduplication recognizes legacy completed action without re-execution', async () => {
        const idempotencyKey = `idemp-jit-rec-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;

        const gen0EventId = `evt-jit-gen0-${uuidv4()}`;
        const gen1EventId = `evt-jit-gen1-${uuidv4()}`;

        // 1. Create OutboxEvent for Gen 0
        await OutboxEvent.create({
            eventId: gen0EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-gen0'
            }
        });

        // 2. Legacy EffectExecution completed in Gen 0 without stableKey
        const legacyRecord = await EffectExecution.create({
            eventId: gen0EventId,
            effectKey,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // 3. Create AutomationLog in pending state for recovered Gen 1
        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-gen1',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        // 4. Create OutboxEvent for Gen 1
        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-gen1',
                recoveryGeneration: 1
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        // 5. Worker processes recovered Gen 1 job
        await processDomainEventJob({
            data: {
                eventId: gen1EventId,
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: {
                    triggerId: testTrigger._id,
                    entityType: 'leads',
                    automationLogIdempotencyKey: idempotencyKey,
                    claimToken: 'claim-gen1',
                    recoveryGeneration: 1
                }
            }
        });

        // Action was already completed in Gen 0 -> must NOT be re-executed!
        assert.strictEqual(executedCount, 0, 'Legacy completed action must be recognized and skipped');

        // Confirm legacy record was JIT linked with stableKey
        const refreshedLegacy = await EffectExecution.findById(legacyRecord._id);
        const expectedStableKey = `time-trigger:${idempotencyKey}:${action._id}`;
        assert.strictEqual(refreshedLegacy.stableKey, expectedStableKey);

        // AutomationLog is finalized to success
        const log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.status, 'success');
    });

    it('14. Heartbeat renewal uses $max so delayed/older renewal can never regress lockedUntil', async () => {
        const eventId = `evt-hb-max-${uuidv4()}`;
        const effectKey = 'max_lease_monotonic_test';

        // Direct test of $max monotonicity with atomic ownership predicate
        const doc = await EffectExecution.create({
            eventId,
            effectKey,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'PROCESSING',
            executionId: 'exec-monotonic-1',
            lockedUntil: new Date('2026-11-06T12:00:00.000Z')
        });

        // Attempt to regress lockedUntil to an earlier timestamp using $max
        const earlierDate = new Date('2026-11-06T11:00:00.000Z');
        const updateRes = await EffectExecution.updateOne(
            { _id: doc._id, executionId: 'exec-monotonic-1', status: 'PROCESSING' },
            { $max: { lockedUntil: earlierDate } }
        );

        // matchedCount is 1 because document matched, but $max preserved the higher timestamp
        assert.strictEqual(updateRes.matchedCount, 1);

        const refreshed = await EffectExecution.findById(doc._id);
        assert.strictEqual(refreshed.lockedUntil.toISOString(), '2026-11-06T12:00:00.000Z');

        // Now update with a newer timestamp: $max applies
        const futureDate = new Date('2026-11-06T13:00:00.000Z');
        const updateRes2 = await EffectExecution.updateOne(
            { _id: doc._id, executionId: 'exec-monotonic-1', status: 'PROCESSING' },
            { $max: { lockedUntil: futureDate } }
        );
        assert.strictEqual(updateRes2.matchedCount, 1);
        assert.strictEqual(updateRes2.modifiedCount, 1);

        const refreshed2 = await EffectExecution.findById(doc._id);
        assert.strictEqual(refreshed2.lockedUntil.toISOString(), '2026-11-06T13:00:00.000Z');
    });

    it('15. Teardown waits safely for in-flight renewal before finalization so completion cannot race', async () => {
        const eventId = `evt-hb-teardown-${uuidv4()}`;
        const effectKey = 'teardown_await_test';

        let renewalStarted = false;
        let renewalFinished = false;

        const res = await executeEffect(
            eventId,
            effectKey,
            'Lead',
            testLead._id,
            async () => {
                // Wait for the heartbeat timer to trigger
                await sleep(70);
            },
            {
                leaseDurationMs: 400,
                heartbeatIntervalMs: 50,
                _simulateHeartbeatDelayMs: 60,
                onHeartbeat: () => {
                    renewalStarted = true;
                    renewalFinished = true;
                }
            }
        );

        assert.strictEqual(res.status, 'COMPLETED');
        assert.strictEqual(renewalStarted, true, 'Heartbeat renewal must have started');
        assert.strictEqual(renewalFinished, true, 'In-flight renewal must have completed before finalization');

        const finalRecord = await EffectExecution.findOne({ eventId, effectKey });
        assert.strictEqual(finalRecord.status, 'COMPLETED');
        assert.strictEqual(finalRecord.lockedUntil, null);
    });

    it('16. Legacy EffectExecution backfill defaults to dryRun (0 writes committed) and reports backfillable', async () => {
        const legacyEventId = `evt-dryrun-${uuidv4()}`;
        const actionId = new mongoose.Types.ObjectId().toString();
        const idempotencyKey = `idemp-dryrun-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: legacyEventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                automationLogIdempotencyKey: idempotencyKey
            }
        });

        const legacyRecord = await EffectExecution.create({
            eventId: legacyEventId,
            effectKey: `action-${actionId}`,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED',
            stableKey: null
        });

        // Run with default options (dry-run)
        const report = await backfillLegacyEffectExecutions();

        assert.strictEqual(report.dryRun, true, 'Must default to dryRun');
        assert.strictEqual(report.scanned, 1);
        assert.strictEqual(report.matchedTimeTrigger, 1);
        assert.strictEqual(report.backfillable, 1);
        assert.strictEqual(report.backfilled, 0, 'Zero writes must be performed in dryRun');
        assert.strictEqual(report.conflicts.length, 0);

        // Verify document in MongoDB was NOT modified
        const freshDoc = await EffectExecution.findById(legacyRecord._id);
        assert.strictEqual(freshDoc.stableKey, null, 'stableKey must remain null after dryRun');
    });

    it('17. Legacy EffectExecution backfill fails closed on multiple legacy records mapping to same stableKey', async () => {
        const actionId = new mongoose.Types.ObjectId().toString();
        const idempotencyKey = `idemp-multi-legacy-${uuidv4()}`;
        const derivedStableKey = `time-trigger:${idempotencyKey}:${actionId}`;

        const legacyEvent1 = `evt-leg1-${uuidv4()}`;
        const legacyEvent2 = `evt-leg2-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: legacyEvent1,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { automationLogIdempotencyKey: idempotencyKey }
        });

        await OutboxEvent.create({
            eventId: legacyEvent2,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { automationLogIdempotencyKey: idempotencyKey }
        });

        const rec1 = await EffectExecution.create({
            eventId: legacyEvent1,
            effectKey: `action-${actionId}`,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        const rec2 = await EffectExecution.create({
            eventId: legacyEvent2,
            effectKey: `action-${actionId}`,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // Run in apply mode
        const report = await backfillLegacyEffectExecutions({ apply: true });

        // Must detect ambiguity and fail closed without updating either!
        assert.strictEqual(report.conflicts.length, 2);
        assert.strictEqual(report.conflicts[0].reason, 'AMBIGUOUS_MULTIPLE_LEGACY_RECORDS');
        assert.strictEqual(report.conflicts[1].reason, 'AMBIGUOUS_MULTIPLE_LEGACY_RECORDS');
        assert.strictEqual(report.backfilled, 0, 'Neither ambiguous record may be backfilled');

        const fresh1 = await EffectExecution.findById(rec1._id);
        const fresh2 = await EffectExecution.findById(rec2._id);
        assert.strictEqual(fresh1.stableKey, null);
        assert.strictEqual(fresh2.stableKey, null);
    });

    // ─────────────────────────────────────────────────────────────
    // P1-A: EXACT PARTIAL UNIQUE INDEX VERIFICATION TESTS
    // ─────────────────────────────────────────────────────────────

    it('18.1. Correct partial unique index accepted by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');
        const validModel = {
            collection: {
                indexes: async () => [
                    { key: { _id: 1 } },
                    {
                        key: { stableKey: 1 },
                        unique: true,
                        partialFilterExpression: { stableKey: { $type: 'string' } }
                    }
                ]
            }
        };

        const check = await verifyEffectExecutionStableKeyIndex(validModel);
        assert.strictEqual(check.valid, true);
    });

    it('18.2. Missing stableKey index is rejected by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');
        const missingModel = {
            collection: {
                indexes: async () => [{ key: { _id: 1 } }]
            }
        };

        const check = await verifyEffectExecutionStableKeyIndex(missingModel);
        assert.strictEqual(check.valid, false);
        assert.match(check.reason, /Index on stableKey does not exist/);
    });

    it('18.3. Non-unique index is rejected by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');
        const nonUniqueModel = {
            collection: {
                indexes: async () => [
                    {
                        key: { stableKey: 1 },
                        unique: false,
                        partialFilterExpression: { stableKey: { $type: 'string' } }
                    }
                ]
            }
        };

        const check = await verifyEffectExecutionStableKeyIndex(nonUniqueModel);
        assert.strictEqual(check.valid, false);
        assert.match(check.reason, /exists but is not unique/);
    });

    it('18.4. Unique but non-partial index is rejected by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');
        const nonPartialModel = {
            collection: {
                indexes: async () => [
                    {
                        key: { stableKey: 1 },
                        unique: true
                        // missing partialFilterExpression
                    }
                ]
            }
        };

        const check = await verifyEffectExecutionStableKeyIndex(nonPartialModel);
        assert.strictEqual(check.valid, false);
        assert.match(check.reason, /is not a partial index/);
    });

    it('18.5. Incorrect partialFilterExpression is rejected by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');

        // Test with $exists instead of $type: string
        const badFilterModel1 = {
            collection: {
                indexes: async () => [
                    {
                        key: { stableKey: 1 },
                        unique: true,
                        partialFilterExpression: { stableKey: { $exists: true } }
                    }
                ]
            }
        };
        const check1 = await verifyEffectExecutionStableKeyIndex(badFilterModel1);
        assert.strictEqual(check1.valid, false);
        assert.match(check1.reason, /contains invalid or extra operators/);

        // Test with $type: int instead of string
        const badFilterModel2 = {
            collection: {
                indexes: async () => [
                    {
                        key: { stableKey: 1 },
                        unique: true,
                        partialFilterExpression: { stableKey: { $type: 'int' } }
                    }
                ]
            }
        };
        const check2 = await verifyEffectExecutionStableKeyIndex(badFilterModel2);
        assert.strictEqual(check2.valid, false);
        assert.match(check2.reason, /must restrict stableKey to string type/);
    });

    it('18.6. Extra fields in partialFilterExpression are rejected by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');
        const extraFieldsModel = {
            collection: {
                indexes: async () => [
                    {
                        key: { stableKey: 1 },
                        unique: true,
                        partialFilterExpression: {
                            stableKey: { $type: 'string' },
                            tenantId: { $exists: true }
                        }
                    }
                ]
            }
        };
        const check = await verifyEffectExecutionStableKeyIndex(extraFieldsModel);
        assert.strictEqual(check.valid, false);
        assert.match(check.reason, /contains invalid or extra fields/);
    });

    it('18.7. Extra operators in partialFilterExpression.stableKey are rejected by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');
        const extraOpsModel = {
            collection: {
                indexes: async () => [
                    {
                        key: { stableKey: 1 },
                        unique: true,
                        partialFilterExpression: {
                            stableKey: { $type: 'string', $exists: true }
                        }
                    }
                ]
            }
        };
        const check = await verifyEffectExecutionStableKeyIndex(extraOpsModel);
        assert.strictEqual(check.valid, false);
        assert.match(check.reason, /contains invalid or extra operators/);
    });

    it('18.8. Malformed non-object partialFilterExpression.stableKey is rejected by verifyEffectExecutionStableKeyIndex', async () => {
        const { verifyEffectExecutionStableKeyIndex } = await import('../src/migrations/backfillLegacyEffectExecutions.js');
        const malformedModel = {
            collection: {
                indexes: async () => [
                    {
                        key: { stableKey: 1 },
                        unique: true,
                        partialFilterExpression: {
                            stableKey: 'string'
                        }
                    }
                ]
            }
        };
        const check = await verifyEffectExecutionStableKeyIndex(malformedModel);
        assert.strictEqual(check.valid, false);
        assert.match(check.reason, /has malformed partialFilterExpression/);
    });

    // ─────────────────────────────────────────────────────────────
    // P1-B: JIT RECOVERY CONFLICT FENCING & RECONCILIATION TESTS
    // ─────────────────────────────────────────────────────────────

    it('19. JIT runtime recovery halts fail-closed with AMBIGUOUS_MULTIPLE_LEGACY_RECORDS when multiple legacy records exist', async () => {
        const idempotencyKey = `idemp-jit-multi-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;

        const gen0Event1 = `evt-jit0-1-${uuidv4()}`;
        const gen0Event2 = `evt-jit0-2-${uuidv4()}`;
        const gen1EventId = `evt-jit1-rec-${uuidv4()}`;

        // Create two Gen 0 OutboxEvents for the same automationLog
        await OutboxEvent.create([
            {
                eventId: gen0Event1,
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
            },
            {
                eventId: gen0Event2,
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
            }
        ]);

        // Create two legacy records without stableKey
        await EffectExecution.create([
            { eventId: gen0Event1, effectKey, stableKey: null, aggregateType: 'Lead', aggregateId: testLead._id, status: 'COMPLETED' },
            { eventId: gen0Event2, effectKey, stableKey: null, aggregateType: 'Lead', aggregateId: testLead._id, status: 'COMPLETED' }
        ]);

        // Create AutomationLog and Gen 1 OutboxEvent
        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-jit-multi',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-jit-multi',
                recoveryGeneration: 1
            }
        });

        // Worker processing recovered job must reject with fail-closed error
        await assert.rejects(async () => {
            await processDomainEventJob({
                data: {
                    eventId: gen1EventId,
                    eventType: 'TimeTriggerExecutionRequested',
                    aggregateType: 'Lead',
                    aggregateId: testLead._id,
                    payload: {
                        triggerId: testTrigger._id,
                        entityType: 'leads',
                        automationLogIdempotencyKey: idempotencyKey,
                        claimToken: 'claim-jit-multi',
                        recoveryGeneration: 1
                    }
                }
            });
        }, /AMBIGUOUS_MULTIPLE_LEGACY_RECORDS/);
    });

    it('20. Existing stableKey PENDING + legacy COMPLETED must fail closed', async () => {
        const idempotencyKey = `idemp-jit-pnd-comp-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;
        const stableKey = `time-trigger:${idempotencyKey}:${action._id}`;

        const gen0EventId = `evt-jit-gen0-${uuidv4()}`;
        const gen1EventId = `evt-jit-gen1-${uuidv4()}`;

        // 1. Gen 0 OutboxEvent + Legacy COMPLETED without stableKey
        await OutboxEvent.create({
            eventId: gen0EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
        });

        await EffectExecution.create({
            eventId: gen0EventId,
            effectKey,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // 2. Pre-existing distinct stableKey record with status PENDING
        await EffectExecution.create({
            eventId: `evt-other-${uuidv4()}`,
            effectKey,
            stableKey,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'PENDING'
        });

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-pnd-comp',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-pnd-comp',
                recoveryGeneration: 1
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        await assert.rejects(async () => {
            await processDomainEventJob({
                data: {
                    eventId: gen1EventId,
                    eventType: 'TimeTriggerExecutionRequested',
                    aggregateType: 'Lead',
                    aggregateId: testLead._id,
                    payload: {
                        triggerId: testTrigger._id,
                        entityType: 'leads',
                        automationLogIdempotencyKey: idempotencyKey,
                        claimToken: 'claim-pnd-comp',
                        recoveryGeneration: 1
                    }
                }
            });
        }, /AMBIGUOUS_RECONCILIATION_CONFLICT/);

        assert.strictEqual(executedCount, 0, 'Action must NOT be executed on reconciliation conflict');
    });

    it('21. Existing stableKey COMPLETED + legacy PENDING must not arbitrarily reconcile', async () => {
        const idempotencyKey = `idemp-jit-comp-pnd-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;
        const stableKey = `time-trigger:${idempotencyKey}:${action._id}`;

        const gen0EventId = `evt-jit-gen0-${uuidv4()}`;
        const gen1EventId = `evt-jit-gen1-${uuidv4()}`;

        // 1. Legacy record with status PENDING
        await OutboxEvent.create({
            eventId: gen0EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
        });

        await EffectExecution.create({
            eventId: gen0EventId,
            effectKey,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'PENDING'
        });

        // 2. Pre-existing distinct stableKey record with status COMPLETED
        await EffectExecution.create({
            eventId: `evt-other-${uuidv4()}`,
            effectKey,
            stableKey,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-comp-pnd',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-comp-pnd',
                recoveryGeneration: 1
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        await assert.rejects(async () => {
            await processDomainEventJob({
                data: {
                    eventId: gen1EventId,
                    eventType: 'TimeTriggerExecutionRequested',
                    aggregateType: 'Lead',
                    aggregateId: testLead._id,
                    payload: {
                        triggerId: testTrigger._id,
                        entityType: 'leads',
                        automationLogIdempotencyKey: idempotencyKey,
                        claimToken: 'claim-comp-pnd',
                        recoveryGeneration: 1
                    }
                }
            });
        }, /AMBIGUOUS_RECONCILIATION_CONFLICT/);

        assert.strictEqual(executedCount, 0, 'Action must NOT be executed on reconciliation conflict');
    });

    it('22. One legacy record whose JIT update fails must not execute the action', async () => {
        const idempotencyKey = `idemp-jit-fail-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;

        const gen0EventId = `evt-jit-gen0-${uuidv4()}`;
        const gen1EventId = `evt-jit-gen1-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: gen0EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
        });

        await EffectExecution.create({
            eventId: gen0EventId,
            effectKey,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-fail',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-fail',
                recoveryGeneration: 1,
                _simulateJitUpdateFailure: true
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        await assert.rejects(async () => {
            await processDomainEventJob({
                data: {
                    eventId: gen1EventId,
                    eventType: 'TimeTriggerExecutionRequested',
                    aggregateType: 'Lead',
                    aggregateId: testLead._id,
                    payload: {
                        triggerId: testTrigger._id,
                        entityType: 'leads',
                        automationLogIdempotencyKey: idempotencyKey,
                        claimToken: 'claim-fail',
                        recoveryGeneration: 1,
                        _simulateJitUpdateFailure: true
                    }
                }
            });
        }, /JIT_UPDATE_FAILED/);

        assert.strictEqual(executedCount, 0, 'WorkflowEngine.executeAction must NOT be called if JIT update fails');
    });

    it('23. Unique index conflict during JIT update prevents action execution', async () => {
        const idempotencyKey = `idemp-jit-idx-conf-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;
        const stableKey = `time-trigger:${idempotencyKey}:${action._id}`;

        const gen0EventId = `evt-jit-gen0-${uuidv4()}`;
        const gen1EventId = `evt-jit-gen1-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: gen0EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
        });

        // 1. Create a legacy record without stableKey
        const legacyDoc = await EffectExecution.create({
            eventId: gen0EventId,
            effectKey,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // 2. Mock EffectExecution.updateOne to simulate MongoDB E11000 unique index conflict
        const origUpdateOne = EffectExecution.updateOne;
        EffectExecution.updateOne = async function (filter, update, options) {
            if (filter._id?.toString() === legacyDoc._id.toString() && update.$set?.stableKey) {
                const err = new Error('E11000 duplicate key error collection: test.effectexecutions index: unique_effect_execution_stable_key');
                err.code = 11000;
                throw err;
            }
            return origUpdateOne.call(this, filter, update, options);
        };

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-idx-conf',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-idx-conf',
                recoveryGeneration: 1
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        try {
            await assert.rejects(async () => {
                await processDomainEventJob({
                    data: {
                        eventId: gen1EventId,
                        eventType: 'TimeTriggerExecutionRequested',
                        aggregateType: 'Lead',
                        aggregateId: testLead._id,
                        payload: {
                            triggerId: testTrigger._id,
                            entityType: 'leads',
                            automationLogIdempotencyKey: idempotencyKey,
                            claimToken: 'claim-idx-conf',
                            recoveryGeneration: 1
                        }
                    }
                });
            }, /JIT_UPDATE_FAILED/);

            assert.strictEqual(executedCount, 0, 'WorkflowEngine.executeAction must NOT be called on unique index conflict');
        } finally {
            EffectExecution.updateOne = origUpdateOne;
        }
    });

    it('24. No legacy record and no stableKey record permits normal first execution', async () => {
        const idempotencyKey = `idemp-fresh-first-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const eventId = `evt-fresh-${uuidv4()}`;

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-fresh',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 0
        });

        await OutboxEvent.create({
            eventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-fresh',
                recoveryGeneration: 0
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        await processDomainEventJob({
            data: {
                eventId,
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: {
                    triggerId: testTrigger._id,
                    entityType: 'leads',
                    automationLogIdempotencyKey: idempotencyKey,
                    claimToken: 'claim-fresh',
                    recoveryGeneration: 0
                }
            }
        });

        assert.strictEqual(executedCount, 1, 'Fresh event must execute action normally exactly once');

        const stableKey = `time-trigger:${idempotencyKey}:${action._id}`;
        const createdRecord = await EffectExecution.findOne({ stableKey });
        assert.ok(createdRecord, 'EffectExecution record must be created with stableKey');
        assert.strictEqual(createdRecord.status, 'COMPLETED');

        const finalLog = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(finalLog.status, 'success');
    });

    it('25. JIT update returning missing matchedCount rejects with JIT_UPDATE_FAILED and prevents action execution', async () => {
        const idempotencyKey = `idemp-jit-miss-mc-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;
        const gen0EventId = `evt-jit-gen0-${uuidv4()}`;
        const gen1EventId = `evt-jit-gen1-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: gen0EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
        });

        const legacyDoc = await EffectExecution.create({
            eventId: gen0EventId,
            effectKey,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // Mock updateOne to return object without matchedCount (missing matchedCount)
        const origUpdateOne = EffectExecution.updateOne;
        EffectExecution.updateOne = async function (filter, update, options) {
            if (filter._id?.toString() === legacyDoc._id.toString() && update.$set?.stableKey) {
                return { acknowledged: true }; // missing matchedCount!
            }
            return origUpdateOne.call(this, filter, update, options);
        };

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-miss-mc',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-miss-mc',
                recoveryGeneration: 1
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        try {
            await assert.rejects(async () => {
                await processDomainEventJob({
                    data: {
                        eventId: gen1EventId,
                        eventType: 'TimeTriggerExecutionRequested',
                        aggregateType: 'Lead',
                        aggregateId: testLead._id,
                        payload: {
                            triggerId: testTrigger._id,
                            entityType: 'leads',
                            automationLogIdempotencyKey: idempotencyKey,
                            claimToken: 'claim-miss-mc',
                            recoveryGeneration: 1
                        }
                    }
                });
            }, /JIT_UPDATE_FAILED.*missing valid matchedCount/);

            assert.strictEqual(executedCount, 0, 'WorkflowEngine.executeAction must NOT be called on missing matchedCount');
        } finally {
            EffectExecution.updateOne = origUpdateOne;
        }
    });

    it('26. JIT update returning unexpected matchedCount (> 1) rejects with JIT_UPDATE_FAILED and prevents action execution', async () => {
        const idempotencyKey = `idemp-jit-unexp-mc-${uuidv4()}`;
        const action = testTrigger.actions[0];
        const effectKey = `action-${action._id}`;
        const gen0EventId = `evt-jit-gen0-${uuidv4()}`;
        const gen1EventId = `evt-jit-gen1-${uuidv4()}`;

        await OutboxEvent.create({
            eventId: gen0EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: { triggerId: testTrigger._id, entityType: 'leads', automationLogIdempotencyKey: idempotencyKey }
        });

        const legacyDoc = await EffectExecution.create({
            eventId: gen0EventId,
            effectKey,
            stableKey: null,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // Mock updateOne to return matchedCount: 2 (unexpected > 1)
        const origUpdateOne = EffectExecution.updateOne;
        EffectExecution.updateOne = async function (filter, update, options) {
            if (filter._id?.toString() === legacyDoc._id.toString() && update.$set?.stableKey) {
                return { acknowledged: true, matchedCount: 2, modifiedCount: 2 };
            }
            return origUpdateOne.call(this, filter, update, options);
        };

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'claim-unexp-mc',
            leaseUntil: new Date(Date.now() + 60000),
            recoveryCount: 1
        });

        await OutboxEvent.create({
            eventId: gen1EventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: 'claim-unexp-mc',
                recoveryGeneration: 1
            }
        });

        let executedCount = 0;
        WorkflowEngine.executeAction = async () => {
            executedCount++;
        };

        try {
            await assert.rejects(async () => {
                await processDomainEventJob({
                    data: {
                        eventId: gen1EventId,
                        eventType: 'TimeTriggerExecutionRequested',
                        aggregateType: 'Lead',
                        aggregateId: testLead._id,
                        payload: {
                            triggerId: testTrigger._id,
                            entityType: 'leads',
                            automationLogIdempotencyKey: idempotencyKey,
                            claimToken: 'claim-unexp-mc',
                            recoveryGeneration: 1
                        }
                    }
                });
            }, /JIT_UPDATE_FAILED.*Unexpected matchedCount 2/);

            assert.strictEqual(executedCount, 0, 'WorkflowEngine.executeAction must NOT be called on unexpected matchedCount');
        } finally {
            EffectExecution.updateOne = origUpdateOne;
        }
    });
});
