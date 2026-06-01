import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        console.log("Connecting to Mongo:", process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected successfully!");

        // 1. Inspect Lookup types and some values
        const Lookup = mongoose.connection.collection('lookups');
        const lookupTypes = await Lookup.distinct('lookup_type');
        console.log("\nDistinct Lookup Types:", lookupTypes);

        for (const type of ['BuiltupType', 'PropertyType', 'Facing', 'Direction', 'Road Width', 'Size']) {
            const sample = await Lookup.find({ lookup_type: type }).limit(10).toArray();
            console.log(`\nSample lookups for type "${type}":`, sample.map(s => ({ _id: s._id, val: s.lookup_value })));
        }

        // 2. Inspect Inventory structure
        const Inventory = mongoose.connection.collection('inventories');
        const sampleInv = await Inventory.findOne({ builtupType: { $exists: true, $ne: null } });
        console.log("\nSample Inventory Document Fields:", Object.keys(sampleInv || {}));
        if (sampleInv) {
            console.log("Sample Inventory details:", {
                projectName: sampleInv.projectName,
                category: sampleInv.category,
                subCategory: sampleInv.subCategory,
                size: sampleInv.size,
                sizeType: sampleInv.sizeType,
                sizeConfig: sampleInv.sizeConfig,
                builtupType: sampleInv.builtupType,
                direction: sampleInv.direction,
                facing: sampleInv.facing,
                roadWidth: sampleInv.roadWidth,
            });
        }

        // Let's print another inventory to get wider samples
        const sampleInvs = await Inventory.find({}).limit(5).toArray();
        console.log("\nSample Inventories Raw Data:");
        sampleInvs.forEach((inv, i) => {
            console.log(`Inventory #${i+1}:`, {
                projectName: inv.projectName,
                category: inv.category,
                subCategory: inv.subCategory,
                size: inv.size,
                sizeType: inv.sizeType,
                sizeConfig: inv.sizeConfig,
                builtupType: inv.builtupType,
                direction: inv.direction,
                facing: inv.facing,
                roadWidth: inv.roadWidth,
            });
        });

        process.exit(0);
    } catch (err) {
        console.error("Diagnostic Error:", err);
        process.exit(1);
    }
}

run();
