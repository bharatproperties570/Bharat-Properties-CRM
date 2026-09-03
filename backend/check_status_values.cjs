const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Activity = mongoose.model('Activity', new mongoose.Schema({}, { strict: false }));
  
  const statuses = await Activity.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log("=== Activity Status Values ===");
  statuses.forEach(s => console.log(`"${s._id}" => ${s.count}`));
  
  process.exit(0);
}
run();
