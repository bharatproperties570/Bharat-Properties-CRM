import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WorkflowEngine } from './src/utils/WorkflowEngine.js';
import Lead from './models/Lead.js';
import { addLead } from './controllers/lead.controller.js';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const leadData = {
            firstName: 'Scratch Test Unique',
            mobile: '1234512345',
            status: '69968ae6ca1dbceb0ffda61c'
        };
        const req = { body: leadData, user: { _id: '69c4be0fd8c5cd0d6c90e999' } };
        const res = {
            status: (c) => ({ json: (d) => { console.log('Response status:', c); console.log('Response JSON:', d.success); } })
        };
        
        console.log('Testing addLead with unique mobile...');
        await addLead(req, res);
        
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
