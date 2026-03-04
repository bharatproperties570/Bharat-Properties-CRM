import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function dumpPropertyConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed
        }, { collection: 'systemsettings' }));

        const setting = await SystemSetting.findOne({ key: 'propertyConfig' }).lean();
        console.log('FULL PROPERTY CONFIG:');
        console.log(JSON.stringify(setting?.value, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
}

dumpPropertyConfig();
