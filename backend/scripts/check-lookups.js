import mongoose from "mongoose";
import dotenv from "dotenv";
import Lookup from "../models/Lookup.js";

dotenv.config();

const checkLookup = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const id = "698b3310861a01e0b0816889";
        const lookup = await Lookup.findById(id);
        console.log("Lookup found:", lookup);

        const allLookups = await Lookup.find({}).limit(10).lean();
        console.log("Sample Lookups:", JSON.stringify(allLookups, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

checkLookup();
