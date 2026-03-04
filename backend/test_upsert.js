import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function testUpsert() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: { type: String, required: true, unique: true },
            value: { type: mongoose.Schema.Types.Mixed, required: true },
            category: String,
            isPublic: Boolean
        }, { collection: 'systemsettings' }));

        const oldConfig = await SystemSetting.findOne({ key: 'propertyConfig' }).lean();
        const newValue = { ...oldConfig.value, "Test Category": { subCategories: [] } };

        const result = await SystemSetting.findOneAndUpdate(
            { key: 'propertyConfig' },
            { $set: { value: newValue, category: 'crm_config', isPublic: true } },
            { new: true, upsert: true }
        );

        console.log('UPSERT RESULT:');
        console.log('Keys in value:', Object.keys(result.value));

        // Clean up
        await SystemSetting.findOneAndUpdate(
            { key: 'propertyConfig' },
            { $set: { value: oldConfig.value } }
        );
        console.log('Cleaned up.');

        await mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
}

testUpsert();
