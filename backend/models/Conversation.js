import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
});

const conversationSchema = new mongoose.Schema({
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: false, // Make optional for unmatched numbers
        index: true
    },
    contact: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        required: false,
        index: true
    },
    channel: {
        type: String,
        enum: ['whatsapp', 'sms', 'web', 'voice'],
        default: 'whatsapp'
    },
    phoneNumber: {
        type: String,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['active', 'handed_off', 'resolved'],
        default: 'active'
    },
    messages: [messageSchema],
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

export default mongoose.model('Conversation', conversationSchema);
