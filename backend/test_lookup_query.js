import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatproperties').then(async () => {
    const Lookup = mongoose.model('Lookup', new mongoose.Schema({}, { strict: false }));
    const lkup = await Lookup.findById('69c4f2e65482316ddeef67d8').lean();
    console.log("Lookup:", JSON.stringify(lkup, null, 2));
    mongoose.connection.close();
});
