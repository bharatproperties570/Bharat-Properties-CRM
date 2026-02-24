
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function checkSettings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));

        const settings = await SystemSetting.find({}, { key: 1 });
        console.log('Available Setting Keys:');
        settings.forEach(s => console.log(`- ${s.key}`));

        // Also check if there's any setting related to "property" or "inventory"
        const propertySettings = await SystemSetting.find({ key: { $regex: /property|inventory|size/i } });
        console.log('\nProperty-related Settings Content:');
        propertySettings.forEach(s => {
            console.log(`\nKey: ${s.key}`);
            console.log(JSON.stringify(s.value, null, 2).substring(0, 1000) + '...');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkSettings();
