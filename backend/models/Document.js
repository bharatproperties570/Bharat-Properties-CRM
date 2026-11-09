import mongoose from "mongoose";
import softDeletePlugin from "../plugins/softDelete.plugin.js";

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
    }
}, {
    timestamps: true 
});

DocumentSchema.index({ entityType: 1, entityId: 1 });
DocumentSchema.plugin(softDeletePlugin);

// ========== Immutability Protection for Verification Audit (Round 7) ==========
// Prevents ordinary Document update operations from modifying or replacing accepted verification audit evidence.
// Only explicitly authorized verification workflows (options.isAuthorizedAuditWorkflow === true or doc._isAuthorizedAuditWorkflow === true)
// may write or mutate verificationAudit.
DocumentSchema.post('init', function () {
    this._originalVerificationAudit = JSON.stringify(this.verificationAudit || null);
    this._originalMetadataVerificationAudit = JSON.stringify(this.metadata?.verificationAudit || null);
});

DocumentSchema.pre('save', function (next) {
    if (!this.isNew) {
        const currentAudit = JSON.stringify(this.verificationAudit || null);
        const currentMetaAudit = JSON.stringify(this.metadata?.verificationAudit || null);
        const isModified = this.isModified('verificationAudit') ||
                           this.isModified('metadata.verificationAudit') ||
                           (this._originalVerificationAudit && currentAudit !== this._originalVerificationAudit) ||
                           (this._originalMetadataVerificationAudit && currentMetaAudit !== this._originalMetadataVerificationAudit);
        if (isModified && this._isAuthorizedAuditWorkflow !== true) {
            return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Verified audit records cannot be mutated or replaced by ordinary document updates.'));
        }
    }
    next();
});

DocumentSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    const update = this.getUpdate();
    if (!update) return next();

    const checkAuditPath = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        return Object.keys(obj).some(k => 
            k === 'verificationAudit' || 
            k.startsWith('verificationAudit.') || 
            k === 'metadata.verificationAudit' || 
            k.startsWith('metadata.verificationAudit.')
        );
    };

    const isAuditUpdate = checkAuditPath(update) || checkAuditPath(update.$set) || checkAuditPath(update.$unset);
    if (isAuditUpdate) {
        const options = (typeof this.getOptions === 'function') ? this.getOptions() : {};
        if (options.isAuthorizedAuditWorkflow !== true) {
            return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Ordinary Document update operations cannot modify or replace verification audit evidence.'));
        }
    }
    next();
});

export default mongoose.model("Document", DocumentSchema);
