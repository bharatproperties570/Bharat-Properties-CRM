import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    await import("./models/Inventory.js");
    const { default: Booking } = await import("./models/Booking.js");
    const booking = await Booking.findById('6a165c4f43240c1be7b0285a')
        .populate({ path: 'property', populate: [{ path: 'projectId' }, { path: 'owners.contact' }] })
        .populate('lead')
        .populate('seller');
    
    console.dir({
        lead: booking.lead,
        seller: booking.seller,
        property_owners: booking.property?.owners
    }, { depth: null });
    process.exit();
});
