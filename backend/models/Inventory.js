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

const resolveLookupLocal = async (type, value, parentId = null) => {
    if (!value) return null;
    const Lookup = mongoose.model('Lookup');
    
    if (isObjectId(value)) return new mongoose.Types.ObjectId(value.toString());
    if (typeof value === 'object' && value._id) return new mongoose.Types.ObjectId(value._id.toString());
    
    const trimmedValue = String(value).trim();
    if (!trimmedValue) return null;
    
    const escapedValue = escapeRegExp(trimmedValue);
    const query = { 
        lookup_type: type, 
        lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } 
    };
    
    if (parentId) query.parent_lookup_id = parentId;
    
    let lookup = await Lookup.findOne(query);
    if (!lookup) {
        const createData = { lookup_type: type, lookup_value: trimmedValue };
        if (parentId) createData.parent_lookup_id = parentId;
        lookup = await Lookup.create(createData);
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
    builtupVideoUrl: String,
    builtupDetails: [{
        floor: String,
        cluster: String,
        length: Number,
        width: Number,
        totalArea: Number,
        imageUrl: String,
        videoUrl: String
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
    registryArea: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    gpsArea: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    registryAreaAcres: { type: Number },
    registryAreaKanals: { type: Number },
    registryAreaMarlas: { type: Number },
    gpsAreaAcres: { type: Number },
    gpsAreaKanals: { type: Number },
    gpsAreaMarlas: { type: Number },
    soilType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    currentCrop: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    kmlFileUrl: { type: String },
    zoneName: { type: mongoose.Schema.Types.Mixed },
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
    nearbyLandmarks: [{
        name: String,
        type: { type: String }, // 'hospital', 'school', 'transit_station'
        distance: Number, // in meters
        rating: Number
    }],

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
    geoPoint: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] }
    },
    geoPolygon: {
        type: { type: String, enum: ['Polygon'] },
        coordinates: { type: [[[Number]]] }
    },
    gpsPerimeter: { type: Number }, // in meters or feet

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
InventorySchema.index({ facing: 1 });
InventorySchema.index({ direction: 1 });
InventorySchema.index({ geoPoint: "2dsphere" });

// 🚀 SENIOR OPTIMIZATION: Critical indexes for list-view sorting & filtering
// Without these, MongoDB performs full collection scans on every API call.
InventorySchema.index({ updatedAt: -1 });                          // Default list sort
InventorySchema.index({ createdAt: -1 });                          // "Newest First" sort
InventorySchema.index({ status: 1, updatedAt: -1 });               // Status filter + sort
InventorySchema.index({ category: 1, updatedAt: -1 });             // Category filter + sort
InventorySchema.index({ projectId: 1, updatedAt: -1 });            // Project filter + sort
InventorySchema.index({ owners: 1 });                              // Owner lookup
InventorySchema.index({ projectName: 1, updatedAt: -1 });          // Project name + sort (visibility queries)
 
// Permanent Fix: Deep Data Integrity Hooks


InventorySchema.pre('save', async function (next) {
    try {
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
        if (this.soilType !== undefined && !isObjectId(this.soilType)) {
            this.soilType = await resolveLookupLocal('SoilType', this.soilType);
        }
        if (this.currentCrop !== undefined && !isObjectId(this.currentCrop)) {
            this.currentCrop = await resolveLookupLocal('CurrentCrop', this.currentCrop);
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
                { field: 'possessionStatus', type: 'PossessionStatus' },
                { field: 'furnishType', type: 'FurnishType' },
                { field: 'country', type: 'Country' },
                { field: 'soilType', type: 'SoilType' },
                { field: 'currentCrop', type: 'CurrentCrop' },
                { field: 'roadWidth', type: 'RoadWidth' },
                { field: 'sizeConfig', type: 'Size' },
                { field: 'builtupType', type: 'BuiltupType' }
            ];

            for (const { field, type } of categoricalFields) {
                if (obj[field]) {
                    if (typeof obj[field] === 'object' && obj[field] !== null && obj[field]._id) obj[field] = obj[field]._id;
                    if (isObjectId(obj[field])) {
                        obj[field] = new mongoose.Types.ObjectId(obj[field]);
                    } else {
                        obj[field] = await resolveLookupLocal(type, obj[field]);
                    }
                }
            }

            // 🚀 [SENIOR] Hierarchical Address Resolution: Country -> State -> City -> (Locality/Pincode)
            const resolveAddrHierarchical = async (addrObj) => {
                const countryId = await resolveLookupLocal('Country', addrObj.country);
                if (countryId) addrObj.country = countryId;

                const stateId = await resolveLookupLocal('State', addrObj.state, countryId);
                if (stateId) addrObj.state = stateId;

                const cityId = await resolveLookupLocal('City', addrObj.city, stateId);
                if (cityId) addrObj.city = cityId;

                if (addrObj.tehsil && typeof addrObj.tehsil === 'string') 
                    addrObj.tehsil = await resolveLookupLocal('Tehsil', addrObj.tehsil, cityId);
                
                if (addrObj.postOffice && typeof addrObj.postOffice === 'string') 
                    addrObj.postOffice = await resolveLookupLocal('PostOffice', addrObj.postOffice, cityId);
                
                if (addrObj.pincode && (typeof addrObj.pincode === 'string' || typeof addrObj.pincode === 'number')) 
                    addrObj.pincode = await resolveLookupLocal('Pincode', addrObj.pincode, cityId);
                
                if (addrObj.locality && typeof addrObj.locality === 'string') 
                    addrObj.locality = await resolveLookupLocal('Area', addrObj.locality, cityId);

                if (addrObj.location && typeof addrObj.location === 'string') 
                    addrObj.location = await resolveLookupLocal('Area', addrObj.location, cityId);
                
                if (addrObj.area && typeof addrObj.area === 'string') 
                    addrObj.area = await resolveLookupLocal('Area', addrObj.area, cityId);
            };

            if (obj.address) {
                await resolveAddrHierarchical(obj.address);
            }

            // Handle Dot notation updates (common in findOneAndUpdate)
            const dotAddr = {
                country: obj['address.country'],
                state: obj['address.state'],
                city: obj['address.city'],
                tehsil: obj['address.tehsil'],
                postOffice: obj['address.postOffice'],
                pincode: obj['address.pincode'],
                locality: obj['address.locality'],
                location: obj['address.location'],
                area: obj['address.area']
            };

            if (Object.values(dotAddr).some(v => v !== undefined)) {
                await resolveAddrHierarchical(dotAddr);
                // Map back to dot notation
                if (dotAddr.country) obj['address.country'] = dotAddr.country;
                if (dotAddr.state) obj['address.state'] = dotAddr.state;
                if (dotAddr.city) obj['address.city'] = dotAddr.city;
                if (dotAddr.tehsil) obj['address.tehsil'] = dotAddr.tehsil;
                if (dotAddr.postOffice) obj['address.postOffice'] = dotAddr.postOffice;
                if (dotAddr.pincode) obj['address.pincode'] = dotAddr.pincode;
                if (dotAddr.locality) obj['address.locality'] = dotAddr.locality;
                if (dotAddr.location) obj['address.location'] = dotAddr.location;
                if (dotAddr.area) obj['address.area'] = dotAddr.area;
            }
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

InventorySchema.pre('insertMany', function(next, docs) {
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

export default mongoose.model("Inventory", InventorySchema);
