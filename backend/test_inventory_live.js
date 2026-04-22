import mongoose from "mongoose";
import dotenv from "dotenv";
import { getInventory } from "./controllers/inventory.controller.js";
import User from "./models/User.js";

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const user = await User.findOne({ email: 'bharatproperties570@gmail.com' });
        console.log("Using User:", user ? user.email : "Not Found");

        const req = {
            query: {
                page: '1',
                limit: '25'
            },
            user: user
        };

        const res = {
            status: (code) => {
                console.log(`Response Status: ${code}`);
                return res;
            },
            json: (data) => {
                console.log("Response Data:");
                console.log(JSON.stringify(data, null, 2).substring(0, 500) + '...');
                process.exit(0);
            }
        };

        await getInventory(req, res);

    } catch (err) {
        console.error("Test Script Error:", err);
        process.exit(1);
    }
};

runTest();
