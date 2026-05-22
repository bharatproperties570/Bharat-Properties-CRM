import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    const result = await db.collection('inventories').updateOne(
        { _id: new mongoose.Types.ObjectId('6a07046d742d2975995fa6d1') },
        {
            $set: {
                inventoryImages: [
                    {
                        title: 'IMG 5791',
                        category: 'Main',
                        url: 'https://drive.google.com/file/d/1BLJ2F7Jq74U5sVEr_6MKPwgxGmv0jFdt/view?usp=drivesdk',
                        _id: new mongoose.Types.ObjectId('6a0ad6f2ee8126a476a14ff4')
                    }
                ]
            }
        }
    );

    console.log("Update result:", result);
    process.exit(0);
}
inspect();
