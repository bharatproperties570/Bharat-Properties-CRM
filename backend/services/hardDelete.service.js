import mongoose from 'mongoose';

class HardDeleteService {
    static async execute({ modelName, query, user, reason, session }) {
        if (!user) {
            throw new Error('Hard delete requires an authenticated user.');
        }

        // 1. Check Module-Level Delete Permission
        // Map model names to pluralized module names used in Role.moduleAccess
        const moduleMap = {
            'Lead': 'leads', 'Deal': 'deals', 'Contact': 'contacts', 
            'Company': 'companies', 'Inventory': 'inventory', 
            'Project': 'projects', 'Activity': 'activities'
        };
        const moduleName = moduleMap[modelName] || modelName.toLowerCase();
        
        // System owner check inside hasPermission allows bypass, otherwise must have delete right
        if (typeof user.hasPermission === 'function') {
            if (!user.hasPermission(moduleName, 'delete') && user.dataScope !== 'all' && user.email?.toLowerCase() !== 'bharatproperties570@gmail.com') {
                throw new Error(`User lacks 'delete' permission on module: ${moduleName}`);
            }
        } else {
            throw new Error('Invalid user object. Missing hasPermission method.');
        }

        // 2. Check Elevated Hard Delete Permission
        if (user.email?.toLowerCase() !== 'bharatproperties570@gmail.com' && user.dataScope !== 'all') {
            if (!user.role || !user.role.approvalRights || user.role.approvalRights.allowHardDelete !== true) {
                throw new Error('User lacks elevated allowHardDelete approval right.');
            }
        }

        if (!reason || reason.trim().length < 5) {
            throw new Error('Hard delete requires a detailed reason for audit.');
        }

        const Model = mongoose.model(modelName);
        if (!Model) throw new Error(`Model ${modelName} not found.`);

        const targetDocs = await Model.find(query, null, { includeDeleted: true, session });
        if (targetDocs.length === 0) return 0;

        // Use Native Driver to insert audit logs bypassing validation requirements, BUT doing so inside the provided transaction session
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
