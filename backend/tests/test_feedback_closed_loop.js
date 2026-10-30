import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import { getFormBySlug, submitFeedback } from '../controllers/feedbackForm.controller.js';
import FeedbackForm from '../models/FeedbackForm.js';
import FeedbackSubmission from '../models/FeedbackSubmission.js';
import Activity from '../models/Activity.js';
import Lead from '../models/Lead.js';

console.log('=== Phase 4: Customer Feedback Closed-Loop Suite ===\n');

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

async function runFeedbackTests() {
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

    const origJwt = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'enterprise_super_secret_for_feedback_closed_loop_2026';

    const origFormFindOne = FeedbackForm.findOne;
    const origFormUpdateOne = FeedbackForm.updateOne;
    const origSubCreate = FeedbackSubmission.create;
    const origLeadFindById = Lead.findById;
    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
    const origActFindById = Activity.findById;
    const origActFindByIdAndUpdate = Activity.findByIdAndUpdate;

    console.log('--- 1. Feedback Form Resolution via Token ---');
    await recordAsync('getFormBySlug resolves lead and visited properties from ref token', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET).replace(/\./g, '~'); // Meta-safe

        FeedbackForm.findOne = () => ({
            lean: () => Promise.resolve({
                _id: new mongoose.Types.ObjectId(),
                slug: 'customer-experience-feedback-qx9z2',
                name: 'Customer Experience Feedback',
                sections: []
            })
        });
        FeedbackForm.updateOne = () => Promise.resolve({});

        Lead.findById = () => ({
            select: () => ({
                lean: () => Promise.resolve({
                    _id: fakeLeadId,
                    firstName: 'Vikram',
                    lastName: 'Malhotra',
                    email: 'vikram@example.com',
                    mobile: '+91 9876543210'
                })
            })
        });

        Activity.findById = () => ({
            select: () => ({
                lean: () => Promise.resolve({
                    _id: fakeActId,
                    type: 'Site Visit',
                    subject: 'Site Visit: Vikram Malhotra - Godrej Woods',
                    dueDate: new Date('2026-11-20'),
                    dueTime: '11:00 AM',
                    details: {
                        projectName: 'Godrej Woods',
                        visitedProperties: [
                            { project: 'Godrej Woods', block: 'Tower A', property: 'Unit 1402', result: 'Interested' }
                        ]
                    }
                })
            })
        });

        const req = {
            params: { slug: 'customer-experience-feedback-qx9z2' },
            query: { ref: token }
        };
        const res = createMockRes();

        await getFormBySlug(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.leadInfo.name, 'Vikram Malhotra');
        assert.strictEqual(res.body.data.leadInfo.mobile, '+91 9876543210');
        assert.strictEqual(res.body.data.activityInfo.projectName, 'Godrej Woods');
        assert.strictEqual(res.body.data.activityInfo.visitedProperties.length, 1);
        assert.strictEqual(res.body.data.activityInfo.visitedProperties[0].property, 'Unit 1402');
    });

    console.log('\n--- 2. High-Satisfaction Feedback Closed Loop ---');
    await recordAsync('submitFeedback updates Activity with High-Satisfaction tag and boosts Lead intent', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeSubId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        FeedbackForm.findOne = () => Promise.resolve({
            _id: new mongoose.Types.ObjectId(),
            slug: 'customer-experience-feedback-qx9z2',
            sections: [
                {
                    fields: [
                        { id: 'fld_rating', type: 'rating', label: 'Overall Rating' },
                        { id: 'fld_prop_feedback', type: 'property_feedback', label: 'Property Feedback' }
                    ]
                }
            ],
            analytics: { submissions: 1, averageRating: 4.0 },
            settings: { successMessage: 'Thank you for your feedback!' },
            save() { return Promise.resolve(this); }
        });

        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: fakeSubId });

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Completed',
            tags: ['Site-Visit'],
            assignedTo: 'user_agent_1',
            details: {
                visitedProperties: [{ project: 'Godrej Woods', block: 'Tower A', property: 'Unit 1402', result: 'Interested' }]
            }
        };

        Activity.findById = () => Promise.resolve(mockActivity);

        let actUpdates = null;
        Activity.findByIdAndUpdate = (id, updates) => {
            actUpdates = updates;
            return Promise.resolve({ ...mockActivity, ...updates });
        };

        let leadUpdates = null;
        Lead.findByIdAndUpdate = (id, updates) => {
            leadUpdates = updates;
            return Promise.resolve({});
        };

        const req = {
            params: { slug: 'customer-experience-feedback-qx9z2' },
            body: {
                token,
                responses: {
                    fld_rating: '5',
                    fld_prop_feedback: {
                        0: { rating: 5, comments: 'Spacious balcony and excellent ventilation' }
                    }
                }
            },
            query: {}
        };
        const res = createMockRes();

        await submitFeedback(req, res, (err) => { if (err) throw err; });

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);

        // Activity updates verification
        assert(actUpdates, 'Activity should have been updated');
        assert.strictEqual(actUpdates['details.customerFeedback'].rating, 5);
        assert(actUpdates.$addToSet.tags.$each.includes('Customer-Feedback-Received'));
        assert(actUpdates.$addToSet.tags.$each.includes('High-Satisfaction'));

        // Visited property specific feedback
        const updatedVisited = actUpdates['details.visitedProperties'];
        assert.strictEqual(updatedVisited[0].customerRating, 5);
        assert.strictEqual(updatedVisited[0].customerComments, 'Spacious balcony and excellent ventilation');

        // Lead update verification (intent boost)
        assert(leadUpdates, 'Lead should have been updated');
        assert.strictEqual(leadUpdates.latestFeedbackRating, 5);
        assert.strictEqual(leadUpdates.$inc.intent_index, 10, 'High rating should boost intent_index by 10');
    });

    console.log('\n--- 3. Negative Feedback Escalation Closed Loop ---');
    await recordAsync('submitFeedback tags Escalation-Negative-Feedback and alerts manager on rating <= 2', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeSubId = new mongoose.Types.ObjectId();

        const token = jwt.sign({
            leadId: String(fakeLeadId),
            activityId: String(fakeActId),
            purpose: 'customer_feedback'
        }, process.env.JWT_SECRET);

        FeedbackForm.findOne = () => Promise.resolve({
            _id: new mongoose.Types.ObjectId(),
            slug: 'customer-experience-feedback-qx9z2',
            sections: [
                {
                    fields: [
                        { id: 'fld_rating', type: 'rating', label: 'Overall Rating' },
                        { id: 'fld_comments', type: 'text', label: 'Comments' }
                    ]
                }
            ],
            analytics: { submissions: 2, averageRating: 3.5 },
            settings: { successMessage: 'Thank you for your feedback!' },
            save() { return Promise.resolve(this); }
        });

        FeedbackSubmission.create = (doc) => Promise.resolve({ ...doc, _id: fakeSubId });

        const mockActivity = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Completed',
            tags: ['Site-Visit'],
            assignedTo: new mongoose.Types.ObjectId(),
            details: { visitedProperties: [] }
        };

        Activity.findById = () => Promise.resolve(mockActivity);

        let actUpdates = null;
        Activity.findByIdAndUpdate = (id, updates) => {
            actUpdates = updates;
            return Promise.resolve({ ...mockActivity, ...updates });
        };

        let leadUpdates = null;
        Lead.findByIdAndUpdate = (id, updates) => {
            leadUpdates = updates;
            return Promise.resolve({});
        };

        const req = {
            params: { slug: 'customer-experience-feedback-qx9z2' },
            body: {
                token,
                responses: {
                    fld_rating: '2',
                    fld_comments: 'Agent arrived 45 minutes late and sample flat was locked'
                }
            },
            query: {}
        };
        const res = createMockRes();

        await submitFeedback(req, res, (err) => { if (err) throw err; });

        assert.strictEqual(res.statusCode, 201);
        assert(actUpdates.$addToSet.tags.$each.includes('Escalation-Negative-Feedback'));
        assert(!actUpdates.$addToSet.tags.$each.includes('High-Satisfaction'));
        assert.strictEqual(leadUpdates.latestFeedbackRating, 2);
        assert.strictEqual(leadUpdates.$inc, undefined, 'Negative rating should NOT boost intent index');
    });

    // Cleanup globals
    FeedbackForm.findOne = origFormFindOne;
    FeedbackForm.updateOne = origFormUpdateOne;
    FeedbackSubmission.create = origSubCreate;
    Lead.findById = origLeadFindById;
    Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;
    Activity.findById = origActFindById;
    Activity.findByIdAndUpdate = origActFindByIdAndUpdate;
    process.env.JWT_SECRET = origJwt;

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runFeedbackTests().catch(err => {
    console.error('Unexpected feedback test error:', err);
    process.exit(1);
});
