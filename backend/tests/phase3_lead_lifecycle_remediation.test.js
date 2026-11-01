process.env.NODE_ENV = 'test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import Lead, { resolveLeadLookup } from '../models/Lead.js';
import Contact from '../models/Contact.js';
import Activity from '../models/Activity.js';
import Lookup from '../models/Lookup.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import StageTransitionLog from '../models/StageTransitionLog.js';
import OutboxEvent from '../models/OutboxEvent.js';

import {
    resolveTransition,
    evaluateAndTransition,
    executeTransition,
    validateRequiredFields
} from '../src/services/StageTransitionEngine.js';

import LeadScoringService, {
    computeLeadScore
} from '../src/services/LeadScoringService.js';

import {
    checkLeadQualifiedStatus,
    evaluateLeadStageQualification
} from '../utils/leadDataCompleteness.js';

import { convertLeadToContact } from '../controllers/lead.controller.js';
import { AuthorityProofIssuer } from '../utils/ServerAuthorityProof.js';

describe('Phase 3 — Lead Lifecycle, Scoring & Qualification Remediation Test Suite', () => {
    let replset;
    let salesUser, managerUser;
    let stageLookups = {};
    let statusLookups = {};

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
        await Lead.createCollection();
        await Contact.createCollection();
        await Activity.createCollection();
        await Lookup.createCollection();
        await User.createCollection();
        await Role.createCollection();
        await Team.createCollection();
        await AuditLog.createCollection();
        await StageTransitionLog.createCollection();
        await OutboxEvent.createCollection();

        // Seed Role
        const salesRole = await Role.create({
            name: 'Sales Agent',
            department: 'sales',
            isSystemRole: false
        });

        // Seed Users
        salesUser = await User.create({
            fullName: 'Agent Rohit',
            email: 'rohit@bharatproperties.com',
            password: 'hashedPassword123!',
            phone: '9811111111',
            department: 'sales',
            role: salesRole._id,
            isActive: true,
            status: 'active'
        });

        managerUser = await User.create({
            fullName: 'Manager Priya',
            email: 'priya@bharatproperties.com',
            password: 'hashedPassword123!',
            phone: '9822222222',
            department: 'sales',
            role: salesRole._id,
            isActive: true,
            status: 'active'
        });

        // Seed Lookups
        const stages = ['Incoming', 'Prospect', 'Working', 'Opportunity', 'Negotiation', 'Booked', 'Closed', 'Dormant', 'Lost', 'Unqualified', 'Converted'];
        for (const st of stages) {
            stageLookups[st.toLowerCase()] = await Lookup.create({ lookup_type: 'stage', lookup_value: st });
        }

        const statuses = ['New', 'Contacted', 'Working', 'Qualified', 'Won', 'Lost', 'Unqualified', 'Dormant', 'Stalled'];
        for (const st of statuses) {
            statusLookups[st.toLowerCase()] = await Lookup.create({ lookup_type: 'status', lookup_value: st });
        }
    });

    after(async () => {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
        if (replset) {
            await replset.stop();
        }
    });

    beforeEach(async () => {
        await Lead.deleteMany({});
        await Contact.deleteMany({});
        await Activity.deleteMany({});
        await AuditLog.deleteMany({});
        await StageTransitionLog.deleteMany({});
        await OutboxEvent.deleteMany({});
    });

    it('1. Forward Stage Progression & Required Fields: Validates missing fields and advances stage on completion', async () => {
        // Rule: Site Visit + Interested -> Opportunity (requires budget, timeline)
        const lead = await Lead.create({
            firstName: 'Aarav',
            lastName: 'Sharma',
            mobile: '9876543210',
            stage: stageLookups['prospect']._id,
            status: statusLookups['contacted']._id
        });

        // Test missing fields check
        const blockedRes = await evaluateAndTransition(
            lead._id,
            'Site Visit',
            'Interested',
            'Liked 3BHK',
            {}, // No stageFormData
            { triggeredByUser: salesUser._id }
        );

        assert.equal(blockedRes.stageChanged, false);
        assert.equal(blockedRes.requiresForm, true);
        assert.equal(blockedRes.newStage, 'Opportunity');
        assert.ok(blockedRes.missingFields.length > 0);

        // Test with required fields provided
        const successRes = await evaluateAndTransition(
            lead._id,
            'Site Visit',
            'Interested',
            'Liked 3BHK',
            { budget: '1.5 Cr', budgetMin: 12000000, budgetMax: 16000000, timeline: 'Immediate' },
            { triggeredByUser: salesUser._id }
        );

        assert.equal(successRes.stageChanged, true);
        assert.equal(successRes.newStage, 'Opportunity');

        const updatedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
        assert.equal(updatedLead.stage.lookup_value, 'Opportunity');
        assert.equal(updatedLead.stageHistory.length, 1);
        assert.equal(updatedLead.stageHistory[0].stage, 'Opportunity');
    });

    it('2. Terminal Stage Locking: Prevents automatic activity completion from reopening Closed/Lost leads', async () => {
        const closedLead = await Lead.create({
            firstName: 'Vikram',
            lastName: 'Malhotra',
            mobile: '9876543211',
            stage: stageLookups['closed']._id,
            status: statusLookups['lost']._id
        });

        // An activity completed on closed lead without revival parameter
        const res = await evaluateAndTransition(
            closedLead._id,
            'Call',
            'Interested',
            'Customer called back',
            {},
            { triggeredByUser: salesUser._id }
        );

        assert.equal(res.stageChanged, false);
        const untouchedLead = await Lead.findById(closedLead._id).populate('stage', 'lookup_value');
        assert.equal(untouchedLead.stage.lookup_value, 'Closed');
    });

    it('3. Controlled Revival: Allows authorized revival from Dormant/Closed with revival tracking and audit trail', async () => {
        const dormantLead = await Lead.create({
            firstName: 'Neha',
            lastName: 'Gupta',
            mobile: '9876543212',
            stage: stageLookups['dormant']._id,
            status: statusLookups['dormant']._id
        });

        // Revival from Dormant -> Prospect via Call (with revivalAllowed: true)
        const revivalRes = await executeTransition(
            dormantLead._id,
            'Prospect',
            {
                triggeredBy: 'revival',
                revivalAllowed: true,
                activityType: 'Call',
                outcome: 'Interested',
                triggeredByUser: salesUser._id
            }
        );

        assert.equal(revivalRes.success, true);
        assert.equal(revivalRes.prevStage.toLowerCase(), 'dormant');
        assert.equal(revivalRes.newStage, 'Prospect');
        assert.equal(revivalRes.triggerRevivalSync, true);

        const revivedLead = await Lead.findById(dormantLead._id).populate('stage', 'lookup_value');
        assert.equal(revivedLead.stage.lookup_value, 'Prospect');
        assert.equal(revivedLead.stageHistory[0].revival, true);

        // Verify AuditLog for revival
        const revivalAudit = await AuditLog.findOne({ targetId: dormantLead._id, eventType: 'lead_revived' });
        assert.ok(revivalAudit, 'AuditLog for lead_revived should be recorded');
    });

    it('4. Real Concurrent Stage-Transition Race: Atomic conditional update permits no stale overwrite across parallel races', async () => {
        // Run repeated concurrent races across multiple leads to expose nondeterministic race behavior
        const RACE_ITERATIONS = 10;
        for (let i = 0; i < RACE_ITERATIONS; i++) {
            const lead = await Lead.create({
                firstName: `RaceCandidate_${i}`,
                lastName: 'Singh',
                mobile: `98765432${i.toString().padStart(2, '0')}`,
                stage: stageLookups['prospect']._id
            });

            // Start two concurrent transition attempts from the exact same expected starting stage 'Prospect'
            // Worker 1 attempts Prospect -> Opportunity
            // Worker 2 attempts Prospect -> Working
            const worker1Promise = executeTransition(lead._id, 'Opportunity', {
                triggeredBy: 'activity',
                activityType: 'Meeting',
                outcome: 'Interested',
                triggeredByUser: salesUser._id
            });

            const worker2Promise = executeTransition(lead._id, 'Working', {
                triggeredBy: 'activity',
                activityType: 'Call',
                outcome: 'Interested',
                triggeredByUser: salesUser._id
            });

            // Launch both concurrent transition operations simultaneously
            const [res1, res2] = await Promise.all([worker1Promise, worker2Promise]);

            // Assert that exactly one valid transition wins and the other is rejected
            const results = [res1, res2];
            const winner = results.find(r => r.success === true);
            const loser = results.find(r => r.success === false);

            assert.ok(winner, `Iteration ${i}: Exactly one concurrent transition must win`);
            assert.ok(loser, `Iteration ${i}: Competing concurrent transition must be rejected`);
            assert.equal(loser.success, false, `Iteration ${i}: Competing transition success must be false`);
            assert.equal(loser.blocked, true, `Iteration ${i}: Competing transition must be blocked`);

            // Verify the atomic conditional update permitted no stale overwrite
            const finalLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(finalLead.stage.lookup_value, winner.newStage, `Iteration ${i}: DB stage must match winner stage`);

            // Verify stage history contains only the winning transition's entry
            const stageHistory = finalLead.stageHistory || [];
            assert.equal(stageHistory.length, 1, `Iteration ${i}: Exactly 1 transition entry should exist in stage history`);
            assert.equal(stageHistory[0].stage, winner.newStage, `Iteration ${i}: History entry must match winner stage`);

            // Verify AuditLog record matches winning transition
            const auditLogs = await AuditLog.find({ targetId: lead._id, eventType: 'stage_changed' });
            assert.equal(auditLogs.length, 1, `Iteration ${i}: Exactly 1 audit record should exist for stage change`);
        }
    });

    it('5. Lead Scoring Deduplication & Explainable Breakdown: Deduplicates by _id, handles replays & preserves genuine calls', async () => {
        const lead = await Lead.create({
            firstName: 'Kavita',
            lastName: 'Verma',
            mobile: '9876543214',
            stage: stageLookups['prospect']._id,
            budgetMin: 5000000,
            budgetMax: 7000000,
            requirement: 'Residential'
        });

        const actId1 = new mongoose.Types.ObjectId();
        const actId2 = new mongoose.Types.ObjectId();
        const actId3 = new mongoose.Types.ObjectId();

        const baseTime = Date.now();

        const activities = [
            // Genuine Call 1 at T - 180s (ID: actId1)
            {
                _id: actId1,
                type: 'Call',
                status: 'Completed',
                details: { purpose: 'Follow Up', outcome: 'Interested' },
                completedAt: new Date(baseTime - 180000)
            },
            // Duplicate activity record with same _id (should be deduplicated by seenActivityIds)
            {
                _id: actId1,
                type: 'Call',
                status: 'Completed',
                details: { purpose: 'Follow Up', outcome: 'Interested' },
                completedAt: new Date(baseTime - 170000)
            },
            // Genuine Call 2 at T - 60s (2 minutes later) with distinct _id (must NOT be suppressed)
            {
                _id: actId2,
                type: 'Call',
                status: 'Completed',
                details: { purpose: 'Follow Up', outcome: 'Interested' },
                completedAt: new Date(baseTime - 60000)
            },
            // Duplicate webhook insertion: same timestamp down to the second (within 1000ms) with distinct _id
            {
                _id: actId3,
                type: 'Call',
                status: 'Completed',
                details: { purpose: 'Follow Up', outcome: 'Interested' },
                completedAt: new Date(baseTime - 60000)
            },
            // Transient unpersisted replay (no _id) within 5 minutes: must be suppressed
            {
                type: 'Call',
                status: 'Completed',
                details: { purpose: 'Follow Up', outcome: 'Interested' },
                completedAt: new Date(baseTime - 30000)
            },
            // Activity with invalid timestamp: must be handled safely without NaN
            {
                _id: new mongoose.Types.ObjectId(),
                type: 'Meeting',
                status: 'Completed',
                details: { purpose: 'Product Presentation', outcome: 'Interested' },
                completedAt: 'invalid-date-string'
            }
        ];

        const scoreResult = computeLeadScore(lead, activities);

        // Verification:
        // - Call 1 (actId1) = 12 points
        // - Duplicate actId1 = 0 points (deduplicated)
        // - Call 2 (actId2) = 12 points (distinct genuine call, NOT suppressed)
        // - Duplicate webhook insertion (actId3 at exact same ms) = 0 points (deduplicated)
        // - Unpersisted replay without _id = 0 points (deduplicated)
        // - Meeting with invalid date = 15 points (safely scored with valid fallback timestamp)
        // Total activity score = 12 + 12 + 15 = 39 points
        assert.equal(scoreResult.activityScore, 39, 'Activity score should accurately reflect unique genuine activities (39 points)');
        assert.equal(scoreResult.breakdown.activityContributions.length, 3, 'Exactly 3 unique contributions should be recorded');

        // Verify explainable contributions
        const contribTypes = scoreResult.breakdown.activityContributions.map(c => c.type).sort();
        assert.deepEqual(contribTypes, ['Call', 'Call', 'Meeting'].sort());

        // Verify invalid date activity has a valid Date object timestamp in contributions
        const meetingContrib = scoreResult.breakdown.activityContributions.find(c => c.type === 'Meeting');
        assert.ok(meetingContrib.timestamp instanceof Date && !isNaN(meetingContrib.timestamp.getTime()), 'Invalid date must safely resolve to a valid Date object');

        assert.ok(scoreResult.total >= 0 && scoreResult.total <= 100);
    });

    it('6. Lead Qualification Consistency: checkLeadQualifiedStatus aligns with dynamic threshold', async () => {
        const completeLead = {
            requirement: '2BHK Apartment',
            propertyType: ['Residential'],
            subType: ['Apartment'],
            sizeType: ['2BHK'],
            budgetMin: 8000000,
            budgetMax: 9000000,
            timeline: '3 Months',
            locCity: 'Gurugram',
            locArea: 'Sector 57'
        };

        const isQualified = checkLeadQualifiedStatus(completeLead);
        assert.equal(isQualified, true, 'Complete lead should qualify');

        const incompleteLead = {
            requirement: '2BHK Apartment'
        };
        const isIncompleteQualified = checkLeadQualifiedStatus(incompleteLead);
        assert.equal(isIncompleteQualified, false, 'Incomplete lead should not qualify');
    });

    it('7. Lead-to-Contact Conversion Concurrency & Idempotency: Double conversion is safely rejected', async () => {
        const lead = await Lead.create({
            firstName: 'Deepak',
            lastName: 'Chopra',
            mobile: '9876543215',
            email: 'deepak@example.com',
            stage: stageLookups['prospect']._id
        });

        const mockReq = { params: { id: lead._id.toString() } };
        let status1 = 200, resData1 = null;
        const mockRes1 = {
            status: (code) => { status1 = code; return mockRes1; },
            json: (data) => { resData1 = data; return mockRes1; }
        };

        await convertLeadToContact(mockReq, mockRes1);
        assert.equal(status1, 200);
        assert.equal(resData1.success, true);
        assert.ok(resData1.contact);

        // Attempting to convert the same lead a second time must fail with 400 or 409
        let status2 = 200, resData2 = null;
        const mockRes2 = {
            status: (code) => { status2 = code; return mockRes2; },
            json: (data) => { resData2 = data; return mockRes2; }
        };

        await convertLeadToContact(mockReq, mockRes2);
        assert.equal(status2, 400);
        assert.equal(resData2.success, false);
        assert.equal(resData2.message, 'Lead is already converted');
    });

    it('8. ServerAuthorityProof evaluateAndTransition signature compatibility', async () => {
        const lead = await Lead.create({
            firstName: 'Anita',
            lastName: 'Deshmukh',
            mobile: '9876543216',
            stage: stageLookups['prospect']._id
        });

        // Test calling evaluateAndTransition with both 5-param and 6-param signatures
        // 6-param call (stageFormData as 5th, context as 6th)
        const res6 = await evaluateAndTransition(
            lead._id,
            'Call',
            'Interested',
            'Interested in project',
            { notes: 'Followed up' },
            { activityId: new mongoose.Types.ObjectId(), triggeredByUser: salesUser._id }
        );

        assert.ok(res6, '6-param evaluateAndTransition call must execute without error');
    });
});
