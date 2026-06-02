import mongoose from 'mongoose';
import "dotenv/config";
import SystemSetting from './src/modules/systemSettings/system.model.js';
import { DEFAULT_STAGE_RULES } from './src/services/StageTransitionEngine.js';
import connectDB from "./config/db.js";

const run = async () => {
    await connectDB();
    await SystemSetting.findOneAndUpdate(
        { key: 'stage_transition_rules' },
        {
            key: 'stage_transition_rules',
            category: 'sales_config',
            value: { rules: DEFAULT_STAGE_RULES },
            description: 'Activity outcome → stage transition rules',
            isPublic: true,
            active: true
        },
        { upsert: true, new: true }
    );
    console.log("Seeded rules successfully!");
    process.exit(0);
};

run();
