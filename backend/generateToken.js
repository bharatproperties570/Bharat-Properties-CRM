import connectDB from "./src/config/db.js";
import User from "./models/User.js";
import jwt from "jsonwebtoken";
import config from "./src/config/env.js";
import fs from "fs";

async function run() {
    await connectDB();
    const user = await User.findOne({ email: 'bharatproperties570@gmail.com' });
    if (!user) {
        console.log("User not found");
        process.exit(1);
    }
    const token = jwt.sign({ id: user._id }, config.jwtSecret, { expiresIn: '1h' });
    console.log("TOKEN=" + token);
    process.exit(0);
}
run().catch(console.error);
