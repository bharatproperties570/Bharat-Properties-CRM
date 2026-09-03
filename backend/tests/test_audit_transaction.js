import mongoose from 'mongoose';
import softDeletePlugin from '../plugins/softDelete.plugin.js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env.staging' });

const TestSchema = new mongoose.Schema({ name: String });
TestSchema.plugin(softDeletePlugin);
const TestModel = mongoose.model('AuditTxnTest', TestSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const doc1 = await TestModel.create({ name: 'Doc1' });
        console.log("Before:", await TestModel.findOne({ _id: doc1._id }));
        
        const session1 = await mongoose.startSession();
        try {
            await session1.withTransaction(async (txnSession) => {
                await TestModel.softDeleteOne({ _id: doc1._id }, { session: txnSession });
                throw new Error("Forced Abort 1");
            });
        } catch (e) {} finally { session1.endSession(); }
        
        const check1 = await mongoose.connection.collection('audittxntests').findOne({ _id: doc1._id });
        console.log("After:", check1);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
