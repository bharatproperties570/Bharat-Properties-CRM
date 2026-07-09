import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import StageTransitionLog from './models/StageTransitionLog.js';

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    const logs = await StageTransitionLog.find().sort({ createdAt: -1 }).limit(5).lean();
    console.log(JSON.stringify(logs, null, 2));
    process.exit(0);
}
check();
