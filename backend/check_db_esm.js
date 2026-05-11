import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        const uri = process.env.MONGODB_URI;
        console.log('Connecting to:', uri.substring(0, 20) + '...');
        await mongoose.connect(uri);
        console.log('Connected to DB');
        
        const LookupSchema = new mongoose.Schema({ lookup_type: String, lookup_value: String, metadata: mongoose.Schema.Types.Mixed });
        const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', LookupSchema);
        
        const types = await Lookup.distinct('lookup_type');
        console.log('Lookup Types:', types);
        
        const projectLookups = await Lookup.find({ lookup_type: 'Project' }).lean();
        console.log('Project Lookups count:', projectLookups.length);
        console.log('Project Lookups:', projectLookups.map(p => p.lookup_value));
        
        const blockLookups = await Lookup.find({ lookup_type: 'Block' }).lean();
        console.log('Block Lookups count:', blockLookups.length);

        const ProjectSchema = new mongoose.Schema({ name: String, blocks: Array });
        const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);
        const projectDocs = await Project.find().select('name blocks').lean();
        console.log('Project Collection Docs count:', projectDocs.length);
        if (projectDocs.length > 0) {
            console.log('Sample Project Blocks:', projectDocs[0].blocks?.length || 0);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
