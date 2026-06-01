import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import SystemSetting from './src/models/SystemSetting.js';
import WhatsAppService from './services/WhatsAppService.js';

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const templates = await WhatsAppService.getTemplates();
    console.log("TEMPLATES:", templates);
    process.exit(0);
}
check().catch(console.error);
