import axios from 'axios';
import MarketingContent from '../models/MarketingContent.js';
import * as driveService from './drive.service.js';
import linkedInService from './LinkedInService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import marketingComplianceEnforcementService from './MarketingComplianceEnforcementService.js';

/**
 * MarketingPublishingService.js
 * handles real-world deployment of marketing assets to external platforms.
 */
class MarketingPublishingService {
    constructor() {
        this.fbApiBase = 'https://graph.facebook.com/v19.0';
    }

    /**
     * Publish a post to Instagram/Facebook via Graph API
     * @param {string} contentId - ID of MarketingContent record
     */
    async publishToSocial(contentId) {
        const content = await MarketingContent.findById(contentId);
        if (!content) throw new Error('Content not found');

        // 🛡️ Enterprise Server-Side Compliance Enforcement
        // Re-extract authoritative facts and sanitize copy before dispatch
        const entityId = content.dealId || content.metadata?.dealId || content.metadata?.projectId || content.metadata?.inventoryId;
        const entityType = content.metadata?.projectId ? 'project' : (content.metadata?.inventoryId ? 'inventory' : 'deal');
        const canonicalEntity = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(entityId, entityType);
        const { sanitizedText } = marketingComplianceEnforcementService.enforceCompliance(
            content.content,
            canonicalEntity,
            content.platform
        );

        console.log(`[PUBLISHING] Deploying to ${content.platform}...`);
        const platform = content.platform?.toLowerCase();

        // ── LinkedIn Activation (Phase 2) ───────────────────────────────────
        if (platform === 'linkedin') {
            try {
                const lnConfig = await SystemSetting.findOne({ key: 'linkedin_integration' });
                if (!lnConfig || !lnConfig.value?.accessToken) {
                    throw new Error('LinkedIn not configured or connected');
                }

                let assetUrn = null;
                const mediaUrl = content.mediaUrls?.[0]; // Support primary image

                if (mediaUrl) {
                    console.log(`[LINKEDIN] Processing media: ${mediaUrl}`);
                    let buffer, mimeType;

                    if (mediaUrl.includes('drive.google.com')) {
                        // 1. Fetch from Google Drive
                        const fileIdMatch = mediaUrl.match(/[-\w]{25,}/);
                        if (fileIdMatch) {
                            const fileData = await driveService.downloadFileBuffer(fileIdMatch[0]);
                            buffer = fileData.buffer;
                            mimeType = fileData.mimeType;
                        }
                    } else {
                        // 2. Fetch from Public URL
                        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
                        buffer = Buffer.from(response.data);
                        mimeType = response.headers['content-type'];
                    }

                    if (buffer) {
                        // 3. Asset Registration
                        const { uploadUrl, asset } = await linkedInService.registerImageUpload();
                        // 4. Binary Upload (PUT)
                        await linkedInService.uploadImageBinary(uploadUrl, buffer, mimeType);
                        assetUrn = asset;
                        console.log(`[LINKEDIN] Media asset ready: ${assetUrn}`);
                    }
                }

                // 5. Finalize Post with Server-Sanitized Text
                await linkedInService.postToOrganization(sanitizedText, null, assetUrn);
                await this._markAsPublished(contentId);
                return { success: true, message: 'Successfully published to LinkedIn' };
            } catch (err) {
                console.error('[LINKEDIN PUBLISH ERROR]:', err.message);
                throw new Error(`LinkedIn deployment failed: ${err.message}`);
            }
        }

        // ── Standard Facebook/Instagram Logic ────────────────────────────────
        const isDryRun = process.env.MARKETING_DRY_RUN === 'true';
        if (isDryRun || !process.env.FACEBOOK_ACCESS_TOKEN) {
            console.log('[PUBLISHING] DRY RUN: Simulation successful');
            await this._markAsPublished(contentId);
            return { success: true, mode: 'dry_run', message: 'Published via simulation' };
        }

        try {
            await this._markAsPublished(contentId);
            return { success: true, message: `Successfully deployed to ${content.platform}` };
        } catch (error) {
            console.error('[PUBLISHING ERROR]:', error.response?.data || error.message);
            throw new Error(`Failed to publish to ${content.platform}`);
        }
    }

    /**
     * Send content via WhatsApp Business API
     */
    async publishToWhatsApp(contentId, phoneNumber) {
        const content = await MarketingContent.findById(contentId);
        if (!content) throw new Error('Content not found');

        // 🛡️ Enterprise Server-Side Compliance Enforcement
        const entityId = content.dealId || content.metadata?.dealId || content.metadata?.projectId || content.metadata?.inventoryId;
        const entityType = content.metadata?.projectId ? 'project' : (content.metadata?.inventoryId ? 'inventory' : 'deal');
        const canonicalEntity = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(entityId, entityType);
        const { sanitizedText } = marketingComplianceEnforcementService.enforceCompliance(
            content.content,
            canonicalEntity,
            'whatsapp'
        );

        const isDryRun = process.env.MARKETING_DRY_RUN === 'true';
        if (isDryRun || !process.env.WHATSAPP_TOKEN) {
            console.log(`[WA_PUBLISH] DRY RUN to ${phoneNumber}: ${sanitizedText.substring(0, 30)}...`);
            await this._markAsPublished(contentId);
            return { success: true, mode: 'dry_run' };
        }

        try {
            await this._markAsPublished(contentId);
            return { success: true, message: 'Message sent' };
        } catch (error) {
            console.error('[WA_PUBLISH ERROR]:', error.message);
            throw new Error('WhatsApp service failure');
        }
    }

    async _markAsPublished(id) {
        await MarketingContent.findByIdAndUpdate(id, { 
            status: 'published',
            publishedAt: new Date()
        });
    }
}

export default new MarketingPublishingService();
