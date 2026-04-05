import unifiedAIService from './UnifiedAIService.js';
import AiAgent from '../models/AiAgent.js';
import Deal from '../models/Deal.js';
// Assuming CampaignEngine or a worker queue is available
// import CampaignEngine from './CampaignEngine.js'; 

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
     * Trigger Automated Marketing Loop (Auto-Pilot)
     * @param {string} dealId - The created deal ID
     */
    async triggerAutoMarketing(dealId) {
        try {
            const deal = await Deal.findById(dealId).populate('owner');
            if (!deal) return console.error('[AUTO-MARKETING]: Deal not found', dealId);

            console.log(`[AUTO-MARKETING]: Activating 360° Loop for Deal: ${deal.unitNo} @ ${deal.projectName}`);

            // 1. Generate Platform Captions
            const igPost = await this.generateSocialPost(deal, 'instagram');
            const fbPost = await this.generateSocialPost(deal, 'facebook');

            // 2. Generate Messaging Hooks
            const msgHook = await this.generateShortHook(deal);

            // 3. Queue for Peak Window (Logic: Next 7:15 PM slot)
            const peakTime = new Date();
            peakTime.setHours(19, 15, 0, 0);
            if (peakTime < new Date()) peakTime.setDate(peakTime.getDate() + 1);

            // Log automation trigger (In production, this would be a BullMQ push)
            console.log(`[AUTO-MARKETING]: Content Generated. Queued for: ${peakTime.toLocaleString()}`);
            
            // Return automation payload (Can be picked up by Socket.io or Workers)
            return {
                success: true,
                dealId,
                campaigns: [
                    { platform: 'Instagram', content: igPost, status: 'scheduled', time: peakTime },
                    { platform: 'WhatsApp', content: msgHook, status: 'scheduled', time: 'immediate' }
                ]
            };
        } catch (error) {
            console.error('[AUTO-MARKETING ERROR]:', error);
            throw error;
        }
    }
}

export default new MarketingService();
