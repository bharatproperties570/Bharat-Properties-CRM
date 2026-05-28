import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const inventory = await Inventory.findOne({ unitNo: /229/i, projectName: /sector 30/i }).lean();
  console.log("Inventory Owners:", inventory.owners);
  console.log("Inventory Associates:", inventory.associates);
  
  const balSingh = await Contact.findById('6a1453100e65b8faea12ec71').lean();
  console.log("Bal Singh ID:", balSingh._id);
  
  process.exit();
}

run().catch(console.error);
