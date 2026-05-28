import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    const { default: Booking } = await import("./models/Booking.js");
    const bookings = await Booking.find({ lead: { $ne: null } }).populate('lead');
    const booking = bookings.find(b => b.lead?.personalAddress?.city === "69877a0fe933d7d456c6d1f5");
    
    if (!booking) { console.log("Not found"); process.exit(); }
    
    const obj = booking.toObject();
    
    // Simulating manual resolution
    obj.lead.personalAddress.city = { _id: "69877a0fe933d7d456c6d1f5", lookup_value: "Kurukshetra" };
    obj.lead.personalAddress.state = { _id: "69877a05e933d7d456c6d1ef", lookup_value: "Haryana" };
    obj.lead.personalAddress.tehsil = { _id: "69a98d393a56674b285e0d27", lookup_value: "Thanesar" };
    
    console.log(JSON.stringify(obj.lead.personalAddress, null, 2));
    process.exit();
});
