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
    LOCATION: /(?:sector|sec|sec-|sector-)\s?(\d+[a-z]?)|(aerocity|aero city)|(it city)|(eco city)|(jlpl)|(tdp)|(bestech)|(homeland)|(marbella)|(green lotus)|(escon arena)/i,

    // 2. Unit
    // Improved to match: "Plot No 123", "SCO No 12", "House No 55", "#123", "Unit 123", "*101*"
    // Also matches implicit: "SCO 55", "Plot 123" (Must have digit to avoid "Plot in sec 82")
    UNIT_EXPLICIT: /\*?(?:plot|sco|dss|house|shop|booth|flat|scf)\s+(?:no\.?|number|#)\s*[:\-\s]?\s*([a-z0-9-]{1,10})\*?/i,
    UNIT_IMPLICIT: /\*?(?:plot|sco|dss|house|shop|booth|flat|scf)\s+([a-z0-9-]*\d+[a-z0-9-]*)\*?/i,
    UNIT_GENERIC: /\*?(?:unit|no\.?|#)\s?[-:]?\s?([a-z0-9-]{1,8})\*?/i,
    UNIT_RAW_ASTERISK: /\*([a-z0-9-]{1,8})\*/i, // Matches *101* explicitly if no other context

    // 3. Size
    // Matches: 1 Kanal, 10 Marla, 250 Sqyd, 500 Gaz, 1500 Sqft
    SIZE: /(\d+(\.\d+)?)\s?(kanal|marla|gaz|sqyd|sq\s?yd|sqft|sq\s?ft|bigha|acre)/i,

    // 4. Price
    // Matches: 1.5 Cr, 90 Lac, 90L, 1.25 C
    PRICE: /(\d+(\.\d+)?)\s?(cr|crore|c\b|lac|lakh|l\b|k\b|thousand)/i,

    // 5. Structure / Type
    BHK: /(\d)\s?bhk/i,
    TYPE_KEYWORDS: {
        'Residential': ['flat', 'apartment', 'bhk', 'penthouse', 'floor', 'builder floor', 'studio', 'duplex', 'simplex', 'villa', 'kothi', 'house', 'independent house', 'bungalow', 'mansion', 'residence', 'plot', 'land', 'gaz', 'sqyd', 'kanal', 'marla', 'bigha', 'acre'],
        'Commercial': ['shop', 'showroom', 'booth', 'sco', 'scf', 'dss', 'bay shop', 'double storey', 'office', 'office space', 'retail', 'anchor store', 'food court', 'multiplex', 'hotel', 'restaurant', 'pub', 'bar', 'club', 'resort', 'commercial plot', 'commercial land', 'plaza', 'mall'],
        'Industrial': ['factory', 'shed', 'warehouse', 'godown', 'storage', 'cold storage', 'industrial plot', 'industrial land', 'industrial shed', 'plant', 'manufacturing unit', 'industry'],
        'Agricultural': ['farm', 'farm land', 'agricultural land', 'agriculture', 'khet', 'zameen', 'jameen', 'vadi', 'farmhouse', 'orchard', 'nursery'],
        'Institutional': ['school', 'college', 'university', 'campus', 'institute', 'coaching centre', 'education', 'hospital', 'nursing home', 'clinic', 'dispensary', 'labs', 'pathology', 'institutional plot', 'religious', 'temple', 'mandir', 'gurudwara', 'church']
    }
};

// --- HELPER FUNCTIONS ---

const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

// Extraction helpers now return { value, match } to allow stripping from text
const extractCity = (text) => {
    const match = text.match(PATTERNS.CITY);
    return match ? { value: match[0].toUpperCase(), match: match[0] } : null;
};

const extractLocation = (text) => {
    const match = text.match(PATTERNS.LOCATION);
    if (!match) return null;

    let value;
    if (match[1]) value = `Sector ${match[1].toUpperCase()}`;
    else value = match[0].replace(/\b\w/g, c => c.toUpperCase());

    return { value, match: match[0] };
};

const extractUnit = (text) => {
    // Priority 1: Explicit "Plot No 123"
    const explicitMatch = text.match(PATTERNS.UNIT_EXPLICIT);
    if (explicitMatch && explicitMatch[1]) {
        return { value: explicitMatch[1].toUpperCase(), match: explicitMatch[0] };
    }

    // Priority 2: Implicit "SCO 55" (Must have digit)
    const implicitMatch = text.match(PATTERNS.UNIT_IMPLICIT);
    if (implicitMatch && implicitMatch[1]) {
        return { value: implicitMatch[1].toUpperCase(), match: implicitMatch[0] };
    }

    // Priority 3: Generic "#123" or "Unit 123"
    const genericMatch = text.match(PATTERNS.UNIT_GENERIC);
    if (genericMatch && genericMatch[1]) {
        return { value: genericMatch[1].toUpperCase(), match: genericMatch[0] };
    }

    return null;
};

const extractSize = (text) => {
    const match = text.match(PATTERNS.SIZE);
    if (match) {
        return {
            value: `${match[1]} ${match[3].replace(/\b\w/g, c => c.toUpperCase())}`,
            match: match[0]
        };
    }
    return null;
};

const extractPrice = (text) => {
    const match = text.match(PATTERNS.PRICE);
    if (match) {
        let amount = parseFloat(match[1]);
        let unit = match[3].toLowerCase();

        let value;
        if (unit.startsWith('c')) value = `${amount} Cr`;
        else if (unit.startsWith('l')) value = `${amount} Lac`;
        else if (unit.startsWith('k') || unit.startsWith('t')) value = `${(amount / 100).toFixed(2)} Lac`; // 50k -> 0.50 Lac
        else value = match[0]; // fallback

        return { value, match: match[0] };
    }
    return null;
};

const determineCategoryType = (text, customPatterns = null) => {
    let type = 'Unknown';
    let category = 'Residential'; // Default
    let matchString = '';

    // check BHK first (Strong Indicator)
    const bhkMatch = text.match(PATTERNS.BHK);
    if (bhkMatch) {
        return {
            category: 'Residential',
            type: `${bhkMatch[1]} BHK Flat`,
            match: bhkMatch[0]
        };
    }

    const keywordsMap = (customPatterns && customPatterns.TYPE_KEYWORDS) ? customPatterns.TYPE_KEYWORDS : PATTERNS.TYPE_KEYWORDS;

    // Flatten all keywords with their category info
    const allKeywords = [];
    for (const [catName, words] of Object.entries(keywordsMap)) {
        words.forEach(w => {
            allKeywords.push({ word: normalizeText(w), category: catName });
        });
    }

    // Sort by length descending to prioritize more specific terms (e.g. "industrial plot" over "plot")
    const sortedKeywords = allKeywords.sort((a, b) => b.word.length - a.word.length);

    const foundMatch = sortedKeywords.find(kw => text.includes(kw.word));

    if (foundMatch) {
        type = foundMatch.word.replace(/\b\w/g, c => c.toUpperCase());
        category = foundMatch.category;
        matchString = foundMatch.word;
    }

    return { category, type, match: matchString };
};

const extractContacts = (text) => {
    // Robust Extraction Strategy:
    // 1. First, replace all distinctive separators with spaces to break "blobs"
    //    Separators: Hyphens between digits, Asterisks, slashes, etc.
    //    We want: "7508193747-9876223747" -> "7508193747 9876223747"

    // Replace * and / and - with spaces, BUT only if they are likely separators.
    // Simplifying: Just replace all non-digit, non-plus characters with spaces?
    // Doing so preserves digits. 
    // Example: "Call *7508193747-98762237* now" -> "Call  7508193747 98762237  now"

    const tokenizedText = text.replace(/[^0-9+]/g, ' ');

    // Now we have a string of space-separated tokens.
    // Scan for tokens that look like Indian mobile numbers.
    // Valid formats: +919876543210, 919876543210, 09876543210, 9876543210

    const potentialNumbers = tokenizedText.split(/\s+/);

    const matches = [];

    potentialNumbers.forEach(token => {
        if (!token) return;

        let cleaner = token;

        // Check for +91 or 91 prefix
        if (cleaner.startsWith('+91')) {
            cleaner = cleaner.substring(3);
        } else if (cleaner.startsWith('91') && cleaner.length === 12) {
            // Only strip 91 if length becomes 10 match
            // This runs risk of 9198... being a real number starting with 91, but unlikely in India context for this use case
            cleaner = cleaner.substring(2);
        } else if (cleaner.startsWith('0') && cleaner.length === 11) {
            cleaner = cleaner.substring(1);
        }

        // Validation: Must be 10 digits and start with 6-9
        if (cleaner.length === 10 && /^[6-9]\d{9}$/.test(cleaner)) {
            matches.push(cleaner);
        }
    });

    // Dedup
    const uniquePhones = [...new Set(matches)];

    return uniquePhones.map(phone => {
        // Check local DB
        // Also check if phone exists in 'phones' array of contact
        const existing = contactData.find(c =>
            c.mobile === phone ||
            (c.phones && c.phones.some(p => p.number === phone || p.number.slice(-10) === phone))
        );

        return {
            mobile: phone,
            name: existing?.name || 'Unknown', // Keep Unknown so we can prompt add
            role: existing?.role || (existing?.category === 'Broker' ? 'Broker' : 'New Contact'),
            id: existing?.id,
            category: existing?.category,
            isDbMatch: !!existing,
            isNew: !existing // Explicitly set isNew
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

// --- SPLITTER UTILS ---

export const splitIntakeMessage = (text, customPatterns = null) => {
    if (!text) return [];

    // Strategy 1: Numbered Lists (e.g. "1. Deal one\n2. Deal two")
    // Needs to look for "Digit + Dot/Paren + Space" at start of line
    const numberedListRegex = /(?:\r\n|\r|\n|^)\s*\d+[.)]\s+/g;

    // Strategy 2: Double Newlines (gap between paragraphs)
    const doubleNewlineRegex = /\n\s*\n/;

    let segments = [];

    // Check for Numbered List
    const hasNumberedList = numberedListRegex.test(text);

    if (hasNumberedList) {
        // Split by the regex, but we need to keep the content. 
        // We add a delimiter and then split.
        const markedText = text.replace(numberedListRegex, (match) => `|SPLIT|${match}`);
        segments = markedText.split('|SPLIT|');
    } else if (doubleNewlineRegex.test(text)) {
        // Double newline split
        segments = text.split(doubleNewlineRegex);
    } else {
        // Single block
        segments = [text];
    }

    // Clean Segments and Parse
    const parsedDeals = segments
        .map(s => {
            // Remove the numbering artifact (e.g. "1. ")
            return s.replace(/^\s*\d+[.)]\s+/, '').trim();
        })
        .filter(s => s.length > 10) // Min length matches
        .map(seg => parseDealContent(seg, customPatterns))
        .filter(deal => {
            // Filter out "Deals" that have NO extractable info (junk headers)
            // Keep if has significant data (Loc, Unit, Size, Price OR Type)
            const hasData = deal.location !== 'Unspecified' || deal.address.unitNumber || deal.specs.size || deal.specs.price || (deal.type && deal.type !== 'Unknown');
            return hasData;
        });

    return parsedDeals;
};


// --- MAIN PARSER ---

// --- MAIN PARSER ---

export const parseDealContent = (originalText, customPatterns = null) => {
    // If customPatterns provided, use them to override or augment PATTERNS
    // For now, we stick to PATTERNS but in future steps we will merge.
    // However, customPatterns logic should be:
    // 1. If custom pattern found -> extract.

    // NOTE: This function's implementation of 'consume' relies on regex matching from PATTERNS.
    // If we want to support dynamic city/location/type, we need to construct RegExp dynamically from the list.
    // That implementation will be done in the next step when we fully enable the Context.
    // For now, just accepting the arg to prevent breaking.

    if (!originalText) return null;
    if (!originalText) return null;
    let remainingText = originalText + ""; // Clone for consumption
    const textLower = normalizeText(originalText); // Read-only for detection

    // Helper to consume text (remove matched part)
    const consume = (matchString) => {
        if (!matchString) return;
        // Case-insensitive remove
        const regex = new RegExp(matchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        remainingText = remainingText.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
    };

    // 1. Core Extraction

    // City
    const cityResult = extractCity(textLower);
    if (cityResult) consume(cityResult.match);

    // Location
    const locResult = extractLocation(textLower);
    if (locResult) consume(locResult.match);

    // Unit
    const unitResult = extractUnit(originalText); // Use original for case sensitivity if needed, though regex handles it?
    // unitResult regexes are case insensitive but extraction logic returns UPPER. 
    // We should grep the original text again or use what we matched.
    // extractUnit returns { match: ... } which is the string found.
    if (unitResult) consume(unitResult.match);

    // Size
    const sizeResult = extractSize(originalText);
    if (sizeResult) consume(sizeResult.match);

    // Price
    // Note: User didn't strictly ask to move price to remarks, but standard practice is to extract it.
    // We will extract it but if the user *really* wants "everything else" in remarks, price should be extracted.
    // To support "other data" in remarks, we must consume standard data.
    const priceResult = extractPrice(originalText);
    if (priceResult) {
        consume(priceResult.match);
        // Also consume the label "Price" or "Rate" if it exists near the match? 
        // Simplistic approach: Remove "Price" or "Ask" keywords globally if price is found
        remainingText = remainingText.replace(/\b(price|rate|ask|demand)\b/gi, '').replace(/\s{2,}/g, ' ');
    }

    // Type/Category
    const catResult = determineCategoryType(textLower, customPatterns);
    if (catResult.match) consume(catResult.match);

    // 2. Contacts (Do NOT consume contacts, keep them for reference, or should we?)
    // Usually contacts are signatures. Let's consume specific phones.
    const contacts = extractContacts(originalText);
    contacts.forEach(c => consume(c.mobile));

    // 3. Intent
    const intent = determineIntent(textLower);

    // 4. Tags (Smart Tagging)
    const tags = determineTags(textLower);

    // 5. Remarks (Whatever is left)
    // Clean up punctuation leftovers
    let remarks = remainingText
        .replace(/^[,.\-\s]+/, '') // Leading junk
        .replace(/[,.\-\s]+$/, '') // Trailing junk
        .trim();

    return {
        // Structured Data Object
        intent,
        category: catResult.category,
        type: catResult.type,
        location: (locResult?.value || cityResult?.value) || 'Unspecified',
        address: {
            city: cityResult?.value || null,
            sector: locResult?.value || null,
            unitNumber: unitResult?.value || null,
            unitNo: unitResult?.value || null
        },
        specs: {
            size: sizeResult?.value || null,
            price: priceResult?.value || null
        },
        remarks: remarks || null, // The "Remainder" content
        contact: contacts.length > 0 ? { ...contacts[0], unitNo: unitResult?.value || null } : null,
        allContacts: contacts.map(c => ({ ...c, unitNo: unitResult?.value || null })),
        tags: tags, // New Smart Tags

        // Metadata for UI
        raw: originalText,
        confidence: locResult ? 'High' : 'Low'
    };
};

// --- SMART TAGGING ---
const determineTags = (text) => {
    const tags = [];

    // 1. Transaction Nature
    if (text.includes('direct') || text.includes('party') || text.includes('owner')) tags.push('DIRECT');
    if (text.includes('client in hand') || text.includes('cih')) tags.push('CIH');

    // 2. Inventory State
    if (text.includes('resale') || text.includes('secondary')) tags.push('RESALE');
    else if (text.includes('fresh') || text.includes('booking') || text.includes('launch') || text.includes('new')) tags.push('FRESH');

    // 3. Urgency
    if (text.includes('urgent') || text.includes('immediate') || text.includes('fire') || text.includes('hot')) tags.push('URGENT');

    // 4. Specific Features (Examples)
    if (text.includes('corner') || text.includes('park facing')) tags.push('PREMIUM');

    return tags;
};
