import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/bharat-crm";

async function checkSettings() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed
        }, { collection: 'systemsettings' }));

        const keys = ['leadMasterFields', 'propertyConfig'];
        
        for (const key of keys) {
            const setting = await SystemSetting.findOne({ key });
            if (setting) {
                console.log(`\n--- ${key} ---`);
                console.log(JSON.stringify(setting.value, null, 2).substring(0, 1000) + "...");
                
                if (key === 'leadMasterFields') {
                   const v = setting.value;
                   console.log("Fields present:", Object.keys(v));
                   console.log("dealStatuses:", v.dealStatuses);
                   console.log("dealTypes:", v.dealTypes);
                   console.log("transactionSources:", v.transactionSources);
                }
            } else {
                console.log(`\n--- ${key} NOT FOUND ---`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSettings();
