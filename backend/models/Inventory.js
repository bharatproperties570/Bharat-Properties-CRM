import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema({
    // Basic Info
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    unitType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true },
    project: String,
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },

    projectName: String,
    block: { type: String },
    unitNumber: { type: String },

    // Status & Intent
    intent: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true }, // For Sale, For Rent
    status: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', index: true }, // Available, Sold, etc.


    // Pricing
    price: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },
    totalCost: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },
    allInclusivePrice: {
        value: { type: Number },
        currency: { type: String, default: 'INR' }
    },

    // Size & Specs
    size: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    sizeUnit: String,
    floor: { type: String },
    facing: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    roadWidth: String,

    builtUpArea: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },
    carpetArea: {
        value: { type: Number },
        unit: { type: String, default: 'Sq.Ft.' }
    },

    // Location
    city: { type: String, index: true },
    sector: { type: String, index: true },
    address: {
        street: String,
        landmark: String,
        city: String,
        state: String,
        pincode: String,
        country: { type: String, default: 'India' }
    },

    // Ownership & Association
    owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    associates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],

    // System
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
    assignedTo: String,
    visibleTo: String
}, { timestamps: true, strict: true });

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
