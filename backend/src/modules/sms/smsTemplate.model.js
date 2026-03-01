import mongoose from 'mongoose';

const SmsTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    body: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['Promotional', 'Transactional'],
        default: 'Transactional'
    },
    dltTemplateId: {
        type: String,
        trim: true
    },
    dltHeaderId: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

export default mongoose.model('SmsTemplate', SmsTemplateSchema);
