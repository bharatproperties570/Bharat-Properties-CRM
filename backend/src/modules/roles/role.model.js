import mongoose from "mongoose";

const RoleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    permissions: {
        leads: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
            export: { type: Boolean, default: false }
        },
        contacts: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
            export: { type: Boolean, default: false }
        },
        deals: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
            export: { type: Boolean, default: false }
        },
        inventory: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false },
            export: { type: Boolean, default: false }
        },
        projects: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        activities: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            edit: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        settings: {
            view: { type: Boolean, default: false },
            manage: { type: Boolean, default: false }
        },
        reports: {
            view: { type: Boolean, default: false },
            export: { type: Boolean, default: false }
        }
    },
    isSystem: { type: Boolean, default: false }, // System roles can't be deleted
    active: { type: Boolean, default: true }
}, { timestamps: true });

// Index for faster queries
RoleSchema.index({ name: 1 });
RoleSchema.index({ active: 1 });

export default mongoose.models.Role || mongoose.model("Role", RoleSchema);
