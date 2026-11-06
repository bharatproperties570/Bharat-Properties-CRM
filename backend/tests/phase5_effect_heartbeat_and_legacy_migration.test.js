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

        const report = await backfillLegacyEffectExecutions();
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

        const report = await backfillLegacyEffectExecutions();
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
        const report1 = await backfillLegacyEffectExecutions();
        assert.strictEqual(report1.backfilled, 1);

        // Pass 2 (Restart)
        const report2 = await backfillLegacyEffectExecutions();
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

        const report = await backfillLegacyEffectExecutions();

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
});
