import mongoose from 'mongoose';

const intakeSchema = new mongoose.Schema({
    source: {
        type: String,
        required: true,
        enum: ['WhatsApp', 'Tribune', 'Camera', 'Image Upload', 'Manual', 'Other'],
        default: 'Other'
    },
    content: {
        type: String,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['Raw Received', 'Processed', 'Lead Created', 'Deal Linked', 'Archived'],
        default: 'Raw Received'
    },
    receivedAt: {
        type: Date,
        default: Date.now
    },
    campaignName: {
        type: String,
        default: ''
    },
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

const Intake = mongoose.model('Intake', intakeSchema);

export default Intake;
