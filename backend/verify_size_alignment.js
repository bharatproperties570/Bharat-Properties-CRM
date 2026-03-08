
import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import { resolveSizeLookup } from './controllers/inventory.controller.js';
import dotenv from 'dotenv';

dotenv.config();

async function verifyAlignment() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("--- Starting Professional Size Alignment Verification ---");

        // 1. Find or create a specific project-linked size
        let testSize = await Lookup.findOne({
            lookup_type: 'Size',
            'metadata.project': { $exists: true },
            'metadata.block': { $exists: true }
        }).lean();

        if (!testSize) {
            console.log("Creating test lookup...");
            testSize = await Lookup.create({
                lookup_type: 'Size',
                lookup_value: 'Verification Plot (600 Sq Yd)',
                metadata: {
                    project: 'Verification Project',
                    block: 'Block V',
                    length: '120',
                    width: '45',
                    totalArea: '600.00',
                    resultMetric: 'Sq Yd'
                }
            });
        }

        const label = testSize.lookup_value;
        const project = testSize.metadata.project;
        const block = testSize.metadata.block;

        console.log(`\nImporting item with Label: "${label}", Project: "${project}", Block: "${block}"`);

        // 2. Test the actual exported function
        const result = await resolveSizeLookup(label, project, block);

        console.log(`Matched ID: ${result.id}`);
        console.log(`Matched Metadata:`, JSON.stringify(result.metadata, null, 2));

        if (result.id.toString() === testSize._id.toString()) {
            console.log("\n✅ SUCCESS: ResolveSizeLookup accurately matched the project-specific record!");

            if (result.metadata?.length === testSize.metadata.length) {
                console.log("✅ SUCCESS: Metadata (dimensions) are correctly retrieved!");
            }
        } else {
            console.log("\n❌ FAILURE: Could not match exact project/block record.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Verification failed with error:", err);
        process.exit(1);
    }
}

verifyAlignment();
