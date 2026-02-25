import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema({
    // Basic Info
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    project: String,
    projectId: { type: mongoose.Schema.Types.Mixed, index: true },

    projectName: String,
    block: { type: String },
    unitNumber: { type: String },

    // Status & Intent
    intent: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true }, // For Sale, For Rent
    status: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true }, // Available, Sold, etc.


    // Pricing
    price: { type: mongoose.Schema.Types.Mixed, index: true },
    totalCost: mongoose.Schema.Types.Mixed,
    allInclusivePrice: mongoose.Schema.Types.Mixed,

    // Size & Specs
    size: mongoose.Schema.Types.Mixed,
    sizeUnit: String,
    floor: { type: mongoose.Schema.Types.Mixed },
    facing: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    roadWidth: String,

    builtUpArea: mongoose.Schema.Types.Mixed,
    carpetArea: mongoose.Schema.Types.Mixed,

    // Location
    city: { type: String, index: true },
    sector: { type: String, index: true },
    address: mongoose.Schema.Types.Mixed,

    // Ownership & Association
    owners: [{ type: mongoose.Schema.Types.Mixed, ref: 'Contact' }],
    associates: [{ type: mongoose.Schema.Types.Mixed, ref: 'Contact' }],

    // System
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    assignedTo: String,
    visibleTo: String
}, { timestamps: true, strict: false });

export default mongoose.model("Inventory", InventorySchema);
