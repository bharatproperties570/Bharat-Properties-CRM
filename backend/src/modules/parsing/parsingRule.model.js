import mongoose from 'mongoose';

const parsingRuleSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['CITY', 'LOCATION', 'TYPE']
    },
    value: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String, // Required for TYPE (e.g. Residential, Commercial)
        trim: true
    },
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    }
}, {
    timestamps: true
});

// Ensure uniqueness for tenant, type and value
parsingRuleSchema.index({ tenantId: 1, type: 1, value: 1, category: 1 }, { unique: true });

export default mongoose.model('ParsingRule', parsingRuleSchema);
