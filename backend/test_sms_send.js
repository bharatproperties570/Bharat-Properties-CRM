// Test SMS sending end-to-end via backend API
// Run from backend/ dir: node test_sms_send.js <phone_number>
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import smsService from './src/modules/sms/sms.service.js';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';
const testPhone = process.argv[2] || '9915159078';

async function testSend() {
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
        console.log(`📱 Testing SMS to: ${testPhone}`);

        // Test 1: sendSMSWithTemplate
        console.log('\n--- Test 1: sendSMSWithTemplate("Get Response") ---');
        const result = await smsService.sendSMSWithTemplate(
            testPhone,
            'Get Response',
            { Name: 'Test User' },
            { entityType: 'Test', entityId: null }
        );
        console.log('✅ SUCCESS:', JSON.stringify(result, null, 2));

    } catch (err) {
        console.error('❌ FAILED:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testSend();
