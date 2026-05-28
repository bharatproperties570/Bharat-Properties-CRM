import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const { default: Lookup } = await import("./models/Lookup.js");
    const lookups = await Lookup.find({ _id: { $in: [
        '6991582d7980e6b48e18d0ab', '69b92b8ead94b247568bfd5f', '69a98d393a56674b285e0d27', '69877a0fe933d7d456c6d1f5', '69877a05e933d7d456c6d1ef'
    ] } });
    console.log("Found:", lookups.map(l => ({ id: l._id, val: l.lookup_value })));
    process.exit();
});
