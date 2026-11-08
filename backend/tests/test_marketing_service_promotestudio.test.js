import test from 'node:test';
import assert from 'node:assert/strict';
import marketingService from '../services/MarketingService.js';
import unifiedAIService from '../services/UnifiedAIService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

test('MarketingService — Promote Studio Multi-Tone AI Copywriter & Compliance Validation', async (t) => {
    const originalGenerate = unifiedAIService.generate;
    const originalFindOne = SystemSetting.findOne;

    t.afterEach(() => {
        unifiedAIService.generate = originalGenerate;
        SystemSetting.findOne = originalFindOne;
    });

    // Mock SystemSetting.findOne to return immediately
    SystemSetting.findOne = () => ({
        lean: async () => ({ value: 'mocked' }),
        then: (resolve) => resolve({ value: 'mocked' })
    });

    await t.test('1. Multi-tone AI copywriter generation with fallback resilience', async () => {
        // Force fallback path by simulating AI failure
        unifiedAIService.generate = async () => {
            throw new Error('AI Service Offline (Simulated)');
        };

        const verifiedDeal = {
            unitNo: 'Villa 101',
            projectName: 'Royal Palms',
            location: 'Sector 32, Kurukshetra, Haryana',
            price: 25000000,
            size: 3200,
            sizeUnit: 'sq.ft',
            unitType: 'Independent Villa',
            isVerified: true,
            reraNumber: 'HRERA-PKL-KUK-2024-889'
        };

        // 1.1 Urgent (Hinglish) Tone
        const urgentPost = await marketingService.generateSocialPost(verifiedDeal, 'facebook', { tone: 'urgent', format: 'post' });
        assert.ok(urgentPost.includes('URGENT DEAL ALERT'), 'Should include urgent header');
        assert.ok(urgentPost.includes('+91 99913 33570'), 'Should include Kurukshetra regional phone');
        assert.ok(urgentPost.includes('Verified Title & RERA Compliant'), 'Should include verified & RERA claims when present in record');

        // 1.2 Luxury Living Tone
        const luxuryPost = await marketingService.generateSocialPost(verifiedDeal, 'instagram', { tone: 'luxury', format: 'post' });
        assert.ok(luxuryPost.includes('EXCLUSIVE LUXURY LIVING'), 'Should include luxury header');
        assert.ok(luxuryPost.includes('Verified Title & RERA Compliant'), 'Should include verified claims');

        // 1.3 Investor ROI Tone
        const investorPost = await marketingService.generateSocialPost(verifiedDeal, 'linkedin', { tone: 'investor', format: 'post' });
        assert.ok(investorPost.includes('HIGH-YIELD INVESTMENT OPPORTUNITY'), 'Should include investor header');
        assert.ok(investorPost.includes('Verified Title'), 'Should include verified title');

        // 1.4 Short Hook Tone
        const hookPost = await marketingService.generateSocialPost(verifiedDeal, 'x', { tone: 'short_hook', format: 'post' });
        assert.ok(hookPost.includes('Prime Deal Alert in Sector 32, Kurukshetra, Haryana'), 'Should include location hook');
        assert.ok(hookPost.length < 280, 'Short hook should remain under 280 characters');
    });

    await t.test('2. Unverified claims protection (No RERA / unverified title if not in records)', async () => {
        unifiedAIService.generate = async () => {
            throw new Error('AI Service Offline');
        };

        const unverifiedDeal = {
            unitNo: 'Plot 45',
            projectName: 'Green Enclave',
            location: 'Pehowa Road, Kurukshetra',
            price: '₹ 45 Lakhs',
            size: 150,
            sizeUnit: 'sq.yards',
            unitType: 'Residential Plot',
            isVerified: false,
            // No reraId or reraNumber
        };

        const post = await marketingService.generateSocialPost(unverifiedDeal, 'facebook', { tone: 'luxury', format: 'post' });
        assert.ok(!post.includes('RERA Compliant'), 'Must NOT claim RERA compliance when not present in record');
        assert.ok(!post.includes('Verified Title'), 'Must NOT claim Verified Title when isVerified is false');
        assert.ok(post.includes('Clear Documentation'), 'Should safely claim Clear Documentation instead');
    });

    await t.test('3. Regional phone contact resolution', async () => {
        unifiedAIService.generate = async () => {
            throw new Error('AI Service Offline');
        };

        const mohaliDeal = {
            unitNo: 'Penthouse 1201',
            projectName: 'Aerocity Heights',
            location: 'Sector 82, Mohali, Punjab',
            price: 32000000,
            isVerified: true
        };

        const mohaliPost = await marketingService.generateSocialPost(mohaliDeal, 'facebook', { tone: 'urgent' });
        assert.ok(mohaliPost.includes('+91 99910 00570'), 'Mohali location must resolve to +91 99910 00570');
        assert.ok(!mohaliPost.includes('+91 99913 33570'), 'Must not resolve to Kurukshetra number');

        const kurukshetraDeal = {
            unitNo: 'Shop 12',
            projectName: 'City Centre',
            location: 'Railway Road, Kurukshetra',
            price: 8500000
        };
        const kkrPost = await marketingService.generateSocialPost(kurukshetraDeal, 'facebook', { tone: 'urgent' });
        assert.ok(kkrPost.includes('+91 99913 33570'), 'Kurukshetra location must resolve to +91 99913 33570');
    });

    await t.test('4. AI Generation Success: passes prompt with tone & platform strategy to UnifiedAIService', async () => {
        let capturedPrompt = '';
        let capturedOptions = null;

        unifiedAIService.generate = async (prompt, options) => {
            capturedPrompt = prompt;
            capturedOptions = options;
            return 'AI Generated Post Content Success';
        };

        const deal = {
            unitNo: 'Office 402',
            projectName: 'Tech Hub',
            location: 'Sector 150, Noida',
            price: '₹ 1.2 Cr',
            isVerified: true,
            reraId: 'UPRERA123'
        };

        const result = await marketingService.generateSocialPost(deal, 'linkedin', { tone: 'investor', format: 'post' });
        assert.equal(result, 'AI Generated Post Content Success');
        assert.ok(capturedPrompt.includes('INVESTOR ROI & CAPITAL GROWTH'), 'Prompt should include tone strategy');
        assert.ok(capturedPrompt.includes('linkedin'), 'Prompt should include platform');
        assert.ok(capturedPrompt.includes('Tech Hub'), 'Prompt should include project name');
    });
});
