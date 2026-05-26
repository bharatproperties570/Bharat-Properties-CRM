import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import Inventory from './models/Inventory.js';
import Contact from './models/Contact.js';
import Lookup from './models/Lookup.js';

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected");

  const inventory = await Inventory.findOne({ unitNo: /229/i, projectName: /sector 30/i }).lean();
  
  if (!inventory) {
    console.log("Inventory not found");
    return process.exit();
  }

  const unitRaw = (inventory.unitNo || inventory.unitNumber || "").trim();
  const fuzzyUnitPattern = new RegExp(`.*${escapeRegExp(unitRaw)}.*`, 'i');

  const resolveQueryValues = async (val, lookupType) => {
      if (!val) return [];
      const values = [val];
      const isObjectId = mongoose.Types.ObjectId.isValid(val);
      if (isObjectId) {
          const lookup = await Lookup.findById(val).lean();
          if (lookup && lookup.lookup_value) {
              values.push(lookup.lookup_value);
          }
          values.push(val.toString());
      } else {
          const lookup = await Lookup.findOne({ 
              lookup_type: lookupType, 
              lookup_value: { $regex: new RegExp(`^${escapeRegExp(val.toString())}$`, 'i') } 
          }).lean();
          if (lookup) {
              values.push(lookup._id);
              values.push(lookup._id.toString());
          }
      }
      return values;
  };

  const cityQueryValues = await resolveQueryValues(inventory.address?.city, 'City');
  console.log("cityQueryValues:", cityQueryValues);

  const fuzzyUnitOrBlankPersonal = [
      { 'personalAddress.hNo': { $regex: fuzzyUnitPattern } },
      { 'personalAddress.hNo': { $in: [null, "", undefined] } },
      { 'personalAddress.hNo': { $exists: false } }
  ];

  const searchQueries = [];
  if (cityQueryValues.length > 0) {
      searchQueries.push({
          $or: [
              { 
                  $or: fuzzyUnitOrBlankPersonal, 
                  'personalAddress.city': { $in: cityQueryValues } 
              }
          ]
      });
  }

  const query = { $or: searchQueries };
  console.log("Query:", JSON.stringify(query, null, 2));

  const contacts = await Contact.find(query).lean();
  console.log("Found matches:", contacts.length);
  contacts.forEach(c => console.log(c.name, c.personalAddress));

  process.exit();
}

run().catch(console.error);
