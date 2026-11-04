import mongoose from 'mongoose';

/**
 * TenantWebhookConfig Schema
 *
 * Enterprise Multi-Tenant Ingestion Configuration:
 * Securely associates external webhooks with a specific tenant via
 * cryptographic signatures (HMAC-SHA256), dedicated ingestion keys,
 * or verified provider identifiers (e.g. Meta Phone Number ID, Page ID).
 */
const tenantWebhookConfigSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: [true, 'Tenant ID is required for webhook attribution'],
        index: true
    },
    provider: {
        type: String,
        enum: ['GENERIC', 'META', 'FACEBOOK', 'WHATSAPP', 'EXOTEL', 'CUSTOM'],
        default: 'GENERIC',
        required: true,
        index: true
    },
    ingestionKey: {
        type: String,
        required: [true, 'Unique ingestion key is required'],
        unique: true,
        index: true
    },
    secret: {
        type: String,
        required: [true, 'Webhook signing secret is required for HMAC verification']
    },
    providerConfig: {
        phoneNumberId: { type: String },
        wabaId: { type: String },
        pageId: { type: String },
        verifyToken: { type: String }
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    allowedIps: [{
        type: String
    }],
    description: {
        type: String
    }
}, {
    timestamps: true
});

tenantWebhookConfigSchema.index({ tenantId: 1, provider: 1 });
tenantWebhookConfigSchema.index({ 'providerConfig.phoneNumberId': 1 });
tenantWebhookConfigSchema.index({ 'providerConfig.pageId': 1 });

const TenantWebhookConfig = mongoose.models.TenantWebhookConfig || mongoose.model('TenantWebhookConfig', tenantWebhookConfigSchema);

export default TenantWebhookConfig;
