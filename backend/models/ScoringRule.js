import mongoose from 'mongoose';

const ScoringRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: true },
    module: { type: String, enum: ['leads', 'deals', 'global'], required: true },
    type: { type: String, enum: ['attribute', 'decay', 'source', 'inventory', 'stage', 'band', 'deal_rule', 'condition', 'global_config'], default: 'condition' },
    configuration: mongoose.Schema.Types.Mixed, // Stores JSON configurations for specific rule types
    conditions: {
        operator: { type: String, default: 'AND' },
        rules: [mongoose.Schema.Types.Mixed]
    },
    scoreChange: { type: Number, default: 0 }, // e.g. +10, -5
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { timestamps: true });

export default mongoose.model('ScoringRule', ScoringRuleSchema);
