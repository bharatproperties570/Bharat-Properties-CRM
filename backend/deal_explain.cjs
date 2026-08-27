const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false }));
  
  console.log("Explaining Deals Category Aggregation...");
  
  const explain = await Deal.aggregate([
      { $match: { isVisible: { $ne: false } } },
      { $lookup: { from: 'inventories', localField: 'inventoryId', foreignField: '_id', as: 'inventory' } },
      { $unwind: { path: '$inventory', preserveNullAndEmptyArrays: true } },
      { $project: { activeCategory: { $ifNull: ["$category", "$inventory.category"] } } },
      { $group: { _id: "$activeCategory", count: { $sum: 1 } } }
  ]).explain("executionStats");
  
  console.log(JSON.stringify(explain, null, 2));
  process.exit(0);
}
run();
