import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { seedRoles } from '../seeders/roles.seeder.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const seedComplete = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🌱 Connected to MongoDB');

        // 1. Seed Roles first
        console.log('🏗️  Seeding roles...');
        const roles = await seedRoles();
        
        // If roles were already seeded and seedRoles returned undefined, fetch them
        const allRoles = await Role.find({});
        console.log(`✅ Roles ready: ${allRoles.length}`);

        // Define users with correct fields and find matching roles
        const adminRole = allRoles.find(r => r.name === 'Admin' || r.name === 'Sales Manager'); 
        const salesRole = allRoles.find(r => r.name === 'Sales Executive');
        const marketingRole = allRoles.find(r => r.name === 'Marketing Executive');

        if (!adminRole || !salesRole) {
            console.error('❌ Could not find required roles in database. Please check ROLE_TEMPLATES.');
            process.exit(1);
        }

        const users = [
            {
                fullName: "Amit Sharma",
                email: "amit@bharatproperties.com",
                password: await bcrypt.hash("password123", 10),
                department: "sales",
                role: adminRole._id,
                isActive: true,
                status: 'active'
            },
            {
                fullName: "Rohan Verma",
                email: "rohan@bharatproperties.com",
                password: await bcrypt.hash("password123", 10),
                department: "sales",
                role: salesRole._id,
                isActive: true,
                status: 'active'
            },
            {
                fullName: "Priya Singh",
                email: "priya@bharatproperties.com",
                password: await bcrypt.hash("password123", 10),
                department: "marketing",
                role: marketingRole ? marketingRole._id : adminRole._id,
                isActive: true,
                status: 'active'
            }
        ];

        // 2. Clear and Seed Users
        console.log('👥 Seeding users...');
        await User.deleteMany({});
        await User.insertMany(users);
        console.log('✅ Users seeded successfully!');

        console.log('\n🚀 SEEDING COMPLETE');
        console.log('Admin User: amit@bharatproperties.com / password123');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedComplete();
