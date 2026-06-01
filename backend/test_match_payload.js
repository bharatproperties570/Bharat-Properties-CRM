import mongoose from 'mongoose';

const MONGODB_URI = "mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority";

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false, strictPopulate: false }), 'leads');
        const Deal = mongoose.model('Deal', new mongoose.Schema({}, { strict: false, strictPopulate: false }), 'deals');
        
        // Find a lead
        const lead = await Lead.findOne();
        if (!lead) {
            console.log("No lead found");
            return;
        }
        console.log("Found Lead:", lead._id, lead.name);
        
        // Find matching deals
        const deals = await Deal.find({
            isVisible: { $ne: false },
            stage: { $nin: ["Cancelled", "Closed Lost", "Sold Out"] }
        }).populate('inventoryId').lean();
        
        console.log(`Total deals found: ${deals.length}`);
        
        const sampleDeal = deals.find(d => d.inventoryId && d.inventoryId.projectName && d.inventoryId.projectName.includes("Kohinoor"));
        if (sampleDeal) {
            console.log("Sample Kohinoor Deal:");
            console.log(JSON.stringify(sampleDeal, null, 2));
        } else if (deals.length > 0) {
            console.log("Sample First Deal:");
            console.log(JSON.stringify(deals[0], null, 2));
        }
    } catch(e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
