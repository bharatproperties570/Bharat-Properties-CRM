import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/crm_db"; // fallback

async function migratePastLeads() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(mongoURI);
        console.log("Connected.");

        const Activity = mongoose.models.Activity || mongoose.model('Activity', new mongoose.Schema({
            type: String,
            entityType: String,
            entityId: mongoose.Schema.Types.Mixed,
            relatedTo: Array
        }, { strict: false }));

        const Deal = mongoose.models.Deal || mongoose.model('Deal', new mongoose.Schema({
            leads: Array
        }, { strict: false }));

        const activities = await Activity.find({
            type: { $in: ['Meeting', 'Site Visit', 'Meeting (Internal)', 'Site Visit (Client)'] }
        }).lean();

        console.log(`Found ${activities.length} Meeting/Site Visit activities.`);

        let updatedDeals = 0;

        for (const act of activities) {
            let leadId = null;
            let dealId = null;

            // Check primary entity
            if (act.entityType === 'Lead' || act.entityType === 'Contact') {
                leadId = act.entityId;
            } else if (act.entityType === 'Deal') {
                dealId = act.entityId;
            }

            // Check relatedTo array
            if (act.relatedTo && Array.isArray(act.relatedTo)) {
                for (const related of act.relatedTo) {
                    if (related.model === 'Deal') {
                        dealId = related.id;
                    } else if (related.model === 'Lead' || related.model === 'Contact') {
                        leadId = related.id;
                    }
                }
            }

            // If we found both a Deal and a Lead in the same activity, link them
            if (dealId && leadId && mongoose.isValidObjectId(dealId) && mongoose.isValidObjectId(leadId)) {
                const result = await Deal.updateOne(
                    { _id: dealId },
                    { $addToSet: { leads: leadId } } // $addToSet prevents duplicates
                );
                
                if (result.modifiedCount > 0) {
                    updatedDeals++;
                    console.log(`Linked Lead ${leadId} to Deal ${dealId}`);
                }
            }
        }

        console.log(`Migration Complete! Updated ${updatedDeals} deal relationships based on historical activities.`);
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

migratePastLeads();
