import mongoose from "mongoose";
import { config } from "./src/config/env.js";
import { bulkUpdatePropertyOwners } from "./controllers/inventory.controller.js";
import Inventory from "./models/Inventory.js";
import Contact from "./models/Contact.js";

async function run() {
    await mongoose.connect(config.mongoUri);
    
    // Create req/res mock
    const req = {
        user: { _id: "698de0ceeebee6c7a313dd29", team: "6991ad69e07eb3dd7dd46681" },
        body: {
            data: [
                {
                    rowKey: "row_0",
                    unitNo: "C-110",
                    projectName: "Sector 32 (Kohinoor City) Kurukshetra",
                    block: "Part I",
                    ownerName: "Amit Gupta",
                    ownerMobile: "9034711065",
                    source: "Test"
                },
                {
                    rowKey: "row_1",
                    unitNo: "C-110",
                    projectName: "Sector 32 (Kohinoor City) Kurukshetra",
                    block: "Part I",
                    ownerName: "Amit Gupta",
                    ownerMobile: "9034711065",
                    source: "Test"
                }
            ],
            dryRun: false
        }
    };
    
    let resJson = null;
    const res = {
        status: (code) => {
            return {
                json: (data) => {
                    resJson = data;
                    console.log("RESPONSE:", JSON.stringify(data, null, 2));
                }
            };
        }
    };
    
    console.log("--- RUN WITH DUPLICATE IN BATCH ---");
    await bulkUpdatePropertyOwners(req, res);
    
    process.exit(0);
}
run();
