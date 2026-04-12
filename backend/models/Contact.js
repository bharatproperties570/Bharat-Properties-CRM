import mongoose from "mongoose";
import { normalizePhone } from "../utils/normalization.js";

const ContactSchema = new mongoose.Schema({
    title: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    name: { type: String, required: true },
    surname: { type: String },
    fatherName: { type: String },
    countryCode: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
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
    professionCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    professionSubCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    company: { type: String },
    workOffice: { type: String },

    // System Details
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    subSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }, // Keep for compatibility
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    assignment: {
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
        visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Everyone' }
    },
    visibleTo: { type: String, default: "Everyone" },


    // Personal Address
    personalAddress: {
        hNo: String,
        street: String,
        country: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        state: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        city: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        tehsil: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        postOffice: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        pinCode: String,
        location: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        area: String
    },

    // Correspondence Address
    correspondenceAddress: {
        hNo: String,
        street: String,
        country: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        state: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        city: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        tehsil: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        postOffice: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        pinCode: String,
        location: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        area: String
    },

    // Standard CRM fields
    requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    budget: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },

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
        documentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        documentType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }, // Type (e.g. Aadhar)
        documentName: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }, // Historical/Name representation

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

        const Lookup = mongoose.model('Lookup');
        const resolveLookupLocal = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            if (typeof value === 'object' && value._id) return value._id;
            const escapedValue = escapeRegExp(value);
            let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
            if (!lookup) {
                lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
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
                if (this[field].city && typeof this[field].city === 'string') this[field].city = await resolveLookupLocal('City', this[field].city);
                if (this[field].state && typeof this[field].state === 'string') this[field].state = await resolveLookupLocal('State', this[field].state);
                if (this[field].country && typeof this[field].country === 'string') this[field].country = await resolveLookupLocal('Country', this[field].country);
                if (this[field].tehsil && typeof this[field].tehsil === 'string') this[field].tehsil = await resolveLookupLocal('Tehsil', this[field].tehsil);
                if (this[field].postOffice && typeof this[field].postOffice === 'string') this[field].postOffice = await resolveLookupLocal('PostOffice', this[field].postOffice);
                if (this[field].location && typeof this[field].location === 'string') this[field].location = await resolveLookupLocal('Area', this[field].location);
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

ContactSchema.pre("findOneAndUpdate", function (next) {
    const update = this.getUpdate();
    if (update) {
        sanitizeData(update);

        // Sync assignment fields in updates
        const primaryRM = update.assignedTo || update.owner || (update.assignment && update.assignment.assignedTo) || (update['assignment.assignedTo']);
        if (primaryRM) {
            const primaryRMId = (typeof primaryRM === 'string' && mongoose.Types.ObjectId.isValid(primaryRM))
                ? new mongoose.Types.ObjectId(primaryRM)
                : primaryRM;

            update.assignedTo = primaryRMId;
            update.owner = primaryRMId;
            if (update.assignment) update.assignment.assignedTo = primaryRMId;
            update['assignment.assignedTo'] = primaryRMId;
        }

        // Sync team fields in updates
        const primaryTeams = update.teams || (update.assignment && update.assignment.team) || update['assignment.team'];
        if (primaryTeams && Array.isArray(primaryTeams)) {
            const castedTeams = primaryTeams.map(t => (typeof t === 'string' && mongoose.Types.ObjectId.isValid(t)) ? new mongoose.Types.ObjectId(t) : t);
            update.teams = castedTeams;
            update.team = castedTeams[0];
            if (update.assignment) update.assignment.team = castedTeams;
            update['assignment.team'] = castedTeams;
        } else if (update.team) {
            const castedTeam = (typeof update.team === 'string' && mongoose.Types.ObjectId.isValid(update.team)) ? new mongoose.Types.ObjectId(update.team) : update.team;
            update.team = castedTeam;
            update.teams = [castedTeam];
            if (update.assignment) update.assignment.team = [castedTeam];
            update['assignment.team'] = [castedTeam];
        }
    }
    next();
});

// Virtual for full name
ContactSchema.virtual("fullName").get(function () {
    const titleVal = (this.title && typeof this.title === 'object') ? this.title.lookup_value : (this.title || "");
    return `${titleVal} ${this.name} ${this.surname || ""}`.trim();
});

export default mongoose.model("Contact", ContactSchema);
