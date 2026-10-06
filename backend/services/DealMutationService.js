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

        // 1. Validate Operation & Actor
        // Webhooks and Humans can do this. Systems shouldn't for now based on matrix, but let's be explicit:
        if (context.actorType === 'SYSTEM') {
            throw new DealMutationError("SYSTEM actor is not authorized for Deal verification updates", 403);
        }

        // 2. Validate Allowed Fields
        const updates = {};
        for (const [key, value] of Object.entries(fields)) {
            if (!this.ALLOWED_FIELDS.includes(key)) {
                throw new DealMutationError(`Unauthorized field mutation: ${key}`, 403);
            }
            updates[key] = value;
        }

        if (Object.keys(updates).length === 0) {
            return { success: true, message: "No fields to update" };
        }

        // 3. Resource Authorization & Idempotency (Atomic query)
        let query = { _id: dealId };

        if (context.actorType === 'HUMAN_USER') {
            // Apply existing visibility rules for Humans
            // We need a mock user object to pass to getVisibilityFilter if it's just an actorId
            // The context doesn't have the full user object, but visibility checks role/teams/etc.
            // Wait, getVisibilityFilter needs req.user. We will fetch the user.
            const User = mongoose.model('User');
            const user = await User.findById(context.actorId).lean();
            if (!user) throw new DealMutationError("User not found", 401);
            
            const visFilter = await getVisibilityFilter(user);
            query = { $and: [query, visFilter] };
        } else if (context.actorType === 'WEBHOOK') {
            // Webhooks operate on the globally identified deal, bounded by VERIFICATION scope
            // Must enforce idempotency (prevent replay)
            query.verifiedAt = null; 
        } else if (context.actorType === 'WORKER') {
            // Inherit from context (which we're treating as the initiator for this scope)
            // But we didn't extend context with initiator yet.
            // If it's a worker, we must assume it carries the initiator's authority.
            // Let's check original actorType if it was serialized.
            // Without `initiatorType` explicitly, we might just treat it as SYSTEM or fail.
            // The prompt says "If worker context cannot prove the required authority: BLOCK."
            // For now, if actorType is WORKER and we don't have initiator info, we BLOCK.
            throw new DealMutationError("WORKER actor missing initiator authority", 403);
        } else {
            throw new DealMutationError(`Unsupported actor type: ${context.actorType}`, 403);
        }

        // 4. Perform Atomic Update
        updates.verifiedAt = new Date(); // Server-controlled field
        
        const deal = await Deal.findOneAndUpdate(
            query,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!deal) {
            // Distinguish between not found vs unauthorized vs idempotent skip
            const exists = await Deal.exists({ _id: dealId });
            if (!exists) throw new DealMutationError("Deal not found", 404);
            
            if (context.actorType === 'WEBHOOK') {
                return { success: true, message: "Idempotent NO-OP: Deal already verified or inaccessible" };
            }
            throw new DealMutationError("Target inaccessible or unauthorized", 403);
        }

        // 5. Activity Log (Server Controlled)
        
        await Activity.create({
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
        });


        return { success: true, deal };
    }
}
