import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties')
  .then(async () => {
    const db = mongoose.connection.db;
    const inv = await db.collection('inventories').findOne({});
    console.log(JSON.stringify(inv, null, 2));
    process.exit(0);
  });
