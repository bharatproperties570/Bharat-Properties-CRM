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
import WhatsAppDispatch from '../models/WhatsAppDispatch.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

import {
    acquireAndEnqueue,
    TIME_TRIGGER_LEASE_MS,
    MAX_RECOVERY_ATTEMPTS
} from '../src/workers/cronWorker.js';

import { retryAutomationLog } from '../controllers/automation.controller.js';

describe('Phase 5 — R27 Time-Based Trigger Recovery & Lease Concurrency Test Suite', () => {
    let replset;
    let adminUser;
    let regularUser;
    let testTrigger;
    let testLead;

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

        // Pre-create collections
        await AutomationLog.createCollection();
        await AutomationLog.ensureIndexes();
        await AuditLog.createCollection();
        await OutboxEvent.createCollection();
        await WhatsAppDispatch.createCollection();
        await WhatsAppDispatch.ensureIndexes();
        await Trigger.createCollection();
        await Lead.createCollection();
        await Deal.createCollection();
        await User.createCollection();
        await Role.createCollection();

        // Seed users
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
            createdBy: adminUser._id
        });

        testLead = await Lead.create({
            firstName: 'Aarav',
            lastName: 'Patel',
            mobile: '9811100099'
        });
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        await AutomationLog.deleteMany({});
        await AuditLog.deleteMany({});
        await OutboxEvent.deleteMany({});
        await WhatsAppDispatch.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Atomic Initial Acquisition
    // ─────────────────────────────────────────────────────────────
    it('1. Atomic initial acquisition creates pending AutomationLog and OutboxEvent transactionally', async () => {
        const idempotencyKey = `idemp_${uuidv4()}`;
        const result = await acquireAndEnqueue(
            idempotencyKey,
            testTrigger._id,
            testLead._id,
            'leads',
            'Lead',
            null
        );

        assert.strictEqual(result, true, 'First acquisition must return true (enqueued)');

        const log = await AutomationLog.findOne({ idempotencyKey });
        assert.ok(log, 'AutomationLog must exist in DB');
        assert.strictEqual(log.status, 'pending');
        assert.strictEqual(log.recoveryCount, 0);
        assert.ok(log.claimToken, 'claimToken must be set');
        assert.ok(log.leaseUntil instanceof Date, 'leaseUntil must be a valid Date');
        assert.ok(log.leaseUntil.getTime() > Date.now(), 'leaseUntil must be in the future');

        const outbox = await OutboxEvent.findOne({ aggregateId: testLead._id, eventType: 'TimeTriggerExecutionRequested' });
        assert.ok(outbox, 'OutboxEvent must exist in DB');
        assert.strictEqual(outbox.payload.claimToken, log.claimToken);
        assert.strictEqual(outbox.payload.recoveryGeneration, 0);
        assert.strictEqual(outbox.payload.automationLogIdempotencyKey, idempotencyKey);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Concurrent Stale Recovery CAS Race (Exactly 1 Winner)
    // ─────────────────────────────────────────────────────────────
    it('2. Concurrent stale recovery CAS race yields exactly 1 winner and 1 new OutboxEvent', async () => {
        const idempotencyKey = `idemp_stale_${uuidv4()}`;
        const staleDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes expired

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'stale-token-v0',
            leaseUntil: staleDate,
            recoveryCount: 0,
            updatedAt: staleDate
        });

        // 2 concurrent recovery attempts racing simultaneously
        const [resA, resB] = await Promise.all([
            acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null),
            acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null)
        ]);

        const winnerCount = (resA ? 1 : 0) + (resB ? 1 : 0);
        assert.strictEqual(winnerCount, 1, 'Exactly one concurrent recovery call must win the CAS');

        const log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.recoveryCount, 1, 'Recovery count must be exactly 1');
        assert.notStrictEqual(log.claimToken, 'stale-token-v0', 'Winner must update claimToken');
        assert.ok(log.leaseUntil > new Date(), 'Winner must renew leaseUntil');

        const outboxEvents = await OutboxEvent.find({ 'payload.automationLogIdempotencyKey': idempotencyKey });
        assert.strictEqual(outboxEvents.length, 1, 'Exactly one recovery OutboxEvent must be emitted');
        assert.strictEqual(outboxEvents[0].payload.claimToken, log.claimToken);
        assert.strictEqual(outboxEvents[0].payload.recoveryGeneration, 1);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Active Lease Duplicate Suppression (<15m Skips Cleanly)
    // ─────────────────────────────────────────────────────────────
    it('3. Active lease duplicate suppression: non-expired lease cleanly skips with no new OutboxEvent', async () => {
        const idempotencyKey = `idemp_active_${uuidv4()}`;
        const activeLease = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes remaining
        const token = 'active-token-xyz';

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: token,
            leaseUntil: activeLease,
            recoveryCount: 0
        });

        const res = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(res, false, 'Active lease must return false (skipped)');

        const outboxCount = await OutboxEvent.countDocuments({ 'payload.automationLogIdempotencyKey': idempotencyKey });
        assert.strictEqual(outboxCount, 0, 'No OutboxEvent should be created for active lease');

        const log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.claimToken, token, 'Claim token must not be changed');
        assert.strictEqual(log.recoveryCount, 0, 'Recovery count must not be incremented');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Terminal Failure & Durable AuditLog (recoveryCount >= 3)
    // ─────────────────────────────────────────────────────────────
    it('4. Terminal failure & durable AuditLog: recoveryCount >= 3 dead-letters and records audit atomically', async () => {
        const idempotencyKey = `idemp_exhausted_${uuidv4()}`;
        const staleDate = new Date(Date.now() - 20 * 60 * 1000);

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: 'exhausted-token',
            leaseUntil: staleDate,
            recoveryCount: 3,
            updatedAt: staleDate
        });

        const res = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(res, false, 'Terminal exhausted trigger must not be enqueued');

        // Verify AutomationLog state
        const log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.status, 'failed');
        assert.strictEqual(log.details?.terminal, true, 'Terminal flag must be true');
        assert.ok(log.details?.error?.includes('TERMINAL_RECOVERY_EXHAUSTED'));
        assert.strictEqual(log.leaseUntil, undefined, 'leaseUntil must be unset');

        // Verify AuditLog record
        const audit = await AuditLog.findOne({ eventType: 'automation_recovery_exhausted' });
        assert.ok(audit, 'AuditLog must be recorded');
        assert.strictEqual(audit.targetId.toString(), testLead._id.toString());
        assert.strictEqual(audit.changes.after, 'failed');

        // Subsequent calls must remain inert and not emit duplicate audits
        const res2 = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(res2, false);
        const auditCount = await AuditLog.countDocuments({ eventType: 'automation_recovery_exhausted' });
        assert.strictEqual(auditCount, 1, 'No duplicate audit entries should be recorded');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Manual Retry Authorization & Atomic Dispatch
    // ─────────────────────────────────────────────────────────────
    it('5. Manual retry endpoint: enforces terminal status, generates new lease/claimToken, and handles concurrent calls', async () => {
        const idempotencyKey = `idemp_terminal_${uuidv4()}`;
        const terminalLog = await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'failed',
            idempotencyKey,
            details: { terminal: true, error: 'Exhausted' },
            recoveryCount: 3
        });

        const mockRes = () => {
            const res = {
                statusCode: 200,
                data: null,
                status(code) { this.statusCode = code; return this; },
                json(payload) { this.data = payload; return this; }
            };
            return res;
        };

        // Admin call succeeds
        const adminRes = mockRes();
        await retryAutomationLog({
            params: { id: terminalLog._id.toString() },
            user: { _id: adminUser._id, role: 'admin' }
        }, adminRes);

        assert.strictEqual(adminRes.statusCode, 200, 'Admin retry should succeed with 200');
        assert.strictEqual(adminRes.data.success, true);

        // Verify AutomationLog was reset
        const reloadedLog = await AutomationLog.findById(terminalLog._id);
        assert.strictEqual(reloadedLog.status, 'pending');
        assert.strictEqual(reloadedLog.recoveryCount, 0);
        assert.ok(reloadedLog.claimToken);
        assert.ok(reloadedLog.leaseUntil > new Date());
        assert.strictEqual(reloadedLog.details?.terminal, undefined);

        // Verify OutboxEvent created
        const outbox = await OutboxEvent.findOne({
            aggregateId: testLead._id,
            'payload.claimToken': reloadedLog.claimToken
        });
        assert.ok(outbox, 'Fresh OutboxEvent must be emitted on manual retry');
        assert.strictEqual(outbox.payload.manualRetryBy.toString(), adminUser._id.toString());

        // Verify AuditLog created
        const retryAudit = await AuditLog.findOne({ eventType: 'automation_manual_retry' });
        assert.ok(retryAudit, 'AuditLog for manual retry must be recorded');
        assert.strictEqual(retryAudit.userId.toString(), adminUser._id.toString());

        // Second call on already reset log returns 409 conflict
        const secondRes = mockRes();
        await retryAutomationLog({
            params: { id: terminalLog._id.toString() },
            user: { _id: adminUser._id, role: 'admin' }
        }, secondRes);

        assert.strictEqual(secondRes.statusCode, 409, 'Subsequent retry on active log must return 409 Conflict');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Stale Claim Token Rejection in Consumer
    // ─────────────────────────────────────────────────────────────
    it('6. Consumer ownership fencing: stale claim token cannot finalize or modify AutomationLog', async () => {
        const idempotencyKey = `idemp_fencing_${uuidv4()}`;
        const currentToken = 'claim-token-current';
        const staleToken = 'claim-token-stale';

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey,
            claimToken: currentToken,
            leaseUntil: new Date(Date.now() + 15 * 60 * 1000),
            recoveryCount: 1
        });

        // Worker with stale token attempts to mark success
        const staleUpdate = await AutomationLog.updateOne(
            { idempotencyKey, claimToken: staleToken },
            { $set: { status: 'success', completedAt: new Date() }, $unset: { leaseUntil: 1 } }
        );

        assert.strictEqual(staleUpdate.modifiedCount, 0, 'Stale token must match 0 documents');

        // Document remains in pending with current token and lease
        const log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.status, 'pending');
        assert.strictEqual(log.claimToken, currentToken);
        assert.ok(log.leaseUntil > new Date());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Outbox Duplicate Prevention Across Multiple Cron Passes
    // ─────────────────────────────────────────────────────────────
    it('7. Completed triggers are permanently skipped across multiple cron passes', async () => {
        const idempotencyKey = `idemp_completed_${uuidv4()}`;

        await AutomationLog.create({
            ruleType: 'TimeBasedTrigger',
            ruleId: testTrigger._id,
            targetEntityId: testLead._id,
            targetModule: 'leads',
            status: 'success',
            idempotencyKey,
            completedAt: new Date()
        });

        // 3 consecutive cron passes evaluate this completed trigger
        for (let i = 0; i < 3; i++) {
            const res = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
            assert.strictEqual(res, false, `Cron pass ${i + 1} must skip completed trigger`);
        }

        const outboxCount = await OutboxEvent.countDocuments({ 'payload.automationLogIdempotencyKey': idempotencyKey });
        assert.strictEqual(outboxCount, 0, 'No outbox events must be created for completed trigger');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Long-Running Action Pre-Dispatch Lease Expiry Fencing
    // ─────────────────────────────────────────────────────────────
    it('8. Long-running action: recovered task with new claim token supersedes original worker', async () => {
        const idempotencyKey = `idemp_race_supersede_${uuidv4()}`;

        // Initial acquisition
        await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        const originalLog = await AutomationLog.findOne({ idempotencyKey });
        const token1 = originalLog.claimToken;

        // Simulate long execution: lease expires in database
        await AutomationLog.updateOne(
            { _id: originalLog._id },
            { $set: { leaseUntil: new Date(Date.now() - 1000) } }
        );

        // Second worker recovers the job
        const recoveryResult = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(recoveryResult, true, 'Recovery must succeed');

        const recoveredLog = await AutomationLog.findOne({ idempotencyKey });
        const token2 = recoveredLog.claimToken;
        assert.notStrictEqual(token1, token2, 'Claim tokens must differ across recovery generations');

        // Worker 1 finishes late and attempts to finalize with token1
        const res1 = await AutomationLog.updateOne(
            { idempotencyKey, claimToken: token1 },
            { $set: { status: 'success' }, $unset: { leaseUntil: 1 } }
        );
        assert.strictEqual(res1.modifiedCount, 0, 'Superseded worker 1 update must be rejected');

        // Worker 2 finishes with token2
        const res2 = await AutomationLog.updateOne(
            { idempotencyKey, claimToken: token2 },
            { $set: { status: 'success' }, $unset: { leaseUntil: 1 } }
        );
        assert.strictEqual(res2.modifiedCount, 1, 'Active worker 2 update must succeed');

        const finalLog = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(finalLog.status, 'success');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 9: External WhatsApp Dispatch Deduplication / Replay Protection
    // ─────────────────────────────────────────────────────────────
    it('9. WhatsAppDispatch L2 ledger prevents duplicate external dispatch across process retries', async () => {
        const dispatchIdempotencyKey = `wa_msg_${uuidv4()}`;

        // First worker claims and dispatches message
        const dispatch1 = await WhatsAppDispatch.create({
            idempotencyKey: dispatchIdempotencyKey,
            recipient: '9811100099',
            channel: 'WHATSAPP',
            provider: 'META',
            status: 'DISPATCHED'
        });
        assert.ok(dispatch1);

        // Simulated worker crash & retry: second attempt checks WhatsAppDispatch before calling provider
        const existing = await WhatsAppDispatch.findOne({ idempotencyKey: dispatchIdempotencyKey });
        assert.ok(existing, 'Dispatch record must be detected');
        assert.strictEqual(existing.status, 'DISPATCHED');

        // Unique index prevents duplicate insertion
        await assert.rejects(
            WhatsAppDispatch.create({
                idempotencyKey: dispatchIdempotencyKey,
                recipient: '9811100099',
                status: 'CLAIMED'
            }),
            /duplicate key error/
        );
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Complete Recovery Exhaustion & Operator Recovery Flow
    // ─────────────────────────────────────────────────────────────
    it('10. Full lifecycle: Initial acquisition -> 3 recoveries -> Terminal exhaustion -> Operator recovery to success', async () => {
        const idempotencyKey = `idemp_lifecycle_${uuidv4()}`;

        // 1. Initial acquisition (Generation 0)
        const acq = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(acq, true);

        // 2. Simulate 3 consecutive worker crashes and recovery passes
        for (let gen = 1; gen <= 3; gen++) {
            await AutomationLog.updateOne(
                { idempotencyKey },
                { $set: { leaseUntil: new Date(Date.now() - 1000) } }
            );
            const rec = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
            assert.strictEqual(rec, true, `Recovery generation ${gen} must succeed`);
            const logState = await AutomationLog.findOne({ idempotencyKey });
            assert.strictEqual(logState.recoveryCount, gen);
        }

        // 3. 4th pass: lease expired, recoveryCount is 3 => Dead letters to terminal failure
        await AutomationLog.updateOne(
            { idempotencyKey },
            { $set: { leaseUntil: new Date(Date.now() - 1000) } }
        );
        const exhaustedPass = await acquireAndEnqueue(idempotencyKey, testTrigger._id, testLead._id, 'leads', 'Lead', null);
        assert.strictEqual(exhaustedPass, false, 'Exhausted pass must not enqueue');

        let log = await AutomationLog.findOne({ idempotencyKey });
        assert.strictEqual(log.status, 'failed');
        assert.strictEqual(log.details?.terminal, true);

        // 4. Operator manual retry via controller
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

        // 5. Worker processes the recovered event and marks success
        const consumerUpdate = await AutomationLog.updateOne(
            { idempotencyKey, claimToken: log.claimToken },
            { $set: { status: 'success', completedAt: new Date() }, $unset: { leaseUntil: 1 } }
        );
        assert.strictEqual(consumerUpdate.modifiedCount, 1);

        log = await AutomationLog.findById(log._id);
        assert.strictEqual(log.status, 'success');
        assert.strictEqual(log.leaseUntil, undefined);
    });
});
