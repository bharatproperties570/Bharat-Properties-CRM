import mongoose from "mongoose";

const DealSchema = new mongoose.Schema({
    projectName: String,
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    block: String,
    unitNo: String,
    unitType: String,
    propertyType: String,
    category: { type: mongoose.Schema.Types.Mixed },
    subCategory: { type: mongoose.Schema.Types.Mixed },
    location: String,
    intent: String,

    // Size & Specs
    size: mongoose.Schema.Types.Mixed,
    sizeUnit: String,
    corner: String,

    // Pricing
    price: Number,
    quotePrice: Number,
    pricingMode: { type: String, enum: ['Total', 'Rate'], default: 'Total' },
    ratePrice: Number,
    quoteRatePrice: Number,
    priceInWords: String,
    quotePriceInWords: String,
    pricingNature: {
        negotiable: { type: Boolean, default: false },
        fixed: { type: Boolean, default: false }
    },

    status: { type: String, default: 'Open' },


    dealType: { type: String, default: 'Warm' },
    transactionType: { type: String, default: 'Full White' },

    flexiblePercentage: { type: Number, default: 50 },
    source: { type: String, default: 'Walk-in' },


    isOwnerSelected: { type: Boolean, default: false },
    isAssociateSelected: { type: Boolean, default: false },

    publishOn: {
        website: { type: Boolean, default: false },
        facebook: { type: Boolean, default: false },
        instagram: { type: Boolean, default: false },
        whatsapp: { type: Boolean, default: false },
        linkedin: { type: Boolean, default: false },
        x: { type: Boolean, default: false }
    },

    sendMatchedDeal: {
        sms: { type: Boolean, default: false },
        whatsapp: { type: Boolean, default: false },
        email: { type: Boolean, default: false },
        rcs: { type: Boolean, default: false }
    },

    // Contacts (Stored as references for live data)
    owner: { type: mongoose.Schema.Types.Mixed, ref: 'Contact' },
    associatedContact: { type: mongoose.Schema.Types.Mixed, ref: 'Contact' },

    team: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visibleTo: { type: String, default: "Public" },

    remarks: String,
    date: { type: Date, default: Date.now }
}, { timestamps: true, strict: false });

export default mongoose.model("Deal", DealSchema);
