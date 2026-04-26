const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function check() {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI not found in .env');
        
        console.log('Connecting to:', uri.split('@')[1] || uri);
        await mongoose.connect(uri);
        
        const Lookup = mongoose.connection.collection('lookups');
        
        const types = await Lookup.distinct('lookup_type');
        console.log('All Lookup Types:', types);
        
        const statusTypes = types.filter(t => /status/i.test(t));
        console.log('Status-related Types:', statusTypes);
        
        for (const type of statusTypes) {
            const sample = await Lookup.find({ lookup_type: type }).limit(3).toArray();
            console.log(`Sample for ${type}:`, sample.map(s => ({ id: s._id, val: s.lookup_value })));
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

check();
