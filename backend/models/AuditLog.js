import mongoose from "mongoose";




const sensitivePathPatterns = [
    /(\/reset-password\/)([^/?#]+)/i,
    /(\/resolve-token\/)([^/?#]+)/i,
    /(\/portfolios\/public\/)([^/?#]+)/i,
    /(\/public\/matches\/)([^/?#]+)/i
];

function normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return 'unknown';
    try {
        const parsed = new URL(String(rawUrl).trim().replace(/\\/g, '/'), 'http://dummy-base.local').pathname;
        let normalized = parsed.replace(/\/+/g, '/');
        sensitivePathPatterns.forEach(regex => {
            normalized = normalized.replace(regex, '$1[REDACTED_TOKEN]');
        });
        return normalized;
    } catch (err) {
        return 'unknown';
    }
}


function maskScalarPII(text) {
    if (!text || typeof text !== 'string') return text;
    // Mask emails: leave first char, mask middle, keep domain
    let masked = text.replace(/([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1***$2');

    // Mask phones: leave last 4 digits
    masked = masked.replace(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){1,2}\d{4}/g, (match) => {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
            return '[PHONE_MINIMIZED]';
        }
        return match;
    });

    // Strip stack traces
    if (masked.includes(' at ')) {
        const stackIndex = masked.indexOf('\n    at ');
        if (stackIndex !== -1) {
            masked = masked.substring(0, stackIndex) + ' [STACK_STRIPPED]';
        }
    }

    return masked;
}

function redactSensitive(obj, currentDepth = 0, seen = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'function' || typeof obj === 'symbol' || Buffer.isBuffer(obj)) return '[UNSUPPORTED_TYPE]';

    // Preserve MongoDB ObjectIds and Dates safely
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj && typeof obj.toHexString === 'function' && typeof obj.equals === 'function') return obj;

    if (typeof obj !== 'object') return obj;

    if (currentDepth >= 5) return '[MAX_DEPTH_EXCEEDED]';
    if (seen.has(obj)) return '[CIRCULAR_REFERENCE]';
    seen.add(obj);

    const sensitiveKeys = /password|token|credential|secret|authorization[_-]?proof/i;
    const piiKeys = /email|phone|mobile|contactNumber/i;

    if (Array.isArray(obj)) {
        return obj.map(item => redactSensitive(item, currentDepth + 1, seen));
    }

    const redactedObj = {};
    for (const key of Object.keys(obj)) {
        if (sensitiveKeys.test(key)) {
            redactedObj[key] = '[REDACTED]';
        } else if (piiKeys.test(key)) {
            redactedObj[key] = '[PII_MINIMIZED]';
        } else {
            redactedObj[key] = redactSensitive(obj[key], currentDepth + 1, seen);
        }
    }
    return redactedObj;
}

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

            // AI Policy Engine Events
            'ai_action_blocked',
            'ai_action_approval_required',
            'ai_action_authorized',
            'ai_action_dispatched',
            'ai_activation_changed',

            // Entity Trackers
            'stage_changed',
            'assignment_changed',
            'lead_revived_automation',
            'score_changed',
            'deal_converted',
            'rule_modified',

            // Lead Lifecycle Events
            'lead_created',
            'lead_updated',
            'lead_deleted',

            // Financial Events
            'payment_updated',

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
        required: false,
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
    department: { type: String, index: true }, // Regional tracking for Enterprise Isolation

    // Error details if failed
    errorMessage: String,

    // ========== Correlation ==========
    correlationId: {
        type: String,
        required: false
    },

    // ========== Timestamp ==========
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false // We use custom timestamp field
});


AuditLogSchema.pre('save', function (next) {
    if (this.errorMessage) {
        this.errorMessage = maskScalarPII(this.errorMessage);
    }
    next();
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
AuditLogSchema.statics.logUserEvent = async function (eventType, userId, actorId, description, metadata = {}, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};
    const User = mongoose.model('User');

    const user = await User.findById(userId).select('fullName email');
    const actor = actorId ? await User.findById(actorId).select('fullName email') : null;

    let redactedMetadata;
    try {
        redactedMetadata = redactSensitive(metadata);
        if (redactedMetadata?.requestInfo && 'url' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.url = normalizeUrl(redactedMetadata.requestInfo.url);
        if (redactedMetadata?.requestInfo && 'rawUrl' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.rawUrl = normalizeUrl(redactedMetadata.requestInfo.rawUrl);
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    return this.create([{
        eventType,
        userId,
        userName: user?.fullName,
        userEmail: user?.email,
        actorId,
        actorName: actor?.fullName,
        actorEmail: actor?.email,
        description: maskScalarPII(description),
        metadata: redactedMetadata,
        status: 'success',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

// Log permission change
AuditLogSchema.statics.logPermissionChange = async function (userId, actorId, changeType, before, after, description, options = {}) {
    return this.logUserEvent(
        changeType,
        userId,
        actorId,
        description,
        {
            changes: { before, after }
        },
        options
    );
};

// Log data transfer
AuditLogSchema.statics.logDataTransfer = async function (fromUserId, toUserId, actorId, dataType, count, description, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};
    const User = mongoose.model('User');

    const fromUser = await User.findById(fromUserId).select('fullName email');
    const toUser = await User.findById(toUserId).select('fullName email');
    const actor = await User.findById(actorId).select('fullName email');

    let redactedMetadata;
    try {
        redactedMetadata = redactSensitive({
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
        });
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    return this.create([{
        eventType: 'data_transferred',
        userId: fromUserId,
        userName: fromUser?.fullName,
        userEmail: fromUser?.email,
        actorId,
        actorName: actor?.fullName,
        actorEmail: actor?.email,
        description: maskScalarPII(description),
        metadata: redactedMetadata,
        status: 'success',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

// Log generic entity update (tracking previous and new values)
// ✅ [BUG FIX] Uses mongoose.model('User') to avoid undefined User reference (was causing silent ReferenceError)
AuditLogSchema.statics.logEntityUpdate = async function (eventType, targetType, targetId, targetName, userId, changes, description, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};
    let user = null;
    if (userId) {
        try {
            const UserModel = mongoose.model('User');
            user = await UserModel.findById(userId).select('fullName email department').lean();
        } catch (_) { /* User lookup non-critical */ }
    }
    const department = user?.department;

    let redactedChanges;
    try {
        redactedChanges = redactSensitive(changes);
    } catch (err) {
        redactedChanges = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    return this.create([{
        eventType,
        userId,
        userName: user?.fullName || 'System',
        userEmail: user?.email || 'system@crm.local',
        department,
        targetType,
        targetId,
        targetName: maskScalarPII(targetName),
        description: maskScalarPII(description),
        changes: redactedChanges,
        status: 'success',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};


// Log AI event
AuditLogSchema.statics.logAIEvent = async function (eventType, targetId, capability, policyVersion, decision, metadata = {}, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};

    let redactedMetadata;
    try {
        redactedMetadata = redactSensitive(metadata);
        if (redactedMetadata?.requestInfo && 'url' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.url = normalizeUrl(redactedMetadata.requestInfo.url);
        if (redactedMetadata?.requestInfo && 'rawUrl' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.rawUrl = normalizeUrl(redactedMetadata.requestInfo.rawUrl);
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    return this.create([{
        eventType,
        targetType: 'other',
        targetId,
        description: maskScalarPII(`AI Policy Decision: ${decision}`),
        metadata: {
            capability,
            policyVersion,
            decision,
            ...redactedMetadata
        },
        status: decision === 'ALLOWED' ? 'success' : 'warning',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

export default mongoose.model("AuditLog", AuditLogSchema);
