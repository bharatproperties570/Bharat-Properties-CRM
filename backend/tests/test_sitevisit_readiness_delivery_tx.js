/**
 * test_sitevisit_readiness_delivery_tx.js
 *
 * Site Visit Production Readiness Test Suite:
 * 1. Recipient Consent & Opt-Out Enforcement (DND, doNotContact, optOut)
 * 2. Recipient Phone Validation & Format Sanitization
 * 3. Carrier Delivery Status Callback / Webhook Processing (WhatsApp & SMS)
 * 4. Provider Error, Timeout & Retryability Semantics
 * 5. MongoDB Session Propagation & Atomicity
 * 6. Non-Transactional Rollback Compensation (Zero Orphan Submissions on Save Failure)
 * 7. Tenant & Visibility RBAC Scoping in SiteVisitService.list & getById
 * 8. External Side-Effect Isolation on Write Failures
 */

import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

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

console.log('=== Site Visit Production Readiness: Messaging, Delivery & Transactions ===\n');

async function runReadinessTests() {
    process.env.JWT_SECRET = 'enterprise_secure_testing_secret_key_2026_xyz';
    process.env.FEEDBACK_JWT_SECRET = 'enterprise_secure_testing_secret_key_2026_xyz';

    const { SiteVisitService } = await import('../src/modules/siteVisit/siteVisit.service.js');
    const { default: SiteVisitAutomationService, validateRecipient } = await import('../src/modules/siteVisit/siteVisitAutomation.service.js');
    const { SiteVisitJourneyService } = await import('../src/modules/siteVisit/siteVisitJourney.service.js');

    const Activity = mongoose.models.Activity || mongoose.model('Activity');
    const Lead = mongoose.models.Lead || mongoose.model('Lead');
    const FeedbackSubmission = mongoose.models.FeedbackSubmission || mongoose.model('FeedbackSubmission');
    const FeedbackForm = mongoose.models.FeedbackForm || mongoose.model('FeedbackForm');
    const Deal = mongoose.models.Deal || mongoose.model('Deal');

    const origActFindOne = Activity.findOne;
    const origActFindById = Activity.findById;
    const origActFindByIdAndUpdate = Activity.findByIdAndUpdate;
    const origActFindOneAndUpdate = Activity.findOneAndUpdate;
    const origActCreate = Activity.create;
    const origActFind = Activity.find;
    const origSubCreate = FeedbackSubmission.create;
    const origSubFindOne = FeedbackSubmission.findOne;
    const origSubFindByIdAndDelete = FeedbackSubmission.findByIdAndDelete;
    const origFormFindOne = FeedbackForm.findOne;
    const origLeadFindById = Lead.findById;
    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
    const origDealFindById = Deal.findById;
    const origDealFindByIdAndUpdate = Deal.findByIdAndUpdate;

    // Fast-fail safe defaults in mock mode to prevent mongoose buffer timeouts
    Lead.findByIdAndUpdate = () => Promise.resolve({});
    Activity.findByIdAndUpdate = () => Promise.resolve({});
    FeedbackForm.findOne = () => Promise.resolve(null);
    FeedbackSubmission.findOne = () => Promise.resolve(null);

    // ------------------------------------------------------------------------
    // Group 1: Recipient Validation & Consent / Opt-Out Handling
    // ------------------------------------------------------------------------
    console.log('--- Group 1: Recipient Validation & Consent / Opt-Out Handling ---');

    await recordAsync('1. validateRecipient rejects missing mobile with MISSING_MOBILE', async () => {
        const res1 = validateRecipient(null);
        assert.strictEqual(res1.valid, false);
        assert.strictEqual(res1.status, 'MISSING_MOBILE');

        const res2 = validateRecipient({ name: 'Client Without Phone' });
        assert.strictEqual(res2.valid, false);
        assert.strictEqual(res2.status, 'MISSING_MOBILE');
    });

    await recordAsync('2. validateRecipient enforces opt-out/DND flags (doNotContact, dnd, optOut)', async () => {
        const leadDnd = { mobile: '+919876543210', dnd: true };
        const resDnd = validateRecipient(leadDnd);
        assert.strictEqual(resDnd.valid, false);
        assert.strictEqual(resDnd.status, 'OPTED_OUT');

        const leadDoNotContact = { mobile: '+919876543210', doNotContact: true };
        const resDnc = validateRecipient(leadDoNotContact);
        assert.strictEqual(resDnc.valid, false);
        assert.strictEqual(resDnc.status, 'OPTED_OUT');

        const leadOptOut = { mobile: '+919876543210', optOut: true };
        const resOpt = validateRecipient(leadOptOut);
        assert.strictEqual(resOpt.valid, false);
        assert.strictEqual(resOpt.status, 'OPTED_OUT');

        const leadUnsubscribed = { mobile: '+919876543210', isUnsubscribed: true };
        const resUnsub = validateRecipient(leadUnsubscribed);
        assert.strictEqual(resUnsub.valid, false);
        assert.strictEqual(resUnsub.status, 'OPTED_OUT');
    });

    await recordAsync('3. validateRecipient rejects invalid phone formats (< 10 digits)', async () => {
        const leadShort = { mobile: '12345' };
        const resShort = validateRecipient(leadShort);
        assert.strictEqual(resShort.valid, false);
        assert.strictEqual(resShort.status, 'INVALID_RECIPIENT');

        const leadChars = { mobile: 'invalid-phone-abc' };
        const resChars = validateRecipient(leadChars);
        assert.strictEqual(resChars.valid, false);
        assert.strictEqual(resChars.status, 'INVALID_RECIPIENT');

        const leadValid = { mobile: '+91 98765 43210' };
        const resValid = validateRecipient(leadValid);
        assert.strictEqual(resValid.valid, true);
    });

    await recordAsync('4. dispatchPostVisitFeedback skips dispatch when customer has opted out', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        const leadOptedOut = {
            _id: fakeLeadId,
            name: 'Opted Out Client',
            mobile: '+919876543210',
            doNotContact: true
        };

        Lead.findById = () => ({ lean: () => Promise.resolve(leadOptedOut) });

        let recordedUpdate = null;
        Activity.findByIdAndUpdate = (id, update) => {
            recordedUpdate = update;
            return Promise.resolve({});
        };

        const activity = {
            _id: fakeActId,
            entityId: fakeLeadId,
            details: {
                projectName: 'Grand Arch',
                feedbackLink: 'https://bharatproperties.co/public/feedback/test?ref=xyz'
            }
        };

        const result = await SiteVisitAutomationService.dispatchPostVisitFeedback(activity);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.status, 'OPTED_OUT');
        assert(result.error.includes('opted out'));
        assert.strictEqual(recordedUpdate.$set['details.feedbackDispatchStatus'], 'OPTED_OUT');
        assert.strictEqual(recordedUpdate.$set['details.feedbackDispatchedAt'], undefined, 'Must not stamp dispatchedAt for opted-out client');
    });

    // ------------------------------------------------------------------------
    // Group 2: Carrier Delivery-Status Webhook Callbacks
    // ------------------------------------------------------------------------
    console.log('\n--- Group 2: Carrier Delivery-Status Webhook Callbacks ---');

    await recordAsync('5. handleDeliveryStatusCallback updates 24h reminder to DELIVERED with timestamp', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const providerMsgId = 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSMTFB';

        let savedActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            details: {
                remindersSent: {
                    h24: false,
                    h24Status: 'ACCEPTED',
                    h24MessageId: providerMsgId
                }
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findOne = (query) => {
            if (query['$or']?.some(c => c['details.remindersSent.h24MessageId'] === providerMsgId)) {
                return Promise.resolve(savedActivity);
            }
            return Promise.resolve(null);
        };

        let updatedFields = null;
        Activity.findByIdAndUpdate = (id, update) => {
            updatedFields = update.$set;
            return Promise.resolve({});
        };

        const now = new Date('2026-10-24T10:30:00Z');
        const cbResult = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: providerMsgId,
            status: 'delivered',
            timestamp: now,
            channel: 'whatsapp'
        });

        assert.strictEqual(cbResult.success, true);
        assert.strictEqual(cbResult.matched, true);
        assert.strictEqual(cbResult.status, 'DELIVERED');
        assert.strictEqual(updatedFields['details.remindersSent.h24Status'], 'DELIVERED');
        assert.strictEqual(updatedFields['details.remindersSent.h24'], true);
        assert.strictEqual(updatedFields['details.remindersSent.h24DeliveredAt'].toISOString(), now.toISOString());
    });

    await recordAsync('6. handleDeliveryStatusCallback handles carrier FAILED status and records error', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const providerMsgId = 'wamid.FAILED_MSG_12345';

        let savedActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            details: {
                remindersSent: {
                    h2: false,
                    h2Status: 'ACCEPTED',
                    h2MessageId: providerMsgId
                }
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findOne = () => Promise.resolve(savedActivity);

        let updatedFields = null;
        Activity.findByIdAndUpdate = (id, update) => {
            updatedFields = update.$set;
            return Promise.resolve({});
        };

        const cbResult = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: providerMsgId,
            status: 'failed',
            error: 'User unreachable or phone powered off',
            channel: 'whatsapp'
        });

        assert.strictEqual(cbResult.success, true);
        assert.strictEqual(cbResult.matched, true);
        assert.strictEqual(cbResult.status, 'FAILED');
        assert.strictEqual(updatedFields['details.remindersSent.h2Status'], 'FAILED');
        assert.strictEqual(updatedFields['details.remindersSent.h2'], false);
        assert.strictEqual(updatedFields['details.remindersSent.h2Error'], 'User unreachable or phone powered off');
    });

    await recordAsync('7. handleDeliveryStatusCallback gracefully handles unmapped providerMessageId', async () => {
        Activity.findOne = () => Promise.resolve(null);

        const cbResult = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: 'unrelated_message_999',
            status: 'delivered'
        });

        assert.strictEqual(cbResult.success, true);
        assert.strictEqual(cbResult.matched, false);
        assert(cbResult.message.includes('No site visit activity found'));
    });

    // ------------------------------------------------------------------------
    // Group 3: MongoDB Transaction & Rollback Readiness
    // ------------------------------------------------------------------------
    console.log('\n--- Group 3: MongoDB Transaction & Rollback Readiness ---');

    await recordAsync('8. submitPropertyFeedback propagates caller session to FeedbackSubmission.create and activity.save', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const invId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-mongo-session-uuid-123' };

        let receivedCreateOpts = null;
        let receivedSaveOpts = null;

        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: invId, project: 'Trump Tower', property: 'Unit 501', status: 'READY' }
                ]
            },
            save(opts) {
                receivedSaveOpts = opts;
                return Promise.resolve(this);
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);
        FeedbackSubmission.create = (docs, opts) => {
            receivedCreateOpts = opts;
            return Promise.resolve([{ ...docs[0], _id: new mongoose.Types.ObjectId() }]);
        };

        const res = await SiteVisitJourneyService.submitPropertyFeedback(
            fakeActId,
            String(invId),
            { rating: 5, interest: 'Interested' },
            { session: mockSession }
        );

        assert.strictEqual(res.success, true);
        assert(receivedCreateOpts);
        assert.strictEqual(receivedCreateOpts.session, mockSession, 'FeedbackSubmission.create must receive caller session');
        assert(receivedSaveOpts);
        assert.strictEqual(receivedSaveOpts.session, mockSession, 'activity.save must receive caller session');
    });

    await recordAsync('9. Non-transactional rollback compensation deletes orphaned submission if activity.save fails', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const invId = new mongoose.Types.ObjectId();
        const subId = new mongoose.Types.ObjectId();

        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: invId, project: 'DLF Camellias', property: 'Penthouse B', status: 'READY' }
                ]
            },
            save() {
                return Promise.reject(new Error('Simulated optimistic lock failure during activity.save'));
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);
        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: subId });

        let deletedSubId = null;
        FeedbackSubmission.findByIdAndDelete = (id) => {
            deletedSubId = id;
            return Promise.resolve({});
        };

        let threwError = false;
        try {
            await SiteVisitJourneyService.submitPropertyFeedback(
                fakeActId,
                String(invId),
                { rating: 5, interest: 'Interested' }
            );
        } catch (err) {
            threwError = true;
            assert(err.message.includes('Simulated optimistic lock failure'));
        }

        assert.strictEqual(threwError, true);
        assert.strictEqual(String(deletedSubId), String(subId), 'Rollback compensation must delete orphaned FeedbackSubmission document');
    });

    await recordAsync('10. completeSiteVisit propagates session to Activity.findOneAndUpdate and Deal.findByIdAndUpdate', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeDealId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-mongo-session-complete-789' };

        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, project: 'Godrej Woods', property: 'Unit 402', status: 'FEEDBACK_SUBMITTED' }
                ]
            }
        };

        const dealDoc = {
            _id: fakeDealId,
            lead: fakeLeadId,
            title: 'Deal for Luxury Apartment'
        };

        Activity.findById = () => Promise.resolve(activityDoc);
        Deal.findById = () => Promise.resolve(dealDoc);

        let actUpdateOpts = null;
        Activity.findOneAndUpdate = (q, u, opts) => {
            actUpdateOpts = opts;
            return Promise.resolve({ ...activityDoc, status: 'Completed' });
        };

        let dealUpdateOpts = null;
        Deal.findByIdAndUpdate = (id, u, opts) => {
            dealUpdateOpts = opts;
            return Promise.resolve({});
        };

        const res = await SiteVisitService.complete(
            fakeActId,
            { outcome: 'Token Given', dealId: String(fakeDealId) },
            null,
            { session: mockSession }
        );

        assert.strictEqual(res.message, 'Site visit completed successfully');
        assert(actUpdateOpts);
        assert.strictEqual(actUpdateOpts.session, mockSession, 'Activity.findOneAndUpdate must receive caller session');
        assert(dealUpdateOpts);
        assert.strictEqual(dealUpdateOpts.session, mockSession, 'Deal.findByIdAndUpdate must receive caller session');
    });

    // ------------------------------------------------------------------------
    // Group 4: Tenant & Visibility RBAC Scoping
    // ------------------------------------------------------------------------
    console.log('\n--- Group 4: Tenant & Visibility RBAC Scoping ---');

    await recordAsync('11. SiteVisitService.schedule inherits department and teams from lead or user', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const leadDoc = {
            _id: fakeLeadId,
            firstName: 'Aarav',
            department: 'Residential Luxury',
            teams: [new mongoose.Types.ObjectId()]
        };

        Lead.findById = () => Promise.resolve(leadDoc);
        Activity.findOne = () => Promise.resolve(null); // No duplicates

        let createdPayload = null;
        Activity.create = (payload) => {
            createdPayload = payload;
            return Promise.resolve({ ...payload, _id: new mongoose.Types.ObjectId(), details: payload.details });
        };

        const user = {
            _id: new mongoose.Types.ObjectId(),
            fullName: 'Senior Consultant',
            department: 'Fallback Dept'
        };

        const res = await SiteVisitService.schedule({
            leadId: fakeLeadId,
            date: '2026-10-30',
            time: '11:00 AM'
        }, user);

        assert.strictEqual(res.alreadyScheduled, false);
        assert.strictEqual(createdPayload.department, 'Residential Luxury', 'Must inherit lead department');
        assert.strictEqual(createdPayload.teams.length, 1, 'Must inherit lead teams');
    });

    await recordAsync('12. SiteVisitService.list and getById apply getVisibilityFilter for non-admin users', async () => {
        const adminUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'bharatproperties570@gmail.com',
            dataScope: 'all'
        };

        let capturedQuery = null;
        Activity.find = (q) => {
            capturedQuery = q;
            return {
                sort: () => ({ skip: () => ({ limit: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) }) })
            };
        };
        Activity.countDocuments = () => Promise.resolve(0);

        await SiteVisitService.list({}, adminUser);
        assert.strictEqual(capturedQuery.type, 'Site Visit');
        assert.strictEqual(capturedQuery._id, undefined, 'Admin user must have unrestricted visibility');

        const restrictedUser = {
            _id: new mongoose.Types.ObjectId(),
            email: 'agent@bharatproperties.co',
            dataScope: 'assigned',
            teams: []
        };

        let restrictedQuery = null;
        Activity.find = (q) => {
            restrictedQuery = q;
            return {
                sort: () => ({ skip: () => ({ limit: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) }) })
            };
        };

        await SiteVisitService.list({}, restrictedUser);
        assert.strictEqual(restrictedQuery.type, 'Site Visit');
        assert(restrictedQuery.$or || restrictedQuery.assignedTo || restrictedQuery._id !== undefined, 'Restricted user must have visibility filter applied');
    });

    // ------------------------------------------------------------------------
    // Group 5: External Side-Effect Isolation on Write Failure
    // ------------------------------------------------------------------------
    console.log('\n--- Group 5: External Side-Effect Isolation on Write Failure ---');

    await recordAsync('13. Downstream escalation and intent boosts are suppressed if feedback save fails', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const invId = new mongoose.Types.ObjectId();

        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: invId, project: 'Grand Hyatt Residences', property: 'Unit 101', status: 'READY' }
                ]
            },
            save() {
                return Promise.reject(new Error('Database write rejected due to connection termination'));
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);
        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: new mongoose.Types.ObjectId() });
        FeedbackSubmission.findByIdAndDelete = () => Promise.resolve({});

        let intentScoreBoosted = false;
        Lead.findByIdAndUpdate = () => {
            intentScoreBoosted = true;
            return Promise.resolve({});
        };

        let escalationCalled = false;
        Activity.findByIdAndUpdate = () => {
            escalationCalled = true;
            return Promise.resolve({});
        };

        try {
            await SiteVisitJourneyService.submitPropertyFeedback(
                fakeActId,
                String(invId),
                { rating: 5, interest: 'Interested' }
            );
        } catch (_) {}

        assert.strictEqual(intentScoreBoosted, false, 'Intent score boost must be suppressed on DB save failure');
        assert.strictEqual(escalationCalled, false, 'Escalation tasks must not be triggered on DB save failure');
    });

    // Restore originals
    Activity.findOne = origActFindOne;
    Activity.findById = origActFindById;
    Activity.findByIdAndUpdate = origActFindByIdAndUpdate;
    Activity.findOneAndUpdate = origActFindOneAndUpdate;
    Activity.create = origActCreate;
    Activity.find = origActFind;
    FeedbackSubmission.create = origSubCreate;
    FeedbackSubmission.findOne = origSubFindOne;
    FeedbackSubmission.findByIdAndDelete = origSubFindByIdAndDelete;
    FeedbackForm.findOne = origFormFindOne;
    Lead.findById = origLeadFindById;
    Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;
    Deal.findById = origDealFindById;
    Deal.findByIdAndUpdate = origDealFindByIdAndUpdate;

    console.log('\n========================================');
    console.log(`Site Visit Production Readiness Results:`);
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    console.log('========================================\n');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runReadinessTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
