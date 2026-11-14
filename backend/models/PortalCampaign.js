import mongoose from 'mongoose';
import softDeletePlugin from '../plugins/softDelete.plugin.js';

const portalCampaignSchema = new mongoose.Schema({
    portal: {
        type: String,
        required: [true, 'Portal name is required'],
        trim: true,
        enum: [
            '99acres',
            'Magicbricks',
            'Housing.com',
            'Olx',
            'SquareYards',
            'NoBroker',
            'CommonFloor',
            'Makaan',
            'Real Estate India',
            'Facebook Marketplace',
            'Other'
        ]
    },
    campaignName: {
        type: String,
        required: [true, 'Campaign or package name is required'],
        trim: true
    },
    packageTier: {
        type: String,
        default: 'Standard Pack',
        trim: true
    },
    focusProject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null
    },
    focusLocation: {
        type: String,
        default: 'Kurukshetra',
        trim: true
    },
    packageCost: {
        type: Number,
        required: [true, 'Package cost is required'],
        min: 0,
        default: 0
    },
    billingCycle: {
        type: String,
        enum: ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME'],
        default: 'MONTHLY'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: [true, 'Campaign expiry date is required']
    },
    targetLeads: {
        type: Number,
        default: 50,
        min: 0
    },
    actualLeads: {
        type: Number,
        default: 0,
        min: 0
    },
    featuredSlotsAllotted: {
        type: Number,
        default: 5,
        min: 0
    },
    featuredSlotsUsed: {
        type: Number,
        default: 0,
        min: 0
    },
    standardSlotsAllotted: {
        type: Number,
        default: 20,
        min: 0
    },
    standardSlotsUsed: {
        type: Number,
        default: 0,
        min: 0
    },
    assignedRep: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'PAUSED', 'EXPIRING_SOON', 'EXPIRED', 'COMPLETED'],
        default: 'ACTIVE'
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

portalCampaignSchema.plugin(softDeletePlugin);

// Indices for performance
portalCampaignSchema.index({ portal: 1, status: 1 });
portalCampaignSchema.index({ endDate: 1 });
portalCampaignSchema.index({ createdAt: -1 });

export default mongoose.model('PortalCampaign', portalCampaignSchema);
