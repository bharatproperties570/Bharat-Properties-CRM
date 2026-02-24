
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function verifyLookupsAndSettings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }));

        const sizeLookups = await Lookup.find({ lookup_type: /size/i });
        console.log(`Number of 'size' Lookups: ${sizeLookups.length}`);
        if (sizeLookups.length > 0) {
            console.log('Sample Size Lookup:');
            console.log(JSON.stringify(sizeLookups[0], null, 2));
        }

        const sizeSetting = await SystemSetting.findOne({ key: 'property_sizes' });
        console.log(`\n'property_sizes' Setting exists: ${!!sizeSetting}`);
        if (sizeSetting) {
            console.log(`Number of items in 'property_sizes': ${sizeSetting.value.length}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyLookupsAndSettings();
