import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const AutomatedAction = mongoose.model('AutomatedAction', new mongoose.Schema({}, { strict: false }));
    const autoAction = await AutomatedAction.findById('6a86da1edfe02deaf054138e').lean();
    console.log(JSON.stringify(autoAction, null, 2));
    process.exit(0);
}
run();
