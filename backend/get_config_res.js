import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));
    const setting = await SystemSetting.findOne({ key: 'propertyConfig' }).lean();
    console.log(JSON.stringify(setting.value.Residential.subCategories.map(s => s.name), null, 2));
    process.exit(0);
}
run();
