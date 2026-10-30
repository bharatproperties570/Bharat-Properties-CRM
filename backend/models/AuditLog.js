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


const isHexObjectId = (str) => typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
const isIsoDate = (str) => typeof str === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);

function maskScalarPII(text) {
    if (!text || typeof text !== 'string') return text;
    if (isHexObjectId(text) || isIsoDate(text)) return text;

    // Mask emails: leave first char, mask middle, keep domain
    let masked = text.replace(/([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1***$2');

    // Mask phones: standard international or local 10-15 digit phone patterns
    masked = masked.replace(/(?:\+?\d{1,4}[-.\s]*)?(?:\(?\d{2,5}\)?[-.\s]*)?\d{3,5}[-.\s]*\d{4,5}/g, (match) => {
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

    if (typeof obj !== 'object') {
        if (typeof obj === 'string') {
            return maskScalarPII(obj);
        }
        return obj;
    }

    if (currentDepth >= 5) return '[MAX_DEPTH_EXCEEDED]';
    if (seen.has(obj)) return '[CIRCULAR_REFERENCE]';
    seen.add(obj);

    const sensitiveKeys = /(?:password|credential|secret|authorization[_-]?proof|token(?!s|count))/i;
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
            'domain_approved',
            'domain_revoked',
            'domain_rejected',
            'data_scope_changed',
            'financial_permission_changed',

            // Data Transfer Events
            'data_transferred',
            'leads_transferred',
            'deals_transferred',
            'inventory_transferred',

            // Entity Trackers
            'stage_changed',
            'assignment_changed',
            'lead_revived',
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
            'unauthorized_access_attempt',

            // Authority Verification Events
            'authority_settings_updated',
            'authority_link_created',
            'authority_run_created',
            'authority_run_policy_rejected',
            'authority_run_batch_processed',
            'authority_run_paused',
            'authority_run_resumed',
            'authority_run_completed',
            'authority_run_cancelled',
            'authority_review_submitted',
            'authority_changes_applied',
            'authority_changes_apply_compensated',
            'authority_orphan_snapshot_purged',
            'authority_orphan_cleanup_failed'
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
        enum: ['user', 'role', 'lead', 'deal', 'contact', 'company', 'inventory', 'payment', 'commission', 'campaign', 'domain', 'other', 'authority_settings', 'authority_run', 'authority_snapshot']
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
        enum: ['success', 'failure', 'warning', 'compensated'],
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
    timestamps: false, // We use custom timestamp field
    autoCreate: false,
    autoIndex: false
});


AuditLogSchema.pre('save', function (next) {
    if (this.errorMessage) {
        this.errorMessage = maskScalarPII(this.errorMessage);
    }
    if (this.userEmail) {
        this.userEmail = maskScalarPII(this.userEmail);
    }
    if (this.actorEmail) {
        this.actorEmail = maskScalarPII(this.actorEmail);
    }
    if (this.targetName) {
        this.targetName = maskScalarPII(this.targetName);
    }
    if (this.description) {
        this.description = maskScalarPII(this.description);
    }
    next();
});

// ========== Indexes ==========

AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ eventType: 1, timestamp: -1 });
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 }); // For recent logs

// Unique partial index for deterministic correlation idempotency (safe for null/undefined correlationId)
AuditLogSchema.index(
    { eventType: 1, correlationId: 1 },
    {
        unique: true,
        partialFilterExpression: { correlationId: { $type: 'string' } },
        name: 'unique_audit_event_correlation'
    }
);

// ========== Static Methods ==========

/**
 * Validates whether an existing MongoDB index matches the exact required specification for idempotency:
 * - Name: 'unique_audit_event_correlation'
 * - Keys: ['eventType', 'correlationId'] in exact order, both sort 1, exactly 2 keys
 * - unique: true
 * - partialFilterExpression: contains exactly one field 'correlationId'
 * - correlationId filter contains exactly one operator: $type: 'string'
 * Rejects extra nested operators ($gt, $exists, etc.), extra filter fields, incorrect order/specification.
 */
AuditLogSchema.statics.verifyIdempotencyIndexSpec = function (indexObj) {
    if (!indexObj || typeof indexObj !== 'object' || Array.isArray(indexObj)) {
        return { valid: false, reason: 'Index does not exist or is invalid' };
    }

    if (indexObj.name !== 'unique_audit_event_correlation') {
        return { valid: false, reason: `Index name mismatch: expected 'unique_audit_event_correlation', got '${indexObj.name}'` };
    }

    const key = indexObj.key;
    if (!key || typeof key !== 'object' || Array.isArray(key)) {
        return { valid: false, reason: 'Index key is missing or invalid' };
    }

    const keyNames = Object.keys(key);
    if (keyNames.length !== 2 || keyNames[0] !== 'eventType' || keyNames[1] !== 'correlationId') {
        return { valid: false, reason: `Index key order/fields mismatch: expected ['eventType', 'correlationId'], got ${JSON.stringify(keyNames)}` };
    }

    if (key.eventType !== 1 || key.correlationId !== 1) {
        return { valid: false, reason: `Index key sort directions mismatch: expected { eventType: 1, correlationId: 1 }, got ${JSON.stringify(key)}` };
    }

    if (indexObj.unique !== true) {
        return { valid: false, reason: `Index unique property mismatch: expected unique: true, got ${indexObj.unique}` };
    }

    const pfe = indexObj.partialFilterExpression;
    if (!pfe || typeof pfe !== 'object' || Array.isArray(pfe)) {
        return { valid: false, reason: 'Index partialFilterExpression is missing or invalid' };
    }

    const pfeFields = Object.keys(pfe);
    if (pfeFields.length !== 1 || pfeFields[0] !== 'correlationId') {
        return { valid: false, reason: `Index partialFilterExpression must contain exactly 'correlationId', got fields: ${JSON.stringify(pfeFields)}` };
    }

    const corrFilter = pfe.correlationId;
    if (!corrFilter || typeof corrFilter !== 'object' || Array.isArray(corrFilter)) {
        return { valid: false, reason: 'correlationId filter in partialFilterExpression must be an operator object' };
    }

    const corrOperators = Object.keys(corrFilter);
    if (corrOperators.length !== 1 || corrOperators[0] !== '$type') {
        return { valid: false, reason: `correlationId in partialFilterExpression must contain exactly one operator '$type', got: ${JSON.stringify(corrOperators)}` };
    }

    if (corrFilter.$type !== 'string') {
        return { valid: false, reason: `correlationId.$type must be 'string', got: ${JSON.stringify(corrFilter.$type)}` };
    }

    return { valid: true };
};

/**
 * Read-only preflight analysis for duplicate (eventType, correlationId) records.
 * Reports duplicate groups, counts, IDs, timestamps, eventTypes, and deterministic retention candidate.
 * DOES NOT modify, archive, or delete any records.
 * If the native AuditLog collection does not exist, returns an empty report without creating any collection, index, or document.
 */
AuditLogSchema.statics.getDuplicatePreflightReport = async function () {
    const collection = this.collection;
    if (!collection) {
        return { totalDuplicateGroups: 0, totalDuplicateRecords: 0, groups: [] };
    }

    // Strictly read-only: Check if native collection exists without creating it
    const rawDb = this.db?.db || this.collection?.conn?.db || mongoose.connection?.db;
    if (rawDb) {
        const collections = await rawDb.listCollections({ name: collection.name }).toArray();
        if (collections.length === 0) {
            return { totalDuplicateGroups: 0, totalDuplicateRecords: 0, groups: [] };
        }
    }

    const duplicates = await this.aggregate([
        { $match: { correlationId: { $type: 'string' } } },
        {
            $group: {
                _id: { eventType: '$eventType', correlationId: '$correlationId' },
                count: { $sum: 1 },
                docs: {
                    $push: {
                        _id: '$_id',
                        timestamp: '$timestamp',
                        eventType: '$eventType',
                        correlationId: '$correlationId',
                        targetType: '$targetType',
                        targetId: '$targetId',
                        status: '$status'
                    }
                }
            }
        },
        { $match: { count: { $gt: 1 } } }
    ]);

    if (!duplicates || duplicates.length === 0) {
        return { totalDuplicateGroups: 0, totalDuplicateRecords: 0, groups: [] };
    }

    let totalDuplicateRecords = 0;
    const groups = duplicates.map(group => {
        // Deterministic sort: timestamp ascending, then _id ascending as tie-breaker
        const sortedDocs = [...group.docs].sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return String(a._id).localeCompare(String(b._id));
        });

        const retainedDoc = sortedDocs[0];
        const duplicateDocs = sortedDocs.slice(1);
        totalDuplicateRecords += duplicateDocs.length;

        return {
            eventType: group._id.eventType,
            correlationId: group._id.correlationId,
            totalCount: group.count,
            duplicateCount: duplicateDocs.length,
            retainedId: retainedDoc._id,
            retainedTimestamp: retainedDoc.timestamp,
            allDocs: sortedDocs,
            duplicateIds: duplicateDocs.map(d => d._id),
            duplicateDetails: duplicateDocs.map(d => ({
                _id: d._id,
                timestamp: d.timestamp,
                eventType: d.eventType,
                correlationId: d.correlationId,
                targetType: d.targetType,
                targetId: d.targetId,
                status: d.status
            }))
        };
    });

    return {
        totalDuplicateGroups: groups.length,
        totalDuplicateRecords,
        groups
    };
};

/**
 * Canonical deep equality comparison for any two values (scalars, dates, ObjectIds, arrays, nested objects).
 */
function areCanonicalValuesEqual(val1, val2) {
    if (val1 === val2) return true;
    if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
        return val1 === val2;
    }

    // Handle NaN
    if (typeof val1 === 'number' && typeof val2 === 'number') {
        if (Number.isNaN(val1) && Number.isNaN(val2)) return true;
        return val1 === val2;
    }

    // Handle Date objects or ISO date strings
    if (val1 instanceof Date && val2 instanceof Date) {
        return val1.getTime() === val2.getTime();
    }
    if (val1 instanceof Date && typeof val2 === 'string') {
        const t2 = new Date(val2).getTime();
        return !isNaN(t2) && val1.getTime() === t2;
    }
    if (typeof val1 === 'string' && val2 instanceof Date) {
        const t1 = new Date(val1).getTime();
        return !isNaN(t1) && t1 === val2.getTime();
    }
    if (typeof val1 === 'string' && typeof val2 === 'string') {
        if (val1 === val2) return true;
        const t1 = new Date(val1).getTime();
        const t2 = new Date(val2).getTime();
        if (!isNaN(t1) && !isNaN(t2) && t1 === t2 && val1.includes('T') && val2.includes('T')) {
            return true;
        }
        return false;
    }

    // Handle MongoDB / Mongoose ObjectId
    const isOid1 = val1 instanceof mongoose.Types.ObjectId ||
        (val1 && typeof val1 === 'object' && typeof val1.toHexString === 'function') ||
        (val1 && val1._bsontype === 'ObjectID');
    const isOid2 = val2 instanceof mongoose.Types.ObjectId ||
        (val2 && typeof val2 === 'object' && typeof val2.toHexString === 'function') ||
        (val2 && val2._bsontype === 'ObjectID');

    if (isOid1 && isOid2) {
        return String(val1) === String(val2);
    }
    if (isOid1 && typeof val2 === 'string') {
        return String(val1) === val2;
    }
    if (typeof val1 === 'string' && isOid2) {
        return val1 === String(val2);
    }
    if (isOid1 !== isOid2) {
        return false;
    }

    // Handle Arrays
    if (Array.isArray(val1) || Array.isArray(val2)) {
        if (!Array.isArray(val1) || !Array.isArray(val2)) return false;
        if (val1.length !== val2.length) return false;
        for (let i = 0; i < val1.length; i++) {
            if (!areCanonicalValuesEqual(val1[i], val2[i])) return false;
        }
        return true;
    }

    // Handle Plain Objects (e.g. metadata, changes, etc.)
    if (typeof val1 === 'object' && typeof val2 === 'object') {
        const keys1 = Object.keys(val1).filter(k => val1[k] !== undefined);
        const keys2 = Object.keys(val2).filter(k => val2[k] !== undefined);
        if (keys1.length !== keys2.length) return false;
        const set2 = new Set(keys2);
        for (const k of keys1) {
            if (!set2.has(k)) return false;
        }
        for (const k of keys1) {
            if (!areCanonicalValuesEqual(val1[k], val2[k])) return false;
        }
        return true;
    }

    return val1 === val2;
}

/**
 * Canonical full-document comparison between source AuditLog record and archived document:
 * - Compares every persisted source AuditLog field, including description, metadata, changes,
 *   user/actor fields, status, timestamps, and error details.
 * - Excludes ONLY explicitly defined archivalMetadata from comparison.
 * - Detects missing, modified, or unexpected source fields.
 */
function isContentEquivalent(src, archived) {
    if (!src || !archived || typeof src !== 'object' || typeof archived !== 'object') {
        return false;
    }

    // Filter out undefined values and explicitly exclude ONLY archivalMetadata
    const srcKeys = Object.keys(src).filter(k => k !== 'archivalMetadata' && src[k] !== undefined);
    const archivedKeys = Object.keys(archived).filter(k => k !== 'archivalMetadata' && archived[k] !== undefined);

    if (srcKeys.length !== archivedKeys.length) {
        return false;
    }

    const archivedKeySet = new Set(archivedKeys);
    for (const key of srcKeys) {
        if (!archivedKeySet.has(key)) {
            return false;
        }
    }

    for (const key of srcKeys) {
        if (!areCanonicalValuesEqual(src[key], archived[key])) {
            return false;
        }
    }

    return true;
}

AuditLogSchema.statics.isContentEquivalent = isContentEquivalent;

/**
 * Builds an optimistic concurrency filter matching the exact persisted version of an AuditLog document.
 * Matches:
 * - _id
 * - All persisted fields (either exact value or { $exists: false } if undefined)
 * - Exact top-level key-set validation:
 *   1. Same number of keys
 *   2. Exact same key names as the verified source document (prevents unexpected key replacing existing key)
 */
function buildOptimisticFilter(sourceDoc) {
    if (!sourceDoc || typeof sourceDoc !== 'object') {
        throw new Error('INVALID_DOCUMENT: sourceDoc must be an object');
    }

    const PERSISTED_FIELDS = [
        'eventType',
        'userId',
        'userName',
        'userEmail',
        'actorId',
        'actorName',
        'actorEmail',
        'targetType',
        'targetId',
        'targetName',
        'description',
        'changes',
        'metadata',
        'ipAddress',
        'userAgent',
        'requestUrl',
        'requestMethod',
        'status',
        'department',
        'errorMessage',
        'correlationId',
        'timestamp'
    ];

    const filter = { _id: sourceDoc._id };

    for (const field of PERSISTED_FIELDS) {
        if (sourceDoc[field] === undefined) {
            filter[field] = { $exists: false };
        } else {
            filter[field] = sourceDoc[field];
        }
    }

    if (sourceDoc.__v !== undefined) {
        filter.__v = sourceDoc.__v;
    }

    // Exact top-level key-set validation:
    // 1. Same number of keys
    // 2. Exact same key names as the verified source document (prevents unexpected key replacing existing key)
    const expectedKeys = Object.keys(sourceDoc).filter(k => sourceDoc[k] !== undefined);
    filter.$expr = {
        $and: [
            { $eq: [{ $size: { $objectToArray: '$$ROOT' } }, expectedKeys.length] },
            { $setEquals: [{ $map: { input: { $objectToArray: '$$ROOT' }, as: 'entry', in: '$$entry.k' } }, expectedKeys] }
        ]
    };

    return filter;
}

AuditLogSchema.statics.buildOptimisticFilter = buildOptimisticFilter;

/**
 * Approved reconciliation procedure:
 * 1. Executes read-only preflight to deterministically identify duplicate records.
 * 2. Fetches full original AuditLog documents and preserves them in a verifiable archive collection.
 *    - Crash-resumable: checks existing archive documents against source identity and content using canonical full-document comparison.
 *    - Inserts only missing documents; never overwrites conflicting documents.
 * 3. Verifies every duplicate source record is safely archived before deleting anything from AuditLog.
 * 4. Re-fetches and verifies that every source document still matches the exact version that was archived.
 * 5. Uses atomic/optimistic concurrency protection between source verification and deletion:
 *    - Ensures a source record can be deleted ONLY if the exact version verified against its archived counterpart is still the version being deleted.
 *    - Prefers transaction-backed atomicity where supported, with safe optimistic fallback for standalone MongoDB deployments.
 *    - Never falls back to unconditional deletion by _id.
 *    - Preserves mutated records in primary AuditLog and safely aborts reconciliation on conflict.
 */
AuditLogSchema.statics.archiveAndReconcileDuplicates = async function (options = {}) {
    const preflight = await this.getDuplicatePreflightReport();
    if (preflight.totalDuplicateGroups === 0) {
        return { success: true, archivedCount: 0, newlyArchivedCount: 0, removedCount: 0, groupsReconciled: 0 };
    }

    const allDuplicateIds = preflight.groups.flatMap(g => g.duplicateIds);
    if (allDuplicateIds.length === 0) {
        return { success: true, archivedCount: 0, newlyArchivedCount: 0, removedCount: 0, groupsReconciled: 0 };
    }

    const archiveCollectionName = options.archiveCollectionName || 'auditlogs_archive_duplicates';
    const archiveColl = this.db.db.collection(archiveCollectionName);

    // 1. Fetch complete original records from primary AuditLog collection
    const docsToArchive = await this.find({ _id: { $in: allDuplicateIds } }).lean();
    if (docsToArchive.length !== allDuplicateIds.length) {
        throw new Error(`ARCHIVE_COUNT_MISMATCH: Expected ${allDuplicateIds.length} original documents, found ${docsToArchive.length} in database`);
    }

    const now = new Date();
    const missingDocsToInsert = [];

    // 2. Check each duplicate document against archive: insert only missing, check canonical content integrity
    for (const doc of docsToArchive) {
        const existingArchiveDoc = await archiveColl.findOne({ _id: doc._id });
        if (existingArchiveDoc) {
            // Document already in archive (e.g. from prior interrupted run): verify canonical full-document content
            if (!isContentEquivalent(doc, existingArchiveDoc)) {
                throw new Error(`ARCHIVE_CONTENT_CONFLICT: Conflicting document already exists in archive collection for _id ${doc._id}. Content mismatch detected; refusing to overwrite or discard.`);
            }
            // Content matches: document is already safely preserved in archive
        } else {
            // Missing from archive: prepare for idempotent insertion
            const group = preflight.groups.find(g => g.duplicateIds.some(id => String(id) === String(doc._id)));
            missingDocsToInsert.push({
                ...doc,
                archivalMetadata: {
                    archivedAt: now,
                    retainedRecordId: group?.retainedId || null,
                    archivalReason: 'DUPLICATE_CORRELATION_ID_RECONCILIATION',
                    migrationVersion: 'P4.1_HOTFIX'
                }
            });
        }
    }

    // 3. Insert ONLY missing documents (idempotent, handles concurrent racing workers)
    let newlyArchivedCount = 0;
    if (missingDocsToInsert.length > 0) {
        try {
            const insertRes = await archiveColl.insertMany(missingDocsToInsert, { ordered: false });
            newlyArchivedCount = insertRes.insertedCount || missingDocsToInsert.length;
        } catch (insertErr) {
            const isDupKey = insertErr.code === 11000 || (insertErr.writeErrors && insertErr.writeErrors.some(e => e.code === 11000));
            if (!isDupKey) {
                throw insertErr;
            }
        }
    }

    // 4. Verify that 100% of duplicate source records are safely and verifiably in archive
    for (const doc of docsToArchive) {
        const verifiedDoc = await archiveColl.findOne({ _id: doc._id });
        if (!verifiedDoc) {
            throw new Error(`ARCHIVE_VERIFICATION_FAILED: Duplicate source record ${doc._id} is not present in archive collection`);
        }
        if (!isContentEquivalent(doc, verifiedDoc)) {
            throw new Error(`ARCHIVE_VERIFICATION_FAILED: Content verification failed for record ${doc._id} in archive collection`);
        }
    }

    // 5. CRITICAL PRE-DELETION VERIFICATION:
    // Re-fetch and verify that every source document still matches the exact version that was archived.
    // Abort without deleting any source document if any source/archive mismatch is detected.
    const refetchedSourceDocs = await this.find({ _id: { $in: allDuplicateIds } }).lean();
    if (refetchedSourceDocs.length !== allDuplicateIds.length) {
        throw new Error(`SOURCE_VERIFICATION_FAILED: Expected ${allDuplicateIds.length} source documents upon re-fetch, found ${refetchedSourceDocs.length}`);
    }

    for (const sourceDoc of refetchedSourceDocs) {
        const archivedDoc = await archiveColl.findOne({ _id: sourceDoc._id });
        if (!archivedDoc) {
            throw new Error(`SOURCE_VERIFICATION_FAILED: Re-fetched source record ${sourceDoc._id} is missing from archive collection`);
        }
        if (!isContentEquivalent(sourceDoc, archivedDoc)) {
            throw new Error(`SOURCE_VERIFICATION_FAILED: Re-fetched source record ${sourceDoc._id} does not match the archived document version`);
        }
    }

    // 6. ATOMIC & OPTIMISTIC CONCURRENCY DELETION:
    // Ensure that a source record can be deleted ONLY if the exact version verified against
    // its archived counterpart is still the version being deleted.
    // Prefer transaction-backed atomicity where supported, with safe optimistic fallback for standalone MongoDB.
    const conn = this.db || mongoose.connection;
    const client = conn?.client || this.collection?.conn?.client || mongoose.connection?.client;
    const topologyType = client?.topology?.description?.type;
    const supportsTransactions = (topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded') &&
        (typeof conn?.startSession === 'function' || typeof client?.startSession === 'function' || typeof mongoose.startSession === 'function');

    let removedCount = 0;
    let session = null;

    try {
        if (supportsTransactions) {
            if (typeof conn?.startSession === 'function') {
                session = await conn.startSession();
            } else if (typeof client?.startSession === 'function') {
                session = await client.startSession();
            } else {
                session = await mongoose.startSession();
            }
            session.startTransaction();
        }

        for (const sourceDoc of refetchedSourceDocs) {
            const archivedDoc = await archiveColl.findOne({ _id: sourceDoc._id });
            if (!archivedDoc) {
                const err = new Error(`SOURCE_CONFLICT: Re-fetched source record ${sourceDoc._id} missing from archive collection`);
                err.code = 'SOURCE_CONFLICT';
                throw err;
            }

            // In-flight re-check against current DB state
            let findQuery = this.findOne({ _id: sourceDoc._id });
            if (session && typeof findQuery?.session === 'function') {
                findQuery = findQuery.session(session);
            }
            const currentDoc = await findQuery.lean();

            if (!currentDoc) {
                // Document was already removed by another concurrent worker; safe to proceed
                continue;
            }

            if (!isContentEquivalent(currentDoc, archivedDoc)) {
                const conflictErr = new Error(`SOURCE_CONFLICT: Source document ${sourceDoc._id} does not match the verified archived document version. Aborting reconciliation to preserve primary audit history.`);
                conflictErr.code = 'SOURCE_CONFLICT';
                throw conflictErr;
            }

            // Build exact optimistic filter covering all persisted fields and key count
            const optimisticFilter = buildOptimisticFilter(currentDoc);

            // Execute conditional delete
            const delOptions = session ? { session } : undefined;
            let delCall = this.deleteOne(optimisticFilter, delOptions);
            if (session && typeof delCall?.session === 'function') {
                delCall = delCall.session(session);
            }
            const delRes = await delCall;

            if (delRes.deletedCount === 0) {
                // Deletion did not match: check if document still exists (i.e. was mutated)
                let checkSurviving = this.findOne({ _id: sourceDoc._id });
                if (session && typeof checkSurviving?.session === 'function') {
                    checkSurviving = checkSurviving.session(session);
                }
                const survivingDoc = await checkSurviving.lean();

                if (survivingDoc) {
                    const conflictErr = new Error(`SOURCE_CONFLICT: Source document ${sourceDoc._id} was modified concurrently before deletion. Aborting reconciliation to preserve primary audit history.`);
                    conflictErr.code = 'SOURCE_CONFLICT';
                    throw conflictErr;
                }
                // If not surviving, it was deleted concurrently
            } else {
                removedCount++;
            }
        }

        if (session && session.inTransaction()) {
            await session.commitTransaction();
        }
    } catch (err) {
        if (session && session.inTransaction()) {
            try {
                await session.abortTransaction();
            } catch (_) {}
        }
        if (err.code === 112 || err.codeName === 'WriteConflict' || err.message?.includes('Write conflict')) {
            const conflictErr = new Error(`SOURCE_CONFLICT: Write conflict detected during source document deletion. Document was modified concurrently; aborting reconciliation to preserve primary audit history.`);
            conflictErr.code = 'SOURCE_CONFLICT';
            conflictErr.cause = err;
            throw conflictErr;
        }
        throw err;
    } finally {
        if (session) {
            try {
                await session.endSession();
            } catch (_) {}
        }
    }

    const remainingCount = await this.countDocuments({ _id: { $in: allDuplicateIds } });
    if (remainingCount !== 0) {
        throw new Error(`DELETION_VERIFICATION_FAILED: ${remainingCount} duplicate record(s) still present in AuditLog collection`);
    }

    return {
        success: true,
        archivedCount: docsToArchive.length,
        newlyArchivedCount,
        removedCount,
        groupsReconciled: preflight.totalDuplicateGroups,
        archiveCollection: archiveCollectionName,
        preflight
    };
};

/**
 * Migration helper for ensuring idempotency index:
 * 1. Verifies existing index if present against exact specification. Rejects incorrect specification.
 * 2. Runs read-only preflight. If duplicates exist, fails safely without modifying/deleting records.
 * 3. Builds partial unique index on { eventType: 1, correlationId: 1 }.
 * 4. Detects concurrent write races (code 11000) during build and aborts safely.
 * 5. Verifies created index properties and propagates all errors.
 */
AuditLogSchema.statics.ensureIdempotencyIndex = async function () {
    const collection = this.collection;
    if (!collection) {
        throw new Error('AuditLog collection is not initialized');
    }

    // Ensure collection exists in native db to avoid ns does not exist error on fresh DBs
    if (this.db && this.db.db) {
        const collections = await this.db.db.listCollections({ name: collection.name }).toArray();
        if (collections.length === 0) {
            await this.db.db.createCollection(collection.name);
        }
    }

    // 1. Check existing indexes for name or key collisions
    const existingIndexes = await collection.indexes();
    const existingSameName = existingIndexes.find(idx => idx.name === 'unique_audit_event_correlation');
    if (existingSameName) {
        const specCheck = this.verifyIdempotencyIndexSpec(existingSameName);
        if (!specCheck.valid) {
            const specErr = new Error(`INVALID_INDEX_SPECIFICATION: Existing index 'unique_audit_event_correlation' does not match required specification: ${specCheck.reason}`);
            specErr.code = 'INVALID_INDEX_SPECIFICATION';
            specErr.existingIndex = existingSameName;
            throw specErr;
        }
        return { created: false, verified: true, index: existingSameName };
    }

    const existingSameKey = existingIndexes.find(
        idx => idx.key && idx.key.eventType === 1 && idx.key.correlationId === 1
    );
    if (existingSameKey) {
        const specCheck = this.verifyIdempotencyIndexSpec(existingSameKey);
        if (!specCheck.valid) {
            const specErr = new Error(`INVALID_INDEX_SPECIFICATION: Existing index '${existingSameKey.name}' covering (eventType, correlationId) does not match required specification: ${specCheck.reason}`);
            specErr.code = 'INVALID_INDEX_SPECIFICATION';
            specErr.existingIndex = existingSameKey;
            throw specErr;
        }
        return { created: false, verified: true, index: existingSameKey };
    }

    // 2. Read-only preflight check: fail closed without deleting records if duplicates exist
    const preflight = await this.getDuplicatePreflightReport();
    if (preflight.totalDuplicateGroups > 0) {
        const dupErr = new Error(`DUPLICATE_AUDIT_LOGS_DETECTED: Preflight detected ${preflight.totalDuplicateGroups} duplicate correlationId group(s) with ${preflight.totalDuplicateRecords} duplicate record(s). Cannot create unique index without approved archival reconciliation.`);
        dupErr.code = 'DUPLICATE_AUDIT_LOGS_DETECTED';
        dupErr.preflight = preflight;
        throw dupErr;
    }

    // 3. Build the partial unique index
    try {
        await collection.createIndex(
            { eventType: 1, correlationId: 1 },
            {
                unique: true,
                partialFilterExpression: { correlationId: { $type: 'string' } },
                name: 'unique_audit_event_correlation'
            }
        );
    } catch (createErr) {
        if (createErr.code === 11000 || createErr.code === 11001) {
            const raceErr = new Error(`CONCURRENT_DUPLICATES_DETECTED: Concurrent writes introduced duplicate correlationId records during index creation: ${createErr.message}`);
            raceErr.code = 'CONCURRENT_DUPLICATES_DETECTED';
            raceErr.originalError = createErr;
            throw raceErr;
        }
        throw createErr;
    }

    // 4. Verify created index matches exact required properties
    const updatedIndexes = await collection.indexes();
    const createdIdx = updatedIndexes.find(idx => idx.name === 'unique_audit_event_correlation');
    const finalCheck = this.verifyIdempotencyIndexSpec(createdIdx);
    if (!finalCheck.valid) {
        const verifyErr = new Error(`INDEX_VERIFICATION_FAILED: Created index does not match required specification: ${finalCheck.reason}`);
        verifyErr.code = 'INDEX_VERIFICATION_FAILED';
        throw verifyErr;
    }

    return { created: true, verified: true, index: createdIdx };
};

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
        userEmail: maskScalarPII(user?.email),
        actorId,
        actorName: actor?.fullName,
        actorEmail: maskScalarPII(actor?.email),
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
        userEmail: maskScalarPII(fromUser?.email),
        actorId,
        actorName: actor?.fullName,
        actorEmail: maskScalarPII(actor?.email),
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
        userEmail: maskScalarPII(user?.email || 'system@crm.local'),
        department,
        targetType,
        targetId,
        targetName: maskScalarPII(targetName),
        description: maskScalarPII(description),
        changes: redactedChanges,
        metadata: options.metadata || { origin: userId ? 'authenticated_user' : 'unknown' },
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        status: 'success',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

const AI_METADATA_ALLOWLIST = new Set([
    'model',
    'modelVersion',
    'provider',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'inputTokenCount',
    'outputTokenCount',
    'tokenUsage',
    'durationMs',
    'latencyMs',
    'confidence',
    'confidenceScore',
    'requestInfo',
    'details',
    'reason',
    'tags',
    'flags',
    'promptHash',
    'completionHash',
    'executionId',
    'jobId',
    'callerId',
    'context'
]);

// Log AI event
AuditLogSchema.statics.logAIEvent = async function (eventType, targetId, capability, policyVersion, decision, metadata = {}, options = {}) {
    const mongooseOptions = options?.session ? { session: options.session } : {};

    let redactedMetadata;
    try {
        const filtered = {};
        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
            for (const key of Object.keys(metadata)) {
                if (AI_METADATA_ALLOWLIST.has(key)) {
                    filtered[key] = metadata[key];
                }
            }
        }
        redactedMetadata = redactSensitive(filtered);
        if (redactedMetadata?.requestInfo && 'url' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.url = normalizeUrl(redactedMetadata.requestInfo.url);
        if (redactedMetadata?.requestInfo && 'rawUrl' in redactedMetadata.requestInfo) redactedMetadata.requestInfo.rawUrl = normalizeUrl(redactedMetadata.requestInfo.rawUrl);
    } catch (err) {
        redactedMetadata = { _redaction_error: '[REDACTION_FAILED_PAYLOAD_DROPPED]' };
    }

    const finalMetadata = {
        ...(typeof redactedMetadata === 'object' && redactedMetadata !== null ? redactedMetadata : {}),
        capability,
        policyVersion,
        decision
    };

    return this.create([{
        eventType,
        targetType: 'other',
        targetId,
        description: maskScalarPII(`AI Policy Decision: ${decision}`),
        metadata: finalMetadata,
        status: decision === 'ALLOWED' ? 'success' : 'warning',
        correlationId: options.correlationId
    }], mongooseOptions).then(docs => docs[0]);
};

export default mongoose.model("AuditLog", AuditLogSchema);
