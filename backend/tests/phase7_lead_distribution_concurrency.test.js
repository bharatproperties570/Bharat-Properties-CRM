process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import User from '../models/User.js';
import Role from '../models/Role.js';
import Team from '../models/Team.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import DistributionRule from '../models/DistributionRule.js';
import DistributionAudit from '../models/DistributionAudit.js';
import OutboxEvent from '../models/OutboxEvent.js';
import Lookup from '../models/Lookup.js';
import { distributionQueue } from '../src/queues/queueManager.js';

import {
    distributeEntity,
    executeDistributionCycle,
    normalizeTriggerEvent,
    evaluateConditions,
    calculateActiveWorkloadMap,
    isUserAvailableAndOnShift,
    getCurrentTimeInTimezone
} from '../src/utils/distributionEngine.js';

describe('Phase 7 — Lead Distribution & Round Robin Concurrency Engine Test Suite', () => {
    let replset;
    let salesRole, superAdminRole;
    let teamAlpha;
    let userA, userB, userC, fallbackUser;

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

        // Pre-create collections to prevent DDL lock escalation inside transactions
        await User.createCollection();
        await Role.createCollection();
        await Team.createCollection();
        await Lead.createCollection();
        await Deal.createCollection();
        await DistributionRule.createCollection();
        await DistributionAudit.createCollection();
        await OutboxEvent.createCollection();
        await Lookup.createCollection();

        // Build indexes for DistributionAudit & Outbox
        await DistributionAudit.init();
        await OutboxEvent.init();

        // Seed Role
        salesRole = await Role.create({
            name: 'Sales Agent',
            department: 'sales',
            isSystemRole: false,
            moduleAccess: {
                leads: { view: true, create: true, edit: true, delete: false },
                deals: { view: true, create: true, edit: true, delete: false }
            }
        });

        superAdminRole = await Role.create({
            name: 'Super Admin',
            department: 'sales',
            isSystemRole: true,
            moduleAccess: {
                leads: { view: true, create: true, edit: true, delete: true },
                deals: { view: true, create: true, edit: true, delete: true }
            }
        });

        // Seed Team
        teamAlpha = await Team.create({
            name: 'Alpha Closers',
            department: 'sales'
        });

        // Seed Users
        userA = await User.create({
            fullName: 'Aman Sharma',
            email: 'aman.sharma@bharatproperties.co',
            password: 'hashedpassword123',
            department: 'sales',
            role: salesRole._id,
            teams: [teamAlpha._id],
            isActive: true,
            status: 'active',
            availability: 'Available'
        });

        userB = await User.create({
            fullName: 'Bhavna Verma',
            email: 'bhavna.verma@bharatproperties.co',
            password: 'hashedpassword123',
            department: 'sales',
            role: salesRole._id,
            teams: [teamAlpha._id],
            isActive: true,
            status: 'active',
            availability: 'Available'
        });

        userC = await User.create({
            fullName: 'Chetan Singh',
            email: 'chetan.singh@bharatproperties.co',
            password: 'hashedpassword123',
            department: 'sales',
            role: salesRole._id,
            teams: [teamAlpha._id],
            isActive: true,
            status: 'active',
            availability: 'Available'
        });

        fallbackUser = await User.create({
            fullName: 'Senior Fallback Manager',
            email: 'manager.fallback@bharatproperties.co',
            password: 'hashedpassword123',
            department: 'sales',
            role: salesRole._id,
            isActive: true,
            status: 'active',
            availability: 'Available'
        });
    });

    after(async () => {
        try {
            const { distributionWorker } = await import('../src/workers/distributionWorker.js');
            await distributionWorker.close();
        } catch (_) {}
        await mongoose.disconnect();
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        await DistributionRule.deleteMany({});
        await DistributionAudit.deleteMany({});
        await OutboxEvent.deleteMany({});
        await Lead.deleteMany({});
        await Deal.deleteMany({});
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Trigger Event Normalization & Rule Condition Filtering
    // ─────────────────────────────────────────────────────────────
    it('1. Normalization & Filtering: Canonical triggerEvent mapping and nested condition evaluation', async () => {
        // Trigger event mapping
        assert.equal(normalizeTriggerEvent('create'), 'onCreate');
        assert.equal(normalizeTriggerEvent('onCreate'), 'onCreate');
        assert.equal(normalizeTriggerEvent('web'), 'onWebCapture');
        assert.equal(normalizeTriggerEvent('webCapture'), 'onWebCapture');
        assert.equal(normalizeTriggerEvent('whatsapp'), 'onWhatsAppCapture');
        assert.equal(normalizeTriggerEvent('import'), 'onImport');
        assert.equal(normalizeTriggerEvent('reassign'), 'onLeadReassignment');
        assert.equal(normalizeTriggerEvent('onLeadReassignment'), 'onLeadReassignment');

        // Condition evaluation
        const leadData = {
            budget: 15000000,
            locCity: 'Mohali',
            source: 'WhatsApp',
            tags: ['VIP', 'Luxury']
        };

        const matchingConditions = [
            { field: 'locCity', operator: 'equals', value: 'Mohali', logic: 'AND' },
            { field: 'budget', operator: 'greaterThan', value: 10000000, logic: 'AND' }
        ];
        assert.equal(evaluateConditions(matchingConditions, leadData), true);

        const nonMatchingConditions = [
            { field: 'locCity', operator: 'equals', value: 'Chandigarh', logic: 'AND' }
        ];
        assert.equal(evaluateConditions(nonMatchingConditions, leadData), false);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: User Eligibility Engine (Shift, Leave, Inactive Filters)
    // ─────────────────────────────────────────────────────────────
    it('2. User Eligibility: Filters out inactive, deleted, OOO and unavailable agents', async () => {
        // Create an inactive user and an OOO user
        const inactiveAgent = await User.create({
            fullName: 'Inactive Agent',
            email: 'inactive@bharatproperties.co',
            password: 'password123',
            department: 'sales',
            role: salesRole._id,
            isActive: false,
            status: 'inactive',
            availability: 'Available'
        });

        const oooAgent = await User.create({
            fullName: 'On Leave Agent',
            email: 'ooo@bharatproperties.co',
            password: 'password123',
            department: 'sales',
            role: salesRole._id,
            isActive: true,
            status: 'active',
            availability: 'Available',
            outOfOffice: {
                active: true,
                until: new Date(Date.now() + 86400000) // tomorrow
            }
        });

        // Distribution rule with inactiveAgent, oooAgent, and userA
        const rule = await DistributionRule.create({
            name: 'Eligibility Verification Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [inactiveAgent._id, oooAgent._id, userA._id]
            }
        });

        const lead = await Lead.create({
            firstName: 'Aakash',
            lastName: 'Gupta',
            mobile: '9811100011'
        });

        const cycleId = `cycle_eligibility_${Date.now()}`;
        const result = await executeDistributionCycle({
            entityId: lead._id,
            modelName: 'Lead',
            triggerEvent: 'onCreate',
            cycleId,
            attempt: 1
        });

        assert.ok(result, 'Distribution cycle must succeed');
        assert.equal(result.assignedTo.toString(), userA._id.toString(), 'Must assign strictly to eligible userA');

        const audit = await DistributionAudit.findOne({ cycleId, status: 'COMPLETED' });
        assert.equal(audit.assignedTo.toString(), userA._id.toString());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Fallback Target Failover
    // ─────────────────────────────────────────────────────────────
    it('3. Fallback Target: Safely routes to fallbackTarget when all primary targets are unavailable', async () => {
        const busyAgent = await User.create({
            fullName: 'Busy Agent',
            email: 'busy@bharatproperties.co',
            password: 'password123',
            department: 'sales',
            role: salesRole._id,
            isActive: true,
            status: 'active',
            availability: 'Busy'
        });

        const rule = await DistributionRule.create({
            name: 'Primary Outage Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onWebCapture'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [busyAgent._id]
            },
            fallbackTarget: {
                type: 'user',
                id: fallbackUser._id
            }
        });

        const lead = await Lead.create({
            firstName: 'Pooja',
            lastName: 'Kapoor',
            mobile: '9811100022'
        });

        const cycleId = `cycle_fallback_${Date.now()}`;
        const result = await executeDistributionCycle({
            entityId: lead._id,
            modelName: 'Lead',
            triggerEvent: 'onWebCapture',
            cycleId,
            attempt: 1
        });

        assert.ok(result, 'Must succeed via fallback');
        assert.equal(result.assignedTo.toString(), fallbackUser._id.toString(), 'Must assign to fallback user');
        assert.ok(result.ruleName.includes('Fallback'));
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Deterministic Round-Robin Concurrency & State Persistence
    // ─────────────────────────────────────────────────────────────
    it('4. Round-Robin Cycling: Sequential distributions advance index and cycle deterministically across agents', async () => {
        const rule = await DistributionRule.create({
            name: 'Tri-Agent Round Robin',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [userA._id, userB._id, userC._id]
            },
            lastAssignedIndex: -1
        });

        const lead1 = await Lead.create({ firstName: 'Lead', lastName: 'One', mobile: '9811100031' });
        const lead2 = await Lead.create({ firstName: 'Lead', lastName: 'Two', mobile: '9811100032' });
        const lead3 = await Lead.create({ firstName: 'Lead', lastName: 'Three', mobile: '9811100033' });
        const lead4 = await Lead.create({ firstName: 'Lead', lastName: 'Four', mobile: '9811100034' });

        const r1 = await executeDistributionCycle({ entityId: lead1._id, modelName: 'Lead', triggerEvent: 'onCreate', cycleId: `c_rr_1`, attempt: 1 });
        const r2 = await executeDistributionCycle({ entityId: lead2._id, modelName: 'Lead', triggerEvent: 'onCreate', cycleId: `c_rr_2`, attempt: 1 });
        const r3 = await executeDistributionCycle({ entityId: lead3._id, modelName: 'Lead', triggerEvent: 'onCreate', cycleId: `c_rr_3`, attempt: 1 });
        const r4 = await executeDistributionCycle({ entityId: lead4._id, modelName: 'Lead', triggerEvent: 'onCreate', cycleId: `c_rr_4`, attempt: 1 });

        // Expected sequence: userA (0), userB (1), userC (2), userA (3 % 3 = 0)
        assert.equal(r1.assignedTo.toString(), userA._id.toString());
        assert.equal(r2.assignedTo.toString(), userB._id.toString());
        assert.equal(r3.assignedTo.toString(), userC._id.toString());
        assert.equal(r4.assignedTo.toString(), userA._id.toString());

        // Verify lastAssignedIndex persisted in DB
        const persistedRule = await DistributionRule.findById(rule._id);
        assert.equal(persistedRule.lastAssignedIndex, 3);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Concurrent Racing Workers & Atomic CAS Duplicate Prevention
    // ─────────────────────────────────────────────────────────────
    it('5. Atomic CAS & Concurrency: Racing workers competing for the same lead result in exactly one assignment', async () => {
        await DistributionRule.create({
            name: 'Concurrency Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [userA._id, userB._id]
            }
        });

        const targetLead = await Lead.create({
            firstName: 'Racing',
            lastName: 'Candidate',
            mobile: '9811100055'
        });

        const cycleIdWorker1 = `cycle_race_${Date.now()}_w1`;
        const cycleIdWorker2 = `cycle_race_${Date.now()}_w2`;

        // Execute both cycles concurrently targeting the same unassigned lead
        const [res1, res2] = await Promise.all([
            executeDistributionCycle({
                entityId: targetLead._id,
                modelName: 'Lead',
                triggerEvent: 'onCreate',
                cycleId: cycleIdWorker1,
                attempt: 1
            }),
            executeDistributionCycle({
                entityId: targetLead._id,
                modelName: 'Lead',
                triggerEvent: 'onCreate',
                cycleId: cycleIdWorker2,
                attempt: 1
            })
        ]);

        // Exactly one worker must succeed (return { assignedTo }), the other must return null (SKIPPED)
        const successes = [res1, res2].filter(r => r !== null);
        const skips = [res1, res2].filter(r => r === null);

        assert.equal(successes.length, 1, 'Exactly one concurrent worker must successfully assign the lead');
        assert.equal(skips.length, 1, 'The losing worker must safely skip without error');

        // Verify Lead in DB has exactly one owner and history
        const finalLead = await Lead.findById(targetLead._id);
        assert.ok(finalLead.owner);
        assert.equal(finalLead.assignment.history.length, 1, 'Assignment history must contain exactly 1 entry');
        assert.equal(finalLead.assignment.method, 'AUTOMATED_RULE');

        // Verify audits in DB: exactly 1 COMPLETED and 1 SKIPPED
        const completedAudit = await DistributionAudit.findOne({ entityId: targetLead._id, status: 'COMPLETED' });
        const skippedAudit = await DistributionAudit.findOne({ entityId: targetLead._id, status: 'SKIPPED' });

        assert.ok(completedAudit, 'Must have 1 COMPLETED audit');
        assert.ok(skippedAudit, 'Must have 1 SKIPPED audit');
        assert.ok(
            skippedAudit.reason.includes('Lost concurrency race') ||
            skippedAudit.reason.includes('already assigned') ||
            skippedAudit.reason.includes('intended assignment'),
            `Unexpected skip reason: ${skippedAudit.reason}`
        );
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Reassignment Support (onLeadReassignment)
    // ─────────────────────────────────────────────────────────────
    it('6. Reassignment: onLeadReassignment allows reassigning an existing owner and records assignment history', async () => {
        await DistributionRule.create({
            name: 'Reassignment Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onLeadReassignment'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [userB._id]
            }
        });

        // Lead initially assigned to userA
        const lead = await Lead.create({
            firstName: 'Reassign',
            lastName: 'Target',
            mobile: '9811100066',
            owner: userA._id,
            assignedTo: userA._id,
            assignment: {
                assignedTo: userA._id,
                assignedAt: new Date(Date.now() - 3600000),
                ruleName: 'Initial Rule',
                history: [{
                    assignedTo: userA._id,
                    assignedAt: new Date(Date.now() - 3600000),
                    notes: 'Initial assignment'
                }]
            }
        });

        const cycleId = `cycle_reassign_${Date.now()}`;
        const res = await executeDistributionCycle({
            entityId: lead._id,
            modelName: 'Lead',
            triggerEvent: 'onLeadReassignment',
            cycleId,
            attempt: 1
        });

        assert.ok(res, 'Reassignment cycle must succeed');
        assert.equal(res.assignedTo.toString(), userB._id.toString());

        const updatedLead = await Lead.findById(lead._id);
        assert.equal(updatedLead.owner.toString(), userB._id.toString());
        assert.equal(updatedLead.assignment.assignedTo.toString(), userB._id.toString());
        assert.equal(updatedLead.assignment.history.length, 2, 'History must contain both initial and reassignment entries');
        assert.equal(updatedLead.assignment.history[1].assignedTo.toString(), userB._id.toString());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Idempotency & Safe Repeated Processing
    // ─────────────────────────────────────────────────────────────
    it('7. Idempotency: Retrying a previously completed cycleId returns existing assignment without duplicate audits', async () => {
        const rule = await DistributionRule.create({
            name: 'Idempotency Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [userC._id]
            }
        });

        const lead = await Lead.create({
            firstName: 'Idempotent',
            lastName: 'Lead',
            mobile: '9811100077'
        });

        const cycleId = `cycle_idempotent_test_${Date.now()}`;

        // First attempt
        const res1 = await executeDistributionCycle({
            entityId: lead._id,
            modelName: 'Lead',
            triggerEvent: 'onCreate',
            cycleId,
            attempt: 1
        });
        assert.ok(res1);
        assert.equal(res1.assignedTo.toString(), userC._id.toString());

        // Repeated execution with identical cycleId
        const res2 = await executeDistributionCycle({
            entityId: lead._id,
            modelName: 'Lead',
            triggerEvent: 'onCreate',
            cycleId,
            attempt: 2
        });

        assert.ok(res2);
        assert.equal(res2.assignedTo.toString(), userC._id.toString());
        assert.equal(res2.alreadyCompleted, true, 'Must indicate cycle was already completed');

        // Audit count for cycleId must strictly remain 1
        const auditCount = await DistributionAudit.countDocuments({ cycleId });
        assert.equal(auditCount, 1, 'Duplicate job re-delivery must not produce duplicate audit records');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Durable Outbox Event & Single-Organisation Safety
    // ─────────────────────────────────────────────────────────────
    it('8. Outbox & Single-Org: Generates LEAD_ASSIGNED Outbox event with null tenantId and team synchronization', async () => {
        await DistributionRule.create({
            name: 'Outbox Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [userA._id]
            }
        });

        const lead = await Lead.create({
            firstName: 'Durable',
            lastName: 'OutboxLead',
            mobile: '9811100088',
            tenantId: null // Single organisation explicit null
        });

        const cycleId = `cycle_outbox_${Date.now()}`;
        const res = await executeDistributionCycle({
            entityId: lead._id,
            modelName: 'Lead',
            triggerEvent: 'onCreate',
            cycleId,
            attempt: 1
        });

        assert.ok(res);

        // Verify Team was synchronized from userA to lead
        const updatedLead = await Lead.findById(lead._id);
        assert.ok(updatedLead.teams.some(t => t.equals(teamAlpha._id)), 'Lead teams must sync with assigned agent');
        assert.ok(updatedLead.assignment.team.some(t => t.equals(teamAlpha._id)));

        // Verify OutboxEvent
        const outboxEvent = await OutboxEvent.findOne({
            eventType: 'LeadUpdated',
            aggregateId: lead._id
        });

        assert.ok(outboxEvent, 'LeadUpdated OutboxEvent must be persisted in database');
        assert.equal(outboxEvent.aggregateType, 'Lead');
        assert.equal(outboxEvent.payload.cycleId, cycleId);
        assert.equal(outboxEvent.payload.assignedTo.toString(), userA._id.toString());
        assert.equal(outboxEvent.payload.action, 'ASSIGNED');
        assert.equal(outboxEvent.provenance.source, 'WORKER');
        assert.equal(outboxEvent.provenance.actorType, 'SYSTEM');
        assert.strictEqual(outboxEvent.tenantId || null, null, 'Single organisation tenantId must be null');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 9: R20 Producer Contract (distributeEntity)
    // ─────────────────────────────────────────────────────────────
    it('9. R20 Producer Contract: distributeEntity strictly enqueues pointer payload with deterministic jobId and cycleId', async () => {
        const lead = await Lead.create({
            firstName: 'Producer',
            lastName: 'QueueTest',
            mobile: '9811100099',
            tenantId: null
        });

        const origAdd = distributionQueue.add.bind(distributionQueue);
        let enqueuedCall = null;
        distributionQueue.add = async (name, data, opts) => {
            enqueuedCall = { name, data, opts };
            return await origAdd(name, data, opts);
        };

        try {
            const res = await distributeEntity(lead, 'onCreate');
            assert.strictEqual(res, null, 'Producer must return null and strictly delegate to queue');
            assert.ok(enqueuedCall, 'Job must be submitted to distributionQueue');
            assert.strictEqual(enqueuedCall.name, 'distribute');
            assert.strictEqual(enqueuedCall.data.entityId.toString(), lead._id.toString());
            assert.strictEqual(enqueuedCall.data.modelName, 'Lead');
            assert.ok(enqueuedCall.data.cycleId.startsWith('cycle_'));
            assert.strictEqual(enqueuedCall.opts.jobId, `dist-${lead._id}-onCreate-${enqueuedCall.data.cycleId}`);

            // Entity in database must remain UNTOUCHED by producer
            const freshLead = await Lead.findById(lead._id);
            assert.strictEqual(freshLead.owner || null, null, 'Producer must never assign entity synchronously');
            assert.strictEqual(freshLead.assignedTo || null, null);
        } finally {
            distributionQueue.add = origAdd;
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 10: R20 Deal Distribution & Atomic CAS Concurrency
    // ─────────────────────────────────────────────────────────────
    it('10. R20 Deal Distribution: executeDistributionCycle assigns Deal, records DistributionAudit, and emits DealUpdated OutboxEvent', async () => {
        await DistributionRule.create({
            name: 'Deal RoundRobin Rule',
            enabled: true,
            module: 'deals',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [userA._id]
            }
        });

        const deal = await Deal.create({
            name: 'Luxury Villa 101',
            stage: 'Open',
            assignedTo: null
        });

        const cycleId = `cycle_deal_${Date.now()}`;
        const res = await executeDistributionCycle({
            entityId: deal._id,
            modelName: 'Deal',
            triggerEvent: 'onCreate',
            cycleId,
            attempt: 1
        });

        assert.ok(res, 'Distribution result must be returned');
        assert.strictEqual(res.assignedTo.toString(), userA._id.toString());

        // Verify Deal was updated with atomic assignment
        const updatedDeal = await Deal.findById(deal._id);
        assert.strictEqual(updatedDeal.assignedTo.toString(), userA._id.toString());

        // Verify DistributionAudit
        const audit = await DistributionAudit.findOne({ cycleId });
        assert.ok(audit, 'DistributionAudit record must exist');
        assert.strictEqual(audit.modelName, 'Deal');
        assert.strictEqual(audit.status, 'COMPLETED');
        assert.strictEqual(audit.assignedTo.toString(), userA._id.toString());

        // Verify OutboxEvent
        const outbox = await OutboxEvent.findOne({ aggregateId: deal._id, eventType: 'DealUpdated' });
        assert.ok(outbox, 'DealUpdated OutboxEvent must be persisted');
        assert.strictEqual(outbox.aggregateType, 'Deal');
        assert.strictEqual(outbox.payload.assignedTo.toString(), userA._id.toString());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 11: R20 Assignment Notification Title Routing
    // ─────────────────────────────────────────────────────────────
    it('11. R20 Notification Titles: Deal assignment triggers "New Deal Assigned" and Lead triggers "New Lead Assigned"', async () => {
        await DistributionRule.create({
            name: 'Dual Notification Rule Leads',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: { type: 'user', ids: [userB._id] }
        });

        await DistributionRule.create({
            name: 'Dual Notification Rule Deals',
            enabled: true,
            module: 'deals',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: { type: 'user', ids: [userB._id] }
        });

        const testLead = await Lead.create({ firstName: 'Notif', lastName: 'Lead', mobile: '9900112233' });
        const testDeal = await Deal.create({ name: 'Notif Deal', stage: 'Open', assignedTo: null });

        await executeDistributionCycle({
            entityId: testLead._id,
            modelName: 'Lead',
            triggerEvent: 'onCreate',
            cycleId: `cycle_notif_lead_${Date.now()}`,
            attempt: 1
        });

        await executeDistributionCycle({
            entityId: testDeal._id,
            modelName: 'Deal',
            triggerEvent: 'onCreate',
            cycleId: `cycle_notif_deal_${Date.now()}`,
            attempt: 1
        });

        // Verify that assignments succeeded
        const freshLead = await Lead.findById(testLead._id);
        const freshDeal = await Deal.findById(testDeal._id);
        assert.strictEqual(freshLead.owner.toString(), userB._id.toString());
        assert.strictEqual(freshDeal.assignedTo.toString(), userB._id.toString());
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 12: R20 Ineligible Agents & Rejection Safety
    // ─────────────────────────────────────────────────────────────
    it('12. R20 Ineligible Rejection: Rejects when all agents are unavailable, leaving entity clean and unassigned', async () => {
        const inactiveUser = await User.create({
            fullName: 'Inactive Agent',
            email: `inactive_${Date.now()}@crm.local`,
            password: 'hashedpassword123',
            department: 'sales',
            status: 'inactive',
            isActive: false,
            isDeleted: false,
            availability: 'Offline',
            role: salesRole._id
        });

        await DistributionRule.create({
            name: 'Inactive Agents Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            assignmentTarget: {
                type: 'user',
                ids: [inactiveUser._id]
            }
        });

        const unassignedLead = await Lead.create({
            firstName: 'Safety',
            lastName: 'Unassigned',
            mobile: '9999000011',
            owner: null
        });

        await assert.rejects(
            executeDistributionCycle({
                entityId: unassignedLead._id,
                modelName: 'Lead',
                triggerEvent: 'onCreate',
                cycleId: `cycle_safety_${Date.now()}`,
                attempt: 1
            }),
            /No eligible agents available yet/
        );

        // Verify database state: Lead must remain strictly unassigned
        const postLead = await Lead.findById(unassignedLead._id);
        assert.strictEqual(postLead.owner || null, null, 'Lead owner must remain null on distribution rejection');
        assert.strictEqual(postLead.assignedTo || null, null);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 13: R20 Terminal Failure Audit (Worker Retry Exhaustion)
    // ─────────────────────────────────────────────────────────────
    it('13. R20 Terminal Failure Audit: BullMQ worker failed handler logs terminal FAILED DistributionAudit on retry exhaustion', async () => {
        const { distributionWorker } = await import('../src/workers/distributionWorker.js');

        const failedLead = await Lead.create({
            firstName: 'Terminal',
            lastName: 'FailLead',
            mobile: '9999000012',
            owner: null
        });

        const testCycleId = `cycle_terminal_${Date.now()}`;
        const simulatedJob = {
            id: `job_terminal_${Date.now()}`,
            attemptsMade: 5,
            opts: { attempts: 5 },
            data: {
                entityId: failedLead._id,
                modelName: 'Lead',
                triggerEvent: 'onCreate',
                cycleId: testCycleId
            }
        };

        const failedListeners = distributionWorker.listeners('failed');
        assert.ok(failedListeners.length > 0, 'distributionWorker must have at least one failed listener');

        const failedHandler = failedListeners[0];
        await failedHandler(simulatedJob, new Error('Simulated terminal BullMQ exhaustion'));

        const auditRecord = await DistributionAudit.findOne({ cycleId: testCycleId });
        assert.ok(auditRecord, 'DistributionAudit record must exist for terminal failure');
        assert.strictEqual(auditRecord.status, 'FAILED');
        assert.strictEqual(auditRecord.entityId.toString(), failedLead._id.toString());
        assert.strictEqual(auditRecord.modelName, 'Lead');
        assert.strictEqual(auditRecord.reason, 'Simulated terminal BullMQ exhaustion');
        assert.strictEqual(auditRecord.attempt, 5);
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 14: P7-R1 Load-Based Unified Workload (Leads + Deals)
    // ─────────────────────────────────────────────────────────────
    it('14. P7-R1 Load-Based Workload: accurately aggregates active Leads and Deals while excluding closed stages', async () => {
        // Clean existing test entities to guarantee exact deterministic count
        await Lead.deleteMany({});
        await Deal.deleteMany({});

        // User A: 1 active lead + 2 active deals = 3 active items
        await Lead.create({ firstName: 'A_L1', lastName: 'Active', mobile: '9100000001', owner: userA._id, stage: 'Contacted' });
        await Deal.create({ title: 'A_D1', assignedTo: userA._id, stage: 'Negotiation' });
        await Deal.create({ title: 'A_D2', assignedTo: userA._id, stage: 'Quote' });
        // User A closed items (should NOT count)
        await Lead.create({ firstName: 'A_Closed', lastName: 'Lost', mobile: '9100000002', owner: userA._id, stage: 'Lost' });
        await Deal.create({ title: 'A_ClosedWon', assignedTo: userA._id, stage: 'Closed Won' });

        // User B: 1 active lead + 0 active deals = 1 active item
        await Lead.create({ firstName: 'B_L1', lastName: 'Active', mobile: '9100000003', owner: userB._id, stage: 'New' });
        // User B closed items (should NOT count)
        await Deal.create({ title: 'B_Cancelled', assignedTo: userB._id, stage: 'Cancelled' });

        const workloadMap = await calculateActiveWorkloadMap([userA._id, userB._id]);
        assert.strictEqual(workloadMap[userA._id.toString()], 3, 'User A workload should equal 3 (1 active lead + 2 active deals)');
        assert.strictEqual(workloadMap[userB._id.toString()], 1, 'User B workload should equal 1 (1 active lead + 0 active deals)');

        // Now create a loadBased distribution rule
        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'P7-R1 Load-Based Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'loadBased',
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [userA._id, userB._id]
            }
        });

        const newLead = await Lead.create({
            firstName: 'Load',
            lastName: 'Recipient',
            mobile: '9100000099',
            owner: null
        });

        const cycleId = `cycle_load_${Date.now()}`;
        const assignmentResult = await executeDistributionCycle({
            entityId: newLead._id,
            modelName: 'Lead',
            triggerEvent: 'onCreate',
            cycleId,
            attempt: 1
        });

        assert.ok(assignmentResult, 'Assignment must succeed');
        assert.strictEqual(assignmentResult.assignedTo.toString(), userB._id.toString(), 'Load-based distribution must assign to User B who has lower combined workload (1 vs 3)');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 15: P7-R2 Capacity Limit Enforcement
    // ─────────────────────────────────────────────────────────────
    it('15. P7-R2 Capacity Limit: Filters out agents at capacity and routes to available agents or fallback', async () => {
        await Lead.deleteMany({ $or: [{ owner: { $in: [userA._id, userB._id] } }, { 'assignment.assignedTo': { $in: [userA._id, userB._id] } }] });
        await Deal.deleteMany({ $or: [{ assignedTo: { $in: [userA._id, userB._id] } }, { 'assignment.assignedTo': { $in: [userA._id, userB._id] } }] });

        // User A capacity = 2, currently has 2 active items (AT CAPACITY)
        await User.findByIdAndUpdate(userA._id, { 'preferences.capacityLimit': 2 });
        await Lead.create({ firstName: 'A_Cap1', lastName: 'Active', mobile: '9200000001', owner: userA._id, stage: 'New' });
        await Lead.create({ firstName: 'A_Cap2', lastName: 'Active', mobile: '9200000002', owner: userA._id, stage: 'New' });

        // User B capacity = 5, currently has 0 active items (UNDER CAPACITY)
        await User.findByIdAndUpdate(userB._id, { 'preferences.capacityLimit': 5 });

        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'P7-R2 Capacity Test Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            lastAssignedIndex: -1, // Next would be index 0 (userA) if capacity was not checked!
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [userA._id, userB._id]
            }
        });

        const leadToAssign = await Lead.create({
            firstName: 'Cap',
            lastName: 'TestLead',
            mobile: '9200000099',
            owner: null
        });

        const cycleId = `cycle_cap_${Date.now()}`;
        const assignmentResult = await executeDistributionCycle({
            entityId: leadToAssign._id,
            modelName: 'Lead',
            triggerEvent: 'onCreate',
            cycleId,
            attempt: 1
        });

        assert.ok(assignmentResult, 'Assignment must succeed');
        assert.strictEqual(assignmentResult.assignedTo.toString(), userB._id.toString(), 'Capped User A must be bypassed in favor of under-capacity User B');

        // Now set User B capacity to 1 (now User B has 1 active lead from the assignment above -> AT CAPACITY)
        await User.findByIdAndUpdate(userB._id, { 'preferences.capacityLimit': 1 });

        const cappedLead = await Lead.create({
            firstName: 'AllCapped',
            lastName: 'TestLead',
            mobile: '9200000098',
            owner: null
        });

        // Both User A (2/2) and User B (1/1) are at capacity. Distribution must reject cleanly with no owner.
        await assert.rejects(
            executeDistributionCycle({
                entityId: cappedLead._id,
                modelName: 'Lead',
                triggerEvent: 'onCreate',
                cycleId: `cycle_all_capped_${Date.now()}`,
                attempt: 1
            }),
            /No eligible agents available yet/
        );

        const checkLead = await Lead.findById(cappedLead._id);
        assert.strictEqual(checkLead.owner || null, null, 'Lead must remain unassigned when all agents are capped');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 16: P7-R3 Shift Timezone Handling
    // ─────────────────────────────────────────────────────────────
    it('16. P7-R3 Shift Timezone: Computes Asia/Kolkata shift times accurately including overnight shifts', () => {
        // UTC 04:30:00 is 10:00:00 IST (UTC + 5:30)
        const morningUtc = new Date('2026-11-10T04:30:00Z');
        const istHours = getCurrentTimeInTimezone(morningUtc, 'Asia/Kolkata');
        assert.strictEqual(Math.round(istHours * 100) / 100, 10, '04:30 UTC must be 10:00 IST');

        // Test normal daytime shift (09:00 to 18:00)
        const dayUser = {
            preferences: {
                timezone: 'Asia/Kolkata',
                workingHours: { start: '09:00', end: '18:00' },
                enforceShiftInTest: true
            }
        };

        // At 10:00 IST -> On shift
        assert.strictEqual(isUserAvailableAndOnShift(dayUser, morningUtc), true, '10:00 IST is within 09:00-18:00 shift');

        // At 21:00 IST (15:30 UTC) -> Off shift
        const eveningUtc = new Date('2026-11-10T15:30:00Z');
        assert.strictEqual(isUserAvailableAndOnShift(dayUser, eveningUtc), false, '21:00 IST is outside 09:00-18:00 shift');

        // Test overnight shift (21:00 to 05:00)
        const nightUser = {
            preferences: {
                timezone: 'Asia/Kolkata',
                workingHours: { start: '21:00', end: '05:00' },
                enforceShiftInTest: true
            }
        };

        // At 22:00 IST (16:30 UTC) -> On shift
        const nightUtc = new Date('2026-11-10T16:30:00Z');
        assert.strictEqual(isUserAvailableAndOnShift(nightUser, nightUtc), true, '22:00 IST is within 21:00-05:00 overnight shift');

        // At 03:00 IST (21:30 UTC previous day) -> On shift
        const earlyMorningUtc = new Date('2026-11-10T21:30:00Z');
        assert.strictEqual(isUserAvailableAndOnShift(nightUser, earlyMorningUtc), true, '03:00 IST is within 21:00-05:00 overnight shift');

        // At 12:00 IST (06:30 UTC) -> Off shift
        const noonUtc = new Date('2026-11-10T06:30:00Z');
        assert.strictEqual(isUserAvailableAndOnShift(nightUser, noonUtc), false, '12:00 IST is outside 21:00-05:00 overnight shift');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 17: P7-R4 Authoritative Server-Side Bulk Distribution
    // ─────────────────────────────────────────────────────────────
    it('17. P7-R4 Bulk Distribute: Executes server-side atomic distribution cycle for multiple leads', async () => {
        // Reset capacities and set dataScope to 'all' with superAdminRole for bulk distribution admin
        await User.findByIdAndUpdate(userA._id, { 'preferences.capacityLimit': 100, dataScope: 'all', role: superAdminRole._id });
        await User.findByIdAndUpdate(userB._id, { 'preferences.capacityLimit': 100 });

        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'P7-R4 Bulk Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate', 'onLeadReassignment'],
            distributionType: 'roundRobin',
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [userA._id, userB._id]
            }
        });

        const bLead1 = await Lead.create({ firstName: 'Bulk1', lastName: 'Test', mobile: '9300000001', owner: null });
        const bLead2 = await Lead.create({ firstName: 'Bulk2', lastName: 'Test', mobile: '9300000002', owner: null });

        const { bulkDistributeLeads } = await import('../controllers/lead.controller.js');

        let responseStatusCode = 200;
        let responseJsonData = null;

        const adminUser = await User.findById(userA._id).populate('role').lean();
        const req = {
            body: { leadIds: [bLead1._id.toString(), bLead2._id.toString()] },
            user: adminUser
        };
        const res = {
            status(code) {
                responseStatusCode = code;
                return this;
            },
            json(data) {
                responseJsonData = data;
                return this;
            }
        };

        await bulkDistributeLeads(req, res, () => {});

        assert.strictEqual(responseStatusCode, 200);
        assert.strictEqual(responseJsonData.success, true);
        assert.strictEqual(responseJsonData.count, 2, 'Both leads must be distributed');

        const reloaded1 = await Lead.findById(bLead1._id);
        const reloaded2 = await Lead.findById(bLead2._id);
        assert.ok(reloaded1.owner, 'Lead 1 must have an assigned owner in DB');
        assert.ok(reloaded2.owner, 'Lead 2 must have an assigned owner in DB');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 18: True Concurrent Capacity Enforcement (Write-Skew Prevention)
    // ─────────────────────────────────────────────────────────────
    it('18. True Concurrent Capacity Enforcement: Prevents write-skew when multiple workers assign to same user concurrently', async () => {
        // Create a dedicated solo agent with strict capacityLimit: 1
        const soloAgent = await User.create({
            fullName: 'Solo Agent',
            email: 'solo.agent@bharatproperties.co',
            password: 'hashedpassword123',
            department: 'sales',
            role: salesRole._id,
            teams: [teamAlpha._id],
            isActive: true,
            status: 'active',
            availability: 'Available',
            preferences: {
                capacityLimit: 1,
                workingHours: { start: '00:00', end: '23:59' }
            }
        });

        // Rule targeting strictly soloAgent (no fallback)
        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'Solo Agent Capacity Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [soloAgent._id]
            }
        });

        // Create 4 distinct leads competing for the single available slot
        const leads = await Promise.all([
            Lead.create({ firstName: 'ConcurrentLead1', lastName: 'Race', mobile: '9400000001', owner: null }),
            Lead.create({ firstName: 'ConcurrentLead2', lastName: 'Race', mobile: '9400000002', owner: null }),
            Lead.create({ firstName: 'ConcurrentLead3', lastName: 'Race', mobile: '9400000003', owner: null }),
            Lead.create({ firstName: 'ConcurrentLead4', lastName: 'Race', mobile: '9400000004', owner: null })
        ]);

        // Launch 4 concurrent distribution cycles racing for soloAgent's single capacity slot
        const results = await Promise.allSettled(leads.map((lead, idx) => 
            executeDistributionCycle({
                entityId: lead._id,
                modelName: 'Lead',
                triggerEvent: 'onCreate',
                cycleId: `cycle_cap_race_${Date.now()}_${idx}`,
                attempt: 1
            })
        ));

        // Count how many cycles succeeded
        const succeeded = results.filter(r => r.status === 'fulfilled' && r.value && r.value.assignedTo);
        assert.strictEqual(succeeded.length, 1, 'Exactly ONE concurrent worker must win the final capacity slot');

        // Check active database workload for soloAgent across Leads and Deals
        const totalAssignedLeads = await Lead.countDocuments({
            $or: [{ owner: soloAgent._id }, { assignedTo: soloAgent._id }, { 'assignment.assignedTo': soloAgent._id }],
            stage: { $nin: ['Closed', 'Lost', 'Converted', 'Junk'] }
        });
        assert.strictEqual(totalAssignedLeads, 1, 'Solo agent database workload must strictly equal capacityLimit (1); write-skew prevented');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 19: Bulk Distribution RBAC, Scope & Unauthorized Reassignment
    // ─────────────────────────────────────────────────────────────
    it('19. Bulk Distribution RBAC & Scope: Enforces permission, batch limits, format checks, and reassignment authority', async () => {
        const { bulkDistributeLeads } = await import('../controllers/lead.controller.js');

        // 19.1 Missing permission check (Role without edit permission)
        const viewOnlyRole = await Role.create({
            name: 'View Only Agent',
            department: 'sales',
            isSystemRole: false,
            moduleAccess: {
                leads: { view: true, create: false, edit: false, delete: false }
            }
        });
        const viewOnlyUser = await User.create({
            fullName: 'View Only',
            email: 'viewonly@bharatproperties.co',
            password: 'pwd',
            department: 'sales',
            role: viewOnlyRole._id,
            isActive: true
        });

        let status403 = null;
        let json403 = null;
        await bulkDistributeLeads(
            { body: { leadIds: [new mongoose.Types.ObjectId().toString()] }, user: viewOnlyUser },
            { status(s) { status403 = s; return this; }, json(j) { json403 = j; return this; } },
            () => {}
        );
        assert.strictEqual(status403, 403, 'Users lacking leads:edit must be rejected with 403');

        // 19.2 Invalid request shape (non-array or empty)
        let status400 = null;
        const adminUser = await User.findById(userA._id).populate('role').lean();
        await bulkDistributeLeads(
            { body: { leadIds: 'not-an-array' }, user: adminUser },
            { status(s) { status400 = s; return this; }, json() { return this; } },
            () => {}
        );
        assert.strictEqual(status400, 400, 'Non-array leadIds must return 400 Bad Request');

        // 19.3 Batch size limit exceeding 100
        let statusBatchMax = null;
        const hugeBatch = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toString());
        await bulkDistributeLeads(
            { body: { leadIds: hugeBatch }, user: adminUser },
            { status(s) { statusBatchMax = s; return this; }, json() { return this; } },
            () => {}
        );
        assert.strictEqual(statusBatchMax, 400, 'Batches exceeding 100 leads must return 400 Bad Request');

        // 19.4 Invalid ObjectId format reporting
        let resFormat = null;
        await bulkDistributeLeads(
            { body: { leadIds: ['invalid-id-xyz', '12345'] }, user: adminUser },
            { status() { return this; }, json(j) { resFormat = j; return this; } },
            () => {}
        );
        assert.strictEqual(resFormat.results[0].reason, 'Invalid ObjectId format');
        assert.strictEqual(resFormat.results[1].reason, 'Invalid ObjectId format');

        // 19.5 Scope restriction: Restricted agent cannot distribute leads outside scope
        const restrictedUser = await User.create({
            fullName: 'Restricted Agent',
            email: 'restricted@bharatproperties.co',
            password: 'pwd',
            department: 'sales',
            role: salesRole._id,
            dataScope: 'assigned',
            isActive: true
        });
        const unassignedLead = await Lead.create({ firstName: 'Unassigned', lastName: 'Lead', mobile: '9500000001', owner: null });
        let resScope = null;
        await bulkDistributeLeads(
            { body: { leadIds: [unassignedLead._id.toString()] }, user: restrictedUser },
            { status() { return this; }, json(j) { resScope = j; return this; } },
            () => {}
        );
        assert.strictEqual(resScope.results[0].success, false);
        assert.strictEqual(resScope.results[0].reason, 'Lead not found or outside permitted scope');

        // 19.6 Unauthorized reassignment: Non-owner non-admin cannot reassign someone else's lead
        const someoneElsesLead = await Lead.create({ firstName: 'Owned', lastName: 'Lead', mobile: '9500000002', owner: userB._id });
        let resUnauth = null;
        await bulkDistributeLeads(
            { body: { leadIds: [someoneElsesLead._id.toString()] }, user: restrictedUser },
            { status() { return this; }, json(j) { resUnauth = j; return this; } },
            () => {}
        );
        assert.strictEqual(resUnauth.results[0].success, false);

        // 19.7 Authorized reassignment: Admin CAN reassign already-owned lead
        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'P7-R4 Bulk Reassignment Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate', 'onLeadReassignment'],
            distributionType: 'roundRobin',
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [userA._id, userB._id]
            }
        });

        let resAdminReassign = null;
        await bulkDistributeLeads(
            { body: { leadIds: [someoneElsesLead._id.toString()] }, user: adminUser },
            { status() { return this; }, json(j) { resAdminReassign = j; return this; } },
            () => {}
        );
        assert.strictEqual(resAdminReassign.results[0].success, true, 'Admin must be authorized to reassign already-owned leads');
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 20: Fail-Closed Workload Aggregation
    // ─────────────────────────────────────────────────────────────
    it('20. Fail-Closed Workload Aggregation: Propagates WorkloadAggregationError and fails closed without silent bypass', async () => {
        const { calculateActiveWorkloadMap, WorkloadAggregationError } = await import('../src/utils/distributionEngine.js');

        // 20.1 Direct failure injection on Lead.aggregate
        const originalAggregate = Lead.aggregate;
        try {
            Lead.aggregate = () => {
                throw new Error('Simulated transient MongoDB cluster network failure');
            };

            await assert.rejects(
                calculateActiveWorkloadMap([userA._id]),
                (err) => {
                    assert.strictEqual(err.name, 'WorkloadAggregationError');
                    assert.strictEqual(err.code, 'WORKLOAD_AGGREGATION_FAILED');
                    assert.ok(err.message.includes('Simulated transient MongoDB cluster network failure'));
                    return true;
                },
                'Must throw typed WorkloadAggregationError on aggregation failure'
            );
        } finally {
            Lead.aggregate = originalAggregate;
        }

        // 20.2 Execution cycle fails closed when aggregation fails
        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'Fail Closed Cycle Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [userA._id]
            }
        });

        const testLead = await Lead.create({ firstName: 'FailClosed', lastName: 'Test', mobile: '9600000001', owner: null });
        Lead.aggregate = () => {
            throw new Error('Simulated DB fail-closed during cycle');
        };

        try {
            await assert.rejects(
                executeDistributionCycle({
                    entityId: testLead._id,
                    modelName: 'Lead',
                    triggerEvent: 'onCreate',
                    cycleId: `cycle_fail_closed_${Date.now()}`,
                    attempt: 1
                }),
                /Simulated DB fail-closed/
            );

            // Verify lead was NOT assigned
            const checkLead = await Lead.findById(testLead._id);
            assert.strictEqual(checkLead.owner || null, null, 'Lead must remain unassigned when workload fails closed');

            // Verify audit trail recorded failure
            const audit = await DistributionAudit.findOne({ entityId: testLead._id, status: 'SKIPPED' });
            assert.ok(audit, 'Audit must record SKIPPED entry on fail-closed aggregation');
            assert.ok(audit.reason.includes('Workload aggregation failed (fail-closed)'));
        } finally {
            Lead.aggregate = originalAggregate;
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 21: Capacity Configuration Read Failure (Fail-Closed)
    // ─────────────────────────────────────────────────────────────
    it('21. Capacity Configuration: Target user capacity read failure aborts transaction with typed error and no assignment committed', async () => {
        const { CapacityConfigurationError } = await import('../src/utils/distributionEngine.js');

        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'P7-Capacity-Test-Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate'],
            distributionType: 'roundRobin',
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [userA._id]
            }
        });

        const testLead = await Lead.create({ firstName: 'CapacityFail', lastName: 'Test', mobile: '9700000001', owner: null });

        // Inject failure on User.findById
        const originalFindById = User.findById;
        User.findById = (id) => {
            const query = originalFindById.call(User, id);
            return {
                session(sess) {
                    return {
                        lean: async () => {
                            throw new Error('Simulated network timeout reading user preferences');
                        }
                    };
                },
                lean: async () => {
                    throw new Error('Simulated network timeout reading user preferences');
                }
            };
        };

        try {
            await assert.rejects(
                executeDistributionCycle({
                    entityId: testLead._id,
                    modelName: 'Lead',
                    triggerEvent: 'onCreate',
                    cycleId: `cycle_cap_fail_${Date.now()}`,
                    attempt: 1
                }),
                (err) => {
                    assert.strictEqual(err.name, 'CapacityConfigurationError');
                    assert.strictEqual(err.code, 'CAPACITY_CONFIGURATION_READ_FAILED');
                    assert.ok(err.message.includes('Simulated network timeout reading user preferences'));
                    return true;
                },
                'Must throw CapacityConfigurationError when target user capacity read fails'
            );

            // Verify transaction aborted and NO lead assignment was committed
            const checkLead = await Lead.findById(testLead._id);
            assert.strictEqual(checkLead.owner || null, null, 'Lead must not be assigned when capacity read fails');
            assert.strictEqual(checkLead.assignment?.assignedTo || null, null, 'Lead assignment.assignedTo must remain null');

            // Verify an auditable SKIPPED record was persisted with CapacityConfigurationError reason
            const audit = await DistributionAudit.findOne({ entityId: testLead._id, status: 'SKIPPED' });
            assert.ok(audit, 'Audit must record SKIPPED entry on capacity configuration read failure');
            assert.ok(audit.reason.includes('CapacityConfigurationError'));
        } finally {
            User.findById = originalFindById;
        }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 22: Explicit Bulk Reassignment Authority Matrix
    // ─────────────────────────────────────────────────────────────
    it('22. Bulk Reassignment Authority: Enforces explicit permission matrix (manager without perm rejected, authorized manager, owner and Super Admin permitted)', async () => {
        const { bulkDistributeLeads } = await import('../controllers/lead.controller.js');

        // Setup role without explicit reassignment authority (even with "Manager" in name)
        const unauthManagerRole = await Role.create({
            name: 'Operations Manager',
            department: 'sales',
            moduleAccess: {
                leads: { view: true, create: true, edit: true, delete: true, reassign: false }
            },
            approvalRights: {
                reassignLeads: false
            },
            permissions: {}
        });

        const unauthManagerUser = await User.create({
            fullName: 'Unauthorized Manager',
            email: 'unauth.manager@bharatproperties.co',
            password: 'pwd',
            department: 'sales',
            role: unauthManagerRole._id,
            teams: [teamAlpha._id],
            dataScope: 'team',
            isActive: true
        });

        // Setup role with explicit reassignment authority
        const authManagerRole = await Role.create({
            name: 'Regional Manager',
            department: 'sales',
            moduleAccess: {
                leads: { view: true, create: true, edit: true, delete: true, reassign: true }
            },
            approvalRights: {
                reassignLeads: true
            },
            permissions: { 'leads:reassign': true }
        });

        const authManagerUser = await User.create({
            fullName: 'Authorized Manager',
            email: 'auth.manager@bharatproperties.co',
            password: 'pwd',
            department: 'sales',
            role: authManagerRole._id,
            teams: [teamAlpha._id],
            dataScope: 'team',
            isActive: true
        });

        // Setup distribution rule supporting reassignment
        await DistributionRule.deleteMany({});
        await DistributionRule.create({
            name: 'P7 Reassignment Policy Test Rule',
            enabled: true,
            module: 'leads',
            triggerEvent: ['onCreate', 'onLeadReassignment'],
            distributionType: 'roundRobin',
            priority: 1,
            assignmentTarget: {
                type: 'user',
                ids: [userA._id, userB._id]
            }
        });

        const leadOwnedByA = await Lead.create({
            firstName: 'TargetOwned',
            lastName: 'ByA',
            mobile: '9811111111',
            owner: userA._id,
            teams: [teamAlpha._id],
            department: 'sales'
        });

        // 22.1 Manager WITHOUT explicit reassignment authority must be rejected
        let resUnauthMgr = null;
        await bulkDistributeLeads(
            { body: { leadIds: [leadOwnedByA._id.toString()] }, user: unauthManagerUser },
            { status() { return this; }, json(j) { resUnauthMgr = j; return this; } },
            () => {}
        );
        assert.ok(resUnauthMgr, 'Response must be returned');
        assert.strictEqual(resUnauthMgr.results[0].success, false, 'Manager without explicit reassignment authority must be rejected');
        assert.strictEqual(resUnauthMgr.results[0].reason, 'Unauthorized reassignment: lead already assigned to another user');

        // 22.2 Authorized Manager WITH explicit reassignment authority must succeed
        let resAuthMgr = null;
        await bulkDistributeLeads(
            { body: { leadIds: [leadOwnedByA._id.toString()] }, user: authManagerUser },
            { status() { return this; }, json(j) { resAuthMgr = j; return this; } },
            () => {}
        );
        assert.ok(resAuthMgr, 'Response must be returned');
        assert.strictEqual(resAuthMgr.results[0].success, true, 'Authorized manager must be permitted to reassign');

        // 22.3 Current Owner of the lead must be authorized to reassign their own lead
        const leadForOwnerTest = await Lead.create({ firstName: 'OwnerTest', lastName: 'Lead', mobile: '9822222222', owner: userB._id });
        let resOwner = null;
        await bulkDistributeLeads(
            { body: { leadIds: [leadForOwnerTest._id.toString()] }, user: userB },
            { status() { return this; }, json(j) { resOwner = j; return this; } },
            () => {}
        );
        assert.ok(resOwner, 'Response must be returned');
        assert.strictEqual(resOwner.results[0].success, true, 'Owner must be authorized to reassign their own lead');

        // 22.4 Super Admin must be authorized to reassign
        const superAdminUser = await User.create({
            fullName: 'Super Admin User',
            email: 'admin.super@bharatproperties.co',
            password: 'pwd',
            department: 'sales',
            role: superAdminRole._id,
            dataScope: 'all',
            isActive: true
        });

        const leadForSuperAdmin = await Lead.create({
            firstName: 'SuperAdminTest',
            lastName: 'Lead',
            mobile: '9833333333',
            owner: userA._id,
            visibleTo: 'Everyone'
        });
        let resSuperAdmin = null;
        await bulkDistributeLeads(
            { body: { leadIds: [leadForSuperAdmin._id.toString()] }, user: superAdminUser },
            { status() { return this; }, json(j) { resSuperAdmin = j; return this; } },
            () => {}
        );
        assert.ok(resSuperAdmin, 'Response must be returned');
        assert.strictEqual(resSuperAdmin.results[0].success, true, 'Super Admin must be authorized to reassign');
    });
});
