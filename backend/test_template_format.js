import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    // require SystemSetting model to avoid MissingSchemaError
    await import('./models/SystemSetting.js');

    const WhatsAppService = (await import('./services/WhatsAppService.js')).default;
    const templates = await WhatsAppService.getTemplates();
    const wl = templates.find(t => t.name === 'welcome_lead');
    if (wl) {
        console.log(JSON.stringify(wl, null, 2));
    } else {
        console.log('NOT FOUND');
    }
    process.exit(0);
}
run();
