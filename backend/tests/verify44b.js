import mongoose from 'mongoose';
import softDeletePlugin, { softDeleteEventBus } from '../plugins/softDelete.plugin.js';
import HardDeleteService from '../services/hardDelete.service.js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env.staging' });

const TestSchema = new mongoose.Schema({ name: String });
TestSchema.plugin(softDeletePlugin);
const TestModel = mongoose.model('Verify44B', TestSchema);

// Dummy Activity Model for tests if not exists
try {
    mongoose.model('Activity');
} catch (e) {
    const ActivitySchema = new mongoose.Schema({ entityId: String, action: String, userId: String, reason: String, previousState: Object, modelName: String });
    mongoose.model('Activity', ActivitySchema);
}

async function run() {
    console.log("=== PHASE 4.4B VERIFICATION RUNNER ===");
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to Staging DB.");
        
        // Use native driver to clear test collection
        await mongoose.connection.collection('verify44bs').deleteMany({});

        // 1. BulkWrite Bypass Prevention
        const doc1 = await TestModel.create({ name: 'BulkWriteTest' });
        let bulkWriteFailed = false;
        try {
            await TestModel.bulkWrite([{ deleteOne: { filter: { _id: doc1._id } } }]);
        } catch (err) {
            bulkWriteFailed = err.message.includes('strictly prohibited');
        }
        console.log("1. BulkWrite delete bypass prevented:", bulkWriteFailed);

        // 2. ReplaceOne Resurrection Protection
        const doc2 = await TestModel.create({ name: 'ReplaceOneTest' });
        await TestModel.softDeleteOne({ _id: doc2._id });
        let replaceResult = await TestModel.replaceOne({ _id: doc2._id }, { name: 'Resurrected' });
        console.log("2. ReplaceOne resurrection blocked (matched count 0):", replaceResult.matchedCount === 0);

        // 3. UpdateOne Resurrection Protection
        const doc3 = await TestModel.create({ name: 'UpdateOneTest' });
        await TestModel.softDeleteOne({ _id: doc3._id });
        let updateResult = await TestModel.updateOne({ _id: doc3._id }, { $set: { name: 'Resurrected' } });
        console.log("3. UpdateOne modification blocked (matched count 0):", updateResult.matchedCount === 0);

        // 4. Hard Delete Service (RBAC Enforcement)
        const doc4 = await TestModel.create({ name: 'HardDeleteTest' });
        let rbacFailed = false;
        try {
            // Passing a user without Admin privileges
            await HardDeleteService.execute({ modelName: 'Verify44B', query: { _id: doc4._id }, user: { role: 'User' }, reason: 'test' });
        } catch (e) {
            rbacFailed = e.message.includes('requires elevated ADMIN privileges');
        }
        console.log("4. Hard Delete Service rejects unauthorized user:", rbacFailed);
        
        // Authorized success
        const deletedCount = await HardDeleteService.execute({ 
            modelName: 'Verify44B', 
            query: { _id: doc4._id }, 
            user: { _id: new mongoose.Types.ObjectId(), role: 'Admin' }, 
            reason: 'Legitimate hard delete test' 
        });
        console.log("5. Hard Delete Service authorized physical delete:", deletedCount === 1);

        // 6. Audit Event Integration
        let eventFired = false;
        softDeleteEventBus.once('SOFT_DELETE', (data) => {
            if (data.modelName === 'Verify44B') eventFired = true;
        });
        const doc5 = await TestModel.create({ name: 'EventTest' });
        await TestModel.softDeleteOne({ _id: doc5._id });
        console.log("6. Global Event Bus emits SOFT_DELETE event on deletion:", eventFired);

        // Cleanup
        await mongoose.connection.collection('verify44bs').deleteMany({});
        console.log("=== TESTS COMPLETE ===");
        process.exit(0);
    } catch (error) {
        console.error("Test error:", error);
        process.exit(1);
    }
}
run();
