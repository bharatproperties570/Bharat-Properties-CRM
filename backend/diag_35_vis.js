import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Deal = mongoose.connection.db.collection('deals');
    const c1 = await Deal.countDocuments({ isVisible: false });
    const c2 = await Deal.countDocuments();
    console.log('Total:', c2, '| Hidden:', c1);
    process.exit(0);
}
run();
