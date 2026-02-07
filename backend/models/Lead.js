import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema({
    salutation: { type: String, default: "Mr." },
    firstName: { type: String, required: true },
    lastName: { type: String },
    mobile: { type: String, required: true, index: true },
    email: { type: String },
    requirement: { type: String },
    subRequirement: { type: String },
    project: { type: String },
    budget: { type: String, index: true },
    location: { type: String, index: true },
    sector: { type: String },
    source: { type: String },
    status: { type: String, default: "fresh", index: true },
    notes: { type: String },
    isContacted: { type: Boolean, default: false },
    assignment: {
        method: String,
        assignedTo: String,
        team: [String]
    },
    customFields: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Virtual for full name
LeadSchema.virtual("fullName").get(function () {
    return `${this.salutation} ${this.firstName} ${this.lastName}`.trim();
});

export default mongoose.model("Lead", LeadSchema);
