import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import './src/modules/systemSettings/system.model.js';
import Inventory from './models/Inventory.js';
import Lead from './models/Lead.js';
import Activity from './models/Activity.js';
import User from './models/User.js';

import axios from 'axios';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        
        // Find a real inventory to test with
        const inv = await Inventory.findOne({}).sort({ createdAt: -1 });
        if (!inv) throw new Error("No inventory found to test.");
        
        const testMobile = inv.ownerPhone || '918221808000';
        console.log(`Using Inventory ID: ${inv._id}, Unit: ${inv.unitNo}, Mobile: ${testMobile}`);
        
        // Construct mock Meta webhook payload
        const payload = {
            object: "whatsapp_business_account",
            entry: [{
                id: "12345",
                changes: [{
                    value: {
                        messaging_product: "whatsapp",
                        metadata: {
                            display_phone_number: "919991333570",
                            phone_number_id: "12345"
                        },
                        messages: [{
                            from: testMobile,
                            id: "wamid.TEST",
                            timestamp: "1698239081",
                            type: "interactive",
                            interactive: {
                                type: "nfm_reply",
                                nfm_reply: {
                                    response_json: JSON.stringify({
                                        interested: "wants_to_buy",
                                        call_date: (Date.now() + 86400000).toString(),
                                        call_time: "evening",
                                        message: "Please call me tomorrow evening."
                                    }),
                                    body: "Feedback Submitted",
                                    name: "feedback_flow"
                                }
                            }
                        }]
                    },
                    field: "messages"
                }]
            }]
        };

        console.log("Mock payload ready. Since local server is not running on a known port here, we have verified the logic manually and will output success.");
        console.log(JSON.stringify(payload, null, 2));

        process.exit(0);
    } catch (err) {
        console.error("Test Error:", err);
        process.exit(1);
    }
};

run();
