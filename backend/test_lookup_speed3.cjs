const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const mongoUri = process.env.MONGODB_URI;

async function run() {
    await mongoose.connect(mongoUri);
    await import('./models/Lookup.js');
    const Lookup = mongoose.model('Lookup');
    
    // warm up
    await Lookup.findOne();

    const heavy = ['Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType', 'Locality', 'Area', 'Location', 'Size', 'City', 'State'];
    const light = ['Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType', 'Size'];
    
    console.time("Heavy");
    const resH = await Lookup.find({ lookup_type: { $in: heavy } }).select('_id lookup_type lookup_value').lean();
    console.timeEnd("Heavy");
    
    console.time("Light");
    const resL = await Lookup.find({ lookup_type: { $in: light } }).select('_id lookup_type lookup_value').lean();
    console.timeEnd("Light");

    console.log("Heavy Count:", resH.length, "Light Count:", resL.length);
    process.exit(0);
}
run().catch(console.error);
