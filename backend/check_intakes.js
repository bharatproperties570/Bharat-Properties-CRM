import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Intake = (await import('./models/Intake.js')).default;
        
        // Find recent failed intakes
        const intakes = await Intake.find({ status: 'Failed' }).sort({createdAt: -1}).limit(2).lean();
        
        console.log("INTAKES:\n", JSON.stringify(intakes, null, 2));
    } catch(err) {
        console.error(err);
    }
    process.exit(0);
};
run();
