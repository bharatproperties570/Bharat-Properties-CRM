import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const WhatsAppService = (await import('./services/WhatsAppService.js')).default;
    const templates = await WhatsAppService.getTemplates();
    console.log('Available Templates in Meta:', templates.map(t => t.name));
    process.exit(0);
}
run();
