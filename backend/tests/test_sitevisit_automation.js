import assert from 'assert';
import mongoose from 'mongoose';

let passed = 0;
let failed = 0;

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

console.log('=== Phase 8: Automation & Notification Triggers Suite ===');

async function runTests() {
    const { default: SiteVisitAutomationService } = await import('../src/modules/siteVisit/siteVisitAutomation.service.js');
    const { SiteVisitService } = await import('../src/modules/siteVisit/siteVisit.service.js');

    const Activity = mongoose.models.Activity || mongoose.model('Activity');
    const Lead = mongoose.models.Lead || mongoose.model('Lead');

    const origActFind = Activity.find;
    const origActFindById = Activity.findById;
    const origActFindByIdAndUpdate = Activity.findByIdAndUpdate;
    const origActCreate = Activity.create;
    const origLeadFindById = Lead.findById;
    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;

    console.log('\n--- 1. Site Visit 24-Hour Reminder Automation ---');
    await recordAsync('dispatch24hReminders detects visits due tomorrow, notifies agent and stamps h24 flag', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeAgentId = new mongoose.Types.ObjectId();

        let savedDoc = null;
        const mockVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Scheduled',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Exactly 24h later
            entityId: fakeLeadId,
            assignedTo: {
                _id: fakeAgentId,
                fullName: 'Vikram Joshi',
                mobile: '+919876543210'
            },
            details: {
                projectName: 'Godrej Woods',
                remindersSent: {}
            },
            save() {
                savedDoc = this;
                return Promise.resolve(this);
            }
        };

        Activity.find = () => ({
            populate: () => Promise.resolve([mockVisit])
        });

        Lead.findById = () => ({
            lean: () => ({
                catch: () => Promise.resolve({
                    _id: fakeLeadId,
                    name: 'Rohan Deshmukh',
                    mobile: '+919988776655'
                })
            })
        });

        const result = await SiteVisitAutomationService.dispatch24hReminders();

        assert.strictEqual(result.count, 1);
        assert(savedDoc);
        assert.strictEqual(savedDoc.details.remindersSent.h24, true);
        assert(savedDoc.details.remindersSent.h24At);
    });

    console.log('\n--- 2. Site Visit 2-Hour Immediate Arrival Reminder ---');
    await recordAsync('dispatch2hReminders detects visits starting in 2h, notifies agent and stamps h2 flag', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeAgentId = new mongoose.Types.ObjectId();

        let savedDoc = null;
        const mockVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Scheduled',
            dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // In 2 hours
            entityId: fakeLeadId,
            assignedTo: {
                _id: fakeAgentId,
                fullName: 'Amit Roy',
                mobile: '+919811223344'
            },
            details: {
                projectName: 'DLF Magnolias',
                remindersSent: { h24: true }
            },
            save() {
                savedDoc = this;
                return Promise.resolve(this);
            }
        };

        Activity.find = () => ({
            populate: () => Promise.resolve([mockVisit])
        });

        Lead.findById = () => ({
            lean: () => ({
                catch: () => Promise.resolve({
                    _id: fakeLeadId,
                    name: 'Pooja Bhatt',
                    mobile: '+919876543210'
                })
            })
        });

        const result = await SiteVisitAutomationService.dispatch2hReminders();

        assert.strictEqual(result.count, 1);
        assert(savedDoc);
        assert.strictEqual(savedDoc.details.remindersSent.h2, true);
        assert(savedDoc.details.remindersSent.h2At);
    });

    console.log('\n--- 3. Post-Visit Feedback Dispatch Trigger ---');
    await recordAsync('dispatchPostVisitFeedback triggers feedback link delivery and stamps timestamp', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();

        let updatedDetails = null;
        Activity.findByIdAndUpdate = (id, update) => {
            updatedDetails = update;
            return { catch: () => Promise.resolve({}) };
        };

        Lead.findById = () => ({
            lean: () => ({
                catch: () => Promise.resolve({
                    _id: fakeLeadId,
                    name: 'Kunal Kapoor',
                    mobile: '+919123456780'
                })
            })
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

        assert.strictEqual(result.success, true);
        assert(result.feedbackLink.includes('sample_token'));
        assert(updatedDetails);
        assert(updatedDetails.$set['details.feedbackDispatchedAt']);
    });

    console.log('\n--- 4. Negative Feedback Escalation Automation ---');
    await recordAsync('escalateNegativeFeedback creates manager action task and flags lead review', async () => {
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeTaskId = new mongoose.Types.ObjectId();

        let activityUpdates = null;
        Activity.findByIdAndUpdate = (id, update) => {
            activityUpdates = update;
            return { catch: () => Promise.resolve({}) };
        };

        let leadUpdates = null;
        Lead.findByIdAndUpdate = (id, update) => {
            leadUpdates = update;
            return { catch: () => Promise.resolve({}) };
        };

        let createdTask = null;
        Activity.create = (docs) => {
            createdTask = docs[0];
            return Promise.resolve([{ ...docs[0], _id: fakeTaskId }]);
        };

        const activity = {
            _id: fakeActId,
            entityId: fakeLeadId,
            details: {
                projectName: 'Parijatha Towers'
            }
        };

        const result = await SiteVisitAutomationService.escalateNegativeFeedback(
            activity,
            1,
            'Agent did not show up and flat keys were missing'
        );

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.escalated, true);
        assert.strictEqual(String(result.escalationTaskId), String(fakeTaskId));

        assert(activityUpdates);
        assert(activityUpdates.$addToSet.tags.includes('Escalation-Negative-Feedback'));

        assert(leadUpdates);
        assert(leadUpdates.$addToSet.tags.includes('Escalation-Negative-Feedback'));
        assert.strictEqual(leadUpdates.$set.needsManagerReview, true);

        assert(createdTask);
        assert.strictEqual(createdTask.type, 'Task');
        assert(createdTask.subject.includes('🚨 Manager Action Required'));
        assert.strictEqual(createdTask.priority, 'High');
    });

    // Restore originals
    Activity.find = origActFind;
    Activity.findById = origActFindById;
    Activity.findByIdAndUpdate = origActFindByIdAndUpdate;
    Activity.create = origActCreate;
    Lead.findById = origLeadFindById;
    Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
