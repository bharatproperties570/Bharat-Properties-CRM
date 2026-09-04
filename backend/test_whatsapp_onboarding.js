import mongoose from 'mongoose';
import dotenv from 'dotenv';
import whatsAppOnboardingService from './services/WhatsAppOnboardingService.js';
import WhatsAppIntegration from './models/WhatsAppIntegration.js';
import metaApiClient from './utils/metaApiClient.js';
import assert from 'assert';

dotenv.config();

async function runTests() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB for Testing...');

    try {
        // Setup Test Data
        const orgId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();
        
        console.log('--- Test 1: Start Onboarding Session ---');
        const session1 = await whatsAppOnboardingService.initiateOnboarding(orgId, 'COEXISTENCE', userId);
        assert.strictEqual(session1.onboardingStatus, 'INITIATED');
        assert.strictEqual(session1.status, 'PENDING_ONBOARDING');
        console.log('Test 1 Passed: Session Created.');

        console.log('--- Test 2: Idempotency (Cancel previous session) ---');
        const session2 = await whatsAppOnboardingService.initiateOnboarding(orgId, 'COEXISTENCE', userId);
        
        const previousSession = await WhatsAppIntegration.findById(session1._id);
        assert.strictEqual(previousSession.onboardingStatus, 'CANCELLED');
        assert.strictEqual(previousSession.status, 'REVOKED');
        console.log('Test 2 Passed: Previous session correctly cancelled.');

        console.log('--- Test 3: Failure State & Rollback ---');
        // Mock the MetaApiClient to force a failure
        metaApiClient.exchangeCodeForToken = async () => { throw new Error('Meta API Mock Failure'); };
        
        try {
            await whatsAppOnboardingService.completeOnboarding(session2._id, {
                code: 'mock_code',
                waba_id: 'mock_waba',
                phone_number_id: 'mock_phone'
            });
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.strictEqual(error.message, 'Meta API Mock Failure');
            const failedSession = await WhatsAppIntegration.findById(session2._id);
            assert.strictEqual(failedSession.onboardingStatus, 'FAILED_AUTH');
            assert.strictEqual(failedSession.status, 'REVOKED');
            
            // Ensure SystemSetting was NOT overwritten
            const SystemSetting = mongoose.model('SystemSetting');
            const setting = await SystemSetting.findOne({ key: 'meta_wa_config' });
            if (setting) {
                // If it existed before, it should still have the old token (not the mock token)
                assert.notStrictEqual(setting.value.token, 'mock_access_token');
            }
        }
        console.log('Test 3 Passed: Failure State & Rollback works safely.');

    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('Tests Completed.');
    }
}

runTests();
