import mongoose from "mongoose";
import { normalizePhone } from "../utils/normalization.js";

const ContactSchema = new mongoose.Schema({
    title: { type: mongoose.Schema.Types.Mixed },
    name: { type: String, required: true, index: true },
    surname: { type: String, index: true },
    fatherName: { type: String, index: true },
    countryCode: { type: mongoose.Schema.Types.Mixed },
    phones: [{
        number: String,
        type: { type: String, default: "Personal" }
    }],
    emails: [{
        address: String,
        type: { type: String, default: "Personal" }
    }],

    tags: [String],
    description: { type: String },

    // Professional Details
    professionCategory: { type: mongoose.Schema.Types.Mixed },
    professionSubCategory: { type: mongoose.Schema.Types.Mixed },
    designation: { type: mongoose.Schema.Types.Mixed },
    company: { type: String },
    workOffice: { type: String },

    // System Details
    source: { type: mongoose.Schema.Types.Mixed },
    subSource: { type: mongoose.Schema.Types.Mixed },
    campaign: { type: mongoose.Schema.Types.Mixed },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }, // Keep for compatibility
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    assignment: {
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Everyone' }
    },
    department: { type: String, index: true }, // Explicit branch/regional isolation
    visibleTo: { type: String, default: "Everyone" },


    // Personal Address
    personalAddress: {
        hNo: { type: String, index: true },
        street: String,
        country: { type: mongoose.Schema.Types.Mixed },
        state: { type: mongoose.Schema.Types.Mixed },
        city: { type: mongoose.Schema.Types.Mixed },
        tehsil: { type: mongoose.Schema.Types.Mixed },
        postOffice: { type: mongoose.Schema.Types.Mixed },
        pincode: { type: mongoose.Schema.Types.Mixed },
        location: { type: mongoose.Schema.Types.Mixed, index: true },
        area: String
    },

    // Correspondence Address
    correspondenceAddress: {
        hNo: String,
        street: String,
        country: { type: mongoose.Schema.Types.Mixed },
        state: { type: mongoose.Schema.Types.Mixed },
        city: { type: mongoose.Schema.Types.Mixed },
        tehsil: { type: mongoose.Schema.Types.Mixed },
        postOffice: { type: mongoose.Schema.Types.Mixed },
        pincode: { type: mongoose.Schema.Types.Mixed },
        location: { type: mongoose.Schema.Types.Mixed },
        area: String
    },

    // Standard CRM fields
    requirement: { type: mongoose.Schema.Types.Mixed },
    budget: { type: mongoose.Schema.Types.Mixed },
    location: { type: mongoose.Schema.Types.Mixed },

    // Other Details
    gender: { type: String },
    maritalStatus: { type: String },
    birthDate: { type: Date },
    anniversaryDate: { type: Date },

    // Array fields
    educations: [{
        education: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        degree: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        school: String
    }],

    loans: [{
        loanType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        bank: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        loanAmount: String
    }],

    socialMedia: [{
        platform: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        url: String
    }],

    incomes: [{
        incomeType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        amount: String
    }],

    documents: [{
        // standardized: documentCategory, documentType, documentName
        documentCategory: { type: mongoose.Schema.Types.Mixed },
        documentType: { type: mongoose.Schema.Types.Mixed }, // Type (e.g. Aadhar)
        documentName: { type: mongoose.Schema.Types.Mixed }, // Historical/Name representation

        documentNo: String,
        documentNumber: String,
        projectName: String,
        block: String,
        unitNumber: String,
        documentPicture: String,
        url: String
    }],

    // Legacy/Additional fields
    stage: { type: String, default: "New" },
    status: { type: String, default: "Active" },
    addOn: [String],
    groups: [String],
    isActionable: { type: Boolean, default: false },
    googleContactId: { type: String, index: true }
}, { timestamps: true, strict: true });

// ━━ PERFORMANCE INDEXES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ContactSchema.index({ 'phones.number': 1 });
ContactSchema.index({ 'emails.address': 1 });
ContactSchema.index({ assignedTo: 1, updatedAt: -1 });
ContactSchema.index({ teams: 1, updatedAt: -1 });
ContactSchema.index({ createdAt: -1 });

// Middleware to recursively convert empty strings to null
const sanitizeData = (obj) => {
    if (!obj || typeof obj !== "object") return;
    
    // Safety check to prevent infinite recursion
    const seen = new WeakSet();

    const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (seen.has(o)) return;
        seen.add(o);

        for (const key in o) {
            if (key.startsWith('$') || key.startsWith('_')) continue;
            if (o[key] === "") {
                o[key] = null;
            } else if (o[key] && typeof o[key] === "object") {
                walk(o[key]);
            }
        }
    };
    walk(obj);
};


const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

ContactSchema.pre("save", async function (next) {
    try {
        sanitizeData(this);

        // Normalize all phone numbers
        if (Array.isArray(this.phones)) {
            this.phones.forEach(p => {
                if (p.number) p.number = normalizePhone(p.number);
            });
        }

        const Lookup = mongoose.models.Lookup || mongoose.model('Lookup');

        const resolveLookupLocal = async (type, value, parentId = null) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            if (typeof value === 'object' && value._id) return value._id;
            
            const trimmedValue = String(value).trim();
            if (!trimmedValue) return null;
            
            const escapedValue = escapeRegExp(trimmedValue);
            const query = { 
                lookup_type: type, 
                lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } 
            };
            
            // 🛡️ [ENTERPRISE] Hierarchy matching: Only match if parent is same
            if (parentId) query.parent_lookup_id = parentId;
            
            let lookup = await Lookup.findOne(query);
            if (!lookup) {
                const createData = { lookup_type: type, lookup_value: trimmedValue };
                if (parentId) createData.parent_lookup_id = parentId;
                lookup = await Lookup.create(createData);
            }
            return lookup._id;
        };

        // Resolve top-level lookups
        if (this.title && typeof this.title === 'string') this.title = await resolveLookupLocal('Title', this.title);
        if (this.countryCode && typeof this.countryCode === 'string') this.countryCode = await resolveLookupLocal('CountryCode', this.countryCode);
        if (this.professionCategory && typeof this.professionCategory === 'string') this.professionCategory = await resolveLookupLocal('ProfessionCategory', this.professionCategory);
        if (this.designation && typeof this.designation === 'string') this.designation = await resolveLookupLocal('Designation', this.designation);
        if (this.source && typeof this.source === 'string') this.source = await resolveLookupLocal('Source', this.source);
        if (this.subSource && typeof this.subSource === 'string') this.subSource = await resolveLookupLocal('SubSource', this.subSource);
        if (this.campaign && typeof this.campaign === 'string') this.campaign = await resolveLookupLocal('Campaign', this.campaign);
        if (this.requirement && typeof this.requirement === 'string') this.requirement = await resolveLookupLocal('Requirement', this.requirement);
        if (this.budget && typeof this.budget === 'string') this.budget = await resolveLookupLocal('Budget', this.budget);
        if (this.location && typeof this.location === 'string') this.location = await resolveLookupLocal('Location', this.location);

        // Address resolution
        const addrFields = ['personalAddress', 'correspondenceAddress'];
        for (const field of addrFields) {
            if (this[field]) {
                // 🚀 [SENIOR] Hierarchical Resolution Flow: Country -> State -> City -> (Locality/Pincode)
                const countryId = await resolveLookupLocal('Country', this[field].country);
                if (countryId) this[field].country = countryId;

                const stateId = await resolveLookupLocal('State', this[field].state, countryId);
                if (stateId) this[field].state = stateId;

                const cityId = await resolveLookupLocal('City', this[field].city, stateId);
                if (cityId) this[field].city = cityId;

                // Sector/Locality/Pincode belong to a City
                if (this[field].tehsil && typeof this[field].tehsil === 'string') 
                    this[field].tehsil = await resolveLookupLocal('Tehsil', this[field].tehsil, cityId);
                
                if (this[field].postOffice && typeof this[field].postOffice === 'string') 
                    this[field].postOffice = await resolveLookupLocal('PostOffice', this[field].postOffice, cityId);
                
                if (this[field].pincode && (typeof this[field].pincode === 'string' || typeof this[field].pincode === 'number')) 
                    this[field].pincode = await resolveLookupLocal('Pincode', this[field].pincode, cityId);
                
                if (this[field].location && typeof this[field].location === 'string') 
                    this[field].location = await resolveLookupLocal('Area', this[field].location, cityId);
            }
        }

        // --- Assignment & Visibility Synchronization ---
        const primaryRM = this.assignedTo || this.owner || this.assignment?.assignedTo;
        if (primaryRM) {
            const primaryRMId = (typeof primaryRM === 'string' && mongoose.Types.ObjectId.isValid(primaryRM))
                ? new mongoose.Types.ObjectId(primaryRM)
                : primaryRM;

            this.assignedTo = primaryRMId;
            this.owner = primaryRMId;
            if (!this.assignment) this.assignment = {};
            this.assignment.assignedTo = primaryRMId;
        }

        // Standardize Multi-Team visibility
        if (this.assignment?.team?.length > 0 && (!this.teams || this.teams.length === 0)) {
            this.teams = this.assignment.team;
        } else if (this.team && (!this.teams || this.teams.length === 0)) {
            this.teams = [this.team];
        }

        if (this.teams?.length > 0) {
            // Ensure all team entries are ObjectIds
            this.teams = this.teams.map(t => (typeof t === 'string' && mongoose.Types.ObjectId.isValid(t)) ? new mongoose.Types.ObjectId(t) : t);

            if (!this.assignment) this.assignment = {};
            this.assignment.team = this.teams;
            this.team = this.teams[0];
        }

        next();
    } catch (err) {
        next(err);
    }
});

ContactSchema.pre("findOneAndUpdate", async function (next) {
    const update = this.getUpdate();
    if (update) {
        sanitizeData(update);

        const Lookup = mongoose.models.Lookup || mongoose.model('Lookup');

        // Helper for resolution within the update object
        const resolveLookupLocal = async (type, value, parentId = null) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            if (typeof value === 'object' && value._id) return value._id;
            
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

        const processUpdate = async (obj) => {
            if (!obj) return;

            // Resolve top-level lookups if they are in the update
            const fields = ['title', 'countryCode', 'professionCategory', 'designation', 'source', 'subSource', 'campaign', 'requirement', 'budget', 'location'];
            for (const field of fields) {
                if (obj[field] && typeof obj[field] === 'string') {
                    obj[field] = await resolveLookupLocal(field.charAt(0).toUpperCase() + field.slice(1), obj[field]);
                }
            }

            // Hierarchical Address Resolution
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
                
                if (addrObj.location && typeof addrObj.location === 'string') 
                    addrObj.location = await resolveLookupLocal('Area', addrObj.location, cityId);
            };

            if (obj.personalAddress) await resolveAddrHierarchical(obj.personalAddress);
            if (obj.correspondenceAddress) await resolveAddrHierarchical(obj.correspondenceAddress);

            // Handle Dot notation without creating path conflicts
            const addrPrefixes = [
                { prefix: 'personalAddress.', root: 'personalAddress' },
                { prefix: 'correspondenceAddress.', root: 'correspondenceAddress' }
            ];
            for (const { prefix, root } of addrPrefixes) {
                const dotAddr = {
                    country: obj[`${prefix}country`],
                    state: obj[`${prefix}state`],
                    city: obj[`${prefix}city`],
                    tehsil: obj[`${prefix}tehsil`],
                    postOffice: obj[`${prefix}postOffice`],
                    pincode: obj[`${prefix}pincode`],
                    location: obj[`${prefix}location`]
                };

                if (Object.values(dotAddr).some(v => v !== undefined)) {
                    await resolveAddrHierarchical(dotAddr);
                    
                    // If root object exists, update its properties instead of using dot notation
                    if (obj[root] && typeof obj[root] === 'object') {
                        if (dotAddr.country) obj[root].country = dotAddr.country;
                        if (dotAddr.state) obj[root].state = dotAddr.state;
                        if (dotAddr.city) obj[root].city = dotAddr.city;
                        if (dotAddr.tehsil) obj[root].tehsil = dotAddr.tehsil;
                        if (dotAddr.postOffice) obj[root].postOffice = dotAddr.postOffice;
                        if (dotAddr.pincode) obj[root].pincode = dotAddr.pincode;
                        if (dotAddr.location) obj[root].location = dotAddr.location;
                    } else {
                        if (dotAddr.country) obj[`${prefix}country`] = dotAddr.country;
                        if (dotAddr.state) obj[`${prefix}state`] = dotAddr.state;
                        if (dotAddr.city) obj[`${prefix}city`] = dotAddr.city;
                        if (dotAddr.tehsil) obj[`${prefix}tehsil`] = dotAddr.tehsil;
                        if (dotAddr.postOffice) obj[`${prefix}postOffice`] = dotAddr.postOffice;
                        if (dotAddr.pincode) obj[`${prefix}pincode`] = dotAddr.pincode;
                        if (dotAddr.location) obj[`${prefix}location`] = dotAddr.location;
                    }
                }
            }
        };

        await processUpdate(update);
        if (update.$set) await processUpdate(update.$set);
        if (update.$setOnInsert) await processUpdate(update.$setOnInsert);

        // Sync assignment fields in updates
        const primaryRM = update.assignedTo || update.owner || (update.assignment && update.assignment.assignedTo) || (update['assignment.assignedTo']) || (update.$set && (update.$set.assignedTo || update.$set.owner || update.$set['assignment.assignedTo']));
        if (primaryRM) {
            const primaryRMId = (typeof primaryRM === 'string' && mongoose.Types.ObjectId.isValid(primaryRM))
                ? new mongoose.Types.ObjectId(primaryRM)
                : primaryRM;

            if (update.$set) {
                update.$set.assignedTo = primaryRMId;
                update.$set.owner = primaryRMId;
                
                // 🛡️ [CONFLICT RESOLUTION] Prevent "Updating the path 'assignment' would create a conflict at 'assignment'"
                if (update.$set.assignment && typeof update.$set.assignment === 'object') {
                    update.$set.assignment.assignedTo = primaryRMId;
                } else if (!update.$set['assignment']) {
                    update.$set['assignment.assignedTo'] = primaryRMId;
                }
            } else {
                update.assignedTo = primaryRMId;
                update.owner = primaryRMId;
                
                if (update.assignment && typeof update.assignment === 'object') {
                    update.assignment.assignedTo = primaryRMId;
                } else if (!update['assignment']) {
                    update['assignment.assignedTo'] = primaryRMId;
                }
            }
        }

        // --- Team Synchronization ---
        const teams = update.teams || (update.assignment && update.assignment.team) || (update['assignment.team']) || (update.$set && (update.$set.teams || (update.$set.assignment && update.$set.assignment.team) || update.$set['assignment.team']));
        if (teams && Array.isArray(teams)) {
            const teamIds = teams.map(t => (typeof t === 'string' && mongoose.Types.ObjectId.isValid(t)) ? new mongoose.Types.ObjectId(t) : t);
            if (update.$set) {
                update.$set.team = teamIds[0];
                update.$set.teams = teamIds;
                if (update.$set.assignment && typeof update.$set.assignment === 'object') {
                    update.$set.assignment.team = teamIds;
                } else if (!update.$set['assignment']) {
                    update.$set['assignment.team'] = teamIds;
                }
            } else {
                update.team = teamIds[0];
                update.teams = teamIds;
                if (update.assignment && typeof update.assignment === 'object') {
                    update.assignment.team = teamIds;
                } else if (!update['assignment']) {
                    update['assignment.team'] = teamIds;
                }
            }
        }

        // 🛡️ [PERMANENT ENTERPRISE SOLUTION] Resolve Path Conflicts
        // Standardizes all updates to Dot-Notation to prevent "conflict at assignment"
        const finalizeUpdate = (u) => {
            const operators = {};
            const rootFields = {};
            
            // 1. Separate operators from raw fields
            Object.keys(u).forEach(key => {
                if (key.startsWith('$')) operators[key] = u[key];
                else rootFields[key] = u[key];
            });

            // 2. Flatten raw fields and $set into dot-notation
            const flatten = (obj, prefix = '') => {
                const flattened = {};
                // [SENIOR SAFETY] Only flatten plain objects. Skip arrays, ObjectIds, Dates, and Mongoose internals.
                if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof mongoose.Types.ObjectId || obj instanceof Date || (obj.constructor && obj.constructor.name !== 'Object')) {
                    return { [prefix]: obj };
                }

                Object.keys(obj).forEach(key => {
                    const path = prefix ? `${prefix}.${key}` : key;
                    const val = obj[key];
                    
                    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof mongoose.Types.ObjectId) && !(val instanceof Date) && Object.keys(val).length > 0) {
                        Object.assign(flattened, flatten(val, path));
                    } else {
                        flattened[path] = val;
                    }
                });
                return flattened;
            };

            const combinedSet = { ...rootFields, ...(operators.$set || {}) };
            const flatSet = flatten(combinedSet);
            
            // 3. Clean up the original update object
            Object.keys(u).forEach(key => delete u[key]);
            
            // 4. Reconstruct with operators
            Object.assign(u, operators);
            u.$set = flatSet;

            // Handle potential conflicts between $set and other operators
            ['$unset', '$inc', '$push', '$pull', '$addToSet'].forEach(op => {
                if (u[op]) {
                    Object.keys(u[op]).forEach(path => {
                        // If an operator is working on a path, remove any parents/children from $set
                        delete u.$set[path];
                        Object.keys(u.$set).forEach(setPath => {
                            if (setPath.startsWith(`${path}.`) || path.startsWith(`${setPath}.`)) {
                                delete u.$set[setPath];
                            }
                        });
                    });
                }
            });
            
            if (Object.keys(u.$set).length === 0) delete u.$set;
        };

        finalizeUpdate(update);
    }
    next();
});

// Virtual for full name
ContactSchema.virtual("fullName").get(function () {
    const titleVal = (this.title && typeof this.title === 'object') ? this.title.lookup_value : (this.title || "");
    return `${titleVal} ${this.name} ${this.surname || ""}`.trim();
});

export default mongoose.model("Contact", ContactSchema);
