import mongoose from 'mongoose';

const marketingContentSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Content title is required'],
        trim: true
    },
    content: {
        type: String,
        required: [true, 'Content body/caption is required']
    },
    platform: {
        type: String,
        required: [true, 'Platform is required'],
        enum: ['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'WhatsApp', 'Email', 'Both', 'Portal', 'Other'],
        default: 'Other'
    },
    type: {
        type: String,
        enum: ['ct-project', 'ct-edu', 'ct-trust', 'ct-festival', 'ct-event', 'other'],
        default: 'ct-project'
    },
    date: {
        type: String, // Stored as YYYY-MM-DD to match frontend calendar expectations
        required: true
    },
    time: {
        type: String, // Stored as HH:mm
        default: '19:00'
    },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'published', 'failed'],
        default: 'draft'
    },
    dealId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Deal'
    },
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    metadata: {
        tokens: Number,
        provider: String,
        model: String,
        aiAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiAgent' }
    },
    mediaUrls: [String],
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexing for calendar queries
marketingContentSchema.index({ date: 1, status: 1 });
marketingContentSchema.index({ dealId: 1 });

export default mongoose.model('MarketingContent', marketingContentSchema);
