import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import SystemSetting from './models/SystemSetting.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function migrateData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const systemSettingSize = await SystemSetting.findOne({ key: 'property_sizes' }).lean();
        if (!systemSettingSize || !systemSettingSize.value || systemSettingSize.value.length === 0) {
            console.log("No sizes in SystemSettings to migrate.");
        } else {
            console.log(`Found ${systemSettingSize.value.length} sizes in SystemSettings.`);

            for (const s of systemSettingSize.value) {
                // Check if already in Lookups by name and project/block
                const existing = await Lookup.findOne({
                    lookup_type: 'size',
                    lookup_value: s.name,
                    'metadata.project': s.project,
                    'metadata.block': s.block
                });

                if (existing) {
                    console.log(`Skipping duplicate: ${s.name} in ${s.project}`);
                } else {
                    console.log(`Migrating: ${s.name} in ${s.project}`);
                    const { name, ...metadata } = s;
                    await Lookup.create({
                        lookup_type: 'size',
                        lookup_value: name,
                        metadata: metadata
                    });
                }
            }
        }

        console.log('Migration to Lookups complete.');

        // I will NOT delete the system setting yet, let's just make sure Lookups are correct.

        await mongoose.disconnect();
    } catch (error) {
        console.error('Migration Error:', error);
    }
}

migrateData();
