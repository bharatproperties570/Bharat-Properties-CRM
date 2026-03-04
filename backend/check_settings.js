import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkSettings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed
        }, { collection: 'systemsettings' }));

        const setting = await SystemSetting.findOne({ key: 'activityMasterFields' }).lean();
        console.log('activityMasterFields:');
        console.log(JSON.stringify(setting, null, 2));

        const multipliers = await SystemSetting.findOne({ key: 'stageMultipliers' }).lean();
        console.log('stageMultipliers:');
        console.log(JSON.stringify(multipliers, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
}
checkSettings();
