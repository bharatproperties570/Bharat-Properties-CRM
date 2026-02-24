import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemSetting from '../models/SystemSetting.js';

dotenv.config({ path: './backend/.env' });

const fixEmailTypo = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const result = await SystemSetting.findOneAndUpdate(
            { key: 'email_config' },
            {
                $set: {
                    'value.email': 'bharatproperties570@gmail.com'
                }
            },
            { new: true }
        );

        if (result) {
            console.log('Typo fixed:', result.value.email);
        } else {
            console.log('Setting not found');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

fixEmailTypo();
