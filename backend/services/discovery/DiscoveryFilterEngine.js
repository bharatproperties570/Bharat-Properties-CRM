import cron from 'node-cron';
import { SUPPORTED_AREA_UNITS, SUPPORTED_SELLER_TYPES } from '../../models/DiscoveryConfig.js';

export { SUPPORTED_AREA_UNITS, SUPPORTED_SELLER_TYPES };

/**
 * ============================================================
 *  DISCOVERY FILTER & NORMALIZATION ENGINE (Phase 1 / Phase 1.1)
 *  Deterministic evaluation, URL sanitization, and unit conversions
 * ============================================================
 */

/**
 * Area unit conversion factors relative to square feet (sqft)
 * 
 * Standard Conversions:
 * - 1 sqyd = 9 sqft (exact standard)
 * - 1 acre = 4840 sqyd = 43560 sqft (exact international / Indian revenue standard)
 * 
 * Haryana HSVP / Urban Regional Standard:
 * - 1 marla = 25 sqyd = 225 sqft
 * - 1 kanal = 20 marlas = 500 sqyd = 4500 sqft
 * 
 * Regional Variance / Ambiguity:
 * - Bigha: Has no universal conversion factor across Indian states (varies from
 *   ~1000 sqyd in Punjab/parts of Haryana to 3025 sqyd in UP and 1600-2500 sqyd in Rajasthan).
 *   Cross-unit conversions involving bigha are intentionally rejected to prevent sizing errors
 *   and flagged as ambiguous_regional_unit_conversion for human review.
 */
const SQFT_FACTORS = {
    sqft: 1,
    sqyd: 9,          // 1 sqyd = 9 sqft
    marla: 225,       // Haryana HSVP/Urban standard: 1 marla = 25 sqyd = 225 sqft
    kanal: 4500,      // Haryana HSVP/Urban standard: 1 kanal = 20 marla = 500 sqyd = 4500 sqft
    acre: 43560       // 1 acre = 4840 sqyd = 8 kanal = 43560 sqft
};

// Aliases mapping common spellings to canonical unit identifiers
const UNIT_ALIASES = {
    'sqft': 'sqft',
    'sq.ft': 'sqft',
    'sq ft': 'sqft',
    'sqfeet': 'sqft',
    'sq feet': 'sqft',
    'square feet': 'sqft',
    'square foot': 'sqft',
    'sft': 'sqft',
    'sqyd': 'sqyd',
    'sq.yd': 'sqyd',
    'sq yd': 'sqyd',
    'sqyard': 'sqyd',
    'sq yard': 'sqyd',
    'sq yards': 'sqyd',
    'square yard': 'sqyd',
    'square yards': 'sqyd',
    'gaz': 'sqyd',
    'gaj': 'sqyd',
    'marla': 'marla',
    'marlas': 'marla',
    'kanal': 'kanal',
    'kanals': 'kanal',
    'bigha': 'bigha',
    'bighas': 'bigha',
    'acre': 'acre',
    'acres': 'acre'
};

/**
 * Canonical URL Normalization
 * Removes tracking, campaign, and session parameters while preserving meaningful listing params.
 * 
 * @param {string} rawUrl 
 * @returns {string|null} Normalized URL or null if invalid
 */
export function normalizeDiscoveryUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
        const parsed = new URL(rawUrl.trim());
        
        // Security: Strict scheme check - only http and https protocols are valid
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }

        // Lowercase protocol and host
        parsed.protocol = parsed.protocol.toLowerCase();
        parsed.hostname = parsed.hostname.toLowerCase();

        // Strip default ports
        if ((parsed.protocol === 'http:' && parsed.port === '80') ||
            (parsed.protocol === 'https:' && parsed.port === '443')) {
            parsed.port = '';
        }

        // Tracking and analytics parameters to strip
        const TRACKING_PARAMS = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'gclid', 'fbclid', 'ref', 'source', 'campaign', 'trk', 'igshid',
            '_ga', '_gl', 'msclkid', 'dclid', 'twclid', 'mc_cid', 'mc_eid'
        ];

        TRACKING_PARAMS.forEach(param => {
            parsed.searchParams.delete(param);
        });

        // Strip trailing slash on path (unless path is just root '/')
        if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }

        return parsed.toString();
    } catch {
        return null;
    }
}

/**
 * Validates whether a URL belongs to the allowed portal whitelist.
 * 
 * @param {string} url 
 * @param {string[]} portalWhitelist 
 * @returns {{ allowed: boolean, domain: string|null, reason: string|null }}
 */
export function isPortalAllowed(url, portalWhitelist) {
    let hostname = null;
    if (url) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (err) {
            return { allowed: false, domain: null, reason: 'malformed_url' };
        }

        // Security: Only http: and https: protocols are permitted
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { allowed: false, domain: null, reason: 'invalid_scheme' };
        }

        hostname = parsed.hostname.toLowerCase();
    }

    // If no whitelist is configured, portal filtering is disabled
    if (!Array.isArray(portalWhitelist) || portalWhitelist.length === 0) {
        return { allowed: true, domain: hostname, reason: null };
    }

    if (!url) return { allowed: false, domain: null, reason: 'missing_url' };

    const cleanedWhitelist = portalWhitelist
        .map(d => (d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
        .filter(Boolean);

    if (cleanedWhitelist.length === 0) {
        return { allowed: true, domain: hostname, reason: null };
    }

    // Exact match or subdomain match (e.g. www.99acres.com matches 99acres.com)
    // Prevents lookalike domains like 99acres.com.attacker.com or fake99acres.com
    const matched = cleanedWhitelist.some(domain => {
        return hostname === domain || hostname.endsWith('.' + domain);
    });

    if (matched) {
        return { allowed: true, domain: hostname, reason: null };
    }

    return { 
        allowed: false, 
        domain: hostname, 
        reason: 'portal_not_in_whitelist' 
    };
}

/**
 * Converts area between supported units.
 * 
 * @param {number} value 
 * @param {string} fromUnit 
 * @param {string} toUnit 
 * @returns {number|null} Converted value or null if unsupported
 */
export function convertArea(value, fromUnit, toUnit) {
    if (typeof value !== 'number' || isNaN(value) || value < 0) return null;
    
    const canonicalFrom = UNIT_ALIASES[(fromUnit || '').toLowerCase().trim()];
    const canonicalTo = UNIT_ALIASES[(toUnit || '').toLowerCase().trim()];

    if (!canonicalFrom || !canonicalTo) return null;
    if (canonicalFrom === canonicalTo) return value;

    // Regional ambiguity: Bigha has no universal conversion across states.
    // Cross-unit conversion involving bigha is rejected to prevent inaccurate sizing.
    if (canonicalFrom === 'bigha' || canonicalTo === 'bigha') {
        return null;
    }

    const fromFactor = SQFT_FACTORS[canonicalFrom];
    const toFactor = SQFT_FACTORS[canonicalTo];

    if (!fromFactor || !toFactor) return null;

    // Convert to sqft base, then to target unit
    const sqft = value * fromFactor;
    return sqft / toFactor;
}

/**
 * Parses numeric price from Indian real estate strings.
 * e.g. "1.50 Cr", "85 Lac", "45 Lakh", "50,000", "1.25 Crore"
 * 
 * @param {string|number} rawPrice 
 * @returns {number|null} Numeric price in INR
 */
export function parsePriceToNumber(rawPrice) {
    if (rawPrice === null || rawPrice === undefined) return null;
    if (typeof rawPrice === 'number') {
        return rawPrice >= 0 && !isNaN(rawPrice) && isFinite(rawPrice) ? rawPrice : null;
    }
    
    const str = String(rawPrice).trim();
    if (!str) return null;

    // Reject negative numbers or explicit non-price indicators
    if (str.startsWith('-') || /\b(negotiable|on request|call for price)\b/i.test(str)) {
        return null;
    }

    // Reject multiple decimal dots (e.g. 1.2.3)
    if (str.split('.').length > 2) {
        return null;
    }

    const cleanStr = str.replace(/,/g, '');

    // Matches e.g. 1.5 Cr, 1.50 Crore, 85 Lac, 85 Lakhs, 50k
    const crMatch = cleanStr.match(/(?:(?:rs\.?|inr|₹)\s*)?([\d.]+)\s*(?:cr|crore|crores)\b/i);
    if (crMatch) {
        const val = parseFloat(crMatch[1]);
        return isNaN(val) ? null : Math.round(val * 10000000);
    }

    const lacMatch = cleanStr.match(/(?:(?:rs\.?|inr|₹)\s*)?([\d.]+)\s*(?:lac|lacs|lakh|lakhs)\b/i);
    if (lacMatch) {
        const val = parseFloat(lacMatch[1]);
        return isNaN(val) ? null : Math.round(val * 100000);
    }

    const kMatch = cleanStr.match(/(?:(?:rs\.?|inr|₹)\s*)?([\d.]+)\s*(?:k|thousand|thousands)\b/i);
    if (kMatch) {
        const val = parseFloat(kMatch[1]);
        return isNaN(val) ? null : Math.round(val * 1000);
    }

    // Direct currency prefix match: e.g. ₹ 45,000, Rs. 1,50,000, INR 2500000
    const currMatch = cleanStr.match(/(?:rs\.?|inr|₹)\s*(\d+(?:\.\d+)?)\b/i);
    if (currMatch) {
        const val = parseFloat(currMatch[1]);
        return isNaN(val) ? null : Math.round(val);
    }

    // Pure number string with optional 'price:' prefix (e.g. "45000", "price: 1500000")
    // Rejects bare numbers embedded in prose (like "Call 9876543210", "Sector 8", "Plot 120")
    const pureNumMatch = cleanStr.match(/^(?:price\s*:?\s*)?(\d+(?:\.\d+)?)$/i);
    if (pureNumMatch) {
        const digits = pureNumMatch[1];
        // Indian mobile numbers (10 digits starting with 6, 7, 8, 9) without currency/denomination
        // are contact numbers, not prices!
        if (/^[6-9]\d{9}$/.test(digits)) {
            return null;
        }
        const val = parseFloat(digits);
        return isNaN(val) ? null : Math.round(val);
    }

    return null;
}

/**
 * Parses numeric size and unit from size string.
 * e.g. "250 sqyd", "1500 sqft", "10 marla", "2 kanal", "150 gaz"
 * 
 * @param {string|number} rawSize 
 * @returns {{ value: number, unit: string } | null}
 */
export function parseSizeAndUnit(rawSize) {
    if (rawSize === null || rawSize === undefined) return null;
    if (typeof rawSize === 'number') {
        return rawSize >= 0 ? { value: rawSize, unit: 'sqft' } : null;
    }

    const str = String(rawSize).trim().replace(/,/g, '');
    if (!str) return null;

    const match = str.match(/([\d.]+)\s*([a-zA-Z.\s]+)/);
    if (!match) {
        // Plain number without unit
        const plainNum = parseFloat(str);
        return isNaN(plainNum) ? null : { value: plainNum, unit: 'unknown' };
    }

    const value = parseFloat(match[1]);
    const rawUnit = match[2].trim().toLowerCase();
    const cleanUnit = rawUnit.replace(/\.+$/, '');
    const canonicalUnit = UNIT_ALIASES[rawUnit] || UNIT_ALIASES[cleanUnit] || rawUnit;

    return isNaN(value) ? null : { value, unit: canonicalUnit };
}

/**
 * Evaluates listing price against min/max price filters.
 * 
 * @param {string|number} extractedPrice 
 * @param {number|null} priceMin 
 * @param {number|null} priceMax 
 * @returns {{ passed: boolean|null, extracted: number|null, reason: string|null, isMissingData?: boolean }}
 */
export function evaluatePriceFilter(extractedPrice, priceMin, priceMax) {
    const hasMin = typeof priceMin === 'number' && priceMin >= 0;
    const hasMax = typeof priceMax === 'number' && priceMax >= 0;

    // Filter not configured
    if (!hasMin && !hasMax) {
        return { passed: true, extracted: null, reason: null };
    }

    const numericPrice = parsePriceToNumber(extractedPrice);

    // Missing price data in listing
    if (numericPrice === null) {
        return { 
            passed: null, 
            extracted: null, 
            reason: 'missing_price_data', 
            isMissingData: true 
        };
    }

    if (hasMin && numericPrice < priceMin) {
        return { 
            passed: false, 
            extracted: numericPrice, 
            reason: 'below_min_price', 
            limit: priceMin 
        };
    }

    if (hasMax && numericPrice > priceMax) {
        return { 
            passed: false, 
            extracted: numericPrice, 
            reason: 'above_max_price', 
            limit: priceMax 
        };
    }

    return { passed: true, extracted: numericPrice, reason: null };
}

/**
 * Evaluates listing size against min/max size and unit filters.
 * 
 * @param {string|number} extractedSize 
 * @param {number|null} sizeMin 
 * @param {number|null} sizeMax 
 * @param {string|null} targetUnit 
 * @returns {{ passed: boolean|null, extracted: number|null, unit: string|null, reason: string|null, isMissingData?: boolean }}
 */
export function evaluateSizeFilter(extractedSize, sizeMin, sizeMax, targetUnit) {
    const hasMin = typeof sizeMin === 'number' && sizeMin >= 0;
    const hasMax = typeof sizeMax === 'number' && sizeMax >= 0;
    const hasUnit = Boolean(targetUnit && SUPPORTED_AREA_UNITS.includes(targetUnit));

    // Filter not configured
    if (!hasMin && !hasMax && !hasUnit) {
        return { passed: true, extracted: null, unit: null, reason: null };
    }

    const parsedSize = parseSizeAndUnit(extractedSize);

    // Missing size data in listing
    if (!parsedSize) {
        return { 
            passed: null, 
            extracted: null, 
            unit: null, 
            reason: 'missing_size_data', 
            isMissingData: true 
        };
    }

    let normalizedValue = parsedSize.value;
    const effectiveTargetUnit = targetUnit || parsedSize.unit;

    if (hasUnit) {
        if (parsedSize.unit === 'unknown') {
            return {
                passed: false,
                extracted: parsedSize.value,
                unit: 'unknown',
                reason: 'missing_area_unit_in_listing',
                expectedUnit: targetUnit
            };
        }

        // Handle regionally ambiguous units like bigha
        if (parsedSize.unit === 'bigha' || targetUnit === 'bigha') {
            if (parsedSize.unit !== targetUnit) {
                return {
                    passed: null,
                    extracted: parsedSize.value,
                    unit: parsedSize.unit,
                    reason: 'ambiguous_regional_unit_conversion',
                    isMissingData: true,
                    fromUnit: parsedSize.unit,
                    expectedUnit: targetUnit
                };
            }
        }

        const converted = convertArea(parsedSize.value, parsedSize.unit, targetUnit);
        if (converted === null) {
            return {
                passed: false,
                extracted: parsedSize.value,
                unit: parsedSize.unit,
                reason: 'unsupported_area_unit_mismatch',
                fromUnit: parsedSize.unit,
                expectedUnit: targetUnit
            };
        }
        normalizedValue = converted;
    }

    if (hasMin && normalizedValue < sizeMin) {
        return { 
            passed: false, 
            extracted: normalizedValue, 
            unit: effectiveTargetUnit, 
            reason: 'below_min_size', 
            limit: sizeMin 
        };
    }

    if (hasMax && normalizedValue > sizeMax) {
        return { 
            passed: false, 
            extracted: normalizedValue, 
            unit: effectiveTargetUnit, 
            reason: 'above_max_size', 
            limit: sizeMax 
        };
    }

    return { 
        passed: true, 
        extracted: normalizedValue, 
        unit: effectiveTargetUnit, 
        reason: null 
    };
}

/**
 * Evaluates listing seller type against allowed types.
 * 
 * @param {string} sellerIntent 
 * @param {string} textContent 
 * @param {string[]} allowedSellerTypes 
 * @returns {{ passed: boolean|null, detected: string|null, reason: string|null, isMissingData?: boolean }}
 */
export function evaluateSellerTypeFilter(sellerIntent, textContent, allowedSellerTypes) {
    if (!Array.isArray(allowedSellerTypes) || allowedSellerTypes.length === 0) {
        return { passed: true, detected: null, reason: null };
    }

    const combined = `${sellerIntent || ''} ${textContent || ''}`.toLowerCase();

    // Check for explicit signals
    const hasOwnerSignals = /\b(direct owner|by owner|individual owner|no brokerage|dealers excuse|dealers please excuse|brokers excuse|brokers please excuse)\b/i.test(combined);

    // Strip exclusion phrases so negative instructions (e.g. "dealers please excuse", "no brokers")
    // do not falsely trigger affirmative broker detection.
    const sanitizedForBrokerCheck = combined
        .replace(/\b(dealers?|brokers?|agents?|channel partners?)\s+(?:please\s+)?(?:excuse|stay away|do not call|don't call)\b/gi, ' ')
        .replace(/\bno\s+(?:dealers?|brokers?|agents?|brokerage|commission)\b/gi, ' ');

    const hasBrokerSignals = /\b(broker|dealer|agent|consultant|commission|channel partner|multiple options|consultancy)\b/i.test(sanitizedForBrokerCheck);
    const hasBuilderSignals = /\b(builder floor|developer|pre-launch|launching soon|promoter|official booking)\b/i.test(combined);

    let detectedType = null;
    if (hasOwnerSignals && !hasBrokerSignals) detectedType = 'owner';
    else if (hasBrokerSignals) detectedType = 'broker';
    else if (hasBuilderSignals) detectedType = 'builder';

    if (!detectedType) {
        return { 
            passed: null, 
            detected: null, 
            reason: 'unverified_seller_type', 
            isMissingData: true 
        };
    }

    if (allowedSellerTypes.includes(detectedType)) {
        return { passed: true, detected: detectedType, reason: null };
    }

    return { 
        passed: false, 
        detected: detectedType, 
        reason: 'seller_type_mismatch' 
    };
}

/**
 * Evaluates listing freshness against configured maximum age in days.
 * 
 * @param {Date|string} publishedDate 
 * @param {number|null} freshnessDays 
 * @returns {{ passed: boolean|null, ageInDays: number|null, reason: string|null, isMissingData?: boolean }}
 */
export function evaluateFreshnessFilter(publishedDate, freshnessDays) {
    if (!freshnessDays || typeof freshnessDays !== 'number' || freshnessDays <= 0) {
        return { passed: true, ageInDays: null, reason: null };
    }

    if (!publishedDate) {
        return { 
            passed: null, 
            ageInDays: null, 
            reason: 'missing_published_date', 
            isMissingData: true 
        };
    }

    const date = new Date(publishedDate);
    if (isNaN(date.getTime())) {
        return { 
            passed: null, 
            ageInDays: null, 
            reason: 'invalid_published_date', 
            isMissingData: true 
        };
    }

    const ageInDays = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (ageInDays > freshnessDays) {
        return { 
            passed: false, 
            ageInDays: Math.round(ageInDays), 
            reason: 'outside_freshness_window', 
            limit: freshnessDays 
        };
    }

    return { passed: true, ageInDays: Math.round(ageInDays), reason: null };
}

/**
 * Complete multi-factor listing evaluation against DiscoveryConfig.
 * 
 * @param {object} listingData - Extracted property data
 * @param {object} config - DiscoveryConfig document
 * @returns {object} Comprehensive evaluation report
 */
export function evaluateListing(listingData = {}, config = {}) {
    const url = listingData.url || listingData.raw_source_data?.url || '';
    const price = listingData.price || listingData.specs?.price || listingData.extracted_entities?.specs?.price || '';
    const size = listingData.size || listingData.specs?.size || listingData.extracted_entities?.specs?.size || '';
    const sellerIntent = listingData.seller_intent || listingData.intent || '';
    const textContent = `${listingData.title || ''} ${listingData.description || ''} ${listingData.content || ''}`;
    const publishedDate = listingData.publishedDate || listingData.raw_source_data?.publishedDate || null;

    const portalCheck = isPortalAllowed(url, config.portal_whitelist);
    const priceCheck = evaluatePriceFilter(price, config.price_min, config.price_max);
    const sizeCheck = evaluateSizeFilter(size, config.size_min, config.size_max, config.size_unit);
    const sellerCheck = evaluateSellerTypeFilter(sellerIntent, textContent, config.seller_types);
    const freshnessCheck = evaluateFreshnessFilter(publishedDate, config.freshness_days);

    const checks = {
        portal: portalCheck,
        price: priceCheck,
        size: sizeCheck,
        sellerType: sellerCheck,
        freshness: freshnessCheck
    };

    const auditReasons = [];
    const missingFields = [];

    // Collect hard disqualifications
    if (portalCheck.allowed === false) auditReasons.push(portalCheck.reason);
    if (priceCheck.passed === false) auditReasons.push(priceCheck.reason);
    if (sizeCheck.passed === false) auditReasons.push(sizeCheck.reason);
    if (sellerCheck.passed === false) auditReasons.push(sellerCheck.reason);
    if (freshnessCheck.passed === false) auditReasons.push(freshnessCheck.reason);

    // Collect missing data notices
    if (priceCheck.isMissingData) missingFields.push('price');
    if (sizeCheck.isMissingData) missingFields.push('size');
    if (sellerCheck.isMissingData) missingFields.push('seller_type');
    if (freshnessCheck.isMissingData) missingFields.push('published_date');

    // Overall decision:
    // If any check explicitly failed -> passed = false (Disqualified)
    // If no check failed, but one or more configured checks have missing data -> passed = null (Unverified Missing Data)
    // If all configured checks explicitly passed -> passed = true
    let overallPassed = true;
    if (auditReasons.length > 0) {
        overallPassed = false;
    } else if (missingFields.length > 0) {
        overallPassed = null; // Unverified / Needs Review
    }

    return {
        passed: overallPassed,
        disqualified: auditReasons.length > 0,
        missingCoreData: missingFields.length > 0,
        checks,
        auditReasons,
        missingFields,
        evaluatedAt: new Date()
    };
}

/**
 * Validates DiscoveryConfig input payload.
 * Supports full creation validation (default) and partial updates (isPartial: true)
 * to prevent partial updates from silently erasing existing filter configurations.
 * 
 * @param {object} payload 
 * @param {object} [options={}]
 * @param {boolean} [options.isPartial=false] - When true, only validates provided fields without defaulting missing fields.
 * @returns {{ valid: boolean, errors: string[], cleanPayload: object }}
 */
export function validateDiscoveryConfigPayload(payload = {}, options = {}) {
    const isPartial = Boolean(options.isPartial);
    const errors = [];
    const clean = {};

    // 1. Name
    if (payload.name !== undefined) {
        if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
            errors.push("Configuration name is required");
        } else {
            clean.name = payload.name.trim();
        }
    } else if (!isPartial) {
        errors.push("Configuration name is required");
    }

    // 2. Keywords
    if (payload.keywords !== undefined) {
        if (!Array.isArray(payload.keywords) || payload.keywords.length === 0) {
            errors.push("At least one search keyword is required");
        } else {
            const cleanedKeywords = payload.keywords.map(k => String(k).trim()).filter(Boolean);
            if (cleanedKeywords.length === 0) {
                errors.push("At least one non-empty search keyword is required");
            } else {
                clean.keywords = cleanedKeywords;
            }
        }
    } else if (!isPartial) {
        errors.push("At least one search keyword is required");
    }

    // 3. Location Filters & Property Types
    if (payload.location_filters !== undefined) {
        clean.location_filters = Array.isArray(payload.location_filters)
            ? payload.location_filters.map(l => String(l).trim()).filter(Boolean)
            : [];
    } else if (!isPartial) {
        clean.location_filters = [];
    }

    if (payload.property_types !== undefined) {
        clean.property_types = Array.isArray(payload.property_types)
            ? payload.property_types.map(t => String(t).trim()).filter(Boolean)
            : [];
    } else if (!isPartial) {
        clean.property_types = [];
    }

    // 4. Cron Schedule
    if (payload.schedule_cron !== undefined) {
        if (!payload.schedule_cron || typeof payload.schedule_cron !== 'string' || !cron.validate(payload.schedule_cron.trim())) {
            errors.push(`Invalid cron expression: "${payload.schedule_cron}"`);
        } else {
            clean.schedule_cron = payload.schedule_cron.trim();
        }
    } else if (!isPartial) {
        clean.schedule_cron = '0 0 * * *';
    }

    // 5. Active toggle
    if (payload.is_active !== undefined) {
        clean.is_active = Boolean(payload.is_active);
    } else if (!isPartial) {
        clean.is_active = true;
    }

    // 6. Price Range Validation
    if (payload.price_min !== undefined) {
        if (payload.price_min !== null && payload.price_min !== '') {
            const pMin = Number(payload.price_min);
            if (isNaN(pMin) || pMin < 0) {
                errors.push("price_min must be a non-negative number");
            } else {
                clean.price_min = pMin;
            }
        } else {
            clean.price_min = null;
        }
    } else if (!isPartial) {
        clean.price_min = null;
    }

    if (payload.price_max !== undefined) {
        if (payload.price_max !== null && payload.price_max !== '') {
            const pMax = Number(payload.price_max);
            if (isNaN(pMax) || pMax < 0) {
                errors.push("price_max must be a non-negative number");
            } else {
                clean.price_max = pMax;
            }
        } else {
            clean.price_max = null;
        }
    } else if (!isPartial) {
        clean.price_max = null;
    }

    // Cross-validate price range if both are present in clean
    const checkPMin = clean.price_min !== undefined ? clean.price_min : null;
    const checkPMax = clean.price_max !== undefined ? clean.price_max : null;
    if (checkPMin !== null && checkPMax !== null && checkPMax < checkPMin) {
        errors.push(`price_max (${checkPMax}) cannot be less than price_min (${checkPMin})`);
    }

    // 7. Size Range Validation
    if (payload.size_min !== undefined) {
        if (payload.size_min !== null && payload.size_min !== '') {
            const sMin = Number(payload.size_min);
            if (isNaN(sMin) || sMin < 0) {
                errors.push("size_min must be a non-negative number");
            } else {
                clean.size_min = sMin;
            }
        } else {
            clean.size_min = null;
        }
    } else if (!isPartial) {
        clean.size_min = null;
    }

    if (payload.size_max !== undefined) {
        if (payload.size_max !== null && payload.size_max !== '') {
            const sMax = Number(payload.size_max);
            if (isNaN(sMax) || sMax < 0) {
                errors.push("size_max must be a non-negative number");
            } else {
                clean.size_max = sMax;
            }
        } else {
            clean.size_max = null;
        }
    } else if (!isPartial) {
        clean.size_max = null;
    }

    // Cross-validate size range if both are present in clean
    const checkSMin = clean.size_min !== undefined ? clean.size_min : null;
    const checkSMax = clean.size_max !== undefined ? clean.size_max : null;
    if (checkSMin !== null && checkSMax !== null && checkSMax < checkSMin) {
        errors.push(`size_max (${checkSMax}) cannot be less than size_min (${checkSMin})`);
    }

    // 8. Size Unit Validation
    if (payload.size_unit !== undefined) {
        if (payload.size_unit !== null && payload.size_unit !== '') {
            const unit = String(payload.size_unit).trim().toLowerCase();
            if (!SUPPORTED_AREA_UNITS.includes(unit)) {
                errors.push(`Unsupported size_unit "${unit}". Supported units: ${SUPPORTED_AREA_UNITS.join(', ')}`);
            } else {
                clean.size_unit = unit;
            }
        } else {
            clean.size_unit = null;
        }
    } else if (!isPartial) {
        clean.size_unit = null;
    }

    // 9. Seller Types Validation
    if (payload.seller_types !== undefined) {
        if (Array.isArray(payload.seller_types)) {
            const validTypes = [];
            for (const st of payload.seller_types) {
                const cleanSt = String(st).trim().toLowerCase();
                if (!SUPPORTED_SELLER_TYPES.includes(cleanSt)) {
                    errors.push(`Unsupported seller_type "${cleanSt}". Supported types: ${SUPPORTED_SELLER_TYPES.join(', ')}`);
                } else if (!validTypes.includes(cleanSt)) {
                    validTypes.push(cleanSt);
                }
            }
            clean.seller_types = validTypes;
        } else {
            clean.seller_types = [];
        }
    } else if (!isPartial) {
        clean.seller_types = [];
    }

    // 10. Portal Whitelist Validation
    if (payload.portal_whitelist !== undefined) {
        if (Array.isArray(payload.portal_whitelist)) {
            const cleanedPortals = [];
            for (const raw of payload.portal_whitelist) {
                const domain = String(raw).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                if (domain && !cleanedPortals.includes(domain)) {
                    // Basic hostname format check
                    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
                        errors.push(`Malformed portal domain in whitelist: "${raw}"`);
                    } else {
                        cleanedPortals.push(domain);
                    }
                }
            }
            clean.portal_whitelist = cleanedPortals;
        } else {
            clean.portal_whitelist = [];
        }
    } else if (!isPartial) {
        clean.portal_whitelist = [];
    }

    // 11. Freshness Days Validation
    if (payload.freshness_days !== undefined) {
        if (payload.freshness_days !== null && payload.freshness_days !== '') {
            const days = Number(payload.freshness_days);
            if (!Number.isInteger(days) || days < 1 || days > 365) {
                errors.push("freshness_days must be an integer between 1 and 365");
            } else {
                clean.freshness_days = days;
            }
        } else {
            clean.freshness_days = null;
        }
    } else if (!isPartial) {
        clean.freshness_days = null;
    }

    return {
        valid: errors.length === 0,
        errors,
        cleanPayload: clean
    };
}
