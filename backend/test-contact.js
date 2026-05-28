import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const { default: Contact } = await import("./models/Contact.js");
    const contact = await Contact.findOne({ "personalAddress.city": { $ne: null } });
    console.dir(contact?.toObject().personalAddress, { depth: null });
    process.exit();
});
