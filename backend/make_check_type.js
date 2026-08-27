import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Deal = mongoose.connection.db.collection('deals');
    const sample = await Deal.findOne({ intent: { $type: 'string' } });
    console.log(sample ? 'String intent found: ' + sample.intent : 'No string intent');
    const sampleObj = await Deal.findOne({ intent: { $type: 'objectId' } });
    console.log(sampleObj ? 'ObjectId intent found: ' + sampleObj.intent : 'No ObjectId intent');
    
    const Inv = mongoose.connection.db.collection('inventories');
    const s1 = await Inv.findOne({ intent: { $type: 'string' } });
    console.log(s1 ? 'Inv String intent: ' + s1.intent : 'No Inv string intent');
    const s2 = await Inv.findOne({ intent: { $type: 'objectId' } });
    console.log(s2 ? 'Inv ObjectId intent: ' + s2.intent : 'No Inv ObjectId intent');
    
    process.exit(0);
}
run();
