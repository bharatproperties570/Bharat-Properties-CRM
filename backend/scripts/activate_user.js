import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        
        console.log('Searching for user: test@bharatproperties.com');
        const user = await User.findOneAndUpdate(
            { email: 'test@bharatproperties.com' },
            { isActive: true, status: 'active' },
            { new: true }
        );

        if (user) {
            console.log('✅ User activated successfully: ' + user.email);
            console.log('Current status: ' + user.status);
            console.log('Is Active: ' + user.isActive);
        } else {
            console.log('❌ User not found: test@bharatproperties.com');
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

run();
