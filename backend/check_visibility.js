import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from './models/Lead.js';

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const orphanLeadsCount = await Lead.countDocuments({
            $or: [
                { 'assignment.visibleTo': 'Team', 'assignment.team': { $size: 0 } },
                { visibleTo: 'Team', teams: { $size: 0 } }
            ]
        });

        console.log(`Found ${orphanLeadsCount} Orphan Leads with Team visibility but no Team assigned.`);
        
        const everyoneLeads = await Lead.countDocuments({ 'assignment.visibleTo': 'Everyone' });
        console.log(`Leads with Everyone visibility: ${everyoneLeads}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
