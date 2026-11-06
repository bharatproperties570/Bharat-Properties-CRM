process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';

import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Trigger from '../models/Trigger.js';
import AutomationLog from '../models/AutomationLog.js';
import AuditLog from '../models/AuditLog.js';
import OutboxEvent from '../models/OutboxEvent.js';
import EffectExecution from '../models/EffectExecution.js';
import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import {
    acquireAndEnqueue,
    TIME_TRIGGER_LEASE_MS,
    MAX_RECOVERY_ATTEMPTS
} from '../src/workers/cronWorker.js';

import { retryAutomationLog } from '../controllers/automation.controller.js';
import { processDomainEventJob } from '../src/workers/domainEventWorkerLogic.js';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';

describe('Phase 5 — R27 Time-Based Trigger Recovery, Replay Protection & Ownership Fencing', () => {
    let replset;
    let adminUser;
    let regularUser;
    let testTrigger;
    let testLead;
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

        // Pre-create collections and build indexes
        await AutomationLog.createCollection();
        await AutomationLog.ensureIndexes();
        await AuditLog.createCollection();
        await OutboxEvent.createCollection();
        await EffectExecution.createCollection();
        await EffectExecution.ensureIndexes();
        await WhatsAppDispatch.createCollection();
        await WhatsAppDispatch.ensureIndexes();
        await Trigger.createCollection();
        await Lead.createCollection();
        await Deal.createCollection();
        await User.createCollection();
        await Role.createCollection();

        // Seed roles & users
        const adminRole = await Role.create({ name: 'admin', permissions: ['all'], department: 'sales' });
        const salesRole = await Role.create({ name: 'sales', permissions: ['leads:read'], department: 'sales' });

        adminUser = await User.create({
            fullName: 'Automation Admin',
            email: `admin_${Date.now()}@crm.local`,
            password: 'password123',
            department: 'sales',
            role: adminRole._id,
            isActive: true,
            status: 'active'
        });

        regularUser = await User.create({
            fullName: 'Sales Executive',
            email: `sales_${Date.now()}@crm.local`,
            password: 'password123',
            department: 'sales',
            role: salesRole._id,
            isActive: true,
            status: 'active'
        });

        testTrigger = await Trigger.create({
            name: 'Follow-up Lead Time Trigger',
            module: 'leads',
            event: 'time_based',
            isActive: true,
            actions: [
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'send_notification',
                    target: 'owner',
                    message: 'Follow-up notification 1'
                }
            ],
            createdBy: adminUser._id
        });

        testLead = await Lead.create({
            firstName: 'Aarav',
            lastName: 'Patel',
            mobile: '9811100099'
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
        WorkflowEngine.executeAction = origExecuteAction;
        await AutomationLog.deleteMany({});
        await AuditLog.deleteMany({});
        await OutboxEvent.deleteMany({});
        await EffectExecution.deleteMany({});
        await WhatsAppDispatch.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Stale Event with Old claimToken Executes ZERO Actions
    // ─────────────────────────────────────────────────────────────
    it('1. Stale event with old claimToken executes zero actions and skips inertly', async () => {
        const idempotencyKey = `idemp_stale_exec_${uuidv4()}`;
        const activeClaimToken = 'token-current-gen1';
        const staleClaimToken = 'token-old-gen0';

        // AutomationLog is held by a newer recovery generation (token-current-gen1)
        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: activeClaimToken,
            leaseUntil: new Date(Date.now() + 15 * 60 * 1000),
            recoveryCount: 1
        });

        let actionCalls = 0;
        WorkflowEngine.executeAction = async () => {
            actionCalls++;
        };

        const jobPayload = {
            eventId: `evt-stale-${uuidv4()}`,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: staleClaimToken, // Outdated token!
                recoveryGeneration: 0
            }
        };

        const res = await processDomainEventJob({ data: jobPayload });

        // Assert zero actions were executed
        assert.strictEqual(actionCalls, 0, 'Stale event must execute strictly 0 actions');
        assert.strictEqual(res?.skipped, true, 'Handler must return skipped response');

        // Verify DB record remained untouched
        const log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.status, 'pending');
        assert.strictEqual(log.claimToken, activeClaimToken);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Current claimToken Executes the Action
    // ─────────────────────────────────────────────────────────────
    it('2. Current claimToken executes the action, records EffectExecution, and finalizes to success', async () => {
        const idempotencyKey = `idemp_valid_exec_${uuidv4()}`;
        const currentClaimToken = 'token-active-gen0';

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: currentClaimToken,
            leaseUntil: new Date(Date.now() + 15 * 60 * 1000),
            recoveryCount: 0
        });

        let actionCalls = 0;
        WorkflowEngine.executeAction = async () => {
            actionCalls++;
        };

        const eventId = `evt-valid-${uuidv4()}`;
        const jobPayload = {
            eventId,
            eventType: 'TimeTriggerExecutionRequested',
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            payload: {
                triggerId: testTrigger._id,
                entityType: 'leads',
                automationLogIdempotencyKey: idempotencyKey,
                claimToken: currentClaimToken,
                recoveryGeneration: 0
            }
        };

        await processDomainEventJob({ data: jobPayload });

        assert.strictEqual(actionCalls, 1, 'Action must be executed exactly once');

        // Verify EffectExecution was recorded with stableKey
        const actionId = testTrigger.actions[0]._id.toString();
        const expectedStableKey = `time-trigger:${idempotencyKey}:${actionId}`;
        const effect = await EffectExecution.findOne({ stableKey: expectedStableKey });
        assert.ok(effect, 'EffectExecution record with stableKey must exist');
        assert.strictEqual(effect.status, 'COMPLETED');

        // Verify AutomationLog finalized to success
        const finalLog = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(finalLog.status, 'success');
        assert.strictEqual(finalLog.leaseUntil, undefined);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Recovery Does Not Repeat an Already Completed Action
    // ─────────────────────────────────────────────────────────────
    it('3. Recovery creates a new OutboxEvent but does not repeat an already completed action', async () => {
        const action1Id = new mongoose.Types.ObjectId();
        const action2Id = new mongoose.Types.ObjectId();

        const multiActionTrigger = await Trigger.create({
            name: 'Multi-Action Recovery Trigger',
            module: 'leads',
            event: 'time_based',
            isActive: true,
            actions: [
                { _id: action1Id, type: 'send_notification', target: 'owner', message: 'Action 1' },
                { _id: action2Id, type: 'send_notification', target: 'owner', message: 'Action 2' }
            ],
            createdBy: adminUser._id
        });

        const idempotencyKey = `idemp_multi_rec_${uuidv4()}`;
        const gen0ClaimToken = 'token-gen0';

        // 1. Initial acquisition
        await acquireAndEnqueue(idempotencyKey, multiActionTrigger._id, testLead._id, 'leads', 'Lead', null, {
            claimToken: gen0ClaimToken
        });

        // 2. Simulate Action 1 completed in Generation 0
        const action1StableKey = `time-trigger:${idempotencyKey}:${action1Id}`;
        await EffectExecution.create({
            eventId: 'evt-gen0',
            effectKey: `action-${action1Id}`,
            stableKey: action1StableKey,
            aggregateType: 'Lead',
            aggregateId: testLead._id,
            status: 'COMPLETED'
        });

        // 3. Lease expires for Generation 0
        await AutomationLog.updateOne(
            { idempotencyKey },
            { $set: { leaseUntil: new Date(Date.now() - 1000) } }
        );

        // 4. Cron worker recovers stale lease -> creates Generation 1 OutboxEvent
        const recovered = await acquireAndEnqueue(idempotencyKey, multiActionTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(recovered, true, 'Recovery must succeed');

        const logAfterRecovery = await AutomationLog.findOne({ idempotencyKey });
        const gen1ClaimToken = logAfterRecovery.claimToken;
        assert.notStrictEqual(gen1ClaimToken, gen0ClaimToken, 'Generation 1 must receive a fresh claimToken');
        assert.strictEqual(logAfterRecovery.recoveryCount, 1);

        // Retrieve Generation 1 OutboxEvent
        const gen1Event = await OutboxEvent.findOne({
            aggregateId: testLead._id,
            'payload.claimToken': gen1ClaimToken
        });
        assert.ok(gen1Event, 'Gen 1 OutboxEvent must exist');

        // Track action execution during Generation 1 consumer processing
        const executedActionIds = [];
        WorkflowEngine.executeAction = async (action) => {
            executedActionIds.push(action._id.toString());
        };

        // Run consumer on Generation 1 job
        await processDomainEventJob({
            data: {
                eventId: gen1Event.eventId,
                eventType: gen1Event.eventType,
                aggregateType: gen1Event.aggregateType,
                aggregateId: gen1Event.aggregateId,
                payload: gen1Event.payload
            }
        });

        // Action 1 was ALREADY COMPLETED in Gen 0, so it must be SKIPPED!
        assert.ok(!executedActionIds.includes(action1Id.toString()), 'Action 1 must NOT be repeated in recovery');
        // Action 2 must be executed
        assert.ok(executedActionIds.includes(action2Id.toString()), 'Action 2 must be executed in recovery');
        assert.strictEqual(executedActionIds.length, 1, 'Only Action 2 should have been executed');

        // Final state
        const finalLog = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(finalLog.status, 'success');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Old Worker Cannot Mark a Newer Generation Failed
    // ─────────────────────────────────────────────────────────────
    it('4. Old worker cannot mark a newer generation failed', async () => {
        const idempotencyKey = `idemp_fence_fail_${uuidv4()}`;
        const gen0ClaimToken = 'token-gen0-stale';
        const gen1ClaimToken = 'token-gen1-current';

        // Newer generation is pending with gen1ClaimToken
        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: gen1ClaimToken,
            leaseUntil: new Date(Date.now() + 15 * 60 * 1000),
            recoveryCount: 1,
            details: { terminal: false, notes: 'generation 1 active' }
        });

        // Worker 0 with gen0ClaimToken catches an action error and attempts failure update
        WorkflowEngine.executeAction = async () => {
            throw new Error('Simulated transient worker 0 network drop');
        };

        await assert.rejects(
            processDomainEventJob({
                data: {
                    eventId: 'evt-old-worker',
                    eventType: 'TimeTriggerExecutionRequested',
                    aggregateType: 'Lead',
                    aggregateId: testLead._id,
                    payload: {
                        triggerId: testTrigger._id,
                        entityType: 'leads',
                        automationLogIdempotencyKey: idempotencyKey,
                        claimToken: gen0ClaimToken, // Stale!
                        recoveryGeneration: 0
                    }
                }
            })
        ).catch(() => {
            // Rejection or skipped response is expected
        });

        // Verify DB: Log must NOT be marked failed by old worker; remains pending for generation 1
        const logInDb = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(logInDb.status, 'pending', 'Status must NOT be overwritten to failed by stale worker');
        assert.strictEqual(logInDb.claimToken, gen1ClaimToken);
        assert.strictEqual(logInDb.details?.notes, 'generation 1 active', 'Details must not be wiped out');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Old Worker Cannot Mark a Newer Generation Successful
    // ─────────────────────────────────────────────────────────────
    it('5. Old worker cannot mark a newer generation successful', async () => {
        const idempotencyKey = `idemp_fence_succ_${uuidv4()}`;
        const gen0ClaimToken = 'token-gen0-lagging';
        const gen1ClaimToken = 'token-gen1-recovered';

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: gen1ClaimToken,
            leaseUntil: new Date(Date.now() + 15 * 60 * 1000),
            recoveryCount: 1
        });

        WorkflowEngine.executeAction = async () => {};

        // Worker 0 attempts to finalize with its old token
        await processDomainEventJob({
            data: {
                eventId: 'evt-lagging-worker',
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: {
                    triggerId: testTrigger._id,
                    entityType: 'leads',
                    automationLogIdempotencyKey: idempotencyKey,
                    claimToken: gen0ClaimToken, // Stale!
                    recoveryGeneration: 0
                }
            }
        });

        // Verify DB: status must remain pending under gen1ClaimToken
        const logInDb = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(logInDb.status, 'pending', 'Stale worker must not mark newer generation successful');
        assert.strictEqual(logInDb.claimToken, gen1ClaimToken);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Ownership Loss Between Sequential Actions Prevents Subsequent Actions
    // ─────────────────────────────────────────────────────────────
    it('6. Ownership loss between sequential actions halts dispatch and prevents subsequent actions', async () => {
        const actionA = new mongoose.Types.ObjectId();
        const actionB = new mongoose.Types.ObjectId();

        const twoStepTrigger = await Trigger.create({
            name: 'Two-Step Sequential Trigger',
            module: 'leads',
            event: 'time_based',
            isActive: true,
            actions: [
                { _id: actionA, type: 'send_notification', target: 'owner', message: 'Step A' },
                { _id: actionB, type: 'send_notification', target: 'owner', message: 'Step B' }
            ],
            createdBy: adminUser._id
        });

        const idempotencyKey = `idemp_seq_loss_${uuidv4()}`;
        const initialToken = 'token-seq-gen0';

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: twoStepTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: initialToken,
            leaseUntil: new Date(Date.now() + 15 * 60 * 1000),
            recoveryCount: 0
        });

        const executedActions = [];
        WorkflowEngine.executeAction = async (action) => {
            executedActions.push(action._id.toString());
            if (action._id.toString() === actionA.toString()) {
                // Simulate lease expiration & recovery right after Action A completes:
                // Another worker takes over with a new claim token!
                await AutomationLog.updateOne(
                    { idempotencyKey },
                    { $set: { claimToken: 'token-seq-gen1', recoveryCount: 1 } }
                );
            }
        };

        const res = await processDomainEventJob({
            data: {
                eventId: 'evt-seq-worker',
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: {
                    triggerId: twoStepTrigger._id,
                    entityType: 'leads',
                    automationLogIdempotencyKey: idempotencyKey,
                    claimToken: initialToken,
                    recoveryGeneration: 0
                }
            }
        });

        // Action A ran, but Action B was PREVENTED because pre-action ownership revalidation caught the loss
        assert.ok(executedActions.includes(actionA.toString()), 'Action A must have executed');
        assert.ok(!executedActions.includes(actionB.toString()), 'Action B must NOT execute after ownership loss');
        assert.strictEqual(executedActions.length, 1);
        assert.strictEqual(res?.skipped, true);
        assert.strictEqual(res?.reason, 'OWNERSHIP_LOST_DURING_SEQUENCE');

        // EffectExecution for Action B must NOT exist
        const effectB = await EffectExecution.findOne({ stableKey: `time-trigger:${idempotencyKey}:${actionB}` });
        assert.strictEqual(effectB, null, 'EffectExecution for Action B must not be created');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Missing Trigger / Entity Branches are Fenced
    // ─────────────────────────────────────────────────────────────
    it('7. Missing Trigger and missing Entity branches are fenced by claimToken and status', async () => {
        const idempotencyKey = `idemp_fenced_missing_${uuidv4()}`;
        const currentToken = 'token-missing-current';
        const staleToken = 'token-missing-stale';
        const fakeTriggerId = new mongoose.Types.ObjectId();

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: fakeTriggerId,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: currentToken,
            leaseUntil: new Date(Date.now() + 15 * 60 * 1000),
            details: { initialMeta: 'preserved' }
        });

        // 1. Stale event targeting non-existent trigger
        await processDomainEventJob({
            data: {
                eventId: 'evt-missing-stale',
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: {
                    triggerId: fakeTriggerId,
                    entityType: 'leads',
                    automationLogIdempotencyKey: idempotencyKey,
                    claimToken: staleToken
                }
            }
        });

        // Stale event must NOT mark failed or touch DB
        let logInDb = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(logInDb.status, 'pending');

        // 2. Valid current event targeting non-existent trigger
        await processDomainEventJob({
            data: {
                eventId: 'evt-missing-valid',
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: {
                    triggerId: fakeTriggerId,
                    entityType: 'leads',
                    automationLogIdempotencyKey: idempotencyKey,
                    claimToken: currentToken
                }
            }
        });

        logInDb = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(logInDb.status, 'failed', 'Valid current worker should mark failed');
        assert.ok(logInDb.details?.error?.includes('Trigger'));
        assert.strictEqual(logInDb.details?.initialMeta, 'preserved', 'Existing details metadata must be preserved');
        assert.strictEqual(logInDb.leaseUntil, undefined, 'leaseUntil must be unset');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Manual Retry Concurrent Requests (Exactly 1 Success, 1 Conflict)
    // ─────────────────────────────────────────────────────────────
    it('8. Manual retry concurrent requests: exactly one 200, one 409, one OutboxEvent, and one AuditLog', async () => {
        const idempotencyKey = `idemp_retry_race_${uuidv4()}`;

        const terminalLog = await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'failed',
            idempotencyKey,
            details: { terminal: true, error: 'TERMINAL_RECOVERY_EXHAUSTED' },
            recoveryCount: 3
        });

        const mockRes = () => {
            const res = {
                statusCode: 200,
                status(c) { this.statusCode = c; return this; },
                json(d) { this.data = d; return this; }
            };
            return res;
        };

        const resA = mockRes();
        const resB = mockRes();

        // Fire 2 concurrent manual retry requests simultaneously
        await Promise.all([
            retryAutomationLog({
                params: { id: terminalLog._id.toString() },
                user: { _id: adminUser._id, role: 'admin' }
            }, resA),
            retryAutomationLog({
                params: { id: terminalLog._id.toString() },
                user: { _id: adminUser._id, role: 'admin' }
            }, resB)
        ]);

        const codes = [resA.statusCode, resB.statusCode].sort();
        assert.strictEqual(codes[0], 200, 'Winner must return 200 OK');
        assert.strictEqual(codes[1], 409, 'Loser must return 409 Conflict');

        // Verify exactly ONE fresh OutboxEvent was created
        const outboxCount = await OutboxEvent.countDocuments({
            aggregateId: testLead._id,
            'payload.automationLogIdempotencyKey': idempotencyKey
        });
        assert.strictEqual(outboxCount, 1, 'Exactly one retry OutboxEvent must be emitted');

        // Verify exactly ONE AuditLog entry was recorded
        const auditCount = await AuditLog.countDocuments({
            eventType: 'automation_manual_retry',
            targetId: testLead._id
        });
        assert.strictEqual(auditCount, 1, 'Exactly one AuditLog entry must be created');

        // Verify AutomationLog state
        const updated = await AutomationLog.findById(terminalLog._id);
        assert.strictEqual(updated.status, 'pending');
        assert.strictEqual(updated.recoveryCount, 0);
        assert.ok(updated.claimToken);
        assert.ok(updated.leaseUntil > new Date());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Existing R27 Recovery Exhaustion and Operator Retry Lifecycle
    // ─────────────────────────────────────────────────────────────
    it('9. Existing R27 lifecycle: initial acq -> 3 recoveries -> terminal dead-letter -> operator retry -> success', async () => {
        const idempotencyKey = `idemp_full_lifecycle_${uuidv4()}`;

        // 1. Initial acquisition
        const acq = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(acq, true);

        // 2. 3 recoveries upon repeated worker crashes
        for (let gen = 1; gen <= 3; gen++) {
            await AutomationLog.updateOne(
                { idempotencyKey },
                { $set: { leaseUntil: new Date(Date.now() - 1000) } }
            );
            const rec = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
            assert.strictEqual(rec, true, `Recovery ${gen} must succeed`);
        }

        // 3. 4th pass after 3 recoveries -> Dead-letters into terminal failure with AuditLog
        await AutomationLog.updateOne(
            { idempotencyKey },
            { $set: { leaseUntil: new Date(Date.now() - 1000) } }
        );
        const exhausted = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(exhausted, false);

        let log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.status, 'failed');
        assert.strictEqual(log.details?.terminal, true);

        const audit = await AuditLog.findOne({ eventType: 'automation_recovery_exhausted', targetId: testLead._id });
        assert.ok(audit, 'AuditLog for recovery exhaustion must be persisted');

        // 4. Operator manual retry via API
        const mockRes = () => {
            const res = {
                statusCode: 200,
                status(c) { this.statusCode = c; return this; },
                json(d) { this.data = d; return this; }
            };
            return res;
        };
        const opRes = mockRes();
        await retryAutomationLog({
            params: { id: log._id.toString() },
            user: { _id: adminUser._id, role: 'admin' }
        }, opRes);
        assert.strictEqual(opRes.statusCode, 200);

        log = await AutomationLog.findById(log._id);
        assert.strictEqual(log.status, 'pending');
        assert.strictEqual(log.recoveryCount, 0);

        // 5. Worker consumes recovered event
        WorkflowEngine.executeAction = async () => {};
        await processDomainEventJob({
            data: {
                eventId: `evt-op-retry-${uuidv4()}`,
                eventType: 'TimeTriggerExecutionRequested',
                aggregateType: 'Lead',
                aggregateId: testLead._id,
                payload: {
                    triggerId: testTrigger._id,
                    entityType: 'leads',
                    automationLogIdempotencyKey: idempotencyKey,
                    claimToken: log.claimToken,
                    recoveryGeneration: 0
                }
            }
        });

        log = await AutomationLog.findById(log._id);
        assert.strictEqual(log.status, 'success');
        assert.strictEqual(log.leaseUntil, undefined);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Atomic CAS Recovery Race & Active Lease Duplicate Suppression
    // ─────────────────────────────────────────────────────────────
    it('10. Atomic CAS recovery race and active lease duplicate suppression', async () => {
        const idempotencyKey = `idemp_cas_race_${uuidv4()}`;

        // Seed with expired lease
        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'stale-token-v0',
            leaseUntil: new Date(Date.now() - 30 * 60 * 1000),
            recoveryCount: 0
        });

        // 2 concurrent recovery passes race
        const [resA, resB] = await Promise.all([
            acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null),
            acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null)
        ]);

        const winnerCount = (resA ? 1 : 0) + (resB ? 1 : 0);
        assert.strictEqual(winnerCount, 1, 'Exactly one concurrent recovery pass must win CAS');

        // Subsequent pass while lease is active (<15m) skips cleanly
        const resActive = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(resActive, false, 'Active lease must skip with no duplicate event');
    });
});
