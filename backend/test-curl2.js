import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    await import("./models/Inventory.js");
    await import("./models/Project.js");
    await import("./models/Deal.js");
    const { default: Booking } = await import("./models/Booking.js");
    
    // Find booking where lead has city 69877a0fe933d7d456c6d1f5
    const bookings = await Booking.find({ lead: { $ne: null } }).populate('lead');
    const booking = bookings.find(b => b.lead && b.lead.personalAddress && b.lead.personalAddress.city === "69877a0fe933d7d456c6d1f5");
    
    if (!booking) { console.log("No valid booking found"); process.exit(); }

    const { getBooking } = await import("./controllers/booking.controller.js");
    const req = { params: { id: booking._id }, user: { role: 'admin' } };
    const res = {
        status: () => res,
        json: (data) => {
            const jsonStr = JSON.stringify(data);
            const parsed = JSON.parse(jsonStr);
            console.dir(parsed.data.lead?.personalAddress, { depth: null });
            process.exit();
        }
    };
    await getBooking(req, res);
});
