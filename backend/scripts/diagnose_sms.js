import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';

// 1. Load Environment
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 2. IMPORTANT: Register Models before using them
// This prevents MissingSchemaError
import '../src/modules/systemSettings/system.model.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-crm';

async function diagnoseSMS() {
    try {
        console.log('🚀 SMS Connectivity Diagnostic Tool');
        console.log('-----------------------------------');
        
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB Connected');

        const SystemSetting = mongoose.model('SystemSetting');
        
        // Check SMSGatewayHub Config
        const smsConfig = await SystemSetting.findOne({ key: 'sms_gateway_hub_config' }).lean();
        if (!smsConfig || !smsConfig.value?.apiKey) {
            console.log('⚠️  SMSGatewayHub Config: MISSING or incomplete.');
        } else {
            console.log('✅ SMSGatewayHub Config: FOUND (API Key set)');
        }

        // Check Automation Rules for SMS
        const automationRules = await SystemSetting.findOne({ key: 'unified_automation_rules' }).lean();
        if (automationRules && automationRules.value) {
            console.log('\n--- Automation SMS Status ---');
            Object.entries(automationRules.value).forEach(([trigger, rule]) => {
                const status = rule.sms?.enabled ? '✅ ENABLED' : '❌ DISABLED';
                console.log(`${trigger.padEnd(25)}: ${status}`);
            });
        }

        // Check for custom providers
        const activeProvider = await SystemSetting.findOne({ key: 'sms_provider_active' }).lean();
        console.log(`\nActive SMS Provider: ${activeProvider?.value || 'DEFAULT (Twilio/SMSGatewayHub)'}`);

    } catch (error) {
        console.error('\n❌ Diagnostic Failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n-----------------------------------');
        console.log('Diagnostic Complete.');
        process.exit(0);
    }
}

diagnoseSMS();
