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
     * Generate 1080x1080 Festive Banner (Diwali, Dhanteras, Holi, New Year, etc.)
     */
    async composeFestivalBanner(options = {}) {
        const {
            festivalName = 'Dhanteras & Diwali',
            greeting = 'Shubh Dhanteras & Happy Diwali!',
            customTitleHi = 'शुभ धनतेरस एवं दीपावली',
            customTitleEn = 'HAPPY DHANTERAS & DIWALI',
            subtext = 'May this festive season illuminate your life with joy, enduring wealth, and your dream home!',
            phone = this.defaultPhone,
            address = this.defaultAddress,
            website = this.defaultWebsite
        } = options;

        const safeTitleHi = this.escapeXml(customTitleHi);
        const safeTitleEn = this.escapeXml(customTitleEn);
        const safeSubtext = this.escapeXml(subtext);
        const safePhone = this.escapeXml(phone);
        const safeAddress = this.escapeXml(address);
        const safeWebsite = this.escapeXml(website);
        const safeFestival = this.escapeXml(festivalName);

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

            <!-- Background Canvas -->
            <rect width="${this.width}" height="${this.height}" fill="url(#festBg)" />
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
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • SECRECY</text>

                <!-- Top Right Trust Badge -->
                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="rgba(255, 255, 255, 0.08)" stroke="url(#goldGradient)" stroke-width="1.5" />
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="800" fill="#FFF" text-anchor="middle" letter-spacing="0.5">TRUSTED REAL ESTATE ADVISOR</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFD700" text-anchor="middle">SINCE 1996 • KURUKSHETRA</text>
                </g>
            </g>

            <!-- FESTIVAL BADGE (Y: 205) -->
            <g transform="translate(540, 205)">
                <rect x="-220" y="0" width="440" height="44" rx="22" fill="rgba(212, 175, 55, 0.18)" stroke="url(#goldGradient)" stroke-width="1.8" filter="url(#festDropShadow)"/>
                <text x="0" y="28" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="800" fill="#FFD700" text-anchor="middle" letter-spacing="2.5">✦ शुभ दीपावली एवं धनतेरस महोत्सव ✦</text>
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
                    <text x="28" y="-3" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#FFFFFF">100% Clear Registry</text>
                    <text x="28" y="15" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="500" fill="#94A3B8">Verified Land Records</text>
                </g>

                <g transform="translate(0, 78)">
                    <circle cx="0" cy="0" r="16" fill="#2563EB" />
                    <text x="0" y="6" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="28" y="-3" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#FFFFFF">HUDA &amp; TCP Approved</text>
                    <text x="28" y="15" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="500" fill="#94A3B8">Prime Sectors Kurukshetra</text>
                </g>

                <g transform="translate(320, 78)">
                    <circle cx="0" cy="0" r="16" fill="#D97706" />
                    <text x="0" y="6" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="28" y="-3" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#FFFFFF">Instant Bank Loan</text>
                    <text x="28" y="15" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="500" fill="#94A3B8">Leading Nationalized Banks</text>
                </g>
            </g>

            <!-- STANDARDIZED BRAND BOTTOM FOOTER (Y: 915) -->
            <g transform="translate(60, 915)">
                <rect x="0" y="0" width="960" height="110" rx="20" fill="#FFFFFF" filter="url(#festDropShadow)" />
                <rect x="0" y="0" width="960" height="5" rx="2.5" fill="#C1121F" />

                <!-- Left: Phone -->
                <g transform="translate(40, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#C1121F" letter-spacing="1">BOOK SITE VISIT / INQUIRY</text>
                    <text x="0" y="26" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#0B2545" letter-spacing="0.5">📞 ${safePhone}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="600" fill="#475569">Direct Discussion • Transparent Deal</text>
                </g>

                <line x1="490" y1="20" x2="490" y2="90" stroke="#E2E8F0" stroke-width="1.5" />

                <!-- Right: Address & Web -->
                <g transform="translate(520, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#2563EB" letter-spacing="1">HEAD OFFICE</text>
                    <text x="0" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#1E293B">📍 ${safeAddress}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#0B2545">🌐 ${safeWebsite}  |  f @bharatproperties570</text>
                </g>
            </g>
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));

        // Add brand logo
        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite([
                { input: logo, left: 68, top: 61 }
            ]);
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

        const unitNo = deal.unitNo || deal.name || deal.title || 'Prime Plot';
        const projName = deal.projectName?.name || deal.projectName || 'Prime Location';
        const loc = deal.location || deal.locCity || 'Kurukshetra, Haryana';
        const size = deal.sizeLabel || (deal.size ? `${deal.size} ${deal.sizeUnit || 'sq.yd'}` : '10 Marla (250 sq.yd)');
        const priceStr = deal.price ? `₹${Number(deal.price).toLocaleString('en-IN')}` : 'Best Offer';

        const facingRoad = [deal.facing ? `${deal.facing} Facing` : null, deal.roadWidth ? `${deal.roadWidth} Road` : null].filter(Boolean).join(' • ') || 'Wide Road Access • Green Belt';
        const safeHeadline = this.escapeXml(`${unitNo.toUpperCase()} AVAILABLE FOR SALE`);
        const safeSub = this.escapeXml(`At ${projName}, ${loc}`);
        const safePhone = this.escapeXml(phone);
        const safeAddress = this.escapeXml(address);
        const safeWebsite = this.escapeXml(website);
        const safePrice = this.escapeXml(priceStr);
        const safeSize = this.escapeXml(size);
        const safeFacingRoad = this.escapeXml(facingRoad);
        const safePill2Title = this.escapeXml(deal.facing ? `${deal.facing} Facing` : 'HUDA Approved');
        const safePill2Sub = this.escapeXml(deal.roadWidth ? `${deal.roadWidth} Road` : 'Planned Sector');
        const safePill2Desc = this.escapeXml(deal.dimensions ? `Dim: ${deal.dimensions}` : 'Sewer, Water, Power');

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
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • SECRECY</text>

                <!-- Top Right Badge -->
                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="#C1121F" filter="url(#propShadow)"/>
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="900" fill="#FFF" text-anchor="middle" letter-spacing="1">VERIFIED PROPERTY DEAL</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFF2A3" text-anchor="middle">100% REGISTRY GUARANTEE</text>
                </g>
            </g>

            <!-- PROMINENT HEADLINE (Y: 220) -->
            <g transform="translate(540, 240)">
                <!-- Flash Badge -->
                <rect x="-180" y="-35" width="360" height="36" rx="18" fill="#FFB703" filter="url(#propShadow)"/>
                <text x="0" y="-11" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="900" fill="#0B2545" text-anchor="middle" letter-spacing="2">★ PRIME INVESTMENT OPPORTUNITY</text>

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
                <!-- Photo Background Frame -->
                <rect x="0" y="0" width="960" height="375" rx="24" fill="#1E293B" stroke="url(#goldPillProp)" stroke-width="2" filter="url(#propShadow)" />
                
                <!-- Inner Architectural Mockup -->
                <rect x="10" y="10" width="940" height="355" rx="18" fill="#0F172A" />
                
                <!-- Modern Visual Accents -->
                <circle cx="480" cy="180" r="140" fill="rgba(37, 99, 235, 0.15)" />
                <text x="480" y="170" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="32" font-weight="900" fill="#FFFFFF" text-anchor="middle">
                    READY POSSESSION &amp; DIRECT REGISTRY
                </text>
                <text x="480" y="210" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="600" fill="#94A3B8" text-anchor="middle">
                    ${safeFacingRoad}
                </text>

                <!-- Floating Price Tag on Photo -->
                <g transform="translate(40, 40)">
                    <rect x="0" y="0" width="260" height="64" rx="16" fill="#C1121F" filter="url(#propShadow)" />
                    <text x="20" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#FFD700" letter-spacing="1">PRICE / EXPECTATION</text>
                    <text x="20" y="50" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF">${safePrice}</text>
                </g>

                <!-- Floating Size Tag on Photo -->
                <g transform="translate(660, 40)">
                    <rect x="0" y="0" width="260" height="64" rx="16" fill="#0B2545" stroke="#2563EB" stroke-width="1.5" filter="url(#propShadow)" />
                    <text x="20" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#94A3B8" letter-spacing="1">PLOT / CARPET SIZE</text>
                    <text x="20" y="50" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFD700">${safeSize}</text>
                </g>
            </g>

            <!-- 4 FEATURE HIGHLIGHT PILLS (Y: 745) -->
            <g transform="translate(60, 745)">
                <!-- Pill 1 -->
                <g transform="translate(0, 0)">
                    <rect x="0" y="0" width="225" height="130" rx="16" fill="#0B2545" stroke="rgba(255, 215, 0, 0.4)" stroke-width="1.2" filter="url(#propShadow)"/>
                    <circle cx="35" cy="40" r="18" fill="#059669" />
                    <text x="35" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="65" y="38" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="800" fill="#FFF">100% Clear Title</text>
                    <text x="65" y="54" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#94A3B8">Verified Registry</text>
                    <text x="20" y="95" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#E2E8F0">Zero Encumbrance</text>
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
                    <text x="65" y="38" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="800" fill="#FFF">Bank Loan</text>
                    <text x="65" y="54" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#94A3B8">SBI / HDFC / PNB</text>
                    <text x="20" y="95" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#E2E8F0">Instant Sanction</text>
                </g>

                <!-- Pill 4 -->
                <g transform="translate(735, 0)">
                    <rect x="0" y="0" width="225" height="130" rx="16" fill="#0B2545" stroke="rgba(255, 215, 0, 0.4)" stroke-width="1.2" filter="url(#propShadow)"/>
                    <circle cx="35" cy="40" r="18" fill="#7C3AED" />
                    <text x="35" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#FFF" text-anchor="middle">✓</text>
                    <text x="65" y="38" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="800" fill="#FFF">Direct Meeting</text>
                    <text x="65" y="54" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="500" fill="#94A3B8">Face-to-Face</text>
                    <text x="20" y="95" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#E2E8F0">With Real Owner</text>
                </g>
            </g>

            <!-- BOTTOM FOOTER STRIP (Y: 915) -->
            <g transform="translate(60, 915)">
                <rect x="0" y="0" width="960" height="110" rx="20" fill="#FFFFFF" filter="url(#propShadow)" />
                <rect x="0" y="0" width="960" height="5" rx="2.5" fill="#C1121F" />

                <!-- Left Column -->
                <g transform="translate(40, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#C1121F" letter-spacing="1">BOOK SITE VISIT / INQUIRY</text>
                    <text x="0" y="26" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#0B2545" letter-spacing="0.5">TEL: ${safePhone}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="600" fill="#475569">Direct Discussion • Transparent Deal</text>
                </g>

                <line x1="490" y1="20" x2="490" y2="90" stroke="#E2E8F0" stroke-width="1.5" />

                <!-- Right Column -->
                <g transform="translate(520, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#2563EB" letter-spacing="1">HEAD OFFICE</text>
                    <text x="0" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#1E293B">${safeAddress}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#0B2545">${safeWebsite}  |  fb: @bharatproperties570</text>
                </g>
            </g>
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));

        // Add brand logo
        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite([
                { input: logo, left: 68, top: 46 }
            ]);
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
        const points = edu.points || [
            'Verify Jamabandi & Mutation (Intkal) with Tehsil records',
            'Confirm TCP Approval & HUDA Master Plan Zoning',
            'Obtain No Dues Certificate (NDC) to prevent legacy municipal liabilities'
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
                    <stop offset="0%" stop-color="#0F172A" />
                    <stop offset="50%" stop-color="#1E293B" />
                    <stop offset="100%" stop-color="#0B2545" />
                </linearGradient>
                <filter id="eduShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
                </filter>
            </defs>

            <rect width="${this.width}" height="${this.height}" fill="url(#eduBg)" />

            <!-- Header -->
            <g transform="translate(60, 45)">
                <rect x="0" y="0" width="320" height="78" rx="39" fill="#FFFFFF" filter="url(#eduShadow)" />
                <text x="85" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#0B2545" letter-spacing="1">BHARAT</text>
                <text x="175" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#C1121F" letter-spacing="1">PROPERTIES</text>
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • SECRECY</text>

                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="#2563EB" filter="url(#eduShadow)"/>
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="900" fill="#FFF" text-anchor="middle" letter-spacing="1">KNOWLEDGE SERIES</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFF2A3" text-anchor="middle">BUYER ADVISORY DESK</text>
                </g>
            </g>

            <!-- Headline -->
            <g transform="translate(540, 185)">
                <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="800" fill="#FFB703" text-anchor="middle" letter-spacing="2">📚 REAL ESTATE LEGAL ADVISORY</text>
                <text x="0" y="45" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="40" font-weight="900" fill="#FFFFFF" text-anchor="middle" filter="url(#eduShadow)">
                    ${safeTitle}
                </text>
                <text x="0" y="85" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="600" fill="#94A3B8" text-anchor="middle">
                    ${safeHook}
                </text>
            </g>

            <!-- 3 Educational Cards -->
            <g transform="translate(100, 330)">
                ${points.slice(0, 3).map((p, idx) => `
                <g transform="translate(0, ${idx * 165})">
                    <rect x="0" y="0" width="880" height="135" rx="18" fill="rgba(30, 41, 59, 0.9)" stroke="#38BDF8" stroke-width="1.5" filter="url(#eduShadow)"/>
                    <circle cx="50" cy="67" r="28" fill="#2563EB" />
                    <text x="50" y="77" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="900" fill="#FFFFFF" text-anchor="middle">${idx + 1}</text>
                    <text x="105" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="800" fill="#FFD700">STEP ${idx + 1}</text>
                    <text x="105" y="85" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="600" fill="#FFFFFF">${this.escapeXml(p)}</text>
                </g>
                `).join('')}
            </g>

            <!-- Footer Strip -->
            <g transform="translate(60, 915)">
                <rect x="0" y="0" width="960" height="110" rx="20" fill="#FFFFFF" filter="url(#eduShadow)" />
                <rect x="0" y="0" width="960" height="5" rx="2.5" fill="#C1121F" />
                <g transform="translate(40, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#C1121F" letter-spacing="1">FREE LEGAL VERIFICATION</text>
                    <text x="0" y="26" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#0B2545" letter-spacing="0.5">📞 ${safePhone}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="600" fill="#475569">Senior Legal &amp; Property Advisors</text>
                </g>
                <line x1="490" y1="20" x2="490" y2="90" stroke="#E2E8F0" stroke-width="1.5" />
                <g transform="translate(520, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#2563EB" letter-spacing="1">HEAD OFFICE</text>
                    <text x="0" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#1E293B">📍 ${safeAddress}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#0B2545">🌐 ${safeWebsite}  |  f @bharatproperties570</text>
                </g>
            </g>
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));
        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite([
                { input: logo, left: 68, top: 51 }
            ]);
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

        const title = trust.title || '30+ Years of Verified Trust in Kurukshetra';
        const hook = trust.hook || 'Why Hundreds of Families Trust Bharat Properties';
        const badge = trust.badge || 'Direct Owner Meetings • Zero Hidden Charges';

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
                    <stop offset="0%" stop-color="#0B2545" />
                    <stop offset="60%" stop-color="#134074" />
                    <stop offset="100%" stop-color="#001220" />
                </linearGradient>
                <linearGradient id="goldPillTrust" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#D4AF37" />
                    <stop offset="50%" stop-color="#FFF2A3" />
                    <stop offset="100%" stop-color="#D4AF37" />
                </linearGradient>
                <filter id="trustShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
                </filter>
            </defs>

            <rect width="${this.width}" height="${this.height}" fill="url(#trustBg)" />

            <!-- Header -->
            <g transform="translate(60, 45)">
                <rect x="0" y="0" width="320" height="78" rx="39" fill="#FFFFFF" filter="url(#trustShadow)" />
                <text x="85" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#0B2545" letter-spacing="1">BHARAT</text>
                <text x="175" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="900" fill="#C1121F" letter-spacing="1">PROPERTIES</text>
                <text x="85" y="55" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="10" font-weight="700" fill="#555555" letter-spacing="1">HONESTY • TRANSPARENCY • SECRECY</text>

                <g transform="translate(640, 0)">
                    <rect x="0" y="8" width="320" height="62" rx="31" fill="rgba(255, 255, 255, 0.12)" stroke="url(#goldPillTrust)" stroke-width="1.5" />
                    <text x="160" y="34" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="800" fill="#FFF" text-anchor="middle" letter-spacing="0.5">ESTABLISHED 1996</text>
                    <text x="160" y="52" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11.5" font-weight="700" fill="#FFD700" text-anchor="middle">KURUKSHETRA REAL ESTATE</text>
                </g>
            </g>

            <!-- Main Headline -->
            <g transform="translate(540, 210)">
                <rect x="-180" y="-30" width="360" height="36" rx="18" fill="#FFB703" filter="url(#trustShadow)"/>
                <text x="0" y="-7" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="900" fill="#0B2545" text-anchor="middle" letter-spacing="2">🏛️ THE BHARAT PROPERTIES STANDARD</text>

                <text x="0" y="50" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="900" fill="#FFFFFF" text-anchor="middle" filter="url(#trustShadow)">
                    ${safeTitle}
                </text>
                <text x="0" y="90" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="600" fill="#E2E8F0" text-anchor="middle">
                    ${safeHook}
                </text>
            </g>

            <!-- 3 Trust Pillars Box -->
            <g transform="translate(100, 360)">
                <!-- Card 1 -->
                <rect x="0" y="0" width="880" height="135" rx="18" fill="rgba(11, 37, 69, 0.9)" stroke="url(#goldPillTrust)" stroke-width="1.5" filter="url(#trustShadow)"/>
                <text x="40" y="45" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFD700">🤝 100% DIRECT OWNER MEETINGS</text>
                <text x="40" y="80" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="500" fill="#FFFFFF">No middlemen, no undisclosed markups. Direct negotiations with registered owners.</text>

                <!-- Card 2 -->
                <g transform="translate(0, 160)">
                    <rect x="0" y="0" width="880" height="135" rx="18" fill="rgba(11, 37, 69, 0.9)" stroke="url(#goldPillTrust)" stroke-width="1.5" filter="url(#trustShadow)"/>
                    <text x="40" y="45" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFD700">📜 COMPLETE TITLE &amp; TEHSIL VERIFICATION</text>
                    <text x="40" y="80" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="500" fill="#FFFFFF">Every property is vetted for clear registry, mutation, and zero municipal liabilities.</text>
                </g>

                <!-- Card 3 -->
                <g transform="translate(0, 320)">
                    <rect x="0" y="0" width="880" height="135" rx="18" fill="rgba(11, 37, 69, 0.9)" stroke="url(#goldPillTrust)" stroke-width="1.5" filter="url(#trustShadow)"/>
                    <text x="40" y="45" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#FFD700">🛡️ PRIVACY &amp; PROFESSIONAL SECRECY</text>
                    <text x="40" y="80" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="500" fill="#FFFFFF">High-value transactions handled with strict confidentiality and discretion.</text>
                </g>
            </g>

            <!-- Footer Strip -->
            <g transform="translate(60, 915)">
                <rect x="0" y="0" width="960" height="110" rx="20" fill="#FFFFFF" filter="url(#trustShadow)" />
                <rect x="0" y="0" width="960" height="5" rx="2.5" fill="#C1121F" />
                <g transform="translate(40, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#C1121F" letter-spacing="1">EXPERIENCE TRANSPARENCY</text>
                    <text x="0" y="26" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="900" fill="#0B2545" letter-spacing="0.5">📞 ${safePhone}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="600" fill="#475569">Trusted by Thousands in Haryana</text>
                </g>
                <line x1="490" y1="20" x2="490" y2="90" stroke="#E2E8F0" stroke-width="1.5" />
                <g transform="translate(520, 42)">
                    <text x="0" y="0" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#2563EB" letter-spacing="1">HEAD OFFICE</text>
                    <text x="0" y="24" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14.5" font-weight="800" fill="#1E293B">📍 ${safeAddress}</text>
                    <text x="0" y="46" font-family="Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#0B2545">🌐 ${safeWebsite}  |  f @bharatproperties570</text>
                </g>
            </g>
        </svg>
        `;

        let compositeInstance = sharp(Buffer.from(svg));
        const logo = await this.getLogoBuffer(66, 66);
        if (logo) {
            compositeInstance = sharp(await compositeInstance.png().toBuffer()).composite([
                { input: logo, left: 68, top: 51 }
            ]);
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
