import mongoose from 'mongoose';
import { getLeads } from './controllers/lead.controller.js';
import './models/Lead.js';
import './models/Activity.js';
import './models/Contact.js';
import './models/Team.js';
import './models/User.js';
import './models/Lookup.js';
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
            query: {
                page: 1,
                limit: 5,
                status: "invalid_id_test", // This should be ignored by the fix
                stage: "65d8c1e8e4b0a1b2c3d4e5f6" // Valid ID but likely non-existent
            }
        };

        const res = {
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                console.log("Response Status:", this.statusCode || 200);
                console.log("Records found:", data.records?.length || 0);
                console.log("Success:", data.success);
                process.exit(0);
            }
        };

        console.log("Testing getLeads with mixed filters...");
        await getLeads(req, res, (err) => {
            console.error("Express next() called with error:", err);
            process.exit(1);
        });

    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
};

runTest();
