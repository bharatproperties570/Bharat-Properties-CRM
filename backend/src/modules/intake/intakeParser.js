import ParsingRule from '../parsing/parsingRule.model.js';

// --- DEFAULT PATTERNS (Fallback) ---
const DEFAULT_CITIES = ['Chandigarh', 'Mohali', 'Zirakpur', 'Panchkula', 'Kharar', 'New Chandigarh', 'Derabassi'];
const DEFAULT_LOCATIONS = ['Sector', 'Aerocity', 'IT City', 'Eco City', 'JLPL', 'TDP', 'Bestech', 'Homeland', 'Marbella', 'Green Lotus', 'Escon Arena'];
const DEFAULT_TYPES = {
    'Residential': ['flat', 'apartment', 'bhk', 'penthouse', 'floor', 'builder floor', 'studio', 'duplex', 'simplex', 'villa', 'kothi', 'house', 'independent house', 'bungalow', 'mansion', 'residence', 'plot', 'land', 'gaz', 'sqyd', 'kanal', 'marla', 'bigha', 'acre'],
    'Commercial': ['shop', 'showroom', 'booth', 'sco', 'scf', 'dss', 'bay shop', 'double storey', 'office', 'office space', 'retail', 'anchor store', 'food court', 'multiplex', 'hotel', 'restaurant', 'pub', 'bar', 'club', 'resort', 'commercial plot', 'commercial land', 'plaza', 'mall']
};

const GLOBAL_PATTERNS = {
    UNIT_EXPLICIT: /\*?(?:plot|sco|dss|house|shop|booth|flat|scf)\s+(?:no\.?|number|#)\s*[:\-\s]?\s*([a-z0-9-]{1,10})\*?/i,
    UNIT_IMPLICIT: /\*?(?:plot|sco|dss|house|shop|booth|flat|scf)\s+([a-z0-9-]*\d+[a-z0-9-]*)\*?/i,
    UNIT_GENERIC: /\*?(?:unit|no\.?|#)\s?[-:]?\s?([a-z0-9-]{1,8})\*?/i,
    UNIT_RAW_ASTERISK: /\*([a-z0-9-]{1,8})\*/i,
    SIZE: /(\d+(\.\d+)?)\s?(kanal|marla|gaz|sqyd|sq\s?yd|sqft|sq\s?ft|bigha|acre)/i,
    PRICE: /(\d+(\.\d+)?)\s?(cr|crore|c\b|lac|lakh|l\b|k\b|thousand)/i,
    BHK: /(\d)\s?bhk/i
};

/**
 * Fetches rules from DB and builds dynamic regex patterns
 */
export const getDynamicPatterns = async () => {
    try {
        const rules = await ParsingRule.find();
        
        const cities = rules.filter(r => r.type === 'CITY').map(r => r.value);
        const locations = rules.filter(r => r.type === 'LOCATION').map(r => r.value);
        
        const typesMap = { ...DEFAULT_TYPES };
        rules.filter(r => r.type === 'TYPE').forEach(r => {
            if (typesMap[r.category]) {
                if (!typesMap[r.category].includes(r.value)) {
                    typesMap[r.category].push(r.value);
                }
            } else {
                typesMap[r.category] = [r.value];
            }
        });

        const finalCities = cities.length > 0 ? cities : DEFAULT_CITIES;
        const finalLocs = locations.length > 0 ? locations : DEFAULT_LOCATIONS;

        const cityPattern = new RegExp(`(${finalCities.join('|')})`, 'i');
        const dynamicLocs = finalLocs.filter(l => l.toLowerCase() !== 'sector').join('|');
        const locPattern = new RegExp(`(?:sector|sec|sec-|sector-)\\s?(\\d+[a-z]?)|(${dynamicLocs})`, 'i');

        return {
            CITY: cityPattern,
            LOCATION: locPattern,
            TYPE_KEYWORDS: typesMap
        };
    } catch (error) {
        console.error("[IntakeParser:Rules Error]:", error);
        return null;
    }
};

/**
 * Main parser function
 */
export const parseContent = async (text) => {
    if (!text) return null;
    
    const patterns = await getDynamicPatterns() || {
        CITY: new RegExp(`(${DEFAULT_CITIES.join('|')})`, 'i'),
        LOCATION: new RegExp(`(?:sector|sec|sec-|sector-)\\s?(\\d+[a-z]?)|(${DEFAULT_LOCATIONS.join('|')})`, 'i'),
        TYPE_KEYWORDS: DEFAULT_TYPES
    };

    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // 1. Geography
    const cityMatch = text.match(patterns.CITY);
    const locMatch = text.match(patterns.LOCATION);
    
    // 2. Unit
    const unitMatch = text.match(GLOBAL_PATTERNS.UNIT_EXPLICIT) || 
                      text.match(GLOBAL_PATTERNS.UNIT_IMPLICIT) || 
                      text.match(GLOBAL_PATTERNS.UNIT_GENERIC);
    
    // 3. Price & Size
    const priceMatch = text.match(GLOBAL_PATTERNS.PRICE);
    const sizeMatch = text.match(GLOBAL_PATTERNS.SIZE);
    
    // 4. Intent
    const t = normalizedText;
    const isBuyer = /want|need|require|looking for|urgent|buy|budget/i.test(t) && !/available|sale|sell|inventory/i.test(t);
    const intent = isBuyer ? 'BUYER' : 'SELLER';

    // 5. Structure & Type
    let propertyType = 'Unknown';
    let propertyCategory = 'Residential';
    const bhkMatch = text.match(GLOBAL_PATTERNS.BHK);
    
    if (bhkMatch) {
        propertyType = `${bhkMatch[1]} BHK Flat`;
    } else {
        const allKeywords = [];
        for (const [cat, words] of Object.entries(patterns.TYPE_KEYWORDS)) {
            words.forEach(w => allKeywords.push({ word: w.toLowerCase(), cat }));
        }
        allKeywords.sort((a,b) => b.word.length - a.word.length);
        const found = allKeywords.find(kw => t.includes(kw.word));
        if (found) {
            propertyType = found.word.charAt(0).toUpperCase() + found.word.slice(1);
            propertyCategory = found.cat;
        }
    }

    // 6. Contact Extractions
    const contactRegex = /(?:\+91|91|0)?[6-9]\d{9}/g;
    const phones = [...new Set(text.match(contactRegex) || [])].map(p => p.slice(-10));

    return {
        intent,
        category: propertyCategory,
        type: propertyType,
        location: locMatch ? (locMatch[1] ? `Sector ${locMatch[1]}` : locMatch[2]) : (cityMatch ? cityMatch[0] : 'Unspecified'),
        address: {
            city: cityMatch ? cityMatch[0] : null,
            sector: locMatch ? (locMatch[1] || locMatch[2]) : null,
            unitNumber: unitMatch ? unitMatch[1] : null,
            unitNo: unitMatch ? unitMatch[1] : null
        },
        specs: {
            price: priceMatch ? priceMatch[0] : null,
            size: sizeMatch ? sizeMatch[0] : null
        },
        allContacts: phones.map(p => ({ mobile: p, name: 'Unknown' })), // Aligned with frontend
        raw: text.substring(0, 500) // Keep snippet
    };
};
