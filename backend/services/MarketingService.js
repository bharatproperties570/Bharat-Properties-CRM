import mongoose from 'mongoose';
import unifiedAIService from './UnifiedAIService.js';
import AIGovernance from './ai/AIGovernance.js';
import AiAgent from '../models/AiAgent.js';
import Deal from '../models/Deal.js';
import MarketingContent from '../models/MarketingContent.js';
import Activity from '../models/Activity.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import { marketingQueue } from '../src/queues/marketingQueue.js';
import brandBannerComposer from './BrandBannerComposer.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import {
    extractVerificationFacts,
    generateCompliantFallback,
    validateAndSanitizeCopy
} from '../utils/propertyComplianceValidator.js';
import marketingComplianceEnforcementService from './MarketingComplianceEnforcementService.js';
import { getQueuedContentStatus } from '../utils/marketingOsTruth.js';

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

    /**
     * Generate actual AI visual asset (image or video)
     * Enterprise Sharp Composition Engine + Brand Kit (Logo, Typography, Badges, Footer)
     * @param {Object} options - { deal, type, angle, mood, format, customPrompt, pillar, festival, edu, trust }
     */
    async generateVisualAsset(options = {}) {
        const { deal, type = 'image', angle = 'drone', mood = 'golden_hour', format = 'post', customPrompt = '', pillar } = options;
        
        const projectName = deal?.projectName?.name || deal?.projectName || deal?.name || deal?.title || deal?.unitNo || 'Prime Real Estate Opportunity';
        let rawLoc = deal?.location || deal?.locCity || deal?.city || deal?.address?.location || 'Kurukshetra, Haryana';
        if (typeof rawLoc !== 'string' || rawLoc === 'null' || rawLoc === 'undefined' || /^[0-9a-fA-F]{24}$/.test(String(rawLoc).trim())) {
            rawLoc = 'Kurukshetra, Haryana';
        }
        const location = rawLoc;
        const isMohali = location.toLowerCase().includes('mohali');
        const phone = isMohali ? '9991000570' : '9416035570';

        if (type === 'video') {
            return {
                success: false,
                assetType: 'video',
                status: 'provider_unavailable',
                url: null,
                error: 'No configured video-generation provider is available in this execution path.',
                prompt: customPrompt || `Cinematic real-estate video concept for ${projectName} in ${location}; use only verified source media for the actual property.`
            };
        }

        // Enterprise Brand Banner Generation via Sharp Engine
        try {
            // Determine active pillar
            let targetPillar = pillar;
            if (!targetPillar) {
                if (deal) {
                    targetPillar = 'ct-project';
                } else {
                    const festCheck = await this.detectUpcomingFestival(new Date());
                    targetPillar = festCheck.isFestival ? 'ct-festival' : 'ct-project';
                }
            }

            const bannerResult = await brandBannerComposer.composeBanner({
                pillar: targetPillar,
                deal,
                maskUnitNo: options.maskUnitNo !== undefined ? options.maskUnitNo : true,
                festivalName: options.festival?.name || options.festivalName || 'Festive Greetings',
                greeting: options.festival?.greeting || options.greeting,
                customTitleHi: options.customTitleHi || options.festival?.customTitleHi || (targetPillar === 'ct-festival' ? 'त्योहार की हार्दिक शुभकामनाएं' : undefined),
                customTitleEn: options.customTitleEn || options.festival?.customTitleEn || (targetPillar === 'ct-festival' ? 'FESTIVE GREETINGS' : undefined),
                subtext: options.subtext || options.festival?.subtext,
                edu: options.edu,
                trust: options.trust,
                phone: `+91 ${phone} | 99913-33570`,
                address: '#166, Sector 3, Huda Market, Kurukshetra',
                website: 'www.bharatproperties.co'
            });

            return bannerResult;
        } catch (err) {
            console.error('[MarketingService] Error in BrandBannerComposer:', err);
            return {
                success: false,
                assetType: 'image',
                status: 'render_failed',
                url: null,
                error: err.message || 'Visual asset rendering failed.'
            };
        }
    }

    // ── 🧠 AUTONOMOUS ENTERPRISE MARKETING OS ENGINE ─────────────────────────

    /**
     * Detect major Indian festivals for the exact target date and enforce once-per-year idempotency
     * Rule: Festival posts must ONLY trigger on the exact festival day (in the morning) and never repeatedly.
     * @param {Date} date 
     * @param {Object} options
     */
    async detectUpcomingFestival(date = new Date(), options = {}) {
        const d = new Date(date);
        const m = d.getMonth() + 1; // 1-12
        const day = d.getDate();
        const year = d.getFullYear();
        const dateKey = `${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Major Indian festival calendar with exact dates (2025, 2026, 2027) & dynamic titles
        const festivalCalendar = [
            { 
                name: 'Lohri & Makar Sankranti', 
                month: 1, 
                day: 14, 
                customTitleHi: 'शुभ लोहड़ी एवं मकर संक्रांति',
                customTitleEn: 'HAPPY LOHRI & MAKAR SANKRANTI',
                greeting: 'Happy Lohri & Makar Sankranti! May this harvest season bring prosperity and your dream home closer to your family.',
                subtext: 'May this auspicious harvest festival bring immense prosperity, happiness, and enduring real estate wealth to your household.'
            },
            { 
                name: 'Republic Day', 
                month: 1, 
                day: 26, 
                customTitleHi: 'गणतंत्र दिवस की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY REPUBLIC DAY',
                greeting: 'Happy Republic Day! Proudly celebrating the foundation and growth of our nation. Invest in a secure future with Bharat Properties.',
                subtext: 'Celebrating the sovereign glory of India with trust, transparency, and pride in verified land ownership.'
            },
            { 
                name: 'Maha Shivratri', 
                dates: { 2025: '02-26', 2026: '02-15', 2027: '03-06' },
                customTitleHi: 'महाशिवरात्रि की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY MAHA SHIVRATRI',
                greeting: 'Har Har Mahadev! Warm greetings on Maha Shivratri. May Lord Shiva bless your home with peace and prosperity.',
                subtext: 'May Lord Shiva shower divine blessings of peace, health, and abundant prosperity upon your family.'
            },
            { 
                name: 'Holi', 
                dates: { 2025: '03-14', 2026: '03-04', 2027: '03-22' },
                customTitleHi: 'रंगों के महापर्व होली की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY HOLI',
                greeting: 'Happy Holi! Wishing you and your family vibrant colors of joy, success, and prosperity in your new home.',
                subtext: 'May this festival of vibrant colors fill your lives with joy, eternal peace, and fruitful investments.'
            },
            { 
                name: 'Baisakhi', 
                month: 4, 
                day: 14, 
                customTitleHi: 'बैसाखी दी लख-लख वधाइयां',
                customTitleEn: 'HAPPY BAISAKHI',
                greeting: 'Happy Baisakhi! May Waheguru shower you with success and prosperity this harvest season.',
                subtext: 'May the harvest season bring abundant joy, successful ventures, and prime property ownership.'
            },
            { 
                name: 'Independence Day', 
                month: 8, 
                day: 15, 
                customTitleHi: 'स्वतंत्रता दिवस की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY INDEPENDENCE DAY',
                greeting: 'Happy Independence Day! Celebrate the freedom of owning your own land with Bharat Properties.',
                subtext: 'Celebrating 100% verified titles and freedom from property disputes with 30+ years of trust.'
            },
            { 
                name: 'Raksha Bandhan', 
                dates: { 2025: '08-09', 2026: '08-28', 2027: '08-17' },
                customTitleHi: 'रक्षाबंधन की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY RAKSHA BANDHAN',
                greeting: 'Happy Raksha Bandhan! Gift the promise of lifetime security with a verified property.',
                subtext: 'Securing the future of your family with undisputed registry and permanent asset protection.'
            },
            { 
                name: 'Janmashtami', 
                dates: { 2025: '08-16', 2026: '09-04', 2027: '08-25' },
                customTitleHi: 'श्री कृष्ण जन्माष्टमी की शुभकामनाएं',
                customTitleEn: 'HAPPY JANMASHTAMI',
                greeting: 'Jai Shri Krishna! Warm wishes on Janmashtami from the sacred land of Gita, Kurukshetra.',
                subtext: 'Divine blessings of Lord Krishna from the holy land of Dharamkshetra Kurukshetra.'
            },
            { 
                name: 'Gandhi Jayanti', 
                month: 10, 
                day: 2, 
                customTitleHi: 'गांधी जयंती की शुभकामनाएं',
                customTitleEn: 'GANDHI JAYANTI GREETINGS',
                greeting: 'Remembering Mahatma Gandhi on his birth anniversary. Dedicated to honesty, truth, and transparency in real estate.',
                subtext: 'Upholding uncompromising truth, ethics, and full transparency in every land transaction.'
            },
            { 
                name: 'Navratri & Dussehra', 
                dates: { 2025: '10-02', 2026: '10-20', 2027: '10-10' },
                customTitleHi: 'विजयादशमी एवं दशहरा की शुभकामनाएं',
                customTitleEn: 'HAPPY DUSSEHRA',
                greeting: 'Subh Navratri & Happy Dussehra! May the victory of good over evil bring abundant prosperity to your household.',
                subtext: 'May the victory of truth illuminate new beginnings and auspicious milestones in real estate ownership.'
            },
            { 
                name: 'Karwa Chauth', 
                dates: { 2025: '10-10', 2026: '10-29', 2027: '10-18' },
                customTitleHi: 'करवा चौथ की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY KARWA CHAUTH',
                greeting: 'Happy Karwa Chauth! Wishing all families lifelong happiness, togetherness, and security in their own home.',
                subtext: 'Celebrating timeless love, devotion, and permanent family security with Bharat Properties.'
            },
            { 
                name: 'Dhanteras & Diwali', 
                dates: { 2025: '10-20', 2026: '11-08', 2027: '10-29' },
                customTitleHi: 'शुभ धनतेरस एवं दीपावली',
                customTitleEn: 'HAPPY DHANTERAS & DIWALI',
                greeting: 'Shubh Dhanteras & Happy Diwali! This festive season, invest in enduring wealth with prime verified real estate.',
                subtext: 'May Goddess Lakshmi illuminate your life with infinite wealth, happiness, and your dream home!'
            },
            { 
                name: 'Govardhan Puja', 
                dates: { 2025: '10-22', 2026: '11-09', 2027: '10-30' },
                customTitleHi: 'गोवर्धन पूजा की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY GOVARDHAN PUJA',
                greeting: 'Happy Govardhan Puja! May Lord Krishna protect and nourish your household with peace and prosperity.',
                subtext: 'May divine blessings nourish your roots and bring abundance to your investments.'
            },
            { 
                name: 'Bhai Dooj', 
                dates: { 2025: '10-23', 2026: '11-10', 2027: '10-31' },
                customTitleHi: 'भाई दूज की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY BHAI DOOJ',
                greeting: 'Happy Bhai Dooj! Strengthening the timeless bonds of trust, protection, and care with Bharat Properties.',
                subtext: 'Celebrating timeless family bonds with undisputed registry and permanent asset protection.'
            },
            { 
                name: 'Chhath Puja', 
                dates: { 2025: '10-27', 2026: '11-15', 2027: '11-04' },
                customTitleHi: 'छठ महापर्व की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY CHHATH PUJA',
                greeting: 'Happy Chhath Puja! May the Sun God bestow health, positivity, and boundless prosperity upon your family.',
                subtext: 'Saluting the radiant Sun God and celebrating purity, determination, and prosperous beginnings.'
            },
            { 
                name: 'Guru Nanak Jayanti (Gurpurab)', 
                dates: { 2025: '11-05', 2026: '11-24', 2027: '11-14' },
                customTitleHi: 'गुरुपर्व दी लख-लख वधाइयां',
                customTitleEn: 'GURPURAB DI LAKH LAKH VADHAYIAN',
                greeting: 'Gurpurab Di Lakh Lakh Vadhaiyan! May Guru Nanak Dev Ji guide your path with peace, harmony, and prosperity.',
                subtext: 'May Guru Nanak Dev Ji bless you with inner peace, selfless service, and lasting family prosperity.'
            },
            { 
                name: 'Christmas', 
                month: 12, 
                day: 25, 
                customTitleHi: 'क्रिसमस की हार्दिक शुभकामनाएं',
                customTitleEn: 'MERRY CHRISTMAS',
                greeting: 'Merry Christmas! May this joyful festive season bring peace, warmth, and blessings to your home.',
                subtext: 'Wishing you and your loved ones peace, warmth, and joyous milestones this Christmas season.'
            },
            { 
                name: 'New Year', 
                month: 1, 
                day: 1, 
                customTitleHi: 'नव वर्ष की हार्दिक शुभकामनाएं',
                customTitleEn: 'HAPPY NEW YEAR',
                greeting: 'Happy New Year! Start this year with the foundation of your family\'s financial freedom through prime property investments.',
                subtext: 'Stepping into a new year of growth, landmark developments, and wealth creation with Bharat Properties.'
            }
        ];

        for (const fest of festivalCalendar) {
            let matchesToday = false;
            if (fest.dates && fest.dates[year]) {
                matchesToday = (fest.dates[year] === dateKey);
            } else if (fest.month && fest.day) {
                matchesToday = (fest.month === m && fest.day === day);
            }

            // Strict Date Mandate: Festival posts MUST ONLY trigger on the exact date of the festival
            if (matchesToday) {
                // Deduplication Mandate: Check if a post for this festival has already been published/scheduled this year
                if (mongoose.connection && mongoose.connection.readyState === 1 && !options.ignoreDuplicateCheck) {
                    try {
                        const startOfYear = new Date(year, 0, 1);
                        const endOfYear = new Date(year, 11, 31, 23, 59, 59);
                        const keyword = fest.name.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
                        const alreadyPosted = await MarketingContent.exists({
                            $or: [
                                { type: 'ct-festival', createdAt: { $gte: startOfYear, $lte: endOfYear }, title: { $regex: new RegExp(keyword, 'i') } },
                                { title: { $regex: new RegExp(keyword, 'i') }, createdAt: { $gte: startOfYear, $lte: endOfYear } }
                            ]
                        });

                        if (alreadyPosted) {
                            console.log(`[AutonomousMarketingOS] Festival "${fest.name}" already posted for year ${year}. Enforcing once-per-year idempotency.`);
                            return { 
                                isFestival: false, 
                                alreadyPosted: true, 
                                name: fest.name, 
                                reason: `Festival post already published for ${fest.name} in ${year}` 
                            };
                        }
                    } catch (dbErr) {
                        console.warn('[AutonomousMarketingOS] Error checking festival deduplication:', dbErr.message);
                    }
                }

                return {
                    isFestival: true,
                    name: fest.name,
                    customTitleHi: fest.customTitleHi,
                    customTitleEn: fest.customTitleEn,
                    greeting: fest.greeting,
                    subtext: fest.subtext,
                    hashtags: `#${fest.name.replace(/[^a-zA-Z0-9]/g, '')} #BharatProperties #Kurukshetra #FestiveSeason #RealEstateHaryana`
                };
            }
        }
        return { isFestival: false };
    }

    /**
     * Get Curated Educational Content Topic (Pillar 2: ct-edu)
     */
    getEducationalTopic() {
        const topics = [
            {
                title: 'RERA Verification Guide: 5 Steps to Verify Before Buying Property in Haryana',
                hook: 'Property lene se pehle RERA Haryana par verify karna kyun zaroori hai?',
                summary: 'Haryana RERA registration check karne ka tarika aur fake commitments se bachne ke legal rules.',
                points: [
                    'HRERA Portal par Project Registration Number verify karein.',
                    'Promoter ka Escrow Account check karein jisme 70% funds deposit hone mandatory hain.',
                    'Sanctioned Building Plan aur possession date check karein.',
                    'Kavach: Bharat Properties par sabhi projects 100% HRERA verified hote hain.'
                ],
                hashtags: '#HRERA #RERAHaryana #LegalProperty #BharatProperties #KurukshetraRealEstate'
            },
            {
                title: 'Registry & Stamp Duty Calculation 2026 in Haryana',
                hook: 'Registry karwate waqt kitna Stamp Duty aur Collector Rate lagta hai?',
                summary: 'Circle Rate vs Market Rate aur Haryana me registry fees ka complete breakdown.',
                points: [
                    'Male buyers ke liye Stamp Duty: 7% (Rural: 5%).',
                    'Female buyers ke liye 2% concession: Only 5% Stamp Duty.',
                    'Collector Rate se kam registry par Penalty lagti hai.',
                    'Bharat Properties legal team aapko transparent registry guidance provide karti hai.'
                ],
                hashtags: '#StampDutyHaryana #RegistryChecklist #PropertyLaw #BharatProperties'
            },
            {
                title: 'Plot Area Conversion Guide: Marla, Kanal, Square Yard (Gaj) Made Simple',
                hook: '1 Kanal ya 1 Marla mein kitne Gaj hote hain? Aaiye samjhein simple formula!',
                summary: 'North India land measurement units ka simplified calculation guide.',
                points: [
                    '1 Marla = 9 Sarsahi = 25.29 Gaj (Approx 225-272 sq.ft depend karta hai standard par).',
                    '1 Kanal = 20 Marla = Approx 500-544 Gaj.',
                    '1 Killa / Acre = 8 Kanal = 4840 Square Yards.',
                    'Hum har property ki exact physical fita-measurement deliver karte hain.'
                ],
                hashtags: '#LandMeasurement #MarlaKanal #Gaj #HaryanaPlots #BharatProperties'
            },
            {
                title: 'Mutation (Intkal) Checklist: Registry ke baad ye step bhoolna mat!',
                hook: 'Sirf Registry se kaam nahi chalta! Intkal (Mutation) kyun compulsory hai?',
                summary: 'Sub-Registrar office se registry lene ke baad Revenue records me naam chadhane ka process.',
                points: [
                    'Registry se ownership transfer hoti hai, par revenue record me Patwari ka Intkal darz hona zaroori hai.',
                    'Jamabandi / Fard me apna naam verify karein.',
                    'Bank loans aur future sale ke liye clear Intkal compulsory hota hai.',
                    'Bharat Properties ensures end-to-end registry + mutation assistance.'
                ],
                hashtags: '#Intkal #Jamabandi #RevenueRecord #LandRegistry #BharatProperties'
            }
        ];
        const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % topics.length;
        return topics[dayIndex];
    }

    /**
     * Get Curated Trust & Social Proof Topic (Pillar 3: ct-trust)
     */
    getTrustTopic() {
        const trustStories = [
            {
                title: '15+ Years of Trust & Transparency in Kurukshetra',
                hook: '500+ pariwaron ka bharosa — Bharat Properties!',
                body: '15+ saal se Kurukshetra aur surrounding regions me 100% verified registry, zero dispute, aur clear title guarantees ke saath property services deliver kar rahe hain. Har plot aur flat ka physical demarcation aur legal due diligence hamara gold standard hai.',
                badge: '15+ Years Industry Leadership · 100% Verified Records',
                hashtags: '#BharatProperties #TrustInRealEstate #15YearsOfExcellence #VerifiedTitles #Kurukshetra'
            },
            {
                title: 'Zero Brokerage Dispute Guarantee',
                hook: 'Direct Deal, Clean Paperwork, Zero Hidden Charges.',
                body: 'Bharat Properties par hamara ek hi rule hai — complete transparency. Buyer aur Seller ke beech direct meeting, authorized legal documentation, aur bank loan assistance. Aapki hard-earned money ka har rupiya safe hai.',
                badge: '100% Clear Title Assurance',
                hashtags: '#DirectDeals #TransparentProperty #KurukshetraProperties #RealEstateTrust'
            },
            {
                title: 'From Site Visit to Registry: 360° Hassle-Free Support',
                hook: 'Ghar dekhne se lekar chabi haath mein aane tak, hum aapke saath hain.',
                body: 'Property selection, circle rate verification, bank loan sanction, registry deed drafting, aur mutation — Bharat Properties dedicated team har step par aapki help karti hai.',
                badge: 'End-to-End Client Assistance',
                hashtags: '#HassleFreeRealEstate #CustomerFirst #BharatPropertiesTeam'
            }
        ];
        const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % trustStories.length;
        return trustStories[dayIndex];
    }

    /**
     * Get Autopilot Configuration
     */
    async getAutopilotConfig() {
        const setting = await SystemSetting.findOne({ key: 'marketing_autopilot_config' }).lean();
        const def = {
            enabled: true,
            dailyFrequency: 2, // 1 or 2 posts per day
            channels: ['facebook', 'instagram', 'youtube', 'google_business'],
            morningTime: '10:00',
            eveningTime: '18:00',
            preferredTone: 'urgent',
            lastRunAt: null,
            lastRunStatus: 'idle',
            totalCyclesRun: 0
        };
        return setting?.value ? { ...def, ...setting.value } : def;
    }

    /**
     * Save Autopilot Configuration
     */
    async saveAutopilotConfig(config) {
        const current = await this.getAutopilotConfig();
        const updated = { ...current, ...config };
        await SystemSetting.findOneAndUpdate(
            { key: 'marketing_autopilot_config' },
            { $set: { value: updated, active: true, category: 'marketing' } },
            { upsert: true }
        );
        return { success: true, config: updated };
    }

    /**
     * 3-Way Canonical Join: Deal -> Inventory -> Project & Lookups Resolution
     * Hydrates deal with physical specifications:
     * - sizeLabel (e.g. "14 Marla (435.34 Sq Yd)")
     * - facing (e.g. "North-East", "Park Facing")
     * - roadWidth (e.g. "12 Mtr (40 Feet) Wide")
     * - dimensions (e.g. "28 ft x 13 ft")
     * - builtupSummary (e.g. "Ground Floor")
     * - reraNumber (e.g. "HRERA-PKL-KKR-123-2024")
     * - verified projectName & location
     */
    async hydrateDealWithInventoryAndProject(deal) {
        if (!deal) return null;
        const hydrated = { ...deal };

        try {
            let inventory = deal.inventory || null;
            if (!inventory && deal.inventoryId) {
                const Inventory = mongoose.model('Inventory');
                inventory = await Inventory.findById(deal.inventoryId).lean();
            }

            let project = deal.project || null;
            if (!project && (deal.projectId || inventory?.projectId)) {
                const Project = mongoose.model('Project');
                project = await Project.findById(deal.projectId || inventory?.projectId).lean();
            }

            // Resolve Lookups if inventory has ObjectIds
            if (inventory) {
                const lookupIds = [
                    inventory.facing,
                    inventory.roadWidth,
                    inventory.sizeLabel,
                    inventory.orientation,
                    inventory.unitType,
                    inventory.location,
                    deal.location
                ].filter(id => id && mongoose.Types.ObjectId.isValid(String(id)));

                let lookupMap = new Map();
                if (lookupIds.length > 0) {
                    try {
                        const Lookup = mongoose.model('Lookup');
                        const lookups = await Lookup.find({ _id: { $in: lookupIds } }).lean();
                        lookupMap = new Map(lookups.map(l => {
                            const val = l.lookup_value || l.name || l.code || l.value || '';
                            const full = l.parent_lookup_value ? `${val}, ${l.parent_lookup_value}` : val;
                            return [String(l._id), full || val];
                        }));
                    } catch (lErr) {
                        console.warn('[MarketingService] Failed to query lookups:', lErr.message);
                    }
                }

                const cleanLookup = (val) => {
                    if (!val) return '';
                    const str = String(val).trim();
                    if (lookupMap.has(str)) return lookupMap.get(str);
                    if (/^[0-9a-fA-F]{24}$/.test(str)) return ''; // Do not leak raw ObjectIds
                    return str;
                };

                hydrated.facing = cleanLookup(inventory.facing) || hydrated.facing;
                hydrated.roadWidth = cleanLookup(inventory.roadWidth) || hydrated.roadWidth;
                hydrated.sizeLabel = cleanLookup(inventory.sizeLabel) || hydrated.sizeLabel;
                hydrated.orientation = cleanLookup(inventory.orientation) || hydrated.orientation;
                hydrated.unitType = cleanLookup(inventory.unitType) || hydrated.unitType;

                if (deal.location && lookupMap.has(String(deal.location))) {
                    hydrated.location = lookupMap.get(String(deal.location));
                } else if (inventory.location && lookupMap.has(String(inventory.location))) {
                    hydrated.location = lookupMap.get(String(inventory.location));
                }

                if (inventory.unitNumber && !hydrated.unitNo) {
                    hydrated.unitNo = inventory.unitNumber;
                }
                if (inventory.block && !hydrated.block) {
                    hydrated.block = inventory.block;
                }

                if (inventory.dimensions && inventory.dimensions.length && inventory.dimensions.width) {
                    hydrated.dimensions = `${inventory.dimensions.length} x ${inventory.dimensions.width} ${inventory.dimensions.unit || 'ft'}`;
                }

                if (inventory.builtup) {
                    const floors = [];
                    if (inventory.builtup.groundFloor) floors.push('Ground Floor');
                    if (inventory.builtup.firstFloor) floors.push('1st Floor');
                    if (inventory.builtup.secondFloor) floors.push('2nd Floor');
                    if (inventory.builtup.basement) floors.push('Basement');
                    hydrated.builtupSummary = floors.join(', ') || 'Ready Construction';
                }
            }

            if (project) {
                if (project.name && (!hydrated.projectName || typeof hydrated.projectName === 'object')) {
                    hydrated.projectName = project.name;
                }
                if (project.reraNumber || project.registrationNumber) {
                    hydrated.reraNumber = project.reraNumber || project.registrationNumber;
                }
                if (project.location && (!hydrated.location || /^[0-9a-fA-F]{24}$/.test(String(hydrated.location)))) {
                    hydrated.location = project.location;
                }
            }
        } catch (hErr) {
            console.warn('[MarketingService] Error hydrating deal:', hErr.message);
        }

        return hydrated;
    }

    /**
     * Calculate Intelligent Platform-Specific Scheduling Delay
     * Different platforms have different prime audience engagement windows:
     * - LinkedIn: 09:00 AM IST (Corporate / B2B morning brief)
     * - Google Business: 10:30 AM IST (Local commercial search hours)
     * - Facebook: 14:30 PM (2:30 PM) IST (Community / afternoon leisure browsing)
     * - YouTube Shorts: 18:00 PM (6:00 PM) IST (Evening video peak)
     * - Instagram: 20:00 PM (8:00 PM) IST (Prime evening / night scrolling peak)
     * 
     * @param {string} platform - 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'google_business'
     * @param {Object} config - Autopilot config
     * @param {boolean} forceImmediate - If true, returns 0 ms
     * @returns {number} Delay in milliseconds
     */
    calculatePlatformDelay(platform, config = {}, forceImmediate = false) {
        if (forceImmediate) return 0;

        const platformPeakHours = {
            linkedin: { hour: 9, minute: 0 },
            google_business: { hour: 10, minute: 30 },
            facebook: { hour: 14, minute: 30 },
            youtube: { hour: 18, minute: 0 },
            instagram: { hour: 20, minute: 0 }
        };

        const targetSlot = platformPeakHours[platform.toLowerCase()] || { hour: 10, minute: 0 };
        const now = new Date();
        const targetDate = new Date(now);

        targetDate.setHours(targetSlot.hour, targetSlot.minute, 0, 0);

        // If target peak slot has already passed today, schedule for tomorrow
        if (targetDate.getTime() <= now.getTime()) {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        return Math.max(0, targetDate.getTime() - now.getTime());
    }

    /**
     * Generate Brands.live-Caliber Multi-Channel & Multi-Language Captions
     * Formats copy specifically for Facebook, Instagram, LinkedIn, YouTube & Google Business Profile
     */
    generateBrandsLiveCaptions(pillar, payload = {}) {
        const {
            deal = {},
            displayUnit = 'Prime Property',
            projName = 'Kurukshetra Prime',
            loc = 'Kurukshetra, Haryana',
            sizeStr = 'Prime Area',
            priceStr = 'Best Offer',
            facing = '',
            roadWidth = '',
            dimensions = '',
            builtupSummary = '',
            reraText = '',
            festival = {},
            edu = {},
            trust = {},
            regionalPhone = '+91 94160-35570',
            secondaryPhone = '+91 99913-33570',
            whatsappUrl = 'https://wa.me/919416035570',
            officeAddress = '#166, Sector 3, Huda Market, Kurukshetra, Haryana',
            website = 'www.bharatproperties.co'
        } = payload;

        const captions = {};

        if (pillar === 'ct-project') {
            const specLines = [
                loc ? `📍 लोकेशन (Location): ${projName}, ${loc}` : null,
                sizeStr ? `📏 साइज (Plot / Area): ${sizeStr}` : null,
                facing ? `🧭 फेसिंग (Facing): ${facing}` : null,
                roadWidth ? `🛣️ रोड चौड़ाई (Road Access): ${roadWidth}` : null,
                dimensions ? `📐 डायमेंशन (Dimensions): ${dimensions}` : null,
                builtupSummary ? `🏗️ स्ट्रक्चर (Structure): ${builtupSummary}` : null,
                priceStr ? `💰 एक्सपेक्टेड प्राइस (Price): ${priceStr}` : null
            ].filter(Boolean).join('\n');

            // 1. Facebook: High-trust, bilingual community format
            captions.facebook = `🔥 PRIME PROPERTY SPOTLIGHT | ${displayUnit.toUpperCase()} AT ${projName.toUpperCase()}\n\nक्या आप कुरुक्षेत्र के सबसे तेजी से विकसित होते प्राइम सेक्टर में 100% सुरक्षित और कानूनी रूप से सत्यापित प्लॉट या प्रॉपर्टी की तलाश में हैं?\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📌 PROPERTY SPECIFICATIONS:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n${specLines}${reraText}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🛡️ BHARAT PROPERTIES 5-POINT ASSURANCE:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ 100% क्लियर रजिस्ट्री एवं इंतकाल (Tehsil Record Verified)\n✅ हुडा (HUDA) एवं टीसीपी (TCP) अप्रूव्ड मास्टर प्लान\n✅ सीधे असली मालिक से आमने-सामने बातचीत (No Middlemen, Transparent Deals)\n✅ प्रमुख राष्ट्रीयकृत बैंकों से तुरंत होम लोन सुविधा (SBI / HDFC / PNB)\n✅ जीरो देनदारी प्रमाण पत्र (No Dues Certificate Guarantee)\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📞 आज ही अपनी साइट विजिट और टोकन मीटिंग बुक करें:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📲 WhatsApp: ${whatsappUrl}\n📞 हेल्पलाइन: ${regionalPhone} | ${secondaryPhone}\n📍 ऑफिस: ${officeAddress}\n🌐 ऑफिशियल पोर्टल: ${website}\n\n#BharatProperties #KurukshetraRealEstate #HudaPlots #Sector3Kurukshetra #PropertyInKurukshetra #HaryanaProperty #PlotForSale #DreamHome #SurajKeshwar`;

            // 2. Instagram: High visual energy, bulleted, comment-driven CTA
            captions.instagram = `⚡ EXCLUSIVE LISTING ALERT in ${loc}! 🏡✨\n\n${displayUnit} at ${projName} is available for immediate site inspection & direct registration!\n\n━━━━━━━━━━━━━━━━━━━━━\n✦ PROPERTY SNAPSHOT ✦\n━━━━━━━━━━━━━━━━━━━━━\n📍 Location: ${projName}, ${loc}\n📏 Area: ${sizeStr}\n${facing ? '🧭 Facing: ' + facing + '\n' : ''}${roadWidth ? '🛣️ Road: ' + roadWidth + '\n' : ''}💰 Investment: ${priceStr}${reraText}\n\n✦ WHY THIS PROPERTY? ✦\n✓ 100% Clear Registry & Tehsil Vetted\n✓ HUDA / TCP Approved Planning\n✓ Direct Meeting with Registered Owner\n✓ Easy Bank Loan Sanction (SBI/HDFC)\n\n━━━━━━━━━━━━━━━━━━━━━\n💬 WANT COMPLETE DETAILS & LOCATION PIN?\n━━━━━━━━━━━━━━━━━━━━━\n👉 Comment "VISIT" below or DM us!\n📲 WhatsApp: ${regionalPhone}\n📞 Call: ${regionalPhone} | ${secondaryPhone}\n🌐 ${website}\n📍 ${officeAddress}\n\n#KurukshetraRealEstate #HudaPlots #Sector3Kurukshetra #PropertyInKurukshetra #PlotForSale #DreamHomeKurukshetra #HaryanaProperty #RealEstateIndia #SurajKeshwar #BharatProperties #InvestInKurukshetra`;

            // 3. LinkedIn: Corporate / HNW investor advisory brief
            captions.linkedin = `🏛️ STRATEGIC REAL ESTATE ACQUISITION | ${displayUnit.toUpperCase()} AT ${projName.toUpperCase()}, ${loc.toUpperCase()}\n\nBharat Properties presents an institutional-grade land acquisition opportunity within Kurukshetra's high-demand urban expansion corridor.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nASSET PARAMETERS & LEGAL HIGHLIGHTS:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Asset Classification: ${displayUnit}\n• Micro-Location: ${projName}, ${loc} (NH-44 & Transit Corridor Connectivity)\n• Plot Dimensions: ${sizeStr}${dimensions ? ` (${dimensions})` : ''}\n• Frontage & Access: ${roadWidth || '12-18 Meter Municipal Road'}${facing ? ` | ${facing} Facing` : ''}\n• Capital Value: ${priceStr}${reraText}\n• Conveyancing Status: 30-Year Revenue Chain, Jamabandi & Mutation Verified\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nINVESTOR DUE DILIGENCE:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n1. Complete zoning compliance under Haryana Town & Country Planning (TCP).\n2. Unencumbered title with Municipal Corporation No Dues Certificate (NDC).\n3. Direct owner mandate ensuring zero intermediary markups and full transactional transparency.\n\nFor private inspections, confidential dossier review, or portfolio consultation:\n📞 Senior Mandate Desk: ${regionalPhone} | ${secondaryPhone}\n📲 Direct WhatsApp: ${whatsappUrl}\n📍 Corporate Office: ${officeAddress}\n🌐 Portal: ${website}\n\n#RealEstateInvestment #KurukshetraRealEstate #CommercialRealEstate #AssetManagement #HaryanaProperty #WealthCreation #BharatProperties #ClearTitleLand`;

            // 4. YouTube Shorts: Fast-hook video description with click-to-WhatsApp link
            captions.youtube = `Shorts: Prime ${sizeStr} ${displayUnit} in ${projName}, ${loc}! 🛣️ ${roadWidth || 'Wide Avenue'} • 🧭 ${facing || 'Prime Facing'} • 💰 ${priceStr}. 100% Clear Title, Direct Registry & Instant Bank Loan. 📞 Call: ${regionalPhone} | 📲 WhatsApp: ${whatsappUrl} | 🌐 ${website}`;

            // 5. Google Business Profile: Hyper-local SEO keywords + direct call CTA
            captions.google_business = `Fresh Real Estate Listing: ${displayUnit} available at ${projName}, ${loc}. Specifications: ${sizeStr}, ${roadWidth || 'Wide'} road, ${facing || 'Prime'} facing. Price: ${priceStr}. 100% clear title with Tehsil record verification and Municipal NDC. Visit Bharat Properties at ${officeAddress} (Open Daily 9:00 AM - 8:00 PM) or call ${regionalPhone} today!`;

        } else if (pillar === 'ct-festival') {
            const festName = festival.name || 'Festive Celebration';
            const festGreeting = festival.greeting || 'Warm Festive Greetings & Best Wishes!';

            captions.facebook = `✨ ${festGreeting}\n\nभारत प्रॉपर्टीज परिवार की ओर से आप सभी को ${festName} की हार्दिक एवं आत्मीय शुभकामनाएं! 🪔\n\nयह पावन पर्व आपके और आपके परिवार के जीवन में सुख, शांति, उत्तम स्वास्थ्य एवं अटूट समृद्धि लेकर आए। इस शुभ अवसर पर अपने सपनों के घर और सुरक्षित भविष्य की शुरुआत करें।\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🤝 भारत प्रॉपर्टीज — 30 वर्षों का अटूट विश्वास\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ 100% सत्यापित रजिस्ट्री एवं निष्पक्ष परामर्श\n✅ हुडा एवं टीसीपी अप्रूव्ड प्लॉट्स व विला\n✅ कुरुक्षेत्र की सबसे भरोसेमंद रियल एस्टेट कंसल्टेंसी\n\nसस्नेह,\nसूरज केशवर एवं समस्त भारत प्रॉपर्टीज टीम\n📞 संपर्क: ${regionalPhone} | ${secondaryPhone}\n📲 WhatsApp: ${whatsappUrl}\n📍 ऑफिस: ${officeAddress}\n🌐 ${website}\n\n${festival.hashtags || '#BharatProperties #Kurukshetra #FestiveSeason #RealEstateHaryana'}`;

            captions.instagram = `✨ Warm greetings on ${festName} from Bharat Properties! 🪔✨\n\nMay this auspicious occasion bring boundless happiness, health, and new beginnings in your dream home!\n\n30+ Years of Verified Trust in Kurukshetra Real Estate 🏛️\n📞 Helplines: ${regionalPhone} | ${secondaryPhone}\n📲 WhatsApp: ${whatsappUrl}\n📍 ${officeAddress}\n🌐 ${website}\n\n${festival.hashtags || '#BharatProperties #Kurukshetra #FestiveSeason #RealEstateHaryana #SurajKeshwar'}`;

            captions.linkedin = `✨ ${festGreeting} from Bharat Properties!\n\nWishing all our valued clients, investors, community leaders, and partners peace, prosperity, and continuous growth on the auspicious occasion of ${festName}.\n\nWith over 30 years of ethical conveyancing and land development advisory in Haryana, we remain committed to securing your family's future with transparent, legally undisputed real estate assets.\n\nWarm regards,\nSuraj Keshwar & The Bharat Properties Leadership Team\n📞 ${regionalPhone} | ${secondaryPhone}\n📍 ${officeAddress}\n🌐 ${website}\n\n${festival.hashtags || '#BharatProperties #Kurukshetra #CorporateAdvisory #RealEstateHaryana'}`;

            captions.youtube = `${festName} Greetings from Bharat Properties Kurukshetra! Wishing everyone peace, prosperity, and joyous beginnings in their dream home. Call ${regionalPhone}.`;

            captions.google_business = `${festGreeting} Warm greetings on ${festName} from Bharat Properties Kurukshetra. Visit our office at ${officeAddress} or call ${regionalPhone} for prime property inquiries.`;

        } else if (pillar === 'ct-edu') {
            const eduTitle = edu.title || 'Legal Property Verification Checklist';
            const eduHook = edu.hook || 'Haryana mein property lene se pehle yeh 3 baatein zaroor check karein!';
            const eduSummary = edu.summary || 'Jamabandi, TCP zoning, aur No Dues Certificate ka complete legal breakdown.';
            const pointsList = (edu.points || [
                'तहसील पोर्टल पर जमाबंदी और इंतकाल (Mutation) का मिलान करें।',
                'टीसीपी (TCP) और हुडा मास्टर प्लान 2031 के तहत अप्रूव्ड लेआउट चेक करें।',
                'नगर निगम / परिषद से नो ड्यूज सर्टिफिकेट (NDC) प्राप्त करें।'
            ]).map((p, i) => `STEP ${i + 1}: ${p}`).join('\n');

            captions.facebook = `📚 REAL ESTATE KNOWLEDGE SERIES | ${eduTitle.toUpperCase()}\n\n${eduHook}\n\n${eduSummary}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📌 CRITICAL VERIFICATION CHECKLIST:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n${pointsList}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🛡️ BHARAT PROPERTIES BUYER ADVISORY DESK:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nप्रॉपर्टी खरीदने से पहले कानूनी जांच में कोई लापरवाही न बरतें। भारत प्रॉपर्टीज की अनुभवी लीगल टीम आपको 100% निष्पक्ष और पारदर्शी परामर्श उपलब्ध कराती है।\n\n📞 निःशुल्क कानूनी मार्गदर्शन के लिए संपर्क करें:\n📲 WhatsApp: ${whatsappUrl}\n📞 हेल्पलाइन: ${regionalPhone} | ${secondaryPhone}\n📍 ऑफिस: ${officeAddress}\n🌐 पोर्टल: ${website}\n\n${edu.hashtags || '#RealEstateAdvisory #LegalProperty #KurukshetraRealEstate #BharatProperties'}`;

            captions.instagram = `💡 ${eduHook} 📜\n\nHere are 3 non-negotiable legal checks before buying any plot in Haryana:\n\n${pointsList}\n\n📌 Save this post for your next site visit!\nNeed transparent advice? Call ${regionalPhone} or WhatsApp ${whatsappUrl}\n🌐 ${website} | 📍 ${officeAddress}\n\n${edu.hashtags || '#RealEstateTips #LegalChecklist #HaryanaProperty #BharatProperties #Kurukshetra'}`;

            captions.linkedin = `📚 REAL ESTATE DUE DILIGENCE ADVISORY | ${eduTitle.toUpperCase()}\n\n${eduSummary}\n\nEssential Conveyancing Protocol for Investors & Buyers in Haryana:\n${pointsList}\n\nBharat Properties provides comprehensive title verification, circle rate analysis, and encumbrance validation across all Kurukshetra sectors.\n\nInquiries:\n📞 Legal Advisory Desk: ${regionalPhone} | ${secondaryPhone}\n📍 ${officeAddress}\n🌐 ${website}\n\n${edu.hashtags || '#RealEstateDueDiligence #Conveyancing #HaryanaRealEstate #AssetProtection #BharatProperties'}`;

            captions.youtube = `Shorts: ${eduHook} Top legal verification checks before buying land in Haryana! Call ${regionalPhone} for advice. 🌐 ${website}`;

            captions.google_business = `Real Estate Advisory: ${eduTitle}. Ensure 100% clear titles and circle rate compliance before purchasing land in Kurukshetra. Call ${regionalPhone} or visit Bharat Properties office.`;

        } else if (pillar === 'ct-trust') {
            const trustTitle = trust.title || '30+ Years of Verified Integrity & Secrecy';
            const trustHook = trust.hook || 'Why Hundreds of Elite Kurukshetra Families Trust Bharat Properties';
            const trustBody = trust.body || 'Since 1996, Bharat Properties has stood as Kurukshetra\'s benchmark for transparent land deals, direct owner negotiations, and ironclad financial secrecy.';
            const trustBadge = trust.badge || '100% Direct Owner Meetings • Zero Hidden Charges • Clear Title Guarantee';

            captions.facebook = `🏛️ THE BHARAT PROPERTIES STANDARD | ${trustTitle.toUpperCase()}\n\n${trustHook}\n\n${trustBody}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n⭐ OUR 3 PILLARS OF EXCELLENCE:\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🤝 100% DIRECT OWNER MEETINGS: कोई बिचौलिया नहीं, सीधे असली मालिक से आमने-सामने बातचीत।\n📜 30-YEAR TITLE VETTING: हर प्रॉपर्टी की तहसील रिकॉर्ड, जमाबंदी और टीसीपी अप्रूवल की गहन जांच।\n🛡️ STRICT CONFIDENTIALITY: आपकी व्यक्तिगत जानकारी और वित्तीय गोपनीयता की पूर्ण सुरक्षा।\n\n🛡️ ${trustBadge}\n\nअपने परिवार के सुरक्षित भविष्य के लिए कुरुक्षेत्र के सबसे प्रतिष्ठित रियल एस्टेट कंसल्टेंट्स से जुड़ें।\n📞 हेल्पलाइन: ${regionalPhone} | ${secondaryPhone}\n📲 WhatsApp: ${whatsappUrl}\n📍 ऑफिस: ${officeAddress}\n🌐 विजिट करें: ${website}\n\n${trust.hashtags || '#BharatProperties #30YearsOfTrust #KurukshetraRealEstate #SurajKeshwar'}`;

            captions.instagram = `⭐ ${trustHook} 🏛️\n\n${trustBody}\n\n🛡️ ${trustBadge}\n\nExperience stress-free, 100% verified property transactions in Kurukshetra with 30+ years of local market leadership!\n\n📞 Call: ${regionalPhone} | ${secondaryPhone}\n📲 WhatsApp: ${whatsappUrl}\n🌐 ${website}\n📍 ${officeAddress}\n\n${trust.hashtags || '#BharatProperties #Kurukshetra #TrustInRealEstate #HudaPlots #SurajKeshwar'}`;

            captions.linkedin = `🏛️ INSTITUTIONAL INTEGRITY & ASSET GOVERNANCE | ${trustTitle.toUpperCase()}\n\n${trustBody}\n\nCore Governance Tenets:\n• Direct Mandate Representation: Eliminating speculative intermediary inflation.\n• Exhaustive Conveyancing: Multi-decade revenue chain and mutation authentication.\n• Fiduciary Discretion: High-net-worth portfolio confidentiality.\n\nConnect with our senior advisory team:\n📞 ${regionalPhone} | ${secondaryPhone}\n📍 ${officeAddress}\n🌐 ${website}\n\n${trust.hashtags || '#CorporateGovernance #AssetAdvisory #RealEstateHaryana #BharatProperties'}`;

            captions.youtube = `Shorts: Why Kurukshetra trusts Bharat Properties for verified real estate mandates! 30+ years of integrity. Call ${regionalPhone} or visit ${website}.`;

            captions.google_business = `${trustTitle}: ${trustBody} Contact Bharat Properties at ${officeAddress} or call ${regionalPhone} today.`;
        }

        return captions;
    }

    /**
     * Autonomous Marketing Cycle Dispatcher
     * Executes 1 cycle of content creation across Pillars (Deals, Edu, Trust, Festival),
     * generates AI visual render, and enqueues to BullMQ marketingQueue.
     * 
     * @param {Object} options - { force, pillar, dealId, dryRun }
     */
    async runAutonomousMarketingCycle(options = {}) {
        console.log('[AutonomousMarketingOS] ▶ Starting Autonomous Marketing Cycle...', options);
        const config = await this.getAutopilotConfig();

        if (!config.enabled && !options.force) {
            console.log('[AutonomousMarketingOS] Autopilot is paused in settings. Skipping cycle.');
            return { success: false, reason: 'Autopilot is paused. Toggle ON in Marketing OS.' };
        }

        // 1. Anti-Spam Frequency Capping: Max 2 posts per day
        const todayStr = new Date().toISOString().split('T')[0];
        const todayPostsCount = await MarketingContent.countDocuments({
            date: todayStr,
            metadata: { $exists: true }
        });

        if (todayPostsCount >= (config.dailyFrequency || 2) && !options.force) {
            console.log(`[AutonomousMarketingOS] Frequency cap reached for today (${todayPostsCount} posts). Skipping.`);
            return {
                success: true,
                skipped: true,
                reason: `Frequency cap satisfied (${todayPostsCount}/${config.dailyFrequency} posts scheduled for today)`
            };
        }

        // 2. Select Content Pillar
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 4 = Thu
        let pillar = options.pillar || (options.dealId ? 'ct-project' : null);

        const festival = await this.detectUpcomingFestival(now);
        if (!pillar) {
            if (festival.isFestival) {
                pillar = 'ct-festival';
            } else if (dayOfWeek === 4) { // Thursday = Educational
                pillar = 'ct-edu';
            } else if (dayOfWeek === 3 || dayOfWeek === 0) { // Wed / Sun = Trust & Social Proof
                pillar = 'ct-trust';
            } else {
                pillar = 'ct-project';
            }
        }

        console.log(`[AutonomousMarketingOS] Selected Content Pillar: ${pillar.toUpperCase()} (Day of week: ${dayOfWeek})`);

        let chosenDeal = null;
        let postTitle = '';
        let channelCaptions = {};
        let visualAsset = null;
        let displayUnit = 'Prime Property';
        let loc = 'Kurukshetra, Haryana';
        const isManual = Boolean(options.manualTrigger || options.force || options.forceImmediate);
        const allowRevealUnitNo = isManual && Boolean(options.showUnitNumber === true);
        const regionalPhone = '+91 94160-35570';
        const secondaryPhone = '+91 99913-33570';
        const whatsappUrl = 'https://wa.me/919416035570';
        const officeAddress = '#166, Sector 3, Huda Market, Kurukshetra, Haryana';
        const website = 'www.bharatproperties.co';

        // 3. Pillar-Specific Content Generation
        if (pillar === 'ct-project') {
            // Anti-cannibalization: Find deals posted in the last 14 days
            const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            const recentPostings = await MarketingContent.find({
                dealId: { $ne: null },
                createdAt: { $gte: fourteenDaysAgo }
            }).distinct('dealId');

            // Find top qualified deal that hasn't been posted recently
            let query = {
                _id: { $nin: recentPostings },
                stage: { $in: ['Open', 'Qualified', 'Ready to Market'] }
            };

            let candidates = await Deal.find(query).sort({ score: -1, price: -1, createdAt: -1 }).limit(10).lean();
            if (!candidates || candidates.length === 0) {
                // Fallback: Pick deals that were LEAST recently posted (oldest in MarketingContent), never repeating the same one immediately
                const oldestPostedDeals = await MarketingContent.find({
                    dealId: { $ne: null }
                }).sort({ createdAt: 1 }).limit(10).distinct('dealId');

                candidates = await Deal.find({
                    _id: { $in: oldestPostedDeals },
                    stage: { $in: ['Open', 'Qualified', 'Ready to Market'] }
                }).limit(5).lean();

                if (!candidates || candidates.length === 0) {
                    candidates = await Deal.find({ stage: { $in: ['Open', 'Qualified', 'Ready to Market'] } }).sort({ updatedAt: 1 }).limit(5).lean();
                }
            }

            if (options.dealId) {
                chosenDeal = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(options.dealId, 'deal', { isSystem: true });
                if (!chosenDeal) {
                    return { success: false, reason: 'Specified deal not found or inaccessible under compliance rules' };
                }
            } else if (candidates && candidates.length > 0) {
                // 24-Hour Anti-Duplicate Guard: Check if candidate was posted within last 24 hours
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                let selectedCandidate = null;
                for (const cand of candidates) {
                    const postedToday = await MarketingContent.exists({
                        dealId: cand._id,
                        createdAt: { $gte: oneDayAgo }
                    });
                    if (!postedToday) {
                        selectedCandidate = cand;
                        break;
                    }
                }
                // If all candidates posted recently, select the one posted longest ago
                if (!selectedCandidate) {
                    selectedCandidate = candidates[candidates.length - 1];
                }
                chosenDeal = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(selectedCandidate._id, 'deal', { isSystem: true });
            }

            if (chosenDeal) {
                chosenDeal = await this.hydrateDealWithInventoryAndProject(chosenDeal);
            }

            if (!chosenDeal) {
                // If no active deals found in DB, do NOT synthesize fake factual claims; switch to educational advisory
                pillar = 'ct-edu';
                console.log('[AutonomousMarketingOS] No active authorized deals found in DB. Falling back to Educational pillar.');
                const edu = this.getEducationalTopic();
                postTitle = `Real Estate Advisory: ${edu.title}`;
                channelCaptions = this.generateBrandsLiveCaptions('ct-edu', {
                    edu,
                    regionalPhone,
                    secondaryPhone,
                    whatsappUrl,
                    officeAddress,
                    website
                });

                visualAsset = await this.generateVisualAsset({
                    type: 'image',
                    pillar: 'ct-edu',
                    edu
                });
            } else {
                const facts = marketingComplianceEnforcementService.extractAuthoritativeFacts(chosenDeal);

                if (allowRevealUnitNo && chosenDeal.unitNo) {
                    displayUnit = chosenDeal.unitNo;
                } else if (chosenDeal.sizeLabel) {
                    const cleanSize = String(chosenDeal.sizeLabel).replace(/\s*\([^)]*\)/g, '').trim();
                    displayUnit = `${cleanSize} Plot`;
                } else if (chosenDeal.propertyType || chosenDeal.unitType) {
                    displayUnit = `Prime ${chosenDeal.propertyType || chosenDeal.unitType}`;
                } else {
                    displayUnit = 'Prime Plot';
                }

                const projName = chosenDeal.projectName || 'Kurukshetra Prime';
                
                loc = 'Kurukshetra, Haryana';
                if (typeof chosenDeal.location === 'string' && chosenDeal.location.length < 80 && !chosenDeal.location.match(/^[0-9a-fA-F]{24}$/)) {
                    loc = chosenDeal.location;
                } else if (chosenDeal.city || chosenDeal.state) {
                    loc = [chosenDeal.city, chosenDeal.state].filter(Boolean).join(', ') || 'Kurukshetra, Haryana';
                }
                // Strictly scrub any GPS latitude/longitude coordinates (e.g. 29.9695, 76.8783)
                loc = loc.replace(/\b-?\d{1,3}\.\d{4,}\b/g, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim() || 'Kurukshetra, Haryana';

                let sizeStr = chosenDeal.sizeLabel || 'Prime Area';
                if (!chosenDeal.sizeLabel) {
                    if (typeof chosenDeal.size === 'number' || (typeof chosenDeal.size === 'string' && chosenDeal.size.trim())) {
                        sizeStr = `${chosenDeal.size} ${chosenDeal.sizeUnit || 'sq.yards'}`;
                    } else if (chosenDeal.size && typeof chosenDeal.size === 'object') {
                        sizeStr = `${chosenDeal.size.plot || chosenDeal.size.builtUp || 'Prime Area'} ${chosenDeal.sizeUnit || 'sq.yards'}`;
                    }
                }

                const priceStr = chosenDeal.price ? `₹${Number(chosenDeal.price).toLocaleString('en-IN')}` : 'Best Offer';
                postTitle = `Hot Property Spotlight: ${displayUnit} at ${projName}`;
                const reraText = chosenDeal.reraNumber ? `\n📋 RERA Registration: ${chosenDeal.reraNumber}` : '';

                // Generate Brands.live Caliber Multi-Channel Captions
                channelCaptions = this.generateBrandsLiveCaptions('ct-project', {
                    deal: chosenDeal,
                    displayUnit,
                    projName,
                    loc,
                    sizeStr,
                    priceStr,
                    facing: chosenDeal.facing,
                    roadWidth: chosenDeal.roadWidth,
                    dimensions: chosenDeal.dimensions,
                    builtupSummary: chosenDeal.builtupSummary,
                    reraText,
                    regionalPhone,
                    secondaryPhone,
                    whatsappUrl,
                    officeAddress,
                    website
                });

                // Generate photorealistic visual
                visualAsset = await this.generateVisualAsset({ 
                    deal: chosenDeal, 
                    type: 'image', 
                    pillar: 'ct-project', 
                    angle: 'drone', 
                    mood: 'golden_hour', 
                    format: 'post',
                    maskUnitNo: !allowRevealUnitNo
                });
            }
        } else if (pillar === 'ct-festival') {
            postTitle = `Festive Greetings: ${festival.name}`;
            channelCaptions = this.generateBrandsLiveCaptions('ct-festival', {
                festival,
                regionalPhone,
                secondaryPhone,
                whatsappUrl,
                officeAddress,
                website
            });

            // Generate branded festive flyer with official logo and auspicious greetings
            visualAsset = await this.generateVisualAsset({
                type: 'image',
                pillar: 'ct-festival',
                festival,
                festivalName: festival.name,
                greeting: festival.greeting,
                customTitleHi: festival.customTitleHi || `${festival.name} की हार्दिक शुभकामनाएं`,
                customTitleEn: festival.customTitleEn || `HAPPY ${festival.name.toUpperCase()}`,
                subtext: festival.subtext || 'May this festive season illuminate your life with joy, enduring wealth, and your dream home!'
            });

        } else if (pillar === 'ct-edu') {
            const edu = this.getEducationalTopic();
            postTitle = `Real Estate Advisory: ${edu.title}`;
            channelCaptions = this.generateBrandsLiveCaptions('ct-edu', {
                edu,
                regionalPhone,
                secondaryPhone,
                whatsappUrl,
                officeAddress,
                website
            });

            // Generate branded educational flyer
            visualAsset = await this.generateVisualAsset({
                type: 'image',
                pillar: 'ct-edu',
                edu
            });

        } else if (pillar === 'ct-trust') {
            const trust = this.getTrustTopic();
            postTitle = `Trust & Reputation: ${trust.title}`;
            channelCaptions = this.generateBrandsLiveCaptions('ct-trust', {
                trust,
                regionalPhone,
                secondaryPhone,
                whatsappUrl,
                officeAddress,
                website
            });

            // Generate branded trust & authority flyer
            visualAsset = await this.generateVisualAsset({
                type: 'image',
                pillar: 'ct-trust',
                trust
            });
        }

        // 3b. Enterprise Statutory Compliance Enforcement (Server-Side Security Boundary)
        if (options.customTitle || options.title) {
            postTitle = options.customTitle || options.title;
        }

        if (postTitle) {
            const { sanitizedText: sanitizedTitle } = marketingComplianceEnforcementService.enforceCompliance(
                postTitle,
                chosenDeal || null,
                'generic'
            );
            postTitle = sanitizedTitle;
        }

        for (const ch of Object.keys(channelCaptions)) {
            const rawCap = channelCaptions[ch];
            if (rawCap) {
                const { sanitizedText } = marketingComplianceEnforcementService.enforceCompliance(
                    rawCap,
                    chosenDeal || null,
                    ch
                );
                channelCaptions[ch] = sanitizedText;
            }
        }

        // 4. Determine Target Dispatch Slot (BullMQ Delay)
        // Morning Slot: 10:00 AM IST | Evening Slot: 06:00 PM (18:00) IST
        // Festival Mandate: Festival posts MUST dispatch in the morning (08:00 AM IST) on the festival day
        const targetDate = new Date();
        const currentHour = targetDate.getHours();
        let targetSlotTime = '10:00';
        
        if (pillar === 'ct-festival') {
            targetSlotTime = config.festivalMorningTime || '08:00';
        } else if (currentHour >= 12 && currentHour < 19) {
            targetSlotTime = config.eveningTime || '18:00';
        } else if (currentHour >= 19) {
            targetDate.setDate(targetDate.getDate() + 1);
            targetSlotTime = config.morningTime || '10:00';
        } else {
            targetSlotTime = config.morningTime || '10:00';
        }

        const [slotH, slotM] = targetSlotTime.split(':').map(Number);
        const scheduledDateTime = new Date(targetDate);
        scheduledDateTime.setHours(slotH, slotM, 0, 0);

        let delayMs = Math.max(0, scheduledDateTime.getTime() - Date.now());
        if (options.forceImmediate || options.dryRun) {
            delayMs = 0; // Immediate execution
        }

        const targetChannels = (config.channels && config.channels.length > 0)
            ? config.channels
            : ['facebook', 'instagram', 'linkedin', 'youtube', 'google_business'];
        const enqueuedJobs = [];

        // 4b. Strict Anti-Duplicate Protection: Avoid repeating identical content within same day
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const duplicateRecent = await MarketingContent.findOne({
            title: postTitle,
            createdAt: { $gte: startOfToday }
        });
        if (duplicateRecent && !options.forceImmediate && !options.force) {
            console.log(`[AutonomousMarketingOS] Duplicate post detected for today: "${postTitle}". Skipping to prevent duplicate publishing.`);
            return {
                success: true,
                skipped: true,
                reason: `Duplicate post already created today: "${postTitle}"`,
                contentId: duplicateRecent._id
            };
        }

        // 4c. Rapid Double-Click & Accidental Re-Dispatch Guard (5-minute window)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const rapidDuplicate = await MarketingContent.findOne({
            title: postTitle,
            createdAt: { $gte: fiveMinutesAgo }
        });
        if (rapidDuplicate && !options.allowRapidDuplicate) {
            console.log(`[AutonomousMarketingOS] Rapid duplicate detected within last 5 minutes: "${postTitle}". Returning existing broadcast record.`);
            return {
                success: true,
                skipped: true,
                reason: `Identical post was already broadcasted ${Math.round((Date.now() - rapidDuplicate.createdAt.getTime()) / 1000)}s ago: "${postTitle}"`,
                contentId: rapidDuplicate._id,
                visualUrl: rapidDuplicate.mediaUrls?.[0],
                pillar,
                postTitle
            };
        }

        // 5. Enqueue to BullMQ marketingQueue with Intelligent Platform-Specific Staggering
        if (!options.dryRun && marketingQueue) {
            for (const ch of targetChannels) {
                const captionText = channelCaptions[ch] || channelCaptions.facebook;
                const channelDelayMs = this.calculatePlatformDelay(ch, config, Boolean(options.forceImmediate || options.dryRun));
                try {
                    const job = await marketingQueue.add('scheduled-social-dispatch', {
                        platform: ch,
                        text: captionText,
                        imageUrl: visualAsset?.url || null,
                        videoPath: visualAsset?.assetType === 'video' ? visualAsset.url : null,
                        format: 'post',
                        entityType: 'deal',
                        entityId: chosenDeal?._id || null,
                        pillar
                    }, {
                        delay: channelDelayMs,
                        removeOnComplete: true,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 5000 }
                    });
                    enqueuedJobs.push({ platform: ch, jobId: job.id, delayMs: channelDelayMs });
                    console.log(`[AutonomousMarketingOS] Enqueued ${ch} dispatch job #${job.id} (delay: ${Math.round(channelDelayMs / 60000)} min)`);
                } catch (qErr) {
                    console.warn(`[AutonomousMarketingOS] Failed to enqueue job for channel ${ch}:`, qErr.message);
                }
            }
        }

        // 6. Persist to MarketingContent Calendar
        const scheduledDateStr = scheduledDateTime.toISOString().split('T')[0];
        const scheduledContentRecord = await MarketingContent.create({
            title: postTitle,
            content: channelCaptions.facebook || channelCaptions.instagram,
            platform: 'Both',
            type: pillar,
            date: scheduledDateStr,
            time: targetSlotTime,
            status: getQueuedContentStatus(enqueuedJobs),
            dealId: chosenDeal?._id || null,
            mediaUrls: visualAsset?.url ? [visualAsset.url] : [],
            metadata: {
                provider: 'google',
                model: 'gemini-2.5-flash',
                autonomous: true,
                pillar,
                enqueuedJobs
            }
        });

        // 7. Update Autopilot Config Metadata
        await SystemSetting.findOneAndUpdate(
            { key: 'marketing_autopilot_config' },
            { 
                $set: { 
                    'value.lastRunAt': new Date().toISOString(),
                    'value.lastRunStatus': 'success',
                    'value.lastPillar': pillar
                },
                $inc: { 'value.totalCyclesRun': 1 }
            }
        );

        console.log(`[AutonomousMarketingOS] ✅ Autonomous Cycle Complete! Pillar: ${pillar}, Record: ${scheduledContentRecord._id}`);

        const specsSummary = [
            chosenDeal?.facing ? `${chosenDeal.facing} Facing` : null,
            chosenDeal?.roadWidth ? `${chosenDeal.roadWidth} Road` : null,
            chosenDeal?.dimensions ? `Dim: ${chosenDeal.dimensions}` : null,
            chosenDeal?.builtupSummary ? `Built: ${chosenDeal.builtupSummary}` : null
        ].filter(Boolean).join(' • ');

        return {
            success: true,
            pillar,
            postTitle,
            scheduledFor: scheduledDateTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            scheduledDate: scheduledDateStr,
            scheduledTime: targetSlotTime,
            channels: targetChannels,
            enqueuedJobsCount: enqueuedJobs.length,
            visualUrl: visualAsset?.url,
            contentId: scheduledContentRecord._id,
            captions: channelCaptions,
            agentOutputs: {
                metrics: `📊 METRICS MANAGER (Google AI — Gemini 3.5 Flash)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Telemetry: Not independently fetched in this cycle; performance claims require verified metrics\n• Selected Pillar: ${pillar.toUpperCase()} (Cadence: 80% Deals / 10% Edu / 7% Trust / 3% Festival)\n• Audience Window: Configured platform delay rules applied; no learned peak-time claim\n• Location Priority: Based on the selected CRM record; no independent demand inference\n• Handoff: Transferred audience telemetry and demand mandate to Social Media Manager`,
                social: `📅 SOCIAL MEDIA MANAGER (ChatGPT — GPT-4o)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Privacy Shield: ${allowRevealUnitNo ? '⚠️ MANUAL OVERRIDE (Unit No Disclosed: ' + (chosenDeal?.unitNo || 'N/A') + ')' : '🛡️ ACTIVE (Unit No & GPS Coordinates Masked: Promoted as "' + displayUnit + '")'}\n• Strategic Decision: Evaluated active CRM inventory against 14-day anti-cannibalization rule\n• Canonical 3-Way Join Resolved (Deal ➔ Inventory ➔ Project):\n  - Public Headline: ${displayUnit} ${allowRevealUnitNo ? `[Unit ${chosenDeal?.unitNo || 'N/A'}]` : '[Unit Number Protected]'}\n  - Project: ${chosenDeal?.projectName || 'Kurukshetra Corridor'}\n  - Location: ${loc || 'Kurukshetra, Haryana'} [Zero GPS Coordinates]\n  - Size: ${chosenDeal?.sizeLabel || (chosenDeal?.size ? `${chosenDeal.size} sq.yd` : 'Prime Area')}\n  - Physical Specs: ${specsSummary || 'Not supplied in the CRM record'}\n  - RERA Registration: ${chosenDeal?.reraNumber ? `Number recorded: ${chosenDeal.reraNumber}; approval status not inferred` : 'Not supplied; approval not claimed'}\n• Multi-Channel Copywriting: Generated tailored hooks for Facebook, Instagram, LinkedIn, YouTube & Google Business Profile`,
                designer: `🎨 DESIGNER (Visual AI & Studio Sharp Engine)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Deal Identity & Physical Specs Ingested: Retrieved ${chosenDeal?.sizeLabel || 'Size'}, ${chosenDeal?.facing || 'Facing'}, ${chosenDeal?.roadWidth || 'Road Access'}\n• Designer Studio (Visual Prompt Lab): Composed 1080x1080 high-conversion flyer\n• Brand Kit Enforced: Official Navy & Gold palette; compliance labels only when evidence supports them\n• Asset URL: ${visualAsset?.url || 'No visual asset generated'}\n• Regional Contact Strip: ${regionalPhone} | ${website}`,
                scheduler: `⏱ SCHEDULING MANAGER (BullMQ Queue)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Staggered Scheduling Delay Matrix Applied:\n${enqueuedJobs.map(j => `  - ${j.platform.toUpperCase()}: ${j.delayMs === 0 ? '⚡ INSTANT DISPATCH' : `+${Math.round(j.delayMs / 60000)} min delay (Peak Slot)`}`).join('\n') || '  - Instant dispatch requested'}\n• Active Syndication Channels: [${targetChannels.join(', ')}]\n• Queue Dispatch: ${enqueuedJobs.length} BullMQ jobs enqueued with automatic backoff\n• CRM Attribution: Deal ID bound to MarketingContent and Deal Activity timeline`
            }
        };
    }
}

export default new MarketingService();
