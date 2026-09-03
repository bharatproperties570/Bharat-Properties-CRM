import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.connection.collection('systemsettings');
    const settings = await SystemSetting.find({}).toArray();
    console.log(settings.map(s => s.key));
    const wa = settings.find(s => s.key === 'whatsapp_integration' || s.key === 'whatsapp' || s.key === 'social_config' || s.key === 'meta_wa_config');
    console.log('WA Config:', JSON.stringify(wa, null, 2));
    process.exit(0);
}
run();
