/**
 * BrandBannerComposer.js
 * 
 * Enterprise-Grade Creative Banner Composition Engine for Bharat Properties CRM.
 * Composites high-resolution 1080x1080 social media flyers for Facebook, Instagram,
 * Google Business Profile, and YouTube thumbnails.
 * 
 * Modeled after Bharat Properties' real agency creatives (https://www.facebook.com/bharatproperties570/photos)
 * with official brand logo, standardized fonts, high-contrast typography, trust badges,
 * and regional contact footers.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

/**
 * Collect only CRM fields that are explicitly image-bearing.
 * Video/document collections are intentionally excluded from image composition.
 */
export const collectCrmHeroMediaCandidates = (entity = {}, customImageUrl = null) => {
    const asArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);
    return [
        customImageUrl,
        entity.featuredImage,
        entity.websiteMetadata?.featuredImage,
        ...asArray(entity.broadcastMetadata?.images),
        ...asArray(entity.images),
        ...asArray(entity.media),
        ...asArray(entity.photos),
        ...asArray(entity.projectImages),
        ...asArray(entity.inventoryImages),
        ...asArray(entity.builtupDetails).map(item => item?.imageUrl)
    ].filter(Boolean);
};

class BrandBannerComposer {
    constructor() {
        this.width = 1080;
        this.height = 1080;
        this.defaultPhone = '94160-35570 | 99913-33570';
        this.defaultAddress = '#166, Sector 3, Huda Market, Kurukshetra';
        this.defaultWebsite = 'www.bharatproperties.co';
    }

    /**
     * Resolve writable uploads directory
     */
    resolveUploadDir() {
        const prodDir = '/home/ubuntu/bharat-crm-releases/shared/uploads';
        if (fs.existsSync(prodDir)) {
            return prodDir;
        }
        const localUploads = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(localUploads)) {
            fs.mkdirSync(localUploads, { recursive: true });
        }
        return localUploads;
    }

    /**
     * Resolve public URL for an uploaded file
     */
    resolvePublicUrl(filename) {
        return `https://api.bharatproperties.co/uploads/${filename}`;
    }

    /**
     * Load official Bharat Properties brand logo as a resized buffer
     */
    async getLogoBuffer(width = 66, height = 66) {
        const candidatePaths = [
            '/home/ubuntu/bharat-crm-releases/shared/uploads/logo.png',
            '/home/ubuntu/bharat-crm-releases/shared/uploads/logo.jpg',
            path.join(process.cwd(), 'backend/assets/logo.png'),
            path.join(process.cwd(), 'backend/assets/logo.jpg'),
            path.join(process.cwd(), 'public/bharat-logo.jpg'),
            path.join(process.cwd(), 'src/assets/logo.png'),
            path.join(process.cwd(), 'uploads/bharatproperties_header.png')
        ];

        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                try {
                    return await sharp(p)
                        .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
                        .png()
                        .toBuffer();
                } catch (e) {
                    console.warn(`[BrandBannerComposer] Failed to load logo from ${p}:`, e.message);
                }
            }
        }
        return null;
    }

    /**
     * Load official Director / Founder avatar with a circular alpha mask
     */
    async getDirectorAvatarBuffer(size = 92) {
        const candidatePaths = [
            '/home/ubuntu/bharat-crm-releases/shared/uploads/director_avatar.jpg',
            '/home/ubuntu/bharat-crm-releases/shared/uploads/director_avatar.png',
            path.join(process.cwd(), 'backend/assets/director_avatar.jpg'),
            path.join(process.cwd(), 'backend/assets/director_avatar.png'),
            path.join(process.cwd(), 'assets/director_avatar.jpg'),
            path.join(process.cwd(), 'assets/director_avatar.png'),
            path.join(process.cwd(), 'uploads/director_avatar.jpg')
        ];

        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                try {
                    const radius = Math.floor(size / 2);
                    const circleMask = Buffer.from(
                        `<svg><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#fff" /></svg>`
                    );
                    return await sharp(p)
                        .resize(size, size, { fit: 'cover' })
                        .composite([{ input: circleMask, blend: 'dest-in' }])
                        .png()
                        .toBuffer();
                } catch (e) {
                    console.warn(`[BrandBannerComposer] Failed to load director avatar from ${p}:`, e.message);
                }
            }
        }
        return null;
    }

    /**
     * Resolve photographic hero scene as a high-resolution base64 data URI
     * Supports:
     * 1. customImageBuffer (passed directly)
     * 2. deal.images / deal.media / deal.photos (from CRM deal documents)
     * 3. customImageUrl / local path
     * 4. Curated photorealistic assets (hero_plot.jpg, hero_villa.jpg, hero_festive.jpg)
     */
    async getHeroBase64(options = {}) {
        const {
            deal = {},
            customImageBuffer = null,
            customImageUrl = null,
            pillar = 'ct-project',
            targetWidth = 940,
            targetHeight = 355
        } = options;

        try {
            // 1. Direct Buffer
            if (customImageBuffer && Buffer.isBuffer(customImageBuffer)) {
                const resized = await sharp(customImageBuffer)
                    .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
                    .jpeg({ quality: 90 })
                    .toBuffer();
                return `data:image/jpeg;base64,${resized.toString('base64')}`;
            }

            // 2. CRM-native media fields. Keep source ordering deterministic and
            // never treat documents/PDFs or video records as photographic hero assets.
            const candidateUrls = collectCrmHeroMediaCandidates(deal, customImageUrl);

            for (const item of candidateUrls) {
                const urlOrPath = typeof item === 'string'
                    ? item
                    : (item.url || item.path || item.imageUrl || item.secureUrl || item.fileUrl);
                if (typeof urlOrPath !== 'string' || !urlOrPath.trim()) continue;
                const source = urlOrPath.trim();

                // Local files are accepted only from known CRM upload/assets roots.
                const allowedLocalRoots = [
                    path.resolve(process.cwd(), 'uploads'),
                    path.resolve(process.cwd(), 'backend/uploads'),
                    path.resolve('/home/ubuntu/bharat-crm-releases/shared/uploads')
                ];
                const isAbsoluteLocalPath = path.isAbsolute(source);
                const resolvedLocalPath = isAbsoluteLocalPath ? path.resolve(source) : path.resolve(process.cwd(), source);
                const isAllowedLocalPath = allowedLocalRoots.some(root => resolvedLocalPath === root || resolvedLocalPath.startsWith(root + path.sep));

                if (isAllowedLocalPath && fs.existsSync(resolvedLocalPath) && fs.statSync(resolvedLocalPath).isFile()) {
                    try {
                        const buf = await sharp(resolvedLocalPath)
                            .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
                            .jpeg({ quality: 90 })
                            .toBuffer();
                        return `data:image/jpeg;base64,${buf.toString('base64')}`;
                    } catch (fileErr) {
                        console.warn('[BrandBannerComposer] CRM hero image file could not be decoded:', fileErr.message);
                    }
                }

                // Only HTTPS remote assets are eligible; reject arbitrary protocols.
                let parsedUrl;
                try {
                    parsedUrl = new URL(source);
                } catch {
                    continue;
                }
                if (parsedUrl.protocol !== 'https:') continue;

                try {
                    const resp = await axios.get(parsedUrl.toString(), {
                        responseType: 'arraybuffer',
                        timeout: 5000,
                        maxContentLength: 15 * 1024 * 1024,
                        maxBodyLength: 15 * 1024 * 1024,
                        headers: { 'User-Agent': 'BharatProperties-CRM/1.0' }
                    });
                    const mimeType = String(resp.headers['content-type'] || '').toLowerCase();
                    if (!mimeType.startsWith('image/')) continue;
                    const buf = await sharp(Buffer.from(resp.data))
                        .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
                        .jpeg({ quality: 90 })
                        .toBuffer();
                    return `data:image/jpeg;base64,${buf.toString('base64')}`;
                } catch (netErr) {
                    console.warn('[BrandBannerComposer] Failed to fetch CRM hero image:', netErr.message);
                }
            }

            // 3. Curated category assets are not property-specific evidence. Never substitute them for a Deal photo.
            if (pillar === 'ct-project') return null;

            // 3. Curated Authentic Category Asset
            let assetName = 'hero_plot.jpg';
            if (pillar === 'ct-festival') {
                assetName = 'hero_festive.jpg';
            } else {
                const pType = String(deal.propertyType || deal.unitType || deal.subCategory || '').toLowerCase();
                if (pType.includes('villa') || pType.includes('house') || pType.includes('kothi') || pType.includes('floor') || pType.includes('duplex') || pType.includes('builtup')) {
                    assetName = 'hero_villa.jpg';
                } else {
                    assetName = 'hero_plot.jpg';
                }
            }

            const candidatePaths = [
                path.join(process.cwd(), 'backend/assets', assetName),
                path.join(process.cwd(), 'assets', assetName),
                `/home/ubuntu/bharat-crm-releases/shared/uploads/${assetName}`,
                `/home/ubuntu/bharat-crm-releases/current/assets/${assetName}`
            ];

            for (const p of candidatePaths) {
                if (fs.existsSync(p)) {
                    const buf = await sharp(p)
                        .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
                        .jpeg({ quality: 90 })
                        .toBuffer();
                    return `data:image/jpeg;base64,${buf.toString('base64')}`;
                }
            }
        } catch (err) {
            console.warn('[BrandBannerComposer] getHeroBase64 error:', err.message);
        }

        return null;
    }

    /**
     * Brands.live-Style Premier Business Identity Footer Frame (SVG)
     * Features:
     * 1. Director / Founder portrait with dual-layer gold ornate ring + executive credentials
     * 2. WhatsApp Emerald Hot-Pill + dual verified phone numbers + trust seal
     * 3. Corporate office location, official portal & social network handles
     */
    renderBrandsLiveFooter(options = {}) {
        const {
            phone = this.defaultPhone,
            address = this.defaultAddress,
            website = this.defaultWebsite,
            directorName = 'Suraj Keshwar',
            directorTitle = 'FOUNDER & MANAGING DIRECTOR',
            companyName = 'BHARAT PROPERTIES',
            companyTagline = 'Real Estate Advisory & Property Services',
            trustPillText = 'Property details • Independent due diligence advised',
            socialHandles = 'f: @bharatproperties570  |  ig: @bhaaratproperties'
        } = options;

        const safeDirector = this.escapeXml(directorName);
        const safeDirectorTitle = this.escapeXml(directorTitle);
        const safeCompany = this.escapeXml(companyName);
        const safeTagline = this.escapeXml(companyTagline);
        const safeTrustPill = this.escapeXml(trustPillText);
        const safeSocial = this.escapeXml(socialHandles);
        const safeWebsite = this.escapeXml(website);

        // Parse phone numbers
        let primaryPhone = '94160-35570';
        let secondaryPhone = '📞 +91 99913-33570';
        if (phone) {
            const rawParts = String(phone).split(/[|/,]+/).map(s => s.trim()).filter(Boolean);
            if (rawParts.length > 0) {
                primaryPhone = rawParts[0].replace(/^\+91[\s-]*/, '');
            }
            if (rawParts.length > 1) {
                secondaryPhone = `📞 +91 ${rawParts[1].replace(/^\+91[\s-]*/, '')}`;
            }
        }
        const safePrimaryPhone = this.escapeXml(primaryPhone);
        const safeSecondaryPhone = this.escapeXml(secondaryPhone);

        // Address formatting into 2 clean lines
        let addrLine1 = '#166, Sector 3, Huda Market';
        let addrLine2 = 'Kurukshetra, Haryana';
        if (address) {
            const parts = String(address).split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length >= 3) {
                addrLine1 = parts.slice(0, -1).join(', ');
                addrLine2 = parts[parts.length - 1];
                if (!/haryana/i.test(addrLine2)) {
                    addrLine2 += ', Haryana';
                }
            } else if (parts.length === 2) {
                addrLine1 = parts[0];
                addrLine2 = parts[1];
            } else if (parts.length === 1) {
                addrLine1 = parts[0];
            }
        }
        const safeAddr1 = this.escapeXml(addrLine1);
        const safeAddr2 = this.escapeXml(addrLine2);

        return `
        <!-- BRANDS.LIVE-GRADE PREMIER BUSINESS IDENTITY FOOTER FRAME -->
        <g id="brandsLiveFooter" transform="translate(35, 915)">
            <defs>
                <linearGradient id="blGoldBar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#D4AF37" />
                    <stop offset="35%" stop-color="#FFF2A3" />
                    <stop offset="70%" stop-color="#D4AF37" />
                    <stop offset="100%" stop-color="#AA771C" />
                </linearGradient>
                <filter id="blCardShadow" x="-5%" y="-10%" width="110%" height="125%">
                    <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.55"/>
                </filter>
            </defs>

            <!-- Base White Elevation Card -->
            <rect x="0" y="0" width="1010" height="135" rx="22" fill="#FFFFFF" filter="url(#blCardShadow)" />
            
            <!-- Metallic Gold Top Border Strip -->
            <rect x="0" y="0" width="1010" height="6" rx="3" fill="url(#blGoldBar)" />

            <!-- ============================================== -->
            <!-- SECTION 1: FOUNDER & MANAGING DIRECTOR IDENTITY -->
            <!-- ============================================== -->
            <g transform="translate(15, 12)">
                <!-- Dual-Layer Gold Ring Frame (Avatar will overlay inside at x=54, y=936) -->
                <circle cx="50" cy="55" r="50" fill="none" stroke="url(#blGoldBar)" stroke-width="3.5" />
                <circle cx="50" cy="55" r="46" fill="none" stroke="#FFFFFF" stroke-width="1.8" />

                <!-- Fallback Monogram (visible if avatar image fails to load) -->
                <circle cx="50" cy="55" r="45" fill="#0B2545" />
                <text x="50" y="52" font-family="Noto Sans, Arial, sans-serif" font-size="18" font-weight="900" fill="#FFD700" text-anchor="middle">BP</text>
                <text x="50" y="68" font-family="Noto Sans, Arial, sans-serif" font-size="8.5" font-weight="800" fill="#FFF2A3" text-anchor="middle">PROPERTY ADVISORY</text>

                <!-- Executive Text & Badges -->
                <text x="110" y="38" font-family="Noto Sans, Arial, sans-serif" font-size="18" font-weight="900" fill="#0B2545">${safeDirector}</text>
                
                <rect x="110" y="47" width="170" height="20" rx="10" fill="#FEF3C7" stroke="#F59E0B" stroke-width="0.8" />
                <text x="118" y="61" font-family="Noto Sans, Arial, sans-serif" font-size="9.5" font-weight="800" fill="#92400E">★ ${safeDirectorTitle}</text>
                
                <text x="110" y="85" font-family="Noto Sans, Arial, sans-serif" font-size="12" font-weight="900" fill="#C1121F">${safeCompany}</text>
                <text x="110" y="100" font-family="Noto Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#64748B">${safeTagline}</text>
            </g>

            <!-- Column Divider 1 -->
            <line x1="375" y1="20" x2="375" y2="120" stroke="#E2E8F0" stroke-width="1.5" />

            <!-- ============================================== -->
            <!-- SECTION 2: DIRECT INQUIRY & WHATSAPP STRIP     -->
            <!-- ============================================== -->
            <g transform="translate(395, 20)">
                <text x="0" y="14" font-family="Noto Sans, Arial, sans-serif" font-size="10.5" font-weight="900" fill="#C1121F" letter-spacing="1">DIRECT INQUIRY &amp; SITE VISIT</text>
                
                <!-- Emerald WhatsApp Hot-Pill -->
                <g transform="translate(0, 24)">
                    <rect x="0" y="0" width="28" height="28" rx="14" fill="#25D366" />
                    <text x="14" y="20" font-size="15" fill="#FFFFFF" text-anchor="middle" font-weight="900">☎</text>
                    <text x="36" y="21" font-family="Noto Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#0B2545">${safePrimaryPhone}</text>
                </g>

                <text x="0" y="74" font-family="Noto Sans, Arial, sans-serif" font-size="13" font-weight="800" fill="#334155">${safeSecondaryPhone}</text>

                <!-- Trust Pill Assurance -->
                <g transform="translate(0, 83)">
                    <rect x="0" y="0" width="245" height="18" rx="9" fill="rgba(5, 150, 105, 0.1)" />
                    <text x="8" y="13" font-family="Noto Sans, Arial, sans-serif" font-size="9.5" font-weight="800" fill="#059669">${safeTrustPill}</text>
                </g>
            </g>

            <!-- Column Divider 2 -->
            <line x1="680" y1="20" x2="680" y2="120" stroke="#E2E8F0" stroke-width="1.5" />

            <!-- ============================================== -->
            <!-- SECTION 3: HEAD OFFICE & DIGITAL CHANNELS      -->
            <!-- ============================================== -->
            <g transform="translate(700, 20)">
                <text x="0" y="14" font-family="Noto Sans, Arial, sans-serif" font-size="10" font-weight="900" fill="#2563EB" letter-spacing="1">HEAD OFFICE &amp; DIGITAL</text>
                
                <g transform="translate(0, 24)">
                    <text x="0" y="14" font-family="Noto Sans, Arial, sans-serif" font-size="12" font-weight="800" fill="#1E293B">📍 ${safeAddr1}</text>
                    <text x="16" y="30" font-family="Noto Sans, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#475569">${safeAddr2}</text>
                </g>

                <text x="0" y="73" font-family="Noto Sans, Arial, sans-serif" font-size="12" font-weight="800" fill="#2563EB">🌐 ${safeWebsite}</text>

                <!-- Social Handles Strip -->
                <g transform="translate(0, 81)">
                    <rect x="0" y="0" width="280" height="20" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
                    <text x="10" y="14" font-family="Noto Sans, Arial, sans-serif" font-size="9.5" font-weight="800" fill="#475569">${safeSocial}</text>
                </g>
            </g>
        </g>
        `;
    }

    /**
     * Sanitize string for XML/SVG inclusion
     */
    escapeXml(unsafe) {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Generate 1080x1080 Festive Banner (Diwali, Dhanteras, Holi, New Year, Baisakhi, etc.)
     */
    async composeFestivalBanner(options = {}) {
        const festivalName = options.festival?.name || options.festivalName || 'Festive Greetings';
        const greeting = options.festival?.greeting || options.greeting || 'Warm Festive Greetings & Best Wishes!';
        const customTitleHi = options.customTitleHi || options.festival?.customTitleHi || (festivalName !== 'Festive Greetings' ? `${festivalName} की हार्दिक शुभकामनाएं` : 'त्योहार की हार्दिक शुभकामनाएं');
        const customTitleEn = options.customTitleEn || options.festival?.customTitleEn || (festivalName !== 'Festive Greetings' ? `HAPPY ${festivalName.toUpperCase()}` : 'FESTIVE CELEBRATIONS');
        const subtext = options.subtext || options.festival?.subtext || 'May this auspicious occasion bring joy, enduring prosperity, and your dream home!';
        const phone = options.phone || this.defaultPhone;
        const address = options.address || this.defaultAddress;
        const website = options.website || this.defaultWebsite;

        const festivalBadgeText = options.festivalBadge || (festivalName !== 'Festive Greetings' ? `✦ शुभ ${festivalName} महोत्सव ✦` : '✦ पावन पर्व की हार्दिक शुभकामनाएं ✦');

        const safeTitleHi = this.escapeXml(customTitleHi);
        const safeTitleEn = this.escapeXml(customTitleEn);
        const safeSubtext = this.escapeXml(subtext);
        const safePhone = this.escapeXml(phone);
        const safeAddress = this.escapeXml(address);
        const safeWebsite = this.escapeXml(website);
        const safeFestival = this.escapeXml(festivalName);
        const safeFestivalBadge = this.escapeXml(festivalBadgeText);

        const heroBase64 = await this.getHeroBase64({
            pillar: 'ct-festival',
            targetWidth: this.width,
            targetHeight: this.height
        });

        const svg = `
        <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="festBg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#070E1E" />
                    <stop offset="35%" stop-color="#141E36" />
                    <stop offset="70%" stop-color="#2D112B" />
                    <stop offset="100%" stop-color="#190717" />
                </linearGradient>

                <radialGradient id="festGoldGlow" cx="50%" cy="45%" r="48%">
                    <stop offset="0%" stop-color="#FFD700" stop-opacity="0.35" />
                    <stop offset="50%" stop-color="#FF9E00" stop-opacity="0.15" />
                    <stop offset="100%" stop-color="#000000" stop-opacity="0" />
                </radialGradient>

                <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#D4AF37" />
                    <stop offset="50%" stop-color="#FFF2A3" />
                    <stop offset="100%" stop-color="#D4AF37" />
                </linearGradient>

                <linearGradient id="goldTextGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FFF5C0" />
                    <stop offset="40%" stop-color="#FFD700" />
                    <stop offset="100%" stop-color="#DDA10E" />
                </linearGradient>

                <filter id="festDropShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.65"/>
                </filter>
                <filter id="festTextGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="8" flood-color="#FFB703" flood-opacity="0.5"/>
                </filter>
            </defs>

            <!-- Background Canvas with Blended Photographic Scene -->
            <rect width="${this.width}" height="${this.height}" fill="url(#festBg)" />
            ${heroBase64 ? `
            <image href="${heroBase64}" x="0" y="0" width="${this.width}" height="${this.height}" preserveAspectRatio="xMidYMid slice" opacity="0.38" />
            ` : ''}
            <circle cx="540" cy="500" r="480" fill="url(#festGoldGlow)" />

            <!-- Ornate Golden Outer & Inner Frames -->
            <rect x="25" y="25" width="1030" height="1030" rx="20" fill="none" stroke="url(#goldGradient)" stroke-width="2.5" opacity="0.6"/>
            <rect x="35" y="35" width="1010" height="1010" rx="16" fill="none" stroke="#FFD700" stroke-width="0.8" opacity="0.3"/>

            <!-- Corner Jewels -->
            <g fill="#FFD700" opacity="0.8">
                <circle cx="45" cy="45" r="4" />
                <circle cx="1035" cy="45" r="4" />
                <circle cx="45" cy="1035" r="4" />
                <circle cx="1035" cy="1035" r="4" />
            </g>

            <!-- TOP BRAND HEADER (Y: 55) -->
            <g transform="translate(60, 55)">
                <!-- Brand Logo Pill Container -->
                <rect x="0" y="0" width="320" height="78" rx="39" fill="#FFFFFF" filter="url(#festDropShadow)" />
                <text x="85" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#0B2545" letter-spacing="1">BHARAT</text>
                <text x="175" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#C1121F" letter-spacing="1">PROPERTIES</text>
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • PROFESSIONALISM</text>

                <!-- Top Right Trust Badge -->
                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="rgba(255, 255, 255, 0.08)" stroke="url(#goldGradient)" stroke-width="1.5" />
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="800" fill="#FFF" text-anchor="middle" letter-spacing="0.5">REAL ESTATE ADVISORY</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFD700" text-anchor="middle">KURUKSHETRA • HARYANA</text>
                </g>
            </g>

            <!-- FESTIVAL BADGE (Y: 205) -->
            <g transform="translate(540, 205)">
                <rect x="-240" y="0" width="480" height="44" rx="22" fill="rgba(212, 175, 55, 0.18)" stroke="url(#goldGradient)" stroke-width="1.8" filter="url(#festDropShadow)"/>
                <text x="0" y="28" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="800" fill="#FFD700" text-anchor="middle" letter-spacing="2.5">${safeFestivalBadge}</text>
            </g>

            <!-- MAIN HEADLINE -->
            <text x="540" y="295" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="56" font-weight="900" fill="url(#goldTextGrad)" text-anchor="middle" filter="url(#festTextGlow)" letter-spacing="1">
                ${safeTitleHi}
            </text>
            <text x="540" y="350" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="28" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">
                ${safeTitleEn}
            </text>
            <text x="540" y="405" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="500" fill="#E2E8F0" text-anchor="middle" opacity="0.95">
                ${safeSubtext}
            </text>

            <!-- CENTER FESTIVE MOTIF: Sacred Diya & Glowing Flame -->
            <g transform="translate(540, 560)">
                <circle cx="0" cy="0" r="130" fill="none" stroke="#FFD700" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.4"/>
                <circle cx="0" cy="0" r="110" fill="rgba(255, 183, 3, 0.12)" stroke="url(#goldGradient)" stroke-width="2" />

                <!-- Gold Coins Overflowing -->
                <g fill="#FFD700" opacity="0.85">
                    <circle cx="-50" cy="0" r="12" stroke="#B38728" stroke-width="1.5"/>
                    <circle cx="50" cy="0" r="12" stroke="#B38728" stroke-width="1.5"/>
                    <circle cx="-25" cy="-20" r="11" stroke="#B38728" stroke-width="1.5"/>
                    <circle cx="25" cy="-20" r="11" stroke="#B38728" stroke-width="1.5"/>
                </g>

                <!-- Diya Flame -->
                <path d="M0,-55 C18,-15 28,15 0,35 C-28,15 -18,-15 0,-55 Z" fill="#FF3D00" filter="url(#festDropShadow)"/>
                <path d="M0,-45 C12,-12 18,12 0,28 C-18,12 -12,-12 0,-45 Z" fill="#FFB703" />
                <path d="M0,-30 C6,-5 10,8 0,18 C-10,8 -6,-5 0,-30 Z" fill="#FFFFFF" />

                <!-- Brass Diya Body -->
                <path d="M-80,25 C-50,65 50,65 80,25 C70,45 30,75 0,75 C-30,75 -70,45 -80,25 Z" fill="url(#goldGradient)" filter="url(#festDropShadow)"/>
                <path d="M-30,75 L30,75 L20,95 L-20,95 Z" fill="#B38728" />
                <rect x="-45" y="95" width="90" height="8" rx="4" fill="url(#goldGradient)" />
            </g>

            <!-- REAL ESTATE VALUE CARD (Y: 745) -->
            <g transform="translate(540, 745)">
                <rect x="-460" y="0" width="920" height="125" rx="20" fill="rgba(11, 37, 69, 0.85)" stroke="url(#goldGradient)" stroke-width="1.5" filter="url(#festDropShadow)" />
                <text x="0" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="800" fill="#FFD700" text-anchor="middle" letter-spacing="1">
                    ✨ शुभ मुहूर्त में अपने सपनों के आशियाने की शुरुआत करें ✨
                </text>

                <!-- 3 Pillars -->
                <g transform="translate(-320, 78)">
                    <circle cx="0" cy="0" r="16" fill="#059669" />
                    <text x="0" y="6" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="28" y="-3" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#FFFFFF">Document review</text>
                    <text x="28" y="15" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="500" fill="#94A3B8">Check current official records</text>
                </g>

                <g transform="translate(0, 78)">
                    <circle cx="0" cy="0" r="16" fill="#2563EB" />
                    <text x="0" y="6" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="28" y="-3" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#FFFFFF">Planning status</text>
                    <text x="28" y="15" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="500" fill="#94A3B8">Verify with competent authority</text>
                </g>

                <g transform="translate(320, 78)">
                    <circle cx="0" cy="0" r="16" fill="#D97706" />
                    <text x="0" y="6" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="28" y="-3" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#FFFFFF">Financing options</text>
                    <text x="28" y="15" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="500" fill="#94A3B8">Subject to lender eligibility</text>
                </g>
            </g>

            <!-- STANDARDIZED BRAND BOTTOM FOOTER (Y: 915) -->
            ${this.renderBrandsLiveFooter(options)}
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));
        const composites = [];

        // Add brand logo
        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            composites.push({ input: logo, left: 68, top: 61 });
        }

        // Add director avatar
        const avatar = await this.getDirectorAvatarBuffer(92);
        if (avatar) {
            composites.push({ input: avatar, left: 54, top: 936 });
        }

        if (composites.length > 0) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite(composites);
        }

        return await this.saveBanner(compositeInstance, 'festival');
    }

    /**
     * Generate 1080x1080 Property Spotlight Banner (Plots, Villas, Commercial)
     * Modeled after post3_plot.jpg and post20.jpg
     */
    async composePropertyBanner(options = {}) {
        const {
            deal = {},
            title = 'Hot Property Spotlight',
            customImageBuffer = null,
            phone = this.defaultPhone,
            address = this.defaultAddress,
            website = this.defaultWebsite
        } = options;

        const maskUnitNo = options.maskUnitNo !== false;
        let unitHeadline = 'PRIME PROPERTY';
        if (!maskUnitNo && deal.unitNo) {
            unitHeadline = deal.unitNo;
        } else if (deal.sizeLabel) {
            const cleanSize = String(deal.sizeLabel).replace(/\s*\([^)]*\)/g, '').trim();
            unitHeadline = `${cleanSize} Plot`;
        } else if (deal.propertyType || deal.unitType) {
            unitHeadline = `Prime ${deal.propertyType || deal.unitType}`;
        } else {
            unitHeadline = deal.name || deal.title || 'Prime Property';
        }

        const projName = deal.projectName?.name || deal.projectName || 'Project details on request';
        let loc = deal.location || deal.locCity || 'Location on request';
        if (typeof loc === 'string') {
            loc = loc.replace(/\b-?\d{1,3}\.\d{4,}\b/g, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
            if (!loc || /^[0-9a-fA-F]{24}$/.test(loc)) {
                loc = 'Location on request';
            }
        }

        const size = deal.sizeLabel || (deal.size ? `${deal.size} ${deal.sizeUnit || 'sq.yd'}` : 'Size on request');
        const priceStr = deal.price ? (typeof deal.price === 'number' ? `₹${deal.price.toLocaleString('en-IN')}` : String(deal.price)) : 'Price on request';

        const facingRoad = [deal.facing ? `${deal.facing} Facing` : null, deal.roadWidth ? `${deal.roadWidth} Road` : null].filter(Boolean).join(' • ') || 'Specifications on request';
        const safeHeadline = this.escapeXml(`${unitHeadline.toUpperCase()} AVAILABLE FOR SALE`);
        const safeSub = this.escapeXml(`At ${projName}, ${loc}`);
        const safePhone = this.escapeXml(phone);
        const safeAddress = this.escapeXml(address);
        const safeWebsite = this.escapeXml(website);
        const safePrice = this.escapeXml(priceStr);
        const safeSize = this.escapeXml(size);
        const safeFacingRoad = this.escapeXml(facingRoad);
        const safePill2Title = this.escapeXml(deal.facing ? `${deal.facing} Facing` : 'Facing not supplied');
        const safePill2Sub = this.escapeXml(deal.roadWidth ? `${deal.roadWidth} Road` : 'Road width not supplied');
        const safePill2Desc = this.escapeXml(deal.dimensions ? `Dim: ${deal.dimensions}` : 'Utilities not verified');

        // Photographic Hero Scene Loading
        const heroBase64 = await this.getHeroBase64({
            deal,
            customImageBuffer,
            customImageUrl: options.customImageUrl,
            pillar: 'ct-project',
            targetWidth: 940,
            targetHeight: 355
        });

        const svg = `
        <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="propBg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#0A192F" />
                    <stop offset="40%" stop-color="#112240" />
                    <stop offset="80%" stop-color="#1E293B" />
                    <stop offset="100%" stop-color="#0F172A" />
                </linearGradient>

                <linearGradient id="propAccentGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#C1121F" />
                    <stop offset="100%" stop-color="#E63946" />
                </linearGradient>

                <linearGradient id="goldPillProp" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#D4AF37" />
                    <stop offset="50%" stop-color="#FFF2A3" />
                    <stop offset="100%" stop-color="#D4AF37" />
                </linearGradient>

                <filter id="propShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
                </filter>

                <clipPath id="propPhotoClip">
                    <rect x="10" y="10" width="940" height="355" rx="18" />
                </clipPath>

                <linearGradient id="heroGradientScrim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#000000" stop-opacity="0.1" />
                    <stop offset="45%" stop-color="#0B2545" stop-opacity="0.3" />
                    <stop offset="75%" stop-color="#0B2545" stop-opacity="0.75" />
                    <stop offset="100%" stop-color="#070E1E" stop-opacity="0.95" />
                </linearGradient>
            </defs>

            <!-- Base Canvas -->
            <rect width="${this.width}" height="${this.height}" fill="url(#propBg)" />

            <!-- Dynamic Brand Waves (matching post3_plot.jpg) -->
            <path d="M0,0 L1080,0 L1080,240 C850,280 620,180 0,260 Z" fill="#0B2545" opacity="0.9" />
            <path d="M0,0 L1080,0 L1080,210 C780,250 500,160 0,230 Z" fill="url(#propAccentGrad)" opacity="0.85" />
            <path d="M0,0 L1080,0 L1080,180 C800,210 400,140 0,190 Z" fill="#070E1E" />

            <!-- TOP BRAND HEADER (Y: 45) -->
            <g transform="translate(60, 40)">
                <!-- Brand Logo Pill -->
                <rect x="0" y="0" width="320" height="78" rx="39" fill="#FFFFFF" filter="url(#propShadow)" />
                <text x="85" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#0B2545" letter-spacing="1">BHARAT</text>
                <text x="175" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#C1121F" letter-spacing="1">PROPERTIES</text>
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • PROFESSIONALISM</text>

                <!-- Top Right Badge -->
                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="#C1121F" filter="url(#propShadow)"/>
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="900" fill="#FFF" text-anchor="middle" letter-spacing="1">PROPERTY LISTING</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFF2A3" text-anchor="middle">VERIFY DOCUMENTS BEFORE PURCHASE</text>
                </g>
            </g>

            <!-- PROMINENT HEADLINE (Y: 220) -->
            <g transform="translate(540, 240)">
                <!-- Flash Badge -->
                <rect x="-180" y="-35" width="360" height="36" rx="18" fill="#FFB703" filter="url(#propShadow)"/>
                <text x="0" y="-11" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="900" fill="#0B2545" text-anchor="middle" letter-spacing="2">PROPERTY SPOTLIGHT</text>

                <!-- Main Bold Title -->
                <text x="0" y="35" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="900" fill="#FFFFFF" text-anchor="middle" filter="url(#propShadow)" letter-spacing="1">
                    ${safeHeadline}
                </text>
                <text x="0" y="75" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="700" fill="#FFD700" text-anchor="middle">
                    ✦ ${safeSub}
                </text>
            </g>

            <!-- CENTER PHOTO FRAME CONTAINER (Y: 345 - 710) -->
            <g transform="translate(60, 345)">
                <!-- Outer Frame with Gold Metallic Border -->
                <rect x="0" y="0" width="960" height="375" rx="24" fill="#0F172A" stroke="url(#goldPillProp)" stroke-width="2.5" filter="url(#propShadow)" />
                
                <!-- Photographic Scene (Cropped & Clipped) -->
                ${heroBase64 ? `
                <image href="${heroBase64}" x="10" y="10" width="940" height="355" preserveAspectRatio="xMidYMid slice" clip-path="url(#propPhotoClip)" />
                <rect x="10" y="10" width="940" height="355" fill="url(#heroGradientScrim)" clip-path="url(#propPhotoClip)" />
                ` : `
                <rect x="10" y="10" width="940" height="355" rx="18" fill="#112240" />
                `}

                <!-- Floating Price Tag on Photo -->
                <g transform="translate(35, 30)">
                    <rect x="0" y="0" width="280" height="66" rx="16" fill="#C1121F" stroke="url(#goldPillProp)" stroke-width="1.8" filter="url(#propShadow)" />
                    <text x="20" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="900" fill="#FFD700" letter-spacing="1.5">INVESTMENT / PRICE</text>
                    <text x="20" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="900" fill="#FFFFFF">${safePrice}</text>
                </g>

                <!-- Floating Size Tag on Photo -->
                <g transform="translate(645, 30)">
                    <rect x="0" y="0" width="280" height="66" rx="16" fill="#0B2545" stroke="#38BDF8" stroke-width="1.8" filter="url(#propShadow)" />
                    <text x="20" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="900" fill="#38BDF8" letter-spacing="1.5">PLOT / CARPET SIZE</text>
                    <text x="20" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFD700">${safeSize}</text>
                </g>

                <!-- Center Bottom Property Details Ribbon -->
                <g transform="translate(480, 245)">
                    <rect x="-240" y="0" width="480" height="36" rx="18" fill="rgba(11, 37, 69, 0.95)" stroke="url(#goldPillProp)" stroke-width="1.5" filter="url(#propShadow)" />
                    <text x="0" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="900" fill="#FFD700" text-anchor="middle" letter-spacing="1.5">PROPERTY DETAILS • VERIFY BEFORE PURCHASE</text>
                </g>

                <text x="480" y="315" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="800" fill="#FFFFFF" text-anchor="middle" filter="url(#propShadow)">
                    ✦ ${safeFacingRoad} ✦
                </text>
                <text x="480" y="342" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="600" fill="#93C5FD" text-anchor="middle">
                    CRM listing information • Independent due diligence advised
                </text>
            </g>

            <!-- 4 FEATURE HIGHLIGHT PILLS (Y: 745) -->
            <g transform="translate(60, 745)">
                <!-- Pill 1 -->
                <g transform="translate(0, 0)">
                    <rect x="0" y="0" width="225" height="130" rx="16" fill="#0B2545" stroke="rgba(255, 215, 0, 0.4)" stroke-width="1.2" filter="url(#propShadow)"/>
                    <circle cx="35" cy="40" r="18" fill="#059669" />
                    <text x="35" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">i</text>
                    <text x="65" y="38" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="800" fill="#FFF">Document Review</text>
                    <text x="65" y="54" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#94A3B8">Check original records</text>
                    <text x="20" y="95" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#E2E8F0">Legal review advised</text>
                </g>

                <!-- Pill 2 -->
                <g transform="translate(245, 0)">
                    <rect x="0" y="0" width="225" height="130" rx="16" fill="#0B2545" stroke="rgba(255, 215, 0, 0.4)" stroke-width="1.2" filter="url(#propShadow)"/>
                    <circle cx="35" cy="40" r="18" fill="#2563EB" />
                    <text x="35" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="65" y="38" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="800" fill="#FFF">${safePill2Title}</text>
                    <text x="65" y="54" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#94A3B8">${safePill2Sub}</text>
                    <text x="20" y="95" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#E2E8F0">${safePill2Desc}</text>
                </g>

                <!-- Pill 3 -->
                <g transform="translate(490, 0)">
                    <rect x="0" y="0" width="225" height="130" rx="16" fill="#0B2545" stroke="rgba(255, 215, 0, 0.4)" stroke-width="1.2" filter="url(#propShadow)"/>
                    <circle cx="35" cy="40" r="18" fill="#D97706" />
                    <text x="35" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="65" y="38" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="800" fill="#FFF">Financing</text>
                    <text x="65" y="54" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#94A3B8">Check with lender</text>
                    <text x="20" y="95" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#E2E8F0">Subject to lender approval</text>
                </g>

                <!-- Pill 4 -->
                <g transform="translate(735, 0)">
                    <rect x="0" y="0" width="225" height="130" rx="16" fill="#0B2545" stroke="rgba(255, 215, 0, 0.4)" stroke-width="1.2" filter="url(#propShadow)"/>
                    <circle cx="35" cy="40" r="18" fill="#7C3AED" />
                    <text x="35" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="65" y="38" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="800" fill="#FFF">Seller Coordination</text>
                    <text x="65" y="54" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#94A3B8">Face-to-Face</text>
                    <text x="20" y="95" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#E2E8F0">Subject to seller availability</text>
                </g>
            </g>

            <!-- BOTTOM FOOTER STRIP (Y: 915) -->
            ${this.renderBrandsLiveFooter(options)}
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));
        const composites = [];

        // Add brand logo
        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            composites.push({ input: logo, left: 68, top: 46 });
        }

        // Add director avatar
        const avatar = await this.getDirectorAvatarBuffer(92);
        if (avatar) {
            composites.push({ input: avatar, left: 54, top: 936 });
        }

        if (composites.length > 0) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite(composites);
        }

        return await this.saveBanner(compositeInstance, 'property');
    }

    /**
     * Generate 1080x1080 Educational / Advisory Banner
     */
    async composeEducationalBanner(options = {}) {
        const {
            edu = {},
            phone = this.defaultPhone,
            address = this.defaultAddress,
            website = this.defaultWebsite
        } = options;

        const title = edu.title || 'Legal Property Verification Checklist';
        const hook = edu.hook || '3 Rules You Must Know Before Buying Land in Haryana';
        const rawPoints = edu.points || [
            'Verify Jamabandi & Mutation (Intkal) with Tehsil records',
            'Confirm TCP Approval & HUDA Master Plan Zoning',
            'Obtain No Dues Certificate (NDC) to prevent legacy municipal liabilities'
        ];

        const stepThemes = [
            {
                number: '01',
                tag: 'REVENUE & TEHSIL RECORDS',
                color: '#059669',
                lightColor: '#10B981',
                bgGradient: 'url(#step1Grad)',
                icon: '📜',
                title: 'Jamabandi & Mutation Verification',
                defaultDesc: 'Compare Khasra / Khatoni details with current official revenue records and consult a qualified professional.'
            },
            {
                number: '02',
                tag: 'ZONING & TCP APPROVAL',
                color: '#2563EB',
                lightColor: '#38BDF8',
                bgGradient: 'url(#step2Grad)',
                icon: '🏛️',
                title: 'Town & Country Planning Approvals',
                defaultDesc: 'Check applicable land-use and planning approvals with the competent authority; approval status must be verified for each property.'
            },
            {
                number: '03',
                tag: 'MUNICIPAL & NO DUES (NDC)',
                color: '#D97706',
                lightColor: '#F59E0B',
                bgGradient: 'url(#step3Grad)',
                icon: '🛡️',
                title: 'No Dues Certificate & Clean Title',
                defaultDesc: 'Request current dues information from the relevant municipal authority; do not assume arrears are zero.'
            }
        ];

        const safeTitle = this.escapeXml(title);
        const safeHook = this.escapeXml(hook);
        const safePhone = this.escapeXml(phone);
        const safeAddress = this.escapeXml(address);
        const safeWebsite = this.escapeXml(website);

        const svg = `
        <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="eduBg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#070E1E" />
                    <stop offset="35%" stop-color="#0F172A" />
                    <stop offset="70%" stop-color="#1E293B" />
                    <stop offset="100%" stop-color="#0B2545" />
                </linearGradient>

                <linearGradient id="goldGradientEdu" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#D4AF37" />
                    <stop offset="50%" stop-color="#FFF2A3" />
                    <stop offset="100%" stop-color="#D4AF37" />
                </linearGradient>

                <linearGradient id="step1Grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="rgba(5, 150, 105, 0.25)" />
                    <stop offset="100%" stop-color="rgba(15, 23, 42, 0.95)" />
                </linearGradient>

                <linearGradient id="step2Grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="rgba(37, 99, 235, 0.25)" />
                    <stop offset="100%" stop-color="rgba(15, 23, 42, 0.95)" />
                </linearGradient>

                <linearGradient id="step3Grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="rgba(217, 119, 6, 0.25)" />
                    <stop offset="100%" stop-color="rgba(15, 23, 42, 0.95)" />
                </linearGradient>

                <filter id="eduShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.65"/>
                </filter>
            </defs>

            <rect width="${this.width}" height="${this.height}" fill="url(#eduBg)" />

            <!-- Header -->
            <g transform="translate(60, 45)">
                <rect x="0" y="0" width="320" height="78" rx="39" fill="#FFFFFF" filter="url(#eduShadow)" />
                <text x="85" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#0B2545" letter-spacing="1">BHARAT</text>
                <text x="175" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#C1121F" letter-spacing="1">PROPERTIES</text>
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • PROFESSIONALISM</text>

                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="#2563EB" filter="url(#eduShadow)"/>
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="900" fill="#FFF" text-anchor="middle" letter-spacing="1">KNOWLEDGE SERIES</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFF2A3" text-anchor="middle">BUYER ADVISORY DESK</text>
                </g>
            </g>

            <!-- Headline -->
            <g transform="translate(540, 185)">
                <rect x="-190" y="-32" width="380" height="36" rx="18" fill="#FFB703" filter="url(#eduShadow)"/>
                <text x="0" y="-9" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="900" fill="#0B2545" text-anchor="middle" letter-spacing="2">📚 REAL ESTATE LEGAL ADVISORY</text>
                <text x="0" y="45" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="40" font-weight="900" fill="#FFFFFF" text-anchor="middle" filter="url(#eduShadow)">
                    ${safeTitle}
                </text>
                <text x="0" y="85" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="600" fill="#94A3B8" text-anchor="middle">
                    ${safeHook}
                </text>
            </g>

            <!-- 3 Educational Cards with Rich Brands.live Caliber -->
            <g transform="translate(70, 335)">
                ${stepThemes.map((st, idx) => {
                    const pointText = rawPoints[idx] || st.defaultDesc;
                    const safePointText = this.escapeXml(pointText);
                    const safeTag = this.escapeXml(st.tag);
                    const safeStepTitle = this.escapeXml(st.title);
                    return `
                <g transform="translate(0, ${idx * 175})">
                    <!-- Glass Card Backdrop -->
                    <rect x="0" y="0" width="940" height="150" rx="20" fill="${st.bgGradient}" stroke="${st.lightColor}" stroke-width="1.8" filter="url(#eduShadow)"/>
                    
                    <!-- Left Step Badge Column -->
                    <g transform="translate(30, 25)">
                        <circle cx="45" cy="50" r="38" fill="#0F172A" stroke="${st.lightColor}" stroke-width="2.5" />
                        <circle cx="45" cy="50" r="30" fill="${st.color}" />
                        <text x="45" y="58" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle">${st.number}</text>
                    </g>

                    <!-- Content Column -->
                    <g transform="translate(135, 25)">
                        <!-- Category Tag Pill -->
                        <rect x="0" y="2" width="250" height="26" rx="13" fill="${st.color}" opacity="0.95" />
                        <text x="125" y="19" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">${safeTag}</text>

                        <!-- Step Title -->
                        <text x="0" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFD700">${safeStepTitle}</text>
                        
                        <!-- Step Description -->
                        <text x="0" y="84" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="600" fill="#E2E8F0">${safePointText}</text>
                        <text x="0" y="106" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="500" fill="#94A3B8">General buyer education • Consult a qualified legal professional</text>
                    </g>

                    <!-- Right Check Pill -->
                    <g transform="translate(865, 55)">
                        <circle cx="20" cy="20" r="18" fill="${st.color}" />
                        <text x="20" y="27" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="900" fill="#FFFFFF" text-anchor="middle">✓</text>
                    </g>
                </g>
                    `;
                }).join('')}
            </g>

            <!-- Bottom Advisory Guarantee Ribbon -->
            <g transform="translate(540, 875)">
                <rect x="-380" y="-18" width="760" height="34" rx="17" fill="rgba(11, 37, 69, 0.85)" stroke="url(#goldGradientEdu)" stroke-width="1.2" />
                <text x="0" y="5" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="800" fill="#FFD700" text-anchor="middle" letter-spacing="1">
                    BUYER DUE DILIGENCE • NO LEGAL GUARANTEE IMPLIED
                </text>
            </g>

            <!-- Footer Strip -->
            ${this.renderBrandsLiveFooter(options)}
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));
        const composites = [];

        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            composites.push({ input: logo, left: 68, top: 51 });
        }

        const avatar = await this.getDirectorAvatarBuffer(92);
        if (avatar) {
            composites.push({ input: avatar, left: 54, top: 936 });
        }

        if (composites.length > 0) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite(composites);
        }

        return await this.saveBanner(compositeInstance, 'educational');
    }

    /**
     * Generate 1080x1080 Trust & Reputation Banner
     */
    async composeTrustBanner(options = {}) {
        const {
            trust = {},
            phone = this.defaultPhone,
            address = this.defaultAddress,
            website = this.defaultWebsite
        } = options;

        const title = trust.title || 'A transparent property-search process';
        const hook = trust.hook || 'Clear communication, documented information and informed decisions';
        const badge = trust.badge || 'Property enquiries • Site-visit coordination';

        const safeTitle = this.escapeXml(title);
        const safeHook = this.escapeXml(hook);
        const safeBadge = this.escapeXml(badge);
        const safePhone = this.escapeXml(phone);
        const safeAddress = this.escapeXml(address);
        const safeWebsite = this.escapeXml(website);

        const svg = `
        <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="trustBg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#050C1A" />
                    <stop offset="30%" stop-color="#0B2545" />
                    <stop offset="70%" stop-color="#134074" />
                    <stop offset="100%" stop-color="#001220" />
                </linearGradient>

                <linearGradient id="goldPillTrust" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#D4AF37" />
                    <stop offset="50%" stop-color="#FFF2A3" />
                    <stop offset="100%" stop-color="#D4AF37" />
                </linearGradient>

                <linearGradient id="goldTextTrust" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FFF5C0" />
                    <stop offset="40%" stop-color="#FFD700" />
                    <stop offset="100%" stop-color="#DDA10E" />
                </linearGradient>

                <filter id="trustShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.65"/>
                </filter>
            </defs>

            <rect width="${this.width}" height="${this.height}" fill="url(#trustBg)" />

            <!-- Header -->
            <g transform="translate(60, 45)">
                <rect x="0" y="0" width="320" height="78" rx="39" fill="#FFFFFF" filter="url(#trustShadow)" />
                <text x="85" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#0B2545" letter-spacing="1">BHARAT</text>
                <text x="175" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#C1121F" letter-spacing="1">PROPERTIES</text>
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • PROFESSIONALISM</text>

                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="rgba(255, 255, 255, 0.12)" stroke="url(#goldPillTrust)" stroke-width="1.8" filter="url(#trustShadow)"/>
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="900" fill="#FFF" text-anchor="middle" letter-spacing="1">REAL ESTATE ADVISORY</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFD700" text-anchor="middle">BUYER &amp; SELLER SUPPORT</text>
                </g>
            </g>

            <!-- Main Headline -->
            <g transform="translate(540, 195)">
                <rect x="-190" y="-30" width="380" height="36" rx="18" fill="#FFB703" filter="url(#trustShadow)"/>
                <text x="0" y="-7" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="900" fill="#0B2545" text-anchor="middle" letter-spacing="2">🏛️ THE BHARAT PROPERTIES STANDARD</text>

                <text x="0" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="900" fill="#FFFFFF" text-anchor="middle" filter="url(#trustShadow)">
                    ${safeTitle}
                </text>
                <text x="0" y="92" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="600" fill="#E2E8F0" text-anchor="middle">
                    ${safeHook}
                </text>
            </g>

            <!-- 3 Trust Pillars Box with Rich Authority Seals -->
            <g transform="translate(70, 345)">
                <!-- Card 1 -->
                <g transform="translate(0, 0)">
                    <rect x="0" y="0" width="940" height="150" rx="20" fill="rgba(11, 37, 69, 0.92)" stroke="url(#goldPillTrust)" stroke-width="2" filter="url(#trustShadow)"/>
                    
                    <!-- Left Icon Emblem -->
                    <g transform="translate(25, 25)">
                        <circle cx="50" cy="50" r="42" fill="#0F172A" stroke="url(#goldPillTrust)" stroke-width="2" />
                        <circle cx="50" cy="50" r="32" fill="#059669" />
                        <text x="50" y="59" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="900" fill="#FFF" text-anchor="middle">🤝</text>
                    </g>

                    <!-- Text Area -->
                    <g transform="translate(145, 25)">
                        <rect x="0" y="2" width="220" height="24" rx="12" fill="#059669" opacity="0.9" />
                        <text x="110" y="18" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">TRANSPARENT DISCUSSIONS</text>

                        <text x="0" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="900" fill="#FFD700">Meeting Coordination</text>
                        <text x="0" y="84" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="15.5" font-weight="500" fill="#FFFFFF">Seller meetings can be coordinated subject to availability. Confirm ownership and all commercial terms independently.</text>
                        <text x="0" y="106" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="600" fill="#93C5FD">Request identity and ownership documents • Record agreed terms</text>
                    </g>
                </g>

                <!-- Card 2 -->
                <g transform="translate(0, 175)">
                    <rect x="0" y="0" width="940" height="150" rx="20" fill="rgba(11, 37, 69, 0.92)" stroke="url(#goldPillTrust)" stroke-width="2" filter="url(#trustShadow)"/>
                    
                    <!-- Left Icon Emblem -->
                    <g transform="translate(25, 25)">
                        <circle cx="50" cy="50" r="42" fill="#0F172A" stroke="url(#goldPillTrust)" stroke-width="2" />
                        <circle cx="50" cy="50" r="32" fill="#2563EB" />
                        <text x="50" y="59" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="900" fill="#FFF" text-anchor="middle">📜</text>
                    </g>

                    <!-- Text Area -->
                    <g transform="translate(145, 25)">
                        <rect x="0" y="2" width="240" height="24" rx="12" fill="#2563EB" opacity="0.9" />
                        <text x="120" y="18" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">DOCUMENT REVIEW</text>

                        <text x="0" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="900" fill="#FFD700">Independent Document Review</text>
                        <text x="0" y="84" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="15.5" font-weight="500" fill="#FFFFFF">Review available property documents and verify relevant records with competent authorities or qualified legal counsel.</text>
                        <text x="0" y="106" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="600" fill="#93C5FD">Revenue records • Applicable NDC • Litigation checks where available</text>
                    </g>
                </g>

                <!-- Card 3 -->
                <g transform="translate(0, 350)">
                    <rect x="0" y="0" width="940" height="150" rx="20" fill="rgba(11, 37, 69, 0.92)" stroke="url(#goldPillTrust)" stroke-width="2" filter="url(#trustShadow)"/>
                    
                    <!-- Left Icon Emblem -->
                    <g transform="translate(25, 25)">
                        <circle cx="50" cy="50" r="42" fill="#0F172A" stroke="url(#goldPillTrust)" stroke-width="2" />
                        <circle cx="50" cy="50" r="32" fill="#C1121F" />
                        <text x="50" y="59" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="900" fill="#FFF" text-anchor="middle">🛡️</text>
                    </g>

                    <!-- Text Area -->
                    <g transform="translate(145, 25)">
                        <rect x="0" y="2" width="250" height="24" rx="12" fill="#C1121F" opacity="0.9" />
                        <text x="125" y="18" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">STRICT CLIENT CONFIDENTIALITY</text>

                        <text x="0" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="900" fill="#FFD700">Privacy &amp; Professional Secrecy</text>
                        <text x="0" y="84" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="15.5" font-weight="500" fill="#FFFFFF">We handle client enquiries with discretion and follow applicable privacy and data-handling controls.</text>
                        <text x="0" y="106" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12.5" font-weight="600" fill="#93C5FD">Professional communication • Informed property decisions</text>
                    </g>
                </g>
            </g>

            <!-- Bottom Assurance Ribbon -->
            <g transform="translate(540, 882)">
                <rect x="-380" y="-18" width="760" height="34" rx="17" fill="rgba(11, 37, 69, 0.85)" stroke="url(#goldPillTrust)" stroke-width="1.2" />
                <text x="0" y="5" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="800" fill="#FFD700" text-anchor="middle" letter-spacing="1">
                    ✦ CLEAR INFORMATION • INDEPENDENT DUE DILIGENCE ✦
                </text>
            </g>

            <!-- Footer Strip -->
            ${this.renderBrandsLiveFooter(options)}
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));
        const composites = [];

        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            composites.push({ input: logo, left: 68, top: 51 });
        }

        const avatar = await this.getDirectorAvatarBuffer(92);
        if (avatar) {
            composites.push({ input: avatar, left: 54, top: 936 });
        }

        if (composites.length > 0) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite(composites);
        }

        return await this.saveBanner(compositeInstance, 'trust');
    }

    /**
     * Common method to save generated banner to persistent uploads directory
     */
    async saveBanner(sharpInstance, prefix = 'banner') {
        const uploadDir = this.resolveUploadDir();
        const filename = `file-${Date.now()}-${prefix}-${Math.floor(Math.random() * 100000)}.jpg`;
        const localPath = path.join(uploadDir, filename);

        await sharpInstance.jpeg({ quality: 95, mozjpeg: true }).toFile(localPath);
        const publicUrl = this.resolvePublicUrl(filename);

        return {
            success: true,
            assetType: 'image',
            filename,
            localPath,
            url: publicUrl,
            width: this.width,
            height: this.height
        };
    }

    /**
     * Master dispatcher for all marketing banners
     */
    async composeBanner(options = {}) {
        const pillar = options.pillar || 'ct-project';

        if (pillar === 'ct-festival') {
            return await this.composeFestivalBanner(options);
        } else if (pillar === 'ct-edu') {
            return await this.composeEducationalBanner(options);
        } else if (pillar === 'ct-trust') {
            return await this.composeTrustBanner(options);
        } else {
            return await this.composePropertyBanner(options);
        }
    }
}

export default new BrandBannerComposer();
