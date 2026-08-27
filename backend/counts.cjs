const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Deal = mongoose.model('Deal', new mongoose.Schema({}));
  const Lead = mongoose.model('Lead', new mongoose.Schema({}));
  const Inventory = mongoose.model('Inventory', new mongoose.Schema({}));
  const Contact = mongoose.model('Contact', new mongoose.Schema({}));
  const Activity = mongoose.model('Activity', new mongoose.Schema({}));
  
  console.log("Deals:", await Deal.countDocuments());
  console.log("Leads:", await Lead.countDocuments());
  console.log("Inventory:", await Inventory.countDocuments());
  console.log("Contacts:", await Contact.countDocuments());
  console.log("Activity:", await Activity.countDocuments());
  
  process.exit(0);
}
run();
