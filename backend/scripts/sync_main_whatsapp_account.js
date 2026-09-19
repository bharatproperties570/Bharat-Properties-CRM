import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';

async function syncMainWhatsAppAccount() {
    try {
        await connectDB();
        
        let SystemSetting;
        try { 
            SystemSetting = mongoose.model('SystemSetting'); 
        } catch(e) { 
            SystemSetting = (await import('../models/SystemSetting.js')).default; 
        }

        let WhatsAppIntegration;
        try { 
            WhatsAppIntegration = mongoose.model('WhatsAppIntegration'); 
        } catch(e) { 
            WhatsAppIntegration = (await import('../models/WhatsAppIntegration.js')).default; 
        }

        // 1. Fetch legacy meta_wa_config
        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        if (!setting || !setting.value?.phoneId || !setting.value?.token) {
            console.error('❌ Could not find valid meta_wa_config in SystemSetting');
            process.exit(1);
        }

        const legacyConfig = setting.value;
        const mainPhoneId = legacyConfig.phoneId;
        const mainWabaId = legacyConfig.businessId || '1473077001025314';
        const mainDisplayPhone = legacyConfig.displayPhoneNumber || '+91 99960 00570';

        console.log(`ℹ️ Found Main WhatsApp API config: Phone ID ${mainPhoneId}, Number ${mainDisplayPhone}`);

        // 2. Ensure Main Cloud API account exists in WhatsAppIntegration with isDefault: true
        const existingMain = await WhatsAppIntegration.findOne({ phoneNumberId: mainPhoneId });
        if (existingMain) {
            existingMain.isDefault = true;
            existingMain.accountLabel = `Main Official WhatsApp API (${mainDisplayPhone})`;
            existingMain.displayPhoneNumber = mainDisplayPhone;
            existingMain.status = 'ACTIVE';
            existingMain.onboardingStatus = 'CONNECTED';
            existingMain.credentials = { systemUserToken: legacyConfig.token };
            await existingMain.save();
            console.log(`✅ Updated existing Main WhatsApp API account in WhatsAppIntegration (${existingMain._id})`);
        } else {
            const newMain = await WhatsAppIntegration.create({
                connectionType: 'NEW_API',
                wabaId: mainWabaId,
                phoneNumberId: mainPhoneId,
                displayPhoneNumber: mainDisplayPhone,
                accountLabel: `Main Official WhatsApp API (${mainDisplayPhone})`,
                isDefault: true,
                status: 'ACTIVE',
                onboardingStatus: 'CONNECTED',
                credentials: { systemUserToken: legacyConfig.token }
            });
            console.log(`✅ Created Main WhatsApp API account in WhatsAppIntegration (${newMain._id})`);
        }

        // 3. Update Coexistence account (99913 33570) with clear label and isDefault: false
        const coexistenceAccount = await WhatsAppIntegration.findOne({ 
            connectionType: 'COEXISTENCE', 
            status: 'ACTIVE' 
        });
        if (coexistenceAccount) {
            coexistenceAccount.isDefault = false;
            if (!coexistenceAccount.accountLabel) {
                coexistenceAccount.accountLabel = `WhatsApp Business App (${coexistenceAccount.displayPhoneNumber || '+91 99913 33570'})`;
            }
            await coexistenceAccount.save();
            console.log(`✅ Updated Coexistence account in WhatsAppIntegration (${coexistenceAccount._id}): label="${coexistenceAccount.accountLabel}", isDefault=false`);
        }

        console.log('🎉 Multi-WhatsApp Account synchronization completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during synchronization:', err);
        process.exit(1);
    }
}

syncMainWhatsAppAccount();
