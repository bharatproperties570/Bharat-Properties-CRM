import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import Lookup from './models/Lookup.js';
import SystemSetting from './src/modules/systemSettings/system.model.js';

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        
        const subCats = await Lookup.find({ lookup_value: { $regex: /cropland/i } });
        console.log('All Cropland Lookups:', subCats);
        
        const sys = await SystemSetting.findOne({ key: 'propertyConfig' });
        console.log('Agricultural Subcats in SystemSetting:', sys.value.Agricultural?.subCategories);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
