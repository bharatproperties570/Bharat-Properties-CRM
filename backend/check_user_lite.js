import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const user = await User.findOne({ email: 'bharatproperties570@gmail.com' }).lean();
        if (!user) {
            console.log('User not found');
            process.exit(0);
        }
        console.log('User:', user.email);
        console.log('Role ID:', user.role);
        console.log('Data Scope:', user.dataScope);
        console.log('Team IDs:', user.teams);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
