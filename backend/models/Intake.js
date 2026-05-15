import mongoose from 'mongoose';

const intakeSchema = new mongoose.Schema({
    source: {
        type: String,
        required: true,
        default: 'Other'
    },
    source_type: {
        type: String,
        enum: ['manual', 'pdf', 'zip', 'public_url', 'google_index', 'property_listing', 'whatsapp', 'email', 'api', 'other'],
        default: 'other'
    },
    source_confidence: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    raw_source_data: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Raw unparsed data from the source connector'
    },
    duplicate_hash: {
        type: String,
        index: true,
        sparse: true,
        description: 'Hash to prevent duplicate intake records'
    },
    status: {
        type: String,
        required: true,
        enum: ['Raw Received', 'Queued', 'Processing', 'Failed', 'Processed', 'Lead Created', 'Deal Linked', 'Archived', 'Needs Review', 'Ready for Review'],
        default: 'Raw Received'
    },
    processing_attempts: { type: Number, default: 0 },
    next_retry_at: { type: Date },
    error_log: [{
        timestamp: { type: Date, default: Date.now },
        message: String,
        stack: String
    }],

    // Extracted / Normalized Data
    title: { type: String },
    description: { type: String },
    location: { type: String },
    sector: { type: String },
    property_type: { type: String },
    size: { type: String },
    price: { type: String },
    contact_numbers: [{ type: String }],
    seller_intent: { type: String, enum: ['sell', 'rent', 'lease', 'unknown'], default: 'unknown' },
    extracted_entities: { type: mongoose.Schema.Types.Mixed },
    verification_status: { type: String, enum: ['unverified', 'pending', 'verified', 'rejected'], default: 'unverified' },

    // Legacy fields
    content: { type: String },
    receivedAt: { type: Date, default: Date.now },
    campaignName: { type: String, default: '' },
    category: { type: String, enum: ['new', 'repeat1x', 'repeat2x', 'repeat3x', 'repeat3plus'], default: 'new' },
    meta: {
        fileName: String,
        mimeType: String,
        attachments: [String],
        parsedData: mongoose.Schema.Types.Mixed
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

intakeSchema.index({ receivedAt: -1 });
intakeSchema.index({ status: 1 });
intakeSchema.index({ duplicate_hash: 1 });

const Intake = mongoose.model('Intake', intakeSchema);

export default Intake;
