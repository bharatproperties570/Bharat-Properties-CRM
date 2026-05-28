import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    await import("./models/Inventory.js");
    await import("./models/Project.js");
    await import("./models/Deal.js");
    const { default: Lookup } = await import("./models/Lookup.js");
    const { getBooking } = await import("./controllers/booking.controller.js");
    const { default: Booking } = await import("./models/Booking.js");
    
    // get a booking that has a lead with personalAddress.city
    const booking = await Booking.findOne();
    if (!booking) { console.log("No booking"); process.exit(); }
    
    const req = { params: { id: booking._id }, user: { role: 'admin' } };
    const res = {
        status: () => res,
        json: (data) => {
            console.dir({
                leadAddr: data.data?.lead?.personalAddress,
                sellerAddr: data.data?.seller?.personalAddress
            }, { depth: null });
            process.exit();
        }
    };
    await getBooking(req, res);
});
