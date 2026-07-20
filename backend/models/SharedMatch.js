import mongoose from 'mongoose';

const sharedMatchSchema = new mongoose.Schema({
    token: { 
        type: String, 
        required: true, 
        unique: true,
        index: true
    },
    leadId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Lead',
        required: false
    },
    dealIds: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Inventory',
        required: true
    }],
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    expiresAt: {
        type: Date,
        default: () => new Date(+new Date() + 30*24*60*60*1000), // Default 30 days
        index: { expires: '1m' } // TTL index to auto-delete expired links
    }
}, { timestamps: true });

export default mongoose.model('SharedMatch', sharedMatchSchema);
