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
        type: { type: String }
    },
    
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

export default mongoose.model("Document", DocumentSchema);
