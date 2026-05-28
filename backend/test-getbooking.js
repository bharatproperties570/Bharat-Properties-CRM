import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    await import("./models/Inventory.js");
    await import("./models/Project.js");
    await import("./models/Deal.js");
    const { getBooking } = await import("./controllers/booking.controller.js");
    const { default: Booking } = await import("./models/Booking.js");
    
    // get a booking that has a lead
    const booking = await Booking.findOne({ lead: { $ne: null } }).sort({createdAt: -1});
    const req = { params: { id: booking._id }, user: { email: 'bharatproperties570@gmail.com' } };
    const res = {
        status: () => res,
        json: (data) => {
            console.dir(data.data.lead.personalAddress, { depth: null });
            process.exit();
        }
    };
    await getBooking(req, res);
});
