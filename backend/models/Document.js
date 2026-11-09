import mongoose from "mongoose";
import softDeletePlugin from "../plugins/softDelete.plugin.js";
import { AUDIT_CAPABILITY_TOKEN } from "../services/auditCapabilityToken.js";

const documentStates = [
    'PENDING',
    'UPLOADING',
    'PROCESSING',
    'CONTENT_VALIDATION',
    'MALWARE_POLICY',
    'ACTIVE',
    'REJECTED',
    'QUARANTINED',
    'DELETED',
    'PURGE_ELIGIBLE',
    'PURGED',
    'MIGRATING',
    'MIGRATION_FAILED'
];

const legacyMigrationStates = [
    'LEGACY_PUBLIC_RISK',
    'LEGACY_RESOLVABLE',
    'LEGACY_UNRESOLVED',
    'MIGRATION_PENDING',
    'MIGRATED',
    'MIGRATION_FAILED'
];

const DocumentSchema = new mongoose.Schema({
    documentId: { type: String, required: true, unique: true, index: true }, 
    
    entityType: { 
        type: String, 
        required: true,
        enum: ['Contact', 'Lead', 'Deal', 'Inventory', 'Project'],
        index: true 
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    metadata: {
        documentCategory: { type: mongoose.Schema.Types.Mixed },
        documentType: { type: mongoose.Schema.Types.Mixed },
        documentName: { type: mongoose.Schema.Types.Mixed },
        documentNo: String,
        documentNumber: String,
        projectName: { type: mongoose.Schema.Types.Mixed },
        block: String,
        unitNumber: String,
        linkedContactMobile: String,
        approvalAuthority: String,
        registrationNo: String,
        name: String,
        type: { type: String },
        verificationAudit: { type: mongoose.Schema.Types.Mixed },
        auditEvidence: { type: mongoose.Schema.Types.Mixed }
    },

    verificationAudit: { type: mongoose.Schema.Types.Mixed },
    auditEvidence: { type: mongoose.Schema.Types.Mixed },
    
    currentVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion' },
    
    state: { 
        type: String, 
        required: true,
        enum: documentStates,
        default: 'PENDING',
        index: true
    },
    
    retentionUntil: { type: Date, index: true },
    legalHold: { type: Boolean, default: false, index: true },
    
    legacyMigrationState: { 
        type: String, 
        enum: legacyMigrationStates,
        index: true
    },

    // Round 8: Verification Audit History & Revocation
    auditHistory: [{ type: mongoose.Schema.Types.Mixed }],
    isRevoked: { type: Boolean, default: false, index: true },
    revocationReason: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: String, default: null }
}, {
    timestamps: true 
});

DocumentSchema.index({ entityType: 1, entityId: 1 });
DocumentSchema.plugin(softDeletePlugin);

// ========== Immutability Protection for Verification Audit (Round 8) ==========
// Prevents ordinary Document update operations from modifying or replacing accepted verification audit evidence.
// Only internal trusted DocumentAuditService possessing AUDIT_CAPABILITY_TOKEN may mutate verification audit fields.
// Arbitrary caller-provided authorization booleans (isAuthorizedAuditWorkflow) are strictly rejected.
DocumentSchema.post('init', function () {
    this._originalVerificationAudit = JSON.stringify(this.verificationAudit || null);
    this._originalMetadataVerificationAudit = JSON.stringify(this.metadata?.verificationAudit || null);
    this._originalAuditEvidence = JSON.stringify(this.auditEvidence || null);
    this._originalMetadataAuditEvidence = JSON.stringify(this.metadata?.auditEvidence || null);
});

function detectAuditMutationInUpdate(update) {
    if (!update) return false;

    // Check aggregation update pipelines: e.g. [ { $set: ... }, { $unset: ... } ]
    if (Array.isArray(update)) {
        return update.some(stage => detectAuditMutationInUpdate(stage));
    }

    if (typeof update !== 'object') return false;

    const checkKey = (k) => {
        return k === 'verificationAudit' ||
               k.startsWith('verificationAudit.') ||
               k === 'metadata.verificationAudit' ||
               k.startsWith('metadata.verificationAudit.') ||
               k === 'auditEvidence' ||
               k.startsWith('auditEvidence.') ||
               k === 'metadata.auditEvidence' ||
               k.startsWith('metadata.auditEvidence.');
    };

    // Check top-level keys
    for (const k of Object.keys(update)) {
        if (checkKey(k)) return true;
    }

    // Check MongoDB update operators
    const operators = ['$set', '$unset', '$setOnInsert', '$replaceRoot', '$project'];
    for (const op of operators) {
        if (update[op] && typeof update[op] === 'object') {
            for (const k of Object.keys(update[op])) {
                if (checkKey(k)) return true;
            }
        }
    }

    return false;
}

DocumentSchema.pre('save', function (next) {
    // Explicitly reject forged boolean flags
    if (this._isAuthorizedAuditWorkflow !== undefined) {
        return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Caller-provided authorization booleans are strictly prohibited.'));
    }

    if (!this.isNew) {
        const currentAudit = JSON.stringify(this.verificationAudit || null);
        const currentMetaAudit = JSON.stringify(this.metadata?.verificationAudit || null);
        const currentAuditEv = JSON.stringify(this.auditEvidence || null);
        const currentMetaAuditEv = JSON.stringify(this.metadata?.auditEvidence || null);

        const isModified = this.isModified('verificationAudit') ||
                           this.isModified('metadata.verificationAudit') ||
                           this.isModified('auditEvidence') ||
                           this.isModified('metadata.auditEvidence') ||
                           (this._originalVerificationAudit && currentAudit !== this._originalVerificationAudit) ||
                           (this._originalMetadataVerificationAudit && currentMetaAudit !== this._originalMetadataVerificationAudit) ||
                           (this._originalAuditEvidence && currentAuditEv !== this._originalAuditEvidence) ||
                           (this._originalMetadataAuditEvidence && currentMetaAuditEv !== this._originalMetadataAuditEvidence);

        if (isModified) {
            if (this[AUDIT_CAPABILITY_TOKEN] !== true) {
                return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Verified audit records cannot be mutated or replaced by ordinary document updates. Requires trusted DocumentAuditService capability.'));
            }
        }
    }
    next();
});

DocumentSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    const options = (typeof this.getOptions === 'function') ? this.getOptions() : {};

    // Explicitly reject forged boolean flags
    if (options.isAuthorizedAuditWorkflow !== undefined || this._isAuthorizedAuditWorkflow !== undefined) {
        return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Caller-provided authorization booleans are strictly prohibited.'));
    }

    const update = this.getUpdate();
    if (!update) return next();

    const isAuditUpdate = detectAuditMutationInUpdate(update);
    if (isAuditUpdate) {
        if (options[AUDIT_CAPABILITY_TOKEN] !== true && this[AUDIT_CAPABILITY_TOKEN] !== true) {
            return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Ordinary Document update operations cannot modify or replace verification audit evidence. Requires trusted DocumentAuditService capability.'));
        }
    }
    next();
});

const DocumentModel = mongoose.model("Document", DocumentSchema);

// Wrap model query methods to safely preserve unforgeable Symbol capability token across Mongoose query instantiation
const wrapWithCapabilityTransfer = (fnName) => {
    const orig = DocumentModel[fnName];
    if (typeof orig === 'function') {
        DocumentModel[fnName] = function (filter, update, options, callback) {
            const q = orig.call(this, filter, update, options, callback);
            if (options && options[AUDIT_CAPABILITY_TOKEN] === true) {
                q[AUDIT_CAPABILITY_TOKEN] = true;
            }
            return q;
        };
    }
};

wrapWithCapabilityTransfer('updateOne');
wrapWithCapabilityTransfer('updateMany');
wrapWithCapabilityTransfer('findOneAndUpdate');

export default DocumentModel;
