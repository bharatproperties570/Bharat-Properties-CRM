import mongoose from "mongoose";
import Lookup from "./models/Lookup.js";

mongoose.connect("mongodb://localhost:27017/bharatproperties");

async function test() {
    try {
        const value = "Closed (Won)";
        const escapedValue = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^${escapedValue}$`, 'i');
        let lookup = await Lookup.findOne({ 
            lookup_type: 'Stage', 
            $or: [
                { lookup_value: { $regex: re } },
                { "metadata.aliases": { $regex: re } }
            ]
        });
        if (!lookup) {
            lookup = await Lookup.create({ lookup_type: 'Stage', lookup_value: value });
        }
        console.log("Lookup ID:", lookup._id);
    } catch(e) {
        console.error("ERROR CAUGHT:");
        console.error(e);
    }
    process.exit();
}
test();
