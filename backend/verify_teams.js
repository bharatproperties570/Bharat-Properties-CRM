import mongoose from 'mongoose';
import User from './models/User.js';
import Team from './models/Team.js';
import Role from './models/Role.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'backend/.env' });

const runVerification = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // 1. Create a Team
        const teamData = {
            name: `Test Team ${Date.now()}`,
            department: 'sales',
            description: 'A test team for verification'
        };

        const team = await Team.create(teamData);
        console.log('✅ Team created:', team.name);

        // 2. Fetch a role for the user
        let role = await Role.findOne();
        if (!role) {
            console.log('⚠️ No roles found. Creating a test role...');
            role = await Role.create({
                name: 'Test Role',
                description: 'Test role for verification',
                permissions: {},
                isSystemRole: false
            });
        }

        // 3. Create a test user to assign
        console.log('Creating a test user...');
        const user = await User.create({
            fullName: 'Test User Verification',
            email: `testuserverify${Date.now()}@example.com`,
            password: 'password123',
            department: 'sales',
            role: role._id
        });
        console.log('Found user:', user.fullName);

        // 3. Assign user to team
        user.team = team._id;
        await user.save();
        console.log('✅ User assigned to team');

        // 4. Verify User has team
        const updatedUser = await User.findById(user._id).populate('team');
        if (updatedUser.team._id.toString() === team._id.toString()) {
            console.log('✅ Verification Successful: User team matches created team');
        } else {
            console.error('❌ Verification Failed: User team mismatch');
        }

        // 5. Clean up
        await User.findByIdAndUpdate(user._id, { team: null });
        await Team.findByIdAndDelete(team._id);
        console.log('✅ Cleanup completed');

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await mongoose.disconnect();
    }
};

runVerification();
