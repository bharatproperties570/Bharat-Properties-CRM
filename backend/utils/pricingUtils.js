/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PRICING INTELLIGENCE UTILITIES — Enterprise Grade
 * Bharat Properties CRM — Phase 1 Foundation
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * This module provides:
 * 1. Category-specific area unit determination
 * 2. Area normalization & rate-per-unit calculation
 * 3. Orientation premium calculation (facing, direction, roadWidth, orientation)
 * 4. Market positioning tag (undervalued / fair / overpriced)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

/**
 * Conversion factors: everything stored internally in Sq.Ft. for math.
 */
export const AREA_CONVERSIONS = {
    // Sq.Ft. <-> others
    SQ_FT_PER_SQ_YD:  9,          // 1 Sq.Yard = 9 Sq.Ft
    SQ_FT_PER_MARLA:  272.25,     // 1 Marla = 272.25 Sq.Ft
    SQ_FT_PER_KANAL:  5445,       // 1 Kanal = 5445 Sq.Ft (20 Marla)
    SQ_FT_PER_ACRE:   43560,      // 1 Acre = 43560 Sq.Ft
    SQ_FT_PER_SQ_MTR: 10.7639,    // 1 Sq.Meter = 10.7639 Sq.Ft
};

/**
 * Supported display area units per category.
 * RULE: These are NON-NEGOTIABLE — system auto-selects from subCategory.
 */
export const AREA_UNIT_LABELS = {
    PER_SQ_FT:  'per Sq.Ft.',
    PER_SQ_YD:  'per Sq.Yd.',
    PER_MARLA:  'per Marla',
    PER_KANAL:  'per Kanal',
    PER_ACRE:   'per Acre',
};

/**
 * Sub-category → Standard area unit mapping.
 * Pattern-based: lowercased subCategory value is checked against keywords.
 */
const SUB_CATEGORY_UNIT_MAP = [
    // Agriculture — highest priority (check before plot)
    { keywords: ['agriculture', 'farm house', 'farmhouse', 'farm land', 'farmland', 'agri'],     unit: 'PER_KANAL' },
    // Residential & Commercial Plots
    { keywords: ['plot', 'residential plot', 'commercial plot', 'industrial plot', 'corner plot'], unit: 'PER_SQ_YD' },
    // Flats & Apartments
    { keywords: ['flat', 'apartment', 'studio', 'penthouse', 'service apartment'],                 unit: 'PER_SQ_FT' },
    // Independent Houses / Villas use sq.yd for land
    { keywords: ['villa', 'independent house', 'kothi', 'bungalow', 'duplex'],                     unit: 'PER_SQ_YD' },
    // Shops, Offices, Showrooms
    { keywords: ['shop', 'office', 'showroom', 'commercial space', 'retail', 'booth', 'sco'],      unit: 'PER_SQ_FT' },
    // Industrial Sheds / Warehouses
    { keywords: ['shed', 'warehouse', 'factory', 'industrial', 'godown'],                           unit: 'PER_SQ_YD' },
];

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * AUTHORITATIVE ORIENTATION BASE PRICE ADJUSTMENT TABLES (User Specified)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * 1. Road – Base Price Adjustment (%)
 */
export const ROAD_BASE_PRICE_ADJUSTMENTS = {
    '9 Mtr (30 Feet) Wide': 0,
    '10 Mtr (32.8 Feet) Wide': 0.5,
    '12 Mtr (40 Feet) Wide': 7.5,
    '15 Mtr (49.2 Feet) Wide': 9.5,
    '18 Mtr (60 Feet) Wide': 10.5,
    '24 Mtr (80 Feet) Wide': 24.5,
    '30 Mtr (100 Feet) Wide': 25.5,
    '50 Mtr (164 Feet) Wide': 30,
    '60 Mtr (200 Feet) Wide': 31,
    '90 Mtr (300 Feet) Wide': 35
};

/**
 * 2. Direction – Base Price Adjustment (%)
 */
export const DIRECTION_BASE_PRICE_ADJUSTMENTS = {
    'East': 5,
    'North': 4,
    'North-East': 5,
    'North-West': 0,
    'South': -12,
    'South-East': -3,
    'South-West': -5,
    'West': 0
};

/**
 * 3. Facing – Base Price Adjustment (%)
 */
export const FACING_BASE_PRICE_ADJUSTMENTS = {
    '1 Kanal': 5,
    '1 Kanal Side View': 3,
    '10 Marla': 2,
    '10 Marla Side View': 1,
    '12 Marla': 2,
    '12 Marla Side View': 1,
    '14 Marla': 0,
    '14 Marla Side View': 0,
    '16 Marla': 0,
    '16 Marla Side View': 0,
    '2 Kanal': 0,
    '2 Marla': 0,
    '2 Marla Side View': 0,
    '3 Marla': 0,
    '3 Marla Side View': 0,
    '4 Marla': 0,
    '4 Marla Side View': 0,
    '5 Marla': 0,
    '5 Marla Side View': 0,
    '6 Marla': 0,
    '6 Marla Side View': 0,
    '8 Marla': 0,
    '8 Marla Side View': 0,
    'Agriculture Deptt.': 0,
    'Big Houses': 1,
    'Canvas Home': 0,
    'Club Facing': 4,
    'College': 1,
    'Commercial': 15,
    'Community Centre': 1,
    'DSS Side View': 5,
    'Dispensary': -10,
    'Distt Court': -10,
    'Dividing Road': 12,
    'Double Story Booths': 3,
    'EWS': -20,
    'Fire Station': -10,
    'Flat': 5,
    'Government Site': 0,
    'Green Belt': 16,
    'Group Housing': 0,
    'Health Centre': -5,
    'High Tension Lines': -18,
    'HomeLand': 0,
    'Hospital': -15,
    'Hotel': -15,
    'Housing Board': 0,
    'Industrial Plot': -13,
    'Institutional Site': -10,
    'Jalvayu Vihar': 1,
    'L Point': 1,
    'Main Road Facing': 15,
    'Nursing Home': -10,
    'Office': -10,
    'Other Colony': 0,
    'Other Land': 0,
    'Panchayat Bhawan': 0,
    'Park': 16,
    'Parking': -5,
    'Pavement': 0,
    'Play Ground': 5,
    'Police Post': -15,
    'Pool Facing': 4,
    'Power Line': -16,
    'Project Boundry Wall': -5,
    'Public Building': -10,
    'Public Buildings': -1,
    'Railway Station': -14,
    'Religious Site': -11,
    'Reserved Area': 0,
    'School': -10,
    'Shop': 10,
    'Shopping Mall': 10,
    'Showroom': 10,
    'Site': 0,
    'Site for Flats': 0,
    'Site for old age homes': 0,
    'Society': 2,
    'Sports Complex': 2,
    'T Point': -12,
    'Taxi Stand': -13,
    'Telephone Exchange': 0,
    'Village': -15,
    'Water Works': -12
};

/**
 * Looks up an exact or normalized adjustment percentage from a table.
 * 
 * @param {Object} adjustmentTable 
 * @param {string} rawValue 
 * @returns {number} Adjustment percentage (e.g. 24.5, -12, 0)
 */
export function lookupAdjustment(adjustmentTable, rawValue) {
    if (!rawValue || !adjustmentTable) return 0;
    const str = String(rawValue).trim();
    if (adjustmentTable[str] !== undefined) return adjustmentTable[str];

    // Case-insensitive match
    const lower = str.toLowerCase();
    for (const [key, val] of Object.entries(adjustmentTable)) {
        if (key.toLowerCase() === lower) return val;
    }

    // Normalized alphanumeric match (stripping spaces, periods, dashes)
    const norm = lower.replace(/[^a-z0-9]/g, '');
    for (const [key, val] of Object.entries(adjustmentTable)) {
        if (key.toLowerCase().replace(/[^a-z0-9]/g, '') === norm) return val;
    }

    return 0;
}

/**
 * Resolves orientation adjustment percentages and multiplier for given attributes.
 * 
 * @param {{ roadWidth?: string, direction?: string, facing?: string }} params
 * @returns {{
 *   roadAdjustmentPct: number,
 *   directionAdjustmentPct: number,
 *   facingAdjustmentPct: number,
 *   totalAdjustmentPct: number,
 *   multiplier: number
 * }}
 */
export function resolveOrientationAdjustments({ roadWidth, direction, facing } = {}) {
    const roadAdjustmentPct = lookupAdjustment(ROAD_BASE_PRICE_ADJUSTMENTS, roadWidth);
    const directionAdjustmentPct = lookupAdjustment(DIRECTION_BASE_PRICE_ADJUSTMENTS, direction);
    const facingAdjustmentPct = lookupAdjustment(FACING_BASE_PRICE_ADJUSTMENTS, facing);

    const totalAdjustmentPct = Math.round((roadAdjustmentPct + directionAdjustmentPct + facingAdjustmentPct) * 100) / 100;
    const multiplier = Math.round((1 + totalAdjustmentPct / 100) * 10000) / 10000;

    return {
        roadAdjustmentPct,
        directionAdjustmentPct,
        facingAdjustmentPct,
        totalAdjustmentPct,
        multiplier
    };
}

/**
 * Derives the True Standard Base Price (P_base) from an actual realized rate per unit.
 * P_base = P_actual / (1 + (R + D + F)/100)
 * 
 * @param {number} actualRate - Actual transaction/listing rate (e.g. Rate per Sq.Yd)
 * @param {{ roadWidth?: string, direction?: string, facing?: string }} orientation
 * @returns {number} Standard Normalized Base Price
 */
export function calculateBasePriceFromRate(actualRate, { roadWidth, direction, facing } = {}) {
    if (!actualRate || actualRate <= 0) return 0;
    const { multiplier } = resolveOrientationAdjustments({ roadWidth, direction, facing });
    const safeMultiplier = Math.max(0.05, multiplier);
    return Math.round((actualRate / safeMultiplier) * 100) / 100;
}

/**
 * Calculates the target unit market price for a specific orientation from a base price.
 * P_unit = P_base * (1 + (R + D + F)/100)
 * 
 * @param {number} basePrice - Project / Sector base price (Standard 9m Road)
 * @param {{ roadWidth?: string, direction?: string, facing?: string }} orientation
 * @returns {number} Adjusted Unit Price
 */
export function calculateAdjustedUnitPrice(basePrice, { roadWidth, direction, facing } = {}) {
    if (!basePrice || basePrice <= 0) return 0;
    const { multiplier } = resolveOrientationAdjustments({ roadWidth, direction, facing });
    return Math.round(basePrice * multiplier * 100) / 100;
}

/**
 * Orientation premium percentages (as decimals, e.g. 0.20 = 20%)
 * Retained for backward-compatibility with existing score calculations.
 */
export const ORIENTATION_PREMIUMS = {
    // ── FACING (road / view type) ──────────────────────────────────────
    facing: {
        'corner':               0.20,   // Corner plot: +15–25%, using 20% midpoint
        'double road':          0.25,   // Double road facing: +20–30%
        'park facing':          0.12,   // Park facing: +8–15%
        'park':                 0.12,
        'main road':            0.07,   // Main road: +5–10%
        'main road facing':     0.07,
        'road facing':          0.05,
        'garden facing':        0.10,
        'sea facing':           0.15,   // Not common in Punjab, but included
        'lake facing':          0.10,
        'graveyard':           -0.15,   // Negative: -10–20%
        'industrial':          -0.10,
        'back':                -0.05,   // Back-facing
        'mid':                  0.00,   // Standard/baseline
        'normal':               0.00,
        'lane':                -0.03,
        'gali':                -0.03,
    },

    // ── DIRECTION (vastu / sunlight) ───────────────────────────────────
    direction: {
        'north east':           0.05,   // Most auspicious: +4–6%
        'northeast':            0.05,
        'north':                0.04,   // Wealth direction: +3–5%
        'east':                 0.04,   // Morning sun, health: +3–5%
        'north west':           0.02,   // Neutral-positive
        'northwest':            0.02,
        'south east':           0.01,   // Slightly positive (Agni corner)
        'southeast':            0.01,
        'west':                 0.00,   // Neutral baseline
        'south west':          -0.06,   // Least preferred: -5–8%
        'southwest':           -0.06,
        'south':               -0.04,   // Cautiously viewed: -3–5%
    },

    // ── ROAD WIDTH (development potential) ────────────────────────────
    roadWidth: {
        '< 20':                -0.12,   // Very narrow: -10–15%
        '10':                  -0.12,
        '15':                  -0.10,
        '20':                   0.00,   // Baseline (standard lane)
        '30':                   0.07,   // Premium residential: +5–10%
        '40':                   0.12,   // Higher FAR potential: +10–15%
        '60':                   0.20,   // Semi-commercial: +18–25%
        '80':                   0.25,
        '100':                  0.30,   // Prime commercial: +25–40%
        '100+':                 0.35,
        '150':                  0.35,
    },

    // ── UNIT ORIENTATION / FLOOR (flat-specific) ──────────────────────
    orientation: {
        'ground floor':        -0.10,   // Ground floor: -8–12%
        'ground':              -0.10,
        '1st floor':           -0.04,
        'first floor':         -0.04,
        '2nd floor':           -0.04,
        'second floor':        -0.04,
        '3rd floor':           -0.03,
        'third floor':         -0.03,
        'mid floor':            0.00,   // 4–8 floors: baseline
        'middle floor':         0.00,
        '4th floor':            0.00,
        '5th floor':            0.00,
        '6th floor':            0.02,
        '7th floor':            0.02,
        '8th floor':            0.03,
        '9th floor':            0.05,
        '10th floor':           0.06,
        'top floor':            0.10,   // Top floor: +8–12%
        'penthouse':            0.20,   // Penthouse: +15–25%
        'terrace':              0.12,
        // Plot orientations
        'corner':               0.20,
        'mid row':              0.00,
        'end of lane':         -0.07,
        'end of block':        -0.05,
    },
};

// ─── CORE UTILITY FUNCTIONS ──────────────────────────────────────────────────

/**
 * Determines the standard area unit label for a given property sub-category.
 * 
 * @param {string} subCategoryValue - The resolved lookup_value of subCategory (e.g. "Residential Plot")
 * @returns {string} - One of AREA_UNIT_LABELS keys: 'PER_SQ_FT' | 'PER_SQ_YD' | 'PER_KANAL' | 'PER_ACRE'
 */
export function getAreaUnit(subCategoryValue) {
    if (!subCategoryValue) return 'PER_SQ_FT'; // Safe default

    const normalized = String(subCategoryValue).toLowerCase().trim();

    // Kanal: agriculture gets priority check first
    if (normalized.includes('agri') || normalized.includes('farm') || normalized.includes('khet')) {
        return 'PER_KANAL';
    }

    for (const { keywords, unit } of SUB_CATEGORY_UNIT_MAP) {
        if (keywords.some(kw => normalized.includes(kw))) {
            return unit;
        }
    }

    return 'PER_SQ_FT'; // Fallback default
}

/**
 * Converts an area value from its input unit to Sq.Ft (for internal math).
 * 
 * @param {number} value - Numeric area value
 * @param {string} unit - Source unit (e.g. 'Marla', 'Sq.Yd', 'Kanal', 'Acre', 'Sq.Ft')
 * @returns {number} - Equivalent area in Sq.Ft
 */
export function toSqFt(value, unit) {
    if (!value) return 0;
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) return 0;
    
    // If unit is undefined, try to extract it from value string (e.g. '14 Marla')
    let u = String(unit || '').toLowerCase().replace(/[\s.]/g, '');
    if (!u && typeof value === 'string') {
        u = value.toLowerCase().replace(/[\s.]/g, '');
    }

    if (u.includes('sqyd') || u.includes('sqyard') || u === 'yard') return v * AREA_CONVERSIONS.SQ_FT_PER_SQ_YD;
    if (u.includes('marla')) return v * AREA_CONVERSIONS.SQ_FT_PER_MARLA;
    if (u.includes('kanal')) return v * AREA_CONVERSIONS.SQ_FT_PER_KANAL;
    if (u.includes('acre')) return v * AREA_CONVERSIONS.SQ_FT_PER_ACRE;
    if (u.includes('sqmtr') || u.includes('sqmeter') || u.includes('sqm') || u.includes('mtr')) return v * AREA_CONVERSIONS.SQ_FT_PER_SQ_MTR;
    // Default: assume already Sq.Ft
    return v;
}

/**
 * Converts area in Sq.Ft to target display unit.
 * 
 * @param {number} sqFtValue - Area in Sq.Ft
 * @param {string} targetUnit - e.g. 'PER_SQ_YD', 'PER_KANAL', 'PER_SQ_FT', 'PER_ACRE'
 * @returns {number}
 */
export function fromSqFt(sqFtValue, targetUnit) {
    if (!sqFtValue || isNaN(sqFtValue)) return 0;
    switch (targetUnit) {
        case 'PER_SQ_YD':  return sqFtValue / AREA_CONVERSIONS.SQ_FT_PER_SQ_YD;
        case 'PER_MARLA':  return sqFtValue / AREA_CONVERSIONS.SQ_FT_PER_MARLA;
        case 'PER_KANAL':  return sqFtValue / AREA_CONVERSIONS.SQ_FT_PER_KANAL;
        case 'PER_ACRE':   return sqFtValue / AREA_CONVERSIONS.SQ_FT_PER_ACRE;
        case 'PER_SQ_FT':
        default:           return sqFtValue;
    }
}

/**
 * Calculates Rate Per Standard Unit for a deal/inventory item.
 * 
 * @param {number} totalPrice - Total deal price (INR)
 * @param {number} areaValue - Area numeric value
 * @param {string} areaInputUnit - Unit of the provided area (e.g. 'Marla', 'Sq.Ft', 'Kanal')
 * @param {string} subCategoryValue - Sub-category name to determine target unit
 * @returns {{ ratePerUnit: number, areaUnit: string, areaUnitLabel: string, areaInStdUnit: number }}
 */
export function calcRatePerUnit(totalPrice, areaValue, areaInputUnit, subCategoryValue) {
    const result = {
        ratePerUnit: null,
        areaUnit: 'PER_SQ_FT',
        areaUnitLabel: AREA_UNIT_LABELS.PER_SQ_FT,
        areaInStdUnit: null,
    };

    if (!totalPrice || !areaValue || totalPrice <= 0 || areaValue <= 0) return result;

    const targetUnit = getAreaUnit(subCategoryValue);
    const sqFt = toSqFt(areaValue, areaInputUnit);
    const stdArea = fromSqFt(sqFt, targetUnit);

    if (!stdArea || stdArea <= 0) return result;

    result.areaUnit = targetUnit;
    result.areaUnitLabel = AREA_UNIT_LABELS[targetUnit] || 'per Sq.Ft.';
    result.areaInStdUnit = Math.round(stdArea * 100) / 100;
    result.ratePerUnit = Math.round(totalPrice / stdArea);

    return result;
}

/**
 * Looks up an orientation premium using fuzzy keyword matching.
 * 
 * @param {Object} premiumMap - e.g. ORIENTATION_PREMIUMS.facing
 * @param {string} lookupValue - The resolved lookup_value string (e.g. "Corner Plot")
 * @returns {number} - Premium as decimal (e.g. 0.20), or 0 if not found
 */
function fuzzyLookupPremium(premiumMap, lookupValue) {
    if (!lookupValue || !premiumMap) return 0;
    const normalized = String(lookupValue).toLowerCase().trim();

    // Exact match first
    if (premiumMap[normalized] !== undefined) return premiumMap[normalized];

    // Partial keyword match
    for (const [key, premium] of Object.entries(premiumMap)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return premium;
        }
    }

    return 0;
}

/**
 * Calculates the composite orientation premium for a property.
 * 
 * @param {Object} orientationData - Object with resolved string values:
 *   { facing: string, direction: string, roadWidth: string, orientation: string }
 * @returns {{
 *   facingPremium: number,
 *   directionPremium: number,
 *   roadWidthPremium: number,
 *   orientationPremium: number,
 *   totalPremiumPct: number,   // Total as percentage (e.g. 44 for 44%)
 *   orientationScore: number,  // 0–100 score for quick sorting
 *   tags: string[]             // Human-readable tags
 * }}
 */
export function calcOrientationPremium({ facing, direction, roadWidth, orientation } = {}) {
    const facingPremium      = fuzzyLookupPremium(ORIENTATION_PREMIUMS.facing,      facing);
    const directionPremium   = fuzzyLookupPremium(ORIENTATION_PREMIUMS.direction,   direction);
    const roadWidthPremium   = fuzzyLookupPremium(ORIENTATION_PREMIUMS.roadWidth,   roadWidth);
    const orientationPremium = fuzzyLookupPremium(ORIENTATION_PREMIUMS.orientation, orientation);

    const totalDecimal = facingPremium + directionPremium + roadWidthPremium + orientationPremium;
    const totalPremiumPct = Math.round(totalDecimal * 100 * 10) / 10; // e.g. 44.0

    // Score: map -30% to +50% range → 0 to 100
    const clampedPct = Math.max(-30, Math.min(50, totalPremiumPct));
    const orientationScore = Math.round(((clampedPct + 30) / 80) * 100);

    // Generate human-readable tags
    const tags = [];
    if (facingPremium >= 0.20) tags.push('Corner Premium');
    if (facingPremium >= 0.10 && String(facing || '').toLowerCase().includes('park')) tags.push('Park Facing');
    if (directionPremium >= 0.04) tags.push('Vastu Preferred Direction');
    if (directionPremium <= -0.04) tags.push('South Facing (Discount)');
    if (roadWidthPremium >= 0.18) tags.push('Wide Road Access');
    if (roadWidthPremium <= -0.10) tags.push('Narrow Lane (Discount)');
    if (totalPremiumPct >= 30) tags.push('Prime Asset');
    if (totalPremiumPct <= -10) tags.push('Below Average Location');

    return {
        facingPremium:      Math.round(facingPremium      * 1000) / 10, // as %
        directionPremium:   Math.round(directionPremium   * 1000) / 10,
        roadWidthPremium:   Math.round(roadWidthPremium   * 1000) / 10,
        orientationPremium: Math.round(orientationPremium * 1000) / 10,
        totalPremiumPct,
        orientationScore,
        tags,
    };
}

/**
 * Determines market positioning of a property vs benchmarks.
 * 
 * @param {number} actualRate - Property's rate per unit (e.g. ₹3,500 / Sq.Yd)
 * @param {number} benchmarkRate - Location's avg closed rate per unit
 * @param {number} orientationPremiumPct - Calculated orientation premium (as %)
 * @returns {'undervalued' | 'fair' | 'overpriced' | 'no_data'}
 */
export function calcMarketPositioning(actualRate, benchmarkRate, orientationPremiumPct = 0) {
    if (!actualRate || !benchmarkRate || benchmarkRate <= 0) return 'no_data';

    // Adjust benchmark by orientation premium for apples-to-apples comparison
    const adjustedBenchmark = benchmarkRate * (1 + orientationPremiumPct / 100);
    const deviationPct = ((actualRate - adjustedBenchmark) / adjustedBenchmark) * 100;

    if (deviationPct < -10) return 'undervalued';
    if (deviationPct > 15)  return 'overpriced';
    return 'fair';
}

/**
 * Generates 3 price bands (Aggressive / Fair / Patient) from benchmark data.
 * 
 * @param {number} benchmarkClosedRate - Avg closed rate per unit for location
 * @param {number} areaInStdUnit - Property area in standard unit
 * @param {number} orientationPremiumPct - Orientation premium as %
 * @returns {{ aggressive: number, fair: number, patient: number } | null}
 */
export function calcPriceBands(benchmarkClosedRate, areaInStdUnit, orientationPremiumPct = 0) {
    if (!benchmarkClosedRate || !areaInStdUnit || benchmarkClosedRate <= 0 || areaInStdUnit <= 0) {
        return null;
    }

    const orientedBaseRate = benchmarkClosedRate * (1 + orientationPremiumPct / 100);
    const basePrice = orientedBaseRate * areaInStdUnit;

    return {
        aggressive: Math.round(basePrice * 0.92),  // -8%: Quick sale
        fair:       Math.round(basePrice * 1.00),  // At market
        patient:    Math.round(basePrice * 1.10),  // +10%: Hold for premium
    };
}

/**
 * Formats a number as Indian Rupee string (e.g. "₹ 45,00,000")
 */
export function formatINR(amount) {
    if (!amount || isNaN(amount)) return '₹ N/A';
    return '₹ ' + Math.round(amount).toLocaleString('en-IN');
}

/**
 * Determines if a property is Investor Grade based on price undervaluation.
 * 
 * @param {string} marketPositioning - Output of calcMarketPositioning()
 * @param {number} orientationScore - 0–100 score
 * @returns {'investor' | 'end_user' | 'neutral'}
 */
export function calcBuyerPersona(marketPositioning, orientationScore = 50) {
    if (marketPositioning === 'undervalued') return 'investor';
    if (marketPositioning === 'overpriced') return 'neutral';
    // High orientation score (prime location) + fair price = good for end-user
    if (orientationScore >= 70) return 'end_user';
    return 'neutral';
}
