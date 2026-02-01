/**
 * World-Class Real Estate Deal Parser 🌍
 * 
 * Hierarchy of Extraction:
 * 1. City & Location (Context)
 * 2. Unit Number (Precise ID)
 * 3. Property Category (Res/Comm/Ind)
 * 4. Property Type (Plot/Flat/Showroom)
 * 5. Size (Standardized)
 * 6. Price (Normalized)
 * 7. Contact Info
 * 8. Intent (Strict Buyer vs Seller)
 */

import { contactData } from '../data/mockData';

// --- REGEX PATTERNS ---

const PATTERNS = {
    // 1. Geography
    CITY: /(chandigarh|mohali|zirakpur|panchkula|kharar|new chandigarh|derabassi)/i,
    LOCATION: /(?:sector|sec|sec-|sector-)\s?(\d+[a-z]?)|(aerocity)|(it city)|(eco city)|(jlpl)|(tdp)|(bestech)|(homeland)|(marbella)/i,

    // 2. Unit
    // Improved to match: "Plot No 123", "SCO No 12", "House No 55", "#123", "Unit 123"
    // User Requirement: "Plot No", "SCO No", "House No", "DSS No" followed by number is High Priority
    UNIT_STRICT: /(?:plot|sco|dss|house|shop|booth|flat|scf)\s+(?:no\.?|number|#)\s*[:\-\s]?\s*([a-z0-9-]{1,10})\b/i,
    UNIT_GENERIC: /(?:unit|no\.?|#)\s?[-:]?\s?([a-z0-9-]{1,8})\b/i,

    // 3. Size
    // Matches: 1 Kanal, 10 Marla, 250 Sqyd, 500 Gaz, 1500 Sqft
    SIZE: /(\d+(\.\d+)?)\s?(kanal|marla|gaz|sqyd|sq\s?yd|sqft|sq\s?ft|bigha|acre)/i,

    // 4. Price
    // Matches: 1.5 Cr, 90 Lac, 90L, 1.25 C
    PRICE: /(\d+(\.\d+)?)\s?(cr|crore|c\b|lac|lakh|l\b)/i,

    // 5. Structure / Type
    BHK: /(\d)\s?bhk/i,
    TYPE_KEYWORDS: {
        'Plot': ['plot', 'land', 'gaz', 'sqyd', 'kanal', 'marla'],
        'Flat': ['flat', 'apartment', 'bhk', 'penthouse', 'floor'],
        'Commercial': ['shop', 'showroom', 'booth', 'sco', 'dss', 'office', 'bay', 'scf'],
        'Villa': ['villa', 'kothi', 'independent house', 'bungalow', 'house']
    }
};

// --- HELPER FUNCTIONS ---

const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const extractCity = (text) => {
    const match = text.match(PATTERNS.CITY);
    return match ? match[0].toUpperCase() : null; // Default to null, or 'Tricity' if strict
};

const extractLocation = (text) => {
    const match = text.match(PATTERNS.LOCATION);
    if (!match) return null;

    // Sector Case
    if (match[1]) return `Sector ${match[1].toUpperCase()}`;

    // Named Locations
    return match[0].replace(/\b\w/g, c => c.toUpperCase());
};

const extractUnit = (text) => {
    // Priority 1: Strict Category + No match (e.g. "Plot No 123")
    const strictMatch = text.match(PATTERNS.UNIT_STRICT);
    if (strictMatch && strictMatch[1]) {
        return strictMatch[1].toUpperCase();
    }

    // Priority 2: Generic "#123" or "Unit 123"
    const genericMatch = text.match(PATTERNS.UNIT_GENERIC);
    if (genericMatch && genericMatch[1]) {
        return genericMatch[1].toUpperCase();
    }

    return null;
};

const extractSize = (text) => {
    const match = text.match(PATTERNS.SIZE);
    if (match) {
        return `${match[1]} ${match[3].replace(/\b\w/g, c => c.toUpperCase())}`;
    }
    return null;
};

const extractPrice = (text) => {
    const match = text.match(PATTERNS.PRICE);
    if (match) {
        let amount = parseFloat(match[1]);
        let unit = match[3].toLowerCase();

        // Normalize Unit
        if (unit.startsWith('c')) return `${amount} Cr`;
        if (unit.startsWith('l')) return `${amount} Lac`;
    }
    return null;
};

const determineCategoryType = (text) => {
    let type = 'Unknown';
    let category = 'Residential'; // Default

    // check BHK first (Strong Indicator)
    const bhkMatch = text.match(PATTERNS.BHK);
    if (bhkMatch) return { category: 'Residential', type: `${bhkMatch[1]} BHK Flat` };

    // Check Keywords
    for (const [key, words] of Object.entries(PATTERNS.TYPE_KEYWORDS)) {
        if (words.some(w => text.includes(w))) {
            type = key;
            if (key === 'Commercial') category = 'Commercial';
            break;
        }
    }

    return { category, type };
};

const extractContacts = (text) => {
    const phoneRegex = /[6-9]\d{9}/g;
    const matches = text.match(phoneRegex) || [];

    return matches.map(phone => {
        // Check local DB
        const existing = contactData.find(c => c.mobile === phone);
        return {
            mobile: phone,
            name: existing?.name || 'Unknown',
            role: existing?.role || (existing?.category === 'Broker' ? 'Broker' : 'New Contact'),
            isDbMatch: !!existing
        };
    });
};

const determineIntent = (text) => {
    const t = text.toLowerCase();

    // 1. Strict Exclusion Criteria for Buyer
    const buyerKeywords = ['want', 'need', 'require', 'looking for', 'urgent', 'buy', 'budget'];
    const sellerKeywords = ['available', 'sale', 'sell', 'inventory', 'offer', 'hot', 'fresh', 'resale', 'booking'];

    let buyerScore = 0;
    let sellerScore = 0;

    buyerKeywords.forEach(w => { if (t.includes(w)) buyerScore++; });
    sellerKeywords.forEach(w => { if (t.includes(w)) sellerScore++; });

    // Contextual Overrides
    if (t.includes('want to sell')) return 'SELLER';
    if (t.includes('available for rent')) return 'LANDLORD';
    if (t.includes('want to rent')) return 'TENANT';

    if (buyerScore > sellerScore) return 'BUYER';
    if (sellerScore > buyerScore) return 'SELLER';

    // Default Fallback
    return 'SELLER'; // Most shared messages in groups are inventory
};

// --- MAIN PARSER ---

export const parseDealContent = (originalText) => {
    if (!originalText) return null;
    const text = normalizeText(originalText);

    // 1. Core Extraction
    const city = extractCity(text);
    const location = extractLocation(text);
    const unit = extractUnit(text);
    const { category, type } = determineCategoryType(text);
    const size = extractSize(text);
    const price = extractPrice(text);

    // 2. Contacts
    const contacts = extractContacts(originalText); // Use original for preservation
    const primaryContact = contacts.length > 0 ? contacts[0] : null;

    // 3. Intent
    const intent = determineIntent(text);

    return {
        // Structured Data Object
        intent,
        category,
        type,
        location: location || city || 'Unspecified',
        address: {
            city: city,
            sector: location,
            unitNumber: unit
        },
        specs: {
            size,
            price
        },
        contact: primaryContact,
        allContacts: contacts,

        // Metadata for UI
        raw: originalText,
        confidence: location ? 'High' : 'Low'
    };
};
