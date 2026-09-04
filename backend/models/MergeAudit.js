import mongoose from "mongoose";

const FieldChangeSchema = new mongoose.Schema({
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
}, { _id: false });

const ReferenceRewireSchema = new mongoose.Schema({
    collectionName: String, // 'collection' is a reserved mongoose property sometimes, safer to use collectionName
    documentId: mongoose.Schema.Types.ObjectId,
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
}, { _id: false });

const MergeAuditSchema = new mongoose.Schema({
    mergeOperationId: { type: String, required: true, unique: true, index: true },
    masterContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    duplicateContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
    status: { type: String, enum: ['PREVIEW', 'PENDING', 'COMPLETED', 'ROLLED_BACK', 'FAILED'], required: true },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rollbackAvailable: { type: Boolean, default: true },
    
    fieldChanges: [FieldChangeSchema],
    referenceRewires: [ReferenceRewireSchema],
    
    errorLog: String
});

export default mongoose.model("MergeAudit", MergeAuditSchema);
