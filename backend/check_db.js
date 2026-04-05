
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const Inventory = mongoose.model('Inventory', new mongoose.Schema({}, { strict: false }));
        
        const allCount = await Inventory.countDocuments({});
        console.log(`Total Inventory records: ${allCount}`);

        const stringBuiltup = await Inventory.countDocuments({ builtupType: { $type: 'string' } });
        const objectIdBuiltup = await Inventory.countDocuments({ builtupType: { $type: 'objectId' } });
        const nullBuiltup = await Inventory.countDocuments({ builtupType: null });

        console.log(`\nBuiltupType Status:`);
        console.log(`- Strings: ${stringBuiltup}`);
        console.log(`- ObjectIDs: ${objectIdBuiltup}`);
        console.log(`- Null/Missing: ${nullBuiltup}`);

        if (stringBuiltup > 0) {
            const samples = await Inventory.find({ builtupType: { $type: 'string' } }).limit(5).select('builtupType');
            console.log('\nSample String Values:', samples.map(s => s.builtupType));
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
