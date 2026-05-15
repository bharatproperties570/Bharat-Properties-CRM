import mongoose from 'mongoose';
import crypto from 'crypto';

const PortfolioSchema = new mongoose.Schema({
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
        inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
        dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' }, // Optional: Link to a specific deal/quote
        addedAt: { type: Date, default: Date.now }
    }],
    token: { type: String, unique: true, index: true }, // Secure shareable token
    title: { type: String, default: 'Curated Property Portfolio' },
    expiryDate: { type: Date },
    isActive: { type: Boolean, default: true },
    
    // Analytics (Enterprise Grade Tracking)
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date },
    views: [{
        viewedAt: { type: Date, default: Date.now },
        ip: String,
        userAgent: String
    }],

    // Customization
    branding: {
        logo: String,
        primaryColor: String,
        agentName: String,
        agentPhone: String
    }
}, { timestamps: true });

// Auto-generate a secure random token before saving
PortfolioSchema.pre('save', function(next) {
    if (!this.token) {
        this.token = crypto.randomBytes(8).toString('hex'); // e.g. "a1b2c3d4e5f6g7h8"
    }
    next();
});

export default mongoose.model('Portfolio', PortfolioSchema);
