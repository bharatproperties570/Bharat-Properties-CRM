import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lead = (await import('./models/Lead.js')).default;
    const { WorkflowEngine } = await import('./src/utils/WorkflowEngine.js');
    
    const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const newStatus = await Lookup.findOne({ type: 'status', lookup_value: 'New' });
    
    const lead = await Lead.create({
        firstName: 'Test',
        lastName: 'Debugging',
        mobile: '9999999998',
        status: newStatus ? newStatus._id : undefined,
        companyId: new mongoose.Types.ObjectId('6991ad69e07eb3dd7dd4667a')
    });
    
    const populatedLead = await Lead.findById(lead._id).populate('status').lean();
    
    console.log('Lead created:', populatedLead._id);
    console.log('Status populated:', populatedLead.status?.lookup_value);
    
    const originalLog = console.log;
    console.log = (...args) => {
        originalLog('[Intercepted]', ...args);
    };
    
    await WorkflowEngine.fireEvent('leads', 'lead_created', populatedLead, populatedLead.companyId);
    
    console.log = originalLog;
    console.log('Done firing event.');
    process.exit(0);
}
run();
