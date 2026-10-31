import mongoose from 'mongoose';

/**
 * ==============================================================================
 * ChatMessage Model — Enterprise High-Scale Time-Series Storage
 * ──────────────────────────────────────────────────────────────────────────────
 * Stores individual chat messages in a dedicated, indexed collection.
 * Decouples message history from the Conversation document to:
 * 1. Eliminate the 16MB MongoDB BSON document size limit forever.
 * 2. Enable sub-10ms paginated queries for active chat windows.
 * 3. Support 500+ high-throughput WhatsApp groups receiving 720k+ msgs/day.
 * ==============================================================================
 */
const chatMessageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true,
        required: false
    },
    messageId: {
        type: String,
        index: true,
        sparse: true
    },
    remoteJid: {
        type: String,
        index: true,
        required: true
    },
    groupJid: {
        type: String,
        index: true,
        sparse: true,
        default: null
    },
    groupName: {
        type: String,
        default: null,
        trim: true
    },
    isGroup: {
        type: Boolean,
        default: false,
        index: true
    },
    fromMe: {
        type: Boolean,
        default: false
    },
    senderPhone: {
        type: String,
        index: true,
        default: null
    },
    senderName: {
        type: String,
        default: null,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        default: 'user'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    whatsappIntegrationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsAppIntegration',
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'received', 'failed'],
        default: 'received'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { 
    timestamps: true 
});

// 🚀 Enterprise Compound Indexes for high-throughput queries
chatMessageSchema.index({ remoteJid: 1, timestamp: -1 });
chatMessageSchema.index({ groupJid: 1, timestamp: -1 });
chatMessageSchema.index({ conversationId: 1, timestamp: -1 });
chatMessageSchema.index({ senderPhone: 1, timestamp: -1 });
chatMessageSchema.index({ isGroup: 1, timestamp: -1 });
// ⏳ Enterprise Auto-Purge TTL Index (30-day retention to prevent quota exhaustion)
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;
