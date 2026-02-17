import mongoose from "mongoose";

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
    team: { type: mongoose.Schema.Types.Mixed },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visibleTo: { type: String },


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
        documentName: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        documentType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        documentNo: String,
        projectName: String,
        block: String,
        unitNumber: String,
        documentPicture: String
    }],

    // Legacy/Additional fields
    stage: { type: String, default: "New" },
    status: { type: String, default: "Active" },
    addOn: [String],
    groups: [String],
    isActionable: { type: Boolean, default: false }
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

ContactSchema.pre("save", function (next) {
    sanitizeData(this);
    next();
});

ContactSchema.pre("findOneAndUpdate", function (next) {
    const update = this.getUpdate();
    if (update) {
        sanitizeData(update);
    }
    next();
});

// Virtual for full name
ContactSchema.virtual("fullName").get(function () {
    const titleVal = (this.title && typeof this.title === 'object') ? this.title.lookup_value : (this.title || "");
    return `${titleVal} ${this.name} ${this.surname || ""}`.trim();
});

export default mongoose.model("Contact", ContactSchema);
