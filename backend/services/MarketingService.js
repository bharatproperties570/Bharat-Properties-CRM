import mongoose from 'mongoose';
import unifiedAIService from './UnifiedAIService.js';
import AIGovernance from './ai/AIGovernance.js';
import AiAgent from '../models/AiAgent.js';
import Deal from '../models/Deal.js';
import {
    extractVerificationFacts,
    generateCompliantFallback,
    validateAndSanitizeCopy
} from '../utils/propertyComplianceValidator.js';
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

        // Authoritative Verification & Evidence Extraction
        const facts = extractVerificationFacts(deal);

        let platformFocus = '';
        if (platform === 'linkedin') {
            platformFocus = 'Professional, commercial-focused, and industry-oriented. Emphasize location connectivity and asset specifications.';
        } else if (platform === 'youtube') {
            platformFocus = 'Engagement-heavy. Generate a catchy video Title, Description, and a 30-second Short Script.';
        } else if (platform === 'x' || platform === 'twitter') {
            platformFocus = 'Short, punchy, strictly under 280 characters, use 2-3 trending hashtags.';
        } else if (platform === 'google_business' || platform === 'business' || platform === 'google business') {
            platformFocus = 'Local SEO focused. Highlight location advantages, landmarks, and site visit availability by appointment.';
        } else if (platform === 'instagram') {
            platformFocus = format === 'story' || format === 'reel' 
                ? 'High-energy Story/Reel script with visual cue, hook line, and tap-link CTA.'
                : 'Aesthetic visual caption with property emojis, clean bullet points, and real estate hashtags.';
        } else {
            platformFocus = 'Persuasive social feed post with strong headline, key specs, and direct call to action.';
        }

        let toneStrategy = '';
        if (tone === 'luxury') {
            toneStrategy = 'LUXURY & LIFESTYLE: Aspirational, tranquil, modern architecture, premium fixtures, lush surroundings, Vastu compliance. Use elegant English with subtle luxury emojis.';
        } else if (tone === 'investor') {
            toneStrategy = 'STRATEGIC PROPERTY ASSET: Focus on location development, infrastructure connectivity, and factual commercial/residential specs. Professional, strictly factual tone.';
        } else if (tone === 'short_hook') {
            toneStrategy = 'SHORT HOOK: Strictly under 240 characters. Fast scroll-stopping hook sentence, property price/type, and call-to-action.';
        } else {
            // Default: Urgent Deal (Hinglish)
            toneStrategy = 'URGENT DEAL (HINGLISH): High responsiveness and prime opportunity! Combine natural conversational Hindi + English. Hook the buyer with location connectivity and site visit booking.';
        }

        let provider = undefined;
        let personaPrompt = '';
        try {
            if (mongoose.connection?.readyState === 1) {
                const agent = await AiAgent.findOne({ useCases: { $in: ['social_media', 'marketing_campaigns'] }, isActive: true });
                if (agent) {
                    personaPrompt = `[SYSTEM PERSONA]\n${agent.systemPrompt}\n\n`;
                    provider = agent.provider;
                }
            }
        } catch(e) {}

        // Construct Regulatory-Compliant Guidelines based on verified facts
        const titleGuideline = facts.isTitleVerified
            ? `- Title Status: Verified by ${facts.authorityCode || 'statutory authority'}.`
            : `- Title Status: UNVERIFIED. DO NOT claim verified title, clear title, clear registry, clear documentation, or title guarantees. State: "Documentation status can be checked during due diligence."`;

        const reraGuideline = facts.isReraApproved
            ? `- RERA Status: Approved registration number ${facts.reraNumber || 'Verified'}.`
            : `- RERA Status: UNVERIFIED / NOT APPROVED. DO NOT claim RERA compliance or RERA approval.`;

        const possessionGuideline = facts.isReadyPossession
            ? `- Possession: Ready possession.`
            : `- Possession: DO NOT claim ready possession. State that possession timeline details are available on request.`;

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
            
            STRICT REGULATORY & COMPLIANCE GUIDELINES:
            ${titleGuideline}
            ${reraGuideline}
            ${possessionGuideline}
            - NEVER claim guaranteed returns, high yields, proven appreciation, or risk-free investment.
            - Include 3-5 high-performing hashtags (e.g. #BharatProperties #KurukshetraRealEstate).
            - Format: Plain text only with appropriate formatting emojis.
            - End with: "📞 Site Visit: ${regionalPhone} | 🌐 ${website}"
        `;

        try {
            const rawContent = await unifiedAIService.generate(prompt, { provider, capability: AIGovernance.CAPABILITIES.AI_MARKETING_GENERATION });
            // Post-generation deterministic compliance validation
            return validateAndSanitizeCopy(rawContent, facts, { deal, platform, tone, format });
        } catch (aiErr) {
            console.warn('[MarketingService] AI generation failed, using tailored enterprise fallback:', aiErr.message);
            // Deterministic compliant fallback with exact evidence-backed claims
            return generateCompliantFallback(deal, platform, { tone, format }, facts);
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
            if (mongoose.connection?.readyState === 1) {
                const agent = await AiAgent.findOne({ useCases: { $in: ['email_drip', 'marketing_campaigns'] }, isActive: true });
                if (agent) {
                    personaPrompt = `[SYSTEM PERSONA]\n${agent.systemPrompt}\n\n`;
                    provider = agent.provider;
                }
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
