import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from './models/Project.js';
import User from './models/User.js';
import Team from './models/Team.js';
import Role from './models/Role.js';

dotenv.config();

const resolveOrCreateUser = async (name) => {
    if (!name) return null;
    if (mongoose.Types.ObjectId.isValid(name) && name.toString().length === 24) return new mongoose.Types.ObjectId(name.toString());

    let user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${name}$`, 'i') } },
            { name: { $regex: new RegExp(`^${name}$`, 'i') } },
            { firstName: { $regex: new RegExp(`^${name}$`, 'i') } }
        ]
    });

    if (user) return user._id;

    console.log(`Creating missing user: ${name}`);
    try {
        const role = await Role.findOne({ name: 'User' }) || await Role.findOne({});
        const firstName = name.split(' ')[0];
        const lastName = name.split(' ').slice(1).join(' ') || 'Legacy';

        user = await User.create({
            fullName: name,
            firstName: firstName,
            lastName: lastName,
            email: `${firstName.replace(/\s+/g, '.').toLowerCase()}.${Date.now()}@bharatproperties.com`,
            mobile: `0000000000`,
            username: `${firstName.replace(/\s+/g, '.').toLowerCase()}.${Date.now()}`,
            password: 'password123',
            role: role?._id,
            isActive: true,
            status: 'active'
        });
        return user._id;
    } catch (err) {
        console.error(`Failed to create user ${name}: ${err.message}`);
        return null;
    }
};

const resolveOrCreateTeam = async (name) => {
    if (!name) return null;
    if (mongoose.Types.ObjectId.isValid(name) && name.toString().length === 24) return new mongoose.Types.ObjectId(name.toString());

    let team = await Team.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (team) return team._id;

    console.log(`Creating missing team: ${name}`);
    try {
        team = await Team.create({
            name: name,
            description: `Auto-created during migration for name: ${name}`,
            department: 'sales', // Required field
            isActive: true
        });
        return team._id;
    } catch (err) {
        console.error(`Failed to create team ${name}: ${err.message}`);
        return null;
    }
};

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const projects = await Project.find({}).lean(); // RAW DATA
        console.log(`Found ${projects.length} projects to check.`);

        let updatedCount = 0;

        for (const rawProject of projects) {
            let needsUpdate = false;
            let projectUpdate = {};

            // 1. Resolve 'assign'
            if (Array.isArray(rawProject.assign) && rawProject.assign.length > 0) {
                const newAssign = [];
                for (const val of rawProject.assign) {
                    if (!val) continue;
                    const resolvedId = await resolveOrCreateUser(val);
                    if (resolvedId) {
                        newAssign.push(resolvedId);
                        if (val.toString() !== resolvedId.toString()) needsUpdate = true;
                    }
                }
                if (needsUpdate) projectUpdate.assign = newAssign;
            }

            // 2. Resolve 'team'
            if (Array.isArray(rawProject.team) && rawProject.team.length > 0) {
                const newTeam = [];
                let teamNeedsUpdate = false;
                for (const val of rawProject.team) {
                    if (!val) continue;
                    const resolvedId = await resolveOrCreateTeam(val);
                    if (resolvedId) {
                        newTeam.push(resolvedId);
                        if (val.toString() !== resolvedId.toString()) teamNeedsUpdate = true;
                    }
                }
                if (teamNeedsUpdate) {
                    projectUpdate.team = newTeam;
                    needsUpdate = true;
                }
            }

            // 3. Resolve 'owner'
            if (rawProject.owner) {
                const resolvedOwner = await resolveOrCreateUser(rawProject.owner);
                if (resolvedOwner && rawProject.owner.toString() !== resolvedOwner.toString()) {
                    projectUpdate.owner = resolvedOwner;
                    needsUpdate = true;
                }
            } else if (projectUpdate.assign && projectUpdate.assign.length > 0) {
                projectUpdate.owner = projectUpdate.assign[0];
                needsUpdate = true;
            } else if (rawProject.assign && rawProject.assign.length > 0) {
                // If assign was already IDs but owner was missing
                const resolvedOwner = await resolveOrCreateUser(rawProject.assign[0]);
                if (resolvedOwner) {
                    projectUpdate.owner = resolvedOwner;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                try {
                    await Project.updateOne({ _id: rawProject._id }, { $set: projectUpdate });
                    updatedCount++;
                    console.log(`Updated project: ${rawProject.name}`);
                } catch (saveErr) {
                    console.error(`Failed to update project ${rawProject.name}: ${saveErr.message}`);
                }
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} projects.`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
