const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const models = ['Lead', 'Deal', 'Inventory', 'Contact', 'Activity', 'Booking'];
  
  for (let m of models) {
    const Model = mongoose.model(m, new mongoose.Schema({}));
    const indexes = await Model.collection.indexes();
    console.log(`=== ${m} Indexes ===`);
    indexes.forEach(idx => console.log(JSON.stringify(idx.key)));
  }
  process.exit(0);
}
run();
