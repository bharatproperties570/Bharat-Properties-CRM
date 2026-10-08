import mongoose from 'mongoose';
import { getVisibilityFilter } from './visibility.js';
import { AppError } from '../src/middlewares/error.middleware.js';

export const authorizeTargetEntity = async (user, entityType, entityId) => {
    if (!user) throw new AppError("Unauthorized: Missing user context", 401);
    if (!entityType || !entityId) throw new AppError("Bad Request: Missing entity reference", 400);

    const modelName = entityType.charAt(0).toUpperCase() + entityType.slice(1).toLowerCase();
    const allowedModels = ['Lead', 'Contact', 'Deal', 'Company', 'Inventory', 'Project'];
    if (!allowedModels.includes(modelName)) {
        throw new AppError(`Forbidden: Unsupported entity type ${modelName}`, 403);
    }

    const Model = mongoose.models[modelName] || mongoose.model(modelName);
    const visibilityFilter = await getVisibilityFilter(user);
    
    const target = await Model.findOne({
        _id: entityId,
        ...visibilityFilter
    }).select('_id').lean();

    if (!target) {
        throw new AppError("Forbidden: Target entity not found or unauthorized", 403);
    }

    return target;
};
