import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lookup from './models/Lookup.js';

dotenv.config();

const schema = new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed });
const SystemSettings = mongoose.model('SystemSettings', schema);

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const setting = await SystemSettings.findOne({ key: 'lead_master_fields' });
        if (!setting || !setting.value || !setting.value.campaigns) {
            console.log('No campaigns found in lead_master_fields. Skipping migration.');
            process.exit(0);
        }

        const campaigns = setting.value.campaigns;
        console.log(`Found ${campaigns.length} campaigns to migrate.`);

        for (const camp of campaigns) {
            // 1. Create Campaign
            let campLookup = await Lookup.findOne({ lookup_type: 'Campaign', lookup_value: camp.name });
            if (!campLookup) {
                campLookup = await Lookup.create({
                    lookup_type: 'Campaign',
                    lookup_value: camp.name,
                    isActive: true
                });
                console.log(`Created Campaign: ${camp.name}`);
            }

            for (const src of camp.sources) {
                // 2. Create Source
                let srcLookup = await Lookup.findOne({
                    lookup_type: 'Source',
                    lookup_value: src.name,
                    parent_lookup_id: campLookup._id
                });
                if (!srcLookup) {
                    srcLookup = await Lookup.create({
                        lookup_type: 'Source',
                        lookup_value: src.name,
                        parent_lookup_id: campLookup._id,
                        isActive: true
                    });
                    console.log(`  - Created Source: ${src.name}`);
                }

                for (const med of src.mediums) {
                    // 3. Create Sub-Source (Medium)
                    let medLookup = await Lookup.findOne({
                        lookup_type: 'Sub-Source',
                        lookup_value: med,
                        parent_lookup_id: srcLookup._id
                    });
                    if (!medLookup) {
                        medLookup = await Lookup.create({
                            lookup_type: 'Sub-Source',
                            lookup_value: med,
                            parent_lookup_id: srcLookup._id,
                            isActive: true
                        });
                        console.log(`    * Created Sub-Source: ${med}`);
                    }
                }
            }
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
