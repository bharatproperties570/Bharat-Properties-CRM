import mongoose from 'mongoose';

class HardDeleteService {
    static async execute({ modelName, query, user, reason, session }) {
        if (!user || (user.role !== 'Admin' && user.role !== 'SUPER_ADMIN')) {
            throw new Error('Hard delete requires elevated ADMIN privileges.');
        }
        
        if (!reason || reason.trim().length < 5) {
            throw new Error('Hard delete requires a detailed reason for audit.');
        }

        const Model = mongoose.model(modelName);
        if (!Model) throw new Error(`Model ${modelName} not found.`);

        const targetDocs = await Model.find(query, null, { includeDeleted: true, session });
        if (targetDocs.length === 0) return 0;

        // Use Native Driver to insert audit logs bypassing validation requirements
        const activityCollection = mongoose.connection.collection('activities');
        for (const doc of targetDocs) {
            await activityCollection.insertOne({
                entityId: doc._id,
                entityType: modelName,
                subject: `Hard Delete: ${modelName}`,
                type: 'System Event',
                dueDate: new Date(),
                action: 'HARD_DELETE',
                userId: user._id,
                reason,
                previousState: doc.toObject(),
                createdAt: new Date(),
                updatedAt: new Date()
            }, { session });
        }

        const collection = mongoose.connection.collection(Model.collection.name);
        const result = await collection.deleteMany(query, { session });
        
        return result.deletedCount;
    }
}

export default HardDeleteService;
