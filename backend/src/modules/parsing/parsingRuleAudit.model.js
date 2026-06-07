import mongoose from 'mongoose';

const parsingRuleAuditSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    ruleId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: ['CREATE', 'DELETE']
    },
    oldValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    newValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
}, {
    timestamps: true
});

export default mongoose.model('ParsingRuleAudit', parsingRuleAuditSchema);
