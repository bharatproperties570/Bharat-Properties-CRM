import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function verifyLogin() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const User = mongoose.model('UserVerifyOnly', new mongoose.Schema({
            email: String,
            username: String,
            isActive: Boolean,
            status: String
        }, { collection: 'users' }));

        const identifier = "shrey@bharatproperties.co"; // Their username
        console.log('Searching for identifier:', identifier);
        
        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { username: identifier.toLowerCase() }
            ]
        });

        if (user) {
            console.log('\n--- VERIFICATION SUCCESS ---');
            console.log('User found via Dual-ID logic!');
            console.log('Email:', user.email);
            console.log('Username:', user.username);
            console.log('Account Status:', user.isActive ? 'Active' : 'Inactive');
            console.log('----------------------------\n');
        } else {
            console.log('\n--- VERIFICATION FAILURE ---');
            console.log('User NOT found with identifier:', identifier);
            console.log('----------------------------\n');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error during verification:', error);
        process.exit(1);
    }
}

verifyLogin();
