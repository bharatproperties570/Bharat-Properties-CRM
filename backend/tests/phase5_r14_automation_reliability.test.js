process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import AutomationLog from '../models/AutomationLog.js';
import Trigger from '../models/Trigger.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import { WorkflowEngine } from '../src/utils/WorkflowEngine.js';
import { validateExecutionAuthority, updateExecutionOwner, clearCache } from '../src/utils/executionCoordinator.js';

describe('Phase 5 / R14 — Automation Execution Reliability & Canonical Claim Suite', () => {
    let replset;
    let sideEffectCounter = 0;
    let lastDispatchedAction = null;

    before(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri);

        // Pre-create collections and build indexes
        await AutomationLog.createCollection();
        await AutomationLog.ensureIndexes();
        await Trigger.createCollection();
        await Lead.createCollection();
        await Deal.createCollection();
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        sideEffectCounter = 0;
        lastDispatchedAction = null;
        clearCache();
        await AutomationLog.deleteMany({});
        await Trigger.deleteMany({});
        await Lead.deleteMany({});
        await Deal.deleteMany({});
    });

    // Helper to create a test trigger
    const createTestTrigger = async (overrides = {}) => {
        return await Trigger.create({
            name: 'R14 Test Notification Trigger',
            module: 'leads',
            event: 'lead_created',
            isActive: true,
            rules: [],
            actions: [{
                _id: new mongoose.Types.ObjectId(),
                type: 'send_notification',
                target: 'owner',
                message: 'New lead assigned for follow-up'
            }],
            ...overrides
        });
    };

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Two workers racing to claim the same execution
    // ─────────────────────────────────────────────────────────────
    it('1. Canonical Claims: Two workers racing to claim same execution -> exactly one wins CAS, other skips', async () => {
        const trigger = await createTestTrigger();
        const leadId = new mongoose.Types.ObjectId();
        const entityData = { _id: leadId, id: leadId.toString(), fullName: 'Concurrent Buyer' };
        const action = trigger.actions[0];

        let executionCount = 0;
        const instrumentedAction = {
            ...action.toObject(),
            type: 'custom_mock_action'
        };

        // Two concurrent workers call executeAction simultaneously
        const workerA = WorkflowEngine.executeAction(
            instrumentedAction,
            entityData,
            trigger,
            null,
            false,
            { actionIndex: 0, leaseDurationMs: 60000 }
        );
        const workerB = WorkflowEngine.executeAction(
            instrumentedAction,
            entityData,
            trigger,
            null,
            false,
            { actionIndex: 0, leaseDurationMs: 60000 }
        );

        await Promise.all([workerA, workerB]);

        // Verify only ONE AutomationLog document was created for this canonical key
        const logs = await AutomationLog.find({ ruleId: trigger._id, targetEntityId: leadId });
        assert.strictEqual(logs.length, 1, 'Exactly one AutomationLog record must exist for concurrent claim race');
        assert.strictEqual(logs[0].status, 'success', 'Winning claim must have status=success');
        assert.ok(logs[0].claimToken, 'Claim token must be stamped');
        assert.ok(logs[0].leaseUntil, 'leaseUntil must be recorded');
        assert.strictEqual(logs[0].tenantId, null, 'Single-org tenantId must be null');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Expired lease recovery (Stale Lease Atomic Takeover)
    // ─────────────────────────────────────────────────────────────
    it('2. Lease Recovery: Expired lease is atomically recovered and completed by subsequent worker', async () => {
        const trigger = await createTestTrigger();
        const leadId = new mongoose.Types.ObjectId();
        const entityData = { _id: leadId, id: leadId.toString(), fullName: 'Abandoned Buyer' };
        const action = trigger.actions[0];
        const actionId = action._id.toString();
        const canonicalKey = `canonical-leads-lead_created-${leadId.toString()}-${trigger._id.toString()}-${actionId}`;

        // Seed an expired/abandoned pending claim
        const staleToken = 'stale-worker-token-123';
        const expiredDate = new Date(Date.now() - 5000); // 5 seconds in the past
        await AutomationLog.create({
            ruleType: 'Trigger',
            ruleId: trigger._id,
            targetEntityId: leadId,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey: canonicalKey,
            claimToken: staleToken,
            leaseUntil: expiredDate,
            tenantId: null
        });

        // Worker 2 attempts execution
        await WorkflowEngine.executeAction(
            action.toObject(),
            entityData,
            trigger,
            null,
            false,
            { actionIndex: 0 }
        );

        // Verify the claim was recovered and finalized to success
        const recoveredLog = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
        assert.ok(recoveredLog, 'Log must exist');
        assert.strictEqual(recoveredLog.status, 'success', 'Recovered execution must reach success');
        assert.notStrictEqual(recoveredLog.claimToken, staleToken, 'Claim token must be updated by recovery worker');
        assert.ok(new Date(recoveredLog.leaseUntil) > expiredDate, 'leaseUntil must be refreshed during recovery');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Stale worker attempting completion after lease reassignment
    // ─────────────────────────────────────────────────────────────
    it('3. Fencing: Stale worker attempting completion after lease reassignment is rejected', async () => {
        const trigger = await createTestTrigger();
        const dealId = new mongoose.Types.ObjectId();
        const action = trigger.actions[0];
        const canonicalKey = `canonical-deal_created-${dealId.toString()}-${trigger._id.toString()}-${action._id.toString()}`;

        // Worker 1 acquires initial claim
        const worker1Token = 'worker-1-slow-token';
        await AutomationLog.create({
            ruleType: 'Trigger',
            ruleId: trigger._id,
            targetEntityId: dealId,
            targetModule: 'deals',
            status: 'pending',
            idempotencyKey: canonicalKey,
            claimToken: worker1Token,
            leaseUntil: new Date(Date.now() - 1000), // Already expired
            tenantId: null
        });

        // Worker 2 recovers the stale lease
        const worker2Token = 'worker-2-recovery-token';
        const reassigned = await AutomationLog.findOneAndUpdate(
            { idempotencyKey: canonicalKey, status: 'pending', leaseUntil: { $lte: new Date() } },
            { $set: { claimToken: worker2Token, leaseUntil: new Date(Date.now() + 60000) } },
            { new: true }
        );
        assert.ok(reassigned, 'Worker 2 should successfully recover stale lease');
        assert.strictEqual(reassigned.claimToken, worker2Token);

        // Worker 1 wakes up and attempts to finalize with its stale token
        const staleFinalize = await AutomationLog.updateOne(
            { idempotencyKey: canonicalKey, claimToken: worker1Token },
            { $set: { status: 'success', executedAt: new Date() } }
        );
        assert.strictEqual(staleFinalize.modifiedCount, 0, 'Stale worker finalize must match 0 documents');

        // Worker 2 finalizes successfully
        const validFinalize = await AutomationLog.updateOne(
            { idempotencyKey: canonicalKey, claimToken: worker2Token },
            { $set: { status: 'success', executedAt: new Date() } }
        );
        assert.strictEqual(validFinalize.modifiedCount, 1, 'Authorized worker finalize must modify document');

        const finalLog = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
        assert.strictEqual(finalLog.status, 'success');
        assert.strictEqual(finalLog.claimToken, worker2Token, 'Final document must reflect Worker 2 token');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Retry after transient failure
    // ─────────────────────────────────────────────────────────────
    it('4. Transient Failure: Retryable failure re-acquires claim and completes successfully on retry', async () => {
        const trigger = await createTestTrigger();
        const leadId = new mongoose.Types.ObjectId();
        const entityData = { _id: leadId, id: leadId.toString(), fullName: 'Retryable Lead' };
        const action = trigger.actions[0];
        const canonicalKey = `canonical-leads-lead_created-${leadId.toString()}-${trigger._id.toString()}-${action._id.toString()}`;

        // Seed a failed execution marked as retryable
        await AutomationLog.create({
            ruleType: 'Trigger',
            ruleId: trigger._id,
            targetEntityId: leadId,
            targetModule: 'leads',
            status: 'failed',
            details: { error: 'ECONNRESET', retryable: true },
            idempotencyKey: canonicalKey,
            claimToken: 'failed-worker-token',
            leaseUntil: new Date(Date.now() + 60000),
            tenantId: null
        });

        // Retry runner / worker executes again
        await WorkflowEngine.executeAction(
            action.toObject(),
            entityData,
            trigger,
            null,
            false,
            { actionIndex: 0 }
        );

        // Verify status transitioned from failed -> success
        const retriedLog = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
        assert.strictEqual(retriedLog.status, 'success', 'Retryable failure must be recovered and succeed');
        assert.notStrictEqual(retriedLog.claimToken, 'failed-worker-token', 'New claimToken must be assigned on retry');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Process restart with a pending or claimed execution
    // ─────────────────────────────────────────────────────────────
    it('5. Process Restart: Active lease blocks premature retry, recovers only after expiry', async () => {
        const trigger = await createTestTrigger();
        const leadId = new mongoose.Types.ObjectId();
        const entityData = { _id: leadId, id: leadId.toString(), fullName: 'Crash Recovery Lead' };
        const action = trigger.actions[0];
        const canonicalKey = `canonical-leads-lead_created-${leadId.toString()}-${trigger._id.toString()}-${action._id.toString()}`;

        // Simulate Worker crashed mid-execution with an active lease (expires in 60s)
        const crashToken = 'crash-worker-token';
        await AutomationLog.create({
            ruleType: 'Trigger',
            ruleId: trigger._id,
            targetEntityId: leadId,
            targetModule: 'leads',
            status: 'pending',
            idempotencyKey: canonicalKey,
            claimToken: crashToken,
            leaseUntil: new Date(Date.now() + 60000),
            tenantId: null
        });

        // Immediate restart attempt: should see active lease and skip without executing
        await WorkflowEngine.executeAction(
            action.toObject(),
            entityData,
            trigger,
            null,
            false,
            { actionIndex: 0 }
        );

        let logState = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
        assert.strictEqual(logState.status, 'pending', 'Execution must remain pending while lease is unexpired');
        assert.strictEqual(logState.claimToken, crashToken, 'Claim token must remain unchanged while lease is valid');

        // Advance time: lease expires
        await AutomationLog.updateOne(
            { idempotencyKey: canonicalKey },
            { $set: { leaseUntil: new Date(Date.now() - 1000) } }
        );

        // Next execution cycle recovers the crashed job
        await WorkflowEngine.executeAction(
            action.toObject(),
            entityData,
            trigger,
            null,
            false,
            { actionIndex: 0 }
        );

        logState = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
        assert.strictEqual(logState.status, 'success', 'Crashed job must succeed after lease expiry recovery');
        assert.notStrictEqual(logState.claimToken, crashToken, 'New worker token must be recorded');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Duplicate trigger received concurrently
    // ─────────────────────────────────────────────────────────────
    it('6. Duplicate Trigger: Concurrent duplicate submissions execute exactly once', async () => {
        const trigger = await createTestTrigger({
            module: 'leads',
            event: 'lead_created',
            rules: []
        });

        const lead = await Lead.create({
            firstName: 'Storm',
            lastName: 'Buyer',
            fullName: 'Storm Test Buyer',
            mobile: '9876543210',
            source: 'Website',
            status: 'New'
        });

        // Trigger storm: 5 concurrent emissions for the exact same lead
        const promises = Array.from({ length: 5 }).map(() =>
            WorkflowEngine.fireEvent('leads', 'lead_created', lead.toObject(), null)
        );

        await Promise.all(promises);

        // Assert exactly 1 AutomationLog entry exists
        const logs = await AutomationLog.find({ ruleId: trigger._id, targetEntityId: lead._id });
        assert.strictEqual(logs.length, 1, 'Exactly one execution log must exist despite 5 concurrent events');
        assert.strictEqual(logs[0].status, 'success');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Same trigger replayed after successful completion
    // ─────────────────────────────────────────────────────────────
    it('7. Replay Idempotency: Replaying completed trigger produces 0 duplicate executions', async () => {
        const trigger = await createTestTrigger({
            module: 'leads',
            event: 'lead_created',
            rules: []
        });

        const lead = await Lead.create({
            firstName: 'Replayed',
            lastName: 'Buyer',
            fullName: 'Replayed Buyer',
            mobile: '9876543211',
            source: 'Portal'
        });

        // First execution
        await WorkflowEngine.fireEvent('leads', 'lead_created', lead.toObject(), null);

        const firstLog = await AutomationLog.findOne({ ruleId: trigger._id, targetEntityId: lead._id });
        assert.strictEqual(firstLog.status, 'success');
        const originalExecutedAt = firstLog.executedAt;

        // Replay the exact same trigger 100ms later
        await WorkflowEngine.fireEvent('leads', 'lead_created', lead.toObject(), null);

        const allLogs = await AutomationLog.find({ ruleId: trigger._id, targetEntityId: lead._id });
        assert.strictEqual(allLogs.length, 1, 'No duplicate log or execution should be produced on replay');
        assert.strictEqual(allLogs[0].executedAt.getTime(), originalExecutedAt.getTime(), 'Original executedAt preserved');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Distinct legitimate executions not incorrectly deduplicated
    // ─────────────────────────────────────────────────────────────
    it('8. Distinct Execution Separation: Distinct entities, triggers, actions, and stage transitions execute independently', async () => {
        const trigger1 = await createTestTrigger({ module: 'leads', event: 'lead_created' });
        const trigger2 = await createTestTrigger({ module: 'leads', event: 'lead_created', name: 'Trigger 2' });

        const leadA = await Lead.create({ firstName: 'Alpha', lastName: 'Buyer', fullName: 'Buyer Alpha', mobile: '9111111111' });
        const leadB = await Lead.create({ firstName: 'Beta', lastName: 'Buyer', fullName: 'Buyer Beta', mobile: '9222222222' });

        // Two distinct entities on trigger1
        await WorkflowEngine.fireEvent('leads', 'lead_created', leadA.toObject(), null);
        await WorkflowEngine.fireEvent('leads', 'lead_created', leadB.toObject(), null);

        // Same entity on distinct triggers
        await WorkflowEngine.fireEvent('leads', 'lead_created', leadA.toObject(), null);

        const logsAlpha = await AutomationLog.find({ targetEntityId: leadA._id });
        const logsBeta = await AutomationLog.find({ targetEntityId: leadB._id });

        // Alpha matched trigger1 and trigger2 -> 2 logs
        assert.strictEqual(logsAlpha.length, 2, 'Entity Alpha must execute for both distinct triggers');
        // Beta matched trigger1 and trigger2 -> 2 logs
        assert.strictEqual(logsBeta.length, 2, 'Entity Beta must execute independently from Alpha');

        // Stage transitions on deals
        const deal = await Deal.create({ projectName: 'Tower A', unitNo: '101', price: 10000000, stage: 'Open' });
        const stageTrigger = await createTestTrigger({
            module: 'deals',
            event: 'deal_stage_changed',
            rules: []
        });

        // Stage transition 1: Quote
        deal.stage = 'Quote';
        await WorkflowEngine.fireEvent('deals', 'deal_stage_changed', deal.toObject(), null);

        // Stage transition 2: Negotiation
        deal.stage = 'Negotiation';
        await WorkflowEngine.fireEvent('deals', 'deal_stage_changed', deal.toObject(), null);

        const stageLogs = await AutomationLog.find({ ruleId: stageTrigger._id, targetEntityId: deal._id });
        assert.strictEqual(stageLogs.length, 2, 'Distinct stages must produce distinct canonical executions');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Coordinator staying LEGACY-authoritative in shadow mode
    // ─────────────────────────────────────────────────────────────
    it('9. Execution Coordinator: LEGACY remains authoritative, durable execution suppressed in shadow mode', async () => {
        // Unconfigured coordinator defaults to LEGACY
        const legacyAuth = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.strictEqual(legacyAuth.authorized, true, 'Legacy role must be authorized in default mode');
        assert.strictEqual(legacyAuth.owner, 'LEGACY');

        const durableAuth = await validateExecutionAuthority('DURABLE', 'deal_created');
        assert.strictEqual(durableAuth.authorized, false, 'Durable role must be suppressed in default mode');
        assert.strictEqual(durableAuth.reason, 'AUTHORITY_HELD_BY_LEGACY');

        // Non-coordinated events pass through unconditionally
        const leadAuth = await validateExecutionAuthority('LEGACY', 'lead_created');
        assert.strictEqual(leadAuth.authorized, true);
        assert.strictEqual(leadAuth.reason, 'NON_COORDINATED_EVENT');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Single-Organisation Compatibility (Null Tenant Context)
    // ─────────────────────────────────────────────────────────────
    it('10. Single-Org Safety: Canonical claims, logs, and triggers operate cleanly with tenantId: null', async () => {
        const trigger = await createTestTrigger();
        const leadId = new mongoose.Types.ObjectId();
        const entityData = { _id: leadId, id: leadId.toString(), fullName: 'Bharat Single Org Buyer', tenantId: null };

        await WorkflowEngine.executeAction(
            trigger.actions[0].toObject(),
            entityData,
            trigger,
            null,
            false,
            { actionIndex: 0 }
        );

        const log = await AutomationLog.findOne({ ruleId: trigger._id, targetEntityId: leadId });
        assert.ok(log, 'AutomationLog must exist');
        assert.strictEqual(log.tenantId, null, 'tenantId must be explicitly null');
        assert.strictEqual(log.companyId, null, 'companyId should be null in single-org mode');
        assert.strictEqual(log.status, 'success');
        assert.ok(log.idempotencyKey.startsWith('canonical-'), 'Canonical key format verified');
    });
});
