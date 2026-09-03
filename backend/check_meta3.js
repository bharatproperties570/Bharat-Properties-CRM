import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import './models/SystemSetting.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.model('SystemSetting');
    const settings = await SystemSetting.find({}, 'key');
    console.log(settings.map(s => s.key));
    process.exit(0);
}
run();
