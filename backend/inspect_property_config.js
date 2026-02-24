
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function inspectPropertyConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));

        const config = await SystemSetting.findOne({ key: 'property_config' });
        if (!config) {
            console.log('No property_config found');
            return;
        }

        console.log('Property Config Structure:');
        console.log(JSON.stringify(config.value, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectPropertyConfig();
