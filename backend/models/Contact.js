import mongoose from "mongoose";

const ContactSchema = new mongoose.Schema({
    title: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    name: { type: String, required: true },
    surname: { type: String },
    fatherName: { type: String },
    countryCode: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
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
    professionCategory: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    professionSubCategory: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    designation: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    company: { type: String },
    workOffice: { type: String },

    // System Details
    source: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    subSource: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
    campaign: { type: String },
    team: { type: String },
    owner: { type: mongoose.Schema.Types.Mixed, ref: 'User' },
    visibleTo: { type: String },


    // Personal Address
    personalAddress: {
        hNo: String,
        street: String,
        country: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        state: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        city: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        tehsil: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        postOffice: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        pinCode: String,
        location: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        area: String
    },

    // Correspondence Address
    correspondenceAddress: {
        hNo: String,
        street: String,
        country: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        state: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        city: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        tehsil: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        postOffice: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        pinCode: String,
        location: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        area: String
    },

    // Other Details
    gender: { type: String },
    maritalStatus: { type: String },
    birthDate: { type: Date },
    anniversaryDate: { type: Date },

    // Education - Array
    educations: [{
        education: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        degree: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        school: String
    }],


    // Loan - Array
    loans: [{
        loanType: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        bank: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        loanAmount: String
    }],


    // Social Media - Array
    socialMedia: [{
        platform: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        url: String
    }],


    // Income - Array
    incomes: [{
        incomeType: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        amount: String
    }],


    // Documents - Array
    documents: [{
        documentName: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
        documentType: { type: mongoose.Schema.Types.Mixed, ref: 'Lookup' },
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

// Virtual for full name
ContactSchema.virtual("fullName").get(function () {
    return `${this.title} ${this.name} ${this.surname}`.trim();
});

export default mongoose.model("Contact", ContactSchema);
