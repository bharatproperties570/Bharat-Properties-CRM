import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    await import("./models/Inventory.js");
    const { default: Booking } = await import("./models/Booking.js");
    const booking = await Booking.findOne().sort({createdAt: -1})
        .populate({ path: 'property', populate: [{ path: 'projectId' }, { path: 'owners.contact' }] });
    
    const obj = booking.toObject();
    const owner = obj.property?.owners?.[0];
    console.dir(owner, { depth: null });
    process.exit();
});
