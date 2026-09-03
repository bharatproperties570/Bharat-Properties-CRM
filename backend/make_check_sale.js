import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Lookup = mongoose.connection.db.collection('lookups');
    const l = await Lookup.findOne({ lookup_type: 'Intent', lookup_value: 'For Sale' });
    console.log(l ? 'Found For Sale' : 'Not found');
    
    // Also, let's just get ALL unique intent strings in Deals and Inventories
    const Deal = mongoose.connection.db.collection('deals');
    const Inv = mongoose.connection.db.collection('inventories');
    
    const dealIntents = await Deal.distinct('intent');
    console.log('Deal intents:', dealIntents);
    
    const invIntents = await Inv.distinct('intent');
    console.log('Inv intents:', invIntents);
    
    process.exit(0);
}
run();
