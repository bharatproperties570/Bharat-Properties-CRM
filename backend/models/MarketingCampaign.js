import mongoose from 'mongoose';
import softDeletePlugin from '../plugins/softDelete.plugin.js';

const marketingCampaignSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Campaign name is required'],
        trim: true
    },
    status: {
        type: String,
        enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'],
        default: 'DRAFT'
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Campaign owner is required'],
        index: true
    },
    budget: {
        type: Number,
        default: 0,
        min: 0
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    objectives: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

marketingCampaignSchema.plugin(softDeletePlugin);

// For querying active campaigns quickly
marketingCampaignSchema.index({ status: 1, startDate: 1 });

export default mongoose.model('MarketingCampaign', marketingCampaignSchema);
