import mongoose from 'mongoose';
import Project from './models/Project.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI;

async function inspectProject() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const project = await Project.findOne({ name: /Sector 82 \(IT City\) Mohali/i }).lean();

        if (project) {
            console.log(JSON.stringify(project, null, 2));
        } else {
            console.log('Project not found');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

inspectProject();
