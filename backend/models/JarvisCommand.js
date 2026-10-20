import mongoose from 'mongoose';

const JarvisCommandSchema = new mongoose.Schema({
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
    sessionId: {
        type: String,
        index: true
    },
    // Input parameters
    inputType: {
        type: String,
        enum: ['voice', 'text'],
        default: 'voice'
    },
    rawAudio: {
        type: String // Storage path or URL if audio payload
    },
    transcript: {
        type: String,
        required: true
    },
    language: {
        type: String,
        enum: ['hi', 'en', 'hinglish'],
        default: 'hinglish'
    },

    // AI Processing Intelligence
    intent: {
        type: String,
        index: true
    },
    params: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    safetyTier: {
        type: Number,
        enum: [1, 2, 3, 4],
        default: 1
    },
    confidence: {
        type: Number,
        default: 100
    },
    llmProvider: {
        type: String,
        default: 'gemini'
    },
    llmLatencyMs: {
        type: Number,
        default: 0
    },

    // Execution Lifecycle
    status: {
        type: String,
        enum: ['executed', 'confirmed', 'cancelled', 'failed', 'pending_confirmation'],
        default: 'executed',
        index: true
    },
    result: {
        type: mongoose.Schema.Types.Mixed
    },
    errorMessage: {
        type: String
    },

    // Response Delivered
    speechResponse: {
        type: String,
        required: true
    },
    displayData: {
        type: mongoose.Schema.Types.Mixed
    },

    // Source & Platform Metadata
    source: {
        type: String,
        enum: ['mobile', 'web'],
        default: 'web'
    },
    deviceInfo: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

JarvisCommandSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('JarvisCommand', JarvisCommandSchema);
