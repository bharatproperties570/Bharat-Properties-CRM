
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const SystemSettingSchema = new mongoose.Schema({
    key: String,
    category: String,
    value: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

async function checkStatus() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        
        console.log('Fetching LinkedIn status...');
        const setting = await SystemSetting.findOne({ key: 'linkedin_integration' });
        
        if (setting) {
            console.log('FOUND SETTING:');
            const redValue = { ...setting.value };
            if (redValue.accessToken) redValue.accessToken = redValue.accessToken.substring(0, 10) + '...';
            if (redValue.refreshToken) redValue.refreshToken = redValue.refreshToken.substring(0, 10) + '...';
            console.log(JSON.stringify({ ...setting.toObject(), value: redValue }, null, 2));
        } else {
            console.log('NO SETTING FOUND FOR linkedin_integration');
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkStatus();
