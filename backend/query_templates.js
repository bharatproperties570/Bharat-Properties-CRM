import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import SystemSetting from './src/modules/systemSettings/system.model.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        const setting = await SystemSetting.findOne({ key: 'crm_whatsapp_templates' }).lean();
        
        if (setting && setting.value) {
            const templates = setting.value;
            console.log(`Found ${templates.length} templates in DB.`);
            
            const feedbackTemplates = templates.filter(t => 
                t.systemContext && t.systemContext.includes('feedback_form')
            );
            
            console.log(`Found ${feedbackTemplates.length} templates with systemContext 'feedback_form'.`);
            
            if (feedbackTemplates.length > 0) {
                console.log("Feedback Template:", JSON.stringify(feedbackTemplates[0], null, 2));
            } else {
                console.log("No feedback_form template found. Here are the first 2 templates:");
                console.log(JSON.stringify(templates.slice(0, 2), null, 2));
            }
        } else {
            console.log("No crm_whatsapp_templates setting found in DB.");
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
