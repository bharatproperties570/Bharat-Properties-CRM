import mongoose from 'mongoose';

const DirectUploadRecordSchema = new mongoose.Schema({
    fileId: { type: String, required: true },
    sanitizedFileId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    tenantId: { type: String, default: null, index: true },
    batchToken: { type: String, default: null, index: true },
    storage: { type: String, enum: ['google_drive', 'local'], default: 'google_drive' },
    originalName: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    createdAt: { type: Date, default: Date.now, index: true }
}, {
    timestamps: true,
    autoIndex: false,
    autoCreate: false
});

// Database-enforced unique ownership constraint on fileId (P1)
DirectUploadRecordSchema.index({ fileId: 1 }, { unique: true, name: 'direct_upload_records_fileid_unique' });
DirectUploadRecordSchema.index({ fileId: 1, tenantId: 1 });
DirectUploadRecordSchema.index({ sanitizedFileId: 1, tenantId: 1 });
DirectUploadRecordSchema.index({ batchToken: 1, userId: 1 });

const DirectUploadRecord = mongoose.models.DirectUploadRecord || mongoose.model('DirectUploadRecord', DirectUploadRecordSchema);

export default DirectUploadRecord;
