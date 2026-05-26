import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import Inventory from './backend/models/Inventory.js';
import Contact from './backend/models/Contact.js';
import Lookup from './backend/models/Lookup.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected");

  // 1. Find Inventory
  const inv = await Inventory.findOne({
    $or: [
      { unitNo: /229/i },
      { unitNumber: /229/i }
    ],
    projectName: /sector 30/i
  }).lean();

  if (!inv) {
    console.log("Inventory not found");
  } else {
    console.log("Inventory Found:", inv._id, "Unit:", inv.unitNo, "Project:", inv.projectName);
    console.log("Inv Address:", inv.address);
  }

  // 2. Find Contact with HNo 229
  const contacts = await Contact.find({
    $or: [
      { 'personalAddress.hNo': /229/i },
      { 'correspondenceAddress.hNo': /229/i }
    ]
  }).lean();

  console.log(`Found ${contacts.length} contacts with HNo 229`);
  for (const c of contacts) {
    console.log(`- ${c.name} (${c._id})`);
    console.log(`  Personal:`, c.personalAddress);
    console.log(`  Corres:`, c.correspondenceAddress);
  }

  process.exit();
}

run().catch(console.error);
