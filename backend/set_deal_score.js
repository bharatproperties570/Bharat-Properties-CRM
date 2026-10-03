import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || (() => { throw new Error('CRITICAL: MONGODB_URI environment variable is required. Hardcoded fallbacks removed.') })();

mongoose.connect(MONGODB_URI).then(async () => {
    const Deal = mongoose.connection.collection('deals');
    const result = await Deal.updateOne(
        { "builtupDetails.imageUrl": { $exists: true, $ne: "" } },
        { $set: { dealScore: 100 } }
    );
    console.log("Update result:", result);
    process.exit(0);
});
