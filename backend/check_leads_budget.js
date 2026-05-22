import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';

dotenv.config({ path: './.env' });

async function checkLeads() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        // Find 20 leads with budgets or min/max budgets
        const leads = await Lead.find({
            $or: [
                { budget: { $exists: true, $ne: null } },
                { budgetMin: { $exists: true, $ne: null } },
                { budgetMax: { $exists: true, $ne: null } }
            ]
        }).limit(20).populate('budget').lean();

        console.log(`Found ${leads.length} leads with budget info.`);
        leads.forEach(l => {
            console.log({
                id: l._id,
                name: `${l.firstName} ${l.lastName || ''}`.trim(),
                budget: l._id, // wait, print l.budget
                budgetObj: l.budget,
                budgetMin: l.budgetMin,
                budgetMax: l.budgetMax,
                mobile: l.mobile
            });
        });

        await mongoose.disconnect();
    } catch (e) {
        console.error('Error:', e);
    }
}

checkLeads();
