import mongoose from 'mongoose';
import dotenv from 'dotenv';


dotenv.config({ path: '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI;

const LeadSchema = new mongoose.Schema({}, { strict: false, collection: 'leads' });
const ActivitySchema = new mongoose.Schema({}, { strict: false, collection: 'activities' });

const Lead = mongoose.model('Lead', LeadSchema);
const Activity = mongoose.model('Activity', ActivitySchema);

async function analyzeLead() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find the Lead
        const lead = await Lead.findOne({ name: /K C Sharma/i }).lean();
        if (!lead) {
            console.log('Lead "K C Sharma" not found.');
            await mongoose.disconnect();
            return;
        }

        console.log('\n--- Lead Details ---');
        console.log(`ID: ${lead._id}`);
        console.log(`Name: ${lead.name}`);
        console.log(`Current Stage: ${lead.stage} (ID: ${lead.stage_id || 'N/A'})`);
        console.log(`Current Score: ${lead.leadScore || 0}`);
        console.log(`Intent Index: ${lead.intent_index || 0}`);

        // 2. Find Recent Activities for this Lead
        const activities = await Activity.find({
            entityId: lead._id,
            status: 'Completed'
        }).sort({ createdAt: -1 }).limit(5).lean();

        console.log('\n--- Recent Completed Activities ---');
        activities.forEach((act, idx) => {
            console.log(`\nActivity ${idx + 1}:`);
            console.log(`  ID: ${act._id}`);
            console.log(`  Type: ${act.type}`);
            console.log(`  Subject: ${act.subject}`);
            console.log(`  Completed At: ${act.completedAt}`);
            console.log(`  Details: ${JSON.stringify(act.details, null, 2)}`);
        });

        // 3. Find System Settings for Activity Master Fields
        const db = mongoose.connection.db;
        const collection = db.collection('systemsettings');
        const activityMasterFields = await collection.findOne({ key: 'activityMasterFields' });

        console.log('\n--- Activity Master Fields Config ---');
        if (activityMasterFields) {
            const siteVisit = activityMasterFields.value?.activities?.find(a => a.name === 'Site Visit');
            if (siteVisit) {
                console.log('Site Visit Purposes and Outcomes:');
                siteVisit.purposes.forEach(p => {
                    console.log(`  Purpose: ${p.name}`);
                    p.outcomes.forEach(o => {
                        console.log(`    - Outcome: ${o.label}, Score: ${o.score}, Stage: ${o.stage}`);
                    });
                });
            } else {
                console.log('Site Visit configuration not found in activityMasterFields.');
            }
        } else {
            console.log('activityMasterFields setting not found.');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

analyzeLead();
