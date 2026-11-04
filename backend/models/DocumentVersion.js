import mongoose from "mongoose";

const DocumentVersionSchema = new mongoose.Schema({
    versionId: { type: String, required: true, unique: true, index: true },
    documentId: { type: String, required: true, index: true },
    versionNumber: { type: Number, required: true },
    
    providerInstanceId: { type: String, required: true },
    objectKey: { type: String, required: true },
    providerVersionId: { type: String },
    
    checksum: { type: String },
    checksumAlgorithm: { type: String, default: 'SHA-256' },
    
    mimeType: { type: String },
    sizeBytes: { type: Number },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true 
});

DocumentVersionSchema.index({ documentId: 1, versionNumber: 1 }, { unique: true });
DocumentVersionSchema.index({ providerInstanceId: 1, objectKey: 1 });

export default mongoose.model("DocumentVersion", DocumentVersionSchema);
