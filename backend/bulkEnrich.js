import mongoose from 'mongoose';
import Lead from './models/Lead.js';
import { scanKeywords } from './src/utils/enrichmentEngine.js';
import dotenv from 'dotenv';
dotenv.config();

async function bulkEnrich() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const leads = await Lead.find({});
        console.log(`Found ${leads.length} leads to enrich.`);

        for (const lead of leads) {
            console.log(`Enriching lead: ${lead.firstName} ${lead.lastName || ''} (${lead._id})`);
            try {
                await scanKeywords(lead._id);
            } catch (err) {
                console.error(`Failed to enrich lead ${lead._id}:`, err.message);
            }
        }

        console.log('Bulk enrichment complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error during bulk enrichment:', error);
        process.exit(1);
    }
}

bulkEnrich();
