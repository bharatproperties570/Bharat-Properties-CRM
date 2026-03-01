import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

async function debugDashboard() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const Lead = mongoose.model('Lead', new mongoose.Schema({ stage: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' } }, { strict: false }));
        const Deal = mongoose.model('Deal', new mongoose.Schema({ stage: String, price: Number }, { strict: false }));
        const Lookup = mongoose.model('Lookup', new mongoose.Schema({ lookup_type: String, lookup_value: String }));

        const stages = await Lookup.find({ lookup_type: 'Stage' }).lean();
        console.log("\n--- STAGE LOOKUPS ---");
        stages.forEach(s => console.log(`[${s._id}] ${s.lookup_value}`));

        const sampleLead = await Lead.findOne().lean();
        if (sampleLead) console.log("LEAD_ID:", sampleLead._id);

        const dealStats = await Deal.aggregate([
            { $group: { _id: "$stage", count: { $sum: 1 }, totalValue: { $sum: "$price" } } }
        ]);

        console.log("\n--- DEAL COUNTS & VALUES BY STAGE ---");
        dealStats.forEach(stat => {
            console.log(`${stat._id || 'No Stage'}: ${stat.count} (₹${(stat.totalValue || 0).toLocaleString()})`);
        });

        process.exit();
    } catch (error) {
        console.error("Debug failed:", error);
        process.exit(1);
    }
}

debugDashboard();
