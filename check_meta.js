import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bharat-properties-crm');
const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));
SystemSetting.findOne({ key: 'meta_wa_config' }).lean().then(d => {
    console.log(JSON.stringify(d, null, 2));
    process.exit(0);
});
