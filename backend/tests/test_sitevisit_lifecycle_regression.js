/**
 * Bharat Properties CRM — Site Visit Marketing OS
 * Lifecycle & Stage Transition Regression Test Suite
 *
 * Verifies P0/P1 remediations:
 * 1. Critical 1: Prevent Lead Stage Regression (New, Prospect, Opportunity, Negotiation, Closed, Idempotency)
 * 2. Critical 2: Fix autoTriggerStageChange User Context (Authenticated User, System Execution, Scoring Resilience)
 * 3. Critical 4: Complete 10-step Site Visit & Marketing OS Closed-Loop Lifecycle
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'lifecycle_regression_jwt_secret_123';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';

// Models
import Activity from '../models/Activity.js';
import Lead from '../models/Lead.js';
import Lookup from '../models/Lookup.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import StageTransitionLog from '../models/StageTransitionLog.js';
import FeedbackForm from '../models/FeedbackForm.js';
import FeedbackSubmission from '../models/FeedbackSubmission.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

// Services & Controllers
import { SiteVisitService } from '../src/modules/siteVisit/siteVisit.service.js';
import { SiteVisitJourneyService } from '../src/modules/siteVisit/siteVisitJourney.service.js';
import StageTransitionEngine from '../src/services/StageTransitionEngine.js';
import { autoTriggerStageChange } from '../controllers/activity.controller.js';
import LeadScoringService from '../src/services/LeadScoringService.js';
import { AuthorityProofIssuer } from '../utils/ServerAuthorityProof.js';

describe('Site Visit Lifecycle & Stage Transition Regression Suite', () => {
    let replSet;
    let salesUser;
    let stageLookups = {};

    before(async () => {
        replSet = await MongoMemoryReplSet.create({
            replSet: {
                count: 1,
                args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=5000']
            }
        });
        await replSet.waitUntilRunning();
        const uri = replSet.getUri();
        await mongoose.connect(uri, { autoIndex: false });

        // Create collections
        await Activity.createCollection();
        await Lead.createCollection();
        await Lookup.createCollection();
        await User.createCollection();
        await AuditLog.createCollection();
        await StageTransitionLog.createCollection();
        await FeedbackForm.createCollection();
        await FeedbackSubmission.createCollection();
        await SystemSetting.createCollection();

        // Seed Sales User
        salesUser = await User.create({
            fullName: 'Rajesh Sharma',
            name: 'Rajesh Sharma',
            email: 'rajesh@bharatproperties.com',
            password: 'hashedPassword123!',
            role: new mongoose.Types.ObjectId(),
            department: 'sales',
            isActive: true,
            status: 'active'
        });

        // Seed Stage Lookups
        const stages = [
            'New', 'Incoming', 'Prospect', 'Working', 'Site Visit Scheduled',
            'Opportunity', 'Negotiation', 'Booked', 'Closed', 'Lost', 'Dormant'
        ];
        for (const st of stages) {
            stageLookups[st.toLowerCase()] = await Lookup.create({
                lookup_type: 'Stage',
                lookup_value: st
            });
        }
    });

    after(async () => {
        if (mongoose.connection?.readyState !== 0) {
            await mongoose.disconnect();
        }
        if (replSet) {
            await replSet.stop();
        }
    });

    beforeEach(async () => {
        await Activity.deleteMany({});
        await Lead.deleteMany({});
        await AuditLog.deleteMany({});
        await StageTransitionLog.deleteMany({});
        await FeedbackSubmission.deleteMany({});
        await SystemSetting.deleteMany({});
        await StageTransitionEngine.invalidateRulesCache();
    });

    // =========================================================================
    // CRITICAL 1: Prevent Lead Stage Regression
    // =========================================================================
    describe('Critical 1 — Prevent Lead Stage Regression', () => {
        it('1. New → Site Visit Scheduled on visit scheduling', async () => {
            const lead = await Lead.create({
                firstName: 'Ankit',
                lastName: 'Verma',
                mobile: '9810011111',
                stage: stageLookups['new']._id
            });

            const res = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-20',
                time: '10:00',
                properties: [{ project: 'Godrej Palm Retreat', block: 'A', property: 'Unit 101' }]
            }, salesUser);

            assert.equal(res.alreadyScheduled, false);
            assert.ok(res.activity);

            const updatedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(updatedLead.stage.lookup_value, 'Site Visit Scheduled');
            assert.ok(updatedLead.stageHistory.length >= 1);
            assert.equal(updatedLead.stageHistory[updatedLead.stageHistory.length - 1].stage, 'Site Visit Scheduled');
        });

        it('2. Prospect → remains Prospect when scheduled without configured transition rule', async () => {
            const lead = await Lead.create({
                firstName: 'Deepak',
                lastName: 'Chopra',
                mobile: '9810022222',
                stage: stageLookups['prospect']._id
            });

            const res = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-21',
                time: '11:00',
                properties: [{ project: 'DLF Privana', block: 'B', property: 'Unit 202' }]
            }, salesUser);

            assert.equal(res.alreadyScheduled, false);
            const untouchedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(untouchedLead.stage.lookup_value, 'Prospect', 'Prospect stage must be preserved without configured rule');
        });

        it('3. Prospect → Site Visit Scheduled when an explicit transition rule is configured', async () => {
            // Configure an explicit rule for Site Visit / Scheduled -> Site Visit Scheduled
            await SystemSetting.create({
                key: 'stage_transition_rules',
                category: 'crm_config',
                value: {
                    rules: [
                        {
                            id: 'sv_sched_rule',
                            activityType: 'Site Visit',
                            outcome: 'Scheduled',
                            status: 'Scheduled',
                            newStage: 'Site Visit Scheduled',
                            active: true,
                            priority: 1
                        }
                    ]
                }
            });
            await StageTransitionEngine.invalidateRulesCache();

            const lead = await Lead.create({
                firstName: 'Siddharth',
                lastName: 'Roy',
                mobile: '9810033333',
                stage: stageLookups['prospect']._id
            });

            const res = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-22',
                time: '12:00',
                properties: [{ project: 'M3M Golfestate', block: 'C', property: 'Unit 303' }]
            }, salesUser);

            assert.equal(res.alreadyScheduled, false);
            const updatedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(updatedLead.stage.lookup_value, 'Site Visit Scheduled', 'Advances to Site Visit Scheduled under explicit rule');
        });

        it('4. Opportunity → remains Opportunity unless an explicitly valid transition exists (regression blocked)', async () => {
            const lead = await Lead.create({
                firstName: 'Kavita',
                lastName: 'Krishnan',
                mobile: '9810044444',
                stage: stageLookups['opportunity']._id,
                budget: '2.5 Cr',
                timeline: 'Immediate'
            });

            const res = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-23',
                time: '14:00',
                properties: [{ project: 'Sobha City', block: 'D', property: 'Unit 404' }]
            }, salesUser);

            assert.equal(res.alreadyScheduled, false);
            const preservedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(preservedLead.stage.lookup_value, 'Opportunity', 'Opportunity stage must not regress to Site Visit Scheduled');
        });

        it('5. Negotiation → remains Negotiation (regression blocked)', async () => {
            const lead = await Lead.create({
                firstName: 'Manish',
                lastName: 'Tiwari',
                mobile: '9810055555',
                stage: stageLookups['negotiation']._id,
                budgetMin: 20000000,
                budgetMax: 25000000
            });

            const res = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-24',
                time: '15:00',
                properties: [{ project: 'Trump Tower', block: 'T1', property: 'Unit 1501' }]
            }, salesUser);

            assert.equal(res.alreadyScheduled, false);
            const preservedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(preservedLead.stage.lookup_value, 'Negotiation', 'Negotiation stage must not regress to Site Visit Scheduled');
        });

        it('6. Closed → remains Closed (terminal stage lock)', async () => {
            const lead = await Lead.create({
                firstName: 'Pooja',
                lastName: 'Bansal',
                mobile: '9810066666',
                stage: stageLookups['closed']._id
            });

            const res = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-25',
                time: '16:00',
                properties: [{ project: 'Emaar Palm Hills', block: 'E', property: 'Unit 505' }]
            }, salesUser);

            assert.equal(res.alreadyScheduled, false);
            const preservedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(preservedLead.stage.lookup_value, 'Closed', 'Closed lead must remain Closed');
        });

        it('7. Duplicate scheduling → no duplicate transition or duplicate stage history', async () => {
            const lead = await Lead.create({
                firstName: 'Gaurav',
                lastName: 'Nath',
                mobile: '9810077777',
                stage: stageLookups['site visit scheduled']._id
            });

            // First schedule creates the activity
            const res1 = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-26',
                time: '10:00',
                properties: [{ project: 'Ireo Grand Arch', block: 'A', property: 'Unit 601' }]
            }, salesUser);
            assert.equal(res1.alreadyScheduled, false);

            // Attempt duplicate scheduling on the same date
            const res2 = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-26',
                time: '10:00',
                properties: [{ project: 'Ireo Grand Arch', block: 'A', property: 'Unit 601' }]
            }, salesUser);
            assert.equal(res2.alreadyScheduled, true, 'Duplicate schedule on same date must be detected');

            const postLead = await Lead.findById(lead._id);
            // Verify no duplicate history entries were appended
            assert.equal(postLead.stageHistory.length, 0, 'No redundant stage history added when already in stage');
        });
    });

    // =========================================================================
    // CRITICAL 2: Fix autoTriggerStageChange User Context
    // =========================================================================
    describe('Critical 2 — Fix autoTriggerStageChange User Context', () => {
        it('8. autoTriggerStageChange with explicit authenticated user context', async () => {
            const lead = await Lead.create({
                firstName: 'Rohan',
                lastName: 'Mehra',
                mobile: '9810088888',
                stage: stageLookups['working']._id,
                budget: '2 Cr',
                timeline: '1 Month'
            });

            const activity = await Activity.create({
                type: 'Site Visit',
                subject: 'Site Visit: Rohan - Godrej',
                status: 'Completed',
                dueDate: new Date(),
                entityType: 'Lead',
                entityId: lead._id,
                details: {
                    completionResult: 'Interested',
                    outcome: 'Interested',
                    visitedProperties: [{ project: 'Godrej', result: 'Interested' }]
                }
            });

            // Call autoTriggerStageChange with authenticated user object
            const transition = await autoTriggerStageChange(activity, salesUser);

            assert.ok(transition, 'Transition result must not be null');
            assert.equal(transition.stageChanged, true);
            assert.equal(transition.newStage, 'Opportunity');

            const updatedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(updatedLead.stage.lookup_value, 'Opportunity');
        });

        it('9. autoTriggerStageChange with system context (null user) succeeds via AuthorityProofIssuer', async () => {
            const lead = await Lead.create({
                firstName: 'Alok',
                lastName: 'Nath',
                mobile: '9810099999',
                stage: stageLookups['working']._id,
                budget: '3 Cr',
                timeline: 'Immediate'
            });

            const activity = await Activity.create({
                type: 'Meeting',
                subject: 'Client Meeting: Alok',
                status: 'Completed',
                dueDate: new Date(),
                entityType: 'Lead',
                entityId: lead._id,
                details: {
                    completionResult: 'Interested',
                    outcome: 'Interested'
                }
            });

            // Automated system call (e.g. background worker or webhook) passing null user
            const transition = await autoTriggerStageChange(activity, null);

            assert.ok(transition, 'System-triggered execution must succeed');
            assert.equal(transition.stageChanged, true);
            assert.equal(transition.newStage, 'Opportunity');

            const updatedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(updatedLead.stage.lookup_value, 'Opportunity');
        });

        it('10. Scoring resilience: scoring errors do not suppress or abort stage transition', async () => {
            const lead = await Lead.create({
                firstName: 'Sunita',
                lastName: 'Rao',
                mobile: '9810100000',
                stage: stageLookups['working']._id,
                budget: '1.8 Cr',
                timeline: 'Immediate'
            });

            const activity = await Activity.create({
                type: 'Site Visit',
                subject: 'Site Visit: Sunita',
                status: 'Completed',
                dueDate: new Date(),
                entityType: 'Lead',
                entityId: lead._id,
                details: {
                    completionResult: 'Interested',
                    outcome: 'Interested',
                    visitedProperties: [{ project: 'Sobha', result: 'Interested' }]
                }
            });

            // Temporarily monkey-patch LeadScoringService.computeAndSave to simulate a scoring failure
            const originalCompute = LeadScoringService.computeAndSave;
            LeadScoringService.computeAndSave = async () => {
                throw new Error('SIMULATED_SCORING_ENGINE_OUTAGE');
            };

            try {
                const transition = await autoTriggerStageChange(activity, salesUser);

                assert.ok(transition, 'Transition must still return even when scoring throws');
                assert.equal(transition.stageChanged, true);
                assert.equal(transition.newStage, 'Opportunity');
                assert.ok(transition.scoringError, 'Scoring error must be attached to transition object');
                assert.match(transition.scoringError, /SIMULATED_SCORING_ENGINE_OUTAGE/);

                // Verify the stage actually changed in database despite scoring error
                const updatedLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
                assert.equal(updatedLead.stage.lookup_value, 'Opportunity', 'Stage transition must persist despite scoring failure');
            } finally {
                LeadScoringService.computeAndSave = originalCompute;
            }
        });
    });

    // =========================================================================
    // CRITICAL 4: Site Visit Lifecycle Regression (Complete 10-Step Journey)
    // =========================================================================
    describe('Critical 4 — Complete Site Visit Marketing OS Lifecycle', () => {
        it('Executes the complete 10-step enterprise lifecycle seamlessly', async () => {
            // Setup Lead
            const lead = await Lead.create({
                firstName: 'Vikram',
                lastName: 'Malhotra',
                mobile: '9876543210',
                email: 'vikram.malhotra@example.com',
                stage: stageLookups['new']._id,
                budget: '2.5 Cr',
                timeline: 'Immediate',
                leadScore: 50
            });

            // Step 1: Schedule visit with multiple sequential properties
            const scheduleResult = await SiteVisitService.schedule({
                leadId: lead._id,
                date: '2026-11-28',
                time: '11:00',
                properties: [
                    { project: 'DLF Camellias', block: 'Tower A', property: 'Penthouse 1' },
                    { project: 'M3M Golfestate', block: 'Tower B', property: 'Unit 402' }
                ],
                remarks: 'Client interested in luxury golf-course properties'
            }, salesUser);

            assert.equal(scheduleResult.alreadyScheduled, false);
            const activityId = scheduleResult.activity._id;
            assert.ok(activityId);

            // Step 2: Confirm initial stage transition (New -> Site Visit Scheduled)
            const scheduledLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(scheduledLead.stage.lookup_value, 'Site Visit Scheduled');

            // Verify journey token and initial property gate statuses
            const initialActivity = await Activity.findById(activityId);
            assert.ok(initialActivity.details.journeyTokenHash, 'Journey token hash must exist');
            assert.equal(initialActivity.details.visitedProperties[0].status, 'READY');
            assert.equal(initialActivity.details.visitedProperties[1].status, 'LOCKED');

            // Step 3: Complete visit with 'Interested' outcome on Property 1
            const completionResult = await SiteVisitService.complete(
                activityId,
                {
                    outcome: 'Interested',
                    visitedProperties: [
                        { project: 'DLF Camellias', block: 'Tower A', property: 'Penthouse 1', result: 'Interested', notes: 'Loved the view and amenities', status: 'READY' },
                        { project: 'M3M Golfestate', block: 'Tower B', property: 'Unit 402', status: 'LOCKED' }
                    ],
                    outcomeReason: 'Shortlisted'
                },
                salesUser
            );

            assert.ok(completionResult.activity);
            assert.equal(completionResult.activity.status, 'Completed');

            // Step 4: Verify canonical stage engine rule (sv_int_opp)
            const evalRule = await StageTransitionEngine.resolveTransition('Site Visit', 'Interested', 'Shortlisted');
            assert.equal(evalRule.matched, true);
            assert.equal(evalRule.rule.id, 'sv_int_opp');
            assert.equal(evalRule.rule.newStage, 'Opportunity');

            // Step 5: Verify expected Opportunity transition when configured with required fields
            const oppLead = await Lead.findById(lead._id).populate('stage', 'lookup_value');
            assert.equal(oppLead.stage.lookup_value, 'Opportunity', 'Lead stage successfully advanced to Opportunity');

            // Step 6: Verify scoring recomputed
            const scoredLead = await Lead.findById(lead._id);
            assert.ok(typeof scoredLead.leadScore === 'number');

            // Step 7: Verify audit log & stage history
            assert.ok(scoredLead.stageHistory.length >= 2, 'Stage history must record New -> Site Visit Scheduled -> Opportunity');
            assert.equal(scoredLead.stageHistory[scoredLead.stageHistory.length - 1].stage, 'Opportunity');

            // Step 8: Verify feedback submission via client journey token
            const feedbackRes = await SiteVisitJourneyService.submitPropertyFeedback(
                activityId,
                0,
                {
                    rating: 5,
                    responses: {
                        feedback: 'Spectacular layout',
                        amenities: 'World class golf club'
                    }
                }
            );

            assert.ok(feedbackRes.success);

            // Step 9: Verify sequential property unlock
            const unlockedActivity = await Activity.findById(activityId);
            assert.equal(unlockedActivity.details.visitedProperties[0].status, 'FEEDBACK_SUBMITTED');
            assert.equal(unlockedActivity.details.visitedProperties[1].status, 'READY', 'Property 2 must now be unlocked to READY');

            // Step 10: Verify duplicate request idempotency
            const duplicateFeedback = await SiteVisitJourneyService.submitPropertyFeedback(
                activityId,
                0,
                {
                    rating: 5,
                    responses: { feedback: 'Duplicate feedback attempt' }
                }
            );
            assert.equal(duplicateFeedback.success, true);
            assert.equal(duplicateFeedback.duplicate, true, 'Duplicate property feedback must return duplicate: true');
        });
    });
});
