import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({ key: String }, { strict: false }));

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    await SystemSetting.deleteOne({ key: 'activityMasterFields' });
    console.log('Reset complete');
    process.exit(0);
}
run();
