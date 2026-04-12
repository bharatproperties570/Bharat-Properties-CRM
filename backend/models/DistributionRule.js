import mongoose from "mongoose";

const DistributionRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    entity: { type: String, required: true, enum: ['lead', 'contact', 'deal', 'inventory', 'project', 'company'] },
    logic: { type: String, required: true, enum: ['ROUND_ROBIN', 'LOAD_BASED', 'SKILL_BASED', 'LOCATION_BASED'] },
    isActive: { type: Boolean, default: true },
    conditions: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed
    }],
    assignedAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignedTeams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    fallbackAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    weightage: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model("DistributionRule", DistributionRuleSchema);
