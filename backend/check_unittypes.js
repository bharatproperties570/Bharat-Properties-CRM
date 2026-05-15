import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
  .then(async () => {
    const db = mongoose.connection.db;
    const testIds = [
      "6996f865559a4b7962cb90f4",
      "69956b4375e0967fae08d187",
      "69956b4375e0967fae08d188",
      "699beeafee5159cfdb8f3ec8",
      "699beeafee5159cfdb8f3eca",
      "69999d8331d19e8a9538ee24",
      "69999d8431d19e8a9538ee2d"
    ];
    
    for (const id of testIds) {
      const found = await db.collection('lookups').findOne({ _id: new mongoose.Types.ObjectId(id) });
      if (found) {
        console.log(`ID ${id} FOUND:`, { type: found.lookup_type, val: found.lookup_value });
      } else {
        console.log(`ID ${id} NOT FOUND in lookups.`);
      }
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
