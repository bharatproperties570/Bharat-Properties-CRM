import mongoose from 'mongoose';

const campaignRunSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MarketingCampaign',
        required: [true, 'Campaign reference is required'],
        index: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'CANCELLED', 'FAILED'],
        default: 'PENDING'
    },
    idempotencyKey: {
        type: String,
        unique: true,
        sparse: true, // Allow legacy runs to exist without an idempotency key
        description: 'Execution-level idempotency key to prevent duplicate BullMQ enqueues'
    },
    jobId: {
        type: String,
        index: true // Optional link to BullMQ
    },
    audienceQuery: {
        type: mongoose.Schema.Types.Mixed,
        description: 'The filters or criteria used to select the audience'
    },
    targetCount: {
        type: Number,
        default: 0
    },
    execution: {
        jobId: String,
        attempt: Number,
        ownerState: {
            type: String,
            enum: ['ACTIVE', 'TERMINAL']
        },
        outcome: {
            type: String,
            enum: ['completed', 'failed', null],
            default: null
        },
        startedAt: Date,
        terminalAt: Date
    }
}, {
    timestamps: true
});

// For finding the latest runs of a campaign
campaignRunSchema.index({ campaignId: 1, createdAt: -1 });
// For looking up a run by BullMQ job id
campaignRunSchema.index({ jobId: 1 });

export default mongoose.model('CampaignRun', campaignRunSchema);
