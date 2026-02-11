
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';

dotenv.config({ path: 'backend/.env' });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const projects = await Project.find().sort({ createdAt: -1 }).limit(5).lean();
        console.log('--- RECENT PROJECTS ---');
        projects.forEach(p => {
            console.log(`ID: ${p._id}, Name: ${p.name}, Location: ${p.location}, LocationSearch: ${p.locationSearch}, City: ${p.address?.city}`);
        });
        console.log('-----------------------');

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

run();
