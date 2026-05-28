import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    await import("./models/Contact.js");
    await import("./models/Inventory.js");
    await import("./models/Project.js");
    await import("./models/Deal.js");
    const { default: Lookup } = await import("./models/Lookup.js");
    const { default: Booking } = await import("./models/Booking.js");
    
    // Pick the most recent booking
    const booking = await Booking.findOne().sort({createdAt: -1})
        .populate({ path: 'property', populate: [{ path: 'projectId' }, { path: 'owners.contact' }] })
        .populate('lead')
        .populate('seller');

    const bookingObj = booking.toObject();
    if (!bookingObj.closingDetails?.isClosed && bookingObj.property?.owners?.length > 0) {
        bookingObj.seller = bookingObj.property.owners[0].contact || bookingObj.property.owners[0];
    }
    
    const lookupIds = new Set();
    const extractIds = (addr) => {
         if(!addr) return;
         ['city', 'tehsil', 'postOffice', 'pincode', 'state', 'location'].forEach(field => {
             if (addr[field] && mongoose.Types.ObjectId.isValid(addr[field].toString())) {
                 lookupIds.add(addr[field].toString());
             }
         });
    };
    
    if (bookingObj.lead?.personalAddress) extractIds(bookingObj.lead.personalAddress);
    if (bookingObj.seller?.personalAddress) extractIds(bookingObj.seller.personalAddress);
    
    if (lookupIds.size > 0) {
        const lookups = await Lookup.find({ _id: { $in: Array.from(lookupIds) } });
        const lookupDict = {};
        lookups.forEach(l => lookupDict[l._id.toString()] = l.lookup_value);
        
        const resolveAddr = (addr) => {
            if(!addr) return;
            ['city', 'tehsil', 'postOffice', 'pincode', 'state', 'location'].forEach(field => {
                 if (addr[field] && lookupDict[addr[field].toString()]) {
                     addr[field] = { _id: addr[field], lookup_value: lookupDict[addr[field].toString()] };
                 }
            });
        };
        
        if (bookingObj.lead?.personalAddress) resolveAddr(bookingObj.lead.personalAddress);
        if (bookingObj.seller?.personalAddress) resolveAddr(bookingObj.seller.personalAddress);
    }
    
    console.dir({
        leadAddr: bookingObj.lead?.personalAddress,
        sellerAddr: bookingObj.seller?.personalAddress
    }, { depth: null });
    process.exit();
});
