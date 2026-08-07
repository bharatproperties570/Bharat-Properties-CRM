import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import SystemSetting from '../models/SystemSetting.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const settings = await SystemSetting.find({}, 'key');
    console.log("Keys in DB:", settings.map(s => s.key));

    const setting = await SystemSetting.findOne({ key: 'masterFields' });
    if(setting) {
        console.log("masterFields found.");
    }
    
    process.exit(0);
}

run();
