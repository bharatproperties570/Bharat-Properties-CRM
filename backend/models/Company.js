import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';

const AddressSchema = new mongoose.Schema({
    branchName: String,
    hNo: String,
    street: String,
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    state: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    tehsil: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    postOffice: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    pinCode: String,
    pincode: String,
    area: String,
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    country: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }
}, { _id: false });

const CompanySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    phones: [{
        phoneCode: { type: String, default: "+91" },
        phoneNumber: String,
        type: { type: String, default: "Work" }
    }],
    emails: [{
        address: String,
        type: { type: String, default: "Work" }
    }],
    companyType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    industry: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    description: String,
    gstNumber: String,
    campaign: String,
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    subSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    owner: { type: mongoose.Schema.Types.Mixed, ref: 'User' },
    department: { type: String, index: true }, // Explicit branch/regional isolation
    visibleTo: { type: String, default: "Everyone" },
    addresses: {
        registeredOffice: AddressSchema,
        branchOffice: [AddressSchema],
        corporateOffice: AddressSchema,
        headOffice: AddressSchema,
        siteOffice: [AddressSchema]
    },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    documents: [{
        name: String,
        type: { type: String, enum: ['KYC', 'Agreement', 'GST', 'RERA', 'Incorporation', 'Other'] },
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    incentiveSlabs: [{
        slabName: String,
        minRevenue: Number,
        maxRevenue: Number,
        kicker: Number, // Percentage
        remarks: String
    }],
    agreementDetails: {
        agreementType: String,
        validUntil: Date,
        standardCommission: String, // e.g. "2.5% + GST"
        terms: String
    },
    partnerScore: { type: Number, default: 0, min: 0, max: 100 },

    // Relationship Intelligence
    relationshipType: {
        type: String,
        enum: ['Developer', 'Land Owner', 'Channel Partner', 'Vendor', 'Institutional Owner', 'Other'],
        default: 'Other'
    },
    commissionAgreementStatus: { type: String, default: 'Not Started' },
    isPreferredPartner: { type: Boolean, default: false },
    creditLimit: { type: Number, default: 0 },
    outstandingAmount: { type: Number, default: 0 },

    // Broker Networking (BNA Phase 1)
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CompanyGroup', index: true }],
    isVerifiedBroker: { type: Boolean, default: false },
    brokerNotes: String
}, { timestamps: true });

// Middleware to synchronize pincode and pinCode fields for full compatibility
const syncPincode = (obj) => {
    if (!obj || typeof obj !== "object") return;

    // Handle dot-notation paths (e.g. 'addresses.registeredOffice.pincode')
    for (const key in obj) {
        if (key.includes('addresses.') && (key.endsWith('.pincode') || key.endsWith('.pinCode'))) {
            const basePath = key.substring(0, key.lastIndexOf('.'));
            const pincodeKey = `${basePath}.pincode`;
            const pinCodeKey = `${basePath}.pinCode`;
            const val = obj[pincodeKey] || obj[pinCodeKey] || obj[key];
            if (val) {
                obj[pincodeKey] = val;
                obj[pinCodeKey] = val;
            }
        }
    }

    // Handle nested structures
    if (obj.addresses) {
        const addressTypes = ['registeredOffice', 'branchOffice', 'corporateOffice', 'headOffice', 'siteOffice'];
        addressTypes.forEach(type => {
            const addr = obj.addresses[type];
            if (addr) {
                if (Array.isArray(addr)) {
                    addr.forEach(item => {
                        if (item) {
                            const val = item.pincode || item.pinCode;
                            if (val) {
                                item.pincode = val;
                                item.pinCode = val;
                            }
                        }
                    });
                } else {
                    const val = addr.pincode || addr.pinCode;
                    if (val) {
                        addr.pincode = val;
                        addr.pinCode = val;
                    }
                }
            }
        });
    }
};

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

CompanySchema.pre("save", function (next) {
    syncPincode(this);
    sanitizeData(this);
    next();
});

CompanySchema.pre("findOneAndUpdate", function (next) {
    const update = this.getUpdate();
    if (update) {
        syncPincode(update);
        sanitizeData(update);
    }
    next();
});

CompanySchema.plugin(mongoosePaginate);

export default mongoose.model("Company", CompanySchema);
