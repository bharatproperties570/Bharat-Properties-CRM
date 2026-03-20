
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const inspectSettings = async () => {
    try {
        await mongoose.connect(mongoURI);
        const SystemSetting = mongoose.model('SystemSetting', new mongoose.Schema({}, { strict: false }), 'systemsettings');
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }), 'lookups');

        console.log('--- SystemSettings for Property Config ---');
        const propertyConfig = await SystemSetting.findOne({ key: 'property_config' }).lean();
        if (propertyConfig) {
            console.log(JSON.stringify(propertyConfig.value, null, 2));
        } else {
            console.log('property_config not found.');
        }

        console.log('\n--- Lookups for Relation/Orientation ---');
        const lookups = await Lookup.find({ 
            lookup_type: { $in: ['Orientation', 'Relation', 'AssociateRelation'] } 
        }).lean();
        lookups.forEach(l => {
            console.log(`Type: ${l.lookup_type}, Value: ${l.lookup_value}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

inspectSettings();
