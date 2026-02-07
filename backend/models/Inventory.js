import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, index: true },
    projectName: String,

    propertyType: { type: String, index: true },
    intent: { type: String, index: true },

    price: { type: Number, index: true },
    size: Number,

    city: { type: String, index: true },
    sector: { type: String, index: true },

    status: { type: String, index: true }
}, { timestamps: true });

export default mongoose.model("Inventory", InventorySchema);
