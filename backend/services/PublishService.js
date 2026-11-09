import linkedInService from './LinkedInService.js';
import facebookService from './FacebookService.js';
import twitterService from './TwitterService.js';
import googleBusinessService from './GoogleBusinessService.js';
import youtubeService from './YouTubeService.js';
import portalSyndicationService from './PortalSyndicationService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import Deal from '../models/Deal.js';
import Project from '../models/Project.js';
import axios from 'axios';
import marketingComplianceEnforcementService from './MarketingComplianceEnforcementService.js';

/**
 * PublishService.js
 * Centralized service for multi-platform distribution of Deals and Projects.
 * Handles privacy masking and platform-specific formatting.
 */
class PublishService {
    /**
     * Publish a property to selected platforms
     * @param {Object} data - The raw property data (Deal or Project)
     * @param {Object} options - Toggles and target platforms
     */
    async publish(data, options) {
        const { 
            platforms = {}, 
            privacy = { hideLocation: false, hideUnitNo: false, priceOnRequest: false }, 
            itemType = 'deal', // 'deal' or 'project'
            user = null
        } = options;

        const results = {
            success: [],
            failed: [],
            portals: null
        };

        // 🛡️ Enterprise Record-Level RBAC & Visibility Enforcement (Gate 5)
        // If publishing as an authenticated user (non-system), verify that the user has visibility to this record
        let authoritativeSource = data;
        if (user && user.isSystem !== true && data?._id) {
            const authorizedEntity = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(
                data._id,
                itemType,
                user
            );
            if (!authorizedEntity) {
                throw new Error(`Record ${data._id} is inaccessible or unauthorized for user under visibility rules`);
            }
            authoritativeSource = authorizedEntity;
        }

        // 1. Prepare Masked Content for Privacy & Server-Side Compliance
        const processedData = this._applyPrivacyMasking(authoritativeSource, privacy);
        const rawPostText = this._generateCaption(processedData, itemType, privacy);
        const { sanitizedText: postText } = marketingComplianceEnforcementService.enforceCompliance(
            rawPostText,
            authoritativeSource,
            'facebook'
        );

        // 2. Distribute to Social Platforms
        const tasks = [];

        // --- LinkedIn ---
        if (platforms.linkedin) {
            tasks.push(linkedInService.postToOrganization(postText, null, processedData.images?.[0]?.url)
                .then(() => results.success.push('LinkedIn'))
                .catch(err => results.failed.push({ platform: 'LinkedIn', error: err.message })));
        }

        // --- Facebook ---
        if (platforms.facebook) {
            tasks.push(facebookService.postToPage(postText, processedData.images?.[0]?.url, 'post')
                .then(() => results.success.push('Facebook'))
                .catch(err => results.failed.push({ platform: 'Facebook', error: err.message })));
        }

        // --- Instagram ---
        if (platforms.instagram) {
            tasks.push(facebookService.postToInstagram(postText, processedData.images?.[0]?.url, 'post')
                .then(() => results.success.push('Instagram'))
                .catch(err => results.failed.push({ platform: 'Instagram', error: err.message })));
        }

        // --- Twitter / X ---
        if (platforms.twitter) {
            tasks.push(twitterService.postTweet(postText, processedData.images?.[0]?.url)
                .then(() => results.success.push('Twitter'))
                .catch(err => results.failed.push({ platform: 'Twitter', error: err.message })));
        }

        // --- Google Business ---
        if (platforms.google || platforms.google_business) {
            tasks.push(googleBusinessService.createPost(postText, null, processedData.images?.[0]?.url)
                .then(() => results.success.push('Google Business'))
                .catch(err => results.failed.push({ platform: 'Google Business', error: err.message })));
        }

        // --- YouTube ---
        if (platforms.youtube) {
            const videoAsset = processedData.videoUrl || processedData.videos?.[0]?.url || processedData.mediaUrl || processedData.images?.[0]?.url;
            const videoTitle = (processedData.name || processedData.title || 'Premier Property Showcase').slice(0, 70);
            const videoDesc = `${postText}\n\nOfficial Catalog: https://www.bharatproperties.co/${itemType}/${data.websiteMetadata?.slug || data._id}`;
            tasks.push(youtubeService.uploadVideo(videoTitle, videoDesc, videoAsset)
                .then(() => results.success.push('YouTube'))
                .catch(err => results.failed.push({ platform: 'YouTube', error: err.message })));
        }

        // --- Real Estate Portals & Syndication (Enterprise B2B Engine) ---
        // Filter out social keys to get only portal requests
        const portalKeys = [
            '99acres', 'magicbricks', 'housing', 'commonfloor', 
            'makaan', 'olx', 'quikr', 'proptiger', 'sulekha', 
            'propertyguide', 'squareyards'
        ];
        const activePortalPlatforms = {};
        portalKeys.forEach(k => {
            if (platforms[k]) activePortalPlatforms[k] = true;
        });

        if (Object.keys(activePortalPlatforms).length > 0) {
            try {
                const syndicationRes = await portalSyndicationService.syndicate(authoritativeSource, {
                    platforms: activePortalPlatforms,
                    privacy,
                    itemType,
                    user
                });
                results.portals = syndicationRes.results;
                syndicationRes.results?.dispatched?.forEach(d => results.success.push(d.portalName));
                syndicationRes.results?.unconfigured?.forEach(u => results.failed.push({ platform: u.portalName, error: u.error }));
                syndicationRes.results?.failed?.forEach(f => results.failed.push({ platform: f.portalName, error: f.error }));
            } catch (pErr) {
                console.error('[PublishService] Portal syndication exception:', pErr.message);
                results.failed.push({ platform: 'Portals', error: pErr.message });
            }
        }

        await Promise.allSettled(tasks);

        return results;
    }

    /**
     * Strip or mask data based on user privacy choices
     */
    _applyPrivacyMasking(data, privacy = {}) {
        const masked = JSON.parse(JSON.stringify(data));
        
        if (privacy.hideLocation) {
            // Remove specific address but keep city/area if possible
            if (masked.address) {
                masked.address.street = '';
                masked.address.landmark = '';
                masked.googleMapsUrl = ''; // Hide specific map
            }
            if (masked.location) {
                const parts = masked.location.split(',');
                masked.location = parts.length > 1 ? parts.slice(-2).join(',').trim() : masked.location;
            }
        }

        if (privacy.hideUnitNo) {
            masked.unitNo = 'Unit [CONFIDENTIAL]';
            masked.name = masked.name?.replace(/#?\d+[A-Za-z]*/g, '[CONFIDENTIAL]');
        }

        if (privacy.priceOnRequest) {
            masked.price = null;
            masked.priceRange = 'Price on Request';
            if (masked.pricing) {
                masked.pricing.display = 'Price on Request';
            }
        }

        return masked;
    }

    /**
     * Generate a professional caption for social media
     */
    _generateCaption(data, type, privacy = {}) {
        const title = data.name || data.title || 'New Property Alert';
        const price = (privacy?.priceOnRequest || !data.price)
            ? (data.priceRange || 'Price on Request')
            : `Value: ₹${data.price.toLocaleString('en-IN')}`;
        const location = data.address?.location || data.locationSearch || data.location || '';
        const link = `https://www.bharatproperties.co/${type}/${data._id}`;

        return `🏠 ${title}\n📍 ${location}\n💰 ${price}\n\nCheck out this exclusive ${type} on Bharat Properties!\n\n${link}\n#RealEstate #BharatProperties #${type.toUpperCase()}`;
    }

}

export default new PublishService();
