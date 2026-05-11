const mongoose = require('mongoose');

async function check() {
    try {
        await mongoose.connect('mongodb://localhost:27017/bharat-properties-crm');
        console.log('Connected to DB');
        
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({ lookup_type: String, lookup_value: String }));
        const types = await Lookup.distinct('lookup_type');
        console.log('Lookup Types:', types);
        
        const projects = await Lookup.find({ lookup_type: 'Project' }).select('lookup_value');
        console.log('Project Lookups:', projects.map(p => p.lookup_value));
        
        const Project = mongoose.model('Project', new mongoose.Schema({ name: String }));
        const projectDocs = await Project.find().select('name');
        console.log('Project Collection Docs:', projectDocs.map(p => p.name));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
