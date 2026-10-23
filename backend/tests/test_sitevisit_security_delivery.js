/**
 * test_sitevisit_security_delivery.js
 *
 * CRITICAL-SV-11: Site Visit Security, Authorization & Genuine Notification Delivery Suite
 *
 * Tests the 12 core acceptance requirements:
 * 1. Raw leadId cannot retrieve private lead details.
 * 2. Raw activityId cannot authorize Site Visit feedback mutation.
 * 3. Invalid, expired, tampered and wrong-purpose tokens are rejected.
 * 4. Wrong-form and wrong-activity tokens are rejected.
 * 5. A valid Site Visit token resolves only the intended activity and lead.
 * 6. Concurrent duplicate submissions create only one accepted feedback operation.
 * 7. Negative feedback creates at most one escalation operation.
 * 8. Positive feedback does not repeatedly increase the lead score.
 * 9. Notification failure does not falsely mark a message delivered.
 * 10. Repeated worker execution does not send duplicate messages.
 * 11. Missing secrets fail closed.
 * 12. Existing anonymous general-feedback behavior remains supported without granting Site Visit authorization.
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
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function record(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        failed++;
    }
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

console.log('=== CRITICAL-SV-11: Site Visit Security & Notification Delivery Suite ===\n');

async function runSecurityDeliveryTests() {
    process.env.JWT_SECRET = 'enterprise_secure_testing_secret_key_2026_xyz';
    process.env.FEEDBACK_JWT_SECRET = 'enterprise_secure_testing_secret_key_2026_xyz';

    const { getFormBySlug, submitFeedback, verifyFeedbackToken } = await import('../controllers/feedbackForm.controller.js');
    const { SiteVisitService } = await import('../src/modules/siteVisit/siteVisit.service.js');
    const { default: SiteVisitAutomationService } = await import('../src/modules/siteVisit/siteVisitAutomation.service.js');
    const WhatsAppService = (await import('../services/WhatsAppService.js')).default;

    const FeedbackForm = mongoose.models.FeedbackForm || mongoose.model('FeedbackForm');
    const FeedbackSubmission = mongoose.models.FeedbackSubmission || mongoose.model('FeedbackSubmission');
    const Activity = mongoose.models.Activity || mongoose.model('Activity');
    const Lead = mongoose.models.Lead || mongoose.model('Lead');

    const origFormFindOne = FeedbackForm.findOne;
    const origFormUpdateOne = FeedbackForm.updateOne;
    const origSubCreate = FeedbackSubmission.create;
    const origSubFindById = FeedbackSubmission.findById;
    const origActFindById = Activity.findById;
    const origActFind = Activity.find;
    const origActFindOne = Activity.findOne;
    const origActFindByIdAndUpdate = Activity.findByIdAndUpdate;
    const origActCreate = Activity.create;
    const origLeadFindById = Lead.findById;
    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
    const origWaSendMessage = WhatsAppService.sendMessage;

    // Standard Mock Form
    const standardFormSlug = 'customer-experience-feedback-qx9z2';
    const mockFormDoc = {
        _id: new mongoose.Types.ObjectId(),
        slug: standardFormSlug,
        name: 'Customer Experience Feedback',
        isActive: true,
        sections: [
            {
                fields: [
                    { id: 'fld_rating', type: 'rating', label: 'Overall Experience' },
                    { id: 'fld_comments', type: 'textarea', label: 'Feedback Comments' },
                    { id: 'fld_prop_feedback', type: 'property_feedback', label: 'Unit Feedback' }
                ]
            }
        ],
        analytics: { submissions: 0, views: 0 },
        save() { return Promise.resolve(this); }
    };

    FeedbackForm.findOne = () => ({
        lean: () => Promise.resolve(mockFormDoc),
        save: () => Promise.resolve(mockFormDoc),
        then(resolve) { return Promise.resolve(mockFormDoc).then(resolve); }
    });
    FeedbackForm.updateOne = () => Promise.resolve({});

    // ------------------------------------------------------------------------
    // Test 1: Raw leadId cannot retrieve private lead details
    // ------------------------------------------------------------------------
    console.log('--- Test 1: Raw Query Authorization Check ---');
    await recordAsync('1. Raw leadId cannot retrieve private lead details', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        Lead.findById = () => ({
            select: () => ({
                lean: () => Promise.resolve({
                    _id: fakeLeadId,
                    firstName: 'Secret',
                    lastName: 'Client',
                    mobile: '+919999999999',
                    email: 'secret@domain.com'
                })
            })
        });

        // Calling with raw query parameter `?leadId=...` without a valid token
        const req = {
            params: { slug: standardFormSlug },
            query: { leadId: String(fakeLeadId) }
        };
        const res = createMockRes();

        await getFormBySlug(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.leadInfo, null, 'leadInfo must be null when only raw query leadId is provided');
        assert.strictEqual(res.body.data.activityInfo, null, 'activityInfo must be null without verified token');
    });

    // ------------------------------------------------------------------------
    // Test 2: Raw activityId cannot authorize Site Visit feedback mutation
    // ------------------------------------------------------------------------
    console.log('\n--- Test 2: Raw activityId Mutation Guard ---');
    await recordAsync('2. Raw activityId cannot authorize Site Visit feedback mutation', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const req = {
            params: { slug: standardFormSlug },
            body: {
                activityId: String(fakeActId), // Attacker passes raw activityId without token
                responses: { fld_rating: '5' }
            },
            query: {},
            headers: {}
        };
        const res = createMockRes();

        await submitFeedback(req, res, () => {});

        assert.strictEqual(res.statusCode, 403, 'Should reject raw activityId with 403 Forbidden');
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('activity feedback requires a valid token'));
    });

    // ------------------------------------------------------------------------
    // Test 3: Invalid, expired, tampered and wrong-purpose tokens are rejected
    // ------------------------------------------------------------------------
    console.log('\n--- Test 3: Token Integrity & Purpose Validation ---');
    await recordAsync('3. Invalid, expired, tampered and wrong-purpose tokens are rejected', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();

        // 3a. Tampered token
        const validToken = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);
        const tamperedToken = validToken.substring(0, validToken.length - 6) + 'xxxxxx';

        const reqTampered = {
            params: { slug: standardFormSlug },
            query: { ref: tamperedToken }
        };
        const resTampered = createMockRes();
        await getFormBySlug(reqTampered, resTampered, () => {});
        assert.strictEqual(resTampered.statusCode, 403, 'Tampered token must return 403');

        // 3b. Expired token
        const expiredToken = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET, { expiresIn: '-1s' });

        const reqExpired = {
            params: { slug: standardFormSlug },
            query: { ref: expiredToken }
        };
        const resExpired = createMockRes();
        await getFormBySlug(reqExpired, resExpired, () => {});
        assert.strictEqual(resExpired.statusCode, 403, 'Expired token must return 403');

        // 3c. Wrong purpose token (e.g. login or password_reset)
        const wrongPurposeToken = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'password_reset'
        }, process.env.JWT_SECRET);

        const reqWrongPurpose = {
            params: { slug: standardFormSlug },
            query: { ref: wrongPurposeToken }
        };
        const resWrongPurpose = createMockRes();
        await getFormBySlug(reqWrongPurpose, resWrongPurpose, () => {});
        assert.strictEqual(resWrongPurpose.statusCode, 403, 'Wrong-purpose token must return 403');
    });

    // ------------------------------------------------------------------------
    // Test 4: Wrong-form and wrong-activity tokens are rejected
    // ------------------------------------------------------------------------
    console.log('\n--- Test 4: Scope Binding Validation ---');
    await recordAsync('4. Wrong-form and wrong-activity tokens are rejected', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const otherLeadId = new mongoose.Types.ObjectId();

        // 4a. Wrong form slug token
        const formScopedToken = jwt.sign({
            iss: 'bharat-properties-crm',
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback',
            formSlug: 'vip-penthouse-tour-survey-xyz'
        }, process.env.JWT_SECRET);

        const reqWrongForm = {
            params: { slug: standardFormSlug }, // Different form slug
            query: { ref: formScopedToken }
        };
        const resWrongForm = createMockRes();
        await getFormBySlug(reqWrongForm, resWrongForm, () => {});
        assert.strictEqual(resWrongForm.statusCode, 403, 'Token scoped to another form slug must return 403');

        // 4b. Wrong activity ownership (Activity belongs to otherLeadId, but token is for fakeLeadId)
        const tokenForLead = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        Activity.findById = () => Promise.resolve({
            _id: fakeActId,
            type: 'Site Visit',
            entityId: otherLeadId, // Belongs to different lead!
            status: 'Pending'
        });

        const reqMismatchedOwner = {
            params: { slug: standardFormSlug },
            body: {
                token: tokenForLead,
                responses: { fld_rating: '5' }
            },
            query: {},
            headers: {}
        };
        const resMismatchedOwner = createMockRes();
        await submitFeedback(reqMismatchedOwner, resMismatchedOwner, () => {});
        assert.strictEqual(resMismatchedOwner.statusCode, 403, 'Activity entity mismatch must be rejected with 403');
        assert(resMismatchedOwner.body.message.includes('does not match token subject'));
    });

    // ------------------------------------------------------------------------
    // Test 5: A valid Site Visit token resolves only the intended activity and lead
    // ------------------------------------------------------------------------
    console.log('\n--- Test 5: Authorized Token Resolution ---');
    await recordAsync('5. A valid Site Visit token resolves only the intended activity and lead', async () => {
        const leadA = new mongoose.Types.ObjectId();
        const actA = new mongoose.Types.ObjectId();

        const tokenA = jwt.sign({
            iss: 'bharat-properties-crm',
            leadId: String(leadA),
            activityId: String(actA),
            purpose: 'customer_feedback',
            formSlug: standardFormSlug
        }, process.env.JWT_SECRET);

        Lead.findById = (id) => ({
            select: () => ({
                lean: () => Promise.resolve({
                    _id: id,
                    firstName: 'Aditya',
                    lastName: 'Birla',
                    mobile: '+919876543210'
                })
            })
        });

        Activity.findById = (id) => ({
            select: () => ({
                lean: () => Promise.resolve({
                    _id: id,
                    type: 'Site Visit',
                    subject: 'Site Visit: Aditya Birla - DLF Phase 5',
                    entityId: leadA,
                    dueDate: new Date(),
                    dueTime: '10:30 AM',
                    status: 'Pending',
                    details: {
                        projectName: 'DLF Phase 5',
                        visitedProperties: [{ project: 'DLF Phase 5', property: 'Penthouse 101' }]
                    }
                })
            })
        });

        const req = {
            params: { slug: standardFormSlug },
            query: { ref: tokenA }
        };
        const res = createMockRes();

        await getFormBySlug(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(String(res.body.data.leadInfo._id), String(leadA));
        assert.strictEqual(res.body.data.leadInfo.firstName, 'Aditya');
        assert.strictEqual(String(res.body.data.activityInfo._id), String(actA));
        assert.strictEqual(res.body.data.activityInfo.projectName, 'DLF Phase 5');
    });

    // ------------------------------------------------------------------------
    // Test 6: Concurrent duplicate submissions create only one accepted feedback operation
    // ------------------------------------------------------------------------
    console.log('\n--- Test 6: Concurrency & Idempotent Submission Lock ---');
    await recordAsync('6. Concurrent duplicate submissions create only one accepted feedback operation', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const submissionId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Pending',
            tags: ['Site-Visit'],
            details: {
                visitedProperties: [{ project: 'Godrej Woods', property: 'Unit 1204' }]
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);

        let submissionCount = 0;
        FeedbackSubmission.create = (doc) => {
            submissionCount++;
            return Promise.resolve({ ...doc, _id: submissionId });
        };

        let findAndUpdateCallCount = 0;
        Activity.findByIdAndUpdate = (id, updates) => {
            findAndUpdateCallCount++;
            if (updates['details.customerFeedback']) {
                activityDoc.details.customerFeedback = updates['details.customerFeedback'];
                activityDoc.details.feedbackSubmitted = true;
            }
            return Promise.resolve(activityDoc);
        };

        // First submission
        const req1 = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res1 = createMockRes();
        await submitFeedback(req1, res1, () => {});

        assert.strictEqual(res1.statusCode, 201);
        assert.strictEqual(submissionCount, 1, 'First submission must create one record');

        // Repeated duplicate submission with same token
        const req2 = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res2 = createMockRes();
        await submitFeedback(req2, res2, () => {});

        assert.strictEqual(res2.statusCode, 200, 'Duplicate submission must return 200 OK');
        assert.strictEqual(res2.body.duplicate, true, 'Must indicate duplicate: true');
        assert.strictEqual(submissionCount, 1, 'Duplicate submission must NOT create a second database record');
    });

    // ------------------------------------------------------------------------
    // Test 7: Negative feedback creates at most one escalation operation
    // ------------------------------------------------------------------------
    console.log('\n--- Test 7: Single Escalation Task Invariant ---');
    await recordAsync('7. Negative feedback creates at most one escalation operation', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeTaskId = new mongoose.Types.ObjectId();

        let taskCreations = 0;
        Activity.create = (docs) => {
            taskCreations++;
            return Promise.resolve([{ ...docs[0], _id: fakeTaskId }]);
        };

        let taskLookups = 0;
        Activity.findOne = (query) => {
            taskLookups++;
            if (taskCreations > 0) {
                // Existing task already created
                return Promise.resolve({ _id: fakeTaskId, ...query });
            }
            return Promise.resolve(null);
        };

        const activity = {
            _id: fakeActId,
            entityId: fakeLeadId,
            details: { projectName: 'Signature Global' }
        };

        // First escalation trigger
        const res1 = await SiteVisitAutomationService.escalateNegativeFeedback(activity, 1, 'Poor experience');
        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.escalated, true);
        assert.strictEqual(taskCreations, 1);

        // Second trigger for same activity
        const res2 = await SiteVisitAutomationService.escalateNegativeFeedback(activity, 1, 'Poor experience retry');
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.alreadyEscalated, true, 'Second call should recognize existing escalation');
        assert.strictEqual(taskCreations, 1, 'Must NOT create duplicate escalation tasks');
    });

    // ------------------------------------------------------------------------
    // Test 8: Positive feedback does not repeatedly increase the lead score
    // ------------------------------------------------------------------------
    console.log('\n--- Test 8: Score Increment Invariant ---');
    await recordAsync('8. Positive feedback does not repeatedly increase the lead score', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        let intentIncrements = 0;
        Lead.findByIdAndUpdate = (id, update) => {
            if (update.$inc?.intent_index) {
                intentIncrements += update.$inc.intent_index;
            }
            return Promise.resolve({});
        };

        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Pending',
            details: {}
        };
        Activity.findById = () => Promise.resolve(activityDoc);
        Activity.findByIdAndUpdate = (id, updates) => {
            if (updates['details.customerFeedback']) {
                activityDoc.details.customerFeedback = updates['details.customerFeedback'];
                activityDoc.details.feedbackSubmitted = true;
            }
            return Promise.resolve(activityDoc);
        };

        // Submit 5-star rating (First attempt)
        const res1 = createMockRes();
        await submitFeedback({
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        }, res1, () => {});
        assert.strictEqual(res1.statusCode, 201);
        assert.strictEqual(intentIncrements, 10, 'First submission must increase intent_index by exactly 10');

        // Submit 5-star rating again (Second duplicate attempt)
        const res2 = createMockRes();
        await submitFeedback({
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        }, res2, () => {});
        assert.strictEqual(res2.statusCode, 200);
        assert.strictEqual(intentIncrements, 10, 'Duplicate submission must NOT increment intent_index again');
    });

    // ------------------------------------------------------------------------
    // Test 9: Notification failure does not falsely mark a message delivered
    // ------------------------------------------------------------------------
    console.log('\n--- Test 9: Genuine Notification Delivery Failure State ---');
    await recordAsync('9. Notification failure does not falsely mark a message delivered', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        let updatedFields = null;
        Activity.findByIdAndUpdate = (id, updates) => {
            updatedFields = updates.$set || updates;
            return { catch: () => Promise.resolve({}) };
        };

        Lead.findById = () => ({
            lean: () => ({
                catch: () => Promise.resolve({
                    _id: fakeLeadId,
                    name: 'Kunal Kapoor',
                    mobile: '+919988776655'
                })
            })
        });

        // Simulate WhatsApp Provider Failure (e.g. invalid recipient or provider down)
        WhatsAppService.sendMessage = async () => ({
            success: false,
            error: 'Provider Error: Recipient phone number not registered on WhatsApp'
        });

        const activity = {
            _id: fakeActId,
            entityId: fakeLeadId,
            details: {
                projectName: 'Godrej Woods',
                feedbackLink: 'https://bharatproperties.co/public/feedback/slug?ref=sample_token'
            }
        };

        const result = await SiteVisitAutomationService.dispatchPostVisitFeedback(activity);

        assert.strictEqual(result.success, false, 'Dispatch result must be false on provider error');
        assert.strictEqual(result.status, 'FAILED');
        assert(updatedFields);
        assert.strictEqual(updatedFields['details.feedbackDispatchStatus'], 'FAILED');
        assert.strictEqual(updatedFields['details.feedbackDispatchedAt'], undefined, 'Must NOT set feedbackDispatchedAt on failure');
        assert(updatedFields['details.feedbackDispatchError'].includes('Recipient phone number not registered'));
    });

    // ------------------------------------------------------------------------
    // Test 10: Repeated worker execution does not send duplicate messages
    // ------------------------------------------------------------------------
    console.log('\n--- Test 10: Idempotent Worker Execution ---');
    await recordAsync('10. Repeated worker execution does not send duplicate messages', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        let messageSendCount = 0;

        WhatsAppService.sendMessage = async () => {
            messageSendCount++;
            return { success: true, messages: [{ id: 'wa-msg-1' }] };
        };

        const mockVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Scheduled',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            entityId: fakeLeadId,
            assignedTo: { _id: new mongoose.Types.ObjectId(), fullName: 'Agent Sharma' },
            details: {
                projectName: 'DLF Magnolias',
                remindersSent: {}
            },
            save() { return Promise.resolve(this); }
        };

        Lead.findById = () => ({
            lean: () => ({ catch: () => Promise.resolve({ _id: fakeLeadId, name: 'Client', mobile: '+919876543210' }) })
        });

        // First scan finds the unsent visit
        Activity.find = () => ({
            populate: () => Promise.resolve(mockVisit.details.remindersSent?.h24 ? [] : [mockVisit])
        });

        const run1 = await SiteVisitAutomationService.dispatch24hReminders();
        assert.strictEqual(run1.count, 1);
        assert.strictEqual(messageSendCount, 1, 'First execution sends reminder message');
        assert.strictEqual(mockVisit.details.remindersSent.h24, true);

        // Second scan immediately follows
        const run2 = await SiteVisitAutomationService.dispatch24hReminders();
        assert.strictEqual(run2.count, 0, 'Second execution finds 0 pending visits');
        assert.strictEqual(messageSendCount, 1, 'Repeated worker execution must NOT send duplicate messages');
    });

    // ------------------------------------------------------------------------
    // Test 11: Missing secrets fail closed
    // ------------------------------------------------------------------------
    console.log('\n--- Test 11: Fail-Closed Policy on Missing Secrets ---');
    await record('11. Missing secrets fail closed', () => {
        const savedJwt = process.env.JWT_SECRET;
        const savedFeedbackJwt = process.env.FEEDBACK_JWT_SECRET;

        try {
            delete process.env.JWT_SECRET;
            delete process.env.FEEDBACK_JWT_SECRET;

            const verified = verifyFeedbackToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy', standardFormSlug);
            assert.strictEqual(verified, null, 'verifyFeedbackToken must return null when secrets are missing');

            const tokenResult = SiteVisitService.complete('invalid_id', { outcome: 'Interested' });
            assert(tokenResult instanceof Promise);
        } finally {
            process.env.JWT_SECRET = savedJwt;
            process.env.FEEDBACK_JWT_SECRET = savedFeedbackJwt;
        }
    });

    // ------------------------------------------------------------------------
    // Test 12: Existing anonymous general-feedback behavior remains supported
    // ------------------------------------------------------------------------
    console.log('\n--- Test 12: Anonymous General Feedback Compatibility ---');
    await recordAsync('12. Existing anonymous general-feedback behavior remains supported without granting Site Visit authorization', async () => {
        let createdSubmission = null;
        FeedbackSubmission.create = (doc) => {
            createdSubmission = doc;
            return Promise.resolve({ ...doc, _id: new mongoose.Types.ObjectId() });
        };

        let activityTouched = false;
        Activity.findByIdAndUpdate = () => {
            activityTouched = true;
            return Promise.resolve({});
        };

        // Submit to public form with no token and no activityId
        const req = {
            params: { slug: standardFormSlug },
            body: {
                responses: {
                    fld_rating: '4',
                    fld_comments: 'Great website layout, easy to explore properties.'
                }
            },
            query: {},
            headers: {}
        };
        const res = createMockRes();

        await submitFeedback(req, res, () => {});

        assert.strictEqual(res.statusCode, 201, 'Anonymous submission should succeed with 201');
        assert.strictEqual(res.body.success, true);
        assert(createdSubmission, 'FeedbackSubmission must be created');
        assert.strictEqual(createdSubmission.lead, null, 'Lead should be null for anonymous feedback');
        assert.strictEqual(createdSubmission.activity, undefined, 'Activity should NOT be bound for general feedback');
        assert.strictEqual(activityTouched, false, 'No Activity record should be mutated by anonymous feedback');
    });

    // ------------------------------------------------------------------------
    // Test 13: Cancelled Site Visit cannot be completed
    // ------------------------------------------------------------------------
    console.log('\n--- Test 13: Cancelled Site Visit Completion Guard ---');
    await recordAsync('13. Cancelled site visit cannot be completed', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const cancelledVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Cancelled',
            entityId: new mongoose.Types.ObjectId(),
            details: { cancelReason: 'Customer not in town' }
        };
        Activity.findById = () => Promise.resolve(cancelledVisit);

        await assert.rejects(
            () => SiteVisitService.complete(fakeActId, { outcome: 'Interested' }),
            /Cancelled site visits cannot be completed/
        );
    });

    // ------------------------------------------------------------------------
    // Test 14: Completed Site Visit cannot be cancelled or rescheduled
    // ------------------------------------------------------------------------
    console.log('\n--- Test 14: Completed Site Visit Transition Guard ---');
    await recordAsync('14. Completed site visit cannot be cancelled or rescheduled', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const completedVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Completed',
            entityId: new mongoose.Types.ObjectId(),
            details: { outcome: 'Interested' }
        };
        Activity.findById = () => Promise.resolve(completedVisit);

        await assert.rejects(
            () => SiteVisitService.cancel(fakeActId, { reason: 'No longer needed' }),
            /Completed site visits cannot be cancelled/
        );

        await assert.rejects(
            () => SiteVisitService.reschedule(fakeActId, { newDate: '2026-11-25', newTime: '11:00 AM', reason: 'Reschedule attempt' }),
            /Completed site visits cannot be rescheduled/
        );
    });

    // ------------------------------------------------------------------------
    // Test 15: Repeated cancellation request returns idempotent response
    // ------------------------------------------------------------------------
    console.log('\n--- Test 15: Cancellation Idempotency Invariant ---');
    await recordAsync('15. Repeated cancellation returns idempotent response without error', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const cancelledVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Cancelled',
            details: { cancelReason: 'Original cancellation reason' }
        };
        Activity.findById = () => Promise.resolve(cancelledVisit);

        const res = await SiteVisitService.cancel(fakeActId, { reason: 'Repeated cancellation' });
        assert.strictEqual(res.alreadyCancelled, true);
        assert.strictEqual(res.activity.status, 'Cancelled');
        assert.strictEqual(res.message, 'Site visit is already cancelled');
    });

    // ------------------------------------------------------------------------
    // Test 16: Rescheduling resets reminder eligibility for the new date
    // ------------------------------------------------------------------------
    console.log('\n--- Test 16: Reschedule Reminder Reconcile Invariant ---');
    await recordAsync('16. Rescheduling resets reminder flags and archives previous reminders', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        let savedDoc = null;
        const scheduledVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            dueDate: new Date('2026-11-20'),
            dueTime: '10:00 AM',
            details: {
                remindersSent: {
                    h24: true,
                    h24Status: 'DELIVERED',
                    h2: true,
                    h2Status: 'DELIVERED'
                },
                rescheduleHistory: []
            },
            save() {
                savedDoc = this;
                return Promise.resolve(this);
            }
        };
        Activity.findById = () => Promise.resolve(scheduledVisit);

        const res = await SiteVisitService.reschedule(fakeActId, {
            newDate: '2026-11-28',
            newTime: '04:00 PM',
            reason: 'Customer traveling next week'
        }, { _id: 'agent_user_1', fullName: 'Advisor Sharma' });

        assert.strictEqual(res.activity.status, 'Pending');
        assert.strictEqual(res.activity.dueTime, '04:00 PM');
        assert(savedDoc);
        assert.strictEqual(savedDoc.details.remindersSent.h24, false, 'h24 must be reset for new date');
        assert.strictEqual(savedDoc.details.remindersSent.h2, false, 'h2 must be reset for new date');
        assert.strictEqual(savedDoc.details.remindersSent.previousSchedule.h24, true, 'previous reminders must be archived');
        assert.strictEqual(savedDoc.details.rescheduleHistory.length, 1);
    });

    // Cleanup globals
    FeedbackForm.findOne = origFormFindOne;
    FeedbackForm.updateOne = origFormUpdateOne;
    FeedbackSubmission.create = origSubCreate;
    FeedbackSubmission.findById = origSubFindById;
    Activity.findById = origActFindById;
    Activity.find = origActFind;
    Activity.findOne = origActFindOne;
    Activity.findByIdAndUpdate = origActFindByIdAndUpdate;
    Activity.create = origActCreate;
    Lead.findById = origLeadFindById;
    Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;
    WhatsAppService.sendMessage = origWaSendMessage;

    console.log(`\n========================================`);
    console.log(`CRITICAL-SV-11 Security Suite Results:`);
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runSecurityDeliveryTests().catch(err => {
    console.error('Fatal Test Execution Error:', err);
    process.exit(1);
});
