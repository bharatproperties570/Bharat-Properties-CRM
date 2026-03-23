import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function findUser() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const User = mongoose.model('User', new mongoose.Schema({
            email: String,
            fullName: String,
            role: mongoose.Schema.Types.Mixed
        }));

        const users = await User.find({}, { email: 1, fullName: 1, role: 1 }).limit(10);
        console.log('Recent Users:');
        users.forEach(u => console.log(`- ${u.email} (${u.fullName})`));

        const testUser = await User.findOne({ email: 'test@bharatproperties.com' });
        if (testUser) {
            console.log('\nTest User Found:');
            console.log(JSON.stringify(testUser, null, 2));
        } else {
            console.log('\nTest User NOT found.');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

findUser();
