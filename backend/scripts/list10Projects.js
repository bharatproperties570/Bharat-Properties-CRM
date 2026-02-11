
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';

dotenv.config({ path: 'backend/.env' });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const projects = await Project.find().sort({ createdAt: -1 }).limit(10).lean();
        console.log('--- 10 MOST RECENT PROJECTS ---');
        projects.forEach((p, idx) => {
            console.log(`${idx + 1}. ID: ${p._id}, Name: ${p.name}, LocationSearch: ${p.locationSearch}, Created: ${p.createdAt}`);
        });
        console.log('-------------------------------');

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

run();
