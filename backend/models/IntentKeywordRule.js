import mongoose from "mongoose";

const IntentKeywordRuleSchema = new mongoose.Schema({
    keyword: { type: String, required: true, index: true },
    autoTag: { type: String, required: true },
    roleType: {
        type: String,
        enum: ['Buyer', 'Seller', 'Investor', 'Developer', 'Direct Owner', 'Bank Auction'],
        required: true
    },
    intentImpact: { type: Number, default: 0 }, // Percentage change (e.g., 15 for +15%)
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("IntentKeywordRule", IntentKeywordRuleSchema);
