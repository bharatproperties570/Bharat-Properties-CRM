import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || (() => { throw new Error('CRITICAL: MONGODB_URI environment variable is required. Hardcoded fallbacks removed.') })())
  .then(async () => {
    const db = mongoose.connection.db;
    const inv = await db.collection('inventories').findOne({});
    console.log(JSON.stringify(inv, null, 2));
    process.exit(0);
  });
