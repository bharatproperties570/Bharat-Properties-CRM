import mongoose from "mongoose";
import Lead from "./models/Lead.js";

mongoose.connect("mongodb://localhost:27017/bharatproperties");

async function test() {
    try {
        const badLeads = await Lead.find({ 
            $or: [
                { stage: "Closed (Won)" },
                { status: "Closed (Won)" }
            ]
        }).select('firstName lastName stage status');
        console.log("Bad Leads:", badLeads);
    } catch(e) {
        console.error("ERROR CAUGHT:", e);
    }
    process.exit();
}
test();
