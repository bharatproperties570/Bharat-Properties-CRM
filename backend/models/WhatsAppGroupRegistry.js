import mongoose from 'mongoose';

const WhatsAppGroupRegistrySchema = new mongoose.Schema(
    {
        integrationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsAppIntegration',
            required: true,
            index: true
        },
        groupJid: {
            type: String,
            required: true,
            index: true
        },
        subject: {
            type: String,
            default: 'WhatsApp Group'
        },
        participantCount: {
            type: Number,
            default: 0
        },
        announce: {
            type: Boolean,
            default: false
        },
        restrict: {
            type: Boolean,
            default: false
        },
        senderIsAdmin: {
            type: Boolean,
            default: false
        },
        senderIsSuperAdmin: {
            type: Boolean,
            default: false
        },
        permissionStatus: {
            type: String,
            enum: ['CAN_SEND', 'ADMIN_ONLY_RESTRICTED', 'UNKNOWN', 'LEFT_OR_REMOVED'],
            default: 'UNKNOWN',
            index: true
        },
        metadataFetchedAt: {
            type: Date,
            default: null
        },
        lastVerifiedAt: {
            type: Date,
            default: Date.now
        },
        metadataVersion: {
            type: Number,
            default: 1
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'RESTRICTED', 'INACTIVE'],
            default: 'ACTIVE',
            index: true
        },
        lastError: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        collection: 'whatsapp_group_registry'
    }
);

// 🔒 Unique compound index ensures exact integration + group uniqueness
WhatsAppGroupRegistrySchema.index({ integrationId: 1, groupJid: 1 }, { unique: true });
WhatsAppGroupRegistrySchema.index({ integrationId: 1, permissionStatus: 1 });
WhatsAppGroupRegistrySchema.index({ integrationId: 1, status: 1 });

const WhatsAppGroupRegistry = mongoose.models.WhatsAppGroupRegistry || mongoose.model('WhatsAppGroupRegistry', WhatsAppGroupRegistrySchema);

export default WhatsAppGroupRegistry;
