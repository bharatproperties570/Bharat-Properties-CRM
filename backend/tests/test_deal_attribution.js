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

console.log('=== Phase 5: Deal & Booking Closed-Loop Attribution Suite ===');

async function runTests() {
    const { createStandardizedDeal } = await import('../services/DealCreationEngine.js');
    const { createBooking } = await import('../controllers/booking.controller.js');
    const { addDeal } = await import('../controllers/deal.controller.js');

    // Models
    const Deal = mongoose.models.Deal || mongoose.model('Deal');
    const Booking = mongoose.models.Booking || mongoose.model('Booking');
    const Lead = mongoose.models.Lead || mongoose.model('Lead');
    const Activity = mongoose.models.Activity || mongoose.model('Activity');
    const AutomationLog = mongoose.models.AutomationLog || mongoose.model('AutomationLog');
    const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting');

    // Save originals
    const origDealCreate = Deal.create;
    const origDealFindOne = Deal.findOne;
    const origDealFindById = Deal.findById;
    const origDealFindByIdAndUpdate = Deal.findByIdAndUpdate;

    const origLeadFindById = Lead.findById;
    const origActFindById = Activity.findById;
    const origActFindOne = Activity.findOne;
    const origActFindByIdAndUpdate = Activity.findByIdAndUpdate;
    const origActCreate = Activity.create;

    const origBookingCreate = Booking.create;
    const origBookingFindOne = Booking.findOne;
    const origBookingFindByIdAndUpdate = Booking.findByIdAndUpdate;

    const origAutoLogFindOne = AutomationLog.findOne;
    const origAutoLogCreate = AutomationLog.create;
    const origAutoLogUpdateOne = AutomationLog.updateOne;
    const origSystemSettingFindOne = SystemSetting.findOne;

    console.log('\n--- 1. Deal Marketing Attribution from Lead ---');
    await recordAsync('Deal inherits UTM attribution from Lead when not explicitly provided', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeDealId = new mongoose.Types.ObjectId();

        Lead.findById = () => ({
            session: () => ({
                lean: () => Promise.resolve({
                    _id: fakeLeadId,
                    name: 'Karan Mehra',
                    source: 'Google Ads',
                    campaign: 'Summer Sale',
                    source_meta: {
                        utm_source: 'google',
                        utm_medium: 'cpc',
                        utm_campaign: 'luxury_villas_noida',
                        utm_content: 'banner_ad_4k',
                        utm_term: 'noida villas',
                        landingPage: 'https://bharatproperties.com/villas'
                    },
                    createdAt: new Date('2026-06-01T10:00:00Z')
                })
            })
        });

        Activity.findOne = () => ({
            sort: () => ({
                session: () => Promise.resolve(null)
            })
        });

        SystemSetting.findOne = () => ({
            session: () => ({
                lean: () => Promise.resolve({ value: 'relaxed' })
            })
        });

        let createdPayload = null;
        Deal.create = (docs) => {
            createdPayload = docs[0];
            return Promise.resolve([{
                ...docs[0],
                _id: fakeDealId,
                stage: 'Open'
            }]);
        };

        Deal.findByIdAndUpdate = () => Promise.resolve({});

        const result = await createStandardizedDeal({
            source: 'API',
            dealData: {
                projectName: 'Godrej Woods'
            },
            linkage: {
                leadId: fakeLeadId
            }
        });

        assert.strictEqual(result.success, true);
        assert(createdPayload.marketingAttribution);
        assert.strictEqual(createdPayload.marketingAttribution.source, 'google');
        assert.strictEqual(createdPayload.marketingAttribution.medium, 'cpc');
        assert.strictEqual(createdPayload.marketingAttribution.campaign, 'luxury_villas_noida');
        assert.strictEqual(createdPayload.marketingAttribution.content, 'banner_ad_4k');
        assert.strictEqual(createdPayload.marketingAttribution.term, 'noida villas');
        assert.strictEqual(createdPayload.source, 'google');
    });

    console.log('\n--- 2. Deal Attribution & Unit Linkage from Completed Site Visit ---');
    await recordAsync('Deal links siteVisitId, unitNo and back-links deal to Site Visit activity', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeActId = new mongoose.Types.ObjectId();
        const fakeDealId = new mongoose.Types.ObjectId();

        Lead.findById = () => ({
            session: () => ({
                lean: () => Promise.resolve({
                    _id: fakeLeadId,
                    name: 'Priya Sharma',
                    source: 'Facebook',
                    source_meta: { utm_source: 'meta', utm_campaign: 'tower_launch' }
                })
            })
        });

        const mockSiteVisit = {
            _id: fakeActId,
            type: 'Site Visit',
            status: 'Completed',
            details: {
                visitedProperties: [
                    { project: 'Godrej Palm', block: 'B', property: 'Unit 502', result: 'Interested' }
                ]
            }
        };

        Activity.findById = () => ({
            session: () => Promise.resolve(mockSiteVisit)
        });

        let backlinkUpdate = null;
        Activity.findByIdAndUpdate = (id, update) => {
            backlinkUpdate = { id, update };
            return Promise.resolve(mockSiteVisit);
        };

        SystemSetting.findOne = () => ({
            session: () => ({
                lean: () => Promise.resolve({ value: 'relaxed' })
            })
        });

        let createdPayload = null;
        Deal.create = (docs) => {
            createdPayload = docs[0];
            return Promise.resolve([{
                ...docs[0],
                _id: fakeDealId,
                stage: 'Open'
            }]);
        };

        Deal.findByIdAndUpdate = () => Promise.resolve({});

        const result = await createStandardizedDeal({
            source: 'API',
            dealData: {
                title: 'Palm Retreat Deal'
            },
            linkage: {
                leadId: fakeLeadId,
                siteVisitId: fakeActId
            }
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(String(createdPayload.siteVisitId), String(fakeActId));
        assert.strictEqual(createdPayload.unitNo, 'Unit 502');
        assert.strictEqual(createdPayload.projectName, 'Godrej Palm');
        assert.strictEqual(createdPayload.visitedUnit, 'Unit 502');

        // Check backlink to Activity
        assert(backlinkUpdate, 'Site visit activity should be updated with backlink');
        assert.strictEqual(String(backlinkUpdate.id), String(fakeActId));
        assert.strictEqual(String(backlinkUpdate.update.$set['details.linkedDealId']), String(fakeDealId));
    });

    console.log('\n--- 3. Booking Closed-Loop Attribution & Site Visit Linkage ---');
    await recordAsync('Booking inherits siteVisitId and marketingAttribution from Deal and backlinks activity', async () => {
        const fakeDealId = new mongoose.Types.ObjectId();
        const fakeSiteVisitId = new mongoose.Types.ObjectId();
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeBookingId = new mongoose.Types.ObjectId();

        const mockDeal = {
            _id: fakeDealId,
            leadId: fakeLeadId,
            siteVisitId: fakeSiteVisitId,
            marketingAttribution: {
                source: 'google',
                medium: 'cpc',
                campaign: 'diwali_villa_2026',
                content: 'cta_button'
            },
            stage: 'Negotiation',
            negotiationRounds: []
        };

        Deal.findById = () => ({
            session: () => Promise.resolve(mockDeal)
        });
        Deal.findByIdAndUpdate = () => Promise.resolve(mockDeal);

        let createdBooking = null;
        Booking.create = (docs) => {
            createdBooking = docs[0];
            return Promise.resolve([{
                ...docs[0],
                _id: fakeBookingId
            }]);
        };

        Booking.findOne = () => Promise.resolve(null);
        Booking.findById = () => {
            const doc = { ...createdBooking, _id: fakeBookingId };
            const chain = {
                populate: () => chain,
                then: (resolve) => Promise.resolve(doc).then(resolve),
                catch: (reject) => Promise.resolve(doc).catch(reject)
            };
            return chain;
        };
        Booking.findByIdAndUpdate = () => Promise.resolve({});

        let actBacklink = null;
        Activity.findByIdAndUpdate = (id, update) => {
            actBacklink = { id, update };
            return Promise.resolve({});
        };

        let recordedActivity = null;
        Activity.create = (docs) => {
            recordedActivity = docs[0];
            return Promise.resolve([docs[0]]);
        };

        AutomationLog.findOne = () => ({
            session: () => Promise.resolve(null)
        });
        AutomationLog.create = () => Promise.resolve({});
        AutomationLog.updateOne = () => Promise.resolve({});

        const req = {
            body: {
                dealId: fakeDealId,
                totalDealAmount: 15000000,
                tokenAmount: 500000,
                applicationNo: 'BK-2026-992'
            },
            headers: {},
            user: { _id: new mongoose.Types.ObjectId(), department: 'Sales' }
        };

        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await createBooking(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert(createdBooking);
        assert.strictEqual(String(createdBooking.siteVisitId), String(fakeSiteVisitId));
        assert.strictEqual(createdBooking.marketingAttribution.campaign, 'diwali_villa_2026');
        assert.strictEqual(createdBooking.marketingAttribution.source, 'google');

        // Backlink to Site Visit activity
        assert(actBacklink);
        assert.strictEqual(String(actBacklink.id), String(fakeSiteVisitId));
        assert.strictEqual(String(actBacklink.update.$set['details.linkedBookingId']), String(fakeBookingId));

        // Audit task
        assert(recordedActivity);
        assert.strictEqual(String(recordedActivity.details.siteVisitId), String(fakeSiteVisitId));
        assert.strictEqual(recordedActivity.details.marketingAttribution.campaign, 'diwali_villa_2026');
    });

    console.log('\n--- 4. Deal Controller Input Mapping ---');
    await recordAsync('addDeal in deal.controller extracts siteVisitId and leadId correctly', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeSiteVisitId = new mongoose.Types.ObjectId();
        const fakeProjectId = new mongoose.Types.ObjectId();

        let capturedInput = null;
        const { createStandardizedDeal: origCSD } = await import('../services/DealCreationEngine.js');

        // Test payload through addDeal
        Lead.findById = () => ({
            session: () => ({
                lean: () => Promise.resolve({
                    _id: fakeLeadId,
                    source_meta: { utm_source: 'linkedin', utm_campaign: 'b2b_office' }
                })
            })
        });

        Activity.findById = () => ({
            session: () => Promise.resolve({
                _id: fakeSiteVisitId,
                type: 'Site Visit',
                status: 'Completed',
                details: { visitedProperties: [{ property: 'Suite 300' }] }
            })
        });

        SystemSetting.findOne = () => ({
            session: () => ({
                lean: () => Promise.resolve({ value: 'relaxed' })
            })
        });

        Deal.create = (docs) => Promise.resolve([{ ...docs[0], _id: new mongoose.Types.ObjectId() }]);
        Deal.findByIdAndUpdate = () => Promise.resolve({});

        const req = {
            body: {
                lead: String(fakeLeadId),
                siteVisitId: String(fakeSiteVisitId),
                projectId: String(fakeProjectId),
                projectName: 'Corporate Plaza'
            },
            headers: {}
        };

        const res = {
            statusCode: null,
            body: null,
            status(c) { this.statusCode = c; return this; },
            json(b) { this.body = b; return this; }
        };

        await addDeal(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(String(res.body.data.siteVisitId), String(fakeSiteVisitId));
        assert.strictEqual(res.body.data.marketingAttribution.source, 'linkedin');
        assert.strictEqual(res.body.data.marketingAttribution.campaign, 'b2b_office');
    });

    // Restore originals
    Deal.create = origDealCreate;
    Deal.findOne = origDealFindOne;
    Deal.findById = origDealFindById;
    Deal.findByIdAndUpdate = origDealFindByIdAndUpdate;

    Lead.findById = origLeadFindById;
    Activity.findById = origActFindById;
    Activity.findOne = origActFindOne;
    Activity.findByIdAndUpdate = origActFindByIdAndUpdate;
    Activity.create = origActCreate;

    Booking.create = origBookingCreate;
    Booking.findOne = origBookingFindOne;
    Booking.findByIdAndUpdate = origBookingFindByIdAndUpdate;

    AutomationLog.findOne = origAutoLogFindOne;
    AutomationLog.create = origAutoLogCreate;
    AutomationLog.updateOne = origAutoLogUpdateOne;
    SystemSetting.findOne = origSystemSettingFindOne;

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
