/**
 * Universal Size and Dimension Resolution Utility
 * Provides senior enterprise-grade extraction, matching, and formatting
 * for property sizes, widths, lengths, and metrics across Inventory and Deal entities.
 */

import { renderValue } from './renderUtils.js';

/**
 * Normalizes dimension metric string to clean display label
 * e.g. "Feet" -> "Ft.", "Meter" -> "Mtr.", "Yard" -> "Yd."
 */
export const getMetricAbbreviation = (metric) => {
    if (!metric) return '';
    const m = String(metric).trim().toLowerCase();
    if (m === 'meter' || m === 'meters' || m === 'mtr' || m === 'm') return 'Mtr.';
    if (m === 'feet' || m === 'ft' || m === 'foot') return 'Ft.';
    if (m === 'yard' || m === 'yards' || m === 'yd') return 'Yd.';
    return metric;
};

/**
 * Formats a raw numeric/string dimension with its metric unit
 * e.g. (24.001, 'Feet') -> "24.001 Ft."
 * e.g. (24, 'Feet', false) -> "24 Feet"
 * e.g. (null, 'Feet') -> "-"
 */
export const formatDimension = (val, metric = 'Feet', useAbbr = true) => {
    if (val === null || val === undefined || val === '' || val === 0 || val === '0' || val === '-') {
        return '-';
    }

    const str = String(val).trim();
    if (!str || str === '-') return '-';

    // If unit is already included in string (e.g. "24 Ft." or "18 Mtr.")
    if (/[a-zA-Z]/.test(str)) {
        return str;
    }

    const num = parseFloat(str);
    if (isNaN(num)) return str;

    if (!useAbbr) {
        const cleanMetric = metric ? String(metric).trim() : 'Feet';
        return `${num} ${cleanMetric}`;
    }

    const unitAbbr = getMetricAbbreviation(metric) || 'Ft.';
    return `${num} ${unitAbbr}`;
};

/**
 * Extracts numeric count and area metric from a size label string containing parentheses.
 * Enterprise standard: The count in brackets represents the true total area in Sq. Yard (Gaj).
 * e.g. "8 Marla (200.01 Sq Yd)" -> { area: 200.01, unit: 'Sq Yard', rawUnit: 'Sq Yd', matched: true }
 * e.g. "14 Marla (381.04 Sq Yd)" -> { area: 381.04, unit: 'Sq Yard', rawUnit: 'Sq Yd', matched: true }
 * e.g. "6 Marla (162.10 Sq Yd)" -> { area: 162.10, unit: 'Sq Yard', rawUnit: 'Sq Yd', matched: true }
 * e.g. "10 Marla (250 Sq Yd)" -> { area: 250, unit: 'Sq Yard', rawUnit: 'Sq Yd', matched: true }
 */
export const extractAreaFromLabel = (label) => {
    if (!label || typeof label !== 'string') return null;
    const match = label.match(/\(\s*([0-9,]+(?:\.[0-9]+)?)\s*([^)]*)\)/);
    if (!match) return null;

    const num = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(num) || num <= 0) return null;

    const unitStr = (match[2] || '').trim().toLowerCase();
    let unit = 'Sq Yard';
    if (unitStr.includes('meter') || unitStr.includes('sqm') || unitStr.includes('sq.m') || unitStr.includes('mtr')) {
        unit = 'Sq Meter';
    } else if (unitStr.includes('feet') || unitStr.includes('sqft') || unitStr.includes('sq.ft') || unitStr.includes('ft')) {
        unit = 'Sq Feet';
    } else if (unitStr.includes('marla')) {
        unit = 'Marla';
    } else if (unitStr.includes('kanal') || unitStr.includes('kananl')) {
        unit = 'Kanal';
    } else if (unitStr.includes('acre')) {
        unit = 'Acre';
    } else if (unitStr.includes('hectare')) {
        unit = 'Hectare';
    }

    return {
        area: num,
        unit,
        rawUnit: match[2]?.trim() || 'Sq Yd',
        matched: true
    };
};

/**
 * Robustly matches an item (Inventory or Deal) to its canonical Size Master record
 * Searches by sizeId, sizeConfig, sizeLabel, size, unitSpecification across multiple shapes.
 *
 * @param {object} item - Inventory or Deal entity
 * @param {object} linkedInventory - Optional linked inventory object
 * @param {Array} sizesList - Master sizes array from usePropertyConfig()
 * @returns {object|null} Matched Size record or null
 */
export const findMatchedSize = (item, linkedInventory = null, sizesList = []) => {
    if (!Array.isArray(sizesList) || sizesList.length === 0) return null;
    if (!item && !linkedInventory) return null;

    const candidates = [];

    const extractVal = (v) => {
        if (!v) return [];
        if (typeof v === 'string') return [v.trim()];
        if (typeof v === 'number') return [String(v)];
        if (typeof v === 'object') {
            const arr = [];
            if (v._id) arr.push(String(v._id));
            if (v.id) arr.push(String(v.id));
            if (v.lookup_value) arr.push(String(v.lookup_value).trim());
            if (v.name) arr.push(String(v.name).trim());
            if (v.label) arr.push(String(v.label).trim());
            return arr;
        }
        return [];
    };

    // 1. Direct IDs
    if (item?.sizeId) candidates.push(String(item.sizeId));
    if (linkedInventory?.sizeId) candidates.push(String(linkedInventory.sizeId));

    // 2. sizeConfig
    candidates.push(...extractVal(item?.sizeConfig));
    candidates.push(...extractVal(linkedInventory?.sizeConfig));

    // 3. sizeLabel
    candidates.push(...extractVal(item?.sizeLabel));
    candidates.push(...extractVal(linkedInventory?.sizeLabel));

    // 4. unitSpecification
    candidates.push(...extractVal(item?.unitSpecification?.sizeLabel));
    candidates.push(...extractVal(item?.unitSpecification?.sizeConfig));
    candidates.push(...extractVal(linkedInventory?.unitSpecification?.sizeLabel));
    candidates.push(...extractVal(linkedInventory?.unitSpecification?.sizeConfig));

    // 5. size field
    candidates.push(...extractVal(item?.size));
    candidates.push(...extractVal(linkedInventory?.size));

    // Deduplicate and filter non-empty candidates
    const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

    // Priority 1: Exact Mongo ID or string ID match
    for (const cand of uniqueCandidates) {
        const found = sizesList.find(s => String(s.id || s._id) === cand);
        if (found) return found;
    }

    // Priority 2: Exact Name match (case-insensitive & trimmed)
    for (const cand of uniqueCandidates) {
        const lower = cand.toLowerCase();
        const found = sizesList.find(s => {
            const sName = String(s.name || s.lookup_value || '').trim().toLowerCase();
            return sName === lower;
        });
        if (found) return found;
    }

    // Priority 3: Normalized Whitespace Name match
    for (const cand of uniqueCandidates) {
        const normCand = cand.toLowerCase().replace(/\s+/g, ' ');
        const found = sizesList.find(s => {
            const sName = String(s.name || s.lookup_value || '').toLowerCase().replace(/\s+/g, ' ');
            return sName === normCand;
        });
        if (found) return found;
    }

    // Priority 4: Fuzzy containment (e.g. "8 Marla (200.01 Sq Yd)" matching "8 Marla")
    for (const cand of uniqueCandidates) {
        if (cand.length >= 4) {
            const lower = cand.toLowerCase();
            const found = sizesList.find(s => {
                const sName = String(s.name || s.lookup_value || '').toLowerCase();
                return sName && (sName.startsWith(lower) || lower.startsWith(sName));
            });
            if (found) return found;
        }
    }

    return null;
};

/**
 * Universal resolver for Unit Dimensions & Size specifications.
 * Seamlessly resolves real database width & length from:
 * 1. Direct entity properties (width, frontage, depth, length)
 * 2. Embedded unitSpecification properties
 * 3. Linked Inventory properties (for Deals)
 * 4. Matched canonical Size record from database lookup/cache
 *
 * @param {object} item - Inventory or Deal entity
 * @param {object} options - Options bag { linkedInventory, sizes, getLookupValue }
 * @returns {object} Resolved dimensions, metrics, and formatted labels
 */
export const resolveUnitDimensionsAndSize = (item, options = {}) => {
    const {
        linkedInventory = null,
        sizes = [],
        getLookupValue = (type, val) => renderValue(val)
    } = options;

    if (!item && !linkedInventory) {
        return {
            sizeLabel: '-',
            fullSizeText: '-',
            width: null,
            length: null,
            widthMetric: 'Feet',
            lengthMetric: 'Feet',
            formattedWidth: '-',
            formattedLength: '-',
            totalArea: null,
            resultMetric: 'Sq Yd',
            matchedSize: null
        };
    }

    const primary = item || linkedInventory;
    const inv = linkedInventory || (item?.inventoryId && typeof item.inventoryId === 'object' ? item.inventoryId : null);

    // 1. Find Matched Canonical Size
    const matchedSize = findMatchedSize(primary, inv, sizes);

    // 2. Resolve Raw Width
    const isPresent = (v) => v !== null && v !== undefined && v !== '' && v !== 0 && v !== '0' && v !== '-';

    let rawWidth = null;
    if (isPresent(primary?.width)) rawWidth = primary.width;
    else if (isPresent(primary?.frontage)) rawWidth = primary.frontage;
    else if (isPresent(primary?.unitSpecification?.width)) rawWidth = primary.unitSpecification.width;
    else if (isPresent(inv?.width)) rawWidth = inv.width;
    else if (isPresent(inv?.frontage)) rawWidth = inv.frontage;
    else if (isPresent(inv?.unitSpecification?.width)) rawWidth = inv.unitSpecification.width;
    else if (isPresent(matchedSize?.width)) rawWidth = matchedSize.width;
    else if (isPresent(matchedSize?.metadata?.width)) rawWidth = matchedSize.metadata.width;

    // 3. Resolve Raw Length
    let rawLength = null;
    if (isPresent(primary?.length)) rawLength = primary.length;
    else if (isPresent(primary?.depth)) rawLength = primary.depth;
    else if (isPresent(primary?.unitSpecification?.length)) rawLength = primary.unitSpecification.length;
    else if (isPresent(inv?.length)) rawLength = inv.length;
    else if (isPresent(inv?.depth)) rawLength = inv.depth;
    else if (isPresent(inv?.unitSpecification?.length)) rawLength = inv.unitSpecification.length;
    else if (isPresent(matchedSize?.length)) rawLength = matchedSize.length;
    else if (isPresent(matchedSize?.metadata?.length)) rawLength = matchedSize.metadata.length;

    // 4. Resolve Metrics (prioritize unit's saved metric over master template)
    const widthMetric = primary?.widthMetric || 
                        primary?.dimensionMetric ||
                        primary?.unitSpecification?.widthMetric || 
                        inv?.widthMetric || 
                        inv?.dimensionMetric ||
                        inv?.unitSpecification?.widthMetric || 
                        matchedSize?.widthMetric || 
                        matchedSize?.dimensionMetric ||
                        matchedSize?.metadata?.widthMetric || 
                        'Feet';

    const lengthMetric = primary?.lengthMetric || 
                         primary?.dimensionMetric ||
                         primary?.unitSpecification?.lengthMetric || 
                         inv?.lengthMetric || 
                         inv?.dimensionMetric ||
                         inv?.unitSpecification?.lengthMetric || 
                         matchedSize?.lengthMetric || 
                         matchedSize?.dimensionMetric ||
                         matchedSize?.metadata?.lengthMetric || 
                         'Feet';

    // 5. Resolve Formatted Width & Length
    const formattedWidth = formatDimension(rawWidth, widthMetric);
    const formattedLength = formatDimension(rawLength, lengthMetric);

    // 6. Resolve Size Label
    let resolvedSizeLabel = null;
    if (matchedSize?.name) {
        resolvedSizeLabel = matchedSize.name;
    } else if (matchedSize?.unitType && matchedSize?.totalArea) {
        resolvedSizeLabel = `${matchedSize.unitType} (${matchedSize.totalArea} ${matchedSize.resultMetric || 'Sq Yd'})`.trim();
    } else if (primary?.totalLandAreaText) {
        resolvedSizeLabel = primary.totalLandAreaText;
    } else {
        const safeLookup = (cat, val) => {
            if (!val || val === '-') return null;
            try {
                const res = getLookupValue(cat, val);
                if (!res || res === '-' || res === 'undefined' || res === 'null') return null;
                return res;
            } catch (e) {
                return null;
            }
        };

        const extractStr = (val) => {
            if (!val) return null;
            if (typeof val === 'string') return /^[0-9a-fA-F]{24}$/.test(val) ? null : val;
            if (typeof val === 'object') {
                return val.lookup_value || val.name || val.label || null;
            }
            return null;
        };

        resolvedSizeLabel = 
            safeLookup('Size', primary?.sizeConfig) ||
            extractStr(primary?.sizeConfig) ||
            safeLookup('PropertyType', primary?.sizeType) ||
            extractStr(primary?.sizeType) ||
            safeLookup('Size', primary?.sizeLabel) ||
            extractStr(primary?.sizeLabel) ||
            extractStr(primary?.unitSpecification?.sizeLabel) ||
            (typeof primary?.size === 'string' && primary.size !== '0' && primary.size !== '0 Sq.Ft.' ? primary.size : null) ||
            safeLookup('Size', inv?.sizeConfig) ||
            extractStr(inv?.sizeConfig) ||
            safeLookup('Size', inv?.sizeLabel) ||
            extractStr(inv?.sizeLabel) ||
            (typeof inv?.size === 'string' && inv.size !== '0' ? inv.size : null) ||
            '-';
    }

    // 7. Full Size Text (Unit Type • SubCategory • Size Label)
    const unitTypeVal = getLookupValue ? getLookupValue('UnitType', primary?.unitType || inv?.unitType) : null;
    const subCatVal = getLookupValue ? getLookupValue('SubCategory', primary?.subCategory || inv?.subCategory) : null;
    
    const parts = [
        unitTypeVal && unitTypeVal !== '-' ? unitTypeVal : null,
        subCatVal && subCatVal !== '-' ? subCatVal : null,
        resolvedSizeLabel && resolvedSizeLabel !== '-' ? resolvedSizeLabel : null
    ].filter(Boolean);

    const fullSizeText = parts.length > 0 ? parts.join(' • ') : (resolvedSizeLabel || '-');

    // 8. Resolve Total Area & Bracket Area
    const bracketInfo = extractAreaFromLabel(resolvedSizeLabel) || extractAreaFromLabel(matchedSize?.name);
    const resolvedTotalArea = bracketInfo?.area || matchedSize?.totalArea || matchedSize?.metadata?.totalArea || null;
    const resolvedResultMetric = bracketInfo?.unit || matchedSize?.resultMetric || matchedSize?.metadata?.resultMetric || 'Sq Yd';

    return {
        sizeLabel: resolvedSizeLabel || '-',
        fullSizeText,
        width: rawWidth,
        length: rawLength,
        widthMetric,
        lengthMetric,
        formattedWidth,
        formattedLength,
        totalArea: resolvedTotalArea,
        resultMetric: resolvedResultMetric,
        bracketArea: bracketInfo?.area || null,
        bracketUnit: bracketInfo?.unit || null,
        matchedSize
    };
};
