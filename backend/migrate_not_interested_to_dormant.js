/**
 * Migration: Not Interested -> Dormant (ESM Version)
 * 
 * Updates the 'activityMasterFields' system setting in MongoDB to map
 * all 'Not Interested' and 'Lost Interest' outcomes to the new 'Dormant' stage.
 */

import { MongoClient } from 'mongodb';

// Connection URI from .env
const uri = "mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db('bharatproperties1');
        const settings = db.collection('systemsettings');

        console.log("Connected to MongoDB. Searching for 'activityMasterFields'...");

        const setting = await settings.findOne({ key: 'activityMasterFields' });

        if (!setting) {
            console.error("Could not find 'activityMasterFields' in systemsettings collection.");
            return;
        }

        let config = setting.value;
        let updatedCount = 0;

        if (config && Array.isArray(config.activities)) {
            config.activities.forEach(activity => {
                if (Array.isArray(activity.purposes)) {
                    activity.purposes.forEach(purpose => {
                        if (Array.isArray(purpose.outcomes)) {
                            purpose.outcomes.forEach(outcome => {
                                const label = (outcome.label || '').toLowerCase();
                                if (label === 'not interested' || label === 'lost interest') {
                                    console.log(`Updating outcome [${outcome.label}] in Activity [${activity.name}] -> Stage: Dormant`);
                                    outcome.stage = 'Dormant';
                                    updatedCount++;
                                }
                            });
                        }
                    });
                }
            });
        }

        if (updatedCount > 0) {
            await settings.updateOne(
                { key: 'activityMasterFields' },
                { $set: { value: config, updatedAt: new Date() } }
            );
            console.log(`Successfully updated ${updatedCount} outcomes to 'Dormant' stage.`);
        } else {
            console.log("No matching outcomes found to update.");
        }

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.close();
    }
}

run();
