import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function createTestUser() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const User = mongoose.model('User', new mongoose.Schema({
            fullName: { type: String, required: true },
            email: { type: String, required: true, unique: true },
            password: { type: String, required: true },
            department: { type: String, required: true },
            role: { type: mongoose.Schema.Types.ObjectId, required: true },
            isActive: { type: Boolean, default: true },
            status: { type: String, default: 'active' }
        }));

        const Role = mongoose.model('Role', new mongoose.Schema({
            name: String
        }));

        let role = await Role.findOne({ name: 'admin' });
        if (!role) {
            role = await Role.findOne(); // Just get any role if admin not found
        }

        if (!role) {
            console.error('No roles found in database. Cannot create user.');
            await mongoose.disconnect();
            return;
        }

        const email = 'test@bharatproperties.com';
        const existing = await User.findOne({ email });
        if (existing) {
            console.log('User already exists. Updating password...');
            existing.password = await bcrypt.hash('Test@123', 10);
            await existing.save();
            console.log('Password updated.');
        } else {
            const hashedPassword = await bcrypt.hash('Test@123', 10);
            await User.create({
                fullName: 'Test Agent',
                email: email,
                password: hashedPassword,
                department: 'sales',
                role: role._id,
                isActive: true,
                status: 'active'
            });
            console.log('Test user created.');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

createTestUser();
