import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/.env' });

async function verifyFix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;

        const leadId = new mongoose.Types.ObjectId('699c3217bf3e6a3e69493ae7');
        const lead = await db.collection('leads').findOne({ _id: leadId });

        console.log(`\nLead: ${lead.firstName} ${lead.lastName}`);
        console.log(`Intent Index: ${lead.intent_index || 0}`);

        const setting = await db.collection('systemsettings').findOne({ key: 'activityMasterFields' });
        const activityConfig = setting.value || {};

        // Robust search for any completed activity for this lead
        const activities = await db.collection('activities').find({
            entityId: { $in: [leadId, leadId.toString()] },
            status: 'Completed'
        }).toArray();

        console.log(`Found ${activities.length} completed activities.`);

        let behavioralScore = 0;
        activities.forEach(act => {
            const actType = (act.type || '').toLowerCase();
            const typeConfig = activityConfig.activities?.find(a => (a.name || '').toLowerCase() === actType);

            if (typeConfig) {
                let outcomeLabel = (act.details?.completionResult || '').toLowerCase();

                // Professional Fix: Scan nested properties for Site Visits
                if (!outcomeLabel && actType === 'site visit' && Array.isArray(act.details?.visitedProperties)) {
                    const priority = { 'very interested': 1, 'shortlisted': 2, 'somewhat interested': 3 };
                    const foundResult = act.details.visitedProperties
                        .map(p => (p.result || '').toLowerCase())
                        .filter(r => r)
                        .sort((a, b) => (priority[a] || 99) - (priority[b] || 99))[0];
                    if (foundResult) outcomeLabel = foundResult;
                }

                console.log(`- Activity: ${act.type}, Subject: ${act.subject}, Outcome Detected: ${outcomeLabel}`);

                // Match Purpose Robustly
                const purpose = (act.details?.purpose || act.subject || '').toLowerCase();
                const purposeConfig = typeConfig.purposes?.find(p => {
                    const pName = (p.name || '').toLowerCase();
                    return pName && (purpose.includes(pName) || pName.includes(purpose));
                });

                if (purposeConfig) {
                    const outcomeConfig = purposeConfig.outcomes?.find(o => {
                        const label = (o.label || '').toLowerCase();
                        return label === outcomeLabel || (outcomeLabel && outcomeLabel.includes(label));
                    });
                    if (outcomeConfig) {
                        behavioralScore += (outcomeConfig.score || 0);
                        console.log(`  Match! Adding ${outcomeConfig.score} points for purpose "${purposeConfig.name}" and outcome "${outcomeConfig.label}"`);
                    } else {
                        console.log(`  No outcome match for "${outcomeLabel}" in purpose "${purposeConfig.name}"`);
                    }
                } else {
                    console.log(`  No purpose match for "${purpose}" in activity "${act.type}"`);
                }
            }
        });

        console.log(`\nTotal Behavioral Score: ${behavioralScore}`);
        const baseScore = Math.max(lead.intent_index || 0, 10);
        const finalScore = Math.max(0, Math.min(100, baseScore + behavioralScore));
        console.log(`Final Blended Score Calculation: max(${lead.intent_index}, 10) + ${behavioralScore} = ${finalScore}`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

verifyFix();
