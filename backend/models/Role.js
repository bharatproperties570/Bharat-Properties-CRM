import mongoose from "mongoose";

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please add a role name"],
        unique: true,
        trim: true,
    },
    description: {
        type: String,
    },
    isSystem: {
        type: Boolean,
        default: false,
    },
    permissions: {
        type: Object, // Structured mapping of permissions
        default: {},
    }
}, {
    timestamps: true
});

export default mongoose.model("Role", roleSchema);
