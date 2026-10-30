import assert from 'assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Import target controllers and utilities
import { LeadTokenGenerator } from '../src/utils/LeadTokenGenerator.js';
import VariableResolutionService from '../services/VariableResolutionService.js';
import { verifyWebhook as verifySocialWebhook, receiveWebhook } from '../controllers/social.controller.js';
import { facebookLeadVerify } from '../controllers/webhook.controller.js';
import { verifyWebhook as verifyWhatsAppWebhook } from '../src/modules/webhooks/whatsapp.controller.js';
import { submitWaSiteVisit, getAvailableUnits } from '../controllers/public.controller.js';
import { resolveToken, getForms, getFormBySlug } from '../controllers/dynamicForm.controller.js';
import { getMarketingContent } from '../controllers/marketing.controller.js';
import socialRouter from '../routes/social.routes.js';

console.log('=== P0 Security & Data Integrity Remediation Regression Suite ===\n');

// Mock response helper
function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        sendStatus(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
        send(data) {
            this.body = data;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
            return this;
        }
    };
}

async function runTests() {
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

    console.log('--- 1. Route Layer Authentication Enforcement ---');
    record('social.routes.js protects /whatsapp/config and /whatsapp/templates behind authenticate middleware', () => {
        const stack = socialRouter.stack;
        let authMiddlewareIndex = -1;
        let configRouteIndex = -1;
        let templatesRouteIndex = -1;

        stack.forEach((layer, idx) => {
            if (layer.name === 'authenticate' || (layer.handle && layer.handle.name === 'authenticate')) {
                authMiddlewareIndex = idx;
            }
            if (layer.route && layer.route.path === '/whatsapp/config') {
                configRouteIndex = idx;
            }
            if (layer.route && layer.route.path === '/whatsapp/templates') {
                templatesRouteIndex = idx;
            }
        });

        assert(authMiddlewareIndex !== -1, 'authenticate middleware must be present in router stack');
        assert(configRouteIndex > authMiddlewareIndex, '/whatsapp/config must be registered after authenticate middleware');
        assert(templatesRouteIndex > authMiddlewareIndex, '/whatsapp/templates must be registered after authenticate middleware');
    });

    console.log('\n--- 2. Social Controller Webhook Verification ---');
    await recordAsync('verifyWebhook fails closed (500) if FB_WEBHOOK_VERIFY_TOKEN is unset', async () => {
        const original = process.env.FB_WEBHOOK_VERIFY_TOKEN;
        delete process.env.FB_WEBHOOK_VERIFY_TOKEN;

        const req = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'bharat-properties-webhook-2026',
                'hub.challenge': '12345'
            }
        };
        const res = createMockRes();

        await verifySocialWebhook(req, res);
        assert.strictEqual(res.statusCode, 500);
        assert.strictEqual(res.body, 'Webhook verification unconfigured');

        process.env.FB_WEBHOOK_VERIFY_TOKEN = original;
    });

    await recordAsync('verifyWebhook rejects wrong token (403) and accepts valid token (200)', async () => {
        const original = process.env.FB_WEBHOOK_VERIFY_TOKEN;
        process.env.FB_WEBHOOK_VERIFY_TOKEN = 'correct_verify_secret_secure';

        // Wrong token
        const reqWrong = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'wrong_secret',
                'hub.challenge': 'chall_1'
            }
        };
        const resWrong = createMockRes();
        await verifySocialWebhook(reqWrong, resWrong);
        assert.strictEqual(resWrong.statusCode, 403);

        // Correct token
        const reqRight = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'correct_verify_secret_secure',
                'hub.challenge': 'chall_success_999'
            }
        };
        const resRight = createMockRes();
        await verifySocialWebhook(reqRight, resRight);
        assert.strictEqual(resRight.statusCode, 200);
        assert.strictEqual(resRight.body, 'chall_success_999');

        process.env.FB_WEBHOOK_VERIFY_TOKEN = original;
    });

    console.log('\n--- 3. Webhook Signature Verification (HMAC SHA-256) ---');
    await recordAsync('receiveWebhook enforces HMAC signature when FB_APP_SECRET is set', async () => {
        const originalAppSecret = process.env.FB_APP_SECRET;
        process.env.FB_APP_SECRET = 'app_secret_test_key_xyz';

        const payload = { object: 'page', entry: [] };

        // 1. Missing signature -> 401
        const reqNoSig = {
            headers: {},
            body: payload
        };
        const resNoSig = createMockRes();
        await receiveWebhook(reqNoSig, resNoSig);
        assert.strictEqual(resNoSig.statusCode, 401);

        // 2. Invalid signature -> 401
        const reqBadSig = {
            headers: { 'x-hub-signature-256': 'sha256=invaliddeadbeef000000000000000000000000000000000000000000000000' },
            body: payload
        };
        const resBadSig = createMockRes();
        await receiveWebhook(reqBadSig, resBadSig);
        assert.strictEqual(resBadSig.statusCode, 401);

        // 3. Valid signature -> 200
        const validHmac = crypto.createHmac('sha256', 'app_secret_test_key_xyz')
            .update(JSON.stringify(payload))
            .digest('hex');
        const reqValidSig = {
            headers: { 'x-hub-signature-256': `sha256=${validHmac}` },
            body: payload
        };
        const resValidSig = createMockRes();
        await receiveWebhook(reqValidSig, resValidSig);
        assert.strictEqual(resValidSig.statusCode, 200);

        process.env.FB_APP_SECRET = originalAppSecret;
    });

    console.log('\n--- 4. Facebook Lead Webhook & WhatsApp Webhook Verification ---');
    record('facebookLeadVerify in webhook.controller fails closed if FB_WEBHOOK_VERIFY_TOKEN unset', () => {
        const original = process.env.FB_WEBHOOK_VERIFY_TOKEN;
        delete process.env.FB_WEBHOOK_VERIFY_TOKEN;

        const req = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'any_token',
                'hub.challenge': 'chall'
            }
        };
        const res = createMockRes();
        facebookLeadVerify(req, res);
        assert.strictEqual(res.statusCode, 500);

        process.env.FB_WEBHOOK_VERIFY_TOKEN = original;
    });

    record('WhatsApp webhook verify fails closed if WHATSAPP_VERIFY_TOKEN unset', () => {
        const original = process.env.WHATSAPP_VERIFY_TOKEN;
        delete process.env.WHATSAPP_VERIFY_TOKEN;

        const req = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'any_token',
                'hub.challenge': 'chall'
            }
        };
        const res = createMockRes();
        verifyWhatsAppWebhook(req, res);
        assert.strictEqual(res.statusCode, 500);

        process.env.WHATSAPP_VERIFY_TOKEN = original;
    });

    console.log('\n--- 5. NoSQL Injection Guards on Public Endpoints ---');
    await recordAsync('getAvailableUnits rejects object or operator injection in project and block', async () => {
        // Injection in project
        const reqObjProject = { query: { project: { $gt: '' } } };
        const resObjProject = createMockRes();
        await getAvailableUnits(reqObjProject, resObjProject);
        assert.strictEqual(resObjProject.statusCode, 400);

        const reqDollarProject = { query: { project: '$ne' } };
        const resDollarProject = createMockRes();
        await getAvailableUnits(reqDollarProject, resDollarProject);
        assert.strictEqual(resDollarProject.statusCode, 400);

        // Injection in block
        const reqObjBlock = { query: { project: 'ValidProject', block: { $regex: '.*' } } };
        const resObjBlock = createMockRes();
        await getAvailableUnits(reqObjBlock, resObjBlock);
        assert.strictEqual(resObjBlock.statusCode, 400);
    });

    await recordAsync('getForms rejects operator injection in category', async () => {
        const reqObjCat = { query: { category: { $ne: null } } };
        const resObjCat = createMockRes();
        await getForms(reqObjCat, resObjCat);
        assert.strictEqual(resObjCat.statusCode, 400);

        const reqDollarCat = { query: { category: '$gt' } };
        const resDollarCat = createMockRes();
        await getForms(reqDollarCat, resDollarCat);
        assert.strictEqual(resDollarCat.statusCode, 400);
    });

    await recordAsync('getFormBySlug rejects operator injection in slug', async () => {
        const reqDollarSlug = { params: { slug: '$where' } };
        const resDollarSlug = createMockRes();
        await getFormBySlug(reqDollarSlug, resDollarSlug);
        assert.strictEqual(resDollarSlug.statusCode, 400);

        const reqEmptySlug = { params: { slug: '' } };
        const resEmptySlug = createMockRes();
        await getFormBySlug(reqEmptySlug, resEmptySlug);
        assert.strictEqual(resEmptySlug.statusCode, 400);
    });

    console.log('\n--- 6. JWT Secret Precedence & Fail-Closed Guards ---');
    await recordAsync('submitWaSiteVisit fails closed (400) if JWT_SECRET is unset or invalid', async () => {
        const origJwt = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;

        const req = {
            body: {
                token: jwt.sign({ leadId: '60c72b2f9b1d8b2bad000001' }, 'crm_secret_key')
            }
        };
        const res = createMockRes();
        await submitWaSiteVisit(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);

        process.env.JWT_SECRET = origJwt;
    });

    await recordAsync('resolveToken in dynamicForm.controller fails closed if JWT_SECRET unset or legacy fallback used', async () => {
        const origJwt = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;

        const reqNoSecret = { params: { token: 'sample~token' } };
        const resNoSecret = createMockRes();
        await resolveToken(reqNoSecret, resNoSecret);
        assert.strictEqual(resNoSecret.statusCode, 400);
        assert.strictEqual(resNoSecret.body.success, false);

        // With JWT_SECRET configured, a token signed with 'crm_secret_key' must be rejected
        process.env.JWT_SECRET = 'super_secure_enterprise_key_2026';
        const weakToken = jwt.sign({ leadId: '60c72b2f9b1d8b2bad000001' }, 'crm_secret_key').replace(/\./g, '~');
        const reqWeak = { params: { token: weakToken } };
        const resWeak = createMockRes();
        await resolveToken(reqWeak, resWeak);
        assert.strictEqual(resWeak.statusCode, 400);
        assert.strictEqual(resWeak.body.success, false);

        process.env.JWT_SECRET = origJwt;
    });

    record('LeadTokenGenerator fails closed when JWT_SECRET is missing', () => {
        const origJwt = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;

        assert.throws(() => {
            LeadTokenGenerator.generate('60c72b2f9b1d8b2bad000001');
        }, /FATAL: JWT secret not configured/, 'Token generator must throw FATAL error when JWT_SECRET is missing');

        process.env.JWT_SECRET = 'strong_test_secret_123';
        const validToken = LeadTokenGenerator.generate('60c72b2f9b1d8b2bad000001');
        assert(validToken.length > 20, 'Should generate token when JWT_SECRET is present');
        assert(!validToken.includes('.'), 'Meta WhatsApp token must not contain dots');
        assert(validToken.includes('~'), 'Meta WhatsApp token must replace dots with ~');

        // Verify it decodes with the secret
        const decoded = jwt.verify(validToken.replace(/~/g, '.'), 'strong_test_secret_123');
        assert.strictEqual(decoded.leadId, '60c72b2f9b1d8b2bad000001');

        process.env.JWT_SECRET = origJwt;
    });

    record('VariableResolutionService siteVisitLink & feedbackLink fail closed when JWT_SECRET is missing', () => {
        const origJwt = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;

        const mockLead = { _id: '60c72b2f9b1d8b2bad000001', name: 'Test Lead' };
        const siteVisit = VariableResolutionService.extractValue(mockLead, 'siteVisitLink');
        const feedback = VariableResolutionService.extractValue(mockLead, 'feedbackLink');

        assert.strictEqual(siteVisit, 'error', 'siteVisitLink must fail closed with error when JWT_SECRET is unset');
        assert.strictEqual(feedback, 'error', 'feedbackLink must fail closed with error when JWT_SECRET is unset');

        process.env.JWT_SECRET = 'strong_test_secret_123';
        const siteVisitValid = VariableResolutionService.extractValue(mockLead, 'siteVisitLink');
        const feedbackValid = VariableResolutionService.extractValue(mockLead, 'feedbackLink');

        assert(siteVisitValid.includes('https://'), 'Should produce valid URL when JWT_SECRET is set');
        assert(feedbackValid.includes('https://'), 'Should produce valid URL when JWT_SECRET is set');

        process.env.JWT_SECRET = origJwt;
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

runTests().catch(err => {
    console.error('Unexpected test suite error:', err);
    process.exit(1);
});
