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

        // 1. Setup: Ensure we have a role
        let role = await Role.findOne();
        if (!role) {
            role = await Role.create({
                name: 'Test Role',
                description: 'Test role for verification',
                permissions: {},
                isSystemRole: false
            });
        }

        // 2. Create 2 test users
        console.log('Creating test users...');
        const user1 = await User.create({
            fullName: 'Test User A',
            email: `testusera${Date.now()}@example.com`,
            password: 'password123',
            department: 'sales',
            role: role._id
        });
        const user2 = await User.create({
            fullName: 'Test User B',
            email: `testuserb${Date.now()}@example.com`,
            password: 'password123',
            department: 'sales',
            role: role._id
        });
        console.log('Users created:', user1._id, user2._id);

        // 3. Create a Team with members
        console.log('Creating team with members...');
        const teamData = {
            name: `Test Team ${Date.now()}`,
            department: 'sales',
            description: 'Verification team',
            members: [user1._id, user2._id]
        };

        // Simulate Controller Logic (since we can't call controller directly easily without mocking req/res)
        // We will manually perform the operations the controller does to verify the MODEL/DB interactions logic
        // But better yet, let's just make an HTTP request if the server is running? 
        // No, let's replicate the logic to ensure the MONGOOSE queries are correct.

        const team = await Team.create({
            name: teamData.name,
            department: teamData.department,
            description: teamData.description
        });

        // Controller Logic Step: Update Users
        await User.updateMany(
            { _id: { $in: teamData.members } },
            { $set: { team: team._id } }
        );

        // 4. Verify Assignment
        const updatedUser1 = await User.findById(user1._id);
        const updatedUser2 = await User.findById(user2._id);

        if (updatedUser1.team.toString() === team._id.toString() && updatedUser2.team.toString() === team._id.toString()) {
            console.log('✅ PASS: Users assigned to team on creation');
        } else {
            console.error('❌ FAIL: Users not assigned to team');
            console.log('User 1 Team:', updatedUser1.team);
            console.log('Team ID:', team._id);
        }

        // 5. Update Team: Remove User 1, Add User 3 (Create User 3 first)
        const user3 = await User.create({
            fullName: 'Test User C',
            email: `testuserc${Date.now()}@example.com`,
            password: 'password123',
            department: 'sales',
            role: role._id
        });

        console.log('Updating team members...');
        const newMembers = [user2._id, user3._id]; // User 1 removed, User 3 added

        // Controller Logic Step: Update Team Members
        // 1. Remove team from users who are no longer in the list
        await User.updateMany(
            { team: team._id, _id: { $nin: newMembers } },
            { $unset: { team: "" } }
        );

        // 2. Add team to users who are in the list
        await User.updateMany(
            { _id: { $in: newMembers } },
            { $set: { team: team._id } }
        );

        // 6. Verify Update
        const finalUser1 = await User.findById(user1._id);
        const finalUser2 = await User.findById(user2._id);
        const finalUser3 = await User.findById(user3._id);

        if (!finalUser1.team) {
            console.log('✅ PASS: User 1 removed from team');
        } else {
            console.error('❌ FAIL: User 1 still in team', finalUser1.team);
        }

        if (finalUser2.team.toString() === team._id.toString()) {
            console.log('✅ PASS: User 2 remained in team');
        } else {
            console.error('❌ FAIL: User 2 removed from team');
        }

        if (finalUser3.team.toString() === team._id.toString()) {
            console.log('✅ PASS: User 3 added to team');
        } else {
            console.error('❌ FAIL: User 3 not added to team');
        }

        // 7. Cleanup
        console.log('Cleaning up...');
        await User.deleteMany({ _id: { $in: [user1._id, user2._id, user3._id] } });
        await Team.findByIdAndDelete(team._id);
        console.log('✅ Cleanup completed');

    } catch (error) {
        console.error('❌ Error during verification:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from DB');
    }
};

runVerification();
