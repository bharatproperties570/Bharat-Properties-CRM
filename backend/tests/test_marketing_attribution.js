import assert from 'assert';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

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

console.log('=== Phase 6: Marketing OS Content & Campaign Attribution Suite ===');

async function runTests() {
    process.env.JWT_SECRET = 'marketing-super-secret-key-32-chars-long';
    process.env.FRONTEND_URL = 'https://bharatproperties.co';

    const { createCampaignTrackedLink, _dispatchDirectly } = await import('../controllers/marketing.controller.js');
    const VariableResolutionService = (await import('../services/VariableResolutionService.js')).default;

    const Lead = mongoose.models.Lead || mongoose.model('Lead');
    const Activity = mongoose.models.Activity || mongoose.model('Activity');

    const origLeadFindByIdAndUpdate = Lead.findByIdAndUpdate;
    const origActCreate = Activity.create;

    console.log('\n--- 1. Campaign Tracked Link Generation ---');
    await recordAsync('createCampaignTrackedLink produces valid UTM query string and signed token', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const fakeProjectId = new mongoose.Types.ObjectId();

        const req = {
            body: {
                destinationUrl: 'https://bharatproperties.co/projects/godrej-woods',
                campaignName: 'diwali_mega_launch_2026',
                source: 'meta_ads',
                medium: 'cpc',
                content: 'hero_video_reels',
                term: 'luxury 3bhk',
                leadId: String(fakeLeadId),
                projectId: String(fakeProjectId)
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
        const { url, token, attribution } = res.body.data;
        assert(url.includes('https://bharatproperties.co/projects/godrej-woods?'));
        assert(url.includes('utm_source=meta_ads'));
        assert(url.includes('utm_medium=cpc'));
        assert(url.includes('utm_campaign=diwali_mega_launch_2026'));
        assert(url.includes('utm_content=hero_video_reels'));
        assert(url.includes('utm_term=luxury+3bhk') || url.includes('utm_term=luxury%203bhk'));
        assert(url.includes(`ref=${token}`));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        assert.strictEqual(decoded.leadId, String(fakeLeadId));
        assert.strictEqual(decoded.campaign, 'diwali_mega_launch_2026');
        assert.strictEqual(decoded.source, 'meta_ads');
    });

    console.log('\n--- 2. Variable Resolution Campaign & Site Visit Links ---');
    await record('VariableResolutionService resolves campaign_link with lead token and UTMs', () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        const lead = {
            id: fakeLeadId,
            name: 'Ananya Verma',
            campaign: 'spring_bonanza_2026',
            source: 'whatsapp_blast',
            context: {
                destinationUrl: 'https://bharatproperties.co/public/villas',
                channel: 'whatsapp'
            }
        };

        const resolved = VariableResolutionService.resolveForLeads(lead, {
            "1": "campaign_link",
            "2": "site_visit_link",
            "3": "feedback_link"
        });

        assert(resolved["1"].includes('https://bharatproperties.co/public/villas'));
        assert(resolved["1"].includes('utm_campaign=spring_bonanza_2026'));
        assert(resolved["1"].includes('utm_source=whatsapp_blast'));
        assert(resolved["1"].includes('&ref='));

        assert(resolved["2"].includes('standard-project-tour-scheduler-bqnh6visit'));
        assert(resolved["2"].includes('utm_campaign=spring_bonanza_2026'));
        assert(resolved["2"].includes('utm_medium=messaging'));

        assert(resolved["3"].includes('customer-experience-feedback-qx9z2'));
    });

    console.log('\n--- 3. Direct Dispatch Attribution Propagation ---');
    await recordAsync('_dispatchDirectly attaches campaign attribution to Activity and updates Lead', async () => {
        const fakeLeadId = new mongoose.Types.ObjectId();
        let loggedActivity = null;
        let updatedLead = null;

        Activity.create = (doc) => {
            loggedActivity = doc;
            return Promise.resolve(doc);
        };

        Lead.findByIdAndUpdate = (id, update) => {
            updatedLead = { id, update };
            return Promise.resolve({});
        };

        // We mock emailService or run with mock recipient
        const dispatchData = {
            channel: 'email',
            name: 'Gurugram Luxury Penthouse Blast',
            subject: 'Exclusive Penthouse Launch',
            content: 'Hello {{name}}, welcome to our exclusive launch.',
            recipients: [{
                id: fakeLeadId,
                name: 'Rajesh Khanna',
                email: 'rajesh@example.com',
                context: { originalType: 'Lead' }
            }],
            attribution: {
                campaignId: 'camp_9921',
                campaignName: 'Gurugram Luxury Penthouse Blast',
                utmSource: 'email_newsletter',
                utmMedium: 'email',
                utmCampaign: 'penthouse_launch_q4',
                utmContent: 'early_bird_discount'
            },
            performedBy: 'Marketing OS'
        };

        await _dispatchDirectly(dispatchData);

        assert(loggedActivity, 'Marketing activity must be logged');
        assert.strictEqual(loggedActivity.type, 'Marketing');
        assert(loggedActivity.details.attribution);
        assert.strictEqual(loggedActivity.details.attribution.utmCampaign, 'penthouse_launch_q4');
        assert.strictEqual(loggedActivity.details.attribution.utmSource, 'email_newsletter');
        assert.strictEqual(loggedActivity.details.attribution.utmContent, 'early_bird_discount');

        assert(updatedLead, 'Lead lastMarketingTouchpoint must be updated');
        assert.strictEqual(String(updatedLead.id), String(fakeLeadId));
        assert.strictEqual(updatedLead.update.$set.lastMarketingTouchpoint.campaignName, 'Gurugram Luxury Penthouse Blast');
        assert.strictEqual(updatedLead.update.$set.lastMarketingTouchpoint.utmCampaign, 'penthouse_launch_q4');
    });

    // Cleanup
    Activity.create = origActCreate;
    Lead.findByIdAndUpdate = origLeadFindByIdAndUpdate;

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
