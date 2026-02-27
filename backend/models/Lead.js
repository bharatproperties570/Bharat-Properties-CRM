import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema({
    salutation: { type: String, default: "Mr." },
    firstName: { type: String, required: true },
    lastName: { type: String },
    mobile: { type: String, required: true, index: true },
    email: { type: String },
    requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    subRequirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    budget: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    sector: { type: String },
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    subSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    tags: [String],
    description: String,
    status: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    stage: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },

    // Extended Fields for Frontend Alignment
    budgetMin: { type: Number },
    budgetMax: { type: Number },
    areaMin: { type: Number },
    areaMax: { type: Number },
    areaMetric: { type: String },
    propertyType: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    subType: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    unitType: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    facing: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    roadWidth: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    direction: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    purpose: { type: String },
    nri: { type: Boolean },
    funding: { type: String },
    timeline: { type: String },
    furnishing: { type: String },
    transactionType: { type: String },
    projectName: [String],
    locCity: { type: String },
    locArea: { type: String },
    locBlock: [String],
    locPinCode: { type: String },
    locState: { type: String },
    locCountry: { type: String },
    searchLocation: { type: String },

    documents: [{
        documentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }, // Added for hierarchy
        documentName: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        documentType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        documentNo: String,
        projectName: String,
        block: String,
        unitNumber: String,
        documentPicture: String
    }],

    notes: { type: String },
    isContacted: { type: Boolean, default: false },
    assignment: {
        method: String,
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
        visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Everyone' }
    },
    owner: { type: mongoose.Schema.Types.Mixed, ref: 'User' },
    contactDetails: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },

    // Lead Capture & Intelligence
    pre_intent_score: { type: Number, default: 0 },
    source_meta: { type: mongoose.Schema.Types.Mixed }, // UTMs, referrer, etc.
    capture_form: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadForm' },

    // Prospecting & Enrichment Intelligence Fields
    intent_index: { type: Number, default: 0, min: 0, max: 100 },
    lead_classification: { type: String }, // Serious Buyer, Qualified, Explorer, etc.
    role_type: { type: String }, // Buyer, Seller, Investor, etc.
    negotiation_window: { type: Boolean, default: false },
    intent_tags: [String],
    enrichment_last_run: { type: Date },

    customFields: mongoose.Schema.Types.Mixed,

    // ━━ Stage Engine Fields (added for MongoDB integration) ━━━━━━━━━━━━━━━━━━━━
    stageChangedAt: { type: Date, index: true },             // When stage last changed
    lastActivityAt: { type: Date, index: true },             // When last activity logged
    leadScore: { type: Number, default: 0, min: 0, max: 100 }, // Computed lead score
    activityScore: { type: Number, default: 0, min: 0, max: 25 }, // Activity-driven score component

    // Stage History: Full Audit Trail of Stage Changes
    stageHistory: [{
        stage: { type: String, required: true },      // Stage label at time of change
        enteredAt: { type: Date, default: Date.now },     // When this stage was entered
        exitedAt: { type: Date },                        // When exited (null = current)
        daysInStage: { type: Number, default: 0 },         // Computed on exit
        triggeredBy: {
            type: String,
            enum: ['activity', 'manual_override', 'bulk_recalc', 'system', 'import'],
            default: 'activity'
        },
        activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
        activityType: { type: String },                      // 'Call', 'Meeting', 'Site Visit'...
        outcome: { type: String },                      // Outcome string from activity
        triggeredByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String }                       // Human-readable reason
    }]
}, { timestamps: true });

// Virtual for full name
LeadSchema.virtual("fullName").get(function () {
    return `${this.salutation} ${this.firstName} ${this.lastName}`.trim();
});

// Helper to resolve lookup (Find or Create)
const resolveLookupLocal = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const Lookup = mongoose.model('Lookup');
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

// Middleware to resolve lookup names to IDs before saving
LeadSchema.pre('save', async function (next) {
    if (this.requirement && typeof this.requirement === 'string') this.requirement = await resolveLookupLocal('Requirement', this.requirement);
    if (this.subRequirement && typeof this.subRequirement === 'string') this.subRequirement = await resolveLookupLocal('SubRequirement', this.subRequirement);
    if (this.budget && typeof this.budget === 'string') this.budget = await resolveLookupLocal('Budget', this.budget);
    if (this.location && typeof this.location === 'string') this.location = await resolveLookupLocal('Location', this.location);
    if (this.source && typeof this.source === 'string') this.source = await resolveLookupLocal('Source', this.source);
    if (this.subSource && typeof this.subSource === 'string') this.subSource = await resolveLookupLocal('SubSource', this.subSource);
    if (this.campaign && typeof this.campaign === 'string') this.campaign = await resolveLookupLocal('Campaign', this.campaign);
    if (this.status && typeof this.status === 'string') this.status = await resolveLookupLocal('Status', this.status);
    if (this.stage && typeof this.stage === 'string') this.stage = await resolveLookupLocal('Stage', this.stage);

    // Handle arrays
    const arrayFields = ['propertyType', 'subType', 'unitType', 'facing', 'roadWidth', 'direction'];
    const arrayTypes = {
        propertyType: 'PropertyType',
        subType: 'SubType',
        unitType: 'UnitType',
        facing: 'Facing',
        roadWidth: 'RoadWidth',
        direction: 'Direction'
    };

    for (const field of arrayFields) {
        if (Array.isArray(this[field])) {
            this[field] = await Promise.all(this[field].map(val => typeof val === 'string' ? resolveLookupLocal(arrayTypes[field], val) : val));
        }
    }
    next();
});

LeadSchema.pre('findOneAndUpdate', async function (next) {
    const update = this.getUpdate();
    if (!update) return next();

    if (update.requirement && typeof update.requirement === 'string') update.requirement = await resolveLookupLocal('Requirement', update.requirement);
    if (update.subRequirement && typeof update.subRequirement === 'string') update.subRequirement = await resolveLookupLocal('SubRequirement', update.subRequirement);
    if (update.budget && typeof update.budget === 'string') update.budget = await resolveLookupLocal('Budget', update.budget);
    if (update.location && typeof update.location === 'string') update.location = await resolveLookupLocal('Location', update.location);
    if (update.source && typeof update.source === 'string') update.source = await resolveLookupLocal('Source', update.source);
    if (update.subSource && typeof update.subSource === 'string') update.subSource = await resolveLookupLocal('SubSource', update.subSource);
    if (update.campaign && typeof update.campaign === 'string') update.campaign = await resolveLookupLocal('Campaign', update.campaign);
    if (update.status && typeof update.status === 'string') update.status = await resolveLookupLocal('Status', update.status);
    if (update.stage && typeof update.stage === 'string') update.stage = await resolveLookupLocal('Stage', update.stage);

    const arrayTypes = {
        propertyType: 'PropertyType',
        subType: 'SubType',
        unitType: 'UnitType',
        facing: 'Facing',
        roadWidth: 'RoadWidth',
        direction: 'Direction'
    };

    for (const [field, type] of Object.entries(arrayTypes)) {
        if (update[field] && Array.isArray(update[field])) {
            update[field] = await Promise.all(update[field].map(val => typeof val === 'string' ? resolveLookupLocal(type, val) : val));
        }
    }
    next();
});

export default mongoose.model("Lead", LeadSchema);
