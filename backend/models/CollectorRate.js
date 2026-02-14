import mongoose from 'mongoose';

const collectorRateSchema = new mongoose.Schema({
    state: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lookup',
        required: true
    },
    district: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lookup',
        required: true
    },
    tehsil: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lookup'
    },
    category: {
        type: String,
        enum: ['Residential', 'Commercial', 'Industrial', 'Institutional', 'Agriculture'],
        required: true
    },
    rate: {
        type: Number,
        required: true
    },
    unit: {
        type: String,
        default: 'sqft' // Future proofing for acres/hectares etc
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Compound index to prevent duplicates for the same location + category
collectorRateSchema.index({ state: 1, district: 1, tehsil: 1, category: 1 }, { unique: true });

export default mongoose.model('CollectorRate', collectorRateSchema);
