import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import './models/SystemSetting.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.model('SystemSetting');
    const waConfig = await SystemSetting.findOne({ key: 'whatsapp_integration' });
    console.log(waConfig ? (waConfig.value?.token ? 'Token exists' : 'Token missing') : 'Not found');
    process.exit(0);
}
run();
