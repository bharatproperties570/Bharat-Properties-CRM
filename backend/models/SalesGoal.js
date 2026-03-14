import mongoose from 'mongoose';

const SalesGoalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    month: {
        type: Number,
        required: true, // 0-11
    },
    year: {
        type: Number,
        required: true,
    },
    // The user mentioned a unified form for "teeno goal" (Revenue, Deals, Site Visits)
    revenueGoal: {
        type: Number,
        default: 0
    },
    dealsGoal: {
        type: Number,
        default: 0
    },
    siteVisitsGoal: {
        type: Number,
        default: 0
    },
    period: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
        default: 'monthly'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Ensure one record per user per month/year
SalesGoalSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model('SalesGoal', SalesGoalSchema);
