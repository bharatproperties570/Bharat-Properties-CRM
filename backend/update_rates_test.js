
import mongoose from 'mongoose';
import CollectorRate from './models/CollectorRate.js';
import dotenv from 'dotenv';
dotenv.config();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const updateRates = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const rates = await CollectorRate.find({});
        console.log(`Found ${rates.length} rates to update`);

        for (const rate of rates) {
            // Mocking some values for testing
            rate.unitType = 'Plot';
            rate.builtupType = 'Semi-Finished';
            await rate.save();
            console.log(`Updated rate: ${rate.configName}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

updateRates();
