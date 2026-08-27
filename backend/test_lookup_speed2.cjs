const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function run() {
    await mongoose.connect(mongoUri);
    await import('./models/Lookup.js');
    const Lookup = mongoose.model('Lookup');
    
    // Original types:
    // const lookupTypes = ['Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType', 'Locality', 'Area', 'Location', 'Size', 'City', 'State'];
    
    // Without the heavy location lookups:
    const lookupTypes = ['Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType', 'Size'];
    
    console.time("Lookup");
    const res = await Lookup.find({ lookup_type: { $in: lookupTypes } }).select('_id lookup_type lookup_value').lean();
    console.timeEnd("Lookup");
    console.log("Count:", res.length);
    process.exit(0);
}
run().catch(console.error);
