import mongoose from 'mongoose';

const SequenceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: true },
    targetAudience: {
        module: { type: String, enum: ['leads', 'deals', 'contacts'], required: true },
        conditions: {
            operator: { type: String, default: 'AND' },
            rules: [mongoose.Schema.Types.Mixed]
        }
    },
    exitCriteria: {
        conditions: {
            operator: { type: String, default: 'OR' },
            rules: [mongoose.Schema.Types.Mixed]
        }
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
        delay: {
            amount: Number, // e.g. 1
            unit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'] }, // e.g. 'days'
            fromEvent: { type: String, default: 'enrollment' } // 'enrollment', 'previous_step'
        },
        action: {
            type: { type: String, required: true }, // 'send_email', 'send_whatsapp', 'create_task', 'update_field', 'assign_user'
            templateId: String,
            data: mongoose.Schema.Types.Mixed
        }
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { timestamps: true });

export default mongoose.model('Sequence', SequenceSchema);
