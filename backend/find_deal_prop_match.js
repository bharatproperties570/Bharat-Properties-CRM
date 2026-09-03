import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.connection.db.collection('systemsettings');
    const waTemplates = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' });
    const t = waTemplates.value.find(x => x.name === 'Deal Property Match' || x.name === 'deal_property_match');
    console.log(JSON.stringify(t, null, 2));
    process.exit(0);
}
run();
