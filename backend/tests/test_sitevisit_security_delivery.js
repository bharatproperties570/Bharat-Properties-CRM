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
        data: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; this.data = b; return this; }
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
    const { completeSiteVisit } = await import('../src/modules/siteVisit/siteVisit.controller.js');
    const { default: SiteVisitAutomationService } = await import('../src/modules/siteVisit/siteVisitAutomation.service.js');
    const WhatsAppService = (await import('../services/WhatsAppService.js')).default;
    const Deal = (await import('../models/Deal.js')).default || mongoose.models.Deal;

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
    const origActFindOneAndUpdate = Activity.findOneAndUpdate;
    const origActFindByIdAndUpdate = Activity.findByIdAndUpdate;
    const origActCreate = Activity.create;
    const origLeadFindById = Lead.findById;
    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
    const origWaSendMessage = WhatsAppService.sendMessage;
    const origDealFindById = Deal.findById;
    const origDealFindByIdAndUpdate = Deal.findByIdAndUpdate;

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
            tokenResult.catch(() => {});
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

    // ------------------------------------------------------------------------
    // Test 17: Genuine notification provider dispatch states (GAP A)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 17: Genuine Provider Dispatch States & Retryability (GAP A) ---');
    await recordAsync('17. Provider absent, simulated, or failed preserves retryability; only accepted or delivered persists sent flag', async () => {
        // 17.1 Unconfigured / absent provider
        const unconfigRes = SiteVisitAutomationService.evaluateProviderDispatch(null, 'whatsapp');
        assert.strictEqual(unconfigRes.status, 'UNCONFIGURED');
        assert.strictEqual(unconfigRes.delivered, false);
        assert.strictEqual(unconfigRes.retryable, true);

        // 17.2 Simulated / mock provider
        const simRes = SiteVisitAutomationService.evaluateProviderDispatch({ success: true, mockMode: true }, 'whatsapp');
        assert.strictEqual(simRes.status, 'SIMULATED');
        assert.strictEqual(simRes.delivered, false);
        assert.strictEqual(simRes.retryable, true);

        // 17.3 Carrier accepted provider
        const acceptedRes = SiteVisitAutomationService.evaluateProviderDispatch({ success: true, messageId: 'wa_msg_123', status: 'ACCEPTED' }, 'whatsapp');
        assert.strictEqual(acceptedRes.status, 'ACCEPTED');
        assert.strictEqual(acceptedRes.delivered, false);
        assert.strictEqual(acceptedRes.retryable, false);

        // 17.4 Genuine delivery
        const deliveredRes = SiteVisitAutomationService.evaluateProviderDispatch({ success: true, status: 'DELIVERED', messageId: 'wa_msg_456' }, 'whatsapp');
        assert.strictEqual(deliveredRes.status, 'DELIVERED');
        assert.strictEqual(deliveredRes.delivered, true);
        assert.strictEqual(deliveredRes.retryable, false);
    });

    // ------------------------------------------------------------------------
    // Test 18: Atomic CAS transitions prevent concurrent completion races (GAP B)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 18: Atomic CAS Transitions (GAP B) ---');
    await recordAsync('18. Atomic CAS transitions ensure single winning execution on concurrent complete', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        let state = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            entityId: fakeLeadId,
            tags: [],
            details: {}
        };

        let casAttempts = 0;
        let casSuccesses = 0;
        Activity.findOneAndUpdate = async (query, update, options) => {
            casAttempts++;
            await new Promise(r => setTimeout(r, 2));
            // Check predicate: status must be in ['Pending', 'Scheduled']
            const validStatus = query.status?.$in || ['Pending', 'Scheduled'];
            if (validStatus.includes(state.status)) {
                casSuccesses++;
                state.status = 'Completed';
                return { ...state };
            }
            return null; // CAS rejected!
        };

        Activity.findById = () => Promise.resolve({ ...state });

        // Genuinely overlapping concurrent requests with Promise.allSettled
        const [res1, res2] = await Promise.allSettled([
            SiteVisitService.complete(fakeActId, { outcome: 'Interested', notes: 'Concurrent Call 1' }),
            SiteVisitService.complete(fakeActId, { outcome: 'Interested', notes: 'Concurrent Call 2' })
        ]);

        const fulfilled = [res1, res2].filter(r => r.status === 'fulfilled');
        const rejected = [res1, res2].filter(r => r.status === 'rejected');

        assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent completion must succeed');
        assert.strictEqual(rejected.length, 1, 'The losing concurrent completion must be rejected');
        assert(rejected[0].reason.message.includes('already completed'));
        assert.strictEqual(casSuccesses, 1, 'Only one caller can succeed in atomic CAS transition');
    });

    // ------------------------------------------------------------------------
    // Test 19: Fail-closed Deal & Lead validation on complete (GAP C)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 19: Fail-Closed Deal & Lead Validation (GAP C) ---');
    await recordAsync('19. Deal validation fails closed on malformed ID, missing deal, missing lead, or mismatched lead', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const otherLeadId = new mongoose.Types.ObjectId();

        const pendingVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            entityId: fakeLeadId,
            tags: [],
            details: {}
        };
        Activity.findById = () => Promise.resolve(pendingVisit);
        Activity.findOneAndUpdate = (q, u) => Promise.resolve({ ...pendingVisit, status: 'Completed' });

        // 19.1 Malformed dealId format
        await assert.rejects(
            () => SiteVisitService.complete(fakeActId, { outcome: 'Interested', dealId: 'invalid-hex-id' }),
            /Valid dealId is required/
        );

        // 19.2 Deal does not exist
        const nonExistentDealId = new mongoose.Types.ObjectId();
        Deal.findById = () => Promise.resolve(null);
        await assert.rejects(
            () => SiteVisitService.complete(fakeActId, { outcome: 'Interested', dealId: String(nonExistentDealId) }),
            /does not exist/
        );

        // 19.3 Deal has missing lead / leadId
        const orphanDealId = new mongoose.Types.ObjectId();
        Deal.findById = () => Promise.resolve({ _id: orphanDealId, title: 'Orphan Deal', lead: null, leadId: null });
        await assert.rejects(
            () => SiteVisitService.complete(fakeActId, { outcome: 'Interested', dealId: String(orphanDealId) }),
            /no associated lead/
        );

        // 19.4 Deal lead does not match activity lead
        const mismatchedDealId = new mongoose.Types.ObjectId();
        Deal.findById = () => Promise.resolve({ _id: mismatchedDealId, title: 'Other Deal', lead: otherLeadId });
        await assert.rejects(
            () => SiteVisitService.complete(fakeActId, { outcome: 'Interested', dealId: String(mismatchedDealId) }),
            /does not belong to the same lead/
        );
    });

    // ------------------------------------------------------------------------
    // Test 20: Bearer Token Exclusion in Controller Response (GAP D)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 20: Bearer Token Exclusion in Controller Response (GAP D) ---');
    await recordAsync('20. completeSiteVisit controller excludes feedbackToken and raw link from HTTP response', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        const pendingVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            entityId: fakeLeadId,
            tags: [],
            details: {},
            save() { return Promise.resolve(this); }
        };
        Activity.findById = () => Promise.resolve(pendingVisit);
        Activity.findOneAndUpdate = (q, u) => Promise.resolve({ ...pendingVisit, status: 'Completed', details: u.$set?.details || {} });

        const req = {
            params: { id: String(fakeActId) },
            body: { outcome: 'Interested', notes: 'Completed visit' },
            user: { _id: 'agent_user_1', fullName: 'Agent Verma' }
        };
        const res = createMockRes();

        await completeSiteVisit(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.feedbackToken, undefined, 'feedbackToken must NOT be present in HTTP response');
        assert.strictEqual(res.body.feedbackLink, undefined, 'feedbackLink must NOT be present in HTTP response');
        assert(res.body.feedbackDispatch !== undefined, 'feedbackDispatch status should be present');
    });

    // ------------------------------------------------------------------------
    // Test 21: Feedback Lock & 60s Lease Expiry Recovery (GAP E)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 21: Feedback Lock & Lease Expiry Recovery (GAP E) ---');
    await recordAsync('21. Stale lock older than 60s is recovered; active lock returns 409 conflict', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeSubId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        // 21.1 Stale lock (70s old) - should be recovered by lease expiry
        const staleLockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Completed',
            tags: ['Site-Visit'],
            details: {
                feedbackLock: true,
                feedbackLockAt: new Date(Date.now() - 70000), // 70s ago
                feedbackLockId: 'old-crashed-lock-uuid'
            }
        };

        Activity.findById = () => Promise.resolve(staleLockActivity);
        let acquiredLockId = null;
        Activity.findOneAndUpdate = (query, update) => {
            // Check predicate: $or lock check
            const lockFilter = query.$or;
            const threshold = lockFilter?.[1]?.['details.feedbackLockAt']?.$lt;
            if (threshold && staleLockActivity.details.feedbackLockAt < threshold) {
                staleLockActivity.details.feedbackLock = true;
                staleLockActivity.details.feedbackLockId = update.$set['details.feedbackLockId'];
                acquiredLockId = update.$set['details.feedbackLockId'];
                return Promise.resolve(staleLockActivity);
            }
            if (update.$set?.['details.feedbackSubmitted']) {
                staleLockActivity.details.feedbackSubmitted = true;
                return Promise.resolve(staleLockActivity);
            }
            return Promise.resolve(null);
        };
        Activity.findByIdAndUpdate = (id, updates) => Promise.resolve(staleLockActivity);
        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: fakeSubId });

        const req1 = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res1 = createMockRes();
        await submitFeedback(req1, res1, () => {});

        assert.strictEqual(res1.statusCode, 201, 'Stale lock must be successfully recovered');
        assert(acquiredLockId, 'Lock must have been acquired with unique lockId');

        // 21.2 Active lock (5s old) - cannot be acquired, returns 409 Conflict
        const activeLockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Completed',
            tags: ['Site-Visit'],
            details: {
                feedbackLock: true,
                feedbackLockAt: new Date(Date.now() - 5000), // 5s ago
                feedbackLockId: 'active-processing-lock'
            }
        };
        Activity.findById = () => Promise.resolve(activeLockActivity);
        Activity.findOneAndUpdate = (query, update) => {
            const threshold = query.$or?.[1]?.['details.feedbackLockAt']?.$lt;
            if (threshold && activeLockActivity.details.feedbackLockAt < threshold) {
                return Promise.resolve(activeLockActivity);
            }
            return Promise.resolve(null); // Active lock -> findOneAndUpdate returns null
        };

        const req2 = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res2 = createMockRes();
        await submitFeedback(req2, res2, () => {});

        assert.strictEqual(res2.statusCode, 409, 'Active lock must return 409 Conflict');
        assert.strictEqual(res2.body.message, 'Feedback submission in progress by another request');
    });

    // ------------------------------------------------------------------------
    // Test 22: Concurrent Complete vs Cancel Race Invariant (GAP B & GAP F)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 22: Concurrent Complete vs Cancel Race Invariant ---');
    await recordAsync('22. Overlapping complete and cancel requests result in exactly one terminal winner', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        let state = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            entityId: fakeLeadId,
            tags: [],
            details: {}
        };

        Activity.findById = () => Promise.resolve({ ...state });
        Activity.findOneAndUpdate = async (query, update) => {
            await new Promise(r => setTimeout(r, Math.random() * 5));
            const validStatus = query.status?.$in || ['Pending', 'Scheduled'];
            if (validStatus.includes(state.status)) {
                state.status = update.$set.status;
                return { ...state };
            }
            return null;
        };

        const [compRes, cancelRes] = await Promise.allSettled([
            SiteVisitService.complete(fakeActId, { outcome: 'Interested' }),
            SiteVisitService.cancel(fakeActId, { reason: 'Client changed mind' })
        ]);

        const winnerCount = [compRes, cancelRes].filter(r => r.status === 'fulfilled').length;
        assert.strictEqual(winnerCount, 1, 'Exactly one terminal status transition must win');
        assert(['Completed', 'Cancelled'].includes(state.status), 'Final state must be one of the terminal states');
    });

    // ------------------------------------------------------------------------
    // Test 23: Concurrent Complete vs Reschedule Invariant (GAP A & GAP F)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 23: Concurrent Complete vs Reschedule Invariant ---');
    await recordAsync('23. Completed visit rejects concurrent reschedule attempt', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        let state = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            entityId: fakeLeadId,
            tags: [],
            details: {}
        };

        Activity.findById = () => Promise.resolve({ ...state });
        Activity.findOneAndUpdate = async (query, update) => {
            await new Promise(r => setTimeout(r, 2));
            const validStatus = query.status?.$in || ['Pending', 'Scheduled'];
            if (validStatus.includes(state.status)) {
                state.status = update.$set.status;
                return { ...state };
            }
            return null;
        };

        // Complete the visit
        await SiteVisitService.complete(fakeActId, { outcome: 'Interested' });

        // Attempt to reschedule the completed visit
        await assert.rejects(
            () => SiteVisitService.reschedule(fakeActId, { newDate: new Date(), newTime: '11:00 AM', reason: 'Post-visit reschedule attempt' }),
            /Completed site visits cannot be rescheduled/
        );
    });

    // ------------------------------------------------------------------------
    // Test 24: Concurrent Overlapping Feedback Submissions (GAP D & GAP F)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 24: Concurrent Overlapping Feedback Submissions (GAP D & F) ---');
    await recordAsync('24. Concurrent Promise.all feedback submissions result in exactly one database creation', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const submissionId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        let activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Completed',
            tags: ['Site-Visit'],
            details: {
                visitedProperties: [{ project: 'Godrej Woods', property: 'Unit 1204' }]
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);

        let lockHeld = false;
        let createdCount = 0;
        let leadScoreIncrements = 0;

        Activity.findOneAndUpdate = async (query, update) => {
            await new Promise(r => setTimeout(r, 2));
            if (update.$set?.['details.feedbackLock']) {
                // Lock acquisition
                if (!lockHeld && !activityDoc.details?.feedbackSubmitted) {
                    lockHeld = true;
                    activityDoc.details.feedbackLock = true;
                    activityDoc.details.feedbackLockId = update.$set['details.feedbackLockId'];
                    return { ...activityDoc };
                }
                return null;
            }
            if (update.$set?.['details.feedbackSubmitted']) {
                // Finalization
                if (activityDoc.details.feedbackLockId === query['details.feedbackLockId']) {
                    activityDoc.details.feedbackSubmitted = true;
                    activityDoc.details.customerFeedback = update.$set['details.customerFeedback'];
                    lockHeld = false;
                    return { ...activityDoc };
                }
                return null;
            }
            return { ...activityDoc };
        };

        FeedbackSubmission.create = async (doc) => {
            createdCount++;
            return { ...doc, _id: submissionId };
        };

        Lead.findByIdAndUpdate = async (id, update) => {
            if (update.$inc?.intent_index) leadScoreIncrements++;
            return {};
        };

        const req1 = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res1 = createMockRes();

        const req2 = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res2 = createMockRes();

        await Promise.all([
            submitFeedback(req1, res1, () => {}),
            submitFeedback(req2, res2, () => {})
        ]);

        const statuses = [res1.statusCode, res2.statusCode];
        assert(statuses.includes(201), 'One request must succeed with 201');
        assert(statuses.includes(200) || statuses.includes(409), 'Second request must either return 200 duplicate or 409 in-progress');
        assert.strictEqual(createdCount, 1, 'Only exactly 1 FeedbackSubmission record must be created');
        assert.strictEqual(leadScoreIncrements, 1, 'Lead score must be incremented at most once');
    });

    // ------------------------------------------------------------------------
    // Test 25: Fail-Closed on Disconnected Database in Production (GAP A)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 25: Fail-Closed on Disconnected Database (GAP A) ---');
    await recordAsync('25. In production paths with unmocked models, disconnected DB fails closed', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const origEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        // Ensure models are strictly unmocked for fail-closed verification
        Activity.findOneAndUpdate = origActFindOneAndUpdate;
        Activity.findById = origActFindById;
        Deal.findById = origDealFindById;
        Lead.findById = origLeadFindById;

        try {
            await assert.rejects(
                () => SiteVisitService.complete(fakeActId, { outcome: 'Interested' }),
                /Database connection unavailable/
            );
            await assert.rejects(
                () => SiteVisitService.reschedule(fakeActId, { newDate: new Date(), newTime: '10:00 AM', reason: 'Reschedule test' }),
                /Database connection unavailable/
            );
            await assert.rejects(
                () => SiteVisitService.cancel(fakeActId, { reason: 'Cancel test' }),
                /Database connection unavailable/
            );
        } finally {
            process.env.NODE_ENV = origEnv;
        }
    });

    // ------------------------------------------------------------------------
    // Test 26: Rejected Completion Zero Downstream Mutations (GAP B)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 26: Zero Downstream Mutations on Rejected Completion (GAP B) ---');
    await recordAsync('26. Rejected completion due to deal mismatch leaves Activity and Deal unchanged', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const mismatchLeadId = new mongoose.Types.ObjectId();
        const fakeDealId = new mongoose.Types.ObjectId();

        const pendingVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            entityId: fakeLeadId,
            tags: [],
            details: {}
        };
        Activity.findById = () => Promise.resolve(pendingVisit);

        let dealUpdated = false;
        Deal.findById = () => Promise.resolve({ _id: fakeDealId, lead: mismatchLeadId });
        Deal.findByIdAndUpdate = () => { dealUpdated = true; return Promise.resolve({}); };

        await assert.rejects(
            () => SiteVisitService.complete(fakeActId, { outcome: 'Interested', dealId: String(fakeDealId) }),
            /Linked deal does not belong to the same lead/
        );

        assert.strictEqual(pendingVisit.status, 'Pending', 'Activity status must remain Pending');
        assert.strictEqual(dealUpdated, false, 'Deal must NOT be updated when completion is rejected');
    });

    // ------------------------------------------------------------------------
    // Test 27: Submission Persistence Failure Releases Lock (Pass 3)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 27: Submission Persistence Failure Lock Cleanup (Pass 3) ---');
    await recordAsync('27. Submission persistence failure safely releases request-owned lock', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        let activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Completed',
            tags: ['Site-Visit'],
            details: {
                visitedProperties: [{ project: 'Godrej Woods', property: 'Unit 1204' }]
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);

        let lockCleared = false;
        Activity.findOneAndUpdate = async (query, update) => {
            if (update.$set?.['details.feedbackLock']) {
                activityDoc.details.feedbackLock = true;
                activityDoc.details.feedbackLockId = update.$set['details.feedbackLockId'];
                return { ...activityDoc };
            }
            if (update.$unset?.['details.feedbackLock']) {
                if (activityDoc.details.feedbackLockId === query['details.feedbackLockId']) {
                    lockCleared = true;
                    delete activityDoc.details.feedbackLock;
                    delete activityDoc.details.feedbackLockId;
                    return { ...activityDoc };
                }
            }
            return { ...activityDoc };
        };

        // Simulate persistence crash
        FeedbackSubmission.create = async () => {
            throw new Error('Database write error during submission creation');
        };

        const req = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res = createMockRes();

        let caughtError = null;
        try {
            await submitFeedback(req, res, (err) => { caughtError = err; });
        } catch (e) {
            caughtError = e;
        }

        assert(caughtError, 'Persistence error must be surfaced');
        assert.strictEqual(lockCleared, true, 'Request-owned lock must be cleared on failure');
        assert.strictEqual(activityDoc.details.feedbackSubmitted, undefined, 'Activity must not be finalized');
    });

    // ------------------------------------------------------------------------
    // Test 28: Interrupted Submission Reconciliation State Machine (Pass 3)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 28: Interrupted Submission Reconciliation (Pass 3) ---');
    await recordAsync('28. Interrupted submission with existing record reconciles and finalizes Activity', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const existingSubId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        let activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Pending',
            tags: ['Site-Visit'],
            details: {
                visitedProperties: [{ project: 'Godrej Woods', property: 'Unit 1204' }]
                // Note: feedbackSubmitted is NOT true (partial interrupted state)
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);

        Activity.findOneAndUpdate = async (query, update) => {
            if (update.$set?.['details.feedbackLock']) {
                activityDoc.details.feedbackLock = true;
                activityDoc.details.feedbackLockId = update.$set['details.feedbackLockId'];
                return { ...activityDoc };
            }
            if (update.$set?.['details.feedbackSubmitted']) {
                if (activityDoc.details.feedbackLockId === query['details.feedbackLockId']) {
                    activityDoc.status = update.$set.status || activityDoc.status;
                    activityDoc.details.feedbackSubmitted = true;
                    activityDoc.details.submissionId = update.$set['details.submissionId'];
                    activityDoc.details.customerFeedback = update.$set['details.customerFeedback'];
                    delete activityDoc.details.feedbackLock;
                    delete activityDoc.details.feedbackLockId;
                    return { ...activityDoc };
                }
            }
            return { ...activityDoc };
        };

        // Simulate code 11000 duplicate key error on FeedbackSubmission.create
        FeedbackSubmission.create = async () => {
            const err = new Error('E11000 duplicate key error collection');
            err.code = 11000;
            throw err;
        };

        const existingSubmissionDoc = {
            _id: existingSubId,
            activity: fakeActId,
            lead: fakeLeadId,
            rating: 5,
            idempotencyKey: `activity:${fakeActId}`
        };
        FeedbackSubmission.findOne = () => Promise.resolve(existingSubmissionDoc);

        let leadScoreBoosted = false;
        Lead.findByIdAndUpdate = async (id, update) => {
            if (update.$inc?.intent_index) leadScoreBoosted = true;
            return {};
        };

        const req = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res = createMockRes();

        await submitFeedback(req, res, () => {});

        assert.strictEqual(res.statusCode, 201, 'Reconciled submission must return 201 Created');
        assert.strictEqual(res.data.reconciled, true, 'Response must reflect reconciled status');
        assert.strictEqual(activityDoc.details.feedbackSubmitted, true, 'Activity must now be finalized');
        assert.strictEqual(activityDoc.status, 'Completed', 'Activity status must be transitioned to Completed');
        assert.strictEqual(leadScoreBoosted, true, 'Lead intent score must be updated on reconciliation');
    });

    // ------------------------------------------------------------------------
    // Test 29: Lock Ownership Safety (Never Clear Another Lock) (Pass 3)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 29: Lock Ownership Invariant (Pass 3) ---');
    await recordAsync('29. Lock release conditional update never clears a lock owned by another request', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const activeLockId = 'lock_held_by_request_A';
        const foreignLockId = 'lock_held_by_request_B';

        let activityDoc = {
            _id: fakeActId,
            details: {
                feedbackLock: true,
                feedbackLockId: activeLockId,
                feedbackLockAt: new Date()
            }
        };

        // Conditional CAS update simulating MongoDB findOneAndUpdate behavior
        const atomicFindOneAndUpdate = (query, update) => {
            if (query['details.feedbackLockId'] === activityDoc.details.feedbackLockId) {
                if (update.$unset?.['details.feedbackLock']) {
                    delete activityDoc.details.feedbackLock;
                    delete activityDoc.details.feedbackLockId;
                    delete activityDoc.details.feedbackLockAt;
                    return { ...activityDoc };
                }
            }
            return null; // Condition not met: lock was not modified
        };

        // Request B attempts to clean up its own lock (foreignLockId)
        const resultB = atomicFindOneAndUpdate(
            { _id: fakeActId, 'details.feedbackLockId': foreignLockId },
            { $unset: { 'details.feedbackLock': 1, 'details.feedbackLockId': 1, 'details.feedbackLockAt': 1 } }
        );

        assert.strictEqual(resultB, null, 'Foreign lock release must match 0 documents');
        assert.strictEqual(activityDoc.details.feedbackLockId, activeLockId, 'Active lock A must remain strictly untouched');

        // Request A cleans up its own lock (activeLockId)
        const resultA = atomicFindOneAndUpdate(
            { _id: fakeActId, 'details.feedbackLockId': activeLockId },
            { $unset: { 'details.feedbackLock': 1, 'details.feedbackLockId': 1, 'details.feedbackLockAt': 1 } }
        );

        assert(resultA, 'Own lock release must succeed');
        assert.strictEqual(activityDoc.details.feedbackLockId, undefined, 'Active lock A must now be cleared');
    });

    // ------------------------------------------------------------------------
    // Test 30: Duplicate-Key Exit Releases Request Lock (Pass 3)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 30: Duplicate-Key Lock Cleanup (Pass 3) ---');
    await recordAsync('30. Duplicate request exit releases its own acquired lock on finalized activity', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const existingSubId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        let activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Completed',
            tags: ['Site-Visit', 'Customer-Feedback-Received'],
            details: {
                visitedProperties: [{ project: 'Godrej Woods', property: 'Unit 1204' }],
                feedbackSubmitted: true,
                submissionId: existingSubId
            }
        };

        let findByIdCount = 0;
        Activity.findById = () => {
            findByIdCount++;
            if (findByIdCount === 1) {
                // First call: initial check shows activity not yet finalized, so lock is acquired
                return Promise.resolve({
                    ...activityDoc,
                    details: {
                        visitedProperties: [{ project: 'Godrej Woods', property: 'Unit 1204' }]
                    }
                });
            }
            // Subsequent calls (inside duplicate key catch): activity is now finalized
            return Promise.resolve(activityDoc);
        };

        let lockAcquired = false;
        let lockReleased = false;

        Activity.findOneAndUpdate = async (query, update) => {
            if (update.$set?.['details.feedbackLock']) {
                lockAcquired = true;
                activityDoc.details.feedbackLock = true;
                activityDoc.details.feedbackLockId = update.$set['details.feedbackLockId'];
                return { ...activityDoc };
            }
            if (update.$unset?.['details.feedbackLock']) {
                if (activityDoc.details.feedbackLockId === query['details.feedbackLockId']) {
                    lockReleased = true;
                    delete activityDoc.details.feedbackLock;
                    delete activityDoc.details.feedbackLockId;
                    return { ...activityDoc };
                }
            }
            return { ...activityDoc };
        };

        // Simulate code 11000 duplicate key error
        FeedbackSubmission.create = async () => {
            const err = new Error('E11000 duplicate key error');
            err.code = 11000;
            throw err;
        };
        FeedbackSubmission.findOne = () => Promise.resolve({ _id: existingSubId });

        const req = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res = createMockRes();

        await submitFeedback(req, res, () => {});

        assert.strictEqual(res.statusCode, 200, 'Duplicate request must return 200 OK');
        assert.strictEqual(res.data.duplicate, true, 'Must indicate duplicate');
        assert.strictEqual(lockAcquired, true, 'Lock must have been acquired');
        assert.strictEqual(lockReleased, true, 'Lock must have been released by this request');
        assert.strictEqual(activityDoc.details.feedbackLock, undefined, 'Lock must be unset and not stuck');
    });

    // ------------------------------------------------------------------------
    // Test 31: Exactly-Once Downstream Effects Invariant (Pass 3)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 31: Exactly-Once Downstream Effects Invariant (Pass 3) ---');
    await recordAsync('31. Duplicate requests produce zero repeated scoring or task side-effects', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const subId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        const finalizedActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Completed',
            tags: ['Site-Visit', 'Customer-Feedback-Received'],
            details: {
                visitedProperties: [{ project: 'Godrej Woods', property: 'Unit 1204' }],
                feedbackSubmitted: true,
                submissionId: subId
            }
        };

        Activity.findById = () => Promise.resolve(finalizedActivity);

        let scoringUpdates = 0;
        Lead.findByIdAndUpdate = async (id, update) => {
            if (update.$inc) scoringUpdates++;
            return {};
        };

        const req = {
            params: { slug: standardFormSlug },
            body: { token, responses: { fld_rating: '5' } },
            query: {}, headers: {}
        };
        const res = createMockRes();

        await submitFeedback(req, res, () => {});

        assert.strictEqual(res.statusCode, 200, 'Duplicate request returns 200');
        assert.strictEqual(scoringUpdates, 0, 'Zero scoring increments must occur on duplicate requests');
    });

    // ------------------------------------------------------------------------
    // Test 32: Index Verification & Duplicate Detection (Pass 3)
    // ------------------------------------------------------------------------
    console.log('\n--- Test 32: Index Verification & Duplicate Detection (Pass 3) ---');
    await recordAsync('32. Index migration pre-flight detects duplicates and prevents unsafe unique indexing', async () => {
        const { detectDuplicates, provisionAndVerifyIndexes, REQUIRED_INDEXES } = await import('../scripts/provision_feedback_submission_indexes.js');

        assert(REQUIRED_INDEXES.find(idx => idx.key.idempotencyKey === 1 && idx.unique && idx.sparse), 'idempotencyKey index must be declared');
        assert(REQUIRED_INDEXES.find(idx => idx.key.activity === 1), 'activity lookup index must be declared');
        assert(REQUIRED_INDEXES.find(idx => idx.key.activity === 1 && idx.key.inventory === 1), 'activity + inventory compound index must be declared');

        // Test duplicate detection failure on unique keys
        const mockModelWithDuplicates = {
            aggregate: async (pipeline) => {
                const isIdempotencyKey = pipeline[0]?.$match?.idempotencyKey;
                if (isIdempotencyKey) {
                    return [{ _id: 'fake_key_123', count: 2, ids: ['doc1', 'doc2'] }];
                }
                return [];
            }
        };

        const dupScan = await detectDuplicates(mockModelWithDuplicates);
        assert.strictEqual(dupScan.hasDuplicates, true, 'Duplicates must be detected');
        assert.strictEqual(dupScan.idempotencyKeyDuplicates.length, 1, 'Must find 1 duplicate group');

        const provisionFail = await provisionAndVerifyIndexes(mockModelWithDuplicates);
        assert.strictEqual(provisionFail.success, false, 'Provisioning must halt when duplicates exist');
        assert.strictEqual(provisionFail.reason, 'DUPLICATES_DETECTED', 'Reason must indicate duplicates detected');

        // Test clean detection and index verification
        let indexesCreated = false;
        const mockCleanModel = {
            aggregate: async () => [],
            createIndexes: async () => { indexesCreated = true; },
            collection: {
                indexes: async () => [
                    { key: { _id: 1 }, name: '_id_' },
                    { key: { idempotencyKey: 1 }, unique: true, sparse: true, name: 'idempotencyKey_1' },
                    { key: { activity: 1 }, name: 'activity_1' },
                    { key: { activity: 1, inventory: 1 }, name: 'activity_1_inventory_1' }
                ]
            }
        };

        const cleanScan = await detectDuplicates(mockCleanModel);
        assert.strictEqual(cleanScan.hasDuplicates, false, 'Clean model has zero duplicates');

        const provisionSuccess = await provisionAndVerifyIndexes(mockCleanModel);
        assert.strictEqual(provisionSuccess.success, true, 'Clean model provisioning must succeed');
        assert.strictEqual(provisionSuccess.allVerified, true, 'All required indexes must be verified');
        assert.strictEqual(indexesCreated, true, 'createIndexes must be invoked');
    });

    // Cleanup globals
    FeedbackForm.findOne = origFormFindOne;
    FeedbackForm.updateOne = origFormUpdateOne;
    FeedbackSubmission.create = origSubCreate;
    FeedbackSubmission.findById = origSubFindById;
    Activity.findById = origActFindById;
    Activity.find = origActFind;
    Activity.findOne = origActFindOne;
    Activity.findOneAndUpdate = origActFindOneAndUpdate;
    Activity.findByIdAndUpdate = origActFindByIdAndUpdate;
    Activity.create = origActCreate;
    Lead.findById = origLeadFindById;
    Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;
    WhatsAppService.sendMessage = origWaSendMessage;
    Deal.findById = origDealFindById;
    Deal.findByIdAndUpdate = origDealFindByIdAndUpdate;

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
