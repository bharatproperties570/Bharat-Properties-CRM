
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function inspectOrientationConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));

        const config = await SystemSetting.findOne({ key: 'property_config' });
        if (!config) {
            console.log('No property_config found');
        } else {
            console.log('Property Config Keys:');
            console.log(Object.keys(config.value));
            if (config.value.Orientation) {
                console.log('\nOrientation Config:');
                console.log(JSON.stringify(config.value.Orientation, null, 2));
            } else if (config.value.orientation) {
                console.log('\norientation Config:');
                console.log(JSON.stringify(config.value.orientation, null, 2));
            } else {
                console.log('\n"Orientation" not found as a top-level key in property_config');
                // Check within categories if needed, but user said Setting > Properties > Orientation
            }
        }

        const masterFields = await SystemSetting.findOne({ key: 'master_fields' });
        if (masterFields) {
            console.log('\nMaster Fields Unit Types:');
            console.log(masterFields.value.unitTypes);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectOrientationConfig();
