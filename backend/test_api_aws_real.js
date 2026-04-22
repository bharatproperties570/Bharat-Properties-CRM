import mongoose from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import axios from "axios";

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const user = await User.findOne({ email: 'bharatproperties570@gmail.com' });
        
        const token = jwt.sign(
            { id: user._id.toString(), email: user.email, role: "admin" }, 
            process.env.JWT_SECRET || "supersecretkey123",
            { expiresIn: '1h' }
        );

        console.log("Token:", token);

        console.log("Fetching from AWS API...");
        const response = await axios.get("https://api.bharatproperties.co/api/inventory?page=1&limit=25", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log("Response Status:", response.status);
        console.log("Success:", response.data.success);
        console.log("Error:", response.data.error);
        if(!response.data.success) {
            console.log("Response Error Data:", response.data);
        } else {
             console.log("Records Length:", response.data.records?.length);
        }
       
    } catch (err) {
        console.error("Test Script Error:");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        } else {
            console.error(err.message);
        }
    }
    process.exit(0);
};

runTest();
