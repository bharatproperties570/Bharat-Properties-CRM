import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from './models/Lead.js';
import Lookup from './models/Lookup.js';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const leadPopulateFields = [ { path: 'status', select: 'lookup_value' } ];
        
        // Let's create a dummy lead mimicking the controller behavior
        const statusId = '69968ae6ca1dbceb0ffda61c'; // New
        
        let newLead = new Lead({
            firstName: 'TestPopulate',
            status: statusId,
            mobile: '111111111'
        });
        await newLead.save();
        
        console.log('Before populate:', newLead.status);
        await newLead.populate(leadPopulateFields);
        console.log('After populate:', newLead.status);
        
        await Lead.deleteOne({_id: newLead._id});
        
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
});
