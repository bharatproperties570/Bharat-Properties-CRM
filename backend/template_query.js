import mongoose from 'mongoose';

const MONGODB_URI = "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

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
