import mongoose from 'mongoose';
import { getVisibilityFilter } from '../utils/visibility.js';
import Deal from '../models/Deal.js';
import Activity from '../models/Activity.js';

export class DealMutationError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export class DealMutationService {
    static ALLOWED_FIELDS = ['stage', 'price', 'projectName'];

    static async executeVerificationUpdate(dealId, fields, context) {
        if (!dealId || !fields || !context) {
            throw new DealMutationError("Missing required parameters: dealId, fields, or context");
        }
        if (!context.actorType || !context.actorId) {
            throw new DealMutationError("Invalid context: Missing actor identity", 401);
        }

        if (context.actorType === 'SYSTEM') {
            throw new DealMutationError("SYSTEM actor is not authorized for Deal verification updates", 403);
        }

        const updates = {};
        const allowedStages = ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed', 'Cancelled', 'Closed Won', 'Closed Lost', 'Stalled'];

        for (const [key, value] of Object.entries(fields)) {
            if (!this.ALLOWED_FIELDS.includes(key)) {
                throw new DealMutationError(`Unauthorized field mutation: ${key}`, 403);
            }
            if (key === 'price') {
                if (typeof value !== 'number' || isNaN(value)) throw new DealMutationError("Invalid price type", 400);
            }
            if (key === 'projectName') {
                if (typeof value !== 'string') throw new DealMutationError("Invalid projectName type", 400);
            }
            if (key === 'stage') {
                if (!allowedStages.includes(value)) throw new DealMutationError("Invalid Deal stage", 400);
            }
            updates[key] = value;
        }

        if (Object.keys(updates).length === 0) {
            return { success: true, message: "No fields to update" };
        }

        let query = { _id: dealId };

        if (context.actorType === 'HUMAN_USER') {
            const User = mongoose.model('User');
            const user = await User.findById(context.actorId).lean();
            if (!user) throw new DealMutationError("User not found", 401);
            
            const visFilter = await getVisibilityFilter(user);
            query = { $and: [query, visFilter] };
        
        } else if (context.actorType === 'WEBHOOK') {
            if (context.targetId !== dealId.toString()) {
                throw new DealMutationError("WEBHOOK context missing required target authorization", 403);
            }
            query.verifiedAt = null; 
        } else if (context.actorType === 'WORKER') {
            throw new DealMutationError("WORKER actor missing initiator authority", 403);
        } else {
            throw new DealMutationError(`Unsupported actor type: ${context.actorType}`, 403);
        }

        updates.verifiedAt = new Date(); 
        
        let deal;
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            deal = await Deal.findOneAndUpdate(
                query,
                { $set: updates },
                { new: true, runValidators: true, session }
            );

            if (!deal) {
                const exists = await Deal.exists({ _id: dealId });
                if (!exists) throw new DealMutationError("Deal not found", 404);
                
                if (context.actorType === 'WEBHOOK') {
                    await session.abortTransaction();
                    session.endSession();
                    return { success: true, message: "Idempotent NO-OP: Deal already verified or inaccessible" };
                }
                throw new DealMutationError("Target inaccessible or unauthorized", 403);
            }

            await Activity.create([{
                subject: 'AI Verification Update',
                type: 'System Note',
                entityType: 'deal',
                entityId: dealId,
                dueDate: new Date(),
                status: 'Completed',
                activityType: 'AI_VERIFICATION',
                details: { updates },
                performedBy: context.actorType === 'HUMAN_USER' ? context.actorId : null,
                systemActor: context.actorType !== 'HUMAN_USER' ? context.actorId : null,
                createdAt: new Date()
            }], { session });

            await session.commitTransaction();
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }

        return { success: true, deal };
    }
}
