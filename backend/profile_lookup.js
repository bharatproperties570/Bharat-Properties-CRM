import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, {strict: false}), 'lookups');
    
    console.time('Lookup.find');
    const lookupTypes = [ 'Category', 'Intent', 'SubCategory', 'Status', 'PropertyType', 'UnitType', 'Locality', 'Area', 'Location', 'City', 'State', 'Orientation' ];
    const allLookups = await Lookup.find({ lookup_type: { $in: lookupTypes } }).lean();
    console.timeEnd('Lookup.find');
    console.log('Lookup count:', allLookups.length);
    process.exit(0);
}
run();
