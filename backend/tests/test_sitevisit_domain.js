import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import SiteVisitService from '../src/modules/siteVisit/siteVisit.service.js';
import Activity from '../models/Activity.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';

console.log('=== Phase 3: Canonical Site Visit Domain Workflow Suite ===\n');

async function runDomainTests() {
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

    const origLeadFindById = Lead.findById;
    const origActFindOne = Activity.findOne;
    const origActFindById = Activity.findById;
    const origActCreate = Activity.create;
    const origActFind = Activity.find;
    const origActCount = Activity.countDocuments;
    const origDealFindById = Deal.findById;
    const origDealFindByIdAndUpdate = Deal.findByIdAndUpdate;

    console.log('--- 1. Site Visit Scheduling & Idempotency ---');
    await recordAsync('SiteVisitService.schedule rejects invalid leadId or missing date/time', async () => {
        await assert.rejects(
            () => SiteVisitService.schedule({ leadId: 'invalid-id', date: '2026-11-20', time: '10:00 AM' }),
            /Valid leadId is required/
        );

        const fakeLeadId = new mongoose.Types.ObjectId();
        await assert.rejects(
            () => SiteVisitService.schedule({ leadId: fakeLeadId, time: '10:00 AM' }), // missing date
            /Date and time are required/
        );
    });

    await recordAsync('SiteVisitService.schedule enforces idempotency for pending visit on same day', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeExistingActId = new mongoose.Types.ObjectId();

        Lead.findById = () => Promise.resolve({ _id: fakeLeadId, firstName: 'Rohit', owner: 'user1' });
        Activity.findOne = () => Promise.resolve({
            _id: fakeExistingActId,
            type: 'Site Visit',
            status: 'Pending',
            entityId: fakeLeadId,
            dueDate: new Date('2026-11-20')
        });

        try {
            const result = await SiteVisitService.schedule({
                leadId: fakeLeadId,
                date: '2026-11-20',
                time: '11:00 AM',
                properties: [{ project: 'Godrej Woods', block: 'A', unit: '102' }]
            });

            assert.strictEqual(result.alreadyScheduled, true);
            assert.strictEqual(String(result.activity._id), String(fakeExistingActId));
            assert(result.message.includes('already scheduled'));
        } finally {
            Lead.findById = origLeadFindById;
            Activity.findOne = origActFindOne;
        }
    });

    await recordAsync('SiteVisitService.schedule creates new Site Visit activity with normalized properties', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeCreatedActId = new mongoose.Types.ObjectId();

        Lead.findById = () => Promise.resolve({ _id: fakeLeadId, firstName: 'Pooja', owner: 'user1' });
        Activity.findOne = () => Promise.resolve(null); // No existing pending visit

        let createdPayload = null;
        Activity.create = (doc) => {
            createdPayload = doc;
            return Promise.resolve({
                ...doc,
                _id: fakeCreatedActId
            });
        };

        try {
            const result = await SiteVisitService.schedule({
                leadId: fakeLeadId,
                date: '2026-11-25',
                time: '02:00 PM',
                pickupRequired: true,
                pickupAddress: 'Sector 62, Noida',
                remarks: 'Client prefers corner units with park view',
                properties: [
                    { project: 'M3M Crown', block: 'B', unit: '404', notes: 'Park view' }
                ]
            }, { _id: 'user_agent_1', fullName: 'Agent Sharma' });

            assert.strictEqual(result.alreadyScheduled, false);
            assert.strictEqual(createdPayload.type, 'Site Visit');
            assert.strictEqual(createdPayload.status, 'Pending');
            assert.strictEqual(createdPayload.details.pickupRequired, true);
            assert.strictEqual(createdPayload.details.pickupAddress, 'Sector 62, Noida');
            assert.strictEqual(createdPayload.details.visitedProperties.length, 1);
            assert.strictEqual(createdPayload.details.visitedProperties[0].project, 'M3M Crown');
            assert.strictEqual(createdPayload.details.visitedProperties[0].property, '404');
        } finally {
            Lead.findById = origLeadFindById;
            Activity.findOne = origActFindOne;
            Activity.create = origActCreate;
        }
    });

    console.log('\n--- 2. Site Visit Rescheduling & Audit History ---');
    await recordAsync('SiteVisitService.reschedule requires reason and records history', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            dueDate: new Date('2026-11-20'),
            dueTime: '11:00 AM',
            details: { rescheduleHistory: [] },
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(mockActivity);
        Deal.findById = (id) => Promise.resolve({
            _id: id,
            title: 'DLF Flat 1201',
            lead: fakeLeadId
        });
        Deal.findByIdAndUpdate = () => Promise.resolve({});

        try {
            // Missing reason rejects
            await assert.rejects(
                () => SiteVisitService.reschedule(fakeActId, { newDate: '2026-11-22', newTime: '03:00 PM', reason: '' }),
                /A valid reason is mandatory/
            );

            // Valid reschedule
            const result = await SiteVisitService.reschedule(fakeActId, {
                newDate: '2026-11-22',
                newTime: '03:00 PM',
                reason: 'Client requested postponement due to out-of-town travel'
            }, { _id: 'user_agent_1', fullName: 'Agent Sharma' });

            assert.strictEqual(result.activity.details.rescheduleHistory.length, 1);
            const historyEntry = result.activity.details.rescheduleHistory[0];
            assert.strictEqual(historyEntry.reason, 'Client requested postponement due to out-of-town travel');
            assert.strictEqual(historyEntry.newTime, '03:00 PM');
            assert.strictEqual(result.activity.dueTime, '03:00 PM');
        } finally {
            Activity.findById = origActFindById;
        }
    });

    console.log('\n--- 3. Site Visit Cancellation ---');
    await recordAsync('SiteVisitService.cancel marks status Cancelled with reason and timestamp', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Pending',
            details: {},
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(mockActivity);
        Deal.findById = (id) => Promise.resolve({
            _id: id,
            title: 'DLF Flat 1201',
            lead: fakeLeadId
        });
        Deal.findByIdAndUpdate = () => Promise.resolve({});

        try {
            await assert.rejects(
                () => SiteVisitService.cancel(fakeActId, { reason: '  ' }),
                /A valid cancellation reason is mandatory/
            );

            const result = await SiteVisitService.cancel(fakeActId, {
                reason: 'Client bought another property'
            }, { _id: 'user_agent_1', fullName: 'Agent Sharma' });

            assert.strictEqual(result.activity.status, 'Cancelled');
            assert.strictEqual(result.activity.details.cancelReason, 'Client bought another property');
            assert(result.activity.details.cancelledAt instanceof Date);
        } finally {
            Activity.findById = origActFindById;
        }
    });

    console.log('\n--- 4. Site Visit Completion, Deal Link & Customer Feedback Token ---');
    await recordAsync('SiteVisitService.complete records outcome, links deal, and generates feedback token', async () => {
        const origJwt = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'enterprise_super_secret_for_feedback_2026';

        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeDealId = new mongoose.Types.ObjectId();

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            entityType: 'Lead',
            entityId: fakeLeadId,
            status: 'Pending',
            relatedTo: [],
            details: {
                visitedProperties: [{ project: 'DLF The Arbour', block: 'T1', property: '1201', result: 'Scheduled' }]
            },
            save() { return Promise.resolve(this); }
        };

        Activity.findById = () => Promise.resolve(mockActivity);
        Deal.findById = (id) => Promise.resolve({
            _id: id,
            title: 'DLF Flat 1201',
            lead: fakeLeadId
        });
        Deal.findByIdAndUpdate = () => Promise.resolve({});

        try {
            const result = await SiteVisitService.complete(fakeActId, {
                outcome: 'Interested',
                dealId: fakeDealId,
                clientRating: 5,
                completionNotes: 'Client loved the clubhouse and floor layout',
                visitedProperties: [
                    { project: 'DLF The Arbour', block: 'T1', property: '1201', result: 'Interested', clientFeedback: 'Prefers higher floor' }
                ]
            }, { _id: 'user_agent_1', fullName: 'Agent Sharma' });

            assert.strictEqual(result.activity.status, 'Completed');
            assert.strictEqual(result.activity.completionResult, 'Interested');
            assert.strictEqual(result.activity.details.clientRating, 5);
            assert.strictEqual(result.activity.relatedTo.length, 1);
            assert.strictEqual(String(result.activity.relatedTo[0].id), String(fakeDealId));

            // GAP C: Feedback Token & Link sanitized from service contract
            assert.strictEqual(result.feedbackToken, undefined, 'feedbackToken must NOT be in service return');
            assert.strictEqual(result.feedbackLink, undefined, 'feedbackLink must NOT be in service return');
            assert(result.activity.details.feedbackTokenHash, 'Activity details must contain feedbackTokenHash');
            assert(result.activity.details.feedbackTokenJti, 'Activity details must contain feedbackTokenJti');
            assert.strictEqual(result.activity.details.feedbackFormSlug, 'customer-experience-feedback-qx9z2');
            assert.strictEqual(result.activity.details.feedbackToken, undefined, 'Activity details must not expose raw token');
            assert.strictEqual(result.activity.details.feedbackLink, undefined, 'Activity details must not expose raw token-bearing link');
        } finally {
            Activity.findById = origActFindById;
            Deal.findById = origDealFindById;
            Deal.findByIdAndUpdate = origDealFindByIdAndUpdate;
            process.env.JWT_SECRET = origJwt;
        }
    });

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runDomainTests().catch(err => {
    console.error('Unexpected domain test error:', err);
    process.exit(1);
});
