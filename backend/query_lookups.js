import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

mongoose.connect(uri).then(async () => {
    const db = mongoose.connection.db;
    const lookups = db.collection('lookups');

    // Find unique lookup_types related to unit
    const types = await lookups.distinct('lookup_type');
    const unitRelated = types.filter(t => t.toLowerCase().includes('unit'));
    console.log("Unit related types:", unitRelated);

    // Check some records
    if (unitRelated.length > 0) {
        const samples = await lookups.find({ lookup_type: { $in: unitRelated } }).limit(5).toArray();
        console.log("Samples:", samples.map(s => `${s.lookup_type}: ${s.lookup_value}`));
    }

    process.exit(0);
}).catch(console.error);
