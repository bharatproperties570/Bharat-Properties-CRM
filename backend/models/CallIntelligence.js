import mongoose from 'mongoose';

const CallIntelligenceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        index: true
    },
    // Call Metadata
    callType: {
        type: String,
        enum: ['INCOMING', 'OUTGOING', 'MISSED', 'UNKNOWN'],
        default: 'INCOMING'
    },
    clientPhone: {
        type: String,
        required: true,
        index: true
    },
    clientName: {
        type: String
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    callStartTime: {
        type: Date
    },
    callEndTime: {
        type: Date,
        default: Date.now
    },

    // Audio & Source
    recordingUrl: {
        type: String
    },
    recordingSource: {
        type: String,
        enum: ['native', 'in_app', 'manual', 'dictation', 'none'],
        default: 'none'
    },

    // Transcription & Extracted Intelligence
    fullTranscript: {
        type: String,
        required: true
    },
    extractedEntities: {
        clientName: { type: String },
        budget: { type: String },
        requirement: { type: String },
        location: { type: String },
        intentScore: { type: Number, default: 50 }, // 0 to 100
        sentiment: { type: String, default: 'Neutral' },
        objections: [{ type: String }],
        keyPhrases: [{ type: String }],
        followUp: {
            date: { type: String },
            time: { type: String },
            type: { type: String },
            notes: { type: String }
        },
        callSummary: { type: String }
    },

    // CRM Links
    linkedLeadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        index: true
    },
    linkedContactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        index: true
    },
    linkedDealId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
    },
    activityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Activity'
    },
    taskId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Activity'
    },

    // Executed Actions Audit
    autoActionsExecuted: [{
        action: { type: String },
        field: { type: String },
        value: { type: mongoose.Schema.Types.Mixed },
        success: { type: Boolean, default: true }
    }],

    status: {
        type: String,
        enum: ['processed', 'pending_review', 'failed'],
        default: 'processed',
        index: true
    },
    userFeedback: {
        type: String,
        enum: ['accurate', 'partially', 'wrong', null],
        default: null
    }
}, {
    timestamps: true
});

CallIntelligenceSchema.index({ clientPhone: 1, createdAt: -1 });

export default mongoose.model('CallIntelligence', CallIntelligenceSchema);
