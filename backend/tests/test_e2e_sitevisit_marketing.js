import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

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

console.log('=== Phase 9: End-to-End Enterprise Integration & Verification Suite ===');

async function runE2ETests() {
    process.env.JWT_SECRET = 'enterprise-e2e-secret-key-32-chars-long';
    process.env.FRONTEND_URL = 'https://bharatproperties.co';

    // Import controllers & services
    const { createCampaignTrackedLink } = await import('../controllers/marketing.controller.js');
    const { SiteVisitService } = await import('../src/modules/siteVisit/siteVisit.service.js');
    const { default: SiteVisitAutomationService } = await import('../src/modules/siteVisit/siteVisitAutomation.service.js');
    const { submitFeedback } = await import('../controllers/feedbackForm.controller.js');
    const { createStandardizedDeal } = await import('../services/DealCreationEngine.js');
    const { createBooking } = await import('../controllers/booking.controller.js');
    const { getSiteVisitFunnelAnalytics, getCampaignAttributionAnalytics } = await import('../controllers/analytics.controller.js');
    const WhatsAppService = (await import('../services/WhatsAppService.js')).default;

    const origWaSendMessage = WhatsAppService.sendMessage;
    WhatsAppService.sendMessage = async () => ({
        success: true,
        messages: [{ id: 'wa-msg-e2e-1' }]
    });

    // Models
    const Lead = mongoose.models.Lead || mongoose.model('Lead');
    const Activity = mongoose.models.Activity || mongoose.model('Activity');
    const Deal = mongoose.models.Deal || mongoose.model('Deal');
    const Booking = mongoose.models.Booking || mongoose.model('Booking');
    const FeedbackForm = mongoose.models.FeedbackForm || mongoose.model('FeedbackForm');
    const FeedbackSubmission = mongoose.models.FeedbackSubmission || mongoose.model('FeedbackSubmission');
    const AutomationLog = mongoose.models.AutomationLog || mongoose.model('AutomationLog');
    const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting');

    // In-memory mock database state
    const db = {
        leads: new Map(),
        activities: new Map(),
        deals: new Map(),
        bookings: new Map(),
        submissions: new Map()
    };

    // Shared IDs across full lifecycle
    const leadId = new mongoose.Types.ObjectId();
    const agentId = new mongoose.Types.ObjectId();
    const feedbackFormId = new mongoose.Types.ObjectId();
    let siteVisitActivityId = null;
    let dealId = null;
    let bookingId = null;
    let feedbackToken = null;
    let trackedUrl = null;

    function applyMongoUpdate(existing, updates) {
        if (!existing) return {};
        if (updates.$set) {
            Object.keys(updates.$set).forEach(k => {
                const val = updates.$set[k];
                if (k.includes('.')) {
                    const parts = k.split('.');
                    let curr = existing;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!curr[parts[i]]) curr[parts[i]] = {};
                        curr = curr[parts[i]];
                    }
                    curr[parts[parts.length - 1]] = val;
                } else {
                    existing[k] = val;
                }
            });
        }
        if (updates.$addToSet) {
            Object.keys(updates.$addToSet).forEach(k => {
                const val = updates.$addToSet[k];
                let targetArray = existing;
                let targetKey = k;
                if (k.includes('.')) {
                    const parts = k.split('.');
                    let curr = existing;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!curr[parts[i]]) curr[parts[i]] = {};
                        curr = curr[parts[i]];
                    }
                    targetArray = curr;
                    targetKey = parts[parts.length - 1];
                }
                if (!Array.isArray(targetArray[targetKey])) targetArray[targetKey] = [];
                if (typeof val === 'object' && val.$each) {
                    val.$each.forEach(item => { if (!targetArray[targetKey].includes(item)) targetArray[targetKey].push(item); });
                } else if (!targetArray[targetKey].includes(val)) targetArray[targetKey].push(val);
            });
        }
        if (updates.$inc) {
            Object.keys(updates.$inc).forEach(k => {
                existing[k] = (existing[k] || 0) + updates.$inc[k];
            });
        }
        Object.keys(updates).forEach(k => {
            if (!k.startsWith('$')) {
                const val = updates[k];
                if (k.includes('.')) {
                    const parts = k.split('.');
                    let curr = existing;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!curr[parts[i]]) curr[parts[i]] = {};
                        curr = curr[parts[i]];
                    }
                    curr[parts[parts.length - 1]] = val;
                } else {
                    existing[k] = val;
                }
            }
        });
        return existing;
    }

    // Mock DB operations
    Lead.findById = (id) => ({
        session: () => ({
            lean: () => Promise.resolve(db.leads.get(String(id)) || null)
        }),
        lean: () => ({
            catch: () => Promise.resolve(db.leads.get(String(id)) || null)
        }),
        then(resolve) {
            return Promise.resolve(db.leads.get(String(id)) || null).then(resolve);
        }
    });

    Lead.findByIdAndUpdate = (id, updates) => {
        const existing = db.leads.get(String(id)) || {};
        applyMongoUpdate(existing, updates);
        db.leads.set(String(id), existing);
        return { catch: () => Promise.resolve(existing), then: (r) => Promise.resolve(existing).then(r) };
    };

    Lead.find = () => ({
        select: () => ({
            lean: () => Promise.resolve(Array.from(db.leads.values()))
        }),
        lean: () => Promise.resolve(Array.from(db.leads.values()))
    });

    Activity.findById = (id) => {
        const act = db.activities.get(String(id));
        if (!act) {
            return {
                session: () => Promise.resolve(null),
                populate: () => Promise.resolve(null),
                then(resolve) { return Promise.resolve(null).then(resolve); }
            };
        }
        const doc = {
            ...act,
            session() { return Promise.resolve(this); },
            populate() { return Promise.resolve(this); },
            save() { db.activities.set(String(id), this); return Promise.resolve(this); }
        };
        return {
            ...doc,
            session() { return Promise.resolve(doc); },
            populate() { return Promise.resolve(doc); },
            then(resolve) { return Promise.resolve(doc).then(resolve); }
        };
    };

    Activity.findOne = (query) => {
        const list = Array.from(db.activities.values());
        const match = list.find(a => {
            if (query.type && a.type !== query.type) return false;
            if (query.entityId && String(a.entityId) !== String(query.entityId)) return false;
            return true;
        });
        if (!match) {
            return {
                session: () => Promise.resolve(null),
                sort: () => ({ session: () => Promise.resolve(null) }),
                then(r) { return Promise.resolve(null).then(r); }
            };
        }
        const doc = {
            ...match,
            session() { return Promise.resolve(this); },
            sort() { return Promise.resolve(this); },
            save() { db.activities.set(String(match._id), this); return Promise.resolve(this); }
        };
        return {
            ...doc,
            session() { return Promise.resolve(doc); },
            sort() { return Promise.resolve(doc); },
            then(r) { return Promise.resolve(doc).then(r); }
        };
    };

    Activity.find = (query = {}) => {
        let list = Array.from(db.activities.values()).map(a => ({
            ...a,
            save() { db.activities.set(String(a._id), this); return Promise.resolve(this); }
        }));
        if (query.type) {
            list = list.filter(a => a.type === query.type);
        }
        return {
            select: () => ({ lean: () => Promise.resolve(list) }),
            populate: () => Promise.resolve(list),
            lean: () => Promise.resolve(list)
        };
    };

    Activity.create = (docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map(d => {
            const id = d._id || new mongoose.Types.ObjectId();
            const doc = {
                ...d,
                _id: id,
                createdAt: new Date(),
                save() { db.activities.set(String(id), this); return Promise.resolve(this); }
            };
            db.activities.set(String(id), doc);
            return doc;
        });
        return Promise.resolve(Array.isArray(docs) ? created : created[0]);
    };

    Activity.findByIdAndUpdate = (id, updates) => {
        const existing = db.activities.get(String(id)) || {};
        applyMongoUpdate(existing, updates);
        db.activities.set(String(id), existing);
        return { catch: () => Promise.resolve(existing), then: (r) => Promise.resolve(existing).then(r) };
    };

    Deal.create = (docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map(d => {
            const id = d._id || new mongoose.Types.ObjectId();
            const doc = { ...d, _id: id, createdAt: new Date() };
            db.deals.set(String(id), doc);
            return doc;
        });
        return Promise.resolve(Array.isArray(docs) ? created : created[0]);
    };

    Deal.findById = (id) => {
        const deal = db.deals.get(String(id));
        if (!deal) {
            return {
                session: () => Promise.resolve(null),
                then(r) { return Promise.resolve(null).then(r); }
            };
        }
        const doc = {
            ...deal,
            session() { return Promise.resolve(this); },
            save() { db.deals.set(String(id), this); return Promise.resolve(this); }
        };
        return {
            ...doc,
            session() { return Promise.resolve(doc); },
            then(r) { return Promise.resolve(doc).then(r); }
        };
    };

    Deal.findOne = (query) => {
        const list = Array.from(db.deals.values());
        const match = list.find(d => {
            if (query.inventoryId && String(d.inventoryId) !== String(query.inventoryId)) return false;
            return true;
        });
        return {
            session: () => Promise.resolve(match || null),
            then(r) { return Promise.resolve(match || null).then(r); }
        };
    };

    Deal.find = () => {
        const list = Array.from(db.deals.values());
        return {
            select: () => ({ lean: () => Promise.resolve(list) }),
            lean: () => Promise.resolve(list)
        };
    };

    Deal.findByIdAndUpdate = (id, updates) => {
        const existing = db.deals.get(String(id)) || {};
        applyMongoUpdate(existing, updates);
        db.deals.set(String(id), existing);
        return { catch: () => Promise.resolve(existing), then: (r) => Promise.resolve(existing).then(r) };
    };

    Booking.create = (docs) => {
        const arr = Array.isArray(docs) ? docs : [docs];
        const created = arr.map(d => {
            const id = d._id || new mongoose.Types.ObjectId();
            const doc = { ...d, _id: id, createdAt: new Date() };
            db.bookings.set(String(id), doc);
            return doc;
        });
        return Promise.resolve(Array.isArray(docs) ? created : created[0]);
    };

    Booking.findById = (id) => {
        const b = db.bookings.get(String(id));
        const chain = {
            populate() { return chain; },
            then(resolve) { return Promise.resolve(b || null).then(resolve); },
            catch(reject) { return Promise.resolve(b || null).catch(reject); }
        };
        return chain;
    };

    Booking.findOne = () => Promise.resolve(null);

    Booking.find = () => {
        const list = Array.from(db.bookings.values());
        return {
            select: () => ({ lean: () => Promise.resolve(list) }),
            lean: () => Promise.resolve(list)
        };
    };

    FeedbackForm.findOne = () => Promise.resolve({
        _id: feedbackFormId,
        slug: 'customer-experience-feedback-qx9z2',
        sections: [
            {
                fields: [
                    { id: 'fld_rating', type: 'rating', label: 'Overall Rating' },
                    { id: 'fld_comments', type: 'text', label: 'Comments' }
                ]
            }
        ],
        analytics: { submissions: 0, averageRating: 0 },
        settings: { successMessage: 'Thank you for your feedback!' },
        save() { return Promise.resolve(this); }
    });

    FeedbackSubmission.create = (doc) => {
        const id = new mongoose.Types.ObjectId();
        const sub = { ...doc, _id: id };
        db.submissions.set(String(id), sub);
        return Promise.resolve(sub);
    };

    AutomationLog.findOne = () => ({ session: () => Promise.resolve(null) });
    AutomationLog.create = () => Promise.resolve({});
    AutomationLog.updateOne = () => Promise.resolve({});
    SystemSetting.findOne = () => ({ session: () => ({ lean: () => Promise.resolve({ value: 'relaxed' }) }) });

    console.log('\n--- Step 1: Campaign Creation & Tracked URL Generation ---');
    await recordAsync('Marketing OS generates campaign link with UTM tags & signed token', async () => {
        const req = {
            body: {
                destinationUrl: 'https://bharatproperties.co/projects/godrej-woods',
                campaignName: 'diwali_luxury_villas_2026',
                source: 'meta_ads',
                medium: 'cpc',
                content: '3bhk_video_ad',
                leadId: String(leadId)
            }
        };
        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await createCampaignTrackedLink(req, res);

        assert.strictEqual(res.body.success, true);
        trackedUrl = res.body.data.url;
        assert(trackedUrl.includes('utm_campaign=diwali_luxury_villas_2026'));
        assert(trackedUrl.includes('utm_source=meta_ads'));
        assert(trackedUrl.includes('ref='));
    });

    console.log('\n--- Step 2: Lead Ingestion & Attribution Capture ---');
    await record('Lead captured with marketing campaign UTM metadata and contact details', () => {
        const initialLead = {
            _id: leadId,
            fullName: 'Vikramaditya Singhania',
            mobile: '+919876543210',
            email: 'vikram.singhania@example.com',
            stage: 'Incoming',
            source: 'Meta Ads',
            campaign: 'diwali_luxury_villas_2026',
            source_meta: {
                utm_source: 'meta_ads',
                utm_medium: 'cpc',
                utm_campaign: 'diwali_luxury_villas_2026',
                utm_content: '3bhk_video_ad',
                landingPage: trackedUrl
            },
            intent_index: 40,
            tags: ['Meta-Lead'],
            createdAt: new Date()
        };
        db.leads.set(String(leadId), initialLead);
        assert.strictEqual(db.leads.get(String(leadId)).source_meta.utm_campaign, 'diwali_luxury_villas_2026');
    });

    console.log('\n--- Step 3: Site Visit Scheduling ---');
    await recordAsync('SiteVisitService.schedule books visit and normalizes visited properties', async () => {
        const schedulePayload = {
            leadId,
            date: '2026-11-10',
            time: '11:00 AM',
            properties: [
                { project: 'Godrej Woods', block: 'Tower B', unit: 'Unit 1204', result: 'Interested' }
            ],
            assignedTo: agentId,
            remarks: 'Client interested in top floor 3BHK unit',
            source: 'campaign_conversion'
        };

        const result = await SiteVisitService.schedule(schedulePayload, { _id: agentId, name: 'Agent Rajesh' });

        assert.strictEqual(result.message, 'Site visit scheduled successfully');
        siteVisitActivityId = result.activity._id;
        assert(db.activities.has(String(siteVisitActivityId)));

        const savedAct = db.activities.get(String(siteVisitActivityId));
        assert.strictEqual(savedAct.type, 'Site Visit');
        assert.strictEqual(savedAct.status, 'Pending');
        assert.strictEqual(savedAct.details.visitedProperties[0].property, 'Unit 1204');
    });

    console.log('\n--- Step 4: Site Visit Rescheduling with Audit Trail ---');
    await recordAsync('SiteVisitService.reschedule updates date and preserves audit history', async () => {
        const reschedulePayload = {
            newDate: '2026-11-12',
            newTime: '02:30 PM',
            reason: 'Client requested postponement due to business travel'
        };

        const result = await SiteVisitService.reschedule(siteVisitActivityId, reschedulePayload, { _id: agentId, name: 'Agent Rajesh' });

        assert.strictEqual(result.message, 'Site visit rescheduled successfully');
        const act = db.activities.get(String(siteVisitActivityId));
        assert.strictEqual(act.status, 'Pending');
        assert.strictEqual(act.dueTime, '02:30 PM');
        assert.strictEqual(act.details.rescheduleHistory.length, 1);
        assert.strictEqual(act.details.rescheduleHistory[0].reason, 'Client requested postponement due to business travel');
    });

    console.log('\n--- Step 5: 24h & 2h Automated Reminders ---');
    await recordAsync('SiteVisitAutomationService executes 24h and 2h reminder scans', async () => {
        // Move due date to match 24h window
        const act = db.activities.get(String(siteVisitActivityId));
        act.dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        act.status = 'Scheduled';

        const res24 = await SiteVisitAutomationService.dispatch24hReminders();
        assert.strictEqual(res24.count, 1);
        assert.strictEqual(act.details.remindersSent.h24, true);

        // Advance to 2h window
        act.dueDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const res2 = await SiteVisitAutomationService.dispatch2hReminders();
        assert.strictEqual(res2.count, 1);
        assert.strictEqual(act.details.remindersSent.h2, true);
    });

    console.log('\n--- Step 6: Site Visit Completion & Feedback Token Dispatch ---');
    await recordAsync('SiteVisitService.complete records outcome, creates token & dispatches feedback link', async () => {
        const completionPayload = {
            outcome: 'Interested',
            visitedProperties: [
                { project: 'Godrej Woods', block: 'Tower B', property: 'Unit 1204', result: 'Interested' }
            ],
            completionNotes: 'Client loved the park view and balcony. Ready to proceed to deal negotiation.'
        };

        const result = await SiteVisitService.complete(siteVisitActivityId, completionPayload, { _id: agentId, name: 'Agent Rajesh' });

        assert.strictEqual(result.message, 'Site visit completed successfully');
        // GAP C: Raw credentials removed from service contract
        assert.strictEqual(result.feedbackToken, undefined, 'feedbackToken must NOT be returned in service contract');
        assert.strictEqual(result.feedbackLink, undefined, 'feedbackLink must NOT be returned in service contract');

        const act = db.activities.get(String(siteVisitActivityId));
        assert.strictEqual(act.status, 'Completed');
        assert.strictEqual(act.completionResult, 'Interested');
        assert(act.details.feedbackTokenHash, 'Activity details must contain feedbackTokenHash');
        assert(act.details.feedbackTokenJti, 'Activity details must contain feedbackTokenJti');
        assert(act.details.feedbackDispatchedAt);

        // Sign customer feedback token for the client simulation in Step 7
        feedbackToken = jwt.sign(
            {
                iss: 'bharat-properties-crm',
                leadId: String(leadId),
                activityId: String(siteVisitActivityId),
                purpose: 'customer_feedback',
                source: 'site_visit_completion',
                formSlug: 'customer-experience-feedback-qx9z2'
            },
            process.env.FEEDBACK_JWT_SECRET || process.env.JWT_SECRET
        );
    });

    console.log('\n--- Step 7: Customer 5-Star Feedback Submission ---');
    await recordAsync('Customer submits 5-star feedback, closing loop and boosting intent score', async () => {
        const req = {
            params: { slug: 'customer-experience-feedback-qx9z2' },
            body: {
                token: feedbackToken,
                responses: {
                    fld_rating: '5',
                    fld_comments: 'Outstanding tour and professional advisory by Agent Rajesh.'
                }
            },
            query: {}
        };
        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await submitFeedback(req, res, () => {});

        assert.strictEqual(res.statusCode, 201);
        const act = db.activities.get(String(siteVisitActivityId));
        assert(act.tags.includes('High-Satisfaction'));
        assert.strictEqual(act.details.customerFeedback.rating, 5);

        const lead = db.leads.get(String(leadId));
        assert.strictEqual(lead.latestFeedbackRating, 5);
        assert(lead.intent_index >= 50, 'Intent index should be boosted by positive feedback');
    });

    console.log('\n--- Step 8: Deal Creation with Closed-Loop Attribution ---');
    await recordAsync('createStandardizedDeal creates Deal inheriting siteVisitId and marketingAttribution', async () => {
        const dealInput = {
            source: 'API',
            dealData: {
                title: 'Singhania Godrej Woods Deal',
                projectName: 'Godrej Woods',
                price: 25000000
            },
            linkage: {
                leadId,
                siteVisitId: siteVisitActivityId
            }
        };

        const result = await createStandardizedDeal(dealInput);

        assert.strictEqual(result.success, true);
        dealId = result.deal._id;
        assert(db.deals.has(String(dealId)));

        const deal = db.deals.get(String(dealId));
        assert.strictEqual(String(deal.siteVisitId), String(siteVisitActivityId));
        assert.strictEqual(deal.visitedUnit, 'Unit 1204');
        assert(deal.marketingAttribution);
        assert.strictEqual(deal.marketingAttribution.campaign, 'diwali_luxury_villas_2026');
        assert.strictEqual(deal.marketingAttribution.source, 'meta_ads');

        // Verify backlink on site visit activity
        const act = db.activities.get(String(siteVisitActivityId));
        assert.strictEqual(String(act.details.linkedDealId), String(dealId));
    });

    console.log('\n--- Step 9: Property Booking & Revenue Attribution ---');
    await recordAsync('createBooking confirms booking, inherits campaign attribution and marks unit booked', async () => {
        const bookingReq = {
            body: {
                dealId,
                lead: leadId,
                totalDealAmount: 25000000,
                tokenAmount: 1000000,
                applicationNo: 'BK-2026-DIWALI-01'
            },
            headers: {},
            user: { _id: agentId, department: 'Luxury Sales' }
        };

        const bookingRes = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await createBooking(bookingReq, bookingRes);

        assert.strictEqual(bookingRes.statusCode, 201);
        bookingId = bookingRes.body.data._id;
        assert(db.bookings.has(String(bookingId)));

        const booking = db.bookings.get(String(bookingId));
        assert.strictEqual(String(booking.siteVisitId), String(siteVisitActivityId));
        assert.strictEqual(booking.marketingAttribution.campaign, 'diwali_luxury_villas_2026');
        assert.strictEqual(booking.totalDealAmount, 25000000);

        // Verify Deal status is now Booked / Won
        const deal = db.deals.get(String(dealId));
        assert.strictEqual(deal.stage, 'Booked');

        // Verify backlink to site visit activity
        const act = db.activities.get(String(siteVisitActivityId));
        assert.strictEqual(String(act.details.linkedBookingId), String(bookingId));
    });

    console.log('\n--- Step 10: Closed-Loop Analytics Funnel & Attribution Verification ---');
    await recordAsync('Analytics endpoints verify end-to-end site visit funnel and campaign ROI', async () => {
        // Test Funnel Analytics
        const funnelReq = { query: { timeframe: '30' } };
        const funnelRes = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getSiteVisitFunnelAnalytics(funnelReq, funnelRes);

        assert.strictEqual(funnelRes.body.success, true);
        const funnel = funnelRes.body.data.summary;
        assert.strictEqual(funnel.totalScheduled, 1);
        assert.strictEqual(funnel.totalCompleted, 1);
        assert.strictEqual(funnel.feedbackReceived, 1);
        assert.strictEqual(funnel.averageRating, 5.0);
        assert.strictEqual(funnel.highSatisfactionCount, 1);
        assert.strictEqual(funnel.dealsWon, 1);
        assert.strictEqual(funnel.totalBookings, 1);
        assert.strictEqual(funnel.totalRevenue, 25000000);

        // Test Campaign Attribution Analytics
        const campReq = { query: { timeframe: '30' } };
        const campRes = {
            statusCode: null, body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await getCampaignAttributionAnalytics(campReq, campRes);

        assert.strictEqual(campRes.body.success, true);
        const { campaigns } = campRes.body.data;
        const diwaliCampaign = campaigns.find(c => c.campaign === 'diwali_luxury_villas_2026');
        assert(diwaliCampaign, 'diwali_luxury_villas_2026 campaign must be present');
        assert.strictEqual(diwaliCampaign.leadsCount, 1);
        assert.strictEqual(diwaliCampaign.siteVisitsScheduled, 1);
        assert.strictEqual(diwaliCampaign.siteVisitsCompleted, 1);
        assert.strictEqual(diwaliCampaign.dealsWon, 1);
        assert.strictEqual(diwaliCampaign.totalRevenue, 25000000);
        assert.strictEqual(diwaliCampaign.conversionRate, 100);
    });

    console.log(`\n========================================`);
    console.log(`All 10 E2E Lifecycle Stages Verified!`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    WhatsAppService.sendMessage = origWaSendMessage;

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runE2ETests().catch(err => {
    console.error('E2E Test Execution Failed:', err);
    process.exit(1);
});
