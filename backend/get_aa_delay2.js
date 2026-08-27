import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const AutomatedAction = mongoose.model('AutomatedAction', new mongoose.Schema({}, { strict: false, collection: 'automatedactions' }));
    const aa = await AutomatedAction.findById('6a86da1edfe02deaf054138e').lean();
    console.log('Unit exactly:', JSON.stringify(aa.delay.unit));
    console.log('Type of amount:', typeof aa.delay.amount);
    process.exit(0);
}
run();
