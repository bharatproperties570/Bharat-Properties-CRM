import mongoose from 'mongoose';
import "dotenv/config";
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';
import { getLeads } from './controllers/lead.controller.js';

async function verify() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        // Mock req/res for getLeads
        const req = {
            query: { page: 1, limit: 5 },
            user: { role: 'admin' }
        };
        const res = {
            status: function(code) { 
                this.statusCode = code; 
                return this; 
            },
            json: function(data) {
                this.data = data;
                return this;
            }
        };

        await getLeads(req, res);

        if (res.data && res.data.success) {
            console.log("Fetched Leads:", res.data.data.length);
            res.data.data.forEach((lead, i) => {
                console.log(`\nLead ${i+1}: ${lead.name}`);
                console.log(`Requirement:`, JSON.stringify(lead.requirement));
                console.log(`UnitType:`, JSON.stringify(lead.unitType));
                console.log(`SubType:`, JSON.stringify(lead.subType));
            });
        } else {
            console.error("Failed to fetch leads:", res.data);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

verify();
