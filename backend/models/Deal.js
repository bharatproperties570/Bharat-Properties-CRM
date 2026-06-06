import mongoose from "mongoose";
import { invalidateDashboardCache } from "../src/config/redis.js";
import Lookup from "./Lookup.js";
import { calcRatePerUnit, calcOrientationPremium, getAreaUnit } from "../utils/pricingUtils.js";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const resolveLookup = async (type, value) => {
    if (!value) return null;
    
    // Handle objects (populated or passed as objects)
    const val = (value && typeof value === 'object' && value._id) ? value._id : value;
    
    if (mongoose.Types.ObjectId.isValid(val)) return val;
    
    const escapedValue = escapeRegExp(val);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: val });
    }
    return lookup._id;
};

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
    intent: { type: mongoose.Schema.Types.Mixed },

    // Size & Specs
    size: mongoose.Schema.Types.Mixed,
    sizeUnit: String,
    sizeConfig: { type: mongoose.Schema.Types.Mixed, index: true },
    sizeLabel: String,
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

    // ── Pricing Intelligence Fields (Phase 1 — Market Analytics Engine) ──
    // Auto-computed by pricingUtils on deal save / benchmark run
    ratePerUnit: { type: Number, default: null },       // e.g. ₹3,500 per Sq.Yd
    areaUnit: {                                          // Standard unit for this subCategory
        type: String,
        enum: ['PER_SQ_FT', 'PER_SQ_YD', 'PER_KANAL', 'PER_ACRE', 'PER_MARLA'],
        default: null
    },
    orientationScore: { type: Number, default: null, min: 0, max: 100 }, // 0–100 composite
    marketPositioning: {                                 // vs benchmark
        type: String,
        enum: ['undervalued', 'fair', 'overpriced', 'no_data'],
        default: 'no_data'
    },
    closedPrice: { type: Number, default: null },        // Actual registry/closing price (if different from deal.price)


    dealId: String, // SELL-345-2026
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    stage: {
        type: String,
        enum: ['Open', 'Quote', 'Negotiation', 'Booked', 'Closed', 'Cancelled', 'Closed Won', 'Closed Lost', 'Stalled'], // Kept old ones for backward compatibility
        default: 'Open'
    },
    status: { type: mongoose.Schema.Types.Mixed }, // Sub-stage, e.g. Won, Lost, On Hold, Cancelled
    isQualified: { type: Boolean, default: null }, // Tag for Intake Engine
    tags: [{ type: String }],
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

    // status is defined above


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
    department: { type: String, index: true }, // Explicit branch/regional isolation
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignment: {
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
        visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Everyone' },
        history: [{
            assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            assignedAt: { type: Date, default: Date.now },
            notes: String
        }]
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

    // Broker Networking (BNA Phase 2)
    shareableId: { type: String, unique: true, sparse: true }, // Short ID like BP-4521
    broadcastMetadata: {
        title: String,
        description: String,
        price: String, // Can be "Price on Request" or formatted
        location: String,
        images: [String],
        features: [String],
        isReady: { type: Boolean, default: false },
        lastSanitizedAt: Date
    },

    remarks: String,
    description: String,
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
            enum: ['activity', 'manual_override', 'bulk_recalc', 'system', 'import', 'manual_pipeline_override'],
            default: 'system'
        },
        activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
        activityType: { type: String },
        outcome: { type: String },
        triggeredByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String }
    }],
    latitude: { type: String },
    longitude: { type: String },
    geoPoint: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] }
    }
}, { timestamps: true, strict: false });

DealSchema.pre("save", async function (next) {
    // --- Auto-Sync Coordinates from Inventory ---
    if (this.inventoryId && (!this.latitude || !this.longitude)) {
        try {
            // Import dynamically to avoid circular dependencies if any
            const Inventory = mongoose.model('Inventory');
            if (Inventory) {
                const inventory = await Inventory.findById(this.inventoryId).select('latitude longitude lat lng geoPoint');
                if (inventory) {
                    this.latitude = inventory.latitude || inventory.lat || this.latitude;
                    this.longitude = inventory.longitude || inventory.lng || this.longitude;
                    if (inventory.geoPoint) {
                        this.geoPoint = inventory.geoPoint;
                    }
                }
            }
        } catch (err) {
            console.error("Error syncing coordinates from inventory to deal:", err);
        }
    }

    // --- Sync GeoJSON ---
    if (this.latitude && this.longitude) {
        const lat = parseFloat(this.latitude);
        const lng = parseFloat(this.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            this.geoPoint = {
                type: 'Point',
                coordinates: [lng, lat]
            };
        }
    } else if (this.latitude === "" || this.longitude === "") {
        this.geoPoint = undefined;
    }

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

    // Resolve lookups for Mixed fields to prevent CastErrors during population
    const resolveHooks = async () => {
        try {
            this.category = await resolveLookup('Category', this.category);
            this.subCategory = await resolveLookup('SubCategory', this.subCategory);
            this.intent = await resolveLookup('Intent', this.intent);
            this.sizeConfig = await resolveLookup('Size', this.sizeConfig);

            // Phase 2: Compute Pricing Intelligence Fields on Save
            if (this.price > 0 || this.closedPrice > 0) {
                try {
                    let areaValue = this.size?.value || parseFloat(this.size) || 0;
                    let areaUnit = this.size?.unit || this.sizeUnit || 'Sq.Ft.';
                    let subCatStr = '';
                    let facingStr = '', directionStr = '', roadWidthStr = '', orientationStr = '';

                    // Resolve strings for pricingUtils
                    if (this.subCategory) {
                        const subDoc = await Lookup.findById(this.subCategory).select('lookup_value');
                        if (subDoc) subCatStr = subDoc.lookup_value;
                    }
                    
                    if (this.sizeConfig) {
                        const sizeDoc = await Lookup.findById(this.sizeConfig).select('metadata');
                        if (sizeDoc && sizeDoc.metadata && sizeDoc.metadata.totalArea) {
                            areaValue = parseFloat(sizeDoc.metadata.totalArea);
                            areaUnit = sizeDoc.metadata.resultMetric || areaUnit;
                        }
                    }

                    if (this.corner) facingStr = this.corner; // Assuming corner holds the facing value
                    
                    const priceToUse = this.stage === 'Closed' || this.stage === 'Closed Won' ? (this.closedPrice || this.price) : this.price;

                    const rateResult = calcRatePerUnit(priceToUse, areaValue, areaUnit, subCatStr);
                    if (rateResult && rateResult.ratePerUnit > 0) {
                        this.ratePerUnit = rateResult.ratePerUnit;
                        this.areaUnit = rateResult.areaUnit;
                    }

                    const orientationResult = calcOrientationPremium({
                        facing: facingStr,
                        direction: directionStr, // To be populated from Inventory if linked in the future
                        roadWidth: roadWidthStr,
                        orientation: orientationStr
                    });
                    this.orientationScore = orientationResult.orientationScore;

                } catch (calcErr) {
                    console.error("Pricing Intelligence Calculation Error:", calcErr);
                }
            }
        } catch (err) {
            console.error("Lookup resolution error:", err);
        }
    };

    resolveHooks().then(() => next()).catch(next);
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

    // Resolve lookups for Mixed fields in updates
    const resolveAndUpdate = async () => {
        const setUpdate = update.$set || update;
        if (setUpdate.category) setUpdate.category = await resolveLookup('Category', setUpdate.category);
        if (setUpdate.subCategory) setUpdate.subCategory = await resolveLookup('SubCategory', setUpdate.subCategory);
        if (setUpdate.intent) setUpdate.intent = await resolveLookup('Intent', setUpdate.intent);
        if (setUpdate.sizeConfig) setUpdate.sizeConfig = await resolveLookup('Size', setUpdate.sizeConfig);

        // We skip complex pricing calculation in findOneAndUpdate to avoid performance hits on bulk updates.
        // The frontend and aggregate cron job will self-heal or use live calculation. 
        // For accurate pricing intel, it's recommended to use save().
    };

    resolveAndUpdate().then(() => next()).catch(next);
});

DealSchema.post('save', invalidateDashboardCache);
DealSchema.post('findOneAndUpdate', invalidateDashboardCache);
DealSchema.post('findOneAndDelete', invalidateDashboardCache);

// --- PERFORMANCE INDEXES FOR DEALS LIST VIEW ---
DealSchema.index({ isVisible: 1, updatedAt: -1 }); // Default list load sorting
DealSchema.index({ stage: 1, isVisible: 1 }); // Stage filtering
DealSchema.index({ intent: 1 }); // Intent filtering
DealSchema.index({ category: 1 }); // Category filtering
DealSchema.index({ projectId: 1 }); // Project lookup
DealSchema.index({ inventoryId: 1 }); // Inventory mapping
DealSchema.index({ owner: 1 }); // Owner lookup
DealSchema.index({ dealId: 1 }); // Quick search
DealSchema.index({ geoPoint: "2dsphere" });

DealSchema.pre('insertMany', function(next, docs) {
    if (Array.isArray(docs)) {
        docs.forEach(doc => {
            if (doc.latitude && doc.longitude) {
                const lat = parseFloat(doc.latitude);
                const lng = parseFloat(doc.longitude);
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) doc.geoPoint = { type: 'Point', coordinates: [lng, lat] };
            }
        });
    }
    next();
});

export default mongoose.model("Deal", DealSchema);
