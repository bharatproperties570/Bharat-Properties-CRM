import mongoose from "mongoose";
import { invalidateDashboardCache } from "../src/config/redis.js";

const ActivitySchema = new mongoose.Schema({
    type: { type: String, required: true, index: true }, // Call, Meeting, Site Visit, Task, Email
    subject: { type: String, required: true },
    entityType: { type: String, required: true, index: true }, // Lead, Contact, Deal, Project, Company, User
    entityId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true, refPath: 'entityType' },
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

    tags: [{ type: String }],
    isStarred: { type: Boolean, default: false },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true }],
    googleEventId: { type: String, index: true },

}, { timestamps: true });

// ━━ PERFORMANCE INDEXES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// These compound indexes cover the most common query patterns in the CRM.
// entityId + status: used in getLeads activity fetch (per lead page)
ActivitySchema.index({ entityId: 1, status: 1, createdAt: -1 });
// dueDate + status: used in dashboard overdue/today/upcoming counts
ActivitySchema.index({ dueDate: 1, status: 1 });
// type + createdAt: used in dashboard activityTypeBreakdown aggregation
ActivitySchema.index({ type: 1, createdAt: -1 });
// entityType + entityId: used in all entity-specific lookups
ActivitySchema.index({ entityType: 1, entityId: 1 });
// teams + dueDate: covers team-filtered activities for dashboard
ActivitySchema.index({ teams: 1, dueDate: 1, status: 1 });

ActivitySchema.post('save', invalidateDashboardCache);
ActivitySchema.post('findOneAndUpdate', invalidateDashboardCache);
ActivitySchema.post('findOneAndDelete', invalidateDashboardCache);

export default mongoose.model("Activity", ActivitySchema);
