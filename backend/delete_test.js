import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

mongoose.connect(uri).then(async () => {
    console.log("Connected to MongoDB");
    const db = mongoose.connection.db;
    const leadsCol = db.collection('leads');

    // Find a lead to test with
    const lead = await leadsCol.findOne({});
    if (!lead) {
        console.log("No leads found to delete.");
        process.exit(0);
    }

    console.log("Found lead:", lead._id);

    // Delete it using the Mongoose model directly just like the controller
    // Actually, let's just use the collection directly first
    const delResult = await leadsCol.deleteOne({ _id: lead._id });
    console.log("Delete result:", delResult);

    const check = await leadsCol.findOne({ _id: lead._id });
    console.log("Check after delete:", check ? "STILL EXISTS!" : "Deleted successfully.");
    process.exit(0);
}).catch(console.error);
