import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const { default: Contact } = await import("./models/Contact.js");
    const contact = await Contact.findOne({ "personalAddress.city": "69877a0fe933d7d456c6d1f5", "personalAddress.tehsil": "69a98d393a56674b285e0d27" });
    if(contact) {
        console.dir(contact.toObject().personalAddress, { depth: null });
    } else {
        console.log("Not found with exact string match");
        const c2 = await Contact.findOne({ "personalAddress.city": new mongoose.Types.ObjectId("69877a0fe933d7d456c6d1f5") });
        console.dir(c2?.toObject().personalAddress, { depth: null });
    }
    process.exit();
});
