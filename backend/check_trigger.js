import mongoose from "mongoose";
import "dotenv/config";
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const triggers = await mongoose.connection.collection('triggers').find({ module: 'activity' }).toArray();
    console.log(JSON.stringify(triggers, null, 2));
    process.exit(0);
});
