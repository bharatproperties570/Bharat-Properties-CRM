import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI;

async function checkAddProjects() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const col = mongoose.connection.db.collection('add_projects');
        const projects = await col.find({ 'projectImages.0': { $exists: true } }).toArray();

        console.log('Projects in add_projects with images:', projects.length);
        projects.forEach(p => {
            console.log(`\nProject: ${p.name || p.projectName}`);
            console.log(`Images: ${JSON.stringify(p.projectImages, null, 2)}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAddProjects();
