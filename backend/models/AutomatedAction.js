import mongoose from 'mongoose';

const AutomatedActionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: true },
    actionType: { type: String, required: true }, 
    targetModule: { type: String },
    invokedByTrigger: { type: mongoose.Schema.Types.Mixed },
    fieldMapping: mongoose.Schema.Types.Mixed,
    notificationConfig: mongoose.Schema.Types.Mixed,
    matchConstraints: mongoose.Schema.Types.Mixed,
    rollbackPolicy: { type: String, default: 'Manual' },
    type: { type: String }, // kept for backward compatibility if any
    configuration: mongoose.Schema.Types.Mixed, // Stores headers, URLs, field mapping, etc.
    delay: {
        isActive: { type: Boolean, default: false },
        amount: { type: Number, default: 0 },
        unit: { type: String, enum: ['minutes', 'hours', 'days', 'weeks'], default: 'days' },
        relativeToField: { type: String, default: 'dueDate' } // e.g. dueDate, createdAt
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { timestamps: true });

export default mongoose.model('AutomatedAction', AutomatedActionSchema);
