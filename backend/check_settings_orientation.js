
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkSettings = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Setting = mongoose.model('Setting', new mongoose.Schema({}, { strict: false }), 'settings');
        const settings = await Setting.find({ key: /orientation/i }).lean();

        console.log(`Found ${settings.length} orientation settings:`);
        settings.forEach(s => {
            console.log(JSON.stringify(s, null, 2));
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkSettings();
