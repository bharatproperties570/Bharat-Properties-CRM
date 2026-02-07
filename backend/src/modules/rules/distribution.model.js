import mongoose from "mongoose";

const DistributionRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    entity: {
        type: String,
        required: true,
        enum: ['lead', 'contact', 'deal']
    },
    criteria: {
        source: [String],
        location: [String],
        propertyType: [String],
        budgetMin: Number,
        budgetMax: Number,
        customConditions: mongoose.Schema.Types.Mixed
    },
    assignTo: {
        type: String,
        enum: ['user', 'team', 'roundRobin', 'loadBalanced'],
        userId: mongoose.Schema.Types.ObjectId,
        teamId: mongoose.Schema.Types.ObjectId,
        userPool: [mongoose.Schema.Types.ObjectId] // For round robin
    },
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    schedule: {
        enabled: { type: Boolean, default: false },
        days: [String], // ['Monday', 'Tuesday', etc.]
        timeStart: String, // '09:00'
        timeEnd: String // '18:00'
    }
}, { timestamps: true });

// Index for efficient queries
DistributionRuleSchema.index({ entity: 1, active: 1, priority: 1 });

export default mongoose.models.DistributionRule || mongoose.model("DistributionRule", DistributionRuleSchema);
