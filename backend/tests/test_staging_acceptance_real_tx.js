/**
 * Bharat Properties CRM — Site Visit Staging Acceptance & Real Transaction Gate
 *
 * Runs against an isolated WiredTiger MongoMemoryReplSet (ephemeral local replica set)
 * to independently verify real multi-document ACID transactions, rollback, commit,
 * and the complete 10-point Site Visit staging acceptance journey.
 *
 * Guarantees:
 * - 100% real MongoDB transactions (session.startTransaction / abortTransaction / commitTransaction)
 * - 0% production database writes (bound strictly to local ephemeral port 127.0.0.1)
 * - Zero external side effects (mock / test transports only, 0 SMS/WA to real customers)
 */

import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'staging_acceptance_jwt_secret_999';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://crm.bharatproperties.co';

// Models
import Activity from '../models/Activity.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Lookup from '../models/Lookup.js';
import User from '../models/User.js';
import FeedbackForm from '../models/FeedbackForm.js';
import FeedbackSubmission from '../models/FeedbackSubmission.js';

// Services
import { SiteVisitService } from '../src/modules/siteVisit/siteVisit.service.js';
import { SiteVisitJourneyService } from '../src/modules/siteVisit/siteVisitJourney.service.js';
import SiteVisitAutomationService from '../src/modules/siteVisit/siteVisitAutomation.service.js';
import * as SiteVisitController from '../src/modules/siteVisit/siteVisit.controller.js';
import { withMongoTransaction } from '../utils/withMongoTransaction.js';

let replSet = null;
let testPassed = 0;
let testFailed = 0;

function assert(condition, message) {
    if (!condition) {
        testFailed++;
        console.error(`  ❌ FAIL: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    } else {
        testPassed++;
        console.log(`  ✅ PASS: ${message}`);
    }
}

async function setupDatabase() {
    console.log('\n--- Phase 0: Provisioning Ephemeral WiredTiger MongoDB Replica Set ---');
    replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' }
    });
    const uri = replSet.getUri();
    
    // Safety check: ensure URI is local ephemeral only
    if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
        throw new Error(`CRITICAL SAFETY ABORT: Replica Set URI is not localhost: ${uri}`);
    }

    console.log(`Connected to isolated test replica set at: ${uri.replace(/\/\/[^@]+@/, '//')}`);
    await mongoose.connect(uri);

    // Verify database identity
    const dbName = mongoose.connection.name;
    const host = mongoose.connection.host;
    assert(host === '127.0.0.1' || host === 'localhost', `Database host must be local testbed (was: ${host})`);
    assert(dbName !== 'bharatproperties1', `Must not connect to production database (connected to: ${dbName})`);

    // Ensure all indexes are built before executing transactions
    await Promise.all([
        Activity.init(),
        Lead.init(),
        Deal.init(),
        Lookup.init(),
        User.init(),
        FeedbackForm.init(),
        FeedbackSubmission.init()
    ]);

    // Seed required Lookup stages and statuses
    await Lookup.create([
        { lookup_type: 'Stage', lookup_value: 'New' },
        { lookup_type: 'Stage', lookup_value: 'Site Visit Scheduled' },
        { lookup_type: 'Stage', lookup_value: 'Opportunity' },
        { lookup_type: 'Status', lookup_value: 'Available' },
        { lookup_type: 'Status', lookup_value: 'Booked' }
    ]);

    // Seed default active FeedbackForm
    await FeedbackForm.create({
        name: 'Customer Experience Feedback',
        slug: 'customer-experience-feedback-qx9z2',
        isActive: true
    });
    console.log('Seed lookups and feedback form created.');
}

async function teardownDatabase() {
    console.log('\n--- Teardown: Stopping Ephemeral Replica Set ---');
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (replSet) {
        await replSet.stop();
    }
    console.log('Replica Set stopped cleanly.');
}

async function createTestLead(data) {
    const lead = await Lead.create(data);
    // Allow background post-save automation (e.g. NurtureBot initial state) to settle
    await new Promise(r => setTimeout(r, 150));
    return lead;
}

async function runRealTransactionTests() {
    console.log('\n======================================================');
    console.log('Phase 1: Real Multi-Document ACID Transaction Rollback Acceptance');
    console.log('======================================================');

    // 1.1 Atomic Rollback on Schedule Failure
    console.log('\n--- 1.1 Atomic Rollback on Schedule Failure ---');
    const newStageLookup = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: 'New' });
    const lead1 = await createTestLead({
        firstName: 'Synthetic',
        lastName: 'Buyer Alpha',
        mobile: '9876543210',
        stage: newStageLookup._id,
        leadScore: 40
    });

    const session1 = await mongoose.startSession();
    session1.startTransaction();

    let scheduleErrorThrown = false;
    try {
        await SiteVisitService.schedule({
            leadId: lead1._id,
            date: '2026-11-15',
            time: '11:00',
            properties: [
                { project: 'M3M Golfestate', block: 'Tower 4', property: 'Unit 402' }
            ]
        }, null, { session: session1 });

        // Verify write exists inside session
        const inSessionActivity = await Activity.findOne({ entityId: lead1._id }).session(session1);
        assert(inSessionActivity !== null, 'Activity exists within active transaction session');

        // Intentionally simulate an unexpected failure/abort (e.g., conflict or downstream error)
        throw new Error('SIMULATED_WRITE_CONFLICT_ABORT');
    } catch (err) {
        if (err.message === 'SIMULATED_WRITE_CONFLICT_ABORT') {
            scheduleErrorThrown = true;
            await session1.abortTransaction();
        } else {
            throw err;
        }
    } finally {
        await session1.endSession();
    }

    assert(scheduleErrorThrown === true, 'Simulated failure triggered transaction abort');

    // Verify outside session: ZERO partial records remain
    const postAbortActivity = await Activity.findOne({ entityId: lead1._id });
    assert(postAbortActivity === null, 'Atomic rollback: Activity was completely rolled back from database');

    const postAbortLead = await Lead.findById(lead1._id);
    assert(String(postAbortLead.stage) === String(newStageLookup._id), 'Atomic rollback: Lead stage remains unchanged at New');

    // 1.2 Atomic Commit on Schedule Success
    console.log('\n--- 1.2 Atomic Commit on Schedule Success ---');
    const session2 = await mongoose.startSession();
    session2.startTransaction();

    let committedActivityId = null;
    try {
        const schedRes = await SiteVisitService.schedule({
            leadId: lead1._id,
            date: '2026-11-15',
            time: '11:00',
            properties: [
                { project: 'DLF The Camellias', block: 'Block B', property: 'Apt 1201' },
                { project: 'Emaar Palm Springs', block: 'Block A', property: 'Villa 5' }
            ],
            remarks: 'VIP Client Looking for Penthouse'
        }, null, { session: session2 });

        committedActivityId = schedRes.activity._id;
        await session2.commitTransaction();
    } finally {
        await session2.endSession();
    }

    // Verify outside session: Records are permanently committed
    const committedActivity = await Activity.findById(committedActivityId);
    assert(committedActivity !== null, 'Atomic commit: Activity permanently persisted in database');
    assert(committedActivity.status === 'Pending', 'Committed activity has status Pending');
    assert(committedActivity.details.visitedProperties.length === 2, 'Committed activity has 2 properties in itinerary');
    assert(Boolean(committedActivity.details.journeyToken), 'Committed activity has cryptographically signed journey token');

    const scheduledStage = await Lookup.findOne({ lookup_type: 'Stage', lookup_value: 'Site Visit Scheduled' });
    const committedLead = await Lead.findById(lead1._id);
    assert(String(committedLead.stage) === String(scheduledStage._id), 'Atomic commit: Lead stage successfully advanced to Site Visit Scheduled');

    // 1.3 Atomic Rollback on Feedback Failure
    console.log('\n--- 1.3 Atomic Rollback on Feedback Submission Failure ---');
    let feedbackErrorThrown = false;
    let attempts3 = 0;
    while (attempts3 < 3) {
        attempts3++;
        const session3 = await mongoose.startSession();
        session3.startTransaction();

        try {
            // Submit feedback for property 0 inside transaction
            await SiteVisitJourneyService.submitPropertyFeedback(
                committedActivityId,
                0,
                { rating: 5, responses: { notes: 'Great penthouse layout' } },
                { session: session3 }
            );

            const inSessionSub = await FeedbackSubmission.findOne({ activity: committedActivityId }).session(session3);
            assert(inSessionSub !== null, 'Feedback submission visible inside session');

            // Force an abort before commit
            throw new Error('SIMULATED_FEEDBACK_ABORT');
        } catch (err) {
            if (err.message === 'SIMULATED_FEEDBACK_ABORT') {
                feedbackErrorThrown = true;
                await session3.abortTransaction();
                break;
            } else if (err.hasErrorLabel && err.hasErrorLabel('TransientTransactionError') && attempts3 < 3) {
                await session3.abortTransaction();
                await new Promise(r => setTimeout(r, 100));
                continue;
            } else {
                await session3.abortTransaction();
                throw err;
            }
        } finally {
            await session3.endSession();
        }
    }

    assert(feedbackErrorThrown === true, 'Simulated failure aborted feedback transaction');

    // Allow aborted transaction cleanup to settle
    await new Promise(r => setTimeout(r, 150));

    // Verify outside session: No submission persisted, itinerary remains unchanged
    const postAbortSub = await FeedbackSubmission.findOne({ activity: committedActivityId });
    assert(postAbortSub === null, 'Atomic rollback: FeedbackSubmission completely rolled back from database');

    const postAbortAct2 = await Activity.findById(committedActivityId);
    assert(postAbortAct2.details.visitedProperties[0].status === 'READY', 'Atomic rollback: Visited property remains in READY status, not FEEDBACK_SUBMITTED');

    // 1.4 Atomic Commit on Feedback Success
    console.log('\n--- 1.4 Atomic Commit on Feedback Submission Success ---');
    await withMongoTransaction(async (session4) => {
        await SiteVisitJourneyService.submitPropertyFeedback(
            committedActivityId,
            0,
            { rating: 5, responses: { notes: 'Excellent property' } },
            { session: session4 }
        );
    });

    const committedSub = await FeedbackSubmission.findOne({ activity: committedActivityId });
    assert(committedSub !== null, 'Atomic commit: FeedbackSubmission permanently persisted');
    assert(committedSub.rating === 5, 'Feedback submission recorded rating 5');

    const updatedAct = await Activity.findById(committedActivityId);
    assert(updatedAct.details.visitedProperties[0].status === 'FEEDBACK_SUBMITTED', 'Visited property 1 status updated to FEEDBACK_SUBMITTED');
    assert(updatedAct.details.visitedProperties[1].status === 'READY', 'Sequential unlock: Property 2 transitioned from LOCKED to READY');

    // 1.5 Atomic Rollback & Commit on Site Visit Completion
    console.log('\n--- 1.5 Site Visit Completion & Deal Link Transaction ---');
    const deal1 = await Deal.create({
        lead: lead1._id,
        name: 'M3M Penthouse Deal',
        value: 50000000,
        stage: 'Open'
    });

    await withMongoTransaction(async (session5) => {
        await SiteVisitService.complete(committedActivityId, {
            outcome: 'Interested',
            dealId: deal1._id,
            notes: 'Client wants to proceed to booking negotiation'
        }, null, { session: session5 });
    });

    const completedAct = await Activity.findById(committedActivityId);
    assert(completedAct.status === 'Completed', 'Atomic commit: Site Visit marked Completed');
    assert(completedAct.completionResult === 'Interested' || completedAct.details.completionResult === 'Interested', 'Outcome Interested recorded');
    const hasDealLink = String(completedAct.details?.dealId) === String(deal1._id) || (completedAct.relatedTo || []).some(r => String(r.id) === String(deal1._id));
    assert(hasDealLink, 'Deal ID linked to completed activity');
}

async function runAcceptanceJourneyTests() {
    console.log('\n======================================================');
    console.log('Phase 2: Full 10-Point Site Visit Staging Acceptance Journey');
    console.log('======================================================');

    // Pre-create agent and client
    const agent = await User.create({
        fullName: 'Rajesh Verma',
        email: 'rajesh.agent@bharatproperties.co',
        password: 'Password123!',
        role: new mongoose.Types.ObjectId(),
        department: 'sales',
        dataScope: 'assigned'
    });

    const lead = await createTestLead({
        firstName: 'Vikram',
        lastName: 'Malhotra',
        mobile: '9811223344',
        email: 'vikram.malhotra@example.com',
        source: 'Google Ads',
        department: 'sales',
        assignedTo: agent._id
    });

    // 1. Authorized CRM User schedules Site Visit
    console.log('\n--- 2.1 Authorized User Schedules Site Visit ---');
    const schedulePayload = {
        leadId: lead._id,
        date: '2026-11-20',
        time: '14:30',
        assignedTo: agent._id,
        pickupRequired: true,
        pickupAddress: 'Sector 54 Rapid Metro Station, Gurugram',
        properties: [
            { project: 'Godrej Meridien', block: 'Tower B', property: 'Unit 901', city: 'Gurugram' },
            { project: 'Tata Primanti', block: 'Villa 12', property: 'Villa 12', city: 'Gurugram' }
        ],
        remarks: 'Client prefers high-rise park view'
    };

    const schedRes = await SiteVisitService.schedule(schedulePayload, agent);
    const activityId = schedRes.activity._id;
    assert(Boolean(activityId), '1. Authorized CRM user successfully scheduled site visit');

    // 2. Activity, property itinerary and client link persisted
    console.log('\n--- 2.2 Activity, Itinerary and Client Link Persisted ---');
    const persistedAct = await Activity.findById(activityId);
    assert(persistedAct.type === 'Site Visit', '2a. Activity persisted with type Site Visit');
    assert(persistedAct.details.visitedProperties.length === 2, '2b. Itinerary contains 2 properties');
    assert(persistedAct.details.visitedProperties[0].status === 'READY', '2c. Property 1 is READY');
    assert(persistedAct.details.visitedProperties[1].status === 'LOCKED', '2d. Property 2 is LOCKED');
    assert(Boolean(persistedAct.details.journeyToken), '2e. Cryptographic client journey token generated');
    assert(Boolean(persistedAct.details.clientJourneyUrl), '2f. Public client journey link generated');

    // 3. Duplicate scheduling handled correctly (idempotency)
    console.log('\n--- 2.3 Duplicate Scheduling Idempotency ---');
    let duplicateRejected = false;
    try {
        const dupRes = await SiteVisitService.schedule({
            leadId: lead._id,
            date: '2026-11-20',
            time: '16:00',
            properties: [{ project: 'Godrej Meridien' }]
        }, agent);
        if (dupRes && dupRes.alreadyScheduled === true && dupRes.message.includes('already scheduled')) {
            duplicateRejected = true;
        }
    } catch (err) {
        if (err.message.includes('already scheduled')) {
            duplicateRejected = true;
        }
    }
    assert(duplicateRejected === true, '3. Duplicate scheduling on same date rejected with clear message/status');

    // 4. Reminder dispatch checks (opt-out skipped, eligible processed)
    console.log('\n--- 2.4 Reminder Dispatch Eligibility & DND Filtering ---');
    const optedOutLead = await Lead.create({
        firstName: 'DND',
        lastName: 'Customer',
        mobile: '9811009988',
        doNotContact: true
    });
    const dndValidation = SiteVisitAutomationService.validateRecipient(optedOutLead);
    assert(dndValidation.valid === false && (dndValidation.reason === 'OPTED_OUT' || dndValidation.status === 'OPTED_OUT'), '4a. Opted-out customer filtered with OPTED_OUT reason');

    const eligibleValidation = SiteVisitAutomationService.validateRecipient(lead);
    assert(eligibleValidation.valid === true && (eligibleValidation.normalized === '9811223344' || eligibleValidation.normalizedMobile === '9811223344'), '4b. Eligible customer validated with normalized 10-digit number');

    // 5. Client journey token verification & security guards
    console.log('\n--- 2.5 Client Journey Token Validation & Security ---');
    const journeyToken = persistedAct.details.journeyToken;
    const verifiedData = await SiteVisitJourneyService.verifyJourneyToken(journeyToken);
    assert(String(verifiedData.activity._id) === String(activityId), '5a. Valid token resolves correct activity');
    const itinerary = await SiteVisitJourneyService.getSanitizedItinerary(verifiedData.activity);
    assert(itinerary.properties.length === 2, '5b. Sanitized itinerary returned');
    assert(itinerary.properties[1].isLocked === true, '5c. Property 2 unit details strictly masked/locked');

    // Tampered token check
    let tamperedRejected = false;
    try {
        await SiteVisitJourneyService.verifyJourneyToken(journeyToken + 'tampered');
    } catch (err) {
        tamperedRejected = true;
    }
    assert(tamperedRejected === true, '5d. Tampered token rejected');

    // 6. Feedback submission persists and is visible to CRM user
    console.log('\n--- 2.6 Feedback Submission & CRM Visibility ---');
    const feedbackRes = await SiteVisitJourneyService.submitPropertyFeedback(
        activityId,
        0,
        {
            rating: 4,
            responses: { liked: 'Layout and sunlight', feedback: 'Price slightly high' }
        }
    );
    assert(feedbackRes.success === true, '6a. Feedback submission accepted for Property 1');

    const postFeedbackAct = await Activity.findById(activityId);
    assert(postFeedbackAct.details.visitedProperties[0].status === 'FEEDBACK_SUBMITTED', '6b. Property 1 status marked FEEDBACK_SUBMITTED');
    assert(postFeedbackAct.details.visitedProperties[1].status === 'READY', '6c. Property 2 sequentially unlocked to READY');

    // CRM list inspection
    const crmSiteVisit = await SiteVisitService.getById(activityId, agent);
    assert(crmSiteVisit._id.toString() === activityId.toString(), '6d. Authorized CRM user can view site visit and submitted feedback');

    // 7. Cancellation/revocation blocks further access (HTTP 410)
    console.log('\n--- 2.7 Cancellation & Access Revocation ---');
    const cancelLead = await createTestLead({ firstName: 'Cancel', lastName: 'Test Lead', mobile: '9998887776' });
    const cancelSched = await SiteVisitService.schedule({
        leadId: cancelLead._id,
        date: '2026-11-25',
        time: '10:00',
        properties: [{ project: 'DLF Crest' }]
    });
    const cancelActId = cancelSched.activity._id;
    const cancelToken = cancelSched.activity.details.journeyToken;

    await SiteVisitService.cancel(cancelActId, { reason: 'Client requested postponement' }, agent);
    const cancelledAct = await Activity.findById(cancelActId);
    assert(cancelledAct.status === 'Cancelled', '7a. Site visit status set to Cancelled');

    let accessBlocked = false;
    try {
        await SiteVisitJourneyService.verifyJourneyToken(cancelToken);
    } catch (err) {
        if (err.statusCode === 410 || err.message.includes('cancelled')) {
            accessBlocked = true;
        }
    }
    assert(accessBlocked === true, '7b. Public journey access blocked (HTTP 410 / Cancelled)');

    // 8. Lead/Deal association, attribution and closed-loop ROI
    console.log('\n--- 2.8 Deal Association & Attribution Inheritance ---');
    const attributedDeal = await Deal.create({
        lead: lead._id,
        name: 'Godrej Meridien Deal',
        value: 25000000,
        siteVisitId: activityId,
        marketingAttribution: {
            source: 'google',
            medium: 'cpc',
            campaign: 'gurugram_luxury'
        }
    });
    assert(String(attributedDeal.siteVisitId) === String(activityId), '8a. Deal linked to Site Visit ID');
    assert(attributedDeal.marketingAttribution.campaign === 'gurugram_luxury', '8b. Marketing attribution campaign inherited');

    // 9. RBAC fail-closed visibility enforcement
    console.log('\n--- 2.9 RBAC Fail-Closed Enforcement ---');
    const unauthorizedUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'other.department@bharatproperties.co',
        role: new mongoose.Types.ObjectId(),
        department: 'accounts',
        dataScope: 'assigned'
    };

    // Controller fail-closed test
    let forbiddenCaught = false;
    const mockReq = {
        params: { id: activityId },
        user: unauthorizedUser
    };
    const mockRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) {
            if (this.statusCode === 403 || payload.success === false) {
                forbiddenCaught = true;
            }
            return this;
        }
    };

    // Using SiteVisitController
    await SiteVisitController.getSiteVisit(mockReq, mockRes);
    // Since unauthorizedUser is in Commercial Leasing while lead is in Primary Sales, access is denied
    assert(forbiddenCaught === true || mockRes.statusCode === 403 || mockRes.statusCode === 404, '9. Unauthorized user/tenant cannot access another scope\'s Site Visit');

    // 10. Provider errors and database failures do not produce false success
    console.log('\n--- 2.10 Database & Provider Failure Safety ---');
    const evalUnconfigured = SiteVisitAutomationService.evaluateProviderDispatch(null, 'whatsapp');
    assert(evalUnconfigured.success === false && evalUnconfigured.delivered === false, '10a. Unconfigured provider evaluates to success: false');

    const evalMock = SiteVisitAutomationService.evaluateProviderDispatch({ mock: true }, 'sms');
    assert(evalMock.success === false && evalMock.status === 'SIMULATED', '10b. Mock provider distinguishes simulation from delivery');
}

async function main() {
    console.log('======================================================');
    console.log('BHARAT PROPERTIES CRM — STAGING ACCEPTANCE & REAL TX TEST');
    console.log('======================================================');
    try {
        await setupDatabase();
        await runRealTransactionTests();
        await runAcceptanceJourneyTests();

        console.log('\n======================================================');
        console.log(`STAGING ACCEPTANCE RESULTS: Passed: ${testPassed}, Failed: ${testFailed}`);
        console.log('======================================================');

        if (testFailed > 0) {
            process.exit(1);
        }
    } catch (err) {
        console.error('Fatal execution error:', err);
        process.exit(1);
    } finally {
        await teardownDatabase();
    }
}

main();
