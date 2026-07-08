import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import ParsingRule from './src/modules/parsing/parsingRule.model.js';

async function getRecentRules() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("Connected to MongoDB.");
        
        const recentRules = await ParsingRule.find()
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
            
        console.log("\nRecently created Parsing Rules:");
        recentRules.forEach(rule => {
            console.log(`- Type: ${rule.type}, Value: "${rule.value}", Regex: ${rule.regexPattern}, Created: ${rule.createdAt}`);
        });
        
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}

getRecentRules();
