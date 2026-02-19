import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema({
    salutation: { type: String, default: "Mr." },
    firstName: { type: String, required: true },
    lastName: { type: String },
    mobile: { type: String, required: true, index: true },
    email: { type: String },
    requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    subRequirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    budget: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    sector: { type: String },
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    tags: [String],
    description: String,
    status: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },

    // Extended Fields for Frontend Alignment
    budgetMin: { type: Number },
    budgetMax: { type: Number },
    areaMin: { type: Number },
    areaMax: { type: Number },
    areaMetric: { type: String },
    propertyType: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    subType: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    unitType: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    facing: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    roadWidth: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    direction: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }],
    purpose: { type: String },
    nri: { type: Boolean },
    funding: { type: String },
    timeline: { type: String },
    furnishing: { type: String },
    transactionType: { type: String },
    projectName: [String],
    locCity: { type: String },
    locArea: { type: String },
    locBlock: [String],
    locPinCode: { type: String },
    locState: { type: String },
    locCountry: { type: String },
    searchLocation: { type: String },

    documents: [{
        documentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }, // Added for hierarchy
        documentName: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        documentType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
        documentNo: String,
        projectName: String,
        block: String,
        unitNumber: String,
        documentPicture: String
    }],

    notes: { type: String },
    isContacted: { type: Boolean, default: false },
    assignment: {
        method: String,
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        team: [String]
    },
    owner: { type: mongoose.Schema.Types.Mixed, ref: 'User' },
    contactDetails: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    customFields: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Virtual for full name
LeadSchema.virtual("fullName").get(function () {
    return `${this.salutation} ${this.firstName} ${this.lastName}`.trim();
});

export default mongoose.model("Lead", LeadSchema);
