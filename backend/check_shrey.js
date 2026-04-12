import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function checkShrey() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const User = mongoose.model('UserCheck', new mongoose.Schema({
            fullName: String,
            email: String,
            username: String,
            isActive: { type: Boolean, default: true },
            status: { type: String, default: 'active' },
            password: String,
            role: mongoose.Schema.Types.ObjectId,
            department: String
        }, { collection: 'users' }));

        const user = await User.findOne({ 
            $or: [
                { fullName: /Shrey/i },
                { email: /shrey/i }
            ] 
        });

        if (user) {
            console.log('\n--- User Found ---');
            console.log('Full Name:', user.fullName);
            console.log('Email:', user.email);
            console.log('Username:', user.username);
            console.log('Is Active:', user.isActive);
            console.log('Status:', user.status);
            console.log('Department:', user.department);
            console.log('Role ID:', user.role);
            console.log('Has Password:', !!user.password);
            if (user.password) {
                console.log('Password Hash Type:', user.password.startsWith('$2a$') || user.password.startsWith('$2b$') ? 'bcrypt' : 'unknown');
            }
        } else {
            console.log('\nUser matching "Shrey" NOT found.');
            const count = await User.countDocuments();
            console.log('Total users in DB:', count);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkShrey();
