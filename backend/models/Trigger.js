import mongoose from 'mongoose';

const TriggerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    module: {
        type: String,
        required: true,
        enum: ['leads', 'deals', 'activities', 'inventory', 'communication', 'post_sale', 'campaigns']
    },
    event: { type: String, required: true }, // e.g. 'lead_created', 'activity_completed'
    priority: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true },
    conditions: { type: mongoose.Schema.Types.Mixed, default: {} },
    actions: [{
        type: { type: String, required: true }, // 'send_communication', 'start_sequence', 'stop_sequence', 'send_notification', 'fire_automated_action'
        
        // Fields for send_communication
        channel: { type: String, enum: ['whatsapp', 'sms', 'email'] },
        templateId: String,
        
        // Fields for sequence
        sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sequence' },
        
        // Fields for notifications
        target: String, // 'manager', 'owner', 'associatedContact.mobile'
        message: String,
        body: String, // Added fallback field for text contents
        data: mongoose.Schema.Types.Mixed,
        
        // Fields for automated actions
        automatedActionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomatedAction' }
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { timestamps: true });

export default mongoose.model('Trigger', TriggerSchema);
