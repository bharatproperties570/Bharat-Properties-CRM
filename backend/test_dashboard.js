import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDashboardStats } from './controllers/dashboard.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function testDashboard() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const User = (await import('./models/User.js')).default;
        const user = await User.findOne();
        if (!user) {
            console.log("No user found to test with");
            return process.exit(0);
        }

        const req = {
            query: { userId: user._id.toString() }
        };

        const res = {
            json: (data) => console.log('Response JSON:', data ? 'SUCCESS' : 'NO DATA'),
            status: (code) => { console.log('Status code:', code); return res; }
        };

        console.log('Testing getDashboardStats with user:', user._id);
        await getDashboardStats(req, res);

        await mongoose.disconnect();
    } catch (e) {
        console.error('Fatal Test Error:', e);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}
testDashboard();
