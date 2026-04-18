import mongoose from "mongoose";

const ProjectSchema = new mongoose.Schema({
    // Basic Info
    name: { type: String, required: true, unique: true, index: true },
    developerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    developerName: String,
    isJointVenture: { type: Boolean, default: false },
    secondaryDeveloper: String,
    reraNumber: String,
    description: String,
    category: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    subCategory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],

    // Project Stats
    landArea: String,
    landAreaUnit: String,
    totalBlocks: String,
    totalFloors: String,
    totalUnits: String,
    status: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },

    // Dates
    launchDate: Date,
    expectedCompletionDate: Date,
    possessionDate: Date,

    parkingType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    unitType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    approvedBank: String,

    // System Details
    owner: { type: mongoose.Schema.Types.Mixed, ref: 'User', index: true },
    assign: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    visibleTo: String,
    
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

    // Location
    locationSearch: String,
    latitude: String,
    longitude: String,
    address: {
        hNo: String,
        street: String,
        locality: String,
        location: String,
        area: String,
        country: { type: String, default: 'India' },
        state: String,
        city: String,
        tehsil: String,
        postOffice: String,
        pincode: String
    },

    // Documents & Media
    projectDocuments: [{
        documentName: String,
        documentCategory: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        documentType: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        approvalAuthority: String,
        registrationNo: String,
        documentNumber: String,
        date: Date,
        url: String
    }],
    projectImages: [{
        title: String,
        category: String,
        path: String,
        url: String
    }],
    projectVideos: [{
        title: String,
        type: { type: String },
        url: String
    }],

    // Amenities
    amenities: {
        type: Map,
        of: Boolean
    },

    // Blocks
    blocks: [{
        name: String,
        floors: String,
        units: String,
        status: String,
        landArea: String,
        landAreaUnit: String,
        parkingType: String,
        launchDate: Date,
        expectedCompletionDate: Date,
        possessionDate: Date
    }],

    // Pricing
    pricing: {
        pricingType: String,
        unitPrices: [{
            block: String,
            subCategory: String,
            areaType: String,
            size: String,
            price: String
        }],
        basePrice: {
            amount: String,
            unit: String
        },
        masterCharges: [{
            id: String,
            name: String,
            category: String,
            basis: String,
            amount: String,
            gstEnabled: Boolean
        }],
        paymentPlans: [{
            name: String,
            type: { type: String },
            milestones: [{
                name: String,
                percentage: String,
                stage: String
            }]
        }]
    }
}, { timestamps: true });

// Middleware to recursively convert empty strings to null
const sanitizeData = (obj) => {
    if (!obj || typeof obj !== "object") return;

    for (const key in obj) {
        // Skip internal mongoose properties and methods
        if (key.startsWith('$') || key.startsWith('_')) continue;

        if (obj[key] === "") {
            obj[key] = null;
        } else if (obj[key] && typeof obj[key] === "object") {
            // Avoid circular references and deep recursion by limiting to own properties
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                sanitizeData(obj[key]);
            }
        }
    }
};

// Helper to resolve lookup (Find or Create)
const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const resolveLookupLocal = async (type, value) => {
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
ProjectSchema.pre('save', async function (next) {
    sanitizeData(this);
    if (this.status && typeof this.status === 'string') this.status = await resolveLookupLocal('ProjectStatus', this.status);
    if (this.parkingType && typeof this.parkingType === 'string') this.parkingType = await resolveLookupLocal('ParkingType', this.parkingType);
    if (this.unitType && typeof this.unitType === 'string') this.unitType = await resolveLookupLocal('UnitType', this.unitType);

    // Handle arrays
    if (Array.isArray(this.category)) {
        this.category = await Promise.all(this.category.map(val => typeof val === 'string' ? resolveLookupLocal('Category', val) : val));
    }
    if (Array.isArray(this.subCategory)) {
        this.subCategory = await Promise.all(this.subCategory.map(val => typeof val === 'string' ? resolveLookupLocal('SubCategory', val) : val));
    }

    // Standardize Multi-Team visibility
    if (Array.isArray(this.team) && this.team.length > 0 && (!this.teams || this.teams.length === 0)) {
        this.teams = this.team;
    } else if (Array.isArray(this.teams) && this.teams.length > 0 && (!this.team || this.team.length === 0)) {
        this.team = this.teams;
    }

    next();
});

ProjectSchema.pre('findOneAndUpdate', async function (next) {
    const update = this.getUpdate();
    if (!update) return next();
    sanitizeData(update);

    if (update.status && typeof update.status === 'string') update.status = await resolveLookupLocal('ProjectStatus', update.status);
    if (update.parkingType && typeof update.parkingType === 'string') update.parkingType = await resolveLookupLocal('ParkingType', update.parkingType);
    if (update.unitType && typeof update.unitType === 'string') update.unitType = await resolveLookupLocal('UnitType', update.unitType);

    if (update.category && Array.isArray(update.category)) {
        update.category = await Promise.all(update.category.map(val => typeof val === 'string' ? resolveLookupLocal('Category', val) : val));
    }
    if (update.subCategory && Array.isArray(update.subCategory)) {
        update.subCategory = await Promise.all(update.subCategory.map(val => typeof val === 'string' ? resolveLookupLocal('SubCategory', val) : val));
    }
    next();
});

export default mongoose.model("Project", ProjectSchema);
