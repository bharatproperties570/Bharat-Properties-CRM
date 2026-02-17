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
    location: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lookup'
    },
    category: {
        type: String,
        required: true,
        index: true
    },
    subCategory: {
        type: String,
        required: true,
        index: true
    },
    rate: {
        type: Number,
        required: true
    },
    rateApplyOn: {
        type: String,
        enum: ['Land Area', 'Built-up Area', 'Land + Built-up'],
        required: true
    },
    rateUnit: {
        type: String,
        enum: ['Sq Yard', 'Sq Meter', 'Sq Ft', 'Acre', 'Kanal'],
        required: true
    },
    roadMultipliers: [{
        roadType: String,
        multiplier: Number
    }],
    floorMultipliers: [{
        floorType: String,
        multiplier: Number
    }],
    effectiveFrom: {
        type: Date,
        required: true
    },
    effectiveTo: {
        type: Date
    },
    versionNo: {
        type: String
    },
    constructionRateSqFt: {
        type: Number
    },
    constructionRateSqYard: {
        type: Number
    },
    configName: {
        type: String,
        required: true
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

// Create a compound unique index to prevent duplicate entries for the same location, category, subCategory, and configuration
collectorRateSchema.index({ state: 1, district: 1, tehsil: 1, location: 1, category: 1, subCategory: 1, configName: 1, effectiveFrom: 1 }, { unique: true });

export default mongoose.model('CollectorRate', collectorRateSchema);
