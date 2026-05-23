import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bharat-properties';

mongoose.connect(MONGO_URI)
  .then(async () => {
    try {
      const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
      
      const leads = await Lead.find({ $or: [] }).limit(3);
      console.log('Result of $or: []:', leads.length);
    } catch (e) {
      console.error('Error:', e.message);
    }
    process.exit(0);
  });
