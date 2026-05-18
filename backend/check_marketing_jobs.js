import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm";

async function run() {
    await mongoose.connect(mongoUri);
    console.log("Connected to DB!");

    const jobs = await mongoose.connection.db.collection("marketingjobs").find({}).toArray();
    console.log(`Found ${jobs.length} marketing jobs:`);
    for (const job of jobs) {
        console.log(JSON.stringify(job, null, 2));
    }

    const contents = await mongoose.connection.db.collection("marketingcontents").find({}).toArray();
    console.log(`\nFound ${contents.length} marketing contents:`);
    for (const content of contents) {
        console.log(JSON.stringify(content, null, 2));
    }

    await mongoose.disconnect();
}

run().catch(console.error);
