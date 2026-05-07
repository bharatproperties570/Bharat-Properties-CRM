import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkConfig() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed }));
        const config = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        
        if (config) {
            console.log('Meta WA Config Found:');
            console.log('Phone ID:', config.value?.phoneId ? 'EXISTS' : 'MISSING');
            console.log('Business ID:', config.value?.businessId ? 'EXISTS' : 'MISSING');
            console.log('Token Length:', config.value?.token ? config.value.token.length : 0);
        } else {
            console.log('Meta WA Config NOT found in DB');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkConfig();
