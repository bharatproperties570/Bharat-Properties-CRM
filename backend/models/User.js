import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    // ========== Basic Info ==========
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    mobile: {
        type: String,
        trim: true
    },
    username: {
        type: String,
        unique: true,
        sparse: true, // Allows null values to be non-unique
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    avatar: String,

    // ========== Organizational Structure ==========
    department: {
        type: String,
        enum: {
            values: ['sales', 'marketing', 'inventory', 'accounts'],
            message: '{VALUE} is not a valid department'
        },
        required: [true, 'Department is required'],
        index: true
    },
    role: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role',
        required: [true, 'Role is required'],
        index: true
    },
    reportingTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        default: null
    },

    // ========== Data Visibility ==========
    dataScope: {
        type: String,
        enum: {
            values: ['assigned', 'team', 'department', 'all'],
            message: '{VALUE} is not a valid data scope'
        },
        default: 'assigned',
        index: true
    },

    // Location-based data scope (optional)
    locationScope: {
        districts: [{ type: String }],
        tehsils: [{ type: String }],
        projects: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project'
        }]
    },

    // ========== Financial & Approval Control ==========
    financialPermissions: {
        canViewMargin: { type: Boolean, default: false },
        canEditCommission: { type: Boolean, default: false },
        canOverrideCommission: { type: Boolean, default: false },
        canApproveDeal: { type: Boolean, default: false },
        canApprovePayment: { type: Boolean, default: false },
        canApprovePayout: { type: Boolean, default: false }
    },

    // ========== Password Security ==========
    passwordHistory: [{
        hash: String,
        changedAt: { type: Date, default: Date.now }
    }],
    passwordExpiresAt: {
        type: Date,
        default: () => {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 90); // 90 days
            return expiryDate;
        }
    },

    // ========== Security & Audit ==========
    lastLogin: {
        type: Date
    },
    lastPasswordChange: {
        type: Date,
        default: Date.now
    },
    loginHistory: [{
        ip: String,
        userAgent: String,
        timestamp: { type: Date, default: Date.now },
        success: { type: Boolean, default: true }
    }],
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lastFailedLogin: Date,

    // ========== Status ==========
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    status: {
        type: String,
        enum: {
            values: ['active', 'inactive', 'suspended'],
            message: '{VALUE} is not a valid status'
        },
        default: 'active',
        index: true
    },
    inactivationReason: {
        type: String,
        trim: true
    },
    inactiveUntil: {
        type: Date
    },
    inactivatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // ========== Legacy Support (for backward compatibility) ==========
    // Keep old 'name' field for backward compatibility
    name: {
        type: String,
        get: function () {
            return this.fullName;
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true }
});

// ========== Indexes ==========
UserSchema.index({ department: 1, status: 1 });
UserSchema.index({ department: 1, status: 1 });
UserSchema.index({ reportingTo: 1 });
UserSchema.index({ team: 1 });
UserSchema.index({ email: 1 }, { unique: true });

// ========== Virtual Fields ==========
// Get team members (users reporting to this user)
UserSchema.virtual('teamMembers', {
    ref: 'User',
    localField: '_id',
    foreignField: 'reportingTo'
});

// ========== Methods ==========
// Check if user has specific permission
UserSchema.methods.hasPermission = function (module, action) {
    // This will be implemented in the permission service
    // For now, return true for backward compatibility
    return true;
};

// Record login
UserSchema.methods.recordLogin = function (ip, userAgent) {
    this.lastLogin = new Date();
    this.failedLoginAttempts = 0;
    this.loginHistory.push({
        ip,
        userAgent,
        timestamp: new Date(),
        success: true
    });

    // Keep only last 50 login records
    if (this.loginHistory.length > 50) {
        this.loginHistory = this.loginHistory.slice(-50);
    }

    return this.save();
};

// Record failed login
UserSchema.methods.recordFailedLogin = function (ip, userAgent) {
    this.failedLoginAttempts += 1;
    this.lastFailedLogin = new Date();
    this.loginHistory.push({
        ip,
        userAgent,
        timestamp: new Date(),
        success: false
    });

    // Keep only last 50 login records
    if (this.loginHistory.length > 50) {
        this.loginHistory = this.loginHistory.slice(-50);
    }

    return this.save();
};

// Check if account is locked due to failed attempts
UserSchema.methods.isLocked = function () {
    return this.failedLoginAttempts >= 5;
};

// Reset failed login attempts
UserSchema.methods.resetFailedAttempts = function () {
    this.failedLoginAttempts = 0;
    this.lastFailedLogin = null;
    return this.save();
};

// ========== Pre-save Hooks ==========
UserSchema.pre('save', function (next) {
    // Auto-generate username from email if not provided
    if (!this.username && this.email) {
        this.username = this.email.split('@')[0];
    }
    next();
});

export default mongoose.model("User", UserSchema);
