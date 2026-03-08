
import mongoose from 'mongoose';
import { importInventory } from './controllers/inventory.controller.js';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const testImport = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB');

        // Mocking req and res
        const req = {
            body: {
                data: [
                    {
                        projectName: "Sector 32 (Kohinoor City) Kurukshetra",
                        unitNo: "A-1-DEBUG-TEST",
                        direction: "69956b4275e0967fae08d182", // West
                        facing: "699bc99fee5159cfdb8f2e2c",    // L-Point
                        roadWidth: "699beeb0ee5159cfdb8f3ed2",  // 12 Mtr
                        sizeLabel: "69a808d54461aa87753223f5"
                    }
                ]
            }
        };

        const res = {
            status: (code) => {
                console.log('Response Status:', code);
                return res;
            },
            json: (data) => {
                console.log('Response JSON:', JSON.stringify(data, null, 2));
                return res;
            }
        };

        await importInventory(req, res);

        const Inventory = mongoose.model('Inventory');
        const item = await Inventory.findOne({ unitNo: 'A-1-DEBUG-TEST' }).lean();
        console.log('Final DB Record for A-1-DEBUG-TEST:');
        console.log(JSON.stringify(item, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

testImport();
