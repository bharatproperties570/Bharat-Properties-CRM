import mongoose from 'mongoose';
import SystemSetting from '../src/modules/systemSettings/system.model.js';

export const DEFAULT_QUALIFICATION_FIELDS = [
    // ─── Requirement Page Fields (12 Form Fields) ─────────────────────────
    { key: 'requirement', label: 'Requirement Type', tab: 'requirement', isCore: true },
    { key: 'propertyType', label: 'Categories', tab: 'requirement', isCore: true },
    { key: 'subType', label: 'Sub-Categories', tab: 'requirement', isCore: true },
    { key: 'sizeType', label: 'Size Type / Configuration', tab: 'requirement', isCore: true },
    { key: 'budgetMin', label: 'Budget Range', tab: 'requirement', isCore: true, aliases: ['budgetMax', 'budget'] },
    { key: 'timeline', label: 'Timeline', tab: 'requirement', isCore: true },
    { key: 'areaMin', label: 'Area Range', tab: 'requirement', isCore: false, aliases: ['areaMax'] },
    { key: 'areaMetric', label: 'Area Metric', tab: 'requirement', isCore: false },
    { key: 'funding', label: 'Funding Source', tab: 'requirement', isCore: false },
    { key: 'furnishing', label: 'Furnishing Status', tab: 'requirement', isCore: false },
    { key: 'transactionType', label: 'Transaction Type', tab: 'requirement', isCore: false, aliases: ['whitePortion'] },
    { key: 'purpose', label: 'Purpose', tab: 'requirement', isCore: false },

    // ─── Location Page Fields (16 Form Fields) ─────────────────────────────
    { key: 'locCity', label: 'City', tab: 'location', isCore: true, aliases: ['projectCity'] },
    { key: 'locArea', label: 'Area / Sector', tab: 'location', isCore: true, aliases: ['sector', 'projectName'] },
    { key: 'locState', label: 'State', tab: 'location', isCore: false },
    { key: 'searchLocation', label: 'Search Location / Landmark', tab: 'location', isCore: false },
    { key: 'range', label: 'Proximity Range', tab: 'location', isCore: false },
    { key: 'projectCity', label: 'Project City', tab: 'location', isCore: false, aliases: ['locCity'] },
    { key: 'projectName', label: 'Project Name', tab: 'location', isCore: false },
    { key: 'projectTowers', label: 'Block / Tower', tab: 'location', isCore: false },
    { key: 'locPinCode', label: 'Pin Code', tab: 'location', isCore: false, aliases: ['locPincode'] },
    { key: 'locHNo', label: 'House / Flat No.', tab: 'location', isCore: false, aliases: ['propertyNo'] },
    { key: 'locStreet', label: 'Street / Road', tab: 'location', isCore: false },
    { key: 'propertyNo', label: 'Specific Unit Number', tab: 'location', isCore: false, aliases: ['locHNo'] },
    { key: 'unitType', label: 'Unit Type', tab: 'location', isCore: false },
    { key: 'facing', label: 'Facing', tab: 'location', isCore: false },
    { key: 'roadWidth', label: 'Road Width', tab: 'location', isCore: false },
    { key: 'direction', label: 'Direction', tab: 'location', isCore: false }
];

export const DEFAULT_QUALIFICATION_RULE = {
    enabled: true,
    targetStage: 'Prospect',
    thresholdPercent: 80,
    selectedFields: DEFAULT_QUALIFICATION_FIELDS.filter(f => f.isCore).map(f => f.key),
    customFields: []
};

// In-memory cache with 30s TTL
let cachedRule = null;
let cacheExpiry = 0;

export const invalidateQualificationRulesCache = () => {
    cachedRule = null;
    cacheExpiry = 0;
};

export const getQualificationRule = async () => {
    const now = Date.now();
    if (cachedRule && now < cacheExpiry) {
        return cachedRule;
    }

    if (mongoose.connection.readyState !== 1) {
        return cachedRule || { ...DEFAULT_QUALIFICATION_RULE };
    }

    try {
        const setting = await SystemSetting.findOne({ key: 'stage_qualification_rules' }).lean();
        if (setting && setting.value) {
            cachedRule = {
                enabled: setting.value.enabled !== undefined ? setting.value.enabled : DEFAULT_QUALIFICATION_RULE.enabled,
                targetStage: setting.value.targetStage || DEFAULT_QUALIFICATION_RULE.targetStage,
                thresholdPercent: Number(setting.value.thresholdPercent) || DEFAULT_QUALIFICATION_RULE.thresholdPercent,
                selectedFields: Array.isArray(setting.value.selectedFields) && setting.value.selectedFields.length > 0
                    ? setting.value.selectedFields
                    : DEFAULT_QUALIFICATION_RULE.selectedFields,
                customFields: Array.isArray(setting.value.customFields) ? setting.value.customFields : []
            };
        } else {
            cachedRule = { ...DEFAULT_QUALIFICATION_RULE };
        }
    } catch (err) {
        console.warn('[leadDataCompleteness] Error fetching stage_qualification_rules setting, using defaults:', err.message);
        cachedRule = { ...DEFAULT_QUALIFICATION_RULE };
    }

    cacheExpiry = now + 30000; // 30 seconds TTL
    return cachedRule;
};

/**
 * Dynamically resolves all available qualification fields,
 * including default fields and any custom fields discovered in the system.
 */
export const getAvailableQualificationFields = async () => {
    const rule = await getQualificationRule();
    const fields = [...DEFAULT_QUALIFICATION_FIELDS];
    const existingKeys = new Set(fields.map(f => f.key));

    // 1. Merge any custom fields configured in stage_qualification_rules
    if (Array.isArray(rule.customFields)) {
        for (const cf of rule.customFields) {
            const key = typeof cf === 'string' ? cf : cf.key;
            const label = typeof cf === 'string' ? cf : (cf.label || cf.key);
            const tab = typeof cf === 'object' && cf.tab ? cf.tab : 'requirement';
            if (key && !existingKeys.has(key)) {
                fields.push({
                    key,
                    label,
                    tab,
                    isCore: false,
                    isCustom: true
                });
                existingKeys.add(key);
            }
        }
    }

    // 2. Discover custom attributes from leadMasterFields if present
    if (mongoose.connection.readyState === 1) {
        try {
            const masterFieldsSetting = await SystemSetting.findOne({ key: 'leadMasterFields' }).lean();
            if (masterFieldsSetting && masterFieldsSetting.value) {
                const val = masterFieldsSetting.value;
                // Scan for custom attributes or dropdowns
                if (Array.isArray(val.customAttributes)) {
                    for (const attr of val.customAttributes) {
                        const key = attr.key || attr.name;
                        if (key && !existingKeys.has(key)) {
                            fields.push({
                                key,
                                label: attr.label || key,
                                tab: attr.tab || 'requirement',
                                isCore: false,
                                isCustom: true
                            });
                            existingKeys.add(key);
                        }
                    }
                }
            }
        } catch (err) {
            // Soft fail
        }
    }

    return fields;
};

/**
 * Checks if a specific field has a meaningful filled value on the lead object.
 */
export const isFieldFilled = (lead, fieldKey, aliases = []) => {
    if (!lead) return false;

    const checkValue = (val) => {
        if (val === undefined || val === null || val === '') return false;
        if (typeof val === 'string') return val.trim().length > 0;
        if (Array.isArray(val)) return val.length > 0 && val.some(v => v !== null && v !== undefined && v !== '');
        if (typeof val === 'number') return !isNaN(val) && val > 0;
        if (typeof val === 'boolean') return true;
        if (typeof val === 'object') {
            if (val._id || val.lookup_value || val.name || val.label) return true;
            return Object.keys(val).length > 0;
        }
        return false;
    };

    // 1. Direct field check
    if (checkValue(lead[fieldKey])) return true;

    // 2. Custom fields check (e.g. lead.customFields?.fieldName)
    if (lead.customFields) {
        if (checkValue(lead.customFields[fieldKey])) return true;
        if (typeof lead.customFields.get === 'function' && checkValue(lead.customFields.get(fieldKey))) return true;
    }

    // 3. Aliases check (e.g. budgetMin or budgetMax or budget)
    if (Array.isArray(aliases)) {
        for (const alias of aliases) {
            if (checkValue(lead[alias])) return true;
            if (lead.customFields) {
                if (checkValue(lead.customFields[alias])) return true;
                if (typeof lead.customFields.get === 'function' && checkValue(lead.customFields.get(alias))) return true;
            }
        }
    }

    return false;
};

/**
 * Evaluates whether a Lead satisfies the active stage qualification business rule.
 *
 * @param {Object} leadData - The lead payload or doc being saved/updated
 * @param {Object} existingLead - (Optional) The existing lead in case of partial update
 * @returns {Promise<{ qualified: boolean, score: number, targetStage: string, threshold: number, filledCount: number, totalCount: number, filledFields: string[], missingFields: string[], rule: Object }>}
 */
export const evaluateLeadStageQualification = async (leadData = {}, existingLead = null) => {
    const rule = await getQualificationRule();

    if (!rule.enabled) {
        return {
            qualified: false,
            score: 0,
            targetStage: rule.targetStage || 'Prospect',
            threshold: Number(rule.thresholdPercent) || 80,
            filledCount: 0,
            totalCount: 0,
            filledFields: [],
            missingFields: [],
            rule
        };
    }

    // Merge existing and new data for evaluation
    const merged = {
        ...(existingLead ? (existingLead.toObject ? existingLead.toObject() : existingLead) : {}),
        ...leadData
    };

    // Combine selected fields and any active custom fields
    const allSelectedKeys = [
        ...(rule.selectedFields || []),
        ...(rule.customFields || []).map(cf => typeof cf === 'string' ? cf : cf.key)
    ];

    // Deduplicate
    const uniqueKeys = [...new Set(allSelectedKeys)].filter(Boolean);

    if (uniqueKeys.length === 0) {
        return {
            qualified: false,
            score: 0,
            targetStage: rule.targetStage || 'Prospect',
            threshold: Number(rule.thresholdPercent) || 80,
            filledCount: 0,
            totalCount: 0,
            filledFields: [],
            missingFields: [],
            rule
        };
    }

    const availableFields = await getAvailableQualificationFields();
    const fieldDefinitionsMap = new Map();
    for (const f of availableFields) {
        fieldDefinitionsMap.set(f.key, f);
    }

    let filledCount = 0;
    const filledFields = [];
    const missingFields = [];

    for (const key of uniqueKeys) {
        const def = fieldDefinitionsMap.get(key);
        const aliases = def?.aliases || [];

        if (isFieldFilled(merged, key, aliases)) {
            filledCount++;
            filledFields.push(key);
        } else {
            missingFields.push(key);
        }
    }

    const score = Math.round((filledCount / uniqueKeys.length) * 100);
    const threshold = Number(rule.thresholdPercent) || 80;
    const qualified = score >= threshold;

    return {
        qualified,
        score,
        targetStage: rule.targetStage || 'Prospect',
        threshold,
        filledCount,
        totalCount: uniqueKeys.length,
        filledFields,
        missingFields,
        rule
    };
};

/**
 * Backward-compatible helper for legacy references.
 */
export const checkLeadQualifiedStatus = (lead) => {
    if (!lead) return false;
    const coreFields = [
        'requirement', 'budget', 'propertyType', 'subType',
        'unitType', 'sizeType', 'purpose', 'timeline', 'locCity', 'locArea'
    ];

    let filledCount = 0;
    for (const field of coreFields) {
        if (isFieldFilled(lead, field)) filledCount++;
    }

    const percentage = (filledCount / coreFields.length) * 100;
    return percentage >= 80;
};

export default {
    DEFAULT_QUALIFICATION_FIELDS,
    DEFAULT_QUALIFICATION_RULE,
    getQualificationRule,
    getAvailableQualificationFields,
    evaluateLeadStageQualification,
    checkLeadQualifiedStatus,
    invalidateQualificationRulesCache
};
