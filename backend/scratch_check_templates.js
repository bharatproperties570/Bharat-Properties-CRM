import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkTemplates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed }));
        const config = await SystemSetting.findOne({ key: 'meta_wa_config' }).lean();
        
        console.log('--- Meta WA Config ---');
        console.log(JSON.stringify(config?.value, null, 2));

        // Check for other marketing related settings
        const marketingSettings = await SystemSetting.find({ key: /marketing|whatsapp/i }).lean();
        console.log('\n--- Marketing Settings ---');
        marketingSettings.forEach(s => {
            console.log(`Key: ${s.key}`);
            console.log(`Value:`, JSON.stringify(s.value, null, 2));
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkTemplates();
