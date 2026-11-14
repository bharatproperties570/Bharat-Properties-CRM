import mongoose from 'mongoose';

const MarketingDocumentApprovalSchema = new mongoose.Schema({
    documentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    documentId: { type: String, required: true, index: true },
    versionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion', required: true },
    versionId: { type: String, required: true },
    entityType: { type: String, enum: ['Deal', 'Inventory', 'Project'], required: true },
    categoryLookupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', required: true },
    categoryValue: { type: String, required: true },
    status: { type: String, enum: ['APPROVED', 'REVOKED'], required: true, default: 'APPROVED', index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedAt: { type: Date, required: true },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    policyVersion: { type: String, required: true, default: 'marketing-document-v1' }
}, { timestamps: true, versionKey: false });

MarketingDocumentApprovalSchema.index(
    { documentRef: 1, versionRef: 1 },
    { unique: true, name: 'uniq_marketing_document_version_approval' }
);
MarketingDocumentApprovalSchema.index({ status: 1, entityType: 1, categoryLookupId: 1 });

export default mongoose.model('MarketingDocumentApproval', MarketingDocumentApprovalSchema);
