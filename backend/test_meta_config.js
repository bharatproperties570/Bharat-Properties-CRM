import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import './models/SystemSetting.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.model('SystemSetting');
    const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
    console.log('meta_wa_config:', JSON.stringify(setting, null, 2));
    process.exit(0);
}
run();
