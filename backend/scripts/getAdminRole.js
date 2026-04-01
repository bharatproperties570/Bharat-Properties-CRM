import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Role from '../models/Role.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const getAdminRole = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const role = await Role.findOne({ name: 'Admin' }) || await Role.findOne({ name: 'Sales Manager' });
        if (role) {
            console.log('Admin Role found:', role._id.toString());
        } else {
            console.log('Admin Role NOT found');
            const allRoles = await Role.find({});
            console.log('Available roles:', allRoles.map(r => r.name).join(', '));
        }
        process.exit(0);
    } catch (error) {
        console.error('Error getting admin role:', error);
        process.exit(1);
    }
};

getAdminRole();
