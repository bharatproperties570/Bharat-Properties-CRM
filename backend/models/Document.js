import mongoose from "mongoose";
import softDeletePlugin from "../plugins/softDelete.plugin.js";
import { registerAuditExecutor } from "../services/internalAuditBridge.js";

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

    // Verification Audit History & Revocation
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

// ========== Private Encapsulated Immutability Protection for Verification Audit (Round 9) ==========
// Unexported, module-scoped private Symbol. Never exported or leaked outside Document.js.
const PRIVATE_AUDIT_SECRET = Symbol('DOCUMENT_AUDIT_PRIVATE_CAPABILITY');

DocumentSchema.post('init', function () {
    this._originalVerificationAudit = JSON.stringify(this.verificationAudit || null);
    this._originalMetadataVerificationAudit = JSON.stringify(this.metadata?.verificationAudit || null);
    this._originalAuditEvidence = JSON.stringify(this.auditEvidence || null);
    this._originalMetadataAuditEvidence = JSON.stringify(this.metadata?.auditEvidence || null);
});

export function detectAuditMutationInUpdate(update) {
    if (!update) return false;

    // Check aggregation update pipelines: e.g. [ { $set: ... }, { $unset: ... } ]
    if (Array.isArray(update)) {
        return update.some(stage => detectAuditMutationInUpdate(stage));
    }

    if (typeof update !== 'object') {
        // Fail closed on ambiguous or unsupported mutation forms
        return true;
    }

    const isProtectedAuditPath = (k) => {
        if (!k || typeof k !== 'string') return false;
        return k === 'verificationAudit' ||
               k.startsWith('verificationAudit.') ||
               k === 'metadata.verificationAudit' ||
               k.startsWith('metadata.verificationAudit.') ||
               k === 'auditEvidence' ||
               k.startsWith('auditEvidence.') ||
               k === 'metadata.auditEvidence' ||
               k.startsWith('metadata.auditEvidence.');
    };

    // Check top-level fields (covers direct replacements, top-level updates, or mixed operator updates)
    for (const [k, v] of Object.entries(update)) {
        if (!k.startsWith('$')) {
            if (isProtectedAuditPath(k)) return true;
            if (k === 'metadata') {
                if (v && typeof v === 'object') {
                    if (v.verificationAudit !== undefined || v.auditEvidence !== undefined) {
                        return true;
                    }
                }
                return true;
            }
        }
    }

    // Check $set and $setOnInsert operators
    for (const op of ['$set', '$setOnInsert']) {
        if (update[op] && typeof update[op] === 'object') {
            for (const [k, v] of Object.entries(update[op])) {
                if (isProtectedAuditPath(k)) return true;
                // Recursive check for parent-object replacement e.g. $set: { metadata: { ... } }
                if (k === 'metadata') {
                    if (v && typeof v === 'object') {
                        if (v.verificationAudit !== undefined || v.auditEvidence !== undefined) {
                            return true;
                        }
                    }
                    // Parent metadata replacement without audit fields wipes out existing audit (audit deletion vector)
                    return true;
                }
            }
        }
    }

    // Check $unset operator in all supported MongoDB forms:
    // 1. String form: { $unset: "verificationAudit" }
    // 2. Array form: { $unset: ["verificationAudit", "metadata"] }
    // 3. Object form: { $unset: { verificationAudit: "", "metadata.verificationAudit": "" } }
    if (update.$unset !== undefined) {
        if (typeof update.$unset === 'string') {
            if (isProtectedAuditPath(update.$unset) || update.$unset === 'metadata') return true;
        } else if (Array.isArray(update.$unset)) {
            if (update.$unset.some(k => typeof k === 'string' && (isProtectedAuditPath(k) || k === 'metadata'))) return true;
        } else if (typeof update.$unset === 'object' && update.$unset !== null) {
            for (const k of Object.keys(update.$unset)) {
                if (isProtectedAuditPath(k) || k === 'metadata') return true;
            }
        } else {
            // Ambiguous $unset form: fail closed
            return true;
        }
    }

    // Check $rename operator (rename into or out of protected audit paths)
    if (update.$rename && typeof update.$rename === 'object') {
        for (const [fromKey, toKey] of Object.entries(update.$rename)) {
            if (isProtectedAuditPath(fromKey) || isProtectedAuditPath(toKey)) return true;
            if (fromKey === 'metadata' || toKey === 'metadata') return true;
        }
    }

    // Check $replaceRoot and $replaceWith operators (aggregation update pipeline)
    // Replacing the root document can alter or delete protected audit evidence
    if (update.$replaceRoot !== undefined || update.$replaceWith !== undefined) {
        return true;
    }

    // Check $project operator in pipeline stages
    // $project can omit or filter out protected audit evidence
    if (update.$project !== undefined) {
        return true;
    }

    // Check $addFields in pipeline stages
    if (update.$addFields && typeof update.$addFields === 'object') {
        for (const k of Object.keys(update.$addFields)) {
            if (isProtectedAuditPath(k) || k === 'metadata') return true;
        }
    }

    return false;
}

// 1. Hook: pre('save') — protects direct save(), create(), new Document().save()
DocumentSchema.pre('save', function (next) {
    // Explicitly reject forged caller-provided boolean flags
    if (this._isAuthorizedAuditWorkflow !== undefined) {
        return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Caller-provided authorization booleans are strictly prohibited.'));
    }

    if (this.isNew) {
        // New documents cannot introduce verification audit evidence through untrusted write paths
        if (this.verificationAudit || this.auditEvidence || this.metadata?.verificationAudit || this.metadata?.auditEvidence) {
            return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: New documents cannot be created with verification audit evidence. Use DocumentAuditService.'));
        }
    } else {
        const currentAudit = JSON.stringify(this.verificationAudit || null);
        const currentMetaAudit = JSON.stringify(this.metadata?.verificationAudit || null);
        const currentAuditEv = JSON.stringify(this.auditEvidence || null);
        const currentMetaAuditEv = JSON.stringify(this.metadata?.auditEvidence || null);

        const isModified = this.isModified('verificationAudit') ||
                           this.isModified('metadata.verificationAudit') ||
                           this.isModified('metadata') ||
                           this.isModified('auditEvidence') ||
                           this.isModified('metadata.auditEvidence') ||
                           (this._originalVerificationAudit && currentAudit !== this._originalVerificationAudit) ||
                           (this._originalMetadataVerificationAudit && currentMetaAudit !== this._originalMetadataVerificationAudit) ||
                           (this._originalAuditEvidence && currentAuditEv !== this._originalAuditEvidence) ||
                           (this._originalMetadataAuditEvidence && currentMetaAuditEv !== this._originalMetadataAuditEvidence);

        if (isModified) {
            const auditChanged = (currentAudit !== (this._originalVerificationAudit || JSON.stringify(null))) ||
                                 (currentMetaAudit !== (this._originalMetadataVerificationAudit || JSON.stringify(null))) ||
                                 (currentAuditEv !== (this._originalAuditEvidence || JSON.stringify(null))) ||
                                 (currentMetaAuditEv !== (this._originalMetadataAuditEvidence || JSON.stringify(null)));

            if (auditChanged && this[PRIVATE_AUDIT_SECRET] !== true) {
                return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Verified audit records cannot be mutated or replaced by ordinary document updates. Requires trusted DocumentAuditService capability.'));
            }
        }
    }
    next();
});

// 2. Hook: pre('insertMany') — blocks batch insertion containing verification audit
DocumentSchema.pre('insertMany', function (next, docs) {
    if (Array.isArray(docs)) {
        for (const doc of docs) {
            if (doc.verificationAudit || doc.auditEvidence || doc.metadata?.verificationAudit || doc.metadata?.auditEvidence) {
                return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: insertMany cannot introduce verification audit evidence.'));
            }
        }
    }
    next();
});

// 3. Hook: pre update/replace operations — updateOne, updateMany, findOneAndUpdate, replaceOne, findOneAndReplace
DocumentSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'], function (next) {
    const options = (typeof this.getOptions === 'function') ? this.getOptions() : {};

    // Explicitly reject forged boolean flags
    if (options.isAuthorizedAuditWorkflow !== undefined || this._isAuthorizedAuditWorkflow !== undefined) {
        return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Caller-provided authorization booleans are strictly prohibited.'));
    }

    const hasPrivateCapability = (options && options[PRIVATE_AUDIT_SECRET] === true) || (this[PRIVATE_AUDIT_SECRET] === true);

    // In replaceOne and findOneAndReplace, entire document is replaced
    const opType = this.op || (this.constructor && this.constructor.name);
    if (opType === 'replaceOne' || opType === 'findOneAndReplace') {
        const replacement = this.getUpdate ? this.getUpdate() : null;
        if (!hasPrivateCapability) {
            if (replacement && (replacement.verificationAudit || replacement.auditEvidence || replacement.metadata?.verificationAudit || replacement.metadata?.auditEvidence)) {
                return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: replaceOne/findOneAndReplace cannot introduce or modify verification audit evidence.'));
            }
            return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Direct replaceOne/findOneAndReplace operations on Document are prohibited without trusted capability.'));
        }
    }

    const update = this.getUpdate ? this.getUpdate() : this;
    if (!update) return next();

    const isAuditUpdate = detectAuditMutationInUpdate(update);
    if (isAuditUpdate) {
        if (!hasPrivateCapability) {
            return next(new Error('IMMUTABLE_VERIFICATION_AUDIT: Ordinary Document update operations cannot modify or replace verification audit evidence. Requires trusted DocumentAuditService capability.'));
        }
    }
    next();
});

const DocumentModel = mongoose.model("Document", DocumentSchema);

// Wrap model query methods to safely preserve unforgeable private Symbol across Mongoose query instantiation
const wrapWithCapabilityTransfer = (fnName) => {
    const orig = DocumentModel[fnName];
    if (typeof orig === 'function') {
        DocumentModel[fnName] = function (filter, update, options, callback) {
            const q = orig.call(this, filter, update, options, callback);
            if (options && options[PRIVATE_AUDIT_SECRET] === true) {
                q[PRIVATE_AUDIT_SECRET] = true;
            }
            return q;
        };
    }
};

wrapWithCapabilityTransfer('updateOne');
wrapWithCapabilityTransfer('updateMany');
wrapWithCapabilityTransfer('findOneAndUpdate');

// Wrap insertMany
const origInsertMany = DocumentModel.insertMany;
DocumentModel.insertMany = function (docs, options = {}) {
    if (Array.isArray(docs)) {
        for (const doc of docs) {
            if (doc.verificationAudit || doc.auditEvidence || doc.metadata?.verificationAudit || doc.metadata?.auditEvidence) {
                throw new Error('IMMUTABLE_VERIFICATION_AUDIT: insertMany cannot introduce verification audit evidence.');
            }
        }
    }
    return origInsertMany.apply(this, arguments);
};

// Wrap replaceOne and findOneAndReplace
const origReplaceOne = DocumentModel.replaceOne;
DocumentModel.replaceOne = function (filter, replacement, options = {}) {
    if (options[PRIVATE_AUDIT_SECRET] !== true) {
        if (replacement && (replacement.verificationAudit || replacement.auditEvidence || replacement.metadata?.verificationAudit || replacement.metadata?.auditEvidence)) {
            throw new Error('IMMUTABLE_VERIFICATION_AUDIT: replaceOne cannot introduce or modify verification audit evidence.');
        }
        throw new Error('IMMUTABLE_VERIFICATION_AUDIT: Direct replaceOne operations on Document are prohibited without trusted capability.');
    }
    const q = origReplaceOne.apply(this, arguments);
    q[PRIVATE_AUDIT_SECRET] = true;
    return q;
};

const origFindOneAndReplace = DocumentModel.findOneAndReplace;
DocumentModel.findOneAndReplace = function (filter, replacement, options = {}) {
    if (options[PRIVATE_AUDIT_SECRET] !== true) {
        if (replacement && (replacement.verificationAudit || replacement.auditEvidence || replacement.metadata?.verificationAudit || replacement.metadata?.auditEvidence)) {
            throw new Error('IMMUTABLE_VERIFICATION_AUDIT: findOneAndReplace cannot introduce or modify verification audit evidence.');
        }
        throw new Error('IMMUTABLE_VERIFICATION_AUDIT: Direct findOneAndReplace operations on Document are prohibited without trusted capability.');
    }
    const q = origFindOneAndReplace.apply(this, arguments);
    q[PRIVATE_AUDIT_SECRET] = true;
    return q;
};

// Wrap bulkWrite to inspect and block all unauthorized audit operations
const origBulkWrite = DocumentModel.bulkWrite;
DocumentModel.bulkWrite = function (ops, options = {}) {
    if (Array.isArray(ops)) {
        const hasCapability = options && options[PRIVATE_AUDIT_SECRET] === true;
        for (const op of ops) {
            if (op.insertOne && op.insertOne.document) {
                const doc = op.insertOne.document;
                if (doc.verificationAudit || doc.auditEvidence || doc.metadata?.verificationAudit || doc.metadata?.auditEvidence) {
                    throw new Error('IMMUTABLE_VERIFICATION_AUDIT: bulkWrite insertOne cannot introduce verification audit evidence.');
                }
            }
            if (op.updateOne) {
                if (detectAuditMutationInUpdate(op.updateOne.update) && !hasCapability) {
                    throw new Error('IMMUTABLE_VERIFICATION_AUDIT: bulkWrite updateOne cannot modify verification audit evidence.');
                }
            }
            if (op.updateMany) {
                if (detectAuditMutationInUpdate(op.updateMany.update) && !hasCapability) {
                    throw new Error('IMMUTABLE_VERIFICATION_AUDIT: bulkWrite updateMany cannot modify verification audit evidence.');
                }
            }
            if (op.replaceOne) {
                const repl = op.replaceOne.replacement;
                if (repl && (repl.verificationAudit || repl.auditEvidence || repl.metadata?.verificationAudit || repl.metadata?.auditEvidence) && !hasCapability) {
                    throw new Error('IMMUTABLE_VERIFICATION_AUDIT: bulkWrite replaceOne cannot modify verification audit evidence.');
                }
                if (!hasCapability) {
                    throw new Error('IMMUTABLE_VERIFICATION_AUDIT: bulkWrite replaceOne cannot replace Document without trusted capability.');
                }
            }
        }
    }
    return origBulkWrite.apply(this, arguments);
};

// Wrap bulkSave if present
if (typeof DocumentModel.bulkSave === 'function') {
    const origBulkSave = DocumentModel.bulkSave;
    DocumentModel.bulkSave = function (docs, options = {}) {
        if (Array.isArray(docs)) {
            for (const doc of docs) {
                if (doc.isNew && (doc.verificationAudit || doc.auditEvidence || doc.metadata?.verificationAudit || doc.metadata?.auditEvidence)) {
                    throw new Error('IMMUTABLE_VERIFICATION_AUDIT: bulkSave cannot introduce verification audit evidence.');
                }
            }
        }
        return origBulkSave.apply(this, arguments);
    };
}

// Register privileged audit executor with internalAuditBridge.
// This is the ONLY mechanism through which DocumentAuditService writes audit evidence.
registerAuditExecutor(async (docFilter, updateOps, options = {}) => {
    const filter = typeof docFilter === 'object' && docFilter !== null && docFilter._id ? docFilter : { _id: docFilter };
    const queryOptions = { [PRIVATE_AUDIT_SECRET]: true };
    if (options && options.session) {
        queryOptions.session = options.session;
    }
    return DocumentModel.updateOne(
        filter,
        updateOps,
        queryOptions
    );
});

export default DocumentModel;
