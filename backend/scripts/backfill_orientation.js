
import mongoose from 'mongoose';
import fs from 'fs';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';
const csvPath = '/Users/bharatproperties/Downloads/inventory_template (1).csv';

const backfill = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }), 'inventories');

        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.split(/\r\n|\n/).filter(line => line.trim() !== '');

        const headers = lines[0].split(',').map(h => h.trim());
        const dataRows = lines.slice(1);

        console.log(`Processing ${dataRows.length} rows from CSV...`);

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const row of dataRows) {
            const values = row.split(',');
            const rowObj = {};
            headers.forEach((h, i) => rowObj[h] = values[i]);

            const unitNo = rowObj['Unit Number'];
            const projectName = rowObj['Project Name'];
            const block = rowObj['Block'];

            // CSV columns for orientation:
            // Column 11: Direction
            // Column 12: Facing
            // Column 13: Road Width
            const directionId = rowObj['Direction'];
            const facingId = rowObj['Facing'];
            const roadWidthId = rowObj['Road Width'];

            if (!unitNo || !projectName) continue;

            try {
                const updateData = {
                    direction: mongoose.Types.ObjectId.isValid(directionId) ? new mongoose.Types.ObjectId(directionId) : null,
                    facing: mongoose.Types.ObjectId.isValid(facingId) ? new mongoose.Types.ObjectId(facingId) : null,
                    roadWidth: mongoose.Types.ObjectId.isValid(roadWidthId) ? new mongoose.Types.ObjectId(roadWidthId) : null,
                    orientation: null // Reset the mysterious 'North' value
                };

                const result = await Inventory.updateOne(
                    { unitNo: unitNo, projectName: projectName, block: block },
                    { $set: updateData }
                );

                if (result.matchedCount > 0) {
                    successCount++;
                } else {
                    console.log(`[SKIP] Unit ${unitNo} in Project ${projectName} not found.`);
                    skipCount++;
                }
            } catch (err) {
                console.error(`[ERROR] Failed to update ${unitNo}:`, err.message);
                errorCount++;
            }
        }

        console.log('\n--- Backfill Complete ---');
        console.log(`Total Rows: ${dataRows.length}`);
        console.log(`Successfully Updated: ${successCount}`);
        console.log(`Skipped (Not Found): ${skipCount}`);
        console.log(`Errors: ${errorCount}`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Fatal Error:', error);
    }
};

backfill();
