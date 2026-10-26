process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Sequence from '../models/Sequence.js';
import SequenceEnrollment from '../models/SequenceEnrollment.js';
import OutboxEvent from '../models/OutboxEvent.js';
import AutomationLog from '../models/AutomationLog.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Activity from '../models/Activity.js';
import { SequenceEngine } from '../src/utils/SequenceEngine.js';
import { SequenceCronService } from '../services/SequenceCronService.js';
import NurtureBot from '../services/NurtureBot.js';
import { validateExecutionAuthority, clearCache } from '../src/utils/executionCoordinator.js';

describe('Phase 6 — Sequences & Nurture Reliability Test Suite', () => {
    let replset;

    before(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        await mongoose.connect(uri);

        // Pre-create collections and build indexes
        await Sequence.createCollection();
        await SequenceEnrollment.createCollection();
        await SequenceEnrollment.ensureIndexes();
        await OutboxEvent.createCollection();
        await OutboxEvent.ensureIndexes();
        await AutomationLog.createCollection();
        await AutomationLog.ensureIndexes();
        await Lead.createCollection();
        await Deal.createCollection();
        await Activity.createCollection();
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        clearCache();
        await Sequence.deleteMany({});
        await SequenceEnrollment.deleteMany({});
        await OutboxEvent.deleteMany({});
        await AutomationLog.deleteMany({});
        await Lead.deleteMany({});
        await Deal.deleteMany({});
        await Activity.deleteMany({});
    });

    const createTestSequence = async (overrides = {}) => {
        return await Sequence.create({
            name: 'Phase 6 Test Sequence',
            module: 'leads',
            isActive: true,
            targetAudience: {
                module: 'leads',
                conditions: { operator: 'AND', rules: [] }
            },
            steps: [
                {
                    stepNumber: 1,
                    delay: { amount: 0, unit: 'minutes' },
                    action: {
                        type: 'create_task',
                        instruction: 'Welcome call task'
                    }
                },
                {
                    stepNumber: 2,
                    delay: { amount: 2, unit: 'days' },
                    action: {
                        type: 'create_task',
                        instruction: 'Follow-up email task'
                    }
                }
            ],
            ...overrides
        });
    };

    const createTestLead = async (overrides = {}) => {
        return await Lead.create({
            firstName: 'Rahul',
            lastName: 'Sharma',
            mobile: '9876543210',
            email: 'rahul.sharma@example.com',
            stage: 'New',
            ...overrides
        });
    };

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Concurrent duplicate enrollment prevention
    // ─────────────────────────────────────────────────────────────
    it('1. Concurrent Enrollment Deduplication: Racing workers -> exactly one active enrollment created, deterministic responses', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        // Simulate two racing enrollment requests simultaneously
        const [workerA, workerB] = await Promise.all([
            SequenceEngine.enroll(seq, lead, 'leads', null),
            SequenceEngine.enroll(seq, lead, 'leads', null)
        ]);

        // Exactly one should have enrolled: true, the other alreadyEnrolled: true
        const enrollments = await SequenceEnrollment.find({ sequenceId: seq._id, entityId: lead._id });
        assert.strictEqual(enrollments.length, 1, 'Exactly one SequenceEnrollment record must exist');
        assert.strictEqual(enrollments[0].status, 'active');

        // Both workers got successful, deterministic outcome
        assert.strictEqual(workerA.success, true);
        assert.strictEqual(workerB.success, true);
        const hasEnrolledFlag = (workerA.enrolled && !workerB.enrolled) || (!workerA.enrolled && workerB.enrolled);
        assert.ok(hasEnrolledFlag, 'One worker reports enrolled: true, the other enrolled: false');
        const hasAlreadyEnrolledFlag = workerA.alreadyEnrolled || workerB.alreadyEnrolled;
        assert.ok(hasAlreadyEnrolledFlag, 'At least one worker reports alreadyEnrolled: true');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Repeated enrollment request
    // ─────────────────────────────────────────────────────────────
    it('2. Repeated Enrollment Request: Deterministic response, returns existing enrollment without duplicate side effects', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        // First enrollment
        const first = await SequenceEngine.enroll(seq, lead, 'leads', null);
        assert.strictEqual(first.success, true);
        assert.strictEqual(first.enrolled, true);

        const initialOutboxCount = await OutboxEvent.countDocuments({ aggregateId: lead._id });
        assert.strictEqual(initialOutboxCount, 1, 'Initial Outbox event created');

        // Second duplicate request
        const second = await SequenceEngine.enroll(seq, lead, 'leads', null);
        assert.strictEqual(second.success, true);
        assert.strictEqual(second.enrolled, false);
        assert.strictEqual(second.alreadyEnrolled, true);
        assert.strictEqual(second.enrollment._id.toString(), first.enrollment._id.toString());

        // Verify no duplicate enrollment or duplicate OutboxEvent created
        const allEnrollments = await SequenceEnrollment.find({ sequenceId: seq._id, entityId: lead._id });
        assert.strictEqual(allEnrollments.length, 1);
        const finalOutboxCount = await OutboxEvent.countDocuments({ aggregateId: lead._id });
        assert.strictEqual(finalOutboxCount, 1, 'No duplicate OutboxEvent created on repeated submission');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Legitimate re-enrollment after sequence completion or exit
    // ─────────────────────────────────────────────────────────────
    it('3. Legitimate Re-enrollment: Allowed after previous enrollment has completed or exited', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        // First enrollment
        const first = await SequenceEngine.enroll(seq, lead, 'leads', null);
        assert.strictEqual(first.enrolled, true);

        // Mark the first enrollment as completed
        await SequenceEnrollment.findByIdAndUpdate(first.enrollment._id, {
            $set: { status: 'completed' }
        });

        // Re-enroll the same lead in the same sequence
        const second = await SequenceEngine.enroll(seq, lead, 'leads', null);
        assert.strictEqual(second.success, true);
        assert.strictEqual(second.enrolled, true, 'Legitimate re-enrollment must succeed after completion');
        assert.strictEqual(second.alreadyEnrolled, false);

        // Verify there are now two enrollments: one completed, one active
        const records = await SequenceEnrollment.find({ sequenceId: seq._id, entityId: lead._id }).sort({ createdAt: 1 });
        assert.strictEqual(records.length, 2);
        assert.strictEqual(records[0].status, 'completed');
        assert.strictEqual(records[1].status, 'active');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Sequence step ordering and delay calculation
    // ─────────────────────────────────────────────────────────────
    it('4. Schedule & Delay Correctness: Respects step order and accurate time offset calculations', async () => {
        const now = new Date('2026-10-26T12:00:00.000Z');

        // Test minutes
        const t1 = SequenceEngine.calculateNextExecutionTime(now, 30, 'minutes');
        assert.strictEqual(t1.getTime() - now.getTime(), 30 * 60 * 1000);

        // Test hours
        const t2 = SequenceEngine.calculateNextExecutionTime(now, 5, 'hours');
        assert.strictEqual(t2.getTime() - now.getTime(), 5 * 60 * 60 * 1000);

        // Test days
        const t3 = SequenceEngine.calculateNextExecutionTime(now, 3, 'days');
        const expectedDays = new Date(now);
        expectedDays.setDate(expectedDays.getDate() + 3);
        assert.strictEqual(t3.getTime(), expectedDays.getTime());

        // Test weeks
        const t4 = SequenceEngine.calculateNextExecutionTime(now, 2, 'weeks');
        const expectedWeeks = new Date(now);
        expectedWeeks.setDate(expectedWeeks.getDate() + 14);
        assert.strictEqual(t4.getTime(), expectedWeeks.getTime());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Invalid, negative, or excessive delay values handled defensively
    // ─────────────────────────────────────────────────────────────
    it('5. Defensive Delay Handling: Negative or invalid defaults to 0; excessive delays capped at 365 days', async () => {
        const now = new Date('2026-10-26T12:00:00.000Z');

        // Negative delay -> defaults to 0 (no backward schedule reset)
        const tNeg = SequenceEngine.calculateNextExecutionTime(now, -10, 'days');
        assert.strictEqual(tNeg.getTime(), now.getTime(), 'Negative delay must not schedule in the past');

        // Non-numeric / NaN delay -> defaults to 0
        const tNaN = SequenceEngine.calculateNextExecutionTime(now, 'not_a_number', 'days');
        assert.strictEqual(tNaN.getTime(), now.getTime(), 'Invalid delay must default to 0');

        // Excessive delay (e.g. 5000 days) -> capped at 365 days
        const tExcessive = SequenceEngine.calculateNextExecutionTime(now, 5000, 'days');
        const expectedMax = new Date(now);
        expectedMax.setDate(expectedMax.getDate() + 365);
        assert.strictEqual(tExcessive.getTime(), expectedMax.getTime(), 'Excessive delay must be capped at 365 days');

        // Excessive hours (e.g. 100,000 hours) -> capped at 365 days
        const tExcessiveHours = SequenceEngine.calculateNextExecutionTime(now, 100000, 'hours');
        const expectedMaxHours = new Date(now);
        expectedMaxHours.setHours(expectedMaxHours.getHours() + (365 * 24));
        assert.strictEqual(tExcessiveHours.getTime(), expectedMaxHours.getTime(), 'Excessive hours must be capped');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Worker restart and abandoned-job recovery via SequenceCronService
    // ─────────────────────────────────────────────────────────────
    it('6. Worker Recovery: Abandoned sequence steps recovered safely by SequenceCronService', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        // Create an enrollment that was scheduled in the past (overdue), simulating crashed worker
        const pastDate = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago
        const enrollment = await SequenceEnrollment.create({
            sequenceId: seq._id,
            entityId: lead._id,
            module: 'leads',
            status: 'active',
            currentStepNumber: 1,
            nextExecutionAt: pastDate,
            claimToken: null,
            leaseUntil: null
        });

        // Run recovery loop
        const recoveryResult = await SequenceCronService.processSequences();
        assert.strictEqual(recoveryResult.processedCount, 1, 'Overdue enrollment must be picked up');

        // Verify the step was executed and enrollment advanced to step 2
        const updated = await SequenceEnrollment.findById(enrollment._id);
        assert.strictEqual(updated.currentStepNumber, 2, 'Must advance to step 2');
        assert.strictEqual(updated.executionLogs.length, 1);
        assert.strictEqual(updated.executionLogs[0].status, 'success');
        assert.strictEqual(updated.claimToken, null, 'Claim token cleared after completion');
        assert.strictEqual(updated.leaseUntil, null, 'Lease cleared after completion');

        // Verify task was created
        const tasks = await Activity.find({ entityId: lead._id });
        assert.strictEqual(tasks.length, 1, 'Task must be created by step 1');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Stale claim fencing (superseded worker cannot complete step)
    // ─────────────────────────────────────────────────────────────
    it('7. Stale Claim Fencing: Superseded worker cannot complete step or regress state after lease expires', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        const enrollment = await SequenceEnrollment.create({
            sequenceId: seq._id,
            entityId: lead._id,
            module: 'leads',
            status: 'active',
            currentStepNumber: 1,
            nextExecutionAt: new Date(),
            claimToken: 'stale-worker-token-A',
            leaseUntil: new Date(Date.now() - 1000) // Expired lease
        });

        // Worker B claims the step because Worker A's lease is expired
        const workerBRes = await SequenceEngine.executeNextStep(enrollment._id, 1, {
            claimToken: 'worker-token-B',
            leaseDurationMs: 60000
        });
        assert.strictEqual(workerBRes.success, true);

        // Verify enrollment is now at step 2
        const afterWorkerB = await SequenceEnrollment.findById(enrollment._id);
        assert.strictEqual(afterWorkerB.currentStepNumber, 2);

        // Now Worker A (which paused/hung) attempts to complete step 1 with its stale claim token
        const staleAttempt = await SequenceEnrollment.findOneAndUpdate(
            {
                _id: enrollment._id,
                status: 'active',
                currentStepNumber: 1,
                claimToken: 'stale-worker-token-A'
            },
            {
                $set: { currentStepNumber: 2, claimToken: null }
            },
            { new: true }
        );

        assert.strictEqual(staleAttempt, null, 'Stale worker A must be fenced off and findOneAndUpdate must return null');

        // Confirm step 2 was not regressed or corrupted
        const finalDoc = await SequenceEnrollment.findById(enrollment._id);
        assert.strictEqual(finalDoc.currentStepNumber, 2);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Retry after transient failure
    // ─────────────────────────────────────────────────────────────
    it('8. Transient Failure & Retry: Failed step marks retryable log and succeeds upon subsequent execution', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        const enrollment = await SequenceEnrollment.create({
            sequenceId: seq._id,
            entityId: lead._id,
            module: 'leads',
            status: 'active',
            currentStepNumber: 1,
            nextExecutionAt: new Date()
        });

        const canonicalKey = `canonical-seq-${enrollment._id}-1-create_task`;

        // Seed a failed AutomationLog marked as retryable (simulating previous transient network error)
        await AutomationLog.create({
            ruleType: 'Sequence',
            ruleId: seq._id,
            targetEntityId: lead._id,
            targetModule: 'leads',
            status: 'failed',
            idempotencyKey: canonicalKey,
            claimToken: 'failed-attempt-token',
            leaseUntil: new Date(Date.now() - 5000),
            details: { retryable: true },
            error: 'Simulated Network Timeout'
        });

        // Worker executes next step (retry)
        const retryRes = await SequenceEngine.executeNextStep(enrollment._id, 1);
        assert.strictEqual(retryRes.success, true);
        assert.strictEqual(retryRes.actionStatus, 'success');

        // Verify AutomationLog updated to success
        const log = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
        assert.strictEqual(log.status, 'success');

        // Verify task created
        const tasks = await Activity.find({ entityId: lead._id });
        assert.strictEqual(tasks.length, 1);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Duplicate dispatch prevention across retries
    // ─────────────────────────────────────────────────────────────
    it('9. Duplicate Dispatch Prevention: Completed step does not duplicate side effects if re-invoked', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        const enrollment = await SequenceEnrollment.create({
            sequenceId: seq._id,
            entityId: lead._id,
            module: 'leads',
            status: 'active',
            currentStepNumber: 1,
            nextExecutionAt: new Date()
        });

        // First execution creates the task
        const res1 = await SequenceEngine.executeNextStep(enrollment._id, 1);
        assert.strictEqual(res1.success, true);

        const initialTasks = await Activity.find({ entityId: lead._id });
        assert.strictEqual(initialTasks.length, 1, 'First execution creates exactly 1 task');

        // Simulate re-invoking step 1 (e.g. duplicate queue delivery with step 1)
        // Reset currentStepNumber to 1 to simulate duplicate queue message
        await SequenceEnrollment.findByIdAndUpdate(enrollment._id, { $set: { currentStepNumber: 1 } });
        const res2 = await SequenceEngine.executeNextStep(enrollment._id, 1);

        // Side effect must not be repeated because canonical AutomationLog is already 'success'
        const finalTasks = await Activity.find({ entityId: lead._id });
        assert.strictEqual(finalTasks.length, 1, 'No duplicate task created on repeated step delivery');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Outbox intent creation (TimeTriggerExecutionRequested) and linkage
    // ─────────────────────────────────────────────────────────────
    it('10. Outbox Intent Linkage: Creates TimeTriggerExecutionRequested intent in PENDING state with canonical payload', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead();

        const enrollRes = await SequenceEngine.enroll(seq, lead, 'leads', null);
        assert.strictEqual(enrollRes.enrolled, true);

        // Verify Outbox Event created
        const outboxEvent = await OutboxEvent.findOne({
            eventType: 'TimeTriggerExecutionRequested',
            aggregateId: lead._id
        });

        assert.ok(outboxEvent, 'Outbox event must exist');
        assert.strictEqual(outboxEvent.status, 'PENDING');
        assert.strictEqual(outboxEvent.aggregateType, 'Lead');
        assert.strictEqual(outboxEvent.payload.sequenceId.toString(), seq._id.toString());
        assert.strictEqual(outboxEvent.payload.stepNumber, 1);
        assert.strictEqual(outboxEvent.payload.enrollmentId.toString(), enrollRes.enrollment._id.toString());
        assert.strictEqual(outboxEvent.payload.canonicalKey, `canonical-seq-${enrollRes.enrollment._id}-1`);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Legacy-authoritative shadow-mode behavior
    // ─────────────────────────────────────────────────────────────
    it('11. Execution Authority: LEGACY remains authoritative; shadow-mode suppresses durable dispatch', async () => {
        const authority = await validateExecutionAuthority('LEGACY', 'deal_created');
        assert.strictEqual(authority.authorized, true);
        assert.strictEqual(authority.owner, 'LEGACY');

        // Confirm non-authoritative worker check fails safely
        const shadowAuthority = await validateExecutionAuthority('SHADOW_OUTBOX', 'deal_created');
        assert.strictEqual(shadowAuthority.authorized, false, 'Shadow worker must be suppressed while LEGACY is authoritative');
        assert.strictEqual(shadowAuthority.owner, 'LEGACY');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 12: Single-organisation execution safety
    // ─────────────────────────────────────────────────────────────
    it('12. Single-Organisation Safety: Executes cleanly without tenant mapping or tenantId requirement', async () => {
        const seq = await createTestSequence();
        const lead = await createTestLead({ tenantId: null, companyId: null });

        // Enroll without tenant context
        const res = await SequenceEngine.enroll(seq, lead, 'leads', null);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.enrolled, true);

        const enrollment = await SequenceEnrollment.findById(res.enrollment._id);
        assert.ok(enrollment);
        assert.strictEqual(enrollment.status, 'active');

        // Step execution without tenant
        const stepRes = await SequenceEngine.executeNextStep(enrollment._id, 1);
        assert.strictEqual(stepRes.success, true);

        // Outbox event without tenant
        const outbox = await OutboxEvent.findOne({ aggregateId: lead._id });
        assert.ok(outbox);
        assert.strictEqual(outbox.tenantId, null);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 13: NurtureBot Concurrency Safety
    // ─────────────────────────────────────────────────────────────
    it('13. NurtureBot Atomic CAS: Duplicate initiate skips welcome dispatch; state advances atomically', async () => {
        const lead = await createTestLead({ 'customFields.nurtureState': null });

        // Concurrent initiate calls
        await Promise.all([
            NurtureBot.initiate(lead),
            NurtureBot.initiate(lead)
        ]);

        const updatedLead = await Lead.findById(lead._id);
        assert.strictEqual(updatedLead.customFields.nurtureState, 'LEAD_CREATED');

        // Test atomic advanceState
        await NurtureBot._advanceState(updatedLead);
        const advancedLead = await Lead.findById(lead._id);
        assert.strictEqual(advancedLead.customFields.nurtureState, 'WA_SENT');
    });
});
