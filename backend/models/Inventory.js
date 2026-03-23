import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema({
    // Basic Info
    category: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true },
    subCategory: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true },
    unitType: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true },
    sizeConfig: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true },
    project: String,
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },

    projectName: { type: String, index: true },
    block: { type: String, index: true },
    unitNumber: { type: String, index: true },
    unitNo: { type: String, index: true },

    // Status & Intent
    intent: [{ type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true }], // For Sale, For Rent, etc.
    status: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup', index: true }, // Available, Sold, etc.

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
    builtupType: String,
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
        locality: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        location: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        area: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        landmark: String,
        city: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        tehsil: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        postOffice: String,
        state: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        pincode: String,
        country: { type: String, default: 'India' }
    },

    // Ownership & Association
    owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    associates: [{
        contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
        relationship: String
    }],

    // System
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
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
    }]
}, { timestamps: true, strict: true });

// Permanent Fix: Deep Data Integrity Hooks
const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

InventorySchema.pre('save', async function (next) {
    try {
        const Lookup = mongoose.model('Lookup');
        const resolveLookupLocal = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            const escapedValue = escapeRegExp(value);
            let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
            if (!lookup) {
                lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
            }
            return lookup._id;
        };

        if (this.intent && this.intent.length > 0) {
            this.intent = await Promise.all(this.intent.map(async (val) => {
                if (mongoose.Types.ObjectId.isValid(val)) return val;
                return await resolveLookupLocal('Intent', val);
            }));
        }
        if (this.status && !mongoose.Types.ObjectId.isValid(this.status)) this.status = await resolveLookupLocal('Status', this.status);

        // Address component resolution
        if (this.address) {
            if (this.address.city && !mongoose.Types.ObjectId.isValid(this.address.city)) this.address.city = await resolveLookupLocal('City', this.address.city);
            if (this.address.tehsil && !mongoose.Types.ObjectId.isValid(this.address.tehsil)) this.address.tehsil = await resolveLookupLocal('Tehsil', this.address.tehsil);
            if (this.address.state && !mongoose.Types.ObjectId.isValid(this.address.state)) this.address.state = await resolveLookupLocal('State', this.address.state);
            if (this.address.locality && !mongoose.Types.ObjectId.isValid(this.address.locality)) this.address.locality = await resolveLookupLocal('Area', this.address.locality);
            if (this.address.area && !mongoose.Types.ObjectId.isValid(this.address.area)) this.address.area = await resolveLookupLocal('Area', this.address.area);
            if (this.address.location && !mongoose.Types.ObjectId.isValid(this.address.location)) this.address.location = await resolveLookupLocal('Area', this.address.location);
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

        const Lookup = mongoose.model('Lookup');
        const resolveLookupLocal = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            const escapedValue = escapeRegExp(value);
            let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
            if (!lookup) {
                lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
            }
            return lookup._id;
        };

        // Robust Resolver for both top-level and $set/atomic updates
        const processUpdate = async (obj) => {
            if (!obj) return;

            // Handle intent
            if (obj.intent) {
                const resolveIntent = async (val) => {
                    if (typeof val === 'object' && val !== null && val._id) return val._id;
                    if (mongoose.Types.ObjectId.isValid(val)) return val;
                    return await resolveLookupLocal('Intent', val);
                };
                if (Array.isArray(obj.intent)) {
                    obj.intent = await Promise.all(obj.intent.map(resolveIntent));
                } else {
                    obj.intent = [await resolveIntent(obj.intent)];
                }
            }

            // Handle status
            if (obj.status) {
                if (typeof obj.status === 'object' && obj.status !== null && obj.status._id) obj.status = obj.status._id;
                if (!mongoose.Types.ObjectId.isValid(obj.status)) {
                    obj.status = await resolveLookupLocal('Status', obj.status);
                }
            }

            // Address component resolution
            const address = obj.address || {};
            if (address.city && !mongoose.Types.ObjectId.isValid(address.city)) address.city = await resolveLookupLocal('City', address.city);
            if (address.tehsil && !mongoose.Types.ObjectId.isValid(address.tehsil)) address.tehsil = await resolveLookupLocal('Tehsil', address.tehsil);
            if (address.state && !mongoose.Types.ObjectId.isValid(address.state)) address.state = await resolveLookupLocal('State', address.state);
            if (address.locality && !mongoose.Types.ObjectId.isValid(address.locality)) address.locality = await resolveLookupLocal('Area', address.locality);
            if (address.area && !mongoose.Types.ObjectId.isValid(address.area)) address.area = await resolveLookupLocal('Area', address.area);
            if (address.location && !mongoose.Types.ObjectId.isValid(address.location)) address.location = await resolveLookupLocal('Area', address.location);

            // Dot notation support
            if (obj['address.city'] && !mongoose.Types.ObjectId.isValid(obj['address.city'])) obj['address.city'] = await resolveLookupLocal('City', obj['address.city']);
            if (obj['address.tehsil'] && !mongoose.Types.ObjectId.isValid(obj['address.tehsil'])) obj['address.tehsil'] = await resolveLookupLocal('Tehsil', obj['address.tehsil']);
            if (obj['address.state'] && !mongoose.Types.ObjectId.isValid(obj['address.state'])) obj['address.state'] = await resolveLookupLocal('State', obj['address.state']);
            if (obj['address.locality'] && !mongoose.Types.ObjectId.isValid(obj['address.locality'])) obj['address.locality'] = await resolveLookupLocal('Area', obj['address.locality']);
            if (obj['address.area'] && !mongoose.Types.ObjectId.isValid(obj['address.area'])) obj['address.area'] = await resolveLookupLocal('Area', obj['address.area']);
            if (obj['address.location'] && !mongoose.Types.ObjectId.isValid(obj['address.location'])) obj['address.location'] = await resolveLookupLocal('Area', obj['address.location']);
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
