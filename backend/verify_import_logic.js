import mongoose from 'mongoose';
import Lookup from './models/Lookup.js';
import Inventory from './models/Inventory.js';
import { importInventory } from './controllers/inventory.controller.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function verifyImport() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // 1. Create a test Size lookup
        const testSize = await Lookup.create({
            lookup_type: 'Size',
            lookup_value: 'Test 5 Marla Alignment',
            metadata: {
                unitType: '5 Marla', // Standardized field
                project: 'Global',
                totalArea: '125',
                resultMetric: 'Sq Yd',
                width: '25',
                length: '45'
            }
        });
        console.log(`Created test Size lookup: ${testSize._id}`);

        // 2. Prepare mock request for import
        const mockReq = {
            body: {
                data: [
                    {
                        projectName: 'Global',
                        unitNo: 'TEST-UNIT-001',
                        sizeLabel: 'Test 5 Marla Alignment',
                        category: 'Residential',
                        subCategory: 'Plot'
                    }
                ]
            }
        };

        const mockRes = {
            status: function (s) { this.statusCode = s; return this; },
            json: function (j) { this.data = j; return this; }
        };

        // 3. Call importInventory
        await importInventory(mockReq, mockRes);
        console.log('Import Response:', JSON.stringify(mockRes.data, null, 2));

        if (mockRes.statusCode === 200 && mockRes.data.success) {
            // 4. Verify imported record
            const imported = await Inventory.findOne({ unitNumber: 'TEST-UNIT-001' }).populate('unitType');
            if (imported) {
                console.log('Imported Unit Details:');
                console.log(`- Project: ${imported.projectName}`);
                console.log(`- Size Value: ${imported.size.value} ${imported.sizeUnit}`);
                console.log(`- unitType Lookup Value: ${imported.unitType?.lookup_value}`);
                // Check if it used the standardized unitType from metadata
                const sizeTypeInMeta = testSize.metadata.unitType;
                console.log(`- Expected unitType from meta: ${sizeTypeInMeta}`);

                if (imported.size.value == 125 && imported.sizeUnit === 'Sq Yd' && imported.unitType?.lookup_value === '5 Marla') {
                    console.log('VERIFICATION SUCCESS: Unit aligned correctly with Size metadata.');
                } else {
                    console.log('VERIFICATION FAILED: Data mismatch.');
                }
            } else {
                console.log('VERIFICATION FAILED: Record not found.');
            }
        } else {
            console.log('VERIFICATION FAILED: Import failed.');
        }

        // Cleanup
        await Inventory.deleteOne({ unitNumber: 'TEST-UNIT-001' });
        await Lookup.deleteOne({ _id: testSize._id });
        console.log('Cleanup complete.');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Verification Error:', error);
    }
}

verifyImport();
