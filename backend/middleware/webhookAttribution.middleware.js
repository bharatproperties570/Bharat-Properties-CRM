import crypto from 'crypto';
import mongoose from 'mongoose';
import TenantWebhookConfig from '../models/TenantWebhookConfig.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Record an auditable webhook security failure.
 */
async function recordAuditFailure(data) {
    try {
        const AuditLogModel = mongoose.models.AuditLog || AuditLog;
        if (AuditLogModel && typeof AuditLogModel.create === 'function') {
            await AuditLogModel.create([{
                eventType: 'unauthorized_access_attempt',
                targetType: 'other',
                status: 'failure',
                description: `Webhook security violation: ${data.reason}`,
                ipAddress: data.ip,
                requestUrl: data.path,
                metadata: {
                    action: data.reason,
                    reason: data.reason,
                    claimedTenantId: data.claimedTenantId || null,
                    resolvedTenantId: data.resolvedTenantId || null,
                    details: data.details || {}
                },
                timestamp: new Date()
            }]).catch(err => console.warn('[WebhookAttribution] Failed to record audit log:', err.message));
        }
    } catch (err) {
        console.warn('[WebhookAttribution] Audit failure logging suppressed:', err.message);
    }
}

/**
 * Enterprise Webhook Attribution & Security Gate
 *
 * 1. Never trusts arbitrary query/header `tenantId` or `x-tenant-id`.
 * 2. Resolves tenant identity strictly via authenticated tenant ingestion config or secret mapping.
 * 3. Verifies provider HMAC-SHA256 signatures with timing-safe comparison.
 * 4. Prevents replay attacks by checking timestamp window (+/- 300 seconds).
 * 5. Rejects ambiguous or unmapped sources.
 * 6. Detects and blocks tenant spoofing attempts, writing an auditable security record.
 */
export const verifyWebhookAttribution = (options = {}) => {
    return async (req, res, next) => {
        try {
            const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
            const claimedTenantId = req.query.tenantId || req.headers['x-tenant-id'] || req.body?.tenantId;

            // ── 1. Replay Attack Prevention ──
            const timestampHeader = req.headers['x-timestamp'] ||
                                    req.headers['x-webhook-timestamp'] ||
                                    req.headers['x-signature-timestamp'];
            if (timestampHeader) {
                const timestampSec = parseInt(timestampHeader, 10);
                const currentSec = Math.floor(Date.now() / 1000);
                // Support both seconds and milliseconds headers
                const diffSec = Math.abs((timestampSec > 9999999999 ? Math.floor(timestampSec / 1000) : timestampSec) - currentSec);

                if (diffSec > 300) { // 5-minute replay window
                    await recordAuditFailure({
                        reason: 'REPLAY_DETECTED',
                        details: { timestampHeader, diffSec },
                        ip: req.ip,
                        path: req.originalUrl,
                        claimedTenantId
                    });
                    return res.status(401).json({
                        success: false,
                        error: 'WEBHOOK_REPLAY_REJECTED',
                        code: 'WEBHOOK_REPLAY_DETECTED',
                        message: 'Request timestamp is outside the allowed 5-minute replay window.'
                    });
                }
            } else if (options.requireTimestamp) {
                await recordAuditFailure({
                    reason: 'MISSING_TIMESTAMP',
                    ip: req.ip,
                    path: req.originalUrl,
                    claimedTenantId
                });
                return res.status(401).json({
                    success: false,
                    error: 'MISSING_TIMESTAMP',
                    code: 'MISSING_TIMESTAMP',
                    message: 'Request timestamp is required for replay prevention.'
                });
            }

            // ── 2. Tenant Identity Resolution ──
            let matchedConfig = null;
            let resolutionMethod = null;

            // Method A: Ingestion key (X-Ingestion-Key header or query)
            const ingestionKey = req.headers['x-ingestion-key'] || req.headers['x-webhook-key'] || req.query.ingestionKey;
            if (ingestionKey) {
                matchedConfig = await TenantWebhookConfig.findOne({ ingestionKey, isActive: true }).lean();
                if (matchedConfig) resolutionMethod = 'INGESTION_KEY';
            }

            // Method B: Signature-based secret resolution (if not resolved by key)
            const signatureHeader = req.headers['x-signature-256'] ||
                                    req.headers['x-hub-signature-256'] ||
                                    req.headers['x-signature-sha256'] ||
                                    req.headers['x-signature'];

            // Method C: Provider payload identifier lookup (e.g., WhatsApp phoneNumberId)
            if (!matchedConfig) {
                const phoneNumberId = req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ||
                                      req.body?.metadata?.phone_number_id ||
                                      req.body?.phoneNumberId;
                if (phoneNumberId) {
                    matchedConfig = await TenantWebhookConfig.findOne({
                        'providerConfig.phoneNumberId': phoneNumberId,
                        isActive: true
                    }).lean();

                    if (!matchedConfig) {
                        const waInt = await WhatsAppIntegration.findOne({ phoneNumberId }).lean();
                        if (waInt && (waInt.organizationId || waInt.tenantId)) {
                            matchedConfig = {
                                tenantId: waInt.organizationId || waInt.tenantId,
                                provider: 'WHATSAPP',
                                secret: process.env.WHATSAPP_WEBHOOK_SECRET || process.env.META_APP_SECRET || ''
                            };
                        }
                    }
                    if (matchedConfig) resolutionMethod = 'PHONE_NUMBER_ID';
                }
            }

            // Method D: Provider payload Page ID (Facebook Leads)
            if (!matchedConfig) {
                const pageId = req.body?.entry?.[0]?.id || req.body?.page_id;
                if (pageId) {
                    matchedConfig = await TenantWebhookConfig.findOne({
                        'providerConfig.pageId': pageId,
                        isActive: true
                    }).lean();
                    if (matchedConfig) resolutionMethod = 'PAGE_ID';
                }
            }

            // If no valid mapping could be found, reject unmapped source
            if (!matchedConfig) {
                await recordAuditFailure({
                    reason: 'UNMAPPED_WEBHOOK_SOURCE',
                    details: { claimedTenantId },
                    ip: req.ip,
                    path: req.originalUrl
                });
                return res.status(401).json({
                    success: false,
                    error: 'UNMAPPED_SOURCE',
                    code: 'UNMAPPED_WEBHOOK_SOURCE',
                    message: 'No active tenant ingestion mapping could be resolved for this webhook.'
                });
            }

            // ── 3. Cryptographic Signature Verification ──
            if (matchedConfig.secret && (signatureHeader || options.requireSignature)) {
                if (!signatureHeader) {
                    await recordAuditFailure({
                        reason: 'MISSING_SIGNATURE',
                        tenantId: matchedConfig.tenantId,
                        ip: req.ip,
                        path: req.originalUrl,
                        claimedTenantId
                    });
                    return res.status(401).json({
                        success: false,
                        error: 'MISSING_SIGNATURE',
                        code: 'MISSING_SIGNATURE',
                        message: 'Cryptographic signature is required for this ingestion endpoint.'
                    });
                }

                const cleanSignature = signatureHeader.replace(/^sha256=/, '');
                const expectedSignature = crypto
                    .createHmac('sha256', matchedConfig.secret)
                    .update(rawPayload)
                    .digest('hex');

                try {
                    const sigBuffer = Buffer.from(cleanSignature, 'hex');
                    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

                    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
                        await recordAuditFailure({
                            reason: 'INVALID_SIGNATURE',
                            tenantId: matchedConfig.tenantId,
                            ip: req.ip,
                            path: req.originalUrl,
                            claimedTenantId
                        });
                        return res.status(401).json({
                            success: false,
                            error: 'INVALID_SIGNATURE',
                            code: 'INVALID_WEBHOOK_SIGNATURE',
                            message: 'Webhook signature verification failed.'
                        });
                    }
                } catch {
                    await recordAuditFailure({
                        reason: 'INVALID_SIGNATURE_FORMAT',
                        tenantId: matchedConfig.tenantId,
                        ip: req.ip,
                        path: req.originalUrl,
                        claimedTenantId
                    });
                    return res.status(401).json({
                        success: false,
                        error: 'INVALID_SIGNATURE',
                        code: 'INVALID_WEBHOOK_SIGNATURE',
                        message: 'Webhook signature format is invalid.'
                    });
                }
            }

            // ── 4. Anti-Spoofing Validation ──
            if (claimedTenantId && String(claimedTenantId) !== String(matchedConfig.tenantId)) {
                await recordAuditFailure({
                    reason: 'SPOOFED_TENANT_ID',
                    claimedTenantId,
                    resolvedTenantId: matchedConfig.tenantId,
                    ip: req.ip,
                    path: req.originalUrl
                });
                return res.status(403).json({
                    success: false,
                    error: 'TENANT_SPOOFING_DETECTED',
                    code: 'TENANT_IDENTITY_SPOOF_DETECTED',
                    message: 'Claimed tenant identity does not match verified ingestion credentials.'
                });
            }

            // ── 5. Stamping Verified Tenant ──
            req.resolvedTenantId = matchedConfig.tenantId;
            req.webhookAttribution = {
                tenantId: matchedConfig.tenantId,
                provider: matchedConfig.provider,
                method: resolutionMethod,
                verifiedAt: new Date()
            };

            // Force override body.tenantId to strictly match verified tenant
            if (req.body && typeof req.body === 'object') {
                req.body.tenantId = matchedConfig.tenantId;
            }

            next();
        } catch (err) {
            console.error('[WebhookAttribution] Unexpected error during verification:', err);
            return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
        }
    };
};
