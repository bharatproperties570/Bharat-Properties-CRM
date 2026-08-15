import connectDB from "./src/config/db.js";
import dotenv from "dotenv";
dotenv.config();

async function run() {
    try {
        await connectDB();
        console.log("SUCCESS");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
