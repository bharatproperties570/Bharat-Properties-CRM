import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function checkTriggers() {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const Trigger = (await import('./models/Trigger.js')).default;
        const triggers = await Trigger.find({}).lean();
        
        console.log('\n================ ALL TRIGGERS IN DATABASE ================');
        console.log(`Found ${triggers.length} triggers:\n`);
        
        triggers.forEach((t, i) => {
            console.log(`[${i+1}] Name: "${t.name}"`);
            console.log(`    Module: ${t.module} | Event: ${t.event} | Active: ${t.isActive}`);
            console.log(`    Conditions:`, JSON.stringify(t.conditions, null, 2));
            console.log(`    Actions:`, JSON.stringify(t.actions, null, 2));
            console.log('----------------------------------------------------');
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkTriggers();
