import mongoose from 'mongoose';
import { computeSnapshotContentHash } from '../services/authority/authorityNormalizer.js';
import { createImmutableSet, deepFreeze } from '../services/authority/authorityFieldDictionary.js';

/**
 * PropertyVerificationSnapshot
 * 
 * Append-only normalized source facts from an authority lookup.
 * Each snapshot is immutable once created — never updated, only superseded.
 * 
 * Does NOT store: raw HTML, cookies, CSRF tokens, session IDs,
 * authentication headers, credentials, or unnecessary personal information.
 * 
 * Owner/allottee personal-data persistence remains out of scope until its
 * lawful basis, permitted fields, and retention policy are confirmed.
 */

const DATA_QUALITY_STATUSES = Object.freeze([
    'COMPLETE',           // All expected fields present and parsed
    'PARTIAL',            // Some fields missing or unparseable
    'MINIMAL',            // Very few fields returned
    'PARSE_ERRORS',       // Significant parsing issues
    'SOURCE_ERROR',       // Source returned an error
    'RESTRICTED'          // Data restricted/masked by source
]);

const PropertyVerificationSnapshotSchema = new mongoose.Schema({
    // ========== Identity ==========
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    authorityCode: {
        type: String,
        required: true,
        enum: ['HSVP', 'CHD', 'GMADA']
    },
    linkId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyAuthorityLink',
        required: true,
        index: true
    },
    runItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PropertyVerificationRunItem',
        default: null
    },

    // ========== Source Reference ==========
    // Approved source URL (NOT containing session tokens or credentials)
    sourceReferenceUrl: {
        type: String,
        default: null  // e.g., the public portal page URL (without auth params)
    },
    observedAt: {
        type: Date,
        required: true,
        default: Date.now
    },

    // ========== Versioning ==========
    parserVersion: {
        type: String,
        required: true,
        default: '1.2.0'  // Phase 1.2 contract version
    },
    mappingVersion: {
        type: String,
        required: true,
        default: '1.2.0'
    },
    policyVersion: {
        type: String,
        default: null
    },

    // ========== Identity Evidence ==========
    // The identity fields used to look up this record
    identityEvidence: {
        compositeKey: { type: String, default: null },
        sectorNumber: { type: String, default: null },
        phaseCode: { type: String, default: null },
        blockCode: { type: String, default: null },
        propertyId: { type: String, default: null },
        urbanEstate: { type: String, default: null },
        schemeName: { type: String, default: null }
    },

    // ========== Normalized Facts ==========
    // Uses the Phase 1 contract's canonical field format:
    // { value: <normalized>, sentinel: <string|null>, sourceLabel: <string|null>, rawValue: <string|null> }
    normalizedData: {
        propertyId: { type: mongoose.Schema.Types.Mixed, default: null },
        fileNumber: { type: mongoose.Schema.Types.Mixed, default: null },
        formNumber: { type: mongoose.Schema.Types.Mixed, default: null },
        propertyType: { type: mongoose.Schema.Types.Mixed, default: null },
        propertyCategory: { type: mongoose.Schema.Types.Mixed, default: null },
        sectorNumber: { type: mongoose.Schema.Types.Mixed, default: null },
        phaseCode: { type: mongoose.Schema.Types.Mixed, default: null },
        blockCode: { type: mongoose.Schema.Types.Mixed, default: null },
        schemeName: { type: mongoose.Schema.Types.Mixed, default: null },
        urbanEstate: { type: mongoose.Schema.Types.Mixed, default: null },
        estateOffice: { type: mongoose.Schema.Types.Mixed, default: null },
        propertySize: { type: mongoose.Schema.Types.Mixed, default: null },
        propertyAreaValue: { type: mongoose.Schema.Types.Mixed, default: null },
        propertyAreaUnit: { type: mongoose.Schema.Types.Mixed, default: null },
        allotmentMode: { type: mongoose.Schema.Types.Mixed, default: null },
        allotmentPrice: { type: mongoose.Schema.Types.Mixed, default: null },
        currentDues: { type: mongoose.Schema.Types.Mixed, default: null },
        totalPaid: { type: mongoose.Schema.Types.Mixed, default: null },
        allotmentDate: { type: mongoose.Schema.Types.Mixed, default: null },
        transferDate: { type: mongoose.Schema.Types.Mixed, default: null },
        possessionDate: { type: mongoose.Schema.Types.Mixed, default: null },
        possessionStatus: { type: mongoose.Schema.Types.Mixed, default: null },
        authorityStatus: { type: mongoose.Schema.Types.Mixed, default: null },
        buildingPlanApproved: { type: mongoose.Schema.Types.Mixed, default: null },
        occupancyCertificate: { type: mongoose.Schema.Types.Mixed, default: null },
        litigationStatus: { type: mongoose.Schema.Types.Mixed, default: null },
        mortgageStatus: { type: mongoose.Schema.Types.Mixed, default: null },
        duesStatus: { type: mongoose.Schema.Types.Mixed, default: null },
        leaseRentStatus: { type: mongoose.Schema.Types.Mixed, default: null },
        ownerName: { type: mongoose.Schema.Types.Mixed, default: null },
        verificationStatus: { type: mongoose.Schema.Types.Mixed, default: null },
        matchConfidence: { type: mongoose.Schema.Types.Mixed, default: null }
    },

    // ========== Data Quality ==========
    dataQuality: {
        status: {
            type: String,
            enum: DATA_QUALITY_STATUSES,
            default: 'PARTIAL'
        },
        fieldsReturned: { type: Number, default: 0 },
        fieldsWithSentinels: { type: Number, default: 0 },
        fieldsWithValues: { type: Number, default: 0 },
        parseErrors: { type: [String], default: [] }
    },

    // ========== Owner Data Policy ==========
    // Owner/allottee personal data is NOT persisted until lawful basis confirmed
    ownerDataPresent: {
        type: Boolean,
        default: false  // True if source returned owner data (but we don't store it)
    },
    ownerDataRedacted: {
        type: Boolean,
        default: true   // Always true in Phase 2 — owner data is never stored
    },

    // ========== Immutability Flag ==========
    // Snapshots are append-only. This flag is set on creation and never changed.
    isSealed: {
        type: Boolean,
        default: true
    },

    // ========== Cryptographic Integrity ==========
    // Deterministic SHA-256 hash of normalized permitted facts (excludes cookies, tokens, PII)
    contentHash: {
        type: String,
        default: null,
        index: true
    }
}, {
    timestamps: true,
    collection: 'property_verification_snapshots'
});

// ========== Indexes ==========
PropertyVerificationSnapshotSchema.index({ tenantId: 1, linkId: 1, observedAt: -1 });
PropertyVerificationSnapshotSchema.index({ tenantId: 1, authorityCode: 1, observedAt: -1 });
PropertyVerificationSnapshotSchema.index({ linkId: 1, observedAt: -1 });
PropertyVerificationSnapshotSchema.index({ tenantId: 1, contentHash: 1 });
PropertyVerificationSnapshotSchema.index({ runItemId: 1 });

// Module-private policy collection (inaccessible and unmodifiable from outside)
const _PERMITTED_SNAPSHOT_NORMALIZED_KEYS = new Set([
    'propertyId',
    'fileNumber',
    'formNumber',
    'propertyType',
    'propertyCategory',
    'sectorNumber',
    'phaseCode',
    'blockCode',
    'schemeName',
    'urbanEstate',
    'estateOffice',
    'propertySize',
    'propertyAreaValue',
    'propertyAreaUnit',
    'allotmentMode',
    'allotmentPrice',
    'currentDues',
    'totalPaid',
    'allotmentDate',
    'transferDate',
    'possessionDate',
    'possessionStatus',
    'authorityStatus',
    'buildingPlanApproved',
    'occupancyCertificate',
    'litigationStatus',
    'mortgageStatus',
    'duesStatus',
    'leaseRentStatus',
    'verificationStatus',
    'matchConfidence',
    'ownerName' // Schema field: value is strictly coerced to null
]);

/**
 * Checks whether a key is permitted in the snapshot normalizedData payload.
 * Queries the private unmodifiable Set.
 * 
 * @param {string} key
 * @returns {boolean}
 */
export function isPermittedSnapshotNormalizedKey(key) {
    return _PERMITTED_SNAPSHOT_NORMALIZED_KEYS.has(key);
}

/**
 * Returns a sorted defensive copy of all permitted snapshot normalized keys.
 * 
 * @returns {string[]}
 */
export function getPermittedSnapshotNormalizedKeys() {
    return Array.from(_PERMITTED_SNAPSHOT_NORMALIZED_KEYS).sort();
}

export const PERMITTED_SNAPSHOT_NORMALIZED_KEYS = createImmutableSet(_PERMITTED_SNAPSHOT_NORMALIZED_KEYS);

const PII_KEY_REGEX = /^(owner|allottee|buyer|seller|contact|father|spouse|person|phone|mobile|email|aadhaar|pan|address|resident|citizen|passport|voter|dob|birth|gender)/i;
const SENSITIVE_KEY_REGEX = /(token|secret|password|auth|bearer|cookie|session|jwt|csrf|credential|apikey|api_key|html|payload)/i;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const AADHAAR_REGEX = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/;
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/i;
const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i;

function isSensitiveKey(key) {
    if (!key || typeof key !== 'string') return false;
    return PII_KEY_REGEX.test(key) || SENSITIVE_KEY_REGEX.test(key);
}

function scanForPII(val, seen = new WeakSet()) {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (EMAIL_REGEX.test(trimmed)) return true;
        if (AADHAAR_REGEX.test(trimmed)) return true;
        if (PAN_REGEX.test(trimmed)) return true;
        if (HTML_TAG_REGEX.test(trimmed)) return true;
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15) return true;
        return false;
    }
    if (typeof val === 'object') {
        if (seen.has(val)) return false;
        seen.add(val);
        if (Array.isArray(val)) {
            for (const item of val) {
                if (scanForPII(item, seen)) return true;
            }
            return false;
        }
        for (const [k, v] of Object.entries(val)) {
            if (isSensitiveKey(k)) return true;
            if (scanForPII(v, seen)) return true;
        }
    }
    return false;
}

function sanitizeMonetary(val) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
    if (val._sentinel || val.sentinel) {
        const s = val._sentinel || val.sentinel;
        return { _sentinel: typeof s === 'string' ? s.trim() : String(s) };
    }
    const sanitized = {};
    if (val.value !== undefined) {
        if (typeof val.value === 'number' && Number.isFinite(val.value)) {
            sanitized.value = val.value;
        } else if (typeof val.value === 'string' && val.value.trim() !== '' && !isNaN(Number(val.value))) {
            const num = Number(val.value);
            if (Number.isFinite(num)) sanitized.value = num;
            else sanitized.value = null;
        } else if (val.value === null) {
            sanitized.value = null;
        }
    }
    if (val.currency !== undefined && val.currency !== null) {
        if (typeof val.currency === 'string') {
            sanitized.currency = val.currency.trim().toUpperCase();
        }
    } else if (sanitized.value !== undefined) {
        sanitized.currency = 'INR';
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'object' && !Array.isArray(val)) {
        if (val._sentinel || val.sentinel) {
            const s = val._sentinel || val.sentinel;
            return { _sentinel: typeof s === 'string' ? s.trim() : String(s) };
        }
        if (val.date) {
            return sanitizeDate(val.date);
        }
    }
    return null;
}

function sanitizeString(val, key = null) {
    if (!val && val !== '') return null;
    if (typeof val === 'string') {
        const stripped = val
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<\/?[a-z][^>]*>/gi, '')
            .trim();
        return stripped || null;
    }
    if (typeof val === 'object' && !Array.isArray(val)) {
        if (val.controlledString) {
            return sanitizeString(val.controlledString, key);
        }
        if (val.status || val.detail) {
            return sanitizeString(val.status || val.detail, key);
        }
        if (val.value === false) {
            return key === 'mortgageStatus' ? 'NO_MORTGAGE' : 'NO_LITIGATION';
        }
        if (val.value === true) {
            return key === 'mortgageStatus' ? 'MORTGAGE_REPORTED' : 'LITIGATION_REPORTED';
        }
        if (val._sentinel || val.sentinel) {
            const s = val._sentinel || val.sentinel;
            if (s === 'CATEGORICAL_STATUS' && (val.status || val.detail)) {
                return sanitizeString(val.status || val.detail, key);
            }
            return { _sentinel: typeof s === 'string' ? s.trim() : String(s) };
        }
    }
    return null;
}

function sanitizeBoolean(val) {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        if (val._sentinel || val.sentinel) {
            const s = val._sentinel || val.sentinel;
            return { _sentinel: typeof s === 'string' ? s.trim() : String(s) };
        }
        if (typeof val.value === 'boolean') {
            return val.value;
        }
        if (typeof val.normalized === 'boolean') {
            return val.normalized;
        }
    }
    return null;
}

function sanitizeNumeric(val) {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
        const num = Number(val);
        return Number.isFinite(num) ? num : null;
    }
    return null;
}

function sanitizeSnapshotPII(doc) {
    if (!doc) return;

    if (!doc.normalizedData || typeof doc.normalizedData !== 'object' || Array.isArray(doc.normalizedData)) {
        doc.normalizedData = {};
        doc.ownerDataRedacted = true;
        return;
    }

    let piiFound = false;

    // 1. Deep recursive scan across normalizedData and identityEvidence
    if (scanForPII(doc.normalizedData)) {
        piiFound = true;
    }
    if (doc.identityEvidence && scanForPII(doc.identityEvidence)) {
        piiFound = true;
    }
    if (doc.normalizedData.ownerName !== null && doc.normalizedData.ownerName !== undefined) {
        piiFound = true;
    }

    // 2. Strict allowlisting and field-by-field sanitization
    const rawData = doc.normalizedData;
    const cleanData = {};

    for (const key of Object.keys(rawData)) {
        if (isSensitiveKey(key)) {
            piiFound = true;
        }

        // Strict allowlist: strip unknown keys
        if (!_PERMITTED_SNAPSHOT_NORMALIZED_KEYS.has(key)) {
            continue;
        }

        const rawVal = rawData[key];

        if (key === 'ownerName') {
            cleanData.ownerName = null;
        } else if (key === 'allotmentPrice' || key === 'currentDues' || key === 'totalPaid') {
            cleanData[key] = sanitizeMonetary(rawVal);
        } else if (key === 'allotmentDate' || key === 'transferDate' || key === 'possessionDate') {
            cleanData[key] = sanitizeDate(rawVal);
        } else if (key === 'buildingPlanApproved' || key === 'occupancyCertificate') {
            cleanData[key] = sanitizeBoolean(rawVal);
        } else if (key === 'propertyAreaValue' || key === 'matchConfidence') {
            cleanData[key] = sanitizeNumeric(rawVal);
        } else {
            cleanData[key] = sanitizeString(rawVal, key);
        }
    }

    // ownerName is strictly coerced to null
    cleanData.ownerName = null;
    doc.normalizedData = cleanData;

    // 3. Strict sanitization of identityEvidence
    if (doc.identityEvidence && typeof doc.identityEvidence === 'object' && !Array.isArray(doc.identityEvidence)) {
        const allowedEvidence = ['compositeKey', 'sectorNumber', 'phaseCode', 'blockCode', 'propertyId', 'urbanEstate', 'schemeName'];
        const cleanEvidence = {};
        for (const k of Object.keys(doc.identityEvidence)) {
            if (isSensitiveKey(k)) piiFound = true;
            if (allowedEvidence.includes(k)) {
                cleanEvidence[k] = typeof doc.identityEvidence[k] === 'string'
                    ? doc.identityEvidence[k].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<\/?[a-z][^>]*>/gi, '').trim()
                    : doc.identityEvidence[k];
            }
        }
        doc.identityEvidence = cleanEvidence;
    }

    if (piiFound) {
        doc.ownerDataPresent = true;
    }
    doc.ownerDataRedacted = true;
}

// ========== Immutability Enforcement & Hash Integrity ==========
PropertyVerificationSnapshotSchema.pre('save', function (next) {
    if (!this.isNew) {
        const err = new Error('PropertyVerificationSnapshot is immutable — cannot update after creation');
        err.code = 'SNAPSHOT_IMMUTABLE';
        return next(err);
    }
    // Ensure sealed on creation
    this.isSealed = true;

    // Sanitize sourceReferenceUrl: strip credentials/session/tokens
    if (this.sourceReferenceUrl && typeof this.sourceReferenceUrl === 'string') {
        try {
            const u = new URL(this.sourceReferenceUrl);
            const sensitiveParams = ['token', 'session', 'sessionId', 'auth', 'key', 'apiKey', 'api_key', 'secret', 'password', 'csrf'];
            for (const param of sensitiveParams) {
                u.searchParams.delete(param);
            }
            this.sourceReferenceUrl = u.toString();
        } catch {
            this.sourceReferenceUrl = this.sourceReferenceUrl.replace(/([?&](token|session|auth|secret|key|password)=)[^&#]*/gi, '');
        }
    }

    // Enforce privacy boundary: sanitize any sensitive PII prior to persistence
    sanitizeSnapshotPII(this);

    // Automatically compute deterministic content hash if not already provided
    if (!this.contentHash && this.normalizedData) {
        this.contentHash = computeSnapshotContentHash(this.normalizedData);
    }
    next();
});

PropertyVerificationSnapshotSchema.pre('findOneAndUpdate', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — use create() for new snapshots');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

PropertyVerificationSnapshotSchema.pre('updateOne', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — updates are prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

PropertyVerificationSnapshotSchema.pre('updateMany', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — updates are prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

PropertyVerificationSnapshotSchema.pre('replaceOne', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — replaceOne is prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

PropertyVerificationSnapshotSchema.pre('deleteOne', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — deletion is prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

PropertyVerificationSnapshotSchema.pre('deleteMany', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — deletion is prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

PropertyVerificationSnapshotSchema.pre('findOneAndDelete', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — deletion is prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

PropertyVerificationSnapshotSchema.pre('findOneAndReplace', function (next) {
    const err = new Error('PropertyVerificationSnapshot is immutable — replacement is prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    next(err);
});

// Ensure any batch inserts are sealed on creation, sanitized, and contentHash computed
PropertyVerificationSnapshotSchema.pre('insertMany', function (next, docs) {
    if (Array.isArray(docs)) {
        for (const doc of docs) {
            doc.isSealed = true;
            if (doc.sourceReferenceUrl && typeof doc.sourceReferenceUrl === 'string') {
                try {
                    const u = new URL(doc.sourceReferenceUrl);
                    const sensitiveParams = ['token', 'session', 'sessionId', 'auth', 'key', 'apiKey', 'api_key', 'secret', 'password', 'csrf'];
                    for (const param of sensitiveParams) {
                        u.searchParams.delete(param);
                    }
                    doc.sourceReferenceUrl = u.toString();
                } catch {
                    doc.sourceReferenceUrl = doc.sourceReferenceUrl.replace(/([?&](token|session|auth|secret|key|password)=)[^&#]*/gi, '');
                }
            }
            sanitizeSnapshotPII(doc);
            if (!doc.contentHash && doc.normalizedData) {
                doc.contentHash = computeSnapshotContentHash(doc.normalizedData);
            }
        }
    }
    next();
});

// Override bulkWrite to block batch mutations on this model
PropertyVerificationSnapshotSchema.statics.bulkWrite = function () {
    const err = new Error('PropertyVerificationSnapshot is immutable — bulkWrite is prohibited');
    err.code = 'SNAPSHOT_IMMUTABLE';
    return Promise.reject(err);
};

// Snapshot ID virtual: distinct from cryptographic contentHash
PropertyVerificationSnapshotSchema.virtual('snapshotId').get(function () {
    return this._id;
});

// Canonical snapshotContentHash virtual: alias for contentHash
PropertyVerificationSnapshotSchema.virtual('snapshotContentHash').get(function () {
    return this.contentHash;
});

// Expose computeContentHash as static helpers
PropertyVerificationSnapshotSchema.statics.computeContentHash = computeSnapshotContentHash;
PropertyVerificationSnapshotSchema.statics.computeSnapshotContentHash = computeSnapshotContentHash;
PropertyVerificationSnapshotSchema.statics.computeNormalizedContentHash = computeSnapshotContentHash;

// ========== Statics ==========
PropertyVerificationSnapshotSchema.statics.getLatestForLink = function (tenantId, linkId) {
    return this.findOne({ tenantId, linkId })
        .sort({ observedAt: -1 });
};

PropertyVerificationSnapshotSchema.statics.getHistoryForLink = function (tenantId, linkId, limit = 10) {
    return this.find({ tenantId, linkId })
        .sort({ observedAt: -1 })
        .limit(limit);
};

const computeNormalizedContentHash = computeSnapshotContentHash;
export {
    DATA_QUALITY_STATUSES,
    computeSnapshotContentHash,
    computeNormalizedContentHash,
    sanitizeSnapshotPII
};
export default mongoose.model('PropertyVerificationSnapshot', PropertyVerificationSnapshotSchema);
