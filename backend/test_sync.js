import mongoose from 'mongoose';
import { syncMobileCalls } from './controllers/activity.controller.js';
import './models/Activity.js';
import './models/Lead.js';
import './models/Contact.js';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const req = {
            body: {
                calls: [
                    {
                        number: "9876543210",
                        name: "Test User",
                        duration: 60,
                        timestamp: Date.now(),
                        type: "INCOMING",
                        id: "test_call_1"
                    }
                ]
            }
        };

        const res = {
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                console.log("Response Status:", this.statusCode || 200);
                console.log("Response Body:", JSON.stringify(data, null, 2));
                process.exit(0);
            }
        };

        console.log("Testing syncMobileCalls...");
        await syncMobileCalls(req, res);

    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
};

runTest();
