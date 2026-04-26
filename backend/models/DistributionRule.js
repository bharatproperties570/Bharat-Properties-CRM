import mongoose from "mongoose";

const DistributionRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    module: { 
        type: String, 
        required: true, 
        enum: ['leads', 'deals', 'activities', 'campaigns', 'inventory'] 
    },
    triggerEvent: { 
        type: String, 
        required: true, 
        enum: ['onCreate', 'onImport', 'onCampaignIntake', 'onWebCapture', 'onDealCapture', 'onWhatsAppCapture', 'onEmailCapture'] 
    },
    distributionType: { 
        type: String, 
        required: true, 
        enum: ['roundRobin', 'loadBased', 'skillBased', 'locationBased', 'sourceBased', 'scoreBased'] 
    },
    conditions: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed,
        logic: { type: String, default: 'AND' }
    }],
    assignmentTarget: {
        type: { type: String, enum: ['user', 'team'], default: 'user' },
        ids: [{ type: mongoose.Schema.Types.ObjectId, refPath: 'assignmentTarget.type' }],
        weights: { type: Map, of: mongoose.Schema.Types.Mixed }
    },
    fallbackTarget: {
        type: { type: String, enum: ['user', 'team'] },
        id: { type: mongoose.Schema.Types.ObjectId, refPath: 'fallbackTarget.type' }
    },
    reassignmentPolicy: {
        enabled: { type: Boolean, default: false },
        inactivityHours: { type: Number, default: 48 },
        escalateTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    priority: { type: Number, default: 1 },
    lastAssignedIndex: { type: Number, default: -1 } // For Round Robin state persistence
}, { timestamps: true });

export default mongoose.model("DistributionRule", DistributionRuleSchema);
