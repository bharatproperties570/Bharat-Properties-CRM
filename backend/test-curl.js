import axios from "axios";
import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    await import("./models/Inventory.js");
    await import("./models/Project.js");
    await import("./models/Deal.js");
    const { default: Booking } = await import("./models/Booking.js");
    const { default: User } = await import("./models/User.js");
    
    // Find booking where lead is successfully populated
    const bookings = await Booking.find({ lead: { $ne: null } }).populate('lead');
    const booking = bookings.find(b => b.lead && b.lead.fullName === 'Raman') || bookings.find(b => b.lead);
    
    if (!booking) { console.log("No valid booking found"); process.exit(); }

    const user = await User.findOne({ email: 'bharatproperties570@gmail.com' });
    const { getBooking } = await import("./controllers/booking.controller.js");
    const req = { params: { id: booking._id }, user };
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
