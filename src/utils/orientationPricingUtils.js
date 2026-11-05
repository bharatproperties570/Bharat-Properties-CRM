/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * AUTHORITATIVE ORIENTATION BASE PRICE ADJUSTMENT ENGINE
 * Bharat Properties CRM — Enterprise Valuation Module
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Exact specifications provided for Haryana / Kurukshetra micro-markets.
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
