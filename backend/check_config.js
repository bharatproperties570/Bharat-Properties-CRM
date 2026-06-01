import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));
    const setting = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
    console.log("META CONFIG:", setting?.value);
    process.exit(0);
}
check().catch(console.error);
