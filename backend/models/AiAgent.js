import mongoose from 'mongoose';

const aiAgentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Agent name is required'],
        trim: true,
    },
    role: {
        type: String,
        required: [true, 'Agent role is required'],
        enum: ['Sales', 'Support', 'Marketing', 'Analysis', 'General'],
        default: 'General'
    },
    systemPrompt: {
        type: String,
        required: [true, 'System prompt is required to instruct the AI'],
        trim: true
    },
    useCases: [{
        type: String,
        enum: ['whatsapp_live', 'sms_automation', 'voice_calls', 'marketing_campaigns', 'email_drip', 'social_media', 'lead_qualification']
    }],
    memoryAccess: [{
        type: String,
        enum: ['leads', 'inventory', 'deals', 'communications']
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    provider: {
        type: String,
        enum: ['openai', 'anthropic', 'gemini'],
        default: 'openai'
    },
    modelName: {
        type: String,
        default: 'gpt-4o'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

export default mongoose.model('AiAgent', aiAgentSchema);
