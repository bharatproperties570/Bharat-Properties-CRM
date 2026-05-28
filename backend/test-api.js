import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    const { default: Booking } = await import("./models/Booking.js");
    const bookings = await Booking.find({ lead: { $ne: null } }).populate('lead');
    const booking = bookings.find(b => b.lead?.personalAddress?.city === "69877a0fe933d7d456c6d1f5");
    if(!booking) { console.log("Not found"); process.exit(); }
    
    console.log("Booking ID:", booking._id);
    process.exit();
});
