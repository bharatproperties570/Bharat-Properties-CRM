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

import {
    distributeEntity,
    executeDistributionCycle,
    normalizeTriggerEvent,
    evaluateConditions
} from '../src/utils/distributionEngine.js';

describe('Phase 7 — Lead Distribution & Round Robin Concurrency Engine Test Suite', () => {
    let replset;
    let salesRole;
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
            isSystemRole: false
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
});
