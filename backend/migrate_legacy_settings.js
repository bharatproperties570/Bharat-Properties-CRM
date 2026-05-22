import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const mongoURI = process.env.MONGODB_URI;

const migrateLegacySettings = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        const db = mongoose.connection.db;
        const collection = db.collection('systemsettings');

        const mappings = {
            'property_config': 'propertyConfig',
            'master_fields': 'masterFields',
            'activity_master_fields': 'activityMasterFields',
            'lead_master_fields': 'leadMasterFields',
            'project_master_fields': 'projectMasterFields',
            'project_amenities': 'projectAmenities',
            'scoring_attributes': 'scoringAttributes',
            'scoring_config': 'scoringConfig',
            'behavioural_signals': 'behaviouralSignals',
            'deal_fit_signals': 'dealFitSignals',
            'financial_signals': 'financialSignals',
            'decay_rules': 'decayRules',
            'ai_signals': 'aiSignals',
            'source_quality_scores': 'sourceQualityScores',
            'inventory_fit_scores': 'inventoryFitScores',
            'stage_multipliers': 'stageMultipliers',
            'deal_scoring_rules': 'dealScoringRules',
            'score_bands': 'scoreBands'
        };

        for (const [oldKey, newKey] of Object.entries(mappings)) {
            console.log(`Checking pair: ${oldKey} -> ${newKey}`);
            const oldDoc = await collection.findOne({ key: oldKey });
            const newDoc = await collection.findOne({ key: newKey });

            if (oldDoc) {
                if (newDoc) {
                    console.log(`Both ${oldKey} and ${newKey} exist. Performing smart merge...`);
                    
                    let mergedValue = {};
                    if (oldKey === 'master_fields' || oldKey === 'masterFields') {
                        // Merge fields: prioritize oldDoc value (user settings) but preserve unique newDoc keys
                        mergedValue = {
                            ...newDoc.value,
                            ...oldDoc.value
                        };
                    } else if (oldKey === 'property_config' || oldKey === 'propertyConfig') {
                        // For propertyConfig, oldDoc contains the user's custom structures, but they might be strings.
                        // We will copy oldDoc value to newDoc.
                        mergedValue = oldDoc.value;
                    } else {
                        // Default fallback: copy old value to new key to preserve user customizations
                        mergedValue = {
                            ...newDoc.value,
                            ...oldDoc.value
                        };
                    }

                    // Update newDoc with merged value
                    await collection.updateOne(
                        { _id: newDoc._id },
                        { 
                            $set: { 
                                value: mergedValue,
                                category: 'crm_config',
                                description: newDoc.description || oldDoc.description || 'Migrated and merged settings'
                            } 
                        }
                    );
                    console.log(`Successfully merged ${oldKey} into ${newKey}.`);
                } else {
                    console.log(`${newKey} does not exist. Renaming ${oldKey} to ${newKey}...`);
                    await collection.updateOne(
                        { _id: oldDoc._id },
                        { 
                            $set: { 
                                key: newKey,
                                category: 'crm_config'
                            } 
                        }
                    );
                    console.log(`Successfully renamed ${oldKey} to ${newKey}.`);
                }

                // Delete the old key document to keep database clean
                await collection.deleteOne({ key: oldKey });
                console.log(`Deleted legacy key: ${oldKey}`);
            } else {
                console.log(`Legacy key ${oldKey} not found. Skipping.`);
            }
        }

        console.log('Migration completed successfully!');
        await mongoose.disconnect();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrateLegacySettings();
