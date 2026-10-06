import mongoose from 'mongoose';
import { getVisibilityFilter } from '../utils/visibility.js';
import Lead from '../models/Lead.js';

export class LeadMutationError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export class LeadMutationService {
    static ALLOWED_FIELDS = ['ai_intent_summary', 'ai_closing_probability'];

    static async executeEnrichmentUpdate(leadId, fields, context) {
        if (!leadId || !fields || !context) {
            throw new LeadMutationError("Missing required parameters: leadId, fields, or context");
        }
        if (!context.actorType || !context.actorId) {
            throw new LeadMutationError("Invalid context: Missing actor identity", 401);
        }

        // 1. Validate Operation & Actor
        // Webhooks shouldn't enrich leads directly via this API in this matrix.
        if (context.actorType === 'WEBHOOK') {
            throw new LeadMutationError("WEBHOOK actor is not authorized for Lead enrichment updates", 403);
        }
        
        // Block WORKER if it cannot prove initiator
        if (context.actorType === 'WORKER') {
            throw new LeadMutationError("WORKER actor missing initiator authority", 403);
        }

        // 2. Validate Allowed Fields
        const updates = {};
        for (const [key, value] of Object.entries(fields)) {
            if (!this.ALLOWED_FIELDS.includes(key)) {
                throw new LeadMutationError(`Unauthorized field mutation: ${key}`, 403);
            }
            updates[key] = value;
        }

        if (Object.keys(updates).length === 0) {
            return { success: true, message: "No fields to update" };
        }

        // 3. Resource Authorization
        let query = { _id: leadId };

        if (context.actorType === 'HUMAN_USER') {
            const User = mongoose.model('User');
            const user = await User.findById(context.actorId).lean();
            if (!user) throw new LeadMutationError("User not found", 401);
            
            const visFilter = await getVisibilityFilter(user);
            query = { $and: [query, visFilter] };
        } else if (context.actorType === 'SYSTEM') {
            // SYSTEM actor has global scope for enrichment
            // Idempotency: For enrichment, it's an overwrite, which is idempotent by nature.
        } else {
            throw new LeadMutationError(`Unsupported actor type: ${context.actorType}`, 403);
        }

        // 4. Perform Atomic Update
        const lead = await Lead.findOneAndUpdate(
            query,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!lead) {
            const exists = await Lead.exists({ _id: leadId });
            if (!exists) throw new LeadMutationError("Lead not found", 404);
            throw new LeadMutationError("Target inaccessible or unauthorized", 403);
        }

        return { success: true, lead };
    }
}
