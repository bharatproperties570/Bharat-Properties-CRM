import mongoose from "mongoose";
import { invalidateDashboardCache } from "../src/config/redis.js";

const DealSchema = new mongoose.Schema({
    projectName: String,
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    block: String,
    unitNo: String,
    unitType: String,
    propertyType: String,
    category: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    subCategory: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    location: String,
    intent: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },

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
    status: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    dealProbability: { type: Number, default: 50 },
    dealScore: { type: Number, default: 0, min: 0, max: 100 },

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
        date: { type: Date, default: Date.now },
        offerBy: String,
        buyerOffer: Number,
        ownerCounter: Number,
        status: { type: String, default: 'Active' },
        notes: String,
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


    dealType: { type: String, default: 'Registry case' },
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

    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignment: {
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
        visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Everyone' }
    },
    visibleTo: { type: String, default: "Public" },
    
    // Website Integration
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    websiteMetadata: {
        title: String,
        slug: { type: String, unique: true, sparse: true },
        description: String,
        featuredImage: String,
        tags: [String],
        metaTitle: String,
        metaDescription: String
    },

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
        remarks: String,
        lossReasons: [String]
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
    }],
    latitude: { type: String },
    longitude: { type: String }
}, { timestamps: true, strict: false });

DealSchema.pre("save", function (next) {
    // --- Assignment & Visibility Synchronization ---
    const primaryRM = this.assignedTo || this.assignment?.assignedTo;
    if (primaryRM) {
        const primaryRMId = (typeof primaryRM === 'string' && mongoose.Types.ObjectId.isValid(primaryRM))
            ? new mongoose.Types.ObjectId(primaryRM)
            : primaryRM;

        this.assignedTo = primaryRMId;
        if (!this.assignment) this.assignment = {};
        this.assignment.assignedTo = primaryRMId;
    }

    // Standardize Multi-Team visibility
    const primaryTeams = this.teams || this.team || this.assignment?.team;
    if (primaryTeams) {
        let castedTeams = [];
        if (Array.isArray(primaryTeams)) {
            castedTeams = primaryTeams.map(t => (typeof t === 'string' && mongoose.Types.ObjectId.isValid(t)) ? new mongoose.Types.ObjectId(t) : t);
        } else {
            const t = (typeof primaryTeams === 'string' && mongoose.Types.ObjectId.isValid(primaryTeams)) ? new mongoose.Types.ObjectId(primaryTeams) : primaryTeams;
            castedTeams = [t];
        }

        if (castedTeams.length > 0) {
            this.teams = castedTeams;
            this.team = castedTeams[0];
            if (!this.assignment) this.assignment = {};
            this.assignment.team = castedTeams;
        }
    }

    next();
});

DealSchema.pre('findOneAndUpdate', async function (next) {
    const update = this.getUpdate();
    if (!update) return next();

    // Sync assignment fields in updates
    const primaryRM = update.assignedTo || (update.assignment && update.assignment.assignedTo) || (update['assignment.assignedTo']);
    if (primaryRM) {
        const primaryRMId = (typeof primaryRM === 'string' && mongoose.Types.ObjectId.isValid(primaryRM))
            ? new mongoose.Types.ObjectId(primaryRM)
            : primaryRM;

        update.assignedTo = primaryRMId;
        if (update.assignment) update.assignment.assignedTo = primaryRMId;
        update['assignment.assignedTo'] = primaryRMId;
    }

    // Sync team fields in updates
    const primaryTeams = update.teams || update.team || (update.assignment && update.assignment.team) || update['assignment.team'];
    if (primaryTeams) {
        let castedTeams = [];
        if (Array.isArray(primaryTeams)) {
            castedTeams = primaryTeams.map(t => (typeof t === 'string' && mongoose.Types.ObjectId.isValid(t)) ? new mongoose.Types.ObjectId(t) : t);
        } else {
            const t = (typeof primaryTeams === 'string' && mongoose.Types.ObjectId.isValid(primaryTeams)) ? new mongoose.Types.ObjectId(primaryTeams) : primaryTeams;
            castedTeams = [t];
        }

        if (castedTeams.length > 0) {
            update.teams = castedTeams;
            update.team = castedTeams[0];
            if (update.assignment) update.assignment.team = castedTeams;
            update['assignment.team'] = castedTeams;
        }
    }

    next();
});

DealSchema.post('save', invalidateDashboardCache);
DealSchema.post('findOneAndUpdate', invalidateDashboardCache);
DealSchema.post('findOneAndDelete', invalidateDashboardCache);

export default mongoose.model("Deal", DealSchema);
