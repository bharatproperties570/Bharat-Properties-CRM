import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed }, { strict: false }));

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const settings = await SystemSetting.find({ key: 'activityMasterFields' });
    console.log('Found documents:', settings.length);
    if(settings.length > 0) {
        console.log('Sample data:', JSON.stringify(settings[0].value.activities[0].purposes[0].outcomes[0]));
        await SystemSetting.deleteMany({ key: 'activityMasterFields' });
        console.log('Deleted successfully.');
    } else {
        console.log('Document was already deleted.');
    }
    
    process.exit(0);
}
run();
