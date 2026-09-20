/**
 * Test Suite: WhatsApp Coexistence Embedded Signup Verification
 * Tests Cases A through F:
 * - Case A: FB SDK code exchange with empty redirect_uri (omitted from Meta request)
 * - Case B: Coexistence phone with status PENDING results in status='PENDING', onboardingStatus='HANDSHAKE_PENDING'
 * - Case C: Coexistence phone with status CONNECTED results in status='ACTIVE', onboardingStatus='CONNECTED'
 * - Case D: Status check endpoint re-verifies HANDSHAKE_PENDING phone and promotes to CONNECTED
 * - Case E: Main API (NEW_API) onboarding flow is completely untouched (calls /register, syncs legacy config)
 * - Case F: Coexistence flow NEVER calls /register and NEVER overwrites meta_wa_config
 */

import mongoose from 'mongoose';
import metaApiClient from './utils/metaApiClient.js';
import whatsAppOnboardingService from './services/WhatsAppOnboardingService.js';
import WhatsAppIntegration from './models/WhatsAppIntegration.js';
import SystemSetting from './models/SystemSetting.js';

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
    if (condition) {
        console.log(`  ✅ PASS: [${testName}]`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: [${testName}] ${detail}`);
        failed++;
    }
}

async function runTests() {
    console.log('\n================================================================');
    console.log('🧪 RUNNING WHATSAPP COEXISTENCE EMBEDDED SIGNUP TEST SUITE');
    console.log('================================================================\n');

    // ─────────────────────────────────────────────────────────────
    // CASE A: FB SDK code exchange with empty redirect_uri
    // ─────────────────────────────────────────────────────────────
    console.log('--- CASE A: FB SDK CODE EXCHANGE WITH EMPTY REDIRECT_URI ---');
    {
        let capturedParams = null;
        const originalGet = metaApiClient.client.get;
        metaApiClient.client.get = async (url, config) => {
            if (url === '/oauth/access_token') {
                capturedParams = config.params;
                return { data: { access_token: 'mock_access_token_case_a' } };
            }
            return { data: {} };
        };

        try {
            await metaApiClient.exchangeCodeForToken('test_client_id', 'test_secret', '', 'test_auth_code');
            assert(capturedParams !== null, 'Case A1: Token exchange request was executed');
            assert(capturedParams.client_id === 'test_client_id', 'Case A2: client_id matches');
            assert(capturedParams.code === 'test_auth_code', 'Case A3: code matches');
            assert(!('redirect_uri' in capturedParams), 'Case A4: redirect_uri parameter is completely omitted when empty', JSON.stringify(capturedParams));
        } finally {
            metaApiClient.client.get = originalGet;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CASE B: Coexistence phone with status PENDING -> HANDSHAKE_PENDING
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- CASE B: COEXISTENCE PENDING STATE -> HANDSHAKE_PENDING ---');
    {
        const mockOrgId = new mongoose.Types.ObjectId();
        const mockUserId = new mongoose.Types.ObjectId();
        const mockIntegrationId = new mongoose.Types.ObjectId();

        const mockIntegration = {
            _id: mockIntegrationId,
            organizationId: mockOrgId,
            connectionType: 'COEXISTENCE',
            status: 'PENDING_ONBOARDING',
            onboardingStatus: 'INITIATED',
            save: async function() { return this; }
        };

        const originalFindById = WhatsAppIntegration.findById;
        const originalFindOne = WhatsAppIntegration.findOne;
        const originalClientGet = metaApiClient.client.get;
        const originalClientPost = metaApiClient.client.post;
        let registeredPhoneCalled = false;

        WhatsAppIntegration.findById = async (id) => mockIntegration;
        WhatsAppIntegration.findOne = async () => null;

        metaApiClient.client.get = async (url, config) => {
            if (url === '/oauth/access_token') {
                return { data: { access_token: 'mock_token_case_b' } };
            }
            if (url === '/debug_token') {
                return { data: { data: { granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['1473077001025314'] }] } } };
            }
            if (url === '/1473077001025314') {
                return { data: { id: '1473077001025314', name: 'Bharat Properties' } };
            }
            if (url === '/1473077001025314/phone_numbers') {
                return { data: { data: [{ id: '1025884503949059', display_phone_number: '+91 99913 33570', platform_type: 'NOT_APPLICABLE' }] } };
            }
            if (url === '/1025884503949059') {
                // Meta returns unlinked/pending phone state
                return {
                    data: {
                        id: '1025884503949059',
                        display_phone_number: '+91 99913 33570',
                        status: 'PENDING',
                        code_verification_status: 'NOT_VERIFIED',
                        health_status: { can_send_message: 'BLOCKED' }
                    }
                };
            }
            return { data: {} };
        };

        metaApiClient.client.post = async (url, data, config) => {
            if (url.includes('/register')) {
                registeredPhoneCalled = true;
            }
            return { data: { success: true } };
        };

        try {
            const result = await whatsAppOnboardingService.completeOnboarding(mockIntegrationId.toString(), {
                code: 'valid_code',
                waba_id: '1473077001025314',
                phone_number_id: '1025884503949059',
                redirect_uri: ''
            });

            assert(result.status === 'PENDING', 'Case B1: Integration status is PENDING (not ACTIVE)', `Got: ${result.status}`);
            assert(result.onboardingStatus === 'HANDSHAKE_PENDING', 'Case B2: Onboarding status is HANDSHAKE_PENDING (not CONNECTED)', `Got: ${result.onboardingStatus}`);
            assert(result.credentials?.systemUserToken === 'mock_token_case_b', 'Case B3: Stored credentials token for later polling');
            assert(registeredPhoneCalled === false, 'Case B4: Cloud API /register was NOT called for Coexistence phone');
        } finally {
            WhatsAppIntegration.findById = originalFindById;
            WhatsAppIntegration.findOne = originalFindOne;
            metaApiClient.client.get = originalClientGet;
            metaApiClient.client.post = originalClientPost;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CASE C: Coexistence phone with status CONNECTED -> ACTIVE
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- CASE C: COEXISTENCE VERIFIED STATE -> ACTIVE & CONNECTED ---');
    {
        const mockOrgId = new mongoose.Types.ObjectId();
        const mockIntegrationId = new mongoose.Types.ObjectId();

        const mockIntegration = {
            _id: mockIntegrationId,
            organizationId: mockOrgId,
            connectionType: 'COEXISTENCE',
            status: 'PENDING_ONBOARDING',
            onboardingStatus: 'INITIATED',
            save: async function() { return this; }
        };

        const originalFindById = WhatsAppIntegration.findById;
        const originalFindOne = WhatsAppIntegration.findOne;
        const originalClientGet = metaApiClient.client.get;
        const originalClientPost = metaApiClient.client.post;

        WhatsAppIntegration.findById = async () => mockIntegration;
        WhatsAppIntegration.findOne = async () => null;

        metaApiClient.client.get = async (url, config) => {
            if (url === '/oauth/access_token') return { data: { access_token: 'mock_token_case_c' } };
            if (url === '/1473077001025314') return { data: { id: '1473077001025314', name: 'Bharat Properties' } };
            if (url === '/1473077001025314/phone_numbers') return { data: { data: [{ id: '1025884503949059', display_phone_number: '+91 99913 33570' }] } };
            if (url === '/1025884503949059') {
                // Meta returns verified and connected phone state
                return {
                    data: {
                        id: '1025884503949059',
                        display_phone_number: '+91 99913 33570',
                        status: 'CONNECTED',
                        code_verification_status: 'VERIFIED',
                        health_status: { can_send_message: 'AVAILABLE' }
                    }
                };
            }
            return { data: {} };
        };

        metaApiClient.client.post = async () => ({ data: { success: true } });

        try {
            const result = await whatsAppOnboardingService.completeOnboarding(mockIntegrationId.toString(), {
                code: 'valid_code',
                waba_id: '1473077001025314',
                phone_number_id: '1025884503949059',
                redirect_uri: ''
            });

            assert(result.status === 'ACTIVE', 'Case C1: Integration status is ACTIVE when Meta reports verified');
            assert(result.onboardingStatus === 'CONNECTED', 'Case C2: Onboarding status is CONNECTED');
            assert(result.connectedAt !== undefined, 'Case C3: connectedAt timestamp is recorded');
        } finally {
            WhatsAppIntegration.findById = originalFindById;
            WhatsAppIntegration.findOne = originalFindOne;
            metaApiClient.client.get = originalClientGet;
            metaApiClient.client.post = originalClientPost;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CASE D: Status check auto-promotes HANDSHAKE_PENDING -> CONNECTED
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- CASE D: STATUS CHECK AUTO-PROMOTION ---');
    {
        const mockPendingIntegration = {
            _id: new mongoose.Types.ObjectId(),
            connectionType: 'COEXISTENCE',
            phoneNumberId: '1025884503949059',
            status: 'PENDING',
            onboardingStatus: 'HANDSHAKE_PENDING',
            credentials: { systemUserToken: 'test_token_d' },
            save: async function() { return this; }
        };

        const originalClientGet = metaApiClient.client.get;
        // Meta now returns verified state after user accepted on mobile
        metaApiClient.client.get = async (url) => {
            if (url === '/1025884503949059') {
                return {
                    data: {
                        id: '1025884503949059',
                        status: 'CONNECTED',
                        code_verification_status: 'VERIFIED',
                        health_status: { can_send_message: 'AVAILABLE' }
                    }
                };
            }
            return { data: {} };
        };

        try {
            const updated = await whatsAppOnboardingService.checkAndPromoteCoexistenceStatus(mockPendingIntegration);
            assert(updated.status === 'ACTIVE', 'Case D1: Integration promoted to ACTIVE on status check');
            assert(updated.onboardingStatus === 'CONNECTED', 'Case D2: Integration promoted to CONNECTED on status check');
            assert(updated.connectedAt instanceof Date, 'Case D3: connectedAt timestamp set upon promotion');
        } finally {
            metaApiClient.client.get = originalClientGet;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CASE E: Main API (NEW_API) onboarding flow is completely untouched
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- CASE E: MAIN API (NEW_API) FLOW UNTOUCHED ---');
    {
        const mockIntegration = {
            _id: new mongoose.Types.ObjectId(),
            organizationId: new mongoose.Types.ObjectId(),
            connectionType: 'NEW_API',
            status: 'PENDING_ONBOARDING',
            onboardingStatus: 'INITIATED',
            save: async function() { return this; }
        };

        const originalFindById = WhatsAppIntegration.findById;
        const originalFindOne = WhatsAppIntegration.findOne;
        const originalClientGet = metaApiClient.client.get;
        const originalClientPost = metaApiClient.client.post;
        const originalFindOneSetting = SystemSetting.findOne;
        const originalFindOneAndUpdate = SystemSetting.findOneAndUpdate;
        let registerCalledWith = null;
        let legacySettingUpdated = false;

        WhatsAppIntegration.findById = async () => mockIntegration;
        WhatsAppIntegration.findOne = async () => null;
        SystemSetting.findOne = async () => ({ value: {} });
        SystemSetting.findOneAndUpdate = async (query, update) => {
            legacySettingUpdated = true;
            return {};
        };

        metaApiClient.client.get = async (url) => {
            if (url === '/oauth/access_token') return { data: { access_token: 'mock_token_main_api' } };
            if (url === '/1473077001025314') return { data: { id: '1473077001025314', name: 'Bharat Properties' } };
            if (url === '/1473077001025314/phone_numbers') return { data: { data: [{ id: '1117700221418284', display_phone_number: '+91 99960 00570', platform_type: 'CLOUD_API' }] } };
            return { data: {} };
        };

        metaApiClient.client.post = async (url, data, config) => {
            if (url.includes('/register')) {
                registerCalledWith = { url, data };
            }
            return { data: { success: true } };
        };

        try {
            const result = await whatsAppOnboardingService.completeOnboarding(mockIntegration._id.toString(), {
                code: 'code_new_api',
                waba_id: '1473077001025314',
                phone_number_id: '1117700221418284',
                pin: '654321',
                redirect_uri: ''
            });

            assert(registerCalledWith !== null, 'Case E1: NEW_API flow calls /register');
            assert(registerCalledWith.url === '/1117700221418284/register', 'Case E2: /register called with correct Main API phone ID');
            assert(registerCalledWith.data.pin === '654321', 'Case E3: /register called with PIN');
            assert(legacySettingUpdated === true, 'Case E4: NEW_API updates legacy meta_wa_config SystemSetting');
            assert(result.status === 'ACTIVE', 'Case E5: NEW_API status is ACTIVE');
            assert(result.onboardingStatus === 'CONNECTED', 'Case E6: NEW_API onboardingStatus is CONNECTED');
        } finally {
            WhatsAppIntegration.findById = originalFindById;
            WhatsAppIntegration.findOne = originalFindOne;
            metaApiClient.client.get = originalClientGet;
            metaApiClient.client.post = originalClientPost;
            SystemSetting.findOne = originalFindOneSetting;
            SystemSetting.findOneAndUpdate = originalFindOneAndUpdate;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CASE F: Coexistence flow NEVER calls /register and NEVER overwrites meta_wa_config
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- CASE F: COEXISTENCE ISOLATION INTEGRITY ---');
    {
        const mockIntegration = {
            _id: new mongoose.Types.ObjectId(),
            organizationId: new mongoose.Types.ObjectId(),
            connectionType: 'COEXISTENCE',
            status: 'PENDING_ONBOARDING',
            onboardingStatus: 'INITIATED',
            save: async function() { return this; }
        };

        const originalFindById = WhatsAppIntegration.findById;
        const originalFindOne = WhatsAppIntegration.findOne;
        const originalClientGet = metaApiClient.client.get;
        const originalClientPost = metaApiClient.client.post;
        const originalFindOneSetting = SystemSetting.findOne;
        const originalFindOneAndUpdate = SystemSetting.findOneAndUpdate;

        let registerCalled = false;
        let systemSettingUpdated = false;

        WhatsAppIntegration.findById = async () => mockIntegration;
        WhatsAppIntegration.findOne = async () => null;
        SystemSetting.findOne = async () => null;
        SystemSetting.findOneAndUpdate = async () => {
            systemSettingUpdated = true;
            return {};
        };

        metaApiClient.client.get = async (url) => {
            if (url === '/oauth/access_token') return { data: { access_token: 'mock_token_coex_f' } };
            if (url === '/1473077001025314') return { data: { id: '1473077001025314', name: 'Bharat Properties' } };
            if (url === '/1473077001025314/phone_numbers') return { data: { data: [{ id: '1025884503949059', display_phone_number: '+91 99913 33570' }] } };
            if (url === '/1025884503949059') {
                return {
                    data: {
                        id: '1025884503949059',
                        status: 'PENDING',
                        code_verification_status: 'NOT_VERIFIED'
                    }
                };
            }
            return { data: {} };
        };

        metaApiClient.client.post = async (url) => {
            if (url.includes('/register')) registerCalled = true;
            return { data: { success: true } };
        };

        try {
            await whatsAppOnboardingService.completeOnboarding(mockIntegration._id.toString(), {
                code: 'coex_code',
                waba_id: '1473077001025314',
                phone_number_id: '1025884503949059',
                redirect_uri: ''
            });

            assert(registerCalled === false, 'Case F1: Coexistence NEVER calls /register');
            assert(systemSettingUpdated === false, 'Case F2: Coexistence NEVER overwrites legacy meta_wa_config SystemSetting');
        } finally {
            WhatsAppIntegration.findById = originalFindById;
            WhatsAppIntegration.findOne = originalFindOne;
            metaApiClient.client.get = originalClientGet;
            metaApiClient.client.post = originalClientPost;
            SystemSetting.findOne = originalFindOneSetting;
            SystemSetting.findOneAndUpdate = originalFindOneAndUpdate;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
