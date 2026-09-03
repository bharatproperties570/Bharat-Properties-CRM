import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    // require SystemSetting model to avoid MissingSchemaError
    await import('./src/modules/settings/systemSetting.model.js').catch(e => console.log('systemSetting model load err:', e.message));
    await import('./models/SystemSetting.js').catch(e => console.log('SystemSetting model load err:', e.message));

    const WhatsAppService = (await import('./services/WhatsAppService.js')).default;
    const templates = await WhatsAppService.getTemplates();
    const wl = templates.find(t => t.name === 'welcome_lead');
    if (wl) {
        console.log('FOUND welcome_lead:', JSON.stringify(wl, null, 2));
    } else {
        console.log('NOT FOUND. Available:', templates.map(t=>t.name));
    }
    process.exit(0);
}
run();
