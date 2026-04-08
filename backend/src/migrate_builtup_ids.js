
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI;

async function migrateData() {
    try {
        if (!mongoUri) throw new Error('MONGODB_URI not found');
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Lookup = mongoose.model('Lookup', new mongoose.Schema({
            lookup_type: String,
            lookup_value: String,
            parent_lookup_id: mongoose.Schema.Types.ObjectId,
            is_active: { type: Boolean, default: true }
        }, { strict: false }));

        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({
            key: String,
            value: mongoose.Schema.Types.Mixed
        }, { strict: false }));

        // 1. Identify "1 Kanal" PropertyType
        const oneKanal = await Lookup.findOne({ lookup_type: 'PropertyType', lookup_value: '1 Kanal' });
        if (!oneKanal) {
            console.error('PropertyType "1 Kanal" not found. Aborting.');
            await mongoose.disconnect();
            return;
        }
        const parentId = oneKanal._id;
        console.log(`Found "1 Kanal" ID: ${parentId}`);

        // 2. Define the Target Built-up Types
        const targetBuiltups = [
            'Vacant',
            '25% Built-up',
            '40% Built-up',
            '50% Built-up',
            'Boundry Wall'
        ];

        const resolvedBuiltups = [];

        for (const name of targetBuiltups) {
            // Standardize matches (handle space vs hyphen)
            const alternateName = name.includes('-') ? name.replace('-', ' ') : name.replace(' ', '-');
            
            let lookup = await Lookup.findOne({
                lookup_type: 'BuiltupType',
                parent_lookup_id: parentId,
                $or: [
                    { lookup_value: name },
                    { lookup_value: alternateName },
                    { lookup_value: new RegExp(`^${name}$`, 'i') }
                ]
            });

            if (!lookup) {
                console.log(`Creating missing lookup for: ${name}`);
                lookup = await Lookup.create({
                    lookup_type: 'BuiltupType',
                    lookup_value: name,
                    parent_lookup_id: parentId,
                    is_active: true
                });
            } else if (lookup.lookup_value !== name) {
                console.log(`Standardizing lookup name: ${lookup.lookup_value} -> ${name}`);
                lookup.lookup_value = name;
                await lookup.save();
            }

            resolvedBuiltups.push({ _id: lookup._id, name: lookup.lookup_value });
        }

        console.log('Resolved Built-up Map:', JSON.stringify(resolvedBuiltups, null, 2));

        // 3. Update Global propertyConfig
        const configSetting = await SystemSetting.findOne({ key: 'propertyConfig' });
        if (configSetting && configSetting.value) {
            const config = configSetting.value;
            const plotConfig = config.Residential?.subCategories?.find(s => s.name === 'Plot')?.types?.find(t => t.name === '1 Kanal');
            
            if (plotConfig) {
                console.log('Updating propertyConfig for 1 Kanal...');
                plotConfig.builtupTypes = resolvedBuiltups;
                
                // Use markModified for Mixed types if necessary, but here we can just re-save
                configSetting.markModified('value');
                await configSetting.save();
                console.log('propertyConfig successfully migrated.');
            } else {
                console.warn('Residential > Plot > 1 Kanal not found in propertyConfig.');
            }
        }

        await mongoose.disconnect();
        console.log('Migration Complete.');
    } catch (err) {
        console.error('Migration Failed:', err);
    }
}

migrateData();
