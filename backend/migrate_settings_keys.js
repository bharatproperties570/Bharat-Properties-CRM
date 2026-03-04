import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function migrateKeys() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const collection = db.collection('systemsettings');

        const mappings = {
            'activity_master_fields': 'activityMasterFields',
            'lead_master_fields': 'leadMasterFields',
            'property_config': 'propertyConfig',
            'scoring_attributes': 'scoringAttributes',
            'behavioural_signals': 'behaviouralSignals',
            'master_fields': 'masterFields',
            'scoring_config': 'scoringConfig',
            'deal_fit_signals': 'dealFitSignals',
            'financial_signals': 'financialSignals',
            'project_master_fields': 'projectMasterFields',
            'project_amenities': 'projectAmenities',
            'decay_rules': 'decayRules',
            'ai_signals': 'aiSignals',
            'source_quality_scores': 'sourceQualityScores',
            'inventory_fit_scores': 'inventoryFitScores',
            'stage_multipliers': 'stageMultipliers',
            'deal_scoring_rules': 'dealScoringRules',
            'score_bands': 'scoreBands'
        };

        for (const [oldKey, newKey] of Object.entries(mappings)) {
            const existingOld = await collection.findOne({ key: oldKey });
            if (existingOld) {
                const existingNew = await collection.findOne({ key: newKey });
                if (!existingNew) {
                    console.log(`Renaming ${oldKey} -> ${newKey}`);
                    await collection.updateOne({ _id: existingOld._id }, { $set: { key: newKey } });
                } else {
                    console.log(`Both ${oldKey} and ${newKey} exist. Merging or skipping... (Skipping ${oldKey})`);
                    // Optionally delete the old one if the new one is already what we want
                    // await collection.deleteOne({ _id: existingOld._id });
                }
            }
        }

        console.log('Migration complete!');
        await mongoose.disconnect();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateKeys();
