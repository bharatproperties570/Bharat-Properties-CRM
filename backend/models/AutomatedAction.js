import mongoose from 'mongoose';

const AutomatedActionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: true },
    type: { type: String, required: true }, // 'webhook', 'field_update', 'create_task', 'notify_slack'
    configuration: mongoose.Schema.Types.Mixed, // Stores headers, URLs, field mapping, etc.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { timestamps: true });

export default mongoose.model('AutomatedAction', AutomatedActionSchema);
