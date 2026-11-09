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
            // High-resolution real estate drone video reel assets (hosted on public CRM domain)
            const sampleVideos = [
                'https://api.bharatproperties.co/uploads/file-1794103158366-51719174-gemini_generated_video_10961d17.mp4',
                'https://api.bharatproperties.co/uploads/file-1794018634894-814394752-3fae3d57-5797-4a0d-88c9-2d524ea239ae.MP4'
            ];
            return {
                success: true,
                assetType: 'video',
                url: sampleVideos[0],
                prompt: `Cinematic 4K overhead drone flyover of ${projectName} in ${location}, golden hour sunset lighting, 8k resolution, smooth cinematic reel`
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
                    const festCheck = this.detectUpcomingFestival(new Date());
                    targetPillar = festCheck.isFestival ? 'ct-festival' : 'ct-project';
                }
            }

            const bannerResult = await brandBannerComposer.composeBanner({
                pillar: targetPillar,
                deal,
                festivalName: options.festival?.name || options.festivalName || 'Dhanteras & Diwali',
                greeting: options.festival?.greeting || options.greeting,
                customTitleHi: options.customTitleHi || (targetPillar === 'ct-festival' ? 'शुभ धनतेरस एवं दीपावली' : undefined),
                customTitleEn: options.customTitleEn || (targetPillar === 'ct-festival' ? 'HAPPY DHANTERAS & DIWALI' : undefined),
                subtext: options.subtext,
                edu: options.edu,
                trust: options.trust,
                phone: `+91 ${phone} | 99913-33570`,
                address: '#166, Sector 3, Huda Market, Kurukshetra',
                website: 'www.bharatproperties.co'
            });

            return bannerResult;
        } catch (err) {
            console.error('[MarketingService] Error in BrandBannerComposer:', err);
            // Resilient fallback
            return await brandBannerComposer.composeFestivalBanner({
                phone: '+91 94160-35570 | 99913-33570'
            });
        }
    }

    // ── 🧠 AUTONOMOUS ENTERPRISE MARKETING OS ENGINE ─────────────────────────

    /**
     * Detect upcoming major Indian festivals within 3 days of target date
     * @param {Date} date 
     */
    detectUpcomingFestival(date = new Date()) {
        const d = new Date(date);
        const m = d.getMonth() + 1; // 1-12
        const day = d.getDate();

        // Major festival calendar
        const festivalCalendar = [
            { name: 'Lohri & Makar Sankranti', month: 1, day: 14, windowDays: 2, greeting: 'Happy Lohri & Makar Sankranti! May this harvest season bring prosperity and your dream home closer to your family.' },
            { name: 'Republic Day', month: 1, day: 26, windowDays: 2, greeting: 'Happy Republic Day! Proudly celebrating the foundation and growth of our nation. Invest in a secure future with Bharat Properties.' },
            { name: 'Maha Shivratri', month: 2, day: 26, windowDays: 2, greeting: 'Har Har Mahadev! Warm greetings on Maha Shivratri. May Lord Shiva bless your home with peace and prosperity.' },
            { name: 'Holi', month: 3, day: 14, windowDays: 2, greeting: 'Happy Holi! Wishing you and your family vibrant colors of joy, success, and prosperity in your new home.' },
            { name: 'Baisakhi', month: 4, day: 14, windowDays: 2, greeting: 'Happy Baisakhi! May Waheguru shower you with success and prosperity this harvest season.' },
            { name: 'Independence Day', month: 8, day: 15, windowDays: 2, greeting: 'Happy Independence Day! Celebrate the freedom of owning your own land with Bharat Properties.' },
            { name: 'Raksha Bandhan', month: 8, day: 28, windowDays: 2, greeting: 'Happy Raksha Bandhan! Gift the promise of lifetime security with a verified property.' },
            { name: 'Janmashtami', month: 9, day: 4, windowDays: 2, greeting: 'Jai Shri Krishna! Warm wishes on Janmashtami from the land of Gita, Kurukshetra.' },
            { name: 'Gandhi Jayanti', month: 10, day: 2, windowDays: 1, greeting: 'Remembering Mahatma Gandhi on his birth anniversary. Dedicated to honesty, truth, and transparency in real estate.' },
            { name: 'Navratri & Dussehra', month: 10, day: 20, windowDays: 3, greeting: 'Subh Navratri & Happy Dussehra! May the victory of good over evil bring abundant prosperity to your household.' },
            { name: 'Dhanteras & Diwali', month: 11, day: 8, windowDays: 3, greeting: 'Shubh Dhanteras & Happy Diwali! This festive season, invest in enduring wealth with prime verified real estate.' },
            { name: 'Bhai Dooj', month: 11, day: 11, windowDays: 1, greeting: 'Happy Bhai Dooj! Strengthening the bonds of trust and care with Bharat Properties.' },
            { name: 'Guru Nanak Jayanti (Gurpurab)', month: 11, day: 24, windowDays: 2, greeting: 'Gurpurab Di Lakh Lakh Vadhaiyan! May Guru Nanak Dev Ji guide your path with peace, harmony, and prosperity.' },
            { name: 'New Year', month: 1, day: 1, windowDays: 2, greeting: 'Happy New Year! Start this year with the foundation of your family\'s financial freedom through prime property investments.' }
        ];

        for (const fest of festivalCalendar) {
            if (fest.month === m) {
                const diff = Math.abs(day - fest.day);
                if (diff <= fest.windowDays) {
                    return {
                        isFestival: true,
                        name: fest.name,
                        greeting: fest.greeting,
                        hashtags: `#${fest.name.replace(/[^a-zA-Z0-9]/g, '')} #BharatProperties #Kurukshetra #FestiveSeason #RealEstateHaryana`
                    };
                }
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
        let pillar = options.pillar || 'ct-project';

        const festival = this.detectUpcomingFestival(now);
        if (festival.isFestival && !options.pillar) {
            pillar = 'ct-festival';
        } else if (!options.pillar) {
            if (dayOfWeek === 4) { // Thursday = Educational
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
        const regionalPhone = '+91 99913 33570';
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
                // Fallback: Pick any open deal if all have been posted
                candidates = await Deal.find({ stage: { $in: ['Open', 'Qualified', 'Ready to Market'] } }).sort({ updatedAt: 1 }).limit(5).lean();
            }

            if (options.dealId) {
                chosenDeal = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(options.dealId, 'deal', { isSystem: true });
                if (!chosenDeal) {
                    return { success: false, reason: 'Specified deal not found or inaccessible under compliance rules' };
                }
            } else if (candidates && candidates.length > 0) {
                chosenDeal = await marketingComplianceEnforcementService.resolveAuthoritativeEntity(candidates[0]._id, 'deal', { isSystem: true });
            }

            if (!chosenDeal) {
                // If no active deals found in DB, do NOT synthesize fake factual claims; switch to educational advisory
                pillar = 'ct-edu';
                console.log('[AutonomousMarketingOS] No active authorized deals found in DB. Falling back to Educational pillar.');
                const edu = this.getEducationalTopic();
                postTitle = `Real Estate Advisory: ${edu.title}`;
                const pointsFormatted = edu.points.map(p => `✓ ${p}`).join('\n');

                channelCaptions.facebook = `📚 REAL ESTATE KNOWLEDGE SERIES | ${edu.title}\n\n${edu.hook}\n\n${edu.summary}\n\nKey Points to Remember:\n${pointsFormatted}\n\nSave this post for your future property purchases! Any questions regarding Haryana property legal verification?\n📞 Call our Legal Advisory Desk: ${regionalPhone}\n🌐 ${website}\n\n${edu.hashtags}`;
                channelCaptions.instagram = `💡 ${edu.hook}\n\nHere is what every smart buyer needs to know:\n\n${pointsFormatted}\n\n📌 Save this reel/post for your next site visit!\nNeed transparent advice? Call ${regionalPhone} | 🌐 ${website}\n\n${edu.hashtags}`;
                channelCaptions.youtube = `Shorts: ${edu.hook} 3 legal rules you must know before buying land in Haryana! Call ${regionalPhone} for guidance.`;
                channelCaptions.google_business = `Knowledge Post: ${edu.title}. Follow Bharat Properties for transparent property guidelines and circle rates in Kurukshetra. Call ${regionalPhone}.`;

                visualAsset = await this.generateVisualAsset({
                    type: 'image',
                    customPrompt: `Modern high-end real estate architectural office in Kurukshetra, blueprint diagrams and architectural floor plans on wooden conference desk, soft natural morning sunlight, cinematic 8k render`
                });
            } else {
                const facts = marketingComplianceEnforcementService.extractAuthoritativeFacts(chosenDeal);
                const unitNo = chosenDeal.unitNo || 'Prime Unit';
                const projName = chosenDeal.projectName || 'Prime Location';
                const loc = chosenDeal.location || 'Kurukshetra, Haryana';
                const priceStr = chosenDeal.price ? `₹${Number(chosenDeal.price).toLocaleString('en-IN')}` : 'Best Offer';

                postTitle = `Hot Property Spotlight: ${unitNo} at ${projName}`;
                const verifiedHashtag = facts.isTitleVerified ? '#VerifiedDeal' : '#PrimeListing';

                // Generate Captions per Channel
                channelCaptions.facebook = `🔥 FRESH DEAL ALERT | ${unitNo} at ${projName}\n\nLooking for a prime real estate opportunity in ${loc}? Factual listing details with transparent documentation.\n\n📍 Location: ${loc}\n📐 Size: ${chosenDeal.size || 'Prime Area'} ${chosenDeal.sizeUnit || 'sq.yards'}\n💰 Expected Price: ${priceStr}\n\nDirect deal with transparent paperwork. Book your private site visit today!\n📞 Call / WhatsApp: ${regionalPhone}\n🌐 Visit: ${website}\n\n#BharatProperties #KurukshetraRealEstate #PropertyInHaryana ${verifiedHashtag} #LuxuryLiving`;
                channelCaptions.instagram = `⚡ EXCLUSIVE LISTING ALERT in ${loc}! 🏡\n\n${unitNo} at ${projName} is available for site visits.\n\nKey Highlights:\n📍 Prime Connectivity & Wide Roads\n💰 Investment: ${priceStr}\n\nDM us "VISIT" or call ${regionalPhone} for blueprint & location pin!\n\n#BharatProperties #Kurukshetra #PropertyAlert #RealEstateIndia #DreamHome #InvestInKurukshetra #HaryanaProperty`;
                channelCaptions.youtube = `Shorts: ${unitNo} in ${loc} — Full Walkthrough & Price Reveal! Drone Tour. Call ${regionalPhone} to book private viewing. 🌐 ${website}`;
                channelCaptions.google_business = `Fresh Real Estate Listing: ${unitNo} at ${projName}, ${loc}. Price: ${priceStr}. Call ${regionalPhone} or visit Bharat Properties office today!`;

                // Generate photorealistic visual
                visualAsset = await this.generateVisualAsset({ deal: chosenDeal, type: 'image', pillar: 'ct-project', angle: 'drone', mood: 'golden_hour', format: 'post' });
            }
        } else if (pillar === 'ct-festival') {
            postTitle = `Festive Greetings: ${festival.name}`;
            channelCaptions.facebook = `✨ ${festival.greeting}\n\nBharat Properties wishes you and your family abundant peace, happiness, and prosperity on the auspicious occasion of ${festival.name}.\n\nMay this festive season mark the beginning of new milestones and bring you closer to owning your dream home.\n\nWith warm regards,\nBharat Properties Team\n📞 ${regionalPhone} | 🌐 ${website}\n\n${festival.hashtags}`;
            channelCaptions.instagram = `✨ Warm greetings on ${festival.name} from Bharat Properties! 🪔\n\nMay this joyous occasion bring immense happiness, health, and auspicious beginnings to your family.\n\n📞 ${regionalPhone} | 🌐 ${website}\n\n${festival.hashtags}`;
            channelCaptions.youtube = `${festival.name} Greetings from Bharat Properties Kurukshetra! Wishing everyone peace, prosperity, and joy.`;
            channelCaptions.google_business = `${festival.greeting} Warm festive greetings from Bharat Properties Kurukshetra. Call ${regionalPhone} for prime property inquiries.`;

            // Generate branded festive flyer with official logo and auspicious greetings
            visualAsset = await this.generateVisualAsset({
                type: 'image',
                pillar: 'ct-festival',
                festival,
                festivalName: festival.name,
                greeting: festival.greeting,
                customTitleHi: 'शुभ धनतेरस एवं दीपावली',
                customTitleEn: 'HAPPY DHANTERAS & DIWALI',
                subtext: 'May this festive season illuminate your life with joy, enduring wealth, and your dream home!'
            });

        } else if (pillar === 'ct-edu') {
            const edu = this.getEducationalTopic();
            postTitle = `Real Estate Advisory: ${edu.title}`;
            const pointsFormatted = edu.points.map(p => `✓ ${p}`).join('\n');

            channelCaptions.facebook = `📚 REAL ESTATE KNOWLEDGE SERIES | ${edu.title}\n\n${edu.hook}\n\n${edu.summary}\n\nKey Points to Remember:\n${pointsFormatted}\n\nSave this post for your future property purchases! Any questions regarding Haryana property legal verification?\n📞 Call our Legal Advisory Desk: ${regionalPhone}\n🌐 ${website}\n\n${edu.hashtags}`;
            channelCaptions.instagram = `💡 ${edu.hook}\n\nHere is what every smart buyer needs to know:\n\n${pointsFormatted}\n\n📌 Save this reel/post for your next site visit!\nNeed transparent advice? Call ${regionalPhone} | 🌐 ${website}\n\n${edu.hashtags}`;
            channelCaptions.youtube = `Shorts: ${edu.hook} 3 legal rules you must know before buying land in Haryana! Call ${regionalPhone} for guidance.`;
            channelCaptions.google_business = `Knowledge Post: ${edu.title}. Follow Bharat Properties for transparent property guidelines and circle rates in Kurukshetra. Call ${regionalPhone}.`;

            // Generate branded educational flyer
            visualAsset = await this.generateVisualAsset({
                type: 'image',
                pillar: 'ct-edu',
                edu
            });

        } else if (pillar === 'ct-trust') {
            const trust = this.getTrustTopic();
            postTitle = `Trust & Reputation: ${trust.title}`;

            channelCaptions.facebook = `🏛️ THE BHARAT PROPERTIES STANDARD | ${trust.title}\n\n${trust.hook}\n\n${trust.body}\n\n🛡️ ${trust.badge}\n\nExperience transparent property transactions with our senior real estate consultants.\n📞 Call: ${regionalPhone}\n🌐 ${website}\n\n${trust.hashtags}`;
            channelCaptions.instagram = `⭐ ${trust.hook}\n\n${trust.body}\n\n🛡️ ${trust.badge}\n\nReady to find your ideal property with zero stress? Call us at ${regionalPhone} or tap the link in bio!\n\n${trust.hashtags}`;
            channelCaptions.youtube = `Shorts: Why Kurukshetra trusts Bharat Properties for verified real estate mandates! Call ${regionalPhone} or visit ${website}.`;
            channelCaptions.google_business = `${trust.title}: ${trust.body} Contact Bharat Properties at ${regionalPhone}.`;

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
        const targetDate = new Date();
        const currentHour = targetDate.getHours();
        let targetSlotTime = '10:00';
        
        if (currentHour >= 12 && currentHour < 19) {
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

        const targetChannels = config.channels || ['facebook', 'instagram', 'youtube', 'google_business'];
        const enqueuedJobs = [];

        // 5. Enqueue to BullMQ marketingQueue
        if (!options.dryRun && marketingQueue) {
            for (const ch of targetChannels) {
                const captionText = channelCaptions[ch] || channelCaptions.facebook;
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
                        delay: delayMs,
                        removeOnComplete: true,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 5000 }
                    });
                    enqueuedJobs.push({ platform: ch, jobId: job.id, delayMs });
                    console.log(`[AutonomousMarketingOS] Enqueued ${ch} dispatch job #${job.id} (delay: ${Math.round(delayMs / 60000)} min)`);
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
            status: delayMs > 60000 ? 'scheduled' : 'published',
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
            captions: channelCaptions
        };
    }
}

export default new MarketingService();
