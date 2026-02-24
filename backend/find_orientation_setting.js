
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function findOrientationSetting() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));

        const orientationSetting = await SystemSetting.findOne({ key: /orientation/i });
        if (orientationSetting) {
            console.log(`Found Orientation Setting (Key: ${orientationSetting.key}):`);
            console.log(JSON.stringify(orientationSetting.value, null, 2));
        } else {
            console.log('No "Orientation" related setting found in SystemSetting');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

findOrientationSetting();
