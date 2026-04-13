import mongoose from "mongoose";
import { invalidateDashboardCache } from "../src/config/redis.js";
import { normalizePhone } from "../utils/normalization.js";

const LeadSchema = new mongoose.Schema({
    salutation: { type: String, default: "Mr." },
    firstName: { type: String, required: true },
    lastName: { type: String },
    mobile: { type: String, required: true, index: true, unique: true },
    email: { type: String, unique: true, sparse: true },
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
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
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
    enrichment_formula_score: { type: Number, default: null }, // Step 1 formula-only score (no activities — prevents double-counting)
    lead_classification: { type: String }, // Serious Buyer, Qualified, Explorer, etc.
    role_type: { type: String }, // Buyer, Seller, Investor, etc.
    negotiation_window: { type: Boolean, default: false },
    intent_tags: [String],
    enrichment_last_run: { type: Date },

    customFields: mongoose.Schema.Types.Mixed,

    // ━━ Stage Engine Fields (added for MongoDB integration) ━━━━━━━━━━━━━━━━━━━━
    stageChangedAt: { type: Date, index: true },             // When stage last changed
    lastActivityAt: { type: Date },             // When last activity logged (Indexed below)

    // ━━ Unified Scoring Fields — written ONLY by LeadScoringService.js ━━━━━━━
    leadScore: { type: Number, default: 0, min: 0, max: 100 }, // Final authoritative score (backend-only)
    activityScore: { type: Number, default: 0, min: 0, max: 100 }, // Activity-driven component (no double-count with enrichment)
    decay_score: { type: Number, default: 0, min: 0, max: 50 }, // Accumulated inactivity penalty (cron-managed, NOT intent_index)
    scoreBreakdown: { type: mongoose.Schema.Types.Mixed, default: null }, // Explainability: { staticBase, activityScore, sourceScore, fitScore, decayPenalty, stageMultiplier, temperature, intent }
    ai_intent_summary: { type: String },
    ai_closing_probability: { type: Number, min: 0, max: 100 },

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
    }],
    interestedInventory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' }],
}, { timestamps: true });

// ━━ PERFORMANCE INDEXES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// owner + stage + updatedAt: covers team/owner filter on leads list page
LeadSchema.index({ owner: 1, stage: 1, updatedAt: -1 });
// teams + stage: Optimized multi-team visibility
LeadSchema.index({ teams: 1, stage: 1 });
// assignment.team + stage: covers team-filtered lead queries (Legacy)
LeadSchema.index({ 'assignment.team': 1, stage: 1 });
// assignment.assignedTo + updatedAt: covers assigned-to filter
LeadSchema.index({ 'assignment.assignedTo': 1, updatedAt: -1 });
// lastActivityAt: used in NFA (No Future Activity) dashboard metric
LeadSchema.index({ lastActivityAt: 1 });
// mobile + email: fast duplicate detection
LeadSchema.index({ mobile: 1, email: 1 });

// Virtual for full name
LeadSchema.virtual("fullName").get(function () {
    return `${this.salutation} ${this.firstName} ${this.lastName}`.trim();
});

// Helper to resolve lookup (Find or Create)
const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const resolveLeadLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const Lookup = mongoose.model('Lookup');
    const escapedValue = escapeRegExp(value);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};



// Middleware to resolve lookup names to IDs before saving
LeadSchema.pre('save', async function (next) {
    // Normalize mobile number
    if (this.mobile) {
        this.mobile = normalizePhone(this.mobile);
    }

    if (this.isNew) {
        const queries = [{ mobile: this.mobile }];
        if (this.email) {
            queries.push({ email: this.email });
        }

        const existingLead = await mongoose.model('Lead').findOne({ $or: queries });

        if (existingLead) {
            existingLead.intent_index = Math.max(existingLead.intent_index || 0, this.intent_index || 0);
            existingLead.leadScore = Math.max(existingLead.leadScore || 0, this.leadScore || 0);

            if (this.description) {
                existingLead.description = (existingLead.description ? existingLead.description + '\n---\n' : '') + this.description;
            }
            if (this.notes) {
                existingLead.notes = (existingLead.notes ? existingLead.notes + '\n---\n' : '') + this.notes;
            }
            if (this.tags && this.tags.length > 0) {
                existingLead.tags = [...new Set([...(existingLead.tags || []), ...this.tags])];
            }

            existingLead.lastActivityAt = new Date();
            await existingLead.save();

            const err = new Error('DuplicateLeadExists');
            err.isDuplicateMerge = true;
            err.mergedLead = existingLead;
            return next(err);
        }
    }

    // --- Assignment & Visibility Synchronization ---
    const primaryRM = this.owner || this.assignment?.assignedTo;
    if (primaryRM) {
        const primaryRMId = (typeof primaryRM === 'string' && mongoose.Types.ObjectId.isValid(primaryRM))
            ? new mongoose.Types.ObjectId(primaryRM)
            : primaryRM;

        this.owner = primaryRMId;
        if (!this.assignment) this.assignment = {};
        this.assignment.assignedTo = primaryRMId;
    }

    // Standardize Multi-Team visibility
    const primaryTeams = this.teams || this.assignment?.team;
    if (primaryTeams && Array.isArray(primaryTeams) && primaryTeams.length > 0) {
        const castedTeams = primaryTeams.map(t => (typeof t === 'string' && mongoose.Types.ObjectId.isValid(t)) ? new mongoose.Types.ObjectId(t) : t);
        this.teams = castedTeams;
        if (!this.assignment) this.assignment = {};
        this.assignment.team = castedTeams;
    }

    if (this.owner === "") this.owner = null;

    if (this.requirement && typeof this.requirement === 'string') this.requirement = await resolveLeadLookup('Requirement', this.requirement);
    if (this.subRequirement && typeof this.subRequirement === 'string') this.subRequirement = await resolveLeadLookup('SubRequirement', this.subRequirement);
    if (this.budget && typeof this.budget === 'string') this.budget = await resolveLeadLookup('Budget', this.budget);
    if (this.location && typeof this.location === 'string') this.location = await resolveLeadLookup('Location', this.location);
    if (this.source && typeof this.source === 'string') this.source = await resolveLeadLookup('Source', this.source);
    if (this.subSource && typeof this.subSource === 'string') this.subSource = await resolveLeadLookup('SubSource', this.subSource);
    if (this.campaign && typeof this.campaign === 'string') this.campaign = await resolveLeadLookup('Campaign', this.campaign);
    if (this.status && typeof this.status === 'string') this.status = await resolveLeadLookup('Status', this.status);
    if (this.stage && typeof this.stage === 'string') this.stage = await resolveLeadLookup('Stage', this.stage);
    if (this.salutation && typeof this.salutation === 'string') this.salutation = await resolveLeadLookup('Title', this.salutation);

    // Handle arrays
    const arrayFields = ['propertyType', 'subType', 'unitType', 'facing', 'roadWidth', 'direction'];
    const arrayTypes = {
        propertyType: 'Category',
        subType: 'SubCategory',
        unitType: 'UnitType',
        facing: 'Facing',
        roadWidth: 'RoadWidth',
        direction: 'Direction'
    };

    for (const field of arrayFields) {
        if (Array.isArray(this[field])) {
            this[field] = await Promise.all(this[field].map(val => typeof val === 'string' ? resolveLeadLookup(arrayTypes[field], val) : val));
        }
    }

    next();
});

LeadSchema.pre('findOneAndUpdate', async function (next) {
    const update = this.getUpdate();
    if (!update) return next();

    // Sync assignment fields in updates
    const primaryRM = update.owner || (update.assignment && update.assignment.assignedTo) || (update['assignment.assignedTo']);
    if (primaryRM) {
        const primaryRMId = (typeof primaryRM === 'string' && mongoose.Types.ObjectId.isValid(primaryRM))
            ? new mongoose.Types.ObjectId(primaryRM)
            : primaryRM;

        update.owner = primaryRMId;
        if (update.assignment) update.assignment.assignedTo = primaryRMId;
        update['assignment.assignedTo'] = primaryRMId;
    }

    // Sync team fields in updates
    const primaryTeams = update.teams || (update.assignment && update.assignment.team) || update['assignment.team'];
    if (primaryTeams && Array.isArray(primaryTeams)) {
        const castedTeams = primaryTeams.map(t => (typeof t === 'string' && mongoose.Types.ObjectId.isValid(t)) ? new mongoose.Types.ObjectId(t) : t);
        update.teams = castedTeams;
        if (update.assignment) update.assignment.team = castedTeams;
        update['assignment.team'] = castedTeams;
    }

    if (update.owner === "") update.owner = null;

    if (update.requirement && typeof update.requirement === 'string') update.requirement = await resolveLeadLookup('Requirement', update.requirement);
    if (update.subRequirement && typeof update.subRequirement === 'string') update.subRequirement = await resolveLeadLookup('SubRequirement', update.subRequirement);
    if (update.budget && typeof update.budget === 'string') update.budget = await resolveLeadLookup('Budget', update.budget);
    if (update.location && typeof update.location === 'string') update.location = await resolveLeadLookup('Location', update.location);
    if (update.source && typeof update.source === 'string') update.source = await resolveLeadLookup('Source', update.source);
    if (update.subSource && typeof update.subSource === 'string') update.subSource = await resolveLeadLookup('SubSource', update.subSource);
    if (update.campaign && typeof update.campaign === 'string') update.campaign = await resolveLeadLookup('Campaign', update.campaign);
    if (update.status && typeof update.status === 'string') update.status = await resolveLeadLookup('Status', update.status);
    if (update.stage && typeof update.stage === 'string') update.stage = await resolveLeadLookup('Stage', update.stage);
    if (update.salutation && typeof update.salutation === 'string') update.salutation = await resolveLeadLookup('Title', update.salutation);

    const arrayTypes = {
        propertyType: 'Category',
        subType: 'SubCategory',
        unitType: 'UnitType',
        facing: 'Facing',
        roadWidth: 'RoadWidth',
        direction: 'Direction'
    };

    for (const [field, type] of Object.entries(arrayTypes)) {
        if (update[field] && Array.isArray(update[field])) {
            update[field] = await Promise.all(update[field].map(val => typeof val === 'string' ? resolveLeadLookup(type, val) : val));
        }
    }

    next();
});

LeadSchema.post('save', invalidateDashboardCache);
LeadSchema.post('findOneAndUpdate', invalidateDashboardCache);
LeadSchema.post('findOneAndDelete', invalidateDashboardCache);

export default mongoose.model("Lead", LeadSchema);
