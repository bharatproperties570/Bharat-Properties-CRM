import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('MONGODB_URI is not defined in .env');
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const checkLeads = async () => {
    await connectDB();
    
    // Register models
    const LookupSchema = new mongoose.Schema({
        lookup_type: String,
        lookup_value: String
    });
    const Lookup = mongoose.models.Lookup || mongoose.model('Lookup', LookupSchema);

    // Minimal Lead Schema
    const LeadSchema = new mongoose.Schema({
        firstName: String,
        lastName: String,
        mobile: String,
        stage: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        stageHistory: Array
    }, { timestamps: true });
    const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

    const leads = await Lead.find().populate('stage').sort({ updatedAt: -1 }).limit(20);

    console.log('\n--- SAMPLE LEAD STAGES (RECENTLY UPDATED) ---');
    leads.forEach(l => {
        console.log(`Lead: ${l.firstName} ${l.lastName || ''} (${l.mobile})`);
        console.log(`  Current Stage ID: ${l.stage?._id || 'MISSING'}`);
        console.log(`  Current Stage Value: ${l.stage?.lookup_value || 'N/A'}`);
        console.log(`  Stage History Count: ${l.stageHistory?.length || 0}`);
        if (l.stageHistory && l.stageHistory.length > 0) {
            console.log(`  Last History Stage: ${l.stageHistory[l.stageHistory.length-1].stage}`);
        }
        console.log('---------------------------');
    });

    const totalLeads = await Lead.countDocuments();
    const leadsWithStage = await Lead.countDocuments({ stage: { $exists: true, $ne: null } });
    const leadsWithHistory = await Lead.countDocuments({ stageHistory: { $exists: true, $not: { $size: 0 } } });

    console.log('\n--- STATISTICS ---');
    console.log(`Total Leads: ${totalLeads}`);
    console.log(`Leads with Stage: ${leadsWithStage}`);
    console.log(`Leads with Stage History: ${leadsWithHistory}`);

    process.exit(0);
};

checkLeads();
