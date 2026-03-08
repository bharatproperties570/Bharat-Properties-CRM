
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkProjects = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
        const projects = await Project.find({ name: /Sector 32/i }).lean();

        console.log(`Found ${projects.length} projects:`);
        projects.forEach(p => {
            console.log(`ID: ${p._id}, Name: ${p.name}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkProjects();
