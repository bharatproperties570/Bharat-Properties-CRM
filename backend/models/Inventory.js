import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema({
    // Basic Info
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    unitType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
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

// Permanent Fix: Deep Data Integrity Hooks
InventorySchema.pre('save', async function (next) {
    try {
        const Lookup = mongoose.model('Lookup');
        const resolveLookupLocal = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } });
            if (!lookup) {
                lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
            }
            return lookup._id;
        };

        if (this.category && !mongoose.Types.ObjectId.isValid(this.category)) this.category = await resolveLookupLocal('Category', this.category);
        if (this.subCategory && !mongoose.Types.ObjectId.isValid(this.subCategory)) this.subCategory = await resolveLookupLocal('SubCategory', this.subCategory);
        if (this.unitType && !mongoose.Types.ObjectId.isValid(this.unitType)) this.unitType = await resolveLookupLocal('UnitType', this.unitType);
        if (this.status && !mongoose.Types.ObjectId.isValid(this.status)) this.status = await resolveLookupLocal('Status', this.status);
        if (this.facing && !mongoose.Types.ObjectId.isValid(this.facing)) this.facing = await resolveLookupLocal('Facing', this.facing);
        if (this.intent && !mongoose.Types.ObjectId.isValid(this.intent)) this.intent = await resolveLookupLocal('Intent', this.intent);

        next();
    } catch (error) {
        next(error);
    }
});

InventorySchema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate();
        if (!update) return next();

        const Lookup = mongoose.model('Lookup');
        const resolveLookupLocal = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } });
            if (!lookup) {
                lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
            }
            return lookup._id;
        };

        if (update.category && !mongoose.Types.ObjectId.isValid(update.category)) update.category = await resolveLookupLocal('Category', update.category);
        if (update.subCategory && !mongoose.Types.ObjectId.isValid(update.subCategory)) update.subCategory = await resolveLookupLocal('SubCategory', update.subCategory);
        if (update.unitType && !mongoose.Types.ObjectId.isValid(update.unitType)) update.unitType = await resolveLookupLocal('UnitType', update.unitType);
        if (update.status && !mongoose.Types.ObjectId.isValid(update.status)) update.status = await resolveLookupLocal('Status', update.status);
        if (update.facing && !mongoose.Types.ObjectId.isValid(update.facing)) update.facing = await resolveLookupLocal('Facing', update.facing);
        if (update.intent && !mongoose.Types.ObjectId.isValid(update.intent)) update.intent = await resolveLookupLocal('Intent', update.intent);

        next();
    } catch (error) {
        next(error);
    }
});

export default mongoose.model("Inventory", InventorySchema);
