import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Lookup = mongoose.connection.collection('lookups');

        const ids = [
            '6995e15f74ec320348f2319c', // category
            '69d5f061f6f81d802814426c', // subCategory
            '69a96e313a56674b285e010a', // unitType
            '69fed1b2674afbaf480d7929', // sizeConfig
            '69acf2ed9fb33e32af777e1d', // status
            '69d1077b3dc8a3ece367c8cd', // facing
            '69956b4275e0967fae08d182', // direction
            '699beeb0ee5159cfdb8f3ed2', // roadWidth
            '69999d8331d19e8a9538ee1e'  // builtupType
        ];

        for (const id of ids) {
            const l = await Lookup.findOne({ _id: new mongoose.Types.ObjectId(id) });
            console.log(`${id}: type="${l?.lookup_type}", value="${l?.lookup_value}"`);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

run();
