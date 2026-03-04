import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const keyMapping = {
    'property_config': 'propertyConfig',
    'master_fields': 'masterFields',
    'lead_master_fields': 'leadMasterFields',
    'activity_master_fields': 'activityMasterFields',
    'score_bands': 'scoreBands',
    'stage_multipliers': 'stageMultipliers',
    'project_master_fields': 'projectMasterFields',
    'project_amenities': 'projectAmenities'
};

async function migrateSettings() {
    try {
        console.log('Connecting to:', process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed,
            category: String,
            isPublic: Boolean,
            description: String
        }, { collection: 'systemsettings' }));

        console.log('--- Starting Migration ---');

        for (const [oldKey, newKey] of Object.entries(keyMapping)) {
            console.log(`Checking for ${oldKey}...`);
            const oldRecord = await SystemSetting.findOne({ key: oldKey }).lean();

            if (oldRecord) {
                console.log(`Found ${oldKey}. Migrating to ${newKey}...`);

                // Use existing newRecord if it exists, otherwise use oldRecord's values
                const newRecord = await SystemSetting.findOne({ key: newKey });

                if (newRecord) {
                    console.log(`Updating existing ${newKey} with values from ${oldKey}...`);
                    newRecord.value = oldRecord.value;
                    newRecord.category = 'crm_config';
                    newRecord.isPublic = oldRecord.isPublic || true;
                    await newRecord.save();
                } else {
                    console.log(`Creating new ${newKey} from ${oldKey}...`);
                    await SystemSetting.create({
                        key: newKey,
                        value: oldRecord.value,
                        category: 'crm_config',
                        isPublic: oldRecord.isPublic || true,
                        description: oldRecord.description || `Migrated from ${oldKey}`
                    });
                }

                // Keep the old record for safety during migration, but we could delete it later
                console.log(`Successfully migrated ${oldKey} -> ${newKey}`);
            } else {
                console.log(`${oldKey} not found, skipping.`);
            }
        }

        // Ensure all camelCase keys are in 'crm_config'
        console.log('\n--- Normalizing Categories ---');
        const results = await SystemSetting.updateMany(
            { key: { $in: Object.values(keyMapping) } },
            { $set: { category: 'crm_config' } }
        );
        console.log(`Normalized ${results.modifiedCount} records to 'crm_config' category.`);

        await mongoose.disconnect();
        console.log('\n--- Migration Completed ---');
    } catch (error) {
        console.error('Migration Error:', error);
    }
}

migrateSettings();
