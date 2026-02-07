import mongoose from "mongoose";

const ContactSchema = new mongoose.Schema({
    title: { type: String, default: "" },
    name: { type: String, required: true },  // Changed from firstName
    surname: { type: String },  // Changed from lastName
    fatherName: { type: String },
    countryCode: { type: String, default: "+91" },
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
    professionCategory: { type: String },
    professionSubCategory: { type: String },
    designation: { type: String },
    company: { type: String },
    workOffice: { type: String },

    // System Details
    source: { type: String },
    team: { type: String },
    owner: { type: String },
    visibleTo: { type: String },

    // Personal Address
    personalAddress: {
        hNo: String,
        street: String,
        country: String,
        state: String,
        city: String,
        tehsil: String,
        postOffice: String,
        pinCode: String,
        location: String,
        area: String
    },

    // Correspondence Address
    correspondenceAddress: {
        hNo: String,
        street: String,
        country: String,
        state: String,
        city: String,
        tehsil: String,
        postOffice: String,
        pinCode: String,
        location: String,
        area: String
    },

    // Other Details
    gender: { type: String },
    maritalStatus: { type: String },
    birthDate: { type: Date },
    anniversaryDate: { type: Date },

    // Education - Array
    educations: [{
        education: String,
        degree: String,
        school: String
    }],

    // Loan - Array
    loans: [{
        loanType: String,
        bank: String,
        loanAmount: String
    }],

    // Social Media - Array
    socialMedia: [{
        platform: String,
        url: String
    }],

    // Income - Array
    incomes: [{
        incomeType: String,
        amount: String
    }],

    // Documents - Array
    documents: [{
        documentName: String,
        documentType: String,
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
