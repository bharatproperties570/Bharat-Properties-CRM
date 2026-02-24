
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function checkProject() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }));
        const project = await Project.findOne();
        console.log('Project Structure:');
        console.log(JSON.stringify(project.toObject(), null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkProject();
