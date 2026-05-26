import mongoose from 'mongoose';
import Contact from './models/Contact.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);

    const pushkar = await Contact.findById('69955d3e94c8fe05f86d1bd0');
    console.log("Pushkar Raj:", pushkar?.name, pushkar?.company, pushkar?.professionSubCategory, pushkar?.professionCategory);

    const matchRegex = await Contact.findOne({ _id: '69955d3e94c8fe05f86d1bd0', professionSubCategory: { $regex: /^Real Estate Agent$/i } });
    console.log("Did Pushkar match regex?", !!matchRegex);

    await mongoose.disconnect();
}
test();
