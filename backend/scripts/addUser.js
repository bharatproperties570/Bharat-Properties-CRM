import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const addUser = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🌱 Connected to MongoDB');

        const email = 'bharatproperties570@gmail.com';
        const password = 'Bharat@570';
        const adminRoleId = '698dd4b9bd3d4e86dae27418';

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            fullName: "Bharat Properties Admin",
            email: email,
            password: hashedPassword,
            department: "sales",
            role: adminRoleId,
            isActive: true,
            status: 'active'
        };

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('User already exists. Updating password...');
            existingUser.password = hashedPassword;
            await existingUser.save();
            console.log('✅ Password updated successfully!');
        } else {
            console.log('Adding new user...');
            await User.create(newUser);
            console.log('✅ User added successfully!');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to add user:', error);
        process.exit(1);
    }
};

addUser();
