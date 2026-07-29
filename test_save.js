import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('Connected to DB');
        const db = mongoose.connection.db;
        const inventories = await db.collection('inventories').find({
            category: "667bb8e3a24ed214bd2beaf6" // Assuming Agricultural
        }).sort({ createdAt: -1 }).limit(1).toArray();
        
        console.log("Latest Inventory:");
        if (inventories.length > 0) {
            const inv = inventories[0];
            console.log("Water Source:", inv.waterSource);
            console.log("No of Owner:", inv.numberOfOwner);
            console.log("Land Details:", inv.landDetails);
            console.log("Total Area:", inv.totalLandAreaText);
        } else {
            console.log("No agricultural inventory found");
        }
        mongoose.disconnect();
    })
    .catch(console.error);
