const mongoose = require('mongoose');
// Load .env to get the URI
const fs = require('fs');
const env = fs.readFileSync('../backend/.env', 'utf8');
const mongoUri = env.match(/MONGODB_URI=(.*)/)[1];

mongoose.connect(mongoUri).then(async () => {
    const Lookups = mongoose.connection.collection('lookups');
    const counts = await Lookups.aggregate([
        { $group: { _id: "$lookup_type", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log(JSON.stringify(counts, null, 2));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
