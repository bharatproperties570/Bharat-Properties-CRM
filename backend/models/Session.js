import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema({
    // ========== User Info ==========
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // ========== Token Info ==========
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    refreshToken: {
        type: String,
        unique: true,
        sparse: true
    },

    // ========== Device Info ==========
    deviceInfo: {
        userAgent: String,
        ip: String,
        deviceType: {
            type: String,
            enum: ['mobile', 'desktop', 'tablet', 'unknown'],
            default: 'unknown'
        },
        browser: String,
        os: String,
        location: {
            city: String,
            country: String
        }
    },

    // ========== Session Status ==========
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },

    // ========== Termination Info ==========
    terminatedAt: Date,
    terminatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    terminationReason: {
        type: String,
        enum: ['logout', 'force_logout', 'expired', 'invalid', 'security']
    }
}, {
    timestamps: true
});

// ========== Indexes ==========
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// ========== Methods ==========
// Update last activity
SessionSchema.methods.updateActivity = function () {
    this.lastActivity = new Date();
    return this.save();
};

// Terminate session
SessionSchema.methods.terminate = async function (reason = 'logout', terminatedBy = null) {
    this.isActive = false;
    this.terminatedAt = new Date();
    this.terminationReason = reason;
    if (terminatedBy) {
        this.terminatedBy = terminatedBy;
    }
    return this.save();
};

// Check if session is expired
SessionSchema.methods.isExpired = function () {
    return new Date() > this.expiresAt;
};

// ========== Static Methods ==========
// Get active sessions for user
SessionSchema.statics.getActiveSessions = function (userId) {
    return this.find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
    }).sort({ lastActivity: -1 });
};

// Force logout all sessions for user
SessionSchema.statics.forceLogoutUser = async function (userId, terminatedBy, reason = 'force_logout') {
    const sessions = await this.find({
        userId,
        isActive: true
    });

    const promises = sessions.map(session =>
        session.terminate(reason, terminatedBy)
    );

    await Promise.all(promises);

    return sessions.length;
};

// Clean expired sessions
SessionSchema.statics.cleanExpiredSessions = async function () {
    const result = await this.updateMany(
        {
            isActive: true,
            expiresAt: { $lt: new Date() }
        },
        {
            $set: {
                isActive: false,
                terminatedAt: new Date(),
                terminationReason: 'expired'
            }
        }
    );

    return result.modifiedCount;
};

// Get session statistics
SessionSchema.statics.getSessionStats = async function (userId) {
    const total = await this.countDocuments({ userId });
    const active = await this.countDocuments({ userId, isActive: true });
    const expired = await this.countDocuments({
        userId,
        isActive: false,
        terminationReason: 'expired'
    });

    return { total, active, expired };
};

export default mongoose.model("Session", SessionSchema);
