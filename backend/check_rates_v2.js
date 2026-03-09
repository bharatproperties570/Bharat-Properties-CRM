
import mongoose from 'mongoose';
import CollectorRate from './models/CollectorRate.js';
import dotenv from 'dotenv';
dotenv.config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkRates = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const rates = await CollectorRate.find({}).limit(10).lean();

        console.log(`Found ${rates.length} rates`);

        rates.forEach(rate => {
            console.log('---');
            console.log('Config Name:', rate.configName);
            console.log('Category:', rate.category);
            console.log('SubCategory:', rate.subCategory);
            console.log('Rate:', rate.rate);
            console.log('Location ID:', rate.location);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkRates();
