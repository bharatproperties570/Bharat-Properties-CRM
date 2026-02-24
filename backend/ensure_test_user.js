import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import Role from './models/Role.js';
import dotenv from 'dotenv';

dotenv.config();

const ensureTestUser = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        let testUser = await User.findOne({ email: 'test@bharatproperties.com' });

        if (!testUser) {
            console.log('Test user not found, creating...');

            // Get or create a default role (admin or similar)
            let adminRole = await Role.findOne({ name: 'Admin' });
            if (!adminRole) {
                adminRole = await Role.create({ name: 'Admin', permissions: [] });
            }

            const hashedPassword = await bcrypt.hash('Test@123', 10);
            testUser = await User.create({
                fullName: 'Test User',
                email: 'test@bharatproperties.com',
                password: hashedPassword,
                department: 'sales',
                role: adminRole._id,
                isActive: true,
                status: 'active'
            });
            console.log('Test user created successfully');
        } else {
            console.log('Test user already exists');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

ensureTestUser();
