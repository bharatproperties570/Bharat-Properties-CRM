import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Trigger = mongoose.model('Trigger', new mongoose.Schema({}, { strict: false }));
    const trigger = await Trigger.findById('6a815e9a3a5e94539fddb33b').lean();
    
    const AutomatedAction = mongoose.model('AutomatedAction', new mongoose.Schema({}, { strict: false }));
    const autoActions = await AutomatedAction.find({ _id: { $in: trigger.actions.map(a => a.automatedActionId) } }).lean();
    autoActions.forEach(a => console.log('Action:', a.name, a.delay));
    process.exit(0);
}
run();
