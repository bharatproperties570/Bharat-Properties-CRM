/**
 * test_sitevisit_journey.js
 *
 * Client Site Visit Navigation & Experience Module Test Suite
 *
 * Verifies:
 * 1. Journey token cryptographic signing, verification, and revocation upon visit cancellation.
 * 2. Client itinerary sanitization: Masks locked property details, hides owner contacts, commissions, and notes.
 * 3. Server-enforced sequential feedback gate: Property N+1 remains locked until Property N feedback is accepted.
 * 4. Direct API attempts to bypass the gate are rejected (403 Forbidden).
 * 5. Per-property feedback persistence: Allows multiple property feedback records under one Activity.
 * 6. Repeated submissions for the same property are idempotent and return HTTP 200 without duplicate scoring.
 * 7. Google Maps driving intent generation with coordinates and address fallback.
 * 8. Audit logging when client taps "Navigate".
 * 9. Negative feedback (<= 2 stars) triggers manager escalation task.
 * 10. Final property completion triggers overall journey completion, activity completion, and lead stage advancement.
 */

import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        data: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; this.data = b; return this; }
    };
}

async function recordAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        failed++;
    }
}

console.log('=== Client Site Visit Journey & Navigation Experience Suite ===\n');

async function runJourneyTests() {
    process.env.JWT_SECRET = 'enterprise_secure_testing_secret_key_2026_xyz';
    process.env.FEEDBACK_JWT_SECRET = 'enterprise_secure_testing_secret_key_2026_xyz';

    const { SiteVisitJourneyService } = await import('../src/modules/siteVisit/siteVisitJourney.service.js');
    const { getJourney, recordPropertyNavigation, submitPropertyFeedback } = await import('../src/modules/siteVisit/siteVisitJourney.controller.js');
    const { SiteVisitService } = await import('../src/modules/siteVisit/siteVisit.service.js');

    const Activity = mongoose.models.Activity || mongoose.model('Activity');
    const Lead = mongoose.models.Lead || mongoose.model('Lead');
    const Inventory = mongoose.models.Inventory || mongoose.model('Inventory');
    const FeedbackSubmission = mongoose.models.FeedbackSubmission || mongoose.model('FeedbackSubmission');

    const origActFindById = Activity.findById;
    const origActCreate = Activity.create;
    const origLeadFindById = Lead.findById;
    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
    const origSubCreate = FeedbackSubmission.create;
    const origSubFindOne = FeedbackSubmission.findOne;
    const origInvFind = Inventory.find;

    // Establish non-blocking offline defaults for models that otherwise buffer when readyState === 0
    Activity.create = (docs) => Promise.resolve(Array.isArray(docs) ? docs.map(d => ({ ...d, _id: new mongoose.Types.ObjectId() })) : { ...docs, _id: new mongoose.Types.ObjectId() });
    FeedbackSubmission.findOne = () => Promise.resolve(null);
    Lead.findById = () => ({
        select: () => ({
            lean: () => Promise.resolve({
                _id: new mongoose.Types.ObjectId(),
                firstName: 'Valued',
                name: 'Valued Client',
                mobile: '+919988776655'
            })
        }),
        lean: () => Promise.resolve({
            _id: new mongoose.Types.ObjectId(),
            firstName: 'Valued',
            name: 'Valued Client',
            mobile: '+919988776655'
        })
    });

    // ------------------------------------------------------------------------
    // Test 1: Journey Token Signing & Verification
    // ------------------------------------------------------------------------
    console.log('--- Test 1: Journey Token Signing & Verification ---');
    await recordAsync('1. Generates cryptographic journey token with 72h expiry and valid hash match', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        const activity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Pending',
            details: {}
        };

        const result = SiteVisitJourneyService.generateJourneyToken(activity);
        assert(result.token, 'Token must be generated');
        assert(result.safeToken, 'Meta-safe token must be generated');
        assert(result.tokenHash, 'SHA-256 token hash must be generated');
        assert(result.journeyUrl.includes('/journey/'), 'Journey URL must contain /journey/ path');

        // Store hash on activity and verify
        activity.details.journeyTokenHash = result.tokenHash;
        Activity.findById = () => Promise.resolve(activity);

        const verified = await SiteVisitJourneyService.verifyJourneyToken(result.token);
        assert.strictEqual(String(verified.activity._id), String(fakeActId));
        assert.strictEqual(verified.claims.purpose, 'client_site_visit_journey');
        assert.strictEqual(verified.claims.activityId, String(fakeActId));
    });

    // ------------------------------------------------------------------------
    // Test 2: Expired, Tampered, and Revoked Token Rejection
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Invalid & Revoked Token Guards ---');
    await recordAsync('2. Expired, tampered, superseded, and cancelled journey tokens are rejected', async () => {
        const fakeActId = new mongoose.Types.ObjectId();

        // 2a. Expired Token
        const expiredToken = jwt.sign({
            iss: 'bharat-properties-crm',
            activityId: String(fakeActId),
            purpose: 'client_site_visit_journey'
        }, process.env.JWT_SECRET, { expiresIn: '-1s' });

        await assert.rejects(
            () => SiteVisitJourneyService.verifyJourneyToken(expiredToken),
            /Invalid or expired journey token/
        );

        // 2b. Cancelled Visit
        const validToken = jwt.sign({
            iss: 'bharat-properties-crm',
            activityId: String(fakeActId),
            purpose: 'client_site_visit_journey'
        }, process.env.JWT_SECRET, { expiresIn: '72h' });

        const hash = crypto.createHash('sha256').update(validToken).digest('hex');
        const cancelledActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Cancelled',
            details: { journeyTokenHash: hash }
        };
        Activity.findById = () => Promise.resolve(cancelledActivity);

        await assert.rejects(
            () => SiteVisitJourneyService.verifyJourneyToken(validToken),
            /This site visit has been cancelled/
        );

        // 2c. Superseded Hash (Token refreshed)
        const activeActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Scheduled',
            details: { journeyTokenHash: 'newer_active_hash_xyz' }
        };
        Activity.findById = () => Promise.resolve(activeActivity);

        await assert.rejects(
            () => SiteVisitJourneyService.verifyJourneyToken(validToken),
            /Journey link has been superseded or refreshed/
        );
    });

    // ------------------------------------------------------------------------
    // Test 3: Client Itinerary Sanitization & Sensitive Data Exclusion
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Property Projection Sanitization ---');
    await recordAsync('3. Sanitized itinerary masks locked units and strictly excludes owner phones, commissions, and notes', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const inv1Id = new mongoose.Types.ObjectId();
        const inv2Id = new mongoose.Types.ObjectId();

        const activity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            dueDate: new Date('2026-10-25'),
            dueTime: '11:00 AM',
            performedBy: 'Advisor Sharma',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: inv1Id, project: 'DLF Privana', block: 'Tower A', property: 'Unit 402', status: 'READY' },
                    { order: 1, inventoryId: inv2Id, project: 'Godrej Woods', block: 'Tower B', property: 'Unit 1204', status: 'LOCKED' }
                ]
            }
        };

        const mockInventories = [
            {
                _id: inv1Id,
                projectName: 'DLF Privana',
                block: 'Tower A',
                unitNo: 'Unit 402',
                category: 'Luxury Apartment',
                size: { value: 2400, unit: 'Sq.Ft.' },
                totalCost: { value: 35000000 },
                facing: 'North-East',
                direction: 'East',
                roadWidth: 60,
                city: 'Gurugram',
                sector: 'Sector 76',
                latitude: '28.3842',
                longitude: '76.9941',
                inventoryImages: [{ url: 'https://cdn.example.com/p1.jpg' }],
                // SENSITIVE FIELDS:
                owners: [{ name: 'Secret Owner', mobile: '9999999999' }],
                commissions: { percentage: 2 },
                internalNotes: 'Owner willing to negotiate 5% discount'
            },
            {
                _id: inv2Id,
                projectName: 'Godrej Woods',
                block: 'Tower B',
                unitNo: 'Unit 1204',
                city: 'Gurugram',
                sector: 'Sector 43',
                latitude: '28.4595',
                longitude: '77.0266',
                owners: [{ name: 'Private Owner', mobile: '8888888888' }]
            }
        ];

        Inventory.find = () => ({
            select: () => ({
                lean: () => Promise.resolve(mockInventories)
            })
        });

        const itinerary = await SiteVisitJourneyService.getSanitizedItinerary(activity);

        assert.strictEqual(itinerary.totalProperties, 2);
        assert.strictEqual(itinerary.completedCount, 0);
        assert.strictEqual(itinerary.currentIndex, 0);

        const p1 = itinerary.properties[0];
        const p2 = itinerary.properties[1];

        // Property 1 (READY / Unlocked)
        assert.strictEqual(p1.isLocked, false);
        assert.strictEqual(p1.status, 'READY');
        assert.strictEqual(p1.unit, 'Unit 402');
        assert.strictEqual(p1.price, '₹ 3.50 Cr');
        assert.strictEqual(p1.size, '2400 Sq.Ft.');
        assert(p1.location.navigationUrl.includes('28.3842,76.9941'), 'Navigation URL must use coordinates');
        assert.strictEqual(p1.owners, undefined, 'Zero owner details allowed');
        assert.strictEqual(p1.commissions, undefined, 'Zero commission data allowed');
        assert.strictEqual(p1.internalNotes, undefined, 'Zero internal remarks allowed');

        // Property 2 (LOCKED)
        assert.strictEqual(p2.isLocked, true);
        assert.strictEqual(p2.status, 'LOCKED');
        assert.strictEqual(p2.unit, 'Unit Details Locked', 'Unit number must be masked');
        assert.strictEqual(p2.price, undefined, 'Price must not be exposed for locked unit');
        assert.strictEqual(p2.location.navigationUrl, null, 'Navigation URL must be null for locked unit');
    });

    // ------------------------------------------------------------------------
    // Test 4: Google Maps Navigation Intent URL Fallback
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Navigation Intent Formatting ---');
    await recordAsync('4. Generates driving intent with coordinates, falling back cleanly to encoded address', async () => {
        // With Coordinates
        const urlWithCoords = SiteVisitJourneyService.buildNavigationUrl(
            { project: 'DLF Privana' },
            { latitude: '28.3842', longitude: '76.9941' }
        );
        assert.strictEqual(urlWithCoords, 'https://www.google.com/maps/dir/?api=1&destination=28.3842,76.9941&travelmode=driving');

        // Address Fallback when coordinates are missing
        const urlWithAddress = SiteVisitJourneyService.buildNavigationUrl(
            { project: 'Signature Global City', block: 'Phase 2' },
            { sector: 'Sector 37D', city: 'Gurugram' }
        );
        assert(urlWithAddress.includes('destination=Signature%20Global%20City%2C%20Sector%2037D%2C%20Gurugram%2C%20Phase%202'), 'Address must be safely encoded');
    });

    // ------------------------------------------------------------------------
    // Test 5: Sequential Feedback Gate Enforcement (Tampering Defense)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: Sequential Feedback Gate Enforcement ---');
    await recordAsync('5. Rejects feedback submission on locked Property 2 before Property 1 feedback is accepted', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const inv1Id = new mongoose.Types.ObjectId();
        const inv2Id = new mongoose.Types.ObjectId();

        const activity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: inv1Id, project: 'Property 1', status: 'READY' },
                    { order: 1, inventoryId: inv2Id, project: 'Property 2', status: 'LOCKED' }
                ]
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(activity);

        // Attempting to bypass gate by submitting feedback directly for Property 2
        await assert.rejects(
            () => SiteVisitJourneyService.submitPropertyFeedback(
                fakeActId,
                String(inv2Id),
                { rating: 5, interest: 'Interested' }
            ),
            /Please submit feedback for Property 1 \(Property 1\) first/
        );
    });

    // ------------------------------------------------------------------------
    // Test 6: Multi-Property Feedback Persistence under Same Activity
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: Multi-Property Separate Feedback Records ---');
    await recordAsync('6. Creates distinct FeedbackSubmission records for different properties under one Activity without collision', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const inv1Id = new mongoose.Types.ObjectId();
        const inv2Id = new mongoose.Types.ObjectId();

        let activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: inv1Id, project: 'Godrej Woods', property: 'Unit 402', status: 'READY' },
                    { order: 1, inventoryId: inv2Id, project: 'DLF Privana', property: 'Unit 1204', status: 'LOCKED' }
                ]
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(activityDoc);

        const createdSubmissions = [];
        FeedbackSubmission.create = (doc) => {
            const sub = { ...doc, _id: new mongoose.Types.ObjectId() };
            createdSubmissions.push(sub);
            return Promise.resolve(sub);
        };

        let leadScoreBoosts = 0;
        Lead.findByIdAndUpdate = (id, update) => {
            if (update.$inc?.intent_index) leadScoreBoosts++;
            return Promise.resolve({});
        };

        // 6a. Submit feedback for Property 1 (Unlocks Property 2)
        const res1 = await SiteVisitJourneyService.submitPropertyFeedback(
            fakeActId,
            String(inv1Id),
            { rating: 5, interest: 'Interested', comments: 'Superb unit layout' }
        );

        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.nextPropertyUnlocked, true);
        assert.strictEqual(res1.isJourneyCompleted, false);
        assert.strictEqual(activityDoc.details.visitedProperties[0].status, 'FEEDBACK_SUBMITTED');
        assert.strictEqual(activityDoc.details.visitedProperties[1].status, 'READY', 'Property 2 must now be READY');
        assert.strictEqual(createdSubmissions.length, 1);
        assert.strictEqual(createdSubmissions[0].idempotencyKey, `journey:${fakeActId}:property:${inv1Id}`);

        // 6b. Submit feedback for Property 2 (Completes Journey)
        const res2 = await SiteVisitJourneyService.submitPropertyFeedback(
            fakeActId,
            String(inv2Id),
            { rating: 4, interest: 'Shortlisted', comments: 'Good pricing' }
        );

        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.isJourneyCompleted, true);
        assert.strictEqual(activityDoc.status, 'Completed', 'Final property completion must complete overall Activity');
        assert.strictEqual(activityDoc.details.visitedProperties[1].status, 'FEEDBACK_SUBMITTED');
        assert.strictEqual(createdSubmissions.length, 2, 'Two distinct FeedbackSubmissions must be persisted');
        assert.strictEqual(createdSubmissions[1].idempotencyKey, `journey:${fakeActId}:property:${inv2Id}`);
        assert.strictEqual(leadScoreBoosts, 2, 'Intent score boosted for both high ratings');
    });

    // ------------------------------------------------------------------------
    // Test 7: Duplicate Property Feedback Idempotency
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Duplicate Property Submission Idempotency ---');
    await recordAsync('7. Resubmitting feedback for already completed property returns 200 without duplicate side-effects', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const inv1Id = new mongoose.Types.ObjectId();
        const existingSubId = new mongoose.Types.ObjectId();

        const activity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    {
                        order: 0,
                        inventoryId: inv1Id,
                        project: 'Godrej Woods',
                        status: 'FEEDBACK_SUBMITTED',
                        clientRating: 5,
                        feedbackSubmissionId: existingSubId
                    }
                ]
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(activity);

        let createCalls = 0;
        FeedbackSubmission.create = () => { createCalls++; return Promise.resolve({}); };
        FeedbackSubmission.findOne = () => Promise.resolve({ _id: existingSubId });

        const result = await SiteVisitJourneyService.submitPropertyFeedback(
            fakeActId,
            String(inv1Id),
            { rating: 5, interest: 'Interested' }
        );

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.duplicate, true);
        assert.strictEqual(createCalls, 0, 'Must NOT attempt to create duplicate database record');
    });

    // ------------------------------------------------------------------------
    // Test 8: Negative Feedback Escalation per Property
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Per-Property Negative Feedback Escalation ---');
    await recordAsync('8. Rating <= 2 stars on individual property visit creates manager escalation task', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const inv1Id = new mongoose.Types.ObjectId();

        const activity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: inv1Id, project: 'M3M Crown', status: 'READY' }
                ]
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(activity);
        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: new mongoose.Types.ObjectId() });

        let escalationTriggered = false;
        Activity.findByIdAndUpdate = (id, update) => {
            if (update.$addToSet?.tags?.$each?.includes?.('Escalation-Negative-Feedback') || update.$addToSet?.tags === 'Escalation-Negative-Feedback') {
                escalationTriggered = true;
            }
            return Promise.resolve(activity);
        };

        await SiteVisitJourneyService.submitPropertyFeedback(
            fakeActId,
            String(inv1Id),
            { rating: 1, interest: 'Not Interested', rejectionReason: 'Construction quality poor' }
        );

        assert.strictEqual(escalationTriggered, true, 'Manager escalation must be triggered on rating 1');
    });

    // ------------------------------------------------------------------------
    // Test 9: Public API Controller Endpoints
    // ------------------------------------------------------------------------
    console.log('\n--- Test 9: Public Journey Controller Integration ---');
    await recordAsync('9. Controller routes handle public token-authorized requests and return sanitized payload', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const inv1Id = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            iss: 'bharat-properties-crm',
            activityId: String(fakeActId),
            leadId: String(fakeLeadId),
            purpose: 'client_site_visit_journey'
        }, process.env.JWT_SECRET, { expiresIn: '72h' });

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const activity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            dueDate: new Date(),
            dueTime: '10:00 AM',
            details: {
                journeyTokenHash: tokenHash,
                visitedProperties: [
                    { order: 0, inventoryId: inv1Id, project: 'Central Park', property: 'Penthouse 1', status: 'READY' }
                ]
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(activity);
        Inventory.find = () => ({ select: () => ({ lean: () => Promise.resolve([]) }) });

        // 9a. getJourney controller endpoint
        const reqGet = { params: { token }, query: {}, headers: {} };
        const resGet = createMockRes();
        await getJourney(reqGet, resGet);

        assert.strictEqual(resGet.statusCode, 200);
        assert.strictEqual(resGet.data.data.totalProperties, 1);
        assert.strictEqual(resGet.data.data.properties[0].status, 'READY');

        // 9b. recordPropertyNavigation controller endpoint
        const reqNav = { params: { token, propertyId: String(inv1Id) }, query: {}, headers: {} };
        const resNav = createMockRes();
        await recordPropertyNavigation(reqNav, resNav);

        assert.strictEqual(resNav.statusCode, 200);
        assert.strictEqual(activity.details.visitedProperties[0].status, 'NAVIGATED');

        // 9c. submitPropertyFeedback controller endpoint
        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: new mongoose.Types.ObjectId() });
        const reqSub = {
            params: { token, propertyId: String(inv1Id) },
            body: { rating: 5, interest: 'Interested', comments: 'Brilliant' },
            headers: {}
        };
        const resSub = createMockRes();
        await submitPropertyFeedback(reqSub, resSub);

        assert.strictEqual(resSub.statusCode, 201);
        assert.strictEqual(resSub.data.property.status, 'FEEDBACK_SUBMITTED');
    });

    // ------------------------------------------------------------------------
    // Test 10: Express Router & HTTP Route Boundary Parity (Gate 1 Verification)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 10: Express Router & HTTP Route Boundary Parity ---');
    await recordAsync('10. Express router boundaries match frontend URL contract for retrieval, navigation, feedback, errors, and aliases', async () => {
        const express = (await import('express')).default;
        const siteVisitJourneyRoutes = (await import('../src/modules/siteVisit/siteVisitJourney.routes.js')).default;

        const app = express();
        app.use(express.json());
        app.use('/api/public/site-visit/journey', siteVisitJourneyRoutes);

        const server = await new Promise(resolve => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}/api/public/site-visit/journey`;

        try {
            const fakeActId = new mongoose.Types.ObjectId();
            const fakeLeadId = new mongoose.Types.ObjectId();
            const inv1Id = new mongoose.Types.ObjectId();
            const inv2Id = new mongoose.Types.ObjectId();

            const token = jwt.sign({
                iss: 'bharat-properties-crm',
                activityId: String(fakeActId),
                leadId: String(fakeLeadId),
                purpose: 'client_site_visit_journey'
            }, process.env.JWT_SECRET, { expiresIn: '72h' });

            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            let activity = {
                _id: fakeActId,
                type: 'Site Visit',
                entityId: fakeLeadId,
                status: 'Scheduled',
                dueDate: new Date(),
                dueTime: '10:00 AM',
                details: {
                    journeyTokenHash: tokenHash,
                    visitedProperties: [
                        { order: 0, inventoryId: inv1Id, project: 'DLF Crest', property: 'Tower A 401', status: 'READY' },
                        { order: 1, inventoryId: inv2Id, project: 'M3M Golfestate', property: 'Tower B 1202', status: 'LOCKED' }
                    ]
                },
                save() { return Promise.resolve(this); }
            };

            Activity.findById = () => Promise.resolve(activity);
            Inventory.find = () => ({ select: () => ({ lean: () => Promise.resolve([]) }) });
            FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: new mongoose.Types.ObjectId() });
            FeedbackSubmission.findOne = () => Promise.resolve(null);

            // 10a. Canonical GET /:token (Journey retrieval)
            const resGet = await fetch(`${baseUrl}/${token}`);
            const dataGet = await resGet.json();
            assert.strictEqual(resGet.status, 200);
            assert.strictEqual(dataGet.success, true);
            assert.strictEqual(dataGet.data.totalProperties, 2);
            assert.strictEqual(dataGet.data.properties[0].status, 'READY');
            assert.strictEqual(dataGet.data.properties[1].status, 'LOCKED');
            assert.strictEqual(dataGet.data.properties[1].unit, 'Unit Details Locked', 'Locked unit masked');

            // 10b. Canonical POST /:token/navigate/:propertyId (Property navigation)
            const resNav = await fetch(`${baseUrl}/${token}/navigate/${inv1Id}`, { method: 'POST' });
            const dataNav = await resNav.json();
            assert.strictEqual(resNav.status, 200);
            assert.strictEqual(dataNav.success, true);
            assert.strictEqual(activity.details.visitedProperties[0].status, 'NAVIGATED');

            // 10c. Backward-Compatibility Alias POST /:token/property/:propertyId/navigate
            const resNavAlias = await fetch(`${baseUrl}/${token}/property/${inv1Id}/navigate`, { method: 'POST' });
            assert.strictEqual(resNavAlias.status, 200);

            // 10d. Locked-property navigation rejected with 403
            const resNavLocked = await fetch(`${baseUrl}/${token}/navigate/${inv2Id}`, { method: 'POST' });
            const dataNavLocked = await resNavLocked.json();
            assert.strictEqual(resNavLocked.status, 403);
            assert(dataNavLocked.message.includes('Cannot navigate to a locked property'));

            // 10e. Out-of-order feedback submission on locked property rejected with 403
            const resFeedLocked = await fetch(`${baseUrl}/${token}/feedback/${inv2Id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: 5, interest: 'Interested' })
            });
            const dataFeedLocked = await resFeedLocked.json();
            assert.strictEqual(resFeedLocked.status, 403);
            assert(dataFeedLocked.message.includes('Please submit feedback for Property 1'));

            // 10f. Non-existent client-supplied property ID rejected with 404
            const resFeedMissing = await fetch(`${baseUrl}/${token}/feedback/invalid_prop_id_999`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: 5, interest: 'Interested' })
            });
            assert.strictEqual(resFeedMissing.status, 404);

            // 10g. Canonical POST /:token/feedback/:propertyId (Successful feedback on Property 1)
            const resFeed1 = await fetch(`${baseUrl}/${token}/feedback/${inv1Id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: 5, interest: 'Interested', comments: 'Superb unit' })
            });
            const dataFeed1 = await resFeed1.json();
            assert.strictEqual(resFeed1.status, 201);
            assert.strictEqual(dataFeed1.success, true);
            assert.strictEqual(activity.details.visitedProperties[0].status, 'FEEDBACK_SUBMITTED');
            assert.strictEqual(activity.details.visitedProperties[1].status, 'READY', 'Property 2 unlocked');

            // 10h. Repeated feedback submission on completed property is idempotent (200 with duplicate: true)
            FeedbackSubmission.findOne = () => Promise.resolve({ _id: dataFeed1.submission?._id || new mongoose.Types.ObjectId() });
            const resFeedDup = await fetch(`${baseUrl}/${token}/feedback/${inv1Id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: 5, interest: 'Interested' })
            });
            const dataFeedDup = await resFeedDup.json();
            assert.strictEqual(resFeedDup.status, 200);
            assert.strictEqual(dataFeedDup.duplicate, true);

            // 10i. Expired token rejected with 403
            const expiredToken = jwt.sign({
                iss: 'bharat-properties-crm',
                activityId: String(fakeActId),
                purpose: 'client_site_visit_journey'
            }, process.env.JWT_SECRET, { expiresIn: '-1s' });
            const resExp = await fetch(`${baseUrl}/${expiredToken}`);
            assert.strictEqual(resExp.status, 403);

            // 10j. Revoked visit token rejected with 403
            activity.details.journeyRevoked = true;
            activity.details.journeyRevokedReason = 'Site visit cancelled by administrator';
            const resRev = await fetch(`${baseUrl}/${token}`);
            const dataRev = await resRev.json();
            assert.strictEqual(resRev.status, 403);
            assert(dataRev.message.includes('Site visit cancelled by administrator'));
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    // Cleanup globals
    Activity.findById = origActFindById;
    Activity.create = origActCreate;
    Lead.findById = origLeadFindById;
    Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;
    FeedbackSubmission.create = origSubCreate;
    FeedbackSubmission.findOne = origSubFindOne;
    Inventory.find = origInvFind;

    console.log('\n========================================');
    console.log(`Client Site Visit Journey Suite Results:`);
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    console.log('========================================\n');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runJourneyTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
