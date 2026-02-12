import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema({
    // ========== Event Info ==========
    eventType: {
        type: String,
        required: true,
        enum: [
            // User Events
            'user_login',
            'user_logout',
            'user_failed_login',
            'user_created',
            'user_updated',
            'user_deleted',
            'user_deactivated',
            'user_activated',
            'user_suspended',
            'user_force_logout',

            // Permission Events
            'role_changed',
            'department_changed',
            'permission_granted',
            'permission_revoked',
            'data_scope_changed',
            'financial_permission_changed',

            // Data Transfer Events
            'data_transferred',
            'leads_transferred',
            'deals_transferred',
            'inventory_transferred',

            // Password Events
            'password_changed',
            'password_reset',

            // Role Events
            'role_created',
            'role_updated',
            'role_deleted',

            // Access Events
            'access_denied',
            'unauthorized_access_attempt'
        ],
        index: true
    },

    // ========== User Info ==========
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    userName: String, // Cached for performance
    userEmail: String, // Cached for performance

    // ========== Actor Info (who performed the action) ==========
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    actorName: String,
    actorEmail: String,

    // ========== Target Info (what was affected) ==========
    targetType: {
        type: String,
        enum: ['user', 'role', 'lead', 'deal', 'contact', 'company', 'inventory', 'payment', 'commission', 'campaign', 'other']
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId
    },
    targetName: String,

    // ========== Event Details ==========
    description: {
        type: String,
        required: true
    },

    // Changes made (before/after for updates)
    changes: {
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed
    },

    // Additional metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // ========== Request Info ==========
    ipAddress: String,
    userAgent: String,
    requestUrl: String,
    requestMethod: String,

    // ========== Status ==========
    status: {
        type: String,
        enum: ['success', 'failure', 'warning'],
        default: 'success'
    },

    // Error details if failed
    errorMessage: String,

    // ========== Timestamp ==========
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false // We use custom timestamp field
});

// ========== Indexes ==========
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ eventType: 1, timestamp: -1 });
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 }); // For recent logs

// ========== Static Methods ==========

// Get user's audit trail
AuditLogSchema.statics.getUserAuditTrail = function (userId, limit = 50) {
    return this.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('actorId', 'fullName email');
};

// Get recent logs
AuditLogSchema.statics.getRecentLogs = function (limit = 100) {
    return this.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'fullName email')
        .populate('actorId', 'fullName email');
};

// Get logs by event type
AuditLogSchema.statics.getByEventType = function (eventType, limit = 50) {
    return this.find({ eventType })
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'fullName email')
        .populate('actorId', 'fullName email');
};

// Get failed login attempts
AuditLogSchema.statics.getFailedLogins = function (userId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.find({
        userId,
        eventType: 'user_failed_login',
        timestamp: { $gte: since }
    }).sort({ timestamp: -1 });
};

// Log user event
AuditLogSchema.statics.logUserEvent = async function (eventType, userId, actorId, description, metadata = {}) {
    const User = mongoose.model('User');

    const user = await User.findById(userId).select('fullName email');
    const actor = actorId ? await User.findById(actorId).select('fullName email') : null;

    return this.create({
        eventType,
        userId,
        userName: user?.fullName,
        userEmail: user?.email,
        actorId,
        actorName: actor?.fullName,
        actorEmail: actor?.email,
        description,
        metadata,
        status: 'success'
    });
};

// Log permission change
AuditLogSchema.statics.logPermissionChange = async function (userId, actorId, changeType, before, after, description) {
    return this.logUserEvent(
        changeType,
        userId,
        actorId,
        description,
        {
            changes: { before, after }
        }
    );
};

// Log data transfer
AuditLogSchema.statics.logDataTransfer = async function (fromUserId, toUserId, actorId, dataType, count, description) {
    const User = mongoose.model('User');

    const fromUser = await User.findById(fromUserId).select('fullName email');
    const toUser = await User.findById(toUserId).select('fullName email');
    const actor = await User.findById(actorId).select('fullName email');

    return this.create({
        eventType: 'data_transferred',
        userId: fromUserId,
        userName: fromUser?.fullName,
        userEmail: fromUser?.email,
        actorId,
        actorName: actor?.fullName,
        actorEmail: actor?.email,
        description,
        metadata: {
            fromUser: {
                id: fromUserId,
                name: fromUser?.fullName
            },
            toUser: {
                id: toUserId,
                name: toUser?.fullName
            },
            dataType,
            count
        },
        status: 'success'
    });
};

export default mongoose.model("AuditLog", AuditLogSchema);
