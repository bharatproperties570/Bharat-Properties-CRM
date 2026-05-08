import mongoose from "mongoose";

const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const isObjectId = (val) => {
    if (!val) return false;
    if (val instanceof mongoose.Types.ObjectId) return true;
    return typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val);
};

const resolveLookupLocal = async (type, value) => {
    if (!value) return null;
    const Lookup = mongoose.model('Lookup');
    
    if (isObjectId(value)) return new mongoose.Types.ObjectId(value);
    if (typeof value === 'object' && value._id) return new mongoose.Types.ObjectId(value._id.toString());
    
    const escapedValue = escapeRegExp(value);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

const InventorySchema = new mongoose.Schema({

    // Basic Info
    category: { type: mongoose.Schema.Types.Mixed, index: true },
    subCategory: { type: mongoose.Schema.Types.Mixed, index: true },
    unitType: { type: mongoose.Schema.Types.Mixed, index: true },
    sizeConfig: { type: mongoose.Schema.Types.Mixed, index: true },
    project: String,
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },

    projectName: { type: String },
    block: { type: String },
    unitNumber: { type: String },
    unitNo: { type: String },

    // Status & Intent
    intent: [{ type: mongoose.Schema.Types.Mixed, index: true }], // For Sale, For Rent, etc.
    status: { type: mongoose.Schema.Types.Mixed, index: true }, // Available, Sold, etc.

    // Construction Details
    occupationDate: Date,
    possessionStatus: String,
    furnishType: String,
    furnishedItems: String,
    constructionAge: String,
    ageOfConstruction: String,
    builtupDetails: [{
        floor: String,
        cluster: String,
        length: Number,
        width: Number,
        totalArea: Number
    }],


    // Pricing
    price: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },
    rentPrice: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },
    leasePrice: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },
    totalCost: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },
    allInclusivePrice: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },

    // Size & Specs
    size: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    sizeUnit: String,
    sizeType: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true },
    floor: { type: String },
    facing: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    direction: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    roadWidth: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    orientation: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Lookup'
    },
    builtupType: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true },
    ownership: String,

    builtUpArea: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    carpetArea: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    totalSaleableArea: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    length: { type: Number },
    width: { type: Number },
    sizeLabel: String,

    // Location
    city: { type: String, index: true },
    sector: { type: String, index: true },
    address: {
        hNo: String,
        street: String,
        locality: { type: mongoose.Schema.Types.Mixed },
        location: { type: mongoose.Schema.Types.Mixed },
        area: { type: mongoose.Schema.Types.Mixed },
        landmark: String,
        city: { type: mongoose.Schema.Types.Mixed },
        tehsil: { type: mongoose.Schema.Types.Mixed },
        postOffice: { type: mongoose.Schema.Types.Mixed },
        state: { type: mongoose.Schema.Types.Mixed },
        pincode: { type: mongoose.Schema.Types.Mixed },
        country: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', default: 'India' }
    },

    // Ownership & Association
    owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    associates: [{
        contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
        relationship: String
    }],

    // System
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    department: { type: String, index: true }, // Explicit branch/regional isolation
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visibleTo: String,
    tags: { type: String, default: '-' },
    latitude: { type: String },
    longitude: { type: String },

    // Documents & Media
    inventoryDocuments: [{
        documentCategory: String,
        documentName: String,
        documentType: String,
        documentNo: String,
        documentNumber: String,
        linkedContactMobile: String,
        url: String
    }],
    inventoryImages: [{
        title: String,
        category: String,
        url: String
    }],
    inventoryVideos: [{
        title: String,
        type: { type: String },
        url: String
    }],
    // Interaction & Feedback History
    history: [{
        date: { type: Date, default: Date.now },
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        actor: String, // String fallback for external actors or display names
        type: { type: String, default: 'Feedback' }, // Feedback, System, Status Change, etc.
        note: String,
        details: mongoose.Schema.Types.Mixed
    }],
    ownerHistory: [{
        date: { type: Date, default: Date.now },
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        contactName: String,
        contactMobile: String,
        contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
        role: String,
        type: { type: String, enum: ['Added', 'Removed'], default: 'Added' },
        source: String
    }],

    // Feedback & Follow-up Tracking
    followUpDate: { type: Date, index: true },
    lastContactedAt: { type: Date, index: true },

    // Legacy Support (to prevent 400 errors during transition)
    remarks: String,
    lastContactDate: String,
    lastContactUser: String

}, { timestamps: true, strict: true });
 
// ━━ PERFORMANCE INDEXES (Harden for Bulk Operations) ━━━━━━━━━━━━━━━━━━━━━━
// Optimized for Import/Sync deduplication and dashboard visibility
InventorySchema.index({ projectName: 1, block: 1, unitNo: 1 });
InventorySchema.index({ projectName: 1, block: 1, unitNumber: 1 });
InventorySchema.index({ teams: 1, status: 1 });
InventorySchema.index({ assignedTo: 1, status: 1 });
 
// Permanent Fix: Deep Data Integrity Hooks


InventorySchema.pre('save', async function (next) {
    try {
        const resolveAddr = async (type, val) => {
            if (!val) return null;
            if (typeof val === 'object' && val !== null && val._id) val = val._id;
            if (isObjectId(val)) return new mongoose.Types.ObjectId(val);
            return await resolveLookupLocal(type, val);
        };

        if (this.intent !== undefined) {
            this.intent = await Promise.all((Array.isArray(this.intent) ? this.intent : [this.intent]).map(async (val) => {
                if (!val) return null;
                if (isObjectId(val)) return new mongoose.Types.ObjectId(val);
                return await resolveLookupLocal('Intent', val);
            }));
            this.intent = this.intent.filter(Boolean);
        }
        if (this.status !== undefined && !isObjectId(this.status)) {
            this.status = await resolveLookupLocal('Status', this.status);
        }
        if (this.builtupType !== undefined && !isObjectId(this.builtupType)) {
            this.builtupType = await resolveLookupLocal('BuiltupType', this.builtupType);
        }
        if (this.category !== undefined && !isObjectId(this.category)) {
            this.category = await resolveLookupLocal('Category', this.category);
        }
        if (this.subCategory !== undefined && !isObjectId(this.subCategory)) {
            this.subCategory = await resolveLookupLocal('SubCategory', this.subCategory);
        }
        if (this.unitType !== undefined && !isObjectId(this.unitType)) {
            this.unitType = await resolveLookupLocal('UnitType', this.unitType);
        }
        if (this.facing !== undefined && !isObjectId(this.facing)) {
            this.facing = await resolveLookupLocal('Facing', this.facing);
        }
        if (this.direction !== undefined && !isObjectId(this.direction)) {
            this.direction = await resolveLookupLocal('Direction', this.direction);
        }
        if (this.orientation !== undefined && !isObjectId(this.orientation)) {
            this.orientation = await resolveLookupLocal('Orientation', this.orientation);
        }
        if (this.roadWidth !== undefined && !isObjectId(this.roadWidth)) {
            this.roadWidth = await resolveLookupLocal('RoadWidth', this.roadWidth);
        }
        if (this.sizeConfig !== undefined && !isObjectId(this.sizeConfig)) {
            this.sizeConfig = await resolveLookupLocal('Size', this.sizeConfig);
        }

        // --- Address Sanitization ---
        if (this.address) {
            const address = this.address;
            if (address.city) address.city = await resolveAddr('City', address.city);
            if (address.tehsil) address.tehsil = await resolveAddr('Tehsil', address.tehsil);
            if (address.state) address.state = await resolveAddr('State', address.state);
            if (address.postOffice) address.postOffice = await resolveAddr('PostOffice', address.postOffice);
            if (address.country) address.country = await resolveAddr('Country', address.country);
            if (address.locality) address.locality = await resolveAddr('Location', address.locality) || await resolveAddr('Area', address.locality);
            if (address.area) address.area = await resolveAddr('Area', address.area);
            if (address.location) address.location = await resolveAddr('Location', address.location) || await resolveAddr('Area', address.location);
            if (address.pincode) address.pincode = await resolveAddr('Pincode', address.pincode);
        }

        // --- Assignment & Visibility Synchronization ---
        if (this.assignedTo) {
            this.assignedTo = isObjectId(this.assignedTo)
                ? new mongoose.Types.ObjectId(this.assignedTo)
                : this.assignedTo;
        }

        // Standardize Multi-Team visibility
        const rawTeams = this.teams || this.team;
        if (rawTeams) {
            let teamArray = Array.isArray(rawTeams) ? rawTeams : [rawTeams];
            const Team = mongoose.models.Team || mongoose.model('Team');

            
            const resolvedTeams = await Promise.all(teamArray.map(async (t) => {
                if (!t) return null;
                if (isObjectId(t)) return new mongoose.Types.ObjectId(t);
                const teamDoc = await Team.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(t)}$`, 'i') } }).select('_id').lean();
                return teamDoc?._id || null;
            }));

            const filteredTeams = resolvedTeams.filter(Boolean);
            if (filteredTeams.length > 0) {
                this.teams = filteredTeams;
                this.team = filteredTeams[0];
            }
        }


        next();
    } catch (error) {
        next(error);
    }
});

InventorySchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (!update) return next();

        const resolveAddr = async (type, val) => {
            if (!val) return null;
            if (typeof val === 'object' && val !== null && val._id) val = val._id;
            if (isObjectId(val)) return new mongoose.Types.ObjectId(val);
            return await resolveLookupLocal(type, val);
        };

        // Robust Resolver for both top-level and $set/atomic updates
        const processUpdate = async (obj) => {
            if (!obj) return;

            // Sync assignment fields
            if (obj.assignedTo) {
                obj.assignedTo = isObjectId(obj.assignedTo)
                    ? new mongoose.Types.ObjectId(obj.assignedTo)
                    : obj.assignedTo;
            }

            // Sync team fields
            const rawTeams = obj.teams || obj.team;
            if (rawTeams) {
                let teamArray = Array.isArray(rawTeams) ? rawTeams : [rawTeams];
                const Team = mongoose.models.Team || mongoose.model('Team');

                
                const resolvedTeams = await Promise.all(teamArray.map(async (t) => {
                    if (!t) return null;
                    if (isObjectId(t)) return new mongoose.Types.ObjectId(t);
                    const teamDoc = await Team.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(t)}$`, 'i') } }).select('_id').lean();
                    return teamDoc?._id || null;
                }));

                const filteredTeams = resolvedTeams.filter(Boolean);
                if (filteredTeams.length > 0) {
                    obj.teams = filteredTeams;
                    obj.team = filteredTeams[0];
                }
            }


            // Handle intent
            if (obj.intent) {
                const resolveIntent = async (val) => {
                    if (typeof val === 'object' && val !== null && val._id) return val._id;
                    if (isObjectId(val)) return new mongoose.Types.ObjectId(val);
                    return await resolveLookupLocal('Intent', val);
                };
                if (Array.isArray(obj.intent)) {
                    obj.intent = await Promise.all(obj.intent.map(resolveIntent));
                } else {
                    obj.intent = [await resolveIntent(obj.intent)];
                }
            }

            // Handle categorical fields
            const categoricalFields = [
                { field: 'status', type: 'Status' },
                { field: 'category', type: 'Category' },
                { field: 'subCategory', type: 'SubCategory' },
                { field: 'unitType', type: 'UnitType' },
                { field: 'sizeType', type: 'PropertyType' }, // Added sizeType for Configuration
                { field: 'facing', type: 'Facing' },
                { field: 'direction', type: 'Direction' },
                { field: 'orientation', type: 'Orientation' },
                { field: 'roadWidth', type: 'Road Width' },
                { field: 'sizeConfig', type: 'Size' },
                { field: 'builtupType', type: 'BuiltupType' }
            ];

            for (const { field, type } of categoricalFields) {
                if (obj[field]) {
                    if (typeof obj[field] === 'object' && obj[field] !== null && obj[field]._id) obj[field] = obj[field]._id;
                    if (!isObjectId(obj[field])) {
                        obj[field] = await resolveLookupLocal(type, obj[field]);
                    }
                }
            }

            // Address component resolution
            const address = obj.address || {};
            const resolveAddr = async (type, val) => {
                if (!val) return null;
                if (typeof val === 'object' && val !== null && val._id) val = val._id;
                if (isObjectId(val)) return new mongoose.Types.ObjectId(val);
                return await resolveLookupLocal(type, val);
            };

            if (address.city) address.city = await resolveAddr('City', address.city);
            if (address.tehsil) address.tehsil = await resolveAddr('Tehsil', address.tehsil);
            if (address.state) address.state = await resolveAddr('State', address.state);
            if (address.postOffice) address.postOffice = await resolveAddr('PostOffice', address.postOffice);
            if (address.country) address.country = await resolveAddr('Country', address.country);
            if (address.locality) address.locality = await resolveAddr('Location', address.locality) || await resolveAddr('Area', address.locality);
            if (address.area) address.area = await resolveAddr('Area', address.area);
            if (address.location) address.location = await resolveAddr('Location', address.location) || await resolveAddr('Area', address.location);
            if (address.pincode) address.pincode = await resolveAddr('Pincode', address.pincode);

            // Dot notation support
            if (obj['address.city']) obj['address.city'] = await resolveAddr('City', obj['address.city']);
            if (obj['address.tehsil']) obj['address.tehsil'] = await resolveAddr('Tehsil', obj['address.tehsil']);
            if (obj['address.state']) obj['address.state'] = await resolveAddr('State', obj['address.state']);
            if (obj['address.postOffice']) obj['address.postOffice'] = await resolveAddr('PostOffice', obj['address.postOffice']);
            if (obj['address.country']) obj['address.country'] = await resolveAddr('Country', obj['address.country']);
            if (obj['address.locality']) obj['address.locality'] = await resolveAddr('Location', obj['address.locality']) || await resolveAddr('Area', obj['address.locality']);
            if (obj['address.area']) obj['address.area'] = await resolveAddr('Area', obj['address.area']);
            if (obj['address.location']) obj['address.location'] = await resolveAddr('Location', obj['address.location']) || await resolveAddr('Area', obj['address.location']);
            if (obj['address.pincode']) obj['address.pincode'] = await resolveAddr('Pincode', obj['address.pincode']);
        };

        // Process top-level, $set, and other relevant operators
        await processUpdate(update);
        if (update.$set) await processUpdate(update.$set);
        if (update.$setOnInsert) await processUpdate(update.$setOnInsert);

        next();
    } catch (error) {
        next(error);
    }
});

export default mongoose.model("Inventory", InventorySchema);
