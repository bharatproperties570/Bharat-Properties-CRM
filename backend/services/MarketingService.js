import unifiedAIService from './UnifiedAIService.js';
import AiAgent from '../models/AiAgent.js';

/**
 * MarketingService.js
 * Specialized logic for real estate marketing content generation.
 */
class MarketingService {
    /**
     * Generate social media content for a deal
     * @param {Object} deal - Deal data
     * @param {string} platform - 'instagram', 'facebook', 'linkedin', etc.
     */
    async generateSocialPost(deal, platform) {
        if (!deal) throw new Error('Deal data is required for generation');
        
        const unitNo = deal.unitNo || 'Premium';
        const projectName = deal.projectName || 'Luxury Residence';
        const price = deal.price ? `₹${deal.price.toLocaleString('en-IN')}` : 'Contact for Price';
        const size = deal.size ? `${deal.size} ${deal.sizeUnit || 'sq.ft'}` : '';
        const location = deal.location || '';
        const unitType = deal.unitType || '';
        const floorInfo = deal.floorNo ? `Floor ${deal.floorNo}` : '';

        let platformFocus = '';
        if (platform === 'linkedin') {
            platformFocus = 'Professional, investment-focused, and industry-oriented. Use a clean layout.';
        } else if (platform === 'youtube') {
            platformFocus = 'Engagement-heavy. Generate a catchy video Title, Description, and a 30-second Short Script.';
        } else if (platform === 'google_business' || platform === 'business') {
            platformFocus = 'Local SEO focused. Highlight location advantages and immediate availability.';
        }

        let provider = undefined;
        let personaPrompt = '';
        try {
            const agent = await AiAgent.findOne({ useCases: { $in: ['social_media', 'marketing_campaigns'] }, isActive: true });
            if (agent) {
                personaPrompt = `[SYSTEM PERSONA]\n${agent.systemPrompt}\n\n`;
                provider = agent.provider;
            }
        } catch(e) {}

        const prompt = `
            ${personaPrompt}
            You are a professional Real Estate Marketing Expert for "Bharat Properties". 
            Generate a high-converting ${platform} post for:
            
            PROPERTY DETAILS:
            - Title: ${unitNo} ${unitType} at ${projectName}
            - Location: ${location}
            - Space: ${size} (${floorInfo})
            - Investment: ${price}
            
            PLATFORM STRATEGY:
            ${platformFocus}
            
            GUIDELINES:
            - Use professional and persuasive language.
            - Include 3-5 high-performing hashtags.
            - Focus on: Built-up quality, location connectivity, and premium lifestyle.
            - Format: Plain text only.
            - If YouTube: Separate Title, Description, and Script sections.
        `;

        return await unifiedAIService.generate(prompt, { provider });
    }

    /**
     * Generate email campaign content
     */
    async generateEmailCampaign(deal, targetAudience = 'Investors') {
        if (!deal) throw new Error('Deal data is required for generation');
        
        const unitNo = deal.unitNo || 'Premium Unit';
        const projectName = deal.projectName || 'Luxury Residence';

        let provider = undefined;
        let personaPrompt = '';
        try {
            const agent = await AiAgent.findOne({ useCases: { $in: ['email_drip', 'marketing_campaigns'] }, isActive: true });
            if (agent) {
                personaPrompt = `[SYSTEM PERSONA]\n${agent.systemPrompt}\n\n`;
                provider = agent.provider;
            }
        } catch(e) {}

        const prompt = `
            ${personaPrompt}
            Create a professional marketing email for: ${unitNo} at ${projectName}.
            Target Audience: ${targetAudience}
            
            Return in JSON format:
            {
                "subject": "Email Subject",
                "body": "Email Body with placeholders matching {lead_name}"
            }
        `;

        const response = await unifiedAIService.generate(prompt, { provider });
        try {
            return JSON.parse(response);
        } catch (e) {
            return { subject: `Exclusive Opportunity: ${projectName}`, body: response };
        }
    }

    /**
     * Generate WhatsApp/SMS hook
     */
    async generateShortHook(deal) {
        if (!deal) throw new Error('Deal data is required for generation');
        let provider = undefined;
        let personaPrompt = '';
        try {
            const agent = await AiAgent.findOne({ useCases: { $in: ['sms_automation', 'whatsapp_live'] }, isActive: true });
            if (agent) {
                personaPrompt = `[SYSTEM PERSONA]\n${agent.systemPrompt}\n\n`;
                provider = agent.provider;
            }
        } catch(e) {}

        const prompt = `
            ${personaPrompt}
            Generate a 160-character WhatsApp hook for: ${deal.unitNo || 'Premium Unit'} ${deal.projectName || ''}.
            Must be punchy and include a call to action.
        `;
        return await unifiedAIService.generate(prompt, { provider });
    }
}

export default new MarketingService();
