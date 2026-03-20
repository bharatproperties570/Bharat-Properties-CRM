import mongoose from 'mongoose';
import Project from './models/Project.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-crm';

async function checkImages() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const projects = await Project.find({ 
            'projectImages': { $exists: true, $not: { $size: 0 } } 
        }).select('name projectImages');

        console.log('Projects with images:', projects.length);
        projects.forEach(p => {
            console.log(`\nProject: ${p.name}`);
            p.projectImages.forEach((img, idx) => {
                console.log(`  Image ${idx + 1}: ${JSON.stringify(img)}`);
            });
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkImages();
