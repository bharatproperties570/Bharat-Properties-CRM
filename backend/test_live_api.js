import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const User = (await import('./models/User.js')).default;
        
        // Let's generate a valid token for an admin user to bypass visibility
        // Actually, no need to hit the API if I can just call matchDeals with a mock req object!
        // But the previous mock failed due to Redis. Let's disable Redis mock errors if any.

        const { matchDeals } = await import('./controllers/deal.controller.js');
        const Lead = (await import('./models/Lead.js')).default;
        // Import all models needed
        await import('./models/Inventory.js');
        await import('./models/Project.js');
        await import('./models/Lookup.js');

        const lead = await Lead.findById('6a1eebf7fa0dbcb534d4f960').lean();
        
        const req = { 
            query: { leadId: lead._id.toString() },
            user: { _id: '69c4be0fd8c5cd0d6c90e999', role: 'admin' } // valid user ID from logs
        };
        const res = {
            status: (code) => ({
                json: (data) => {
                    if (data.success && data.matches) {
                        const match1412 = data.matches.find(m => m.unitNo === '1412' || (m.inventoryId && m.inventoryId.unitNumber === '1412'));
                        if (match1412) {
                            console.log("=== MATCH FOR 1412 ===");
                            console.log("Total Score:", match1412.matchPercentage + "%");
                            console.log("Score Breakdown:", JSON.stringify(match1412.scoreBreakdown, null, 2));
                        } else {
                            console.log("Deal 1412 not found in top matches.");
                        }
                    } else {
                        console.log("Error or no matches:", data);
                    }
                }
            })
        };

        await matchDeals(req, res);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();
