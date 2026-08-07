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
    steps: [{
        stepNumber: Number,
        delay: {
            amount: Number, // e.g. 1
            unit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'] }, // e.g. 'days'
            fromEvent: { type: String, default: 'enrollment' } // or 'due_date', etc.
        },
        action: {
            type: { type: String, required: true }, // 'send_email', 'send_whatsapp', 'create_task'
            templateId: String,
            data: mongoose.Schema.Types.Mixed
        }
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { timestamps: true });

export default mongoose.model('Sequence', SequenceSchema);
