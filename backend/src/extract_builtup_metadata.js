
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI;

async function extractBuiltupMetadata() {
    try {
        await mongoose.connect(mongoUri);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));
        const config = await SystemSetting.findOne({ key: 'propertyConfig' });
        
        if (!config || !config.value) {
            console.error('propertyConfig not found.');
            await mongoose.disconnect();
            return;
        }

        const data = config.value;
        const builtupManifest = [];

        for (const [catName, catData] of Object.entries(data)) {
            if (!catData.subCategories) continue;
            for (const subCat of catData.subCategories) {
                if (!subCat.types) continue;
                for (const propType of subCat.types) {
                    if (!propType.builtupTypes) continue;
                    
                    builtupManifest.push({
                        category: catName,
                        subCategory: subCat.name,
                        propertyType: propType.name,
                        count: propType.builtupTypes.length,
                        hasStrings: propType.builtupTypes.some(b => typeof b === 'string')
                    });
                }
            }
        }

        console.log('--- BUILTUP MANIFEST ---');
        console.log(JSON.stringify(builtupManifest, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

extractBuiltupMetadata();
