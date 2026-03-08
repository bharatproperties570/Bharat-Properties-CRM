
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkProject = async () => {
    try {
        await mongoose.connect(mongoURI);
        const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
        const project = await Project.findOne({ name: 'Sector 32 (Kohinoor City) Kurukshetra' }).lean();

        if (project) {
            console.log('Project Data:');
            console.log(JSON.stringify(project, null, 2));
        } else {
            console.log('Project not found');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkProject();
