import axios from 'axios';
import MarketingContent from '../models/MarketingContent.js';
import * as driveService from './drive.service.js';
import linkedInService from './LinkedInService.js';
import facebookService from './FacebookService.js';
import googleBusinessService from './GoogleBusinessService.js';
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
        const canonicalEntity = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(entityId, entityType, { isSystem: true });
        const { sanitizedText } = marketingComplianceEnforcementService.enforceCompliance(
            content.content,
            canonicalEntity,
            content.platform
        );

        console.log(`[PUBLISHING] Deploying to ${content.platform}...`);
        const platform = content.platform?.toLowerCase();

        // Dry-run is explicitly non-publishing: never mark a simulated post as published.
        if (process.env.MARKETING_DRY_RUN === 'true') {
            return { success: false, published: false, mode: 'dry_run', message: 'Dry run completed; no platform post was created.' };
        }

        if (platform === 'facebook' || platform === 'instagram') {
            const mediaUrl = content.mediaUrls?.[0] || null;
            if (!mediaUrl) {
                throw new Error(`No approved CRM media asset is attached to this ${platform} post; refusing to substitute a generic image.`);
            }
            const result = platform === 'facebook'
                ? await facebookService.postToPage(sanitizedText, mediaUrl, content.metadata?.format || 'post')
                : await facebookService.postToInstagram(sanitizedText, mediaUrl, content.metadata?.format || 'post');
            if (!result?.success || !result?.postId) {
                throw new Error(`${platform} provider did not confirm a remote post ID.`);
            }
            await this._markAsPublished(contentId, platform, String(result.postId));
            return { success: true, published: true, remotePostId: String(result.postId), message: `Successfully published to ${platform}` };
        }

        if (platform === 'google_business') {
            const result = await googleBusinessService.createPost(sanitizedText, null, content.mediaUrls?.[0] || null);
            const remotePostId = result?.data?.name || result?.data?.id || null;
            if (!result?.success || !remotePostId) {
                throw new Error('Google Business Profile did not return a durable post ID.');
            }
            await this._markAsPublished(contentId, platform, String(remotePostId));
            return { success: true, published: true, remotePostId: String(remotePostId), message: 'Successfully published to Google Business Profile' };
        }

        // ── LinkedIn Activation ──────────────────────────────────────────────
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
                const result = await linkedInService.postToOrganization(sanitizedText, null, assetUrn);
                const remotePostId = result?.postId;
                if (!result?.success || !remotePostId || remotePostId === 'linkedin_post_success') {
                    throw new Error('LinkedIn did not return a verified remote post ID.');
                }
                await this._markAsPublished(contentId, platform, String(remotePostId));
                return { success: true, published: true, remotePostId: String(remotePostId), message: 'Successfully published to LinkedIn' };
            } catch (err) {
                console.error('[LINKEDIN PUBLISH ERROR]:', err.message);
                throw new Error(`LinkedIn deployment failed: ${err.message}`);
            }
        }

        throw new Error(`Publishing adapter is not implemented for platform: ${content.platform}`);
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
        const canonicalEntity = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(entityId, entityType, { isSystem: true });
        const { sanitizedText } = marketingComplianceEnforcementService.enforceCompliance(
            content.content,
            canonicalEntity,
            'whatsapp'
        );

        if (process.env.MARKETING_DRY_RUN === 'true') {
            return { success: false, published: false, mode: 'dry_run', message: 'Dry run completed; no WhatsApp message was sent.' };
        }

        throw new Error('WhatsApp publishing is not implemented in MarketingPublishingService; use the approved WhatsApp dispatch workflow.');
    }

    async _markAsPublished(id, platform, remotePostId) {
        if (!platform || !remotePostId) {
            throw new Error('A confirmed platform and remote post ID are required before marking content as published.');
        }
        await MarketingContent.findByIdAndUpdate(id, {
            $set: {
                status: 'published',
                publishedAt: new Date(),
                [`metadata.platformPostIds.${platform}`]: String(remotePostId)
            }
        });
    }
}

export default new MarketingPublishingService();
