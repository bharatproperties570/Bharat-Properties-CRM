import mongoose from 'mongoose';

const SequenceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    purpose: String,
    module: { type: String, default: 'leads' }, // 'leads', 'deals', 'contacts', 'activities', 'inventory'
    isActive: { type: Boolean, default: true },
    active: { type: Boolean, default: true }, // frontend compatibility alias
    linkedTriggers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Trigger' }],
    targetAudience: {
        module: { type: String, default: 'leads' },
        conditions: {
            operator: { type: String, default: 'AND' },
            rules: [mongoose.Schema.Types.Mixed]
        }
    },
    exitCriteria: {
        conditions: {
            operator: { type: String, default: 'OR' },
            rules: [mongoose.Schema.Types.Mixed]
        },
        exitConditions: mongoose.Schema.Types.Mixed // e.g. { onDealCreated, onLost, onStageChange, stageNotOpen }
    },
    businessHours: {
        enabled: { type: Boolean, default: false },
        timezone: { type: String, default: 'Asia/Kolkata' },
        startTime: { type: String, default: '09:00' }, // HH:mm 24h format
        endTime: { type: String, default: '18:00' },
        days: [{ type: Number }] // 0 = Sunday, 1 = Monday, etc. Default [1,2,3,4,5,6] (Mon-Sat)
    },
    steps: [{
        stepId: { type: String }, // UUID for UI tracking
        stepNumber: Number,
        day: Number, // Legacy day index for frontend compatibility
        time: { type: String, default: '09:00' },
        delay: {
            amount: Number, // e.g. 1
            unit: { type: String, enum: ['minutes', 'hourly', 'hours', 'daily', 'days', 'weekly', 'weeks', 'monthly', 'months'], default: 'days' },
            fromEvent: { type: String, default: 'enrollment' } // 'enrollment', 'previous_step'
        },
        executionWindow: {
            startTime: { type: String, default: '10:00' },
            endTime: { type: String, default: '19:00' }
        },
        action: {
            type: { type: String, required: true }, // 'fire_automated_action', 'broadcast_deal', 'send_communication', 'send_whatsapp', 'send_email', 'create_task', 'update_field'
            automatedActionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomatedAction' },
            templateId: String,
            instruction: String,
            data: mongoose.Schema.Types.Mixed
        }
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { timestamps: true });

export default mongoose.model('Sequence', SequenceSchema);
