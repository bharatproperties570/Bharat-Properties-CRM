import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String },
    department: { type: String },
    designation: { type: String },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Should be hashed
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Active', 'Inactive', 'Suspended'], default: 'Active' },
    avatar: { type: String },
    lastLogin: { type: Date },
    preferences: {
        theme: { type: String, default: 'light' },
        language: { type: String, default: 'en' },
        notifications: { type: Boolean, default: true }
    }
}, { timestamps: true });

// Index for faster queries
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ status: 1 });

// Virtual for manager details
UserSchema.virtual('manager', {
    ref: 'User',
    localField: 'managerId',
    foreignField: '_id',
    justOne: true
});

// Virtual for role details
UserSchema.virtual('role', {
    ref: 'Role',
    localField: 'roleId',
    foreignField: '_id',
    justOne: true
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
