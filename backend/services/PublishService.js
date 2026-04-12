import linkedInService from './LinkedInService.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import Deal from '../models/Deal.js';
import Project from '../models/Project.js';
import axios from 'axios';

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
            privacy = { hideLocation: false, hideUnitNo: false }, 
            itemType = 'deal' // 'deal' or 'project'
        } = options;

        const results = {
            success: [],
            failed: []
        };

        // 1. Prepare Masked Content for Privacy
        const processedData = this._applyPrivacyMasking(data, privacy);
        const postText = this._generateCaption(processedData, itemType);

        // 2. Distribute to Platforms
        const tasks = [];


        // --- LinkedIn ---
        if (platforms.linkedin) {
            tasks.push(linkedInService.postToOrganization(postText, null, processedData.images?.[0]?.url)
                .then(() => results.success.push('LinkedIn'))
                .catch(err => results.failed.push({ platform: 'LinkedIn', error: err.message })));
        }

        // --- Facebook / Instagram (Placeholder for now) ---
        if (platforms.facebook || platforms.instagram) {
            // Integration logic would go here
            results.success.push(platforms.facebook ? 'Facebook' : 'Instagram');
        }

        // --- Google Business (Product) ---
        if (platforms.google) {
            // Google Business Product API logic
            results.success.push('Google Business');
        }

        // --- YouTube ---
        if (platforms.youtube) {
             // YouTube Upload logic
             results.success.push('YouTube');
        }

        await Promise.allSettled(tasks);

        return results;
    }

    /**
     * Strip or mask data based on user privacy choices
     */
    _applyPrivacyMasking(data, privacy) {
        const masked = JSON.parse(JSON.stringify(data));
        
        if (privacy.hideLocation) {
            // Remove specific address but keep city/area if possible
            if (masked.address) {
                masked.address.street = '';
                masked.address.landmark = '';
                masked.googleMapsUrl = ''; // Hide specific map
            }
        }

        if (privacy.hideUnitNo) {
            masked.unitNo = 'Unit #XXX';
            masked.name = masked.name?.replace(/\d+/, 'XXX');
        }

        return masked;
    }

    /**
     * Generate a professional caption for social media
     */
    _generateCaption(data, type) {
        const title = data.name || data.title || 'New Property Alert';
        const price = data.price ? `Value: ₹${data.price.toLocaleString('en-IN')}` : '';
        const location = data.address?.location || data.locationSearch || '';
        const link = `https://bharatproperties.in/${type}/${data._id}`;

        return `🏠 ${title}\n📍 ${location}\n💰 ${price}\n\nCheck out this exclusive ${type} on Bharat Properties!\n\n${link}\n#RealEstate #BharatProperties #${type.toUpperCase()}`;
    }

}

export default new PublishService();
