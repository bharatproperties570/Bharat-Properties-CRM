import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema({
    type: { type: String, required: true, index: true }, // Call, Meeting, Site Visit, Task, Email
    subject: { type: String, required: true },
    entityType: { type: String, required: true, index: true }, // Lead, Contact, Deal, Project, Company, User
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    relatedTo: [{
        id: { type: mongoose.Schema.Types.ObjectId },
        name: String,
        model: String // Lead, Contact, Deal, etc.
    }],
    participants: [{
        name: String,
        mobile: String,
        email: String
    }],
    dueDate: { type: Date, required: true },
    dueTime: String,
    priority: { type: String, enum: ['Low', 'Normal', 'High'], default: 'Normal' },
    status: { type: String, default: 'Pending' }, // Pending, In Progress, Completed, Deferred, Overdue
    description: String, // Remarks

    // Flexible object to store type-specific data
    details: { type: mongoose.Schema.Types.Mixed, default: {} },

    tasks: [{
        subject: String,
        reminder: Boolean,
        reminderTime: String
    }],

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedBy: String, // Name of the creator/performer
    performedAt: { type: Date, default: Date.now },

    // For completion tracking
    completedAt: Date,
    completionResult: String,

}, { timestamps: true });

export default mongoose.model("Activity", ActivitySchema);
