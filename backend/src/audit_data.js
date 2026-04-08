
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI;

async function auditData() {
    try {
        if (!mongoUri) throw new Error('MONGODB_URI not found in .env');
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String,
            parent_lookup_id: mongoose.Schema.Types.ObjectId,
            is_active: Boolean
        }, { strict: false }));

        console.log('\n--- 1 KANAL PROPERTY TYPE ---');
        const propertyTypes = await Lookup.find({ lookup_type: 'PropertyType', lookup_value: '1 Kanal' });
        console.log(JSON.stringify(propertyTypes, null, 2));

        if (propertyTypes.length > 0) {
            const ptId = propertyTypes[0]._id;
            console.log(`\n--- BUILTUP LOOKUPS FOR 1 KANAL (${ptId}) ---`);
            const builtups = await Lookup.find({ lookup_type: 'BuiltupType', parent_lookup_id: ptId });
            console.log(JSON.stringify(builtups, null, 2));
        }

        console.log('\n--- GLOBAL PROPERTY CONFIG ---');
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));
        const config = await SystemSetting.findOne({ key: 'propertyConfig' });
        
        if (config && config.value) {
            const plotConfig = config.value.Residential?.subCategories?.find(s => s.name === 'Plot')?.types?.find(t => t.name === '1 Kanal');
            if (plotConfig) {
                console.log('\n--- BUILTUP TYPES IN CONFIG FOR 1 KANAL ---');
                console.log(JSON.stringify(plotConfig.builtupTypes, null, 2));
            } else {
                console.log('Could not find Residential > Plot > 1 Kanal in config.');
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

auditData();
