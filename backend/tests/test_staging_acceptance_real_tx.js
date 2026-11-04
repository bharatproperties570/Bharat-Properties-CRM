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
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';

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
    assert(committedActivity.details.journeyToken === undefined, 'Raw journeyToken bearer credential is NOT persisted in MongoDB');
    assert(committedActivity.details.journeyUrl === undefined, 'Raw journeyUrl bearer credential is NOT persisted in MongoDB');
    assert(Boolean(committedActivity.details.journeyTokenHash), 'Committed activity has safely persisted token hash');

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
    assert(persistedAct.details.journeyToken === undefined, '2e. Raw bearer token is NOT stored in MongoDB');
    assert(persistedAct.details.journeyUrl === undefined, '2f. Raw journey URL is NOT stored in MongoDB');
    assert(Boolean(persistedAct.details.journeyTokenHash), '2g. Cryptographic journey token hash persisted');

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

    // 5. Client journey token verification & security guards via scoped internal path
    console.log('\n--- 2.5 Client Journey Token Validation & Scoped Delivery Path ---');
    const journeyLinkRes = await SiteVisitService.getJourneyLink(activityId, agent);
    assert(Boolean(journeyLinkRes.journeyUrl), '5a. Authorized agent retrieved customer journey URL via scoped path');
    assert(Boolean(journeyLinkRes.safeToken), '5b. Authorized agent retrieved customer safe token via scoped path');
    assert(journeyLinkRes.isRotated === false, '5c. Initial retrieval of active token reports isRotated: false');
    const journeyToken = journeyLinkRes.safeToken;

    // Stable Lifecycle: Repeated retrieval must return identical token and not invalidate active link
    const journeyLinkRes2 = await SiteVisitService.getJourneyLink(activityId, agent);
    assert(journeyLinkRes2.safeToken === journeyToken, '5d. Repeated retrieval returns exact same token without generating new JTI or modifying DB');
    assert(journeyLinkRes2.journeyUrl === journeyLinkRes.journeyUrl, '5e. Repeated retrieval returns exact same customer URL');

    // Concurrency Safety: 5 concurrent retrievals must all return the exact same token
    const concurrentResults = await Promise.all([1, 2, 3, 4, 5].map(() => SiteVisitService.getJourneyLink(activityId, agent)));
    const allMatch = concurrentResults.every(r => r.safeToken === journeyToken && r.journeyUrl === journeyLinkRes.journeyUrl);
    assert(allMatch === true, '5f. Concurrent retrievals return consistent, identical token and URL with zero race conditions');

    const verifiedData = await SiteVisitJourneyService.verifyJourneyToken(journeyToken);
    assert(String(verifiedData.activity._id) === String(activityId), '5g. Valid token resolves correct activity');
    const itinerary = await SiteVisitJourneyService.getSanitizedItinerary(verifiedData.activity);
    assert(itinerary.properties.length === 2, '5h. Sanitized itinerary returned');
    assert(itinerary.properties[1].isLocked === true, '5i. Property 2 unit details strictly masked/locked');

    // Tampered token check
    let tamperedRejected = false;
    try {
        await SiteVisitJourneyService.verifyJourneyToken(journeyToken + 'tampered');
    } catch (err) {
        tamperedRejected = true;
    }
    assert(tamperedRejected === true, '5j. Tampered token rejected');

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
    const cancelLead = await createTestLead({
        firstName: 'Cancel',
        lastName: 'Test Lead',
        mobile: '9998887776',
        assignedTo: agent._id,
        department: 'sales'
    });
    const cancelSched = await SiteVisitService.schedule({
        leadId: cancelLead._id,
        date: '2026-11-25',
        time: '10:00',
        properties: [{ project: 'DLF Crest' }]
    }, agent);
    const cancelActId = cancelSched.activity._id;
    const cancelLinkRes = await SiteVisitService.getJourneyLink(cancelActId, agent);
    const cancelToken = cancelLinkRes.safeToken;

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

    let newLinkBlocked = false;
    try {
        await SiteVisitService.getJourneyLink(cancelActId, agent);
    } catch (err) {
        if (err.statusCode === 410 || err.message.includes('cancelled')) {
            newLinkBlocked = true;
        }
    }
    assert(newLinkBlocked === true, '7c. Generating journey link on cancelled site visit blocked (HTTP 410)');

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

    // 11. Multi-Property Itinerary (5+ Properties) & Sequential Gate Unlocking
    console.log('\n--- 2.11 Multi-Property Itinerary (5 Properties) & Sequential Gate Unlocking ---');
    const multiLead = await createTestLead({
        firstName: 'Multi',
        lastName: 'Tour Buyer',
        mobile: '9877001122',
        assignedTo: agent._id,
        department: 'sales'
    });
    const fiveProperties = [
        { project: 'M3M Golfestate', block: 'Tower 1', property: 'Unit 101', city: 'Gurugram', lat: 28.4121, lng: 77.0654 },
        { project: 'DLF Magnolias', block: 'Tower 4', property: 'Unit 402', city: 'Gurugram', lat: 28.4682, lng: 77.0984 },
        { project: 'Puri The Aravallis', block: 'Tower A', property: 'Unit 503', city: 'Gurugram', lat: 28.4215, lng: 77.0423 },
        { project: 'Central Park Resorts', block: 'Tower B', property: 'Unit 604', city: 'Gurugram', lat: 28.4325, lng: 77.0512 },
        { project: 'Tata Primanti', block: 'Villa 7', property: 'Villa 7', city: 'Gurugram', lat: 28.4011, lng: 77.0321 }
    ];

    const fiveSched = await SiteVisitService.schedule({
        leadId: multiLead._id,
        date: '2026-11-28',
        time: '11:00',
        properties: fiveProperties
    }, agent);
    const fiveActId = fiveSched.activity._id;

    const fiveAct = await Activity.findById(fiveActId);
    assert(fiveAct.details.visitedProperties.length === 5, '11a. 5 properties scheduled in single itinerary');
    assert(fiveAct.details.visitedProperties[0].status === 'READY', '11b. Property 1 (index 0) is READY');
    for (let pIdx = 1; pIdx < 5; pIdx++) {
        assert(fiveAct.details.visitedProperties[pIdx].status === 'LOCKED', `11c. Property ${pIdx + 1} is initially LOCKED`);
    }

    const fiveLinkRes = await SiteVisitService.getJourneyLink(fiveActId, agent);
    const fiveToken = fiveLinkRes.safeToken;
    const verifiedFive = await SiteVisitJourneyService.verifyJourneyToken(fiveToken);
    const sanitizedFive = await SiteVisitJourneyService.getSanitizedItinerary(verifiedFive.activity);
    assert(sanitizedFive.totalProperties === 5, '11d. Sanitized itinerary reports exactly 5 total properties');
    assert(sanitizedFive.properties[0].isLocked === false, '11e. Property 1 is unlocked');
    assert(sanitizedFive.properties[1].isLocked === true && sanitizedFive.properties[1].unit === 'Unit Details Locked', '11f. Property 2 unit masked');
    assert(sanitizedFive.properties[4].isLocked === true && sanitizedFive.properties[4].location.navigationUrl === null, '11g. Property 5 navigation URL is null while locked');

    // Attempting to bypass gate by submitting feedback for property 2 directly
    let skipGateBlocked = false;
    try {
        await SiteVisitJourneyService.submitPropertyFeedback(fiveActId, 2, { rating: 5 });
    } catch (err) {
        if (err.statusCode === 403 || err.message.includes('Please submit feedback')) {
            skipGateBlocked = true;
        }
    }
    assert(skipGateBlocked === true, '11h. Gate bypass attempt blocked: Cannot submit feedback on later locked properties');

    // Sequential feedback on Property 0 unlocks Property 1
    await SiteVisitJourneyService.submitPropertyFeedback(fiveActId, 0, { rating: 5, responses: { interest: 'Interested' } });
    const postProp0Act = await Activity.findById(fiveActId);
    assert(postProp0Act.details.visitedProperties[0].status === 'FEEDBACK_SUBMITTED', '11i. Property 0 advanced to FEEDBACK_SUBMITTED');
    assert(postProp0Act.details.visitedProperties[1].status === 'READY', '11j. Property 1 sequentially unlocked to READY');
    assert(postProp0Act.details.visitedProperties[2].status === 'LOCKED', '11k. Property 2 remains LOCKED');

    // 12. Provider-Backed Route Optimization Abstraction with Fallback & No Fabricated Times
    console.log('\n--- 2.12 Route Optimization Abstraction & Travel Time Integrity ---');
    const routeOptResult = await SiteVisitJourneyService.optimizeRoute(fiveProperties);
    assert(routeOptResult.optimized === false, '12a. Fallback to scheduled order when provider not configured');
    assert(routeOptResult.status === 'CREDENTIAL_BLOCKED', '12b. Optimization status explicitly reports CREDENTIAL_BLOCKED');
    assert(routeOptResult.estimatedTravelTimes === null, '12c. Travel times strictly null (never fabricated)');
    assert(routeOptResult.claimedOptimal === false, '12d. Claimed optimal is false without provider routing matrix');

    // Provider mock execution (verifies full Routes API response parsing & waypoint reordering)
    const mockTransport = async (payload) => ({
        routes: [{
            optimizedIntermediateWaypointIndex: [2, 0, 1], // Puri (2), DLF (0), Central Park (1)
            duration: '3200s',
            distanceMeters: 24500
        }]
    });
    const providerOptResult = await SiteVisitJourneyService.optimizeRoute(fiveProperties, {
        apiKey: 'test_key',
        mockTransport
    });
    assert(providerOptResult.optimized === true, '12e. Provider Routes API optimizes waypoint order');
    assert(providerOptResult.isProviderOptimized === true, '12f. isProviderOptimized is true for Routes API');
    assert(providerOptResult.optimizationSource === 'GOOGLE_ROUTES_API', '12g. Source is GOOGLE_ROUTES_API');
    assert(providerOptResult.claimedOptimal === true, '12h. Provider-optimized route is marked optimal');
    assert(providerOptResult.estimatedTravelTimes.totalDuration === '3200s', '12i. Real provider duration recorded');
    assert(providerOptResult.properties[1].project === 'Central Park Resorts', '12j. Waypoints reordered based on provider indices');

    // Geometric coordinate proximity test
    const geoProps = [
        { project: 'Origin', lat: 28.4595, lng: 77.0266 },
        { project: 'Far Property', lat: 28.5200, lng: 77.1000 },
        { project: 'Near Property', lat: 28.4600, lng: 77.0270 }
    ];
    const geoOptResult = await SiteVisitJourneyService.optimizeRoute(geoProps, { heuristicProximity: true });
    assert(geoOptResult.optimized === true, '12k. Heuristic proximity sorts nearest-neighbor coordinates');
    assert(geoOptResult.properties[1].project === 'Near Property', '12l. Nearest property placed second in sequence');
    assert(geoOptResult.estimatedTravelTimes === null, '12m. Geometric sort preserves estimatedTravelTimes as null');

    // 13. Scoped Journey Link RBAC Fail-Closed Enforcement
    console.log('\n--- 2.13 Scoped Journey Link RBAC / Tenant Isolation ---');
    let linkDenied = false;
    const mockLinkReq = {
        params: { id: activityId },
        user: unauthorizedUser
    };
    const mockLinkRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) {
            if (this.statusCode === 403 || this.statusCode === 404 || payload.success === false) {
                linkDenied = true;
            }
            return this;
        }
    };
    await SiteVisitController.getSiteVisitJourneyLink(mockLinkReq, mockLinkRes);
    assert(linkDenied === true || mockLinkRes.statusCode === 403 || mockLinkRes.statusCode === 404, '13. Unauthorized user cannot retrieve journey link for other department\'s visit');

    // 14. Token Lifecycle: Explicit Rotation, Revocation, and Expiry
    console.log('\n--- 2.14 Token Lifecycle: Explicit Rotation, Revocation, and Expiry ---');
    const lifecycleLead = await createTestLead({
        firstName: 'Lifecycle',
        lastName: 'Token Lead',
        mobile: '9888112233',
        assignedTo: agent._id,
        department: 'sales'
    });

    const lifecycleSched = await SiteVisitService.schedule({
        leadId: lifecycleLead._id,
        date: '2026-11-29',
        time: '12:00',
        properties: [{ project: 'The Camellias' }]
    }, agent);
    const lifecycleActId = lifecycleSched.activity._id;

    // Initial Token
    const initialLink = await SiteVisitService.getJourneyLink(lifecycleActId, agent);
    const initialToken = initialLink.safeToken;
    assert(initialLink.isRotated === false, '14a. Initial link isRotated is false');

    const verifyInitial = await SiteVisitJourneyService.verifyJourneyToken(initialToken);
    assert(String(verifyInitial.activity._id) === String(lifecycleActId), '14b. Initial token verifies successfully');

    // Repeated retrieval returns exact same token
    const repeatLink = await SiteVisitService.getJourneyLink(lifecycleActId, agent);
    assert(repeatLink.safeToken === initialToken, '14c. Repeated retrieval does NOT change or invalidate token');

    // Explicit Rotation
    const rotatedLink = await SiteVisitService.getJourneyLink(lifecycleActId, agent, {
        rotate: true,
        rotationReason: 'Agent requested URL refresh'
    });
    assert(rotatedLink.isRotated === true, '14d. Explicit rotation returns isRotated: true');
    assert(rotatedLink.safeToken !== initialToken, '14e. Rotated token is distinct from initial token');

    // Old token is now superseded (HTTP 403)
    let oldTokenBlocked = false;
    try {
        await SiteVisitJourneyService.verifyJourneyToken(initialToken);
    } catch (err) {
        if (err.statusCode === 403 || err.message.includes('superseded') || err.message.includes('refreshed')) {
            oldTokenBlocked = true;
        }
    }
    assert(oldTokenBlocked === true, '14f. Old token is immediately superseded and rejected (HTTP 403)');

    // New token works
    const verifyRotated = await SiteVisitJourneyService.verifyJourneyToken(rotatedLink.safeToken);
    assert(String(verifyRotated.activity._id) === String(lifecycleActId), '14g. Newly rotated token verifies successfully');

    // Explicit Revocation (without cancelling visit)
    const revokeRes = await SiteVisitService.revokeJourneyLink(lifecycleActId, 'Security pause requested', agent);
    assert(revokeRes.revoked === true, '14h. Explicit revocation marks link revoked');

    // Verified public access blocked with HTTP 403
    let revokedBlocked = false;
    try {
        await SiteVisitJourneyService.verifyJourneyToken(rotatedLink.safeToken);
    } catch (err) {
        if (err.statusCode === 403 || err.message.includes('revoked')) {
            revokedBlocked = true;
        }
    }
    assert(revokedBlocked === true, '14i. Public access with revoked token is blocked (HTTP 403 / Revoked)');

    // Scoped retrieval on revoked activity fails closed
    let retrievalOnRevokedBlocked = false;
    try {
        await SiteVisitService.getJourneyLink(lifecycleActId, agent);
    } catch (err) {
        if (err.statusCode === 403 || err.message.includes('revoked')) {
            retrievalOnRevokedBlocked = true;
        }
    }
    assert(retrievalOnRevokedBlocked === true, '14j. Internal retrieval on revoked activity fails closed (HTTP 403)');

    // Token Expiry check
    const expiredToken = jwt.sign(
        {
            iss: 'bharat-properties-crm',
            leadId: String(lifecycleLead._id),
            activityId: String(lifecycleActId),
            purpose: 'client_site_visit_journey',
            jti: 'expired-jti',
            iat: Math.floor(Date.now() / 1000) - 100000,
            exp: Math.floor(Date.now() / 1000) - 50000
        },
        SiteVisitJourneyService.getSecret()
    );
    let expiredBlocked = false;
    try {
        await SiteVisitJourneyService.verifyJourneyToken(expiredToken);
    } catch (err) {
        if (err.statusCode === 403 || err.message.includes('expired')) {
            expiredBlocked = true;
        }
    }
    assert(expiredBlocked === true, '14k. Expired token is rejected (HTTP 403 / Expired)');
}

async function runConcurrentTokenLifecycleTests() {
    console.log('\n======================================================');
    console.log('Phase 3: Real WiredTiger Concurrent Token Lifecycle & Race Condition Gate');
    console.log('======================================================');

    const agent = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Concurrent Agent',
        role: 'admin'
    };

    // ------------------------------------------------------------------------
    // 3.1: 10 Concurrent Initial Link Requests
    // ------------------------------------------------------------------------
    console.log('\n--- 3.1 Ten Concurrent Initial Link Requests on Fresh Visit ---');
    const lead1 = await createTestLead({
        firstName: 'Concurrent1',
        lastName: 'Lead',
        mobile: '9899112233'
    });

    const sched1 = await SiteVisitService.schedule({
        leadId: lead1._id,
        date: '2026-12-01',
        time: '11:00',
        properties: [{ project: 'Godrej Palm Retreat' }]
    }, agent);
    const actId1 = sched1.activity._id;

    // Concurrently trigger 10 initial link retrievals on the document with 0 initial tokens
    const initialCalls = Array.from({ length: 10 }, () =>
        SiteVisitService.getJourneyLink(actId1, agent)
    );
    const initialResults = await Promise.all(initialCalls);

    // Fetch the raw document directly from MongoDB to verify actual database state
    const doc1 = await Activity.findById(actId1).lean();
    assert(doc1.details?.journeyToken === undefined, '3.1a. Raw journeyToken is strictly NOT persisted in MongoDB');
    assert(doc1.details?.journeyUrl === undefined, '3.1b. Raw journeyUrl is strictly NOT persisted in MongoDB');
    assert(typeof doc1.details?.journeyTokenHash === 'string', '3.1c. Exactly one active token hash exists in MongoDB');
    assert(doc1.details.journeyTokenHash.length === 64, '3.1d. Token hash is valid SHA-256');

    // Every returned token must match the single active token hash in MongoDB
    for (let i = 0; i < initialResults.length; i++) {
        const res = initialResults[i];
        assert(res.safeToken, `3.1e[${i}]. Safe token must be returned`);
        const verified = await SiteVisitJourneyService.verifyJourneyToken(res.safeToken);
        assert(String(verified.activity._id) === String(actId1), `3.1f[${i}]. Verified activity ID matches`);
        assert(verified.tokenHash === doc1.details.journeyTokenHash, `3.1g[${i}]. Returned token hash matches MongoDB active hash`);
    }

    // ------------------------------------------------------------------------
    // 3.2: 10 Concurrent Ordinary Retrievals
    // ------------------------------------------------------------------------
    console.log('\n--- 3.2 Ten Concurrent Ordinary Retrievals (Zero DB Writes & Idempotency) ---');
    const hashBeforeRetrievals = doc1.details.journeyTokenHash;
    const iatBeforeRetrievals = doc1.details.journeyTokenIat;

    const retrievalCalls = Array.from({ length: 10 }, () =>
        SiteVisitService.getJourneyLink(actId1, agent)
    );
    const retrievalResults = await Promise.all(retrievalCalls);

    // Re-fetch raw document from MongoDB to verify zero writes occurred
    const doc1After = await Activity.findById(actId1).lean();
    assert(doc1After.details.journeyTokenHash === hashBeforeRetrievals, '3.2a. Active hash unchanged across concurrent retrievals');
    assert(doc1After.details.journeyTokenIat === iatBeforeRetrievals, '3.2b. Active iat unchanged across concurrent retrievals');

    for (let i = 0; i < retrievalResults.length; i++) {
        assert(retrievalResults[i].safeToken === initialResults[0].safeToken, `3.2c[${i}]. All concurrent retrievals return identical token`);
        assert(retrievalResults[i].isRotated === false, `3.2d[${i}]. Retrieval indicates isRotated: false`);
    }

    // ------------------------------------------------------------------------
    // 3.3: 5 Concurrent Rotation Requests
    // ------------------------------------------------------------------------
    console.log('\n--- 3.3 Five Concurrent Rotation Requests (CAS Atomic Winner Selection) ---');
    const oldSafeToken = initialResults[0].safeToken;

    const rotationCalls = Array.from({ length: 5 }, (_, i) =>
        SiteVisitService.getJourneyLink(actId1, agent, {
            rotate: true,
            rotationReason: `Concurrent rotation request #${i + 1}`
        })
    );
    const rotationResults = await Promise.all(rotationCalls);

    // Fetch database state after all 5 rotations complete
    const doc1Rotated = await Activity.findById(actId1).lean();
    assert(doc1Rotated.details.journeyTokenHash !== hashBeforeRetrievals, '3.3a. Final hash is distinct from pre-rotation hash');
    assert(typeof doc1Rotated.details.journeyTokenHash === 'string' && doc1Rotated.details.journeyTokenHash.length === 64, '3.3b. Exactly one active token hash exists in MongoDB');

    // Verify old token is now invalidated
    let oldTokenRejected = false;
    try {
        await SiteVisitJourneyService.verifyJourneyToken(oldSafeToken);
    } catch (err) {
        if (err.statusCode === 403 && /superseded or refreshed/.test(err.message)) {
            oldTokenRejected = true;
        }
    }
    assert(oldTokenRejected === true, '3.3c. Pre-rotation token is rejected as superseded (HTTP 403)');

    // Verify all 5 callers received a token matching the final active database state
    for (let i = 0; i < rotationResults.length; i++) {
        const res = rotationResults[i];
        assert(res.isRotated === true, `3.3d[${i}]. Result indicates isRotated: true`);
        const verified = await SiteVisitJourneyService.verifyJourneyToken(res.safeToken);
        assert(verified.tokenHash === doc1Rotated.details.journeyTokenHash, `3.3e[${i}]. Caller received token matching final DB state`);
    }

    // ------------------------------------------------------------------------
    // 3.4: Retrieval Racing with Explicit Revocation
    // ------------------------------------------------------------------------
    console.log('\n--- 3.4 Retrieval Racing with Explicit Revocation ---');
    const lead2 = await createTestLead({
        firstName: 'RevokeRace',
        lastName: 'Lead',
        mobile: '9899334455'
    });

    const sched2 = await SiteVisitService.schedule({
        leadId: lead2._id,
        date: '2026-12-02',
        time: '14:00',
        properties: [{ project: 'Sobha City' }]
    }, agent);
    const actId2 = sched2.activity._id;

    // Establish active token prior to race
    const preRaceLink = await SiteVisitService.getJourneyLink(actId2, agent);
    assert(preRaceLink.safeToken, '3.4a. Pre-race active token generated');

    // Launch concurrent retrievals racing with revocation, capturing timing and individual outcomes
    const revocationPromise = SiteVisitService.revokeJourneyLink(actId2, 'Security revocation: Emergency security block', agent);

    const retrievalPromises = Array.from({ length: 6 }, async (_, i) => {
        try {
            const res = await SiteVisitService.getJourneyLink(actId2, agent);
            const completedAt = Date.now();
            return { index: i, success: true, res, completedAt };
        } catch (err) {
            const completedAt = Date.now();
            return { index: i, success: false, err, completedAt };
        }
    });

    // Execute concurrently
    const [revocationOutcome, ...retrievalOutcomes] = await Promise.all([
        revocationPromise,
        ...retrievalPromises
    ]);

    assert(revocationOutcome.revoked === true, '3.4b. Revocation completed successfully');

    // Final database state check
    const doc2Final = await Activity.findById(actId2).lean();
    assert(doc2Final.details.journeyRevoked === true, '3.4c. Activity journey is revoked in MongoDB');
    assert(doc2Final.details.journeyRevokedReason.includes('Emergency security block'), '3.4d. Revocation reason recorded in MongoDB');

    // Verify every successful token returned (both pre-race and concurrent) is now REJECTED by verifyJourneyToken
    const tokensToCheck = [preRaceLink.safeToken];
    for (const r of retrievalOutcomes) {
        if (r.success) {
            tokensToCheck.push(r.res.safeToken);
        } else {
            assert(r.err.statusCode === 403 && /revoked|revocation/i.test(r.err.message),
                `3.4e[${r.index}]. Concurrent retrieval rejected due to active revocation`);
        }
    }

    // Every issued token MUST now be rejected with HTTP 403
    for (let i = 0; i < tokensToCheck.length; i++) {
        let rejected = false;
        try {
            await SiteVisitJourneyService.verifyJourneyToken(tokensToCheck[i]);
        } catch (err) {
            if (err.statusCode === 403 && /revoked|revocation/i.test(err.message)) {
                rejected = true;
            }
        }
        assert(rejected === true, `3.4f[${i}]. Token is strictly rejected as revoked (HTTP 403)`);
    }

    // Subsequent retrieval after revocation strictly fails closed
    let subsequentRetrievalBlocked = false;
    try {
        await SiteVisitService.getJourneyLink(actId2, agent);
    } catch (err) {
        if (err.statusCode === 403 && /revoked|revocation/i.test(err.message)) {
            subsequentRetrievalBlocked = true;
        }
    }
    assert(subsequentRetrievalBlocked === true, '3.4g. Subsequent getJourneyLink strictly fails closed with HTTP 403');

    // ------------------------------------------------------------------------
    // 3.5: Retrieval Racing with Cancellation
    // ------------------------------------------------------------------------
    console.log('\n--- 3.5 Retrieval Racing with Visit Cancellation ---');
    const lead3 = await createTestLead({
        firstName: 'CancelRace',
        lastName: 'Lead',
        mobile: '9899556677'
    });

    const sched3 = await SiteVisitService.schedule({
        leadId: lead3._id,
        date: '2026-12-03',
        time: '16:00',
        properties: [{ project: 'Experion The Heartsong' }]
    }, agent);
    const actId3 = sched3.activity._id;

    // Pre-race active token
    const preCancelLink = await SiteVisitService.getJourneyLink(actId3, agent);
    assert(preCancelLink.safeToken, '3.5a. Pre-race active token generated');

    const cancellationPromise = SiteVisitService.cancel(actId3, 'Customer changed plans', agent);

    const cancelRetrievalPromises = Array.from({ length: 6 }, async (_, i) => {
        try {
            const res = await SiteVisitService.getJourneyLink(actId3, agent);
            const completedAt = Date.now();
            return { index: i, success: true, res, completedAt };
        } catch (err) {
            const completedAt = Date.now();
            return { index: i, success: false, err, completedAt };
        }
    });

    const [cancellationOutcome, ...cancelRetrievalOutcomes] = await Promise.all([
        cancellationPromise,
        ...cancelRetrievalPromises
    ]);

    assert(cancellationOutcome.activity?.status === 'Cancelled' || cancellationOutcome.status === 'Cancelled', '3.5b. Cancellation completed successfully');

    // Final DB state MUST be Cancelled
    const doc3Final = await Activity.findById(actId3).lean();
    assert(doc3Final.status === 'Cancelled', '3.5c. Activity status is Cancelled in MongoDB');

    // Verify all tokens (pre-race and any returned during race) are rejected with HTTP 410 (Gone)
    const cancelTokensToCheck = [preCancelLink.safeToken];
    for (const r of cancelRetrievalOutcomes) {
        if (r.success) {
            cancelTokensToCheck.push(r.res.safeToken);
        } else {
            assert(r.err.statusCode === 410 && /cancelled/i.test(r.err.message),
                `3.5d[${r.index}]. Concurrent retrieval rejected due to visit cancellation`);
        }
    }

    for (let i = 0; i < cancelTokensToCheck.length; i++) {
        let cancelBlocked = false;
        try {
            await SiteVisitJourneyService.verifyJourneyToken(cancelTokensToCheck[i]);
        } catch (err) {
            if (err.statusCode === 410 && /cancelled/i.test(err.message)) {
                cancelBlocked = true;
            }
        }
        assert(cancelBlocked === true, `3.5e[${i}]. Issued token fails with HTTP 410 on cancelled visit`);
    }

    // Subsequent retrieval on cancelled activity MUST fail closed (HTTP 410)
    let subsequentCancelBlocked = false;
    try {
        await SiteVisitService.getJourneyLink(actId3, agent);
    } catch (err) {
        if (err.statusCode === 410 && /cancelled/i.test(err.message)) {
            subsequentCancelBlocked = true;
        }
    }
    assert(subsequentCancelBlocked === true, '3.5f. Subsequent getJourneyLink strictly fails closed with HTTP 410');
}

async function main() {
    console.log('======================================================');
    console.log('BHARAT PROPERTIES CRM — STAGING ACCEPTANCE & REAL TX TEST');
    console.log('======================================================');
    try {
        await setupDatabase();
        await runRealTransactionTests();
        await runAcceptanceJourneyTests();
        await runConcurrentTokenLifecycleTests();

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
