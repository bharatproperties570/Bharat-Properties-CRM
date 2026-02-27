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
    }
}, {
    timestamps: true
});

// Ensure uniqueness for type and value
parsingRuleSchema.index({ type: 1, value: 1, category: 1 }, { unique: true });

export default mongoose.model('ParsingRule', parsingRuleSchema);
