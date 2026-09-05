import mongoose from 'mongoose';

const WhatsAppIntegrationSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            index: true
        },
        businessPortfolioId: {
            type: String,
            index: true
        },
        wabaId: {
            type: String,
            required: true,
            index: true
        },
        phoneNumberId: {
            type: String,
            required: true,
            index: true
        },
        displayPhoneNumber: {
            type: String
        },
        connectionType: {
            type: String,
            enum: ['COEXISTENCE', 'NEW_API', 'MANUAL'],
            required: true
        },
        onboardingStatus: {
            type: String,
            enum: [
                'INITIATED',
                'META_AUTH_STARTED',
                'TOKEN_EXCHANGED',
                'WABA_DISCOVERED',
                'PHONE_DISCOVERED',
                'PHONE_REGISTERED',
                'SUBSCRIPTION_PENDING',
                'CONNECTED',
                'FAILED_AUTH',
                'FAILED_VALIDATION',
                'FAILED_COEXISTENCE',
                'FAILED_PHONE',
                'FAILED_SUBSCRIPTION',
                'FAILED_VERIFICATION',
                'CANCELLED',
                'REVOKED'
            ],
            default: 'INITIATED',
            index: true
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE', 'PENDING_ONBOARDING', 'REVOKED'],
            default: 'PENDING_ONBOARDING'
        },
        webhookStatus: {
            type: String,
            enum: ['PENDING', 'SUBSCRIBED', 'FAILED', 'VERIFIED'],
            default: 'PENDING'
        },
        subscriptionStatus: {
            type: String,
            enum: ['UNSUBSCRIBED', 'SUBSCRIBED'],
            default: 'UNSUBSCRIBED'
        },
        credentials: {
            // Encrypted at rest or kept as secure fields
            systemUserToken: String,
            configId: String
        },
        failureReason: {
            type: String,
            default: null
        },
        connectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        connectedAt: {
            type: Date,
            default: null
        },
        lastVerifiedAt: {
            type: Date,
            default: null
        },
        revokedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        collection: 'whatsapp_integrations'
    }
);

// Compound index to ensure idempotency / prevent duplicate connections for the same phone
WhatsAppIntegrationSchema.index({ wabaId: 1, phoneNumberId: 1 }, { unique: true, partialFilterExpression: { status: { $ne: 'REVOKED' } } });

const WhatsAppIntegration = mongoose.models.WhatsAppIntegration || mongoose.model('WhatsAppIntegration', WhatsAppIntegrationSchema);

export default WhatsAppIntegration;
