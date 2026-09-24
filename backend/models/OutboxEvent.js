import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const OutboxEventSchema = new mongoose.Schema({
    eventId: { 
        type: String, 
        required: true, 
        unique: true, 
        default: () => uuidv4() 
    },
    eventType: { 
        type: String, 
        required: true,
        enum: ['LeadCreated', 'DealCreated', 'LeadReassignmentRequested', 'DealUpdated']
    },
    aggregateType: { 
        type: String, 
        required: true,
        enum: ['Lead', 'Deal'] 
    },
    aggregateId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true 
    },
    payload: { 
        type: mongoose.Schema.Types.Mixed, 
        required: true 
    },
    correlationId: { 
        type: String, 
        required: false 
    },
    status: { 
        type: String, 
        required: true,
        enum: ['PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'],
        default: 'PENDING'
    },
    attempts: { 
        type: Number, 
        required: true,
        default: 0
    },
    availableAt: { 
        type: Date, 
        required: true,
        default: Date.now 
    },
    lockedUntil: { 
        type: Date, 
        required: false 
    },
    lockedBy: { 
        type: String, 
        required: false 
    },
    publishedAt: { 
        type: Date, 
        required: false 
    },
    lastError: { 
        type: String, 
        required: false 
    }
}, { timestamps: true });

OutboxEventSchema.index({ status: 1, availableAt: 1 });
OutboxEventSchema.index({ status: 1, lockedUntil: 1 });
OutboxEventSchema.index({ aggregateType: 1, aggregateId: 1 });

const OutboxEvent = mongoose.model('OutboxEvent', OutboxEventSchema);

export default OutboxEvent;
