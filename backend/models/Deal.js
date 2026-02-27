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

    dealId: String, // SELL-345-2026
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    stage: {
        type: String,
        enum: ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed', 'Cancelled', 'Closed Won', 'Closed Lost', 'Stalled'],
        default: 'Open'
    },
    dealProbability: { type: Number, default: 50 },

    // Financials & Pricing Panels
    offerHistory: [{
        date: { type: Date, default: Date.now },
        offerBy: String,
        amount: Number,
        counterAmount: Number,
        status: String,
        remarks: String
    }],

    negotiationRounds: [{
        round: Number,
        buyerOffer: Number,
        ownerCounter: Number,
        adjustment: Number,
        final: Number
    }],

    // Revenue Engine
    commission: {
        brokeragePercent: { type: Number, default: 0 },
        expectedAmount: { type: Number, default: 0 },
        actualAmount: { type: Number, default: 0 },
        internalSplit: {
            listingRM: { type: Number, default: 0 },
            closingRM: { type: Number, default: 0 },
            company: { type: Number, default: 0 }
        },
        channelPartnerShare: { type: Number, default: 0 }
    },

    financialDetails: {
        token: { amount: Number, date: Date, status: String },
        agreement: { amount: Number, date: Date, status: String },
        registry: { amount: Number, date: Date, status: String },
        finalPayment: { amount: Number, date: Date, status: String },

        // Rent/Lease specifics
        securityDeposit: Number,
        monthlyRent: Number,
        lockInMonths: Number,
        escalationPercent: Number,
        leaseTermMonths: Number
    },

    // Party Structure
    partyStructure: {
        owner: { type: mongoose.Schema.Types.Mixed, ref: 'Contact' },
        buyer: { type: mongoose.Schema.Types.Mixed, ref: 'Contact' },
        channelPartner: { type: mongoose.Schema.Types.Mixed, ref: 'Contact' },
        internalRM: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },

    documents: [{
        name: String,
        type: String, // Agreement, KYC, Receipt, etc.
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],

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

    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visibleTo: { type: String, default: "Public" },

    remarks: String,
    date: { type: Date, default: Date.now },
    isVisible: { type: Boolean, default: true },
    closingDetails: {
        isClosed: { type: Boolean, default: false },
        closingDate: Date,
        checklist: {
            noc: { type: Boolean, default: false },
            originalDocuments: { type: Boolean, default: false },
            keysHandedOver: { type: Boolean, default: false },
            finalPaymentReceived: { type: Boolean, default: false }
        },
        feedbackStatus: {
            buyerContacted: { type: Boolean, default: false },
            sellerContacted: { type: Boolean, default: false }
        },
        remarks: String
    },
    negotiation_window: { type: Boolean, default: false },

    // ━━ Stage Engine Fields (MongoDB integration) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    stageChangedAt: { type: Date, index: true },
    lastActivityAt: { type: Date, index: true },
    stageSyncReason: { type: String },   // Reason populated by syncDealStage

    // Stage History: Full Audit Trail
    stageHistory: [{
        stage: { type: String, required: true },
        enteredAt: { type: Date, default: Date.now },
        exitedAt: { type: Date },
        daysInStage: { type: Number, default: 0 },
        triggeredBy: {
            type: String,
            enum: ['activity', 'manual_override', 'bulk_recalc', 'system', 'import'],
            default: 'system'
        },
        activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
        activityType: { type: String },
        outcome: { type: String },
        triggeredByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String }
    }]
}, { timestamps: true, strict: false });

export default mongoose.model("Deal", DealSchema);
