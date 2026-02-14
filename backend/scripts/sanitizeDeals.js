import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function sanitizeDeals() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined in .env file");
        }

        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected successfully.");

        // Define flexible schemas
        const Deal = mongoose.model("Deal", new mongoose.Schema({}, { strict: false }));
        const Inventory = mongoose.model("Inventory", new mongoose.Schema({}, { strict: false }));
        const Lead = mongoose.model("Lead", new mongoose.Schema({}, { strict: false }));

        console.log("Checking Deals...");
        const deals = await Deal.find({});
        let updatedDeals = 0;
        const dealRefs = ["owner", "associatedContact", "partyStructure.owner", "partyStructure.buyer", "partyStructure.channelPartner"];

        for (const deal of deals) {
            let needsUpdate = false;
            for (const field of dealRefs) {
                if (clearCorruptRef(deal, field)) needsUpdate = true;
            }
            if (needsUpdate) {
                deal.markModified('partyStructure');
                await deal.save();
                updatedDeals++;
            }
        }
        console.log(`${updatedDeals} deals sanitized.`);

        console.log("Checking Inventory...");
        const inventories = await Inventory.find({});
        let updatedInv = 0;
        const invRefs = ["owners", "associates"]; // These are usually arrays in Inventory

        for (const inv of inventories) {
            let needsUpdate = false;
            for (const field of invRefs) {
                if (Array.isArray(inv[field])) {
                    const originalLen = inv[field].length;
                    inv[field] = inv[field].filter(id => {
                        if (id && typeof id === "object") {
                            return id._id && mongoose.Types.ObjectId.isValid(id._id.toString());
                        }
                        return id && mongoose.Types.ObjectId.isValid(id.toString());
                    });
                    if (inv[field].length !== originalLen) needsUpdate = true;
                }
            }
            if (needsUpdate) {
                await inv.save();
                updatedInv++;
            }
        }
        console.log(`${updatedInv} inventories sanitized.`);

        console.log("Checking Leads...");
        const leads = await Lead.find({});
        let updatedLeads = 0;
        const leadRefs = ["assignedTo", "contacts", "project"]; // project can be ID or string

        for (const lead of leads) {
            let needsUpdate = false;
            // assignedTo and contacts
            if (clearCorruptRef(lead, "assignedTo")) needsUpdate = true;

            if (Array.isArray(lead.contacts)) {
                const originalLen = lead.contacts.length;
                lead.contacts = lead.contacts.filter(id => {
                    if (id && typeof id === "object") return id._id && mongoose.Types.ObjectId.isValid(id._id.toString());
                    return id && mongoose.Types.ObjectId.isValid(id.toString());
                });
                if (lead.contacts.length !== originalLen) needsUpdate = true;
            }

            if (needsUpdate) {
                await lead.save();
                updatedLeads++;
            }
        }
        console.log(`${updatedLeads} leads sanitized.`);

        console.log(`\nSanitization complete.`);
        process.exit(0);
    } catch (error) {
        console.error("Error during sanitization:", error);
        process.exit(1);
    }
}

function clearCorruptRef(doc, field) {
    const parts = field.split('.');
    let val = doc;
    for (let i = 0; i < parts.length; i++) {
        if (val) val = val[parts[i]];
    }

    if (val && typeof val === "object" && !Array.isArray(val)) {
        if (!val._id || !mongoose.Types.ObjectId.isValid(val._id.toString())) {
            console.log(`Doc ${doc._id}: Corrupt ${field} found:`, JSON.stringify(val));
            // Clear it
            if (parts.length === 1) doc[parts[0]] = undefined;
            else if (parts.length === 2 && doc[parts[0]]) doc[parts[0]][parts[1]] = undefined;
            return true;
        }
    }
    return false;
}

sanitizeDeals();
