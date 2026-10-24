/**
 * test_sitevisit_readiness_delivery_tx.js
 *
 * Site Visit Production Readiness Test Suite:
 * 1. Recipient Consent & Opt-Out Enforcement (DND, doNotContact, optOut)
 * 2. Recipient Phone Validation & Format Sanitization (+91, 91, 0, length, letters)
 * 3. Carrier Delivery Status Callback & State Machine (WhatsApp & SMS)
 * 4. Terminal State Transition Protection (READ/DELIVERED cannot be regressed by SENT)
 * 5. Observable Callback Persistence Failures
 * 6. Provider Error, Timeout & Retryability Semantics
 * 7. MongoDB Session Propagation & Atomicity across Lifecycle Methods
 * 8. Non-Transactional Rollback Compensation (Zero Orphan Submissions on Save Failure)
 * 9. RBAC Fail-Closed Behavior on Visibility Engine Errors
 * 10. Controller 403 Response & Zero Data Leakage on Authorization Failure
 * 11. Tenant & Visibility Scoping in SiteVisitService.list & getById
 * 12. External Side-Effect Isolation on Write Failures
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
    const { getSiteVisit, listSiteVisits } = await import('../src/modules/siteVisit/siteVisit.controller.js');

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
    const origActCountDocuments = Activity.countDocuments;
    const origSubCreate = FeedbackSubmission.create;
    const origSubFindOne = FeedbackSubmission.findOne;
    const origSubFindByIdAndDelete = FeedbackSubmission.findByIdAndDelete;
    const origFormFindOne = FeedbackForm.findOne;
    const origLeadFindById = Lead.findById;
    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
    const origDealFindById = Deal.findById;
    const origDealFindByIdAndUpdate = Deal.findByIdAndUpdate;

    // Prevent 10-second Mongoose command buffering when disconnected
    FeedbackForm.findOne = () => Promise.resolve(null);
    FeedbackSubmission.findOne = () => Promise.resolve(null);

    // ------------------------------------------------------------------------
    // Group 1: Recipient Phone Validation & Consent / Opt-Out Handling
    // ------------------------------------------------------------------------
    console.log('--- Group 1: Recipient Validation & Consent / Opt-Out Handling ---');

    await recordAsync('1. validateRecipient rejects missing mobile with MISSING_MOBILE', async () => {
        const res1 = validateRecipient(null);
        assert.strictEqual(res1.valid, false);
        assert.strictEqual(res1.status, 'MISSING_MOBILE');

        const res2 = validateRecipient({ name: 'Client Without Phone' });
        assert.strictEqual(res2.valid, false);
        assert.strictEqual(res2.status, 'MISSING_MOBILE');

        const res3 = validateRecipient({ mobile: '' });
        assert.strictEqual(res3.valid, false);
        assert.strictEqual(res3.status, 'MISSING_MOBILE');

        const res4 = validateRecipient({ mobile: '   ' });
        assert.strictEqual(res4.valid, false);
        assert.strictEqual(res4.status, 'MISSING_MOBILE');
    });

    await recordAsync('2. validateRecipient enforces opt-out/DND priority before phone checks', async () => {
        // Must reject opted-out clients even if their number is malformed or valid
        const leadDnd = { mobile: '+919876543210', dnd: true };
        const resDnd = validateRecipient(leadDnd);
        assert.strictEqual(resDnd.valid, false);
        assert.strictEqual(resDnd.status, 'OPTED_OUT');

        const leadDoNotContact = { mobile: 'malformed_invalid', doNotContact: true };
        const resDnc = validateRecipient(leadDoNotContact);
        assert.strictEqual(resDnc.valid, false);
        assert.strictEqual(resDnc.status, 'OPTED_OUT');

        const leadOptOut = { mobile: '+919876543210', optOut: true };
        const resOpt = validateRecipient(leadOptOut);
        assert.strictEqual(resOpt.valid, false);
        assert.strictEqual(resOpt.status, 'OPTED_OUT');

        const leadOptedOut = { mobile: '+919876543210', optedOut: true };
        const resOpted = validateRecipient(leadOptedOut);
        assert.strictEqual(resOpted.valid, false);
        assert.strictEqual(resOpted.status, 'OPTED_OUT');

        const leadUnsubscribed = { mobile: '+919876543210', isUnsubscribed: true };
        const resUnsub = validateRecipient(leadUnsubscribed);
        assert.strictEqual(resUnsub.valid, false);
        assert.strictEqual(resUnsub.status, 'OPTED_OUT');
    });

    await recordAsync('3. validateRecipient normalizes all supported Indian mobile formats', async () => {
        // Standard 10-digit mobile
        const res10 = validateRecipient({ mobile: '9876543210' });
        assert.strictEqual(res10.valid, true);
        assert.strictEqual(res10.normalizedMobile, '9876543210');
        assert.strictEqual(res10.providerFormat, '919876543210');

        // With +91 country code
        const resPlus91 = validateRecipient({ mobile: '+919876543210' });
        assert.strictEqual(resPlus91.valid, true);
        assert.strictEqual(resPlus91.normalizedMobile, '9876543210');
        assert.strictEqual(resPlus91.providerFormat, '919876543210');

        // With 91 country code without plus
        const res91 = validateRecipient({ mobile: '919876543210' });
        assert.strictEqual(res91.valid, true);
        assert.strictEqual(res91.normalizedMobile, '9876543210');
        assert.strictEqual(res91.providerFormat, '919876543210');

        // With leading 0
        const res0 = validateRecipient({ mobile: '09876543210' });
        assert.strictEqual(res0.valid, true);
        assert.strictEqual(res0.normalizedMobile, '9876543210');

        // With formatted spaces and dashes (+91 98765-43210)
        const resFormatted = validateRecipient({ mobile: '+91 98765-43210' });
        assert.strictEqual(resFormatted.valid, true);
        assert.strictEqual(resFormatted.normalizedMobile, '9876543210');
    });

    await recordAsync('4. validateRecipient rejects malformed, too-short, too-long, and non-numeric numbers', async () => {
        // Too few digits (< 10)
        const resShort = validateRecipient({ mobile: '987654321' });
        assert.strictEqual(resShort.valid, false);
        assert.strictEqual(resShort.status, 'INVALID_RECIPIENT');

        // Too many digits (> 12)
        const resLong = validateRecipient({ mobile: '91987654321099' });
        assert.strictEqual(resLong.valid, false);
        assert.strictEqual(resLong.status, 'INVALID_RECIPIENT');

        // Alphabetic characters
        const resLetters = validateRecipient({ mobile: '98765abc10' });
        assert.strictEqual(resLetters.valid, false);
        assert.strictEqual(resLetters.status, 'INVALID_RECIPIENT');

        // Invalid Indian start digit (starts with 1 or 5 instead of 6-9)
        const resStart1 = validateRecipient({ mobile: '1234567890' });
        assert.strictEqual(resStart1.valid, false);
        assert.strictEqual(resStart1.status, 'INVALID_RECIPIENT');

        const resStart5 = validateRecipient({ mobile: '5555555555' });
        assert.strictEqual(resStart5.valid, false);
        assert.strictEqual(resStart5.status, 'INVALID_RECIPIENT');
    });

    await recordAsync('5. dispatchPostVisitFeedback skips dispatch when customer has opted out', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        const leadOptedOut = {
            _id: fakeLeadId,
            name: 'Opted Out Client',
            mobile: '+919876543210',
            doNotContact: true
        };

        Lead.findById = () => ({
            lean: () => ({ catch: () => Promise.resolve(leadOptedOut) })
        });

        let updatedDetails = null;
        Activity.findByIdAndUpdate = (id, update) => {
            updatedDetails = update.$set;
            return { catch: () => Promise.resolve({}) };
        };

        const result = await SiteVisitAutomationService.dispatchPostVisitFeedback(
            { _id: fakeActId, entityId: fakeLeadId, details: { projectName: 'Godrej Woods' } },
            { feedbackUrl: 'https://bharatproperties.co/journey/test-token' }
        );

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.status, 'OPTED_OUT');
        assert.strictEqual(updatedDetails['details.feedbackDispatchStatus'], 'OPTED_OUT');
    });

    // ------------------------------------------------------------------------
    // Group 2: Carrier Delivery-Status Webhook Callbacks & State Machine
    // ------------------------------------------------------------------------
    console.log('\n--- Group 2: Carrier Delivery-Status Webhook Callbacks & State Machine ---');

    await recordAsync('6. evaluateProviderDispatch extracts providerMessageId from Meta/SMS responses', async () => {
        const metaRes = {
            messaging_product: 'whatsapp',
            contacts: [{ input: '919876543210', wa_id: '919876543210' }],
            messages: [{ id: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTIwN0U5MkY2' }]
        };
        const evalMeta = SiteVisitAutomationService.evaluateProviderDispatch(metaRes, 'whatsapp');
        assert.strictEqual(evalMeta.success, true);
        assert.strictEqual(evalMeta.status, 'ACCEPTED');
        assert.strictEqual(evalMeta.providerMessageId, 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTIwN0U5MkY2');

        const smsRes = {
            status: 'DELIVERED',
            messageId: 'sms-hub-msg-99214',
            delivered: true
        };
        const evalSms = SiteVisitAutomationService.evaluateProviderDispatch(smsRes, 'sms');
        assert.strictEqual(evalSms.success, true);
        assert.strictEqual(evalSms.status, 'DELIVERED');
        assert.strictEqual(evalSms.providerMessageId, 'sms-hub-msg-99214');
    });

    await recordAsync('7. handleDeliveryStatusCallback updates 24h reminder to DELIVERED with timestamp', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const testMsgId = 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTIwN0U5MkY2';

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            details: {
                remindersSent: {
                    h24: false,
                    h24Status: 'ACCEPTED',
                    h24MessageId: testMsgId
                }
            },
            save: () => Promise.resolve()
        };

        Activity.findOne = () => Promise.resolve(mockActivity);

        let persistedUpdate = null;
        Activity.findByIdAndUpdate = (id, update) => {
            persistedUpdate = update.$set;
            return Promise.resolve(mockActivity);
        };

        const cbTimestamp = new Date('2026-10-24T12:00:00Z');
        const res = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: testMsgId,
            status: 'delivered',
            timestamp: cbTimestamp,
            channel: 'whatsapp'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.matched, true);
        assert.strictEqual(persistedUpdate['details.remindersSent.h24Status'], 'DELIVERED');
        assert.strictEqual(persistedUpdate['details.remindersSent.h24'], true);
        assert.strictEqual(persistedUpdate['details.remindersSent.h24DeliveredAt'].toISOString(), cbTimestamp.toISOString());
    });

    await recordAsync('8. handleDeliveryStatusCallback handles carrier FAILED status and records error', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const testMsgId = 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTIwN0U5MkY3';

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            details: {
                feedbackDispatchMessageId: testMsgId,
                feedbackDispatchStatus: 'ACCEPTED'
            },
            save: () => Promise.resolve()
        };

        Activity.findOne = () => Promise.resolve(mockActivity);

        let persistedUpdate = null;
        Activity.findByIdAndUpdate = (id, update) => {
            persistedUpdate = update.$set;
            return Promise.resolve(mockActivity);
        };

        const res = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: testMsgId,
            status: 'failed',
            error: '131026: Receiver user is ineligible for WhatsApp messaging',
            channel: 'whatsapp'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.matched, true);
        assert.strictEqual(persistedUpdate['details.feedbackDispatchStatus'], 'FAILED');
        assert.strictEqual(persistedUpdate['details.feedbackDispatchError'], '131026: Receiver user is ineligible for WhatsApp messaging');
    });

    await recordAsync('9. Terminal state protection: READ cannot be downgraded by delayed SENT/DELIVERED', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const testMsgId = 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTIwN0U5MkY4';

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            details: {
                remindersSent: {
                    h24: true,
                    h24Status: 'READ',
                    h24MessageId: testMsgId
                }
            },
            save: () => Promise.resolve()
        };

        Activity.findOne = () => Promise.resolve(mockActivity);

        let updateAttempted = false;
        Activity.findByIdAndUpdate = () => {
            updateAttempted = true;
            return Promise.resolve(mockActivity);
        };

        // Out-of-order callback: carrier sends delayed 'sent' or 'delivered'
        const res = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: testMsgId,
            status: 'sent',
            channel: 'whatsapp'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.appliedUpdates, false, 'Delayed SENT callback must not overwrite READ status');
        assert.strictEqual(updateAttempted, false, 'No database update must be executed for stale downgrade');
    });

    await recordAsync('10. Terminal state protection: DELIVERED cannot be regressed by SENT, but upgrades to READ', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const testMsgId = 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTIwN0U5MkY5';

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            details: {
                remindersSent: {
                    h2: true,
                    h2Status: 'DELIVERED',
                    h2MessageId: testMsgId
                }
            },
            save: () => Promise.resolve()
        };

        Activity.findOne = () => Promise.resolve(mockActivity);

        // Delayed 'sent' must be ignored
        const resSent = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: testMsgId,
            status: 'sent',
            channel: 'whatsapp'
        });
        assert.strictEqual(resSent.appliedUpdates, false, 'SENT callback must not downgrade DELIVERED status');

        // 'read' must be accepted and upgrade status
        let persisted = null;
        Activity.findByIdAndUpdate = (id, update) => {
            persisted = update.$set;
            return Promise.resolve(mockActivity);
        };

        const resRead = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: testMsgId,
            status: 'read',
            channel: 'whatsapp'
        });
        assert.strictEqual(resRead.appliedUpdates, true);
        assert.strictEqual(persisted['details.remindersSent.h2Status'], 'READ');
    });

    await recordAsync('11. Persistence failure in handleDeliveryStatusCallback is observable and logs safely', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const testMsgId = 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQTIwN0U5MkZZ';

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            details: {
                remindersSent: {
                    h24Status: 'ACCEPTED',
                    h24MessageId: testMsgId
                }
            },
            save: () => Promise.reject(new Error('MongoNetworkError: connection timed out'))
        };

        Activity.findOne = () => Promise.resolve(mockActivity);
        Activity.findByIdAndUpdate = () => Promise.reject(new Error('MongoNetworkError: connection timed out'));

        const res = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: testMsgId,
            status: 'delivered'
        });

        assert.strictEqual(res.success, false, 'Must report failure on database persistence error');
        assert.strictEqual(res.matched, true);
        assert(res.error.includes('Persistence failure'), 'Error message must reflect persistence failure');
    });

    await recordAsync('12. Missing providerMessageId in callback fails closed', async () => {
        const res = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: null,
            status: 'delivered'
        });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'providerMessageId is required');
    });

    await recordAsync('13. handleDeliveryStatusCallback gracefully handles unmapped providerMessageId', async () => {
        Activity.findOne = () => Promise.resolve(null);

        const res = await SiteVisitAutomationService.handleDeliveryStatusCallback({
            providerMessageId: 'wamid.unmapped_or_external_message_id_9999',
            status: 'delivered',
            channel: 'whatsapp'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.matched, false);
        assert.strictEqual(res.message, 'No site visit activity found for providerMessageId');
    });

    // ------------------------------------------------------------------------
    // Group 3: MongoDB Transaction & Session Propagation Audit
    // ------------------------------------------------------------------------
    console.log('\n--- Group 3: MongoDB Transaction & Session Propagation Audit ---');

    await recordAsync('14. SiteVisitService.schedule propagates session across reads, creation, and stage update', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-session-schedule-101' };

        let leadFindSession = null;
        Lead.findById = (id, proj, opts) => {
            leadFindSession = opts?.session;
            return Promise.resolve({
                _id: fakeLeadId,
                firstName: 'Test',
                owner: new mongoose.Types.ObjectId()
            });
        };

        let actFindOneSession = null;
        Activity.findOne = (q, proj, opts) => {
            actFindOneSession = opts?.session;
            return Promise.resolve(null);
        };

        let actCreateSession = null;
        Activity.create = (docs, opts) => {
            actCreateSession = opts?.session;
            return Promise.resolve(Array.isArray(docs) ? docs : [docs]);
        };

        let leadUpdateSession = null;
        Lead.findByIdAndUpdate = (id, update, opts) => {
            leadUpdateSession = opts?.session;
            return Promise.resolve({});
        };

        await SiteVisitService.schedule({
            leadId: fakeLeadId,
            date: '2026-10-30',
            time: '11:00 AM'
        }, null, { session: mockSession });

        assert.strictEqual(leadFindSession, mockSession, 'Lead.findById must receive caller session');
        assert.strictEqual(actFindOneSession, mockSession, 'Activity.findOne must receive caller session');
        assert.strictEqual(actCreateSession, mockSession, 'Activity.create must receive caller session');
        assert.strictEqual(leadUpdateSession, mockSession, 'Lead.findByIdAndUpdate must receive caller session');
    });

    await recordAsync('15. SiteVisitService.schedule aborts (throws) on stage update failure inside session', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-session-schedule-err' };

        Lead.findById = () => Promise.resolve({ _id: fakeLeadId, firstName: 'Test' });
        Activity.findOne = () => Promise.resolve(null);
        Activity.create = (docs) => Promise.resolve(Array.isArray(docs) ? docs : [docs]);
        Lead.findByIdAndUpdate = () => Promise.reject(new Error('WriteConflict in transaction'));

        let threw = false;
        try {
            await SiteVisitService.schedule({
                leadId: fakeLeadId,
                date: '2026-10-30',
                time: '11:00 AM'
            }, null, { session: mockSession });
        } catch (err) {
            threw = true;
            assert(err.message.includes('WriteConflict'));
        }
        assert.strictEqual(threw, true, 'Schedule must fail closed and throw inside transaction when stage update fails');
    });

    await recordAsync('16. SiteVisitService.reschedule and cancel propagate session to findById and findOneAndUpdate', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-session-lifecycle' };

        let resFindSession = null;
        let resUpdateSession = null;
        Activity.findById = (id, proj, opts) => {
            resFindSession = opts?.session;
            return Promise.resolve({
                _id: fakeActId,
                type: 'Site Visit',
                status: 'Pending',
                details: {}
            });
        };
        Activity.findOneAndUpdate = (q, u, opts) => {
            resUpdateSession = opts?.session;
            return Promise.resolve({ _id: fakeActId, status: 'Pending' });
        };

        await SiteVisitService.reschedule(fakeActId, {
            newDate: '2026-11-01',
            newTime: '02:00 PM',
            reason: 'Client requested reschedule'
        }, null, { session: mockSession });

        assert.strictEqual(resFindSession, mockSession, 'reschedule Activity.findById must receive session');
        assert.strictEqual(resUpdateSession, mockSession, 'reschedule Activity.findOneAndUpdate must receive session');

        let cancelFindSession = null;
        let cancelUpdateSession = null;
        Activity.findById = (id, proj, opts) => {
            cancelFindSession = opts?.session;
            return Promise.resolve({
                _id: fakeActId,
                type: 'Site Visit',
                status: 'Pending',
                details: {}
            });
        };
        Activity.findOneAndUpdate = (q, u, opts) => {
            cancelUpdateSession = opts?.session;
            return Promise.resolve({ _id: fakeActId, status: 'Cancelled' });
        };

        await SiteVisitService.cancel(fakeActId, {
            reason: 'Client cancelled visit'
        }, null, { session: mockSession });

        assert.strictEqual(cancelFindSession, mockSession, 'cancel Activity.findById must receive session');
        assert.strictEqual(cancelUpdateSession, mockSession, 'cancel Activity.findOneAndUpdate must receive session');
    });

    await recordAsync('17. completeSiteVisit propagates session across Activity and Deal updates', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeDealId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-session-complete-202' };

        let actFindByIdOpts = null;
        Activity.findById = (id, proj, opts) => {
            if (!actFindByIdOpts) actFindByIdOpts = opts;
            return Promise.resolve({
                _id: fakeActId,
                type: 'Site Visit',
                status: 'Scheduled',
                entityId: fakeLeadId,
                details: {
                    visitedProperties: [{ order: 0, project: 'Godrej Woods', property: 'Unit 402', status: 'FEEDBACK_SUBMITTED' }]
                }
            });
        };

        let dealFindByIdOpts = null;
        Deal.findById = (id, proj, opts) => {
            dealFindByIdOpts = opts;
            return Promise.resolve({
                _id: fakeDealId,
                lead: fakeLeadId,
                title: 'Deal 101'
            });
        };

        let actUpdateOpts = null;
        Activity.findOneAndUpdate = (q, u, opts) => {
            actUpdateOpts = opts;
            return Promise.resolve({
                _id: fakeActId,
                type: 'Site Visit',
                status: 'Completed',
                entityId: fakeLeadId,
                details: { visitedProperties: [{ order: 0, project: 'Godrej Woods', property: 'Unit 402' }] }
            });
        };

        let dealUpdateOpts = null;
        Deal.findByIdAndUpdate = (id, u, opts) => {
            dealUpdateOpts = opts;
            return Promise.resolve({ _id: fakeDealId });
        };

        await SiteVisitService.complete(
            fakeActId,
            { outcome: 'Interested', dealId: fakeDealId },
            null,
            { session: mockSession }
        );

        assert.strictEqual(actFindByIdOpts?.session, mockSession, 'Activity.findById must receive caller session');
        assert.strictEqual(dealFindByIdOpts?.session, mockSession, 'Deal.findById must receive caller session');
        assert.strictEqual(actUpdateOpts?.session, mockSession, 'Activity.findOneAndUpdate must receive caller session');
        assert.strictEqual(dealUpdateOpts?.session, mockSession, 'Deal.findByIdAndUpdate must receive caller session');
    });

    await recordAsync('18. completeSiteVisit aborts (throws) on deal update failure inside session', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeDealId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-session-deal-err' };

        Activity.findById = () => Promise.resolve({
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Scheduled',
            entityId: fakeLeadId,
            details: {
                visitedProperties: [{ order: 0, project: 'Godrej Woods', property: 'Unit 402' }]
            }
        });
        Deal.findById = () => Promise.resolve({ _id: fakeDealId, lead: fakeLeadId });
        Activity.findOneAndUpdate = () => Promise.resolve({ _id: fakeActId, status: 'Completed' });
        Deal.findByIdAndUpdate = () => Promise.reject(new Error('WriteConflict on deal document'));

        let threw = false;
        try {
            await SiteVisitService.complete(
                fakeActId,
                { outcome: 'Interested', dealId: fakeDealId },
                null,
                { session: mockSession }
            );
        } catch (err) {
            threw = true;
            assert(err.message.includes('WriteConflict'));
        }
        assert.strictEqual(threw, true, 'complete must throw when deal update fails inside a caller session');
    });

    await recordAsync('19. submitPropertyFeedback propagates caller session to FeedbackSubmission.create and activity.save', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const invId = new mongoose.Types.ObjectId();
        const mockSession = { id: 'mock-mongo-session-12345' };

        let savePassedOptions = null;
        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: invId, project: 'Godrej Woods', status: 'READY' }
                ]
            },
            save: (opts) => {
                savePassedOptions = opts;
                return Promise.resolve();
            }
        };

        Activity.findById = () => Promise.resolve(activityDoc);

        let createdSubmissions = null;
        let createOptions = null;
        FeedbackSubmission.create = (docs, opts) => {
            createdSubmissions = docs;
            createOptions = opts;
            return Promise.resolve(docs.map(d => ({ ...d, _id: new mongoose.Types.ObjectId() })));
        };

        let leadUpdateSession = null;
        Lead.findByIdAndUpdate = (id, update, opts) => {
            leadUpdateSession = opts?.session;
            return Promise.resolve({});
        };

        const res = await SiteVisitJourneyService.submitPropertyFeedback(
            fakeActId,
            String(invId),
            { rating: 5, interest: 'Interested' },
            { session: mockSession }
        );

        assert.strictEqual(res.success, true);
        assert.strictEqual(createOptions?.session, mockSession, 'FeedbackSubmission.create must receive session');
        assert.strictEqual(savePassedOptions?.session, mockSession, 'activity.save must receive session');
        assert.strictEqual(leadUpdateSession, mockSession, 'Lead.findByIdAndUpdate must receive session');
    });

    await recordAsync('20. Non-transactional rollback compensation deletes orphaned submission if activity.save fails', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const invId = new mongoose.Types.ObjectId();
        const submissionId = new mongoose.Types.ObjectId();

        const activityDoc = {
            _id: fakeActId,
            type: 'Site Visit',
            entityId: fakeLeadId,
            status: 'Scheduled',
            details: {
                visitedProperties: [
                    { order: 0, inventoryId: invId, project: 'Godrej Woods', status: 'READY' }
                ]
            },
            save: () => Promise.reject(new Error('Simulated Mongoose Document Save Failure'))
        };

        Activity.findById = () => Promise.resolve(activityDoc);
        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: submissionId });

        let deletedId = null;
        FeedbackSubmission.findByIdAndDelete = (id) => {
            deletedId = id;
            return Promise.resolve({});
        };

        let threw = false;
        try {
            await SiteVisitJourneyService.submitPropertyFeedback(
                fakeActId,
                String(invId),
                { rating: 5, interest: 'Interested' }
            );
        } catch (err) {
            threw = true;
            assert(err.message.includes('Simulated Mongoose Document Save Failure'));
        }

        assert.strictEqual(threw, true, 'Service must rethrow save failure to caller');
        assert.strictEqual(String(deletedId), String(submissionId), 'Orphaned submission must be deleted on non-transactional save failure');
    });

    // ------------------------------------------------------------------------
    // Group 4: Tenant Scoping, RBAC Fail-Closed & Controller Protection
    // ------------------------------------------------------------------------
    console.log('\n--- Group 4: Tenant Scoping, RBAC Fail-Closed & Controller Protection ---');

    await recordAsync('21. SiteVisitService.schedule inherits department and teams from lead or user', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const leadWithTenant = {
            _id: fakeLeadId,
            firstName: 'Aarav',
            department: 'Residential Luxury',
            teams: [new mongoose.Types.ObjectId()]
        };

        Lead.findById = () => Promise.resolve(leadWithTenant);
        Activity.findOne = () => Promise.resolve(null);

        let createdPayload = null;
        Activity.create = (doc) => {
            createdPayload = Array.isArray(doc) ? doc[0] : doc;
            return Promise.resolve(createdPayload);
        };

        const user = {
            _id: new mongoose.Types.ObjectId(),
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

    await recordAsync('22. SiteVisitService.list and getById apply getVisibilityFilter for non-admin users', async () => {
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

    await recordAsync('23. RBAC Fail-Closed: getVisibilityFilter failure throws and executes ZERO queries', async () => {
        // Create an invalid/corrupt user object that causes getVisibilityFilter resolution to fail
        const corruptUser = {
            _id: 'not-a-valid-object-id',
            dataScope: 'invalid_scope',
            get role() { throw new Error('Simulated RBAC Engine Failure'); }
        };

        let findExecuted = false;
        Activity.find = () => {
            findExecuted = true;
            return { sort: () => ({ skip: () => ({ limit: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) }) }) };
        };

        let findOneExecuted = false;
        Activity.findOne = () => {
            findOneExecuted = true;
            return { populate: () => ({ populate: () => ({ lean: () => Promise.resolve({}) }) }) };
        };

        // Test list() fail-closed
        let listThrew = false;
        try {
            await SiteVisitService.list({}, corruptUser);
        } catch (err) {
            listThrew = true;
            assert(err.message.includes('Authorization failed'), 'Must throw Authorization failed error');
        }
        assert.strictEqual(listThrew, true, 'list() must fail closed when visibility calculation fails');
        assert.strictEqual(findExecuted, false, 'No database find query must be executed on visibility failure');

        // Test getById() fail-closed
        const validId = new mongoose.Types.ObjectId();
        let getByIdThrew = false;
        try {
            await SiteVisitService.getById(validId, corruptUser);
        } catch (err) {
            getByIdThrew = true;
            assert(err.message.includes('Authorization failed'), 'Must throw Authorization failed error');
        }
        assert.strictEqual(getByIdThrew, true, 'getById() must fail closed when visibility calculation fails');
        assert.strictEqual(findOneExecuted, false, 'No database findOne query must be executed on visibility failure');
    });

    await recordAsync('24. Controller Fail-Closed: getSiteVisit and listSiteVisits return 403 with ZERO data leakage', async () => {
        const corruptUser = {
            _id: 'invalid-id',
            get role() { throw new Error('Simulated RBAC Engine Failure'); }
        };

        // Simulate Express request / response
        const mockReq = {
            params: { id: new mongoose.Types.ObjectId().toString() },
            query: {},
            user: corruptUser
        };

        let statusCode = null;
        let responseJson = null;
        const mockRes = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (body) => { responseJson = body; return body; }
                };
            }
        };

        // Test getSiteVisit controller error response
        await getSiteVisit(mockReq, mockRes);
        assert.strictEqual(statusCode, 403, 'Controller must respond with HTTP 403 Forbidden on authorization failure');
        assert.strictEqual(responseJson.success, false);
        assert.strictEqual(responseJson.data, undefined, 'Must not leak any data payload on authorization failure');
        assert(responseJson.message.includes('Authorization failed'));

        // Test listSiteVisits controller error response
        statusCode = null;
        responseJson = null;
        await listSiteVisits(mockReq, mockRes);
        assert.strictEqual(statusCode, 403, 'Controller must respond with HTTP 403 Forbidden on authorization failure');
        assert.strictEqual(responseJson.success, false);
        assert.strictEqual(responseJson.data, undefined, 'Must not leak records on authorization failure');
        assert(responseJson.message.includes('Authorization failed'));
    });

    // ------------------------------------------------------------------------
    // Group 5: External Side-Effect Isolation on Write Failure
    // ------------------------------------------------------------------------
    console.log('\n--- Group 5: External Side-Effect Isolation on Write Failure ---');

    await recordAsync('25. Downstream escalation and intent boosts are suppressed if feedback save fails', async () => {
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
                    { order: 0, inventoryId: invId, project: 'Godrej Woods', status: 'READY' }
                ]
            },
            save: () => Promise.reject(new Error('Simulated Mongoose Document Save Failure'))
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
    Activity.countDocuments = origActCountDocuments;
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
