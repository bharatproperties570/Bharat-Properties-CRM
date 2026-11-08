import unifiedAIService from './UnifiedAIService.js';
import AIGovernance from './ai/AIGovernance.js';
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
    async generateSocialPost(deal, platform, options = {}) {
        if (!deal) throw new Error('Deal data is required for generation');
        
        const unitNo = deal.unitNo || 'Premium';
        const projectName = deal.projectName || 'Luxury Residence';
        const price = deal.price ? (typeof deal.price === 'number' ? `₹${deal.price.toLocaleString('en-IN')}` : deal.price) : 'Contact for Price';
        const size = deal.size ? `${deal.size} ${deal.sizeUnit || 'sq.ft'}` : '';
        const location = deal.location || 'Kurukshetra, Haryana';
        const unitType = deal.unitType || '';
        const floorInfo = deal.floorNo ? `Floor ${deal.floorNo}` : '';
        const tone = options.tone || 'urgent';
        const format = options.format || 'post';

        // Regional Contact Resolution
        const isMohali = location.toLowerCase().includes('mohali');
        const regionalPhone = isMohali ? '+91 99910 00570' : '+91 99913 33570';
        const website = 'www.bharatproperties.co';

        let platformFocus = '';
        if (platform === 'linkedin') {
            platformFocus = 'Professional, investment-focused, and industry-oriented. Emphasize capital appreciation and legal verification.';
        } else if (platform === 'youtube') {
            platformFocus = 'Engagement-heavy. Generate a catchy video Title, Description, and a 30-second Short Script.';
        } else if (platform === 'x' || platform === 'twitter') {
            platformFocus = 'Short, punchy, highly engaging, strictly under 280 characters, use 2-3 trending hashtags.';
        } else if (platform === 'google_business' || platform === 'business' || platform === 'google business') {
            platformFocus = 'Local SEO focused. Highlight location advantages, landmarks, and immediate site visit availability.';
        } else if (platform === 'instagram') {
            platformFocus = format === 'story' || format === 'reel' 
                ? 'High-energy Story/Reel script with visual cue, hook line, and tap-link CTA.'
                : 'Aesthetic visual caption with luxury emojis, clean bullet points, and high-converting real estate hashtags.';
        } else {
            platformFocus = 'Persuasive social feed post with strong headline, key specs, verified badges, and direct call to action.';
        }

        let toneStrategy = '';
        if (tone === 'luxury') {
            toneStrategy = 'LUXURY & LIFESTYLE: Aspirational, tranquil, modern architecture, premium fixtures, lush surroundings, Vastu compliance. Use elegant English with subtle luxury emojis.';
        } else if (tone === 'investor') {
            toneStrategy = 'INVESTOR ROI & CAPITAL GROWTH: Focus on high rental yield, rapid infrastructure growth, registry title guarantee, and prime connectivity. Factual, professional tone.';
        } else if (tone === 'short_hook') {
            toneStrategy = 'SHORT HOOK: Strictly under 240 characters. Ultra-fast scroll-stopping hook sentence, property price/type, and call-to-action.';
        } else {
            // Default: Urgent Deal (Hinglish)
            toneStrategy = 'URGENT DEAL (HINGLISH): High FOMO and urgency! Combine natural conversational Hindi + English. Hook the buyer with scarcity ("Limited Units Left", "Ready for Possession", "Instant Site Visit Booking").';
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
            You are an elite Real Estate Copywriter for "Bharat Properties".
            Generate a high-converting ${platform} ${format} for:
            
            PROPERTY DETAILS:
            - Title: ${unitNo} ${unitType} at ${projectName}
            - Location: ${location}
            - Space: ${size} ${floorInfo ? `(${floorInfo})` : ''}
            - Investment / Price: ${price}
            - Official Contact: ${regionalPhone}
            - Website: ${website}
            
            TONE & VOICE:
            ${toneStrategy}

            PLATFORM STRATEGY:
            ${platformFocus}
            
            GUIDELINES:
            - Highlight: Verified Title, Prime Location, Clear Documentation.
            - Include 3-5 high-performing hashtags (e.g. #BharatProperties #KurukshetraRealEstate).
            - Format: Plain text only with appropriate formatting emojis.
            - End with: "📞 Site Visit: ${regionalPhone} | 🌐 ${website}"
        `;

        try {
            return await unifiedAIService.generate(prompt, { provider, capability: AIGovernance.CAPABILITIES.AI_MARKETING_GENERATION });
        } catch (aiErr) {
            console.warn('[MarketingService] AI generation failed, using tailored enterprise fallback:', aiErr.message);
            
            // Enterprise Resilient Fallbacks based on Tone
            if (tone === 'luxury') {
                return `💎 EXCLUSIVE LUXURY LIVING | ${projectName}\n\nIndulge in refined architecture and serene living at ${location}. Designed for those who value timeless quality and premier lifestyle amenities.\n\n✨ Unit: ${unitNo} ${unitType} (${size})\n💰 Investment: ${price}\n📜 Verified Title & RERA Compliant\n\nPrivate viewings available on prior appointment:\n📞 ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #LuxuryHomes #PrimeRealEstate #Kurukshetra`;
            } else if (tone === 'investor') {
                return `📈 HIGH-YIELD INVESTMENT OPPORTUNITY | ${projectName}\n\nPrime commercial/residential asset positioned in the high-growth corridor of ${location}. Proven capital appreciation and strong rental yield potential.\n\n🔑 Property: ${unitNo} ${unitType} (${size})\n💵 Price: ${price}\n🛡️ 100% Verified Title & Clear Registry\n\nRequest financial breakdown & advisory:\n📞 ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #RealEstateInvestment #CapitalGrowth #CommercialProperty`;
            } else if (tone === 'short_hook') {
                return `🚨 Prime Deal Alert in ${location}! ${unitNo} at just ${price}. 100% verified registry title. Call ${regionalPhone} to book site visit now! 🌐 ${website} #BharatProperties`;
            } else {
                return `🔥 URGENT DEAL ALERT: ${unitNo} ${unitType} at ${projectName}!\n\nKurukshetra ke prime location ${location} par ready possession opportunity! Verified title, bank loan approval, aur prime connectivity.\n\n📍 Location: ${location}\n📐 Area: ${size}\n💰 Price: ${price}\n\nLimited units available — aaj hi site visit book karein!\n📞 Call/WhatsApp: ${regionalPhone}\n🌐 ${website}\n\n#BharatProperties #Kurukshetra #HotProperty #RealEstateDeals`;
            }
        }
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

        const response = await unifiedAIService.generate(prompt, { provider, capability: AIGovernance.CAPABILITIES.AI_MARKETING_GENERATION });
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
