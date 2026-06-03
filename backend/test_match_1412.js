import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const { matchDeals } = await import('./controllers/deal.controller.js');
        
        const Lead = (await import('./models/Lead.js')).default;
        const lead = await Lead.findById('6a1eebf7fa0dbcb534d4f960').lean();
        if (!lead) {
            console.log("Lead not found");
            process.exit(0);
        }

        // Mock req, res
        const req = { 
            query: { leadId: lead._id.toString() },
            user: { _id: 'mock_user_id', role: 'admin' }
        };
        const res = {
            status: (code) => ({
                json: (data) => {
                    if (data.success && data.matches) {
                        const match1412 = data.matches.find(m => m.unitNo === '1412' || (m.inventoryId && m.inventoryId.unitNumber === '1412'));
                        if (match1412) {
                            console.log("MATCH FOR 1412:");
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

        // We mock getVisibilityFilter in deal.controller to just return {} if needed, but admin role might bypass
        // Actually, just calling the controller
        await matchDeals(req, res);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();
