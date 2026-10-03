import mongoose from 'mongoose';

const MONGODB_URI = (() => { throw new Error('CRITICAL: Hardcoded production credential removed. Use MONGODB_URI env var.') })();

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }), 'systemsettings');
        
        const setting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' });
        console.log('CRM WhatsApp Templates:');
        console.log(JSON.stringify(setting?.value || setting?.data || setting, null, 2));
    } catch(e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
