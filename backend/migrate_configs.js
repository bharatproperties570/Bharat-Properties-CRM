import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Lookup from './models/Lookup.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';

const escapeRegExp = (string) => string ? String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

const resolveOrCreateLookup = async (type, value, parentId = null) => {
    if (!value) return null;
    const trimmedValue = String(value).trim();
    if (!trimmedValue) return null;
    
    const escapedValue = escapeRegExp(trimmedValue);
    const query = { lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } };
    if (parentId) query.parent_lookup_id = parentId;
    
    let lookup = await Lookup.findOne(query);
    if (!lookup) {
        const createData = { lookup_type: type, lookup_value: trimmedValue, is_active: true };
        if (parentId) createData.parent_lookup_id = parentId;
        lookup = await Lookup.create(createData);
        console.log(`Created ${type}: ${trimmedValue}`);
    }
    return lookup._id;
};

const runMigration = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bharat-properties';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const setting = await SystemSetting.findOne({ key: 'propertyConfig' });
        if (!setting || !setting.value) {
            console.log('No propertyConfig found in SystemSettings.');
            process.exit(0);
        }

        const config = setting.value;
        for (const catName of Object.keys(config)) {
            console.log(`Processing Category: ${catName}`);
            const catId = await resolveOrCreateLookup('Category', catName);

            const catData = config[catName];
            if (catData.subCategories && Array.isArray(catData.subCategories)) {
                for (const sub of catData.subCategories) {
                    if (!sub.name) continue;
                    const subId = await resolveOrCreateLookup('SubCategory', sub.name, catId);

                    if (sub.types && Array.isArray(sub.types)) {
                        for (const type of sub.types) {
                            if (type.name) {
                                await resolveOrCreateLookup('PropertyType', type.name, subId);
                            }
                        }
                    }

                    if (sub.builtupTypes && Array.isArray(sub.builtupTypes)) {
                        for (const bt of sub.builtupTypes) {
                            const btName = typeof bt === 'object' ? bt.name : bt;
                            if (btName) {
                                await resolveOrCreateLookup('BuiltupType', btName, subId);
                            }
                        }
                    }
                }
            }
        }
        
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

runMigration();
