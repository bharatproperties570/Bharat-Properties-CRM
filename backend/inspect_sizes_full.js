
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function checkSizes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));

        const sizeSetting = await SystemSetting.findOne({ key: 'property_sizes' });
        if (!sizeSetting) {
            console.log('No property_sizes found');
            return;
        }

        console.log('Property Sizes Content:');
        console.log(JSON.stringify(sizeSetting.value, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkSizes();
