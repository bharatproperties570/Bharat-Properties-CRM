/**
 * ============================================================================
 *  AUTHORITY PROPERTY VERIFICATION — NORMALIZATION RULES
 *  Phase 1.1: Pure functions only. No I/O, no HTTP, no DB access.
 * ============================================================================
 *
 *  All normalizers:
 *    - Accept a raw string value and return a normalized result
 *    - Never clear/overwrite existing CRM data
 *    - Distinguish FALSE from UNKNOWN / NOT_RETURNED / PARSE_ERROR
 *    - Preserve source labels alongside normalized values
 *    - Do not perform area-unit conversions
 *
 *  Phase 1.2 corrections:
 *    - Categorical boolean: NO substring inference for litigation/mortgage
 *    - Pending/Rejected/Under review → CATEGORICAL_STATUS (never coerced)
 *    - Composite key includes phaseCode when present
 *    - sectorNumber handler detects misrouted phase values
 *    - blockCode handler added
 *
 *  @module authorityNormalizer
 *  @version 1.2.0-phase1.2
 */

import crypto from 'crypto';
import { SENTINEL, parseAreaString, isSentinel, createImmutableSet, createReadOnlySetProxy, deepFreeze } from './authorityFieldDictionary.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Date parsing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parse dates from Indian authority sources.
 * Handles: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, and text like "12 Jan 2024"
 *
 * Returns { date: Date|null, raw: string, sentinel: string|null }
 * Never returns a silent zero-date.
 */
export const parseAuthorityDate = (raw) => {
    if (raw === undefined || raw === null) {
        return { date: null, raw: '', sentinel: 'NOT_RETURNED' };
    }
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === '-' || trimmed === 'N/A' || trimmed === 'NA' || /^not\s/i.test(trimmed)) {
        return { date: null, raw: trimmed, sentinel: 'NOT_RETURNED' };
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmy) {
        const [, d, m, y] = dmy;
        const day = parseInt(d), month = parseInt(m), year = parseInt(y);
        if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
            return { date: null, raw: trimmed, sentinel: 'PARSE_ERROR' };
        }
        const date = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(date.getTime()) && date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
            return { date, raw: trimmed, sentinel: null };
        }
        return { date: null, raw: trimmed, sentinel: 'PARSE_ERROR' };
    }

    // YYYY-MM-DD (ISO) — construct in UTC explicitly
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const [, y, m, d] = iso;
        const year = parseInt(y), month = parseInt(m), day = parseInt(d);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(date.getTime()) && date.getUTCFullYear() === year) {
            return { date, raw: trimmed, sentinel: null };
        }
        return { date: null, raw: trimmed, sentinel: 'PARSE_ERROR' };
    }

    // Text date: "12 Jan 2024", "January 12, 2024"
    const MONTH_MAP = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5,
        jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
        oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
    };
    const textDmy = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (textDmy) {
        const [, d, mName, y] = textDmy;
        const mIdx = MONTH_MAP[mName.toLowerCase()];
        if (mIdx !== undefined) {
            const date = new Date(Date.UTC(parseInt(y), mIdx, parseInt(d)));
            if (!isNaN(date.getTime()) && date.getUTCFullYear() === parseInt(y)) {
                return { date, raw: trimmed, sentinel: null };
            }
        }
    }
    const textMdy = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (textMdy) {
        const [, mName, d, y] = textMdy;
        const mIdx = MONTH_MAP[mName.toLowerCase()];
        if (mIdx !== undefined) {
            const date = new Date(Date.UTC(parseInt(y), mIdx, parseInt(d)));
            if (!isNaN(date.getTime()) && date.getUTCFullYear() === parseInt(y)) {
                return { date, raw: trimmed, sentinel: null };
            }
        }
    }

    return { date: null, raw: trimmed, sentinel: 'PARSE_ERROR' };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Currency / amount parsing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parse a currency amount from authority sources.
 * Handles: "₹ 12,50,000", "Rs. 1250000", "12.5 Lac", "1.5 Cr", bare numbers.
 * Always assumes INR.
 *
 * Phase 1.1: Consistent sentinel representation.
 *   - Missing/null → { value: null, currency: 'INR', raw: '', sentinel: 'NOT_RETURNED' }
 *   - Actual zero → { value: 0, currency: 'INR', raw: '...', sentinel: null } (zero ≠ missing)
 *   - Unparseable → { value: null, currency: 'INR', raw: '...', sentinel: 'PARSE_ERROR' }
 */
export const parseCurrencyAmount = (raw) => {
    if (raw === undefined || raw === null) {
        return { value: null, currency: 'INR', raw: '', sentinel: 'NOT_RETURNED' };
    }
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === '-' || trimmed === 'N/A' || trimmed === 'NA') {
        return { value: null, currency: 'INR', raw: trimmed, sentinel: 'NOT_RETURNED' };
    }

    // Remove currency symbols and "Rs" prefix
    let cleaned = trimmed
        .replace(/^[₹$]?\s*/i, '')
        .replace(/^Rs\.?\s*/i, '')
        .replace(/^INR\s*/i, '')
        .replace(/[,\s]/g, '')  // strip commas and whitespace within number
        .trim();

    // Handle Lac/Lakh/Cr/Crore suffixes
    const multiplierMatch = cleaned.match(/^([\d.]+)\s*(lac|lakh|lacs|lakhs|cr|crore|crores)$/i);
    if (multiplierMatch) {
        const num = parseFloat(multiplierMatch[1]);
        const suffix = multiplierMatch[2].toLowerCase();
        if (isNaN(num)) {
            return { value: null, currency: 'INR', raw: trimmed, sentinel: 'PARSE_ERROR' };
        }
        const multiplier = (suffix.startsWith('cr')) ? 10000000 : 100000;
        return { value: num * multiplier, currency: 'INR', raw: trimmed, sentinel: null };
    }

    // Bare number
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
        return { value: null, currency: 'INR', raw: trimmed, sentinel: 'PARSE_ERROR' };
    }
    // Actual zero is a valid value, distinct from missing
    return { value: num, currency: 'INR', raw: trimmed, sentinel: null };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Boolean / status normalization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Normalize a STRICTLY BOOLEAN yes/no field from authority sources.
 *
 * Phase 1.1 CRITICAL CHANGE: This normalizer must ONLY be applied to fields
 * whose semantic question is verified to be yes/no. It must NOT be applied
 * to categorical status fields like authority status or possession status.
 *
 * Recognized positive: yes, true, y, haan, ha (and native boolean true)
 * Recognized negative: no, false, n, nahi, nhin (and native boolean false)
 *
 * Words like "Approved", "Rejected", "Issued", "Not Issued", "Not Applied"
 * are NOT globally Boolean. They are field-specific categorical responses.
 * Use normalizeCategoricalBoolean() with an explicit field context instead.
 *
 * It NEVER defaults missing to false.
 */
export const normalizeBooleanStatus = (raw) => {
    if (raw === undefined || raw === null) {
        return { value: null, sentinel: 'NOT_RETURNED', raw: '' };
    }
    if (typeof raw === 'boolean') {
        return { value: raw, sentinel: null, raw: String(raw) };
    }
    const trimmed = String(raw).trim();
    if (!trimmed) {
        return { value: null, sentinel: 'NOT_RETURNED', raw: '' };
    }

    const lower = trimmed.toLowerCase();

    // Explicit positive — only universal yes/no words
    if (['yes', 'true', 'y', 'haan', 'ha'].includes(lower)) {
        return { value: true, sentinel: null, raw: trimmed };
    }

    // Explicit negative — only universal yes/no words
    if (['no', 'false', 'n', 'nahi', 'nhin'].includes(lower)) {
        return { value: false, sentinel: null, raw: trimmed };
    }

    // Explicit N/A
    if (['n/a', 'na', 'not applicable', '-', '--', '—'].includes(lower)) {
        return { value: null, sentinel: 'NOT_APPLICABLE', raw: trimmed };
    }

    // Masked / restricted patterns
    if (/^\*+$/.test(trimmed) || lower === 'restricted' || lower === 'masked' || lower === 'hidden') {
        return { value: null, sentinel: 'RESTRICTED', raw: trimmed };
    }

    // Any other non-empty string — it's not a simple yes/no.
    // Return as unresolved categorical text; caller must interpret in context.
    return { value: null, sentinel: 'PARSE_ERROR', raw: trimmed, detail: trimmed };
};

/**
 * Normalize a FIELD-SPECIFIC categorical boolean from authority sources.
 *
 * Phase 1.2 SAFETY FIX: No substring inference. Only exact, unambiguous
 * phrases are resolved to true/false. Pending, under review, rejected,
 * descriptive text, mixed/contradictory wording and unknown wording
 * produce a CATEGORICAL_STATUS sentinel with the source text preserved
 * as a non-decisive observation — never as a legal conclusion.
 *
 * @param {*} raw - Raw value from authority source
 * @param {string} fieldContext - Which canonical field this is for
 * @returns {{ value: boolean|null, sentinel: string|null, raw: string, detail?: string, status?: string }}
 *
 * Phase 1.2 field contexts:
 *   - buildingPlanApproved:  Approved/Sanctioned → true.  Not Approved/Not Applied → false.
 *                            Pending/Rejected/Under review → CATEGORICAL_STATUS (not coerced)
 *   - occupancyCertificate:  Issued/Granted/Received → true.  Not Issued → false.
 *                            Pending/Under review → CATEGORICAL_STATUS
 *   - litigationStatus:      ONLY exact "No"/"No court case"/"No pending court case"/"No litigation" → false.
 *                            ONLY exact "Yes" → true. All descriptive text → CATEGORICAL_STATUS (observation).
 *   - mortgageStatus:        ONLY exact "No"/"No mortgage"/"Not under mortgage" → false.
 *                            ONLY exact "Yes" → true. All descriptive text → CATEGORICAL_STATUS.
 */
export const normalizeCategoricalBoolean = (raw, fieldContext) => {
    // First try universal yes/no
    const baseResult = normalizeBooleanStatus(raw);
    if (baseResult.sentinel !== 'PARSE_ERROR') {
        return baseResult; // Was yes/no/null/N-A/restricted — resolved
    }

    // The base normalizer returned PARSE_ERROR — it's a categorical string.
    // Interpret it based on the field context using EXACT phrase matching only.
    const lower = baseResult.detail?.toLowerCase()?.trim() || '';

    switch (fieldContext) {
        case 'buildingPlanApproved': {
            // Clearly affirmative
            if (['approved', 'sanctioned'].includes(lower)) {
                return { value: true, sentinel: null, raw: baseResult.raw };
            }
            // Clearly negative
            if (['not approved', 'not applied', 'not sanctioned'].includes(lower)) {
                return { value: false, sentinel: null, raw: baseResult.raw };
            }
            // Indeterminate / non-coercible statuses
            if (['pending', 'under review', 'rejected', 'granted'].includes(lower)) {
                return {
                    value: null, sentinel: 'CATEGORICAL_STATUS',
                    raw: baseResult.raw, status: baseResult.detail,
                };
            }
            break;
        }
        case 'occupancyCertificate': {
            // Clearly affirmative
            if (['issued', 'granted', 'received'].includes(lower)) {
                return { value: true, sentinel: null, raw: baseResult.raw };
            }
            // Clearly negative
            if (['not issued', 'not applied'].includes(lower)) {
                return { value: false, sentinel: null, raw: baseResult.raw };
            }
            // Indeterminate
            if (['pending', 'under review'].includes(lower)) {
                return {
                    value: null, sentinel: 'CATEGORICAL_STATUS',
                    raw: baseResult.raw, status: baseResult.detail,
                };
            }
            break;
        }
        case 'litigationStatus': {
            // Exact negative phrases — NO substring inference
            if (['no court case', 'no pending court case', 'no litigation',
                 'no dispute', 'nil', 'none'].includes(lower)) {
                return { value: false, sentinel: null, raw: baseResult.raw, controlledString: 'NO_LITIGATION' };
            }
            // Any other non-trivial text is an observation, NOT a legal conclusion.
            // We preserve it but do NOT coerce to true or false.
            return {
                value: null, sentinel: 'CATEGORICAL_STATUS',
                raw: baseResult.raw, status: baseResult.detail,
                note: 'Descriptive litigation text preserved as observation. Not treated as boolean.',
            };
        }
        case 'mortgageStatus': {
            // Exact negative phrases — NO substring inference
            if (['no mortgage', 'not under mortgage', 'mortgage cleared',
                 'nil', 'none', 'cleared'].includes(lower)) {
                return { value: false, sentinel: null, raw: baseResult.raw, controlledString: 'NO_MORTGAGE' };
            }
            // Any other non-trivial text is an observation
            return {
                value: null, sentinel: 'CATEGORICAL_STATUS',
                raw: baseResult.raw, status: baseResult.detail,
                note: 'Descriptive mortgage text preserved as observation. Not treated as boolean.',
            };
        }
        // No default — fall through to PARSE_ERROR
    }

    // Could not resolve — return as unresolved with preserved detail
    return {
        value: null,
        sentinel: 'PARSE_ERROR',
        raw: baseResult.raw,
        detail: baseResult.detail,
    };
};

/**
 * Normalizes litigation/court-case observations to the canonical String contract:
 * - String: Controlled 'NO_LITIGATION' for verified explicit negative statements.
 * - String: Controlled 'LITIGATION_REPORTED' for explicit affirmative statements without details.
 * - String: Preserved trimmed observation text for nuanced categorical statuses
 *   (e.g., 'Litigation pending in High Court', 'Matter disposed', 'Case dismissed').
 * - Sentinel: { _sentinel: 'NOT_RETURNED' | 'RESTRICTED' | 'PARSE_ERROR' } for missing, null, or restricted data.
 *
 * CRITICAL SAFETY RULES:
 * 1. Absence of litigation is NEVER inferred from missing, null, empty, or error states.
 * 2. Never outputs a JavaScript Boolean (persistence schema is strictly String).
 * 3. Never alters top-level Inventory.status.
 *
 * @param {*} rawVal
 * @returns {string|object} Controlled String, observation String, or strict sentinel object
 */
export const normalizeLitigationStatus = (rawVal) => {
    if (rawVal === null || rawVal === undefined) {
        return SENTINEL.NOT_RETURNED;
    }
    if (isSentinel(rawVal) || (typeof rawVal === 'object' && rawVal._sentinel && rawVal._sentinel !== 'CATEGORICAL_STATUS')) {
        return { _sentinel: rawVal._sentinel || rawVal.sentinel };
    }

    let text = '';
    let rawStr = '';
    if (typeof rawVal === 'object') {
        if (rawVal.value === false || rawVal.controlledString === 'NO_LITIGATION') {
            return { value: false, sentinel: null, raw: rawVal.raw || 'No', controlledString: 'NO_LITIGATION' };
        }
        if (rawVal.value === true || rawVal.controlledString === 'LITIGATION_REPORTED') {
            return { value: true, sentinel: null, raw: rawVal.raw || 'Yes', controlledString: 'LITIGATION_REPORTED' };
        }
        text = String(rawVal.status || rawVal.detail || rawVal.raw || '').trim();
        rawStr = String(rawVal.raw || text);
    } else if (typeof rawVal === 'boolean') {
        return rawVal
            ? { value: true, sentinel: null, raw: 'Yes', controlledString: 'LITIGATION_REPORTED' }
            : { value: false, sentinel: null, raw: 'No', controlledString: 'NO_LITIGATION' };
    } else {
        text = String(rawVal).trim();
        rawStr = text;
    }

    if (text === '') {
        return SENTINEL.NOT_RETURNED;
    }

    const lower = text.toLowerCase();

    // Explicit negative phrases
    const explicitNegatives = [
        'no', 'no litigation', 'no court case', 'no pending court case',
        'no dispute', 'nil', 'none', 'clear', 'no pending case', 'not in litigation'
    ];
    if (explicitNegatives.includes(lower)) {
        return { value: false, sentinel: null, raw: rawStr, controlledString: 'NO_LITIGATION' };
    }

    // Explicit generic affirmative phrases
    const explicitAffirmatives = ['yes', 'litigation reported', 'in litigation'];
    if (explicitAffirmatives.includes(lower)) {
        return { value: true, sentinel: null, raw: rawStr, controlledString: 'LITIGATION_REPORTED' };
    }

    // Unknown or Indeterminate markers
    if (['unknown', 'n/a', 'na', 'not applicable', 'unspecified', 'under review', 'pending verification'].includes(lower)) {
        return { value: null, sentinel: 'CATEGORICAL_STATUS', raw: rawStr, status: 'UNKNOWN', detail: 'UNKNOWN' };
    }

    // Categorical observations: preserve the trimmed, factual observation text
    return {
        value: null,
        sentinel: 'CATEGORICAL_STATUS',
        raw: rawStr,
        status: text,
        detail: text,
        controlledString: text,
        note: 'Descriptive litigation text preserved as categorical observation. Not treated as boolean.'
    };
};

/**
 * Normalizes mortgage/bank-charge observations to the canonical String contract:
 * - String: Controlled 'NO_MORTGAGE' for verified explicit negative statements.
 * - String: Controlled 'MORTGAGE_REPORTED' for explicit affirmative statements without details.
 * - String: Preserved trimmed observation text for nuanced categorical statuses
 *   (e.g., 'Under mortgage with SBI', 'Bank lien under dispute', 'Mortgage pending NOC').
 * - Sentinel: { _sentinel: 'NOT_RETURNED' | 'RESTRICTED' | 'PARSE_ERROR' } for missing, null, or restricted data.
 *
 * CRITICAL SAFETY RULES:
 * 1. Absence of mortgage is NEVER inferred from missing, null, empty, or error states.
 * 2. Never outputs a JavaScript Boolean (persistence schema is strictly String).
 *
 * @param {*} rawVal
 * @returns {string|object} Controlled String, observation String, or strict sentinel object
 */
export const normalizeMortgageStatus = (rawVal) => {
    if (rawVal === null || rawVal === undefined) {
        return SENTINEL.NOT_RETURNED;
    }
    if (isSentinel(rawVal) || (typeof rawVal === 'object' && rawVal._sentinel && rawVal._sentinel !== 'CATEGORICAL_STATUS')) {
        return { _sentinel: rawVal._sentinel || rawVal.sentinel };
    }

    let text = '';
    let rawStr = '';
    if (typeof rawVal === 'object') {
        if (rawVal.value === false || rawVal.controlledString === 'NO_MORTGAGE') {
            return { value: false, sentinel: null, raw: rawVal.raw || 'No', controlledString: 'NO_MORTGAGE' };
        }
        if (rawVal.value === true || rawVal.controlledString === 'MORTGAGE_REPORTED') {
            return { value: true, sentinel: null, raw: rawVal.raw || 'Yes', controlledString: 'MORTGAGE_REPORTED' };
        }
        text = String(rawVal.status || rawVal.detail || rawVal.raw || '').trim();
        rawStr = String(rawVal.raw || text);
    } else if (typeof rawVal === 'boolean') {
        return rawVal
            ? { value: true, sentinel: null, raw: 'Yes', controlledString: 'MORTGAGE_REPORTED' }
            : { value: false, sentinel: null, raw: 'No', controlledString: 'NO_MORTGAGE' };
    } else {
        text = String(rawVal).trim();
        rawStr = text;
    }

    if (text === '') {
        return SENTINEL.NOT_RETURNED;
    }

    const lower = text.toLowerCase();

    // Explicit negative phrases
    const explicitNegatives = [
        'no', 'not under mortgage', 'no mortgage', 'mortgage cleared',
        'nil', 'none', 'cleared', 'clear', 'no lien', 'unencumbered'
    ];
    if (explicitNegatives.includes(lower)) {
        return { value: false, sentinel: null, raw: rawStr, controlledString: 'NO_MORTGAGE' };
    }

    // Explicit generic affirmative phrases
    const explicitAffirmatives = ['yes', 'mortgage reported', 'under mortgage'];
    if (explicitAffirmatives.includes(lower)) {
        return { value: true, sentinel: null, raw: rawStr, controlledString: 'MORTGAGE_REPORTED' };
    }

    // Unknown or Indeterminate markers
    if (['unknown', 'n/a', 'na', 'not applicable', 'unspecified', 'under review', 'pending verification'].includes(lower)) {
        return { value: null, sentinel: 'CATEGORICAL_STATUS', raw: rawStr, status: 'UNKNOWN', detail: 'UNKNOWN' };
    }

    // Categorical observations: preserve the trimmed, factual observation text
    return {
        value: null,
        sentinel: 'CATEGORICAL_STATUS',
        raw: rawStr,
        status: text,
        detail: text,
        controlledString: text,
        note: 'Descriptive mortgage text preserved as categorical observation. Not treated as boolean.'
    };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Property identifier normalization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Normalize a property/unit identifier for matching.
 *
 * Rules:
 *   - Trim whitespace
 *   - Uppercase
 *   - Collapse multiple spaces/hyphens
 *   - Remove common prefixes like "Plot No.", "Property No.", "SCO No."
 *   - Preserve the raw value alongside the normalized form
 */
export const normalizePropertyId = (raw) => {
    if (!raw || (typeof raw !== 'string' && typeof raw !== 'object')) {
        return { normalized: null, raw: raw ?? '', error: null };
    }
    if (typeof raw === 'object' && raw !== null) {
        if (raw.isRejected || raw.error === 'MALFORMED_IDENTIFIER') {
            return { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
        }
        if (raw.normalized !== undefined) return raw;
        raw = raw.raw ?? String(raw);
    }
    const rawStr = String(raw);

    // Security validation: check for disallowed markup, scripts, control characters or unicode overrides BEFORE trim
    if (/[\x00-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]|<[^>]*>|[<>]|javascript:/i.test(rawStr)) {
        return { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
    }

    const trimmed = rawStr.trim();
    if (!trimmed) {
        return { normalized: null, raw: '', error: null };
    }

    let normalized = trimmed
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .replace(/-{2,}/g, '-')
        .replace(/^(PLOT|PROPERTY|SCO|SCF|BOOTH|FLAT|HOUSE|KOTHI|VILLA|DSS)\s*(NO\.?|NUMBER|#)\s*/i, '')
        .trim();

    return { normalized, raw: trimmed, error: null };
};

/**
 * Normalize a sector number for matching.
 * ONLY strips "Sector" / "Sec" prefix. Does NOT strip "Phase" prefix.
 *
 * Phase 1.1 CRITICAL: Sector and Phase are distinct location concepts.
 * "Sector 14" → "14", but "Phase XI" is NOT a sector and must NOT
 * be processed by this function.
 *
 * @param {string|object} raw
 * @returns {{ normalized: string|null, raw: string, error: string|null, sentinel?: string }}
 */
export const normalizeSectorNumber = (raw) => {
    if (!raw || (typeof raw !== 'string' && typeof raw !== 'object')) {
        return { normalized: null, raw: raw ?? '', error: null };
    }
    if (typeof raw === 'object' && raw !== null) {
        if (raw.isRejected || raw.error === 'MALFORMED_IDENTIFIER') {
            return { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
        }
        if (raw.normalized !== undefined) return raw;
        raw = raw.raw ?? String(raw);
    }
    const rawStr = String(raw);

    // Security validation BEFORE trim
    if (/[\x00-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]|<[^>]*>|[<>]|javascript:/i.test(rawStr)) {
        return { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
    }

    const trimmed = rawStr.trim();
    if (!trimmed) {
        return { normalized: null, raw: '', error: null };
    }

    let normalized = trimmed
        .replace(/^(sector|sec)[\s\-.#]+/i, '')
        .trim()
        .toUpperCase();

    return { normalized, raw: trimmed, error: null };
};

/**
 * Normalize a phase/block identifier for matching.
 *
 * Phase 1.1 NEW: Separate function for phase normalization.
 * "Phase XI" → "XI", "Phase-3" → "3", "Ph 2" → "2"
 * Does NOT strip "Sector" prefix.
 *
 * @param {string|object} raw
 * @returns {{ normalized: string|null, raw: string, error: string|null, sentinel?: string }}
 */
export const normalizePhaseCode = (raw) => {
    if (!raw || (typeof raw !== 'string' && typeof raw !== 'object')) {
        return { normalized: null, raw: raw ?? '', error: null };
    }
    if (typeof raw === 'object' && raw !== null) {
        if (raw.isRejected || raw.error === 'MALFORMED_IDENTIFIER') {
            return { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
        }
        if (raw.normalized !== undefined) return raw;
        raw = raw.raw ?? String(raw);
    }
    const rawStr = String(raw);

    // Security validation BEFORE trim
    if (/[\x00-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]|<[^>]*>|[<>]|javascript:/i.test(rawStr)) {
        return { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
    }

    const trimmed = rawStr.trim();
    if (!trimmed) {
        return { normalized: null, raw: '', error: null };
    }

    let normalized = trimmed
        .replace(/^(phase|ph)[\s\-.#]+/i, '')
        .trim()
        .toUpperCase();

    return { normalized, raw: trimmed, error: null };
};

/**
 * Classify a raw location string as sector, phase, or unknown.
 *
 * Phase 1.1 NEW: Determines whether a raw location string
 * represents a sector or a phase before normalization.
 *
 * @param {string} raw
 * @returns {{ type: 'sector'|'phase'|'bare', normalized: string|null, raw: string }}
 */
export const classifyLocationComponent = (raw) => {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
        return { type: 'bare', normalized: null, raw: raw ?? '' };
    }
    const trimmed = raw.trim();

    if (/^(sector|sec)[\s\-.#]/i.test(trimmed)) {
        return { type: 'sector', ...normalizeSectorNumber(trimmed) };
    }
    if (/^(phase|ph)[\s\-.#]/i.test(trimmed)) {
        return { type: 'phase', ...normalizePhaseCode(trimmed) };
    }
    // Bare value — no prefix to determine type
    return { type: 'bare', normalized: trimmed.trim().toUpperCase(), raw: trimmed };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Composite identity builder for matching
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Required identity components per authority.
 * If a required component is missing, the key is AMBIGUOUS, not an exact match.
 *
 * Phase 1.2: phaseCode is NOT required for any authority by default.
 * It participates in the key when present, but its absence does not make
 * the key AMBIGUOUS unless a verified source sample shows that the same
 * authority+sector+propertyId exists across different phases.
 */
export const AUTHORITY_IDENTITY_REQUIREMENTS = Object.freeze({
    HSVP: {
        required: ['authority', 'urbanEstate', 'sectorNumber', 'propertyId'],
        optional: ['phaseCode'],
        description: 'HSVP requires urbanEstate+sector+propertyId because the same sector+propertyId exists across estates. phaseCode participates when present.',
    },
    ESTATE_OFFICE_CHD: {
        required: ['authority', 'sectorNumber', 'propertyId'],
        optional: ['phaseCode'],
        description: 'Chandigarh requires sector+propertyId (no urban estates, no phases confirmed)',
    },
    GMADA: {
        required: ['authority', 'sectorNumber', 'propertyId'],
        optional: ['phaseCode'],
        description: 'GMADA requires sector+propertyId. phaseCode participates when present. The "Sector / Phase" source label is UNVERIFIED.',
    },
});

/**
 * Build a composite matching key from authority property data.
 * Used for exact-match lookups against CRM Inventory.
 *
 * Phase 1.2 CHANGES:
 *   - Includes phaseCode in key pattern when present.
 *   - Pattern: "{authority}:{urbanEstate}:{sector}:{phase}:{propertyId}"
 *   - phaseCode and sectorNumber never substitute for one another.
 *
 * This is for EXACT matching only. Fuzzy matching is a separate pipeline
 * that requires manual review.
 */
export const buildCompositeKey = (authority, sectorOrScheme, propertyId, urbanEstate, phaseCode) => {
    const authPart = authority ? String(authority).trim().toUpperCase() : '';
    const sectorPart = sectorOrScheme ? normalizeSectorNumber(String(sectorOrScheme)).normalized || '' : '';
    const propPart = propertyId ? normalizePropertyId(String(propertyId)).normalized || '' : '';
    const estatePart = urbanEstate ? String(urbanEstate).trim().toUpperCase().replace(/^URBAN\s+ESTATE\s*/i, '').trim() : '';
    const phasePart = phaseCode ? normalizePhaseCode(String(phaseCode)).normalized || '' : '';

    // Basic completeness check
    if (!authPart || !propPart) {
        return { key: null, parts: { authority: authPart, urbanEstate: estatePart, sector: sectorPart, phase: phasePart, propertyId: propPart }, error: 'INCOMPLETE_KEY', confidence: 'NONE' };
    }

    // Check authority-specific requirements
    const reqs = AUTHORITY_IDENTITY_REQUIREMENTS[authPart];
    if (reqs) {
        const components = { authority: authPart, urbanEstate: estatePart, sectorNumber: sectorPart, propertyId: propPart, phaseCode: phasePart };
        const missingRequired = reqs.required.filter(r => !components[r]);
        if (missingRequired.length > 0) {
            // Some required components are missing — key is AMBIGUOUS
            const partialKey = [authPart, estatePart, sectorPart, phasePart, propPart].join(':');
            return {
                key: null,
                partialKey,
                parts: components,
                error: 'AMBIGUOUS',
                missingComponents: missingRequired,
                confidence: 'LOW',
                note: `Missing required components for ${authPart}: ${missingRequired.join(', ')}. Cannot assert exact match.`,
            };
        }
    } else if (!sectorPart) {
        // Unknown authority — require at least sector
        return { key: null, parts: { authority: authPart, urbanEstate: estatePart, sector: sectorPart, phase: phasePart, propertyId: propPart }, error: 'INCOMPLETE_KEY', confidence: 'NONE' };
    }

    // Include phase in key when present (makes the key more specific)
    const parts = [authPart, estatePart, sectorPart, phasePart, propPart];
    return { key: parts.join(':'), parts: { authority: authPart, urbanEstate: estatePart, sector: sectorPart, phase: phasePart, propertyId: propPart }, error: null, confidence: 'EXACT' };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2.11 Derived Encumbrance Status Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Derives categorical duesStatus from normalized currentDues.
 *
 * Rules:
 * - If currentDues is missing, null, undefined, NOT_RETURNED, PARSE_ERROR, or sentinel:
 *   MUST return 'UNKNOWN'.
 *   CRITICAL SAFETY RULE: Never infer that dues are CLEAR from a missing, null, or empty amount.
 * - If raw text or notes indicate a dispute (e.g. 'disputed', 'litigated', 'stayed'):
 *   Returns 'DISPUTED'.
 * - If currentDues has numeric value:
 *   - value === 0: 'CLEAR' (zero balance verified)
 *   - value > 0: 'PENDING' (outstanding balance)
 *   - value < 0: 'CLEAR' (credit balance)
 * - Any unparseable / non-numeric value returns 'UNKNOWN'.
 *
 * @param {object|null} currentDues - Parsed currency object { value, currency, raw } or sentinel
 * @returns {string} 'CLEAR' | 'PENDING' | 'DISPUTED' | 'UNKNOWN'
 */
export const deriveDuesStatus = (currentDues) => {
    if (!currentDues || typeof currentDues !== 'object') {
        return 'UNKNOWN';
    }
    // Check if raw text, detail, or status indicates dispute
    const rawStr = String(currentDues.raw || currentDues.detail || currentDues.status || '').toLowerCase();
    if (rawStr.includes('disput') || rawStr.includes('stay') || rawStr.includes('court') || rawStr.includes('litigat')) {
        return 'DISPUTED';
    }
    // Sentinel or missing value check: do NOT infer clear from missing or sentinel
    if (isSentinel(currentDues) || currentDues._sentinel || currentDues.sentinel || currentDues.value === null || currentDues.value === undefined) {
        return 'UNKNOWN';
    }
    const val = Number(currentDues.value);
    if (!Number.isFinite(val) || isNaN(val)) {
        return 'UNKNOWN';
    }
    if (val === 0) {
        return 'CLEAR';
    }
    if (val > 0) {
        return 'PENDING';
    }
    if (val < 0) {
        return 'CLEAR'; // credit balance
    }
    return 'UNKNOWN';
};

/**
 * Derives categorical leaseRentStatus from record facts.
 *
 * Rules:
 * - CRITICAL SAFETY RULE 1: Do NOT infer that lease rent is paid from general authority status!
 *   An authorityStatus of 'Allotted', 'Active', 'Normal', or 'Regular' does NOT mean lease rent is paid.
 * - CRITICAL SAFETY RULE 2: Do NOT infer freehold status merely because allotmentMode or propertyCategory
 *   contains a matching substring unless that input is explicitly defined to represent tenure.
 * - If source data provides explicit lease/ground rent observation:
 *   - Explicit affirmative ('paid', 'cleared', 'nil', 'none', 'up to date', 'zero') -> 'PAID'
 *   - Explicit pending ('due', 'pending', 'unpaid', 'outstanding') or numeric value > 0 -> 'PENDING'
 *   - Explicit freehold / exempt ('freehold', 'not applicable', 'n/a', 'na', 'exempt') -> 'NOT_APPLICABLE'
 *   - Explicit dispute ('disputed', 'under dispute') -> 'DISPUTED'
 * - In all other cases (including general authorityStatus alone):
 *   Returns 'UNKNOWN'.
 *
 * @param {object} record - Canonical record being normalized
 * @param {string} [authority] - Authority code
 * @returns {string} 'PAID' | 'PENDING' | 'NOT_APPLICABLE' | 'DISPUTED' | 'UNKNOWN'
 */
export const deriveLeaseRentStatus = (record, authority) => {
    if (!record || typeof record !== 'object') {
        return 'UNKNOWN';
    }

    // 1. Explicit tenure / freehold check on allotmentMode, propertyCategory, or propertyType.
    // Freehold properties are constitutionally exempt from lease/ground rent liability (NOT_APPLICABLE).
    const mode = String(record.allotmentMode || '').toLowerCase();
    const cat = String(record.propertyCategory || '').toLowerCase();
    const type = String(record.propertyType || '').toLowerCase();
    if (mode.includes('freehold') || cat.includes('freehold') || type.includes('freehold')) {
        return 'NOT_APPLICABLE';
    }

    // 2. Check for explicit lease/ground rent fields if present in record
    const explicitLeaseRent = record.leaseRent || record.groundRent || record.leaseRentStatus;
    if (explicitLeaseRent !== undefined && explicitLeaseRent !== null) {
        const str = (typeof explicitLeaseRent === 'object' && explicitLeaseRent.raw !== undefined)
            ? String(explicitLeaseRent.raw).toLowerCase().trim()
            : String(explicitLeaseRent).toLowerCase().trim();

        if (['paid', 'cleared', 'nil', 'none', 'up to date', 'zero'].includes(str)) {
            return 'PAID';
        }
        if (['due', 'pending', 'unpaid', 'outstanding'].includes(str)) {
            return 'PENDING';
        }
        if (['not applicable', 'n/a', 'na', 'freehold', 'exempt'].includes(str)) {
            return 'NOT_APPLICABLE';
        }
        if (['disputed', 'dispute'].includes(str)) {
            return 'DISPUTED';
        }
        if (typeof explicitLeaseRent === 'object' && typeof explicitLeaseRent.value === 'number') {
            return explicitLeaseRent.value > 0 ? 'PENDING' : 'PAID';
        }
    }

    // 3. General authority status NEVER infers lease rent is paid
    // In all other cases (absent explicit ground rent evidence or verified freehold):
    return 'UNKNOWN';
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Full record normalizer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Normalize a raw authority response into the canonical schema.
 *
 * @param {string} authority - Authority ID from AUTHORITY_REGISTRY
 * @param {Object} rawData - Raw key-value pairs from the source
 * @param {Object} sourceFieldMap - The mapping from SOURCE_FIELD_MAPS[authority]
 * @returns {Object} Normalized canonical record
 *
 * Rules:
 *   - Missing fields → appropriate SENTINEL (NOT_RETURNED, not false/zero)
 *   - Unparseable fields → PARSE_ERROR sentinel with raw preserved
 *   - No Contact creation/linking from owner fields
 *   - authorityStatus NEVER becomes Inventory.status
 *   - Area units preserved as-is (no conversion)
 */
export const normalizeAuthorityRecord = (authority, rawData, sourceFieldMap) => {
    if (!rawData || typeof rawData !== 'object') {
        return { error: 'INVALID_INPUT', record: null };
    }

    const record = {};

    // For each canonical field, find the source label and extract + normalize
    for (const [canonicalField, mapping] of Object.entries(sourceFieldMap)) {
        const { sourceLabel, evidence } = mapping;

        // Constants (authority, policyVersion) are injected, not extracted
        if (sourceLabel === null && (canonicalField === 'authority' || canonicalField === 'policyVersion')) {
            if (canonicalField === 'authority') record.authority = authority;
            if (canonicalField === 'policyVersion') record.policyVersion = mapping.sourceExample;
            continue;
        }

        // NOT_SUPPORTED fields
        if (evidence === 'NOT_SUPPORTED') {
            record[canonicalField] = SENTINEL.NOT_APPLICABLE;
            continue;
        }

        // Find value in raw data by source label
        let rawValue = undefined;
        if (sourceLabel) {
            // Try exact key match first, then case-insensitive
            rawValue = rawData[sourceLabel];
            if (rawValue === undefined) {
                const lowerLabel = sourceLabel.toLowerCase();
                for (const [key, val] of Object.entries(rawData)) {
                    if (key.toLowerCase() === lowerLabel || key.toLowerCase().replace(/[.\s/]/g, '') === lowerLabel.replace(/[.\s/]/g, '')) {
                        rawValue = val;
                        break;
                    }
                }
            }
        }

        // Apply field-specific normalization
        if (rawValue === undefined || rawValue === null) {
            // Don't overwrite allotmentMode if it was already extracted from area parsing
            if (canonicalField === 'allotmentMode' && record.allotmentMode && record.allotmentMode !== SENTINEL.NOT_RETURNED) {
                continue;
            }
            record[canonicalField] = SENTINEL.NOT_RETURNED;
            continue;
        }

        switch (canonicalField) {
            case 'area': {
                const parsed = parseAreaString(String(rawValue));
                record.area = { value: parsed.value, unit: parsed.unit, raw: parsed.raw };
                if (parsed.mode && !record.allotmentMode) {
                    record.allotmentMode = parsed.mode;
                }
                if (parsed.error) {
                    record.area._parseError = parsed.error;
                }
                break;
            }
            case 'allotmentMode': {
                // May already be set from area parsing
                if (!record.allotmentMode || record.allotmentMode === SENTINEL.NOT_RETURNED) {
                    record.allotmentMode = String(rawValue).trim() || SENTINEL.NOT_RETURNED;
                }
                break;
            }
            case 'allotmentDate':
            case 'possessionDate':
            case 'lastTransferDate': {
                const parsed = parseAuthorityDate(rawValue);
                record[canonicalField] = parsed.date !== null
                    ? { date: parsed.date, raw: parsed.raw }
                    : { ...SENTINEL[parsed.sentinel] || SENTINEL.PARSE_ERROR, raw: parsed.raw };
                break;
            }
            case 'allotmentPrice':
            case 'currentDues':
            case 'totalPaid': {
                const parsed = parseCurrencyAmount(rawValue);
                if (parsed.value !== null) {
                    record[canonicalField] = { value: parsed.value, currency: parsed.currency, raw: parsed.raw };
                } else if (parsed.sentinel === 'PARSE_ERROR') {
                    record[canonicalField] = { ...SENTINEL.PARSE_ERROR, raw: parsed.raw };
                } else {
                    record[canonicalField] = SENTINEL.NOT_RETURNED;
                }
                break;
            }
            case 'litigationStatus': {
                record[canonicalField] = normalizeLitigationStatus(rawValue);
                break;
            }
            case 'mortgageStatus': {
                record[canonicalField] = normalizeMortgageStatus(rawValue);
                break;
            }
            case 'buildingPlanApproved':
            case 'occupancyCertificate': {
                // Phase 1.1: Use categorical normalizer with field context
                record[canonicalField] = normalizeCategoricalBoolean(rawValue, canonicalField);
                break;
            }
            case 'sectorNumber': {
                // Phase 1.2: Use classifyLocationComponent to detect misrouted phase values
                const classified = classifyLocationComponent(String(rawValue));
                if (classified.type === 'phase') {
                    // This value looks like a phase, not a sector — do not assign to sectorNumber
                    record[canonicalField] = {
                        normalized: null, raw: classified.raw, error: null,
                        _sentinel: 'NEEDS_REVIEW',
                        _classifiedAs: 'phase',
                        _classifiedValue: classified.normalized,
                        note: `Source value "${rawValue}" classified as phase, not sector. Needs manual review.`,
                    };
                    // Also populate phaseCode if not already set
                    if (!record.phaseCode || isSentinel(record.phaseCode)) {
                        record.phaseCode = normalizePhaseCode(rawValue);
                    }
                } else {
                    record[canonicalField] = normalizeSectorNumber(rawValue);
                }
                break;
            }
            case 'phaseCode': {
                record[canonicalField] = normalizePhaseCode(rawValue);
                break;
            }
            case 'blockCode': {
                // Block codes are simple string identifiers
                if (typeof rawValue === 'object' && rawValue !== null && (rawValue.isRejected || rawValue.error === 'MALFORMED_IDENTIFIER')) {
                    record[canonicalField] = { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
                    break;
                }
                const strVal = String(rawValue).trim();
                if (/[\x00-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]|<[^>]*>|[<>]|javascript:/i.test(strVal)) {
                    record[canonicalField] = { normalized: null, raw: '[REJECTED_IDENTIFIER]', sentinel: 'PARSE_ERROR', error: 'MALFORMED_IDENTIFIER' };
                    break;
                }
                record[canonicalField] = strVal
                    ? { normalized: strVal.toUpperCase(), raw: strVal, error: null }
                    : SENTINEL.NOT_RETURNED;
                break;
            }
            case 'propertyId': {
                record[canonicalField] = normalizePropertyId(rawValue);
                break;
            }
            default: {
                // String fields: trim, preserve as-is
                const strVal = String(rawValue).trim();
                record[canonicalField] = strVal || SENTINEL.NOT_RETURNED;
                break;
            }
        }
    }

    // Phase 2.11 Derived Encumbrance Facts:
    // 1. duesStatus derived strictly from currentDues (never assumes CLEAR if missing)
    record.duesStatus = deriveDuesStatus(record.currentDues);

    // 2. leaseRentStatus derived from explicit facts / tenure (never inferred from general authorityStatus)
    record.leaseRentStatus = deriveLeaseRentStatus(record, authority);

    return { error: null, record };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cryptographic deterministic snapshot content hashing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deterministic Content Hash (SHA-256) & Canonical Policy Encapsulation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Module-private policy collections (inaccessible and unmodifiable from outside)
const _PERMITTED_HASH_FIELDS = new Set([
    'allotmentDate',
    'allotmentMode',
    'allotmentPrice',
    'authorityCode',
    'authorityStatus',
    'blockCode',
    'buildingPlanApproved',
    'currentDues',
    'duesStatus',
    'estateOffice',
    'fileNumber',
    'formNumber',
    'leaseRentStatus',
    'litigationStatus',
    'mortgageStatus',
    'occupancyCertificate',
    'phaseCode',
    'possessionDate',
    'possessionStatus',
    'propertyAreaUnit',
    'propertyAreaValue',
    'propertyCategory',
    'propertyId',
    'propertySize',
    'propertyType',
    'schemeName',
    'sectorNumber',
    'totalPaid',
    'transferDate',
    'urbanEstate'
]);

const _EXCLUDED_HASH_FIELDS = new Set([
    '_id', 'id', 'tenantId', 'linkId', 'runId', 'runItemId', 'snapshotId',
    'observedAt', 'createdAt', 'updatedAt', 'verifiedAt', 'verifiedBy',
    'ownerName', 'allotteeName', 'allotteeAddress', 'ownerPhone', 'ownerEmail',
    'allotteePhone', 'allotteeEmail', 'phone', 'email', 'mobile', 'address',
    'aadhaar', 'pan', 'cookies', 'session', 'sessionId', 'csrf', 'csrfToken',
    'token', 'headers', 'rawHtml', 'html', 'password', 'secret', 'credentials',
    'auth', 'authorization', 'raw', 'rawValue'
]);

const _PERMITTED_NESTED_KEYS = {
    allotmentPrice: new Set(['value', 'currency']),
    currentDues: new Set(['value', 'currency']),
    totalPaid: new Set(['value', 'currency']),
    area: new Set(['value', 'unit', 'mode']),
};

/**
 * Checks whether a field is permitted to participate in the content hash.
 * Queries the private unmodifiable Set.
 * 
 * @param {string} key
 * @returns {boolean}
 */
export function isPermittedHashField(key) {
    return _PERMITTED_HASH_FIELDS.has(key);
}

/**
 * Checks whether a field is strictly excluded from the content hash.
 * Queries the private unmodifiable Set.
 * 
 * @param {string} key
 * @returns {boolean}
 */
export function isExcludedHashField(key) {
    return _EXCLUDED_HASH_FIELDS.has(key);
}

/**
 * Checks whether a nested property key is permitted under a given parent field.
 * Queries the private unmodifiable nested Sets.
 * 
 * @param {string} parent
 * @param {string} key
 * @returns {boolean}
 */
export function isPermittedNestedKey(parent, key) {
    const parentSet = _PERMITTED_NESTED_KEYS[parent];
    return parentSet ? parentSet.has(key) : false;
}

/**
 * Returns a sorted defensive array copy of all permitted hash fields.
 * 
 * @returns {string[]}
 */
export function getPermittedHashFields() {
    return Array.from(_PERMITTED_HASH_FIELDS).sort();
}

/**
 * Returns a sorted defensive array copy of all excluded hash fields.
 * 
 * @returns {string[]}
 */
export function getExcludedHashFields() {
    return Array.from(_EXCLUDED_HASH_FIELDS).sort();
}

/**
 * Exported permitted hash fields list.
 * Freezes the array and attaches a non-enumerable .has() method for Set-like ergonomics.
 */
export const PERMITTED_HASH_FIELDS = Object.freeze(Object.assign(
    Array.from(_PERMITTED_HASH_FIELDS).sort(),
    { has(k) { return _PERMITTED_HASH_FIELDS.has(k); } }
));

/**
 * Exported permitted hash fields Set proxy (protected against prototype pollution/bypass).
 */
export const PERMITTED_HASH_SET = createReadOnlySetProxy(_PERMITTED_HASH_FIELDS);

/**
 * Exported excluded hash fields Set proxy (protected against prototype pollution/bypass).
 */
export const EXCLUDED_HASH_FIELDS = createReadOnlySetProxy(_EXCLUDED_HASH_FIELDS);

/**
 * Exported permitted nested keys object with frozen proxy Sets.
 */
export const PERMITTED_NESTED_KEYS = deepFreeze({
    allotmentPrice: createReadOnlySetProxy(_PERMITTED_NESTED_KEYS.allotmentPrice),
    currentDues: createReadOnlySetProxy(_PERMITTED_NESTED_KEYS.currentDues),
    totalPaid: createReadOnlySetProxy(_PERMITTED_NESTED_KEYS.totalPaid),
    area: createReadOnlySetProxy(_PERMITTED_NESTED_KEYS.area),
});

/**
 * Comprehensive Canonical-to-Hash Field Crosswalk Specification.
 * Exhaustively maps every permitted hash field to its canonical source,
 * classification, transformation, security posture, and test reference.
 */
export const CANONICAL_HASH_CROSSWALK = deepFreeze({
    allotmentDate: {
        hashField: 'allotmentDate',
        canonicalSourceFields: ['allotmentDate'],
        classification: 'direct',
        transformAndType: 'ISO 8601 string / Date',
        rationale: 'Establishes foundational allocation chronological baseline',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Temporal government record; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.1'
    },
    allotmentMode: {
        hashField: 'allotmentMode',
        canonicalSourceFields: ['allotmentMode', 'area.mode'],
        classification: 'normalized',
        transformAndType: 'trimmed uppercase/title string',
        rationale: 'Differentiates acquisition framework (allotment vs auction vs eAuction)',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Administrative classification; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    allotmentPrice: {
        hashField: 'allotmentPrice',
        canonicalSourceFields: ['allotmentPrice'],
        classification: 'normalized',
        transformAndType: 'Object { value: Number, currency: String }',
        rationale: 'Financial baseline of initial allotment recorded by authority',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Monetary figure without banking or PII details; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.2'
    },
    authorityCode: {
        hashField: 'authorityCode',
        canonicalSourceFields: ['authority'],
        classification: 'derived',
        transformAndType: 'String enum (HSVP | CHD | GMADA)',
        rationale: 'Differentiates issuing statutory body and identity namespace across tenants',
        containsSensitiveOrUnverified: { sensitive: false, unverified: false, explanation: 'System authority identifier derived from verified registry' },
        testReference: 'phase2_8_final_contract.test.js:3.2'
    },
    authorityStatus: {
        hashField: 'authorityStatus',
        canonicalSourceFields: ['authorityStatus'],
        classification: 'direct',
        transformAndType: 'trimmed string',
        rationale: 'Statutory standing of record in authority registry',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Government regulatory status; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.1'
    },
    blockCode: {
        hashField: 'blockCode',
        canonicalSourceFields: ['blockCode'],
        classification: 'direct',
        transformAndType: 'trimmed uppercase string',
        rationale: 'Sub-sector spatial boundary component',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Cadastral block identifier; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S1e'
    },
    buildingPlanApproved: {
        hashField: 'buildingPlanApproved',
        canonicalSourceFields: ['buildingPlanApproved'],
        classification: 'normalized',
        transformAndType: 'Boolean (true | false) or Sentinel',
        rationale: 'Regulatory compliance and building construction approval status',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Regulatory sanction record; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S6b'
    },
    currentDues: {
        hashField: 'currentDues',
        canonicalSourceFields: ['currentDues'],
        classification: 'normalized',
        transformAndType: 'Object { value: Number, currency: String }',
        rationale: 'Outstanding financial liability recorded by authority',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Outstanding balance figure; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.2'
    },
    duesStatus: {
        hashField: 'duesStatus',
        canonicalSourceFields: ['currentDues'],
        classification: 'derived',
        transformAndType: 'String (CLEAR | PENDING | DISPUTED | UNKNOWN)',
        rationale: 'Categorical financial encumbrance fact derived from currentDues (CLEAR | PENDING | DISPUTED | UNKNOWN); never assumes CLEAR from missing amount',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Encumbrance classification; live portal sample unverified' },
        testReference: 'phase2_5_reconciliation_audit.test.js:1.7'
    },
    estateOffice: {
        hashField: 'estateOffice',
        canonicalSourceFields: ['estateOffice'],
        classification: 'direct',
        transformAndType: 'trimmed string',
        rationale: 'Specific jurisdictional field office managing asset',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Administrative office name; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    fileNumber: {
        hashField: 'fileNumber',
        canonicalSourceFields: ['fileNumber'],
        classification: 'direct',
        transformAndType: 'trimmed string',
        rationale: 'Administrative dossier reference identifier in authority archives',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Government file index number; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    formNumber: {
        hashField: 'formNumber',
        canonicalSourceFields: ['formNumber'],
        classification: 'direct',
        transformAndType: 'trimmed string',
        rationale: 'Statutory application submission sequence identifier',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Government form sequence number; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    leaseRentStatus: {
        hashField: 'leaseRentStatus',
        canonicalSourceFields: ['authorityStatus', 'allotmentMode'],
        classification: 'derived',
        transformAndType: 'String (PAID | PENDING | NOT_APPLICABLE | UNKNOWN)',
        rationale: 'Categorical tenure encumbrance fact for leasehold properties; never inferred from general authorityStatus',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Leasehold standing fact; live portal sample unverified' },
        testReference: 'phase2_12_status_contract.test.js'
    },
    litigationStatus: {
        hashField: 'litigationStatus',
        canonicalSourceFields: ['litigationStatus'],
        classification: 'normalized',
        transformAndType: 'String (NO_LITIGATION | LITIGATION_REPORTED | Categorical Observation | Sentinel)',
        rationale: 'Legal encumbrance fact indicating pending judicial dispute or categorical court observation; never JavaScript Boolean',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Court dispute observation/flag; live portal sample unverified' },
        testReference: 'phase2_12_status_contract.test.js'
    },
    mortgageStatus: {
        hashField: 'mortgageStatus',
        canonicalSourceFields: ['mortgageStatus'],
        classification: 'normalized',
        transformAndType: 'String (NO_MORTGAGE | MORTGAGE_REPORTED | Categorical Observation | Sentinel)',
        rationale: 'Financial encumbrance fact indicating mortgage, bank lien, or charge; never JavaScript Boolean',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Lien/charge observation/flag; live portal sample unverified' },
        testReference: 'phase2_12_status_contract.test.js'
    },
    occupancyCertificate: {
        hashField: 'occupancyCertificate',
        canonicalSourceFields: ['occupancyCertificate'],
        classification: 'normalized',
        transformAndType: 'Boolean (true | false) or Sentinel',
        rationale: 'Statutory completion and habitability certification status',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Habitability sanction record; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S6b'
    },
    phaseCode: {
        hashField: 'phaseCode',
        canonicalSourceFields: ['phaseCode'],
        classification: 'normalized',
        transformAndType: 'trimmed string (Phase X / Roman or numeric)',
        rationale: 'Urban developmental stage zone distinct from sectorNumber',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Urban planning phase code; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S8a'
    },
    possessionDate: {
        hashField: 'possessionDate',
        canonicalSourceFields: ['possessionDate'],
        classification: 'direct',
        transformAndType: 'ISO 8601 string / Date',
        rationale: 'Chronological milestone when physical possession was handed over',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Temporal administrative record; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.1'
    },
    possessionStatus: {
        hashField: 'possessionStatus',
        canonicalSourceFields: ['possessionStatus'],
        classification: 'direct',
        transformAndType: 'trimmed string (OFFERED | TAKEN | PENDING)',
        rationale: 'Categorical state of physical property handover',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Handover standing record; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    propertyAreaUnit: {
        hashField: 'propertyAreaUnit',
        canonicalSourceFields: ['area'],
        classification: 'normalized',
        transformAndType: 'String enum (SQ_YD | SQ_MTR | SQ_FT | MARLA | KANAL | ACRE)',
        rationale: 'Standardized cadastral measurement unit; prevents conversion drift',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Measurement unit specification; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S4'
    },
    propertyAreaValue: {
        hashField: 'propertyAreaValue',
        canonicalSourceFields: ['area'],
        classification: 'normalized',
        transformAndType: 'Number (finite positive float/int)',
        rationale: 'Exact quantitative spatial extent recorded by authority',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Geometric area measure; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S4'
    },
    propertyCategory: {
        hashField: 'propertyCategory',
        canonicalSourceFields: ['propertyCategory'],
        classification: 'direct',
        transformAndType: 'trimmed string (Residential | Commercial | Industrial | Institutional)',
        rationale: 'Master land-use zoning category defined by statutory master plan',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Zoning classification; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    propertyId: {
        hashField: 'propertyId',
        canonicalSourceFields: ['propertyId'],
        classification: 'direct',
        transformAndType: 'trimmed string',
        rationale: 'Primary authority record identifier / plot number',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Asset reference number; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S8'
    },
    propertySize: {
        hashField: 'propertySize',
        canonicalSourceFields: ['area'],
        classification: 'derived',
        transformAndType: 'trimmed string (e.g. "14 Marla", "500 Sq Yd", "4BHK")',
        rationale: 'Denominated dimension or size category string common in North Indian authorities',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Spatial size label; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.1'
    },
    propertyType: {
        hashField: 'propertyType',
        canonicalSourceFields: ['propertyType'],
        classification: 'direct',
        transformAndType: 'trimmed string (Plot | SCO | Flat | Built-up | Booth)',
        rationale: 'Structural typology of unit sanctioned by authority',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Architectural typology; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    schemeName: {
        hashField: 'schemeName',
        canonicalSourceFields: ['schemeName'],
        classification: 'direct',
        transformAndType: 'trimmed string',
        rationale: 'Specific government development scheme or sector enclave under which allotment occurred',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Development scheme name; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S2'
    },
    sectorNumber: {
        hashField: 'sectorNumber',
        canonicalSourceFields: ['sectorNumber'],
        classification: 'normalized',
        transformAndType: 'trimmed string (e.g. "Sector 14", "Sector 66A")',
        rationale: 'Master urban sector coordinate; primary geographic index',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Geographic planning sector; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S8'
    },
    totalPaid: {
        hashField: 'totalPaid',
        canonicalSourceFields: ['totalPaid'],
        classification: 'normalized',
        transformAndType: 'Object { value: Number, currency: String }',
        rationale: 'Aggregate financial consideration received by authority for asset',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Cumulative receipt figure; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.2'
    },
    transferDate: {
        hashField: 'transferDate',
        canonicalSourceFields: ['lastTransferDate'],
        classification: 'aliased',
        transformAndType: 'ISO 8601 string / Date',
        rationale: 'Most recent ownership mutation / title transfer date recorded by authority',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Mutation chronology record; live portal sample unverified' },
        testReference: 'phase2_8_final_contract.test.js:4.1'
    },
    urbanEstate: {
        hashField: 'urbanEstate',
        canonicalSourceFields: ['urbanEstate'],
        classification: 'direct',
        transformAndType: 'trimmed string (e.g. "Gurugram", "Panchkula", "Faridabad")',
        rationale: 'Macro urban agglomeration jurisdiction; essential component of composite authority key',
        containsSensitiveOrUnverified: { sensitive: false, unverified: true, explanation: 'Jurisdictional urban zone; live portal sample unverified' },
        testReference: 'phase_authority_field_contract.test.js:S9a'
    }
});

/**
 * Returns crosswalk entry for a specific permitted hash field.
 * 
 * @param {string} hashField
 * @returns {object|null}
 */
export function getCrosswalkEntry(hashField) {
    return CANONICAL_HASH_CROSSWALK[hashField] || null;
}

/**
 * Returns defensive array copy of all 30 crosswalk entries.
 * 
 * @returns {object[]}
 */
export function getCanonicalHashCrosswalk() {
    return Object.values(CANONICAL_HASH_CROSSWALK);
}

function canonicalizeValue(val, parentField = null) {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
            const d = new Date(trimmed);
            if (!isNaN(d.getTime())) return d.toISOString();
        }
        return trimmed;
    }
    if (typeof val === 'number') return Number.isFinite(val) ? val : null;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'object') {
        if (Array.isArray(val)) {
            return val.map(item => canonicalizeValue(item, parentField)).filter(v => v !== null && v !== undefined);
        }
        // Sentinel value: strictly preserve only _sentinel (and observation status for CATEGORICAL_STATUS)
        if (val._sentinel || val.sentinel) {
            const sType = val._sentinel || val.sentinel;
            if (sType === 'CATEGORICAL_STATUS' && (val.status || val.detail)) {
                return String(val.status || val.detail).trim();
            }
            return { _sentinel: typeof sType === 'string' ? sType.trim() : String(sType) };
        }
        // If parentField has an explicit nested allowlist, enforce it via private set
        const allowedNested = parentField && _PERMITTED_NESTED_KEYS[parentField];
        const out = {};
        const keys = Object.keys(val).filter(k => {
            if (_EXCLUDED_HASH_FIELDS.has(k)) return false;
            if (allowedNested && !allowedNested.has(k)) return false;
            return true;
        }).sort();

        for (const k of keys) {
            // Strict canonical typing for permitted nested keys:
            if (parentField && _PERMITTED_NESTED_KEYS[parentField]) {
                const nestedVal = val[k];
                if (k === 'value') {
                    if (typeof nestedVal === 'number' && Number.isFinite(nestedVal)) {
                        out[k] = nestedVal;
                    } else if (typeof nestedVal === 'string' && nestedVal.trim() !== '' && !isNaN(Number(nestedVal))) {
                        const num = Number(nestedVal);
                        if (Number.isFinite(num)) out[k] = num;
                    }
                    continue;
                }
                if (k === 'currency' || k === 'unit' || k === 'mode') {
                    if (typeof nestedVal === 'string' && nestedVal.trim() !== '') {
                        out[k] = nestedVal.trim();
                    }
                    continue;
                }
            }

            const v = canonicalizeValue(val[k], k);
            if (v !== undefined && v !== null) {
                out[k] = v;
            }
        }
        return Object.keys(out).length > 0 ? out : null;
    }
    return null;
}

/**
 * Deterministically computes a canonical SHA-256 hash over permitted normalized snapshot data.
 * - Enforces sorted keys, ISO date formatting, and trimmed strings.
 * - Strictly excludes personal data (ownerName, allotteeName, address), cookies, CSRF tokens,
 *   session credentials, raw HTML, and database metadata.
 * - Applies recursive field allowlisting for nested objects.
 * 
 * @param {object} normalizedData
 * @returns {string|null} 64-character lowercase hexadecimal SHA-256 hash
 */
export const computeSnapshotContentHash = (normalizedData) => {
    if (!normalizedData || typeof normalizedData !== 'object') {
        return null;
    }
    const canonical = {};
    for (const field of _PERMITTED_HASH_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(normalizedData, field) && !_EXCLUDED_HASH_FIELDS.has(field)) {
            const v = canonicalizeValue(normalizedData[field], field);
            if (v !== null && v !== undefined) {
                canonical[field] = v;
            }
        }
    }
    // Sort top-level keys
    const sortedKeys = Object.keys(canonical).sort();
    const sortedCanonical = {};
    for (const k of sortedKeys) {
        sortedCanonical[k] = canonical[k];
    }
    const jsonStr = JSON.stringify(sortedCanonical);
    return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
};

/**
 * Canonical alias for computeSnapshotContentHash.
 */
export const computeNormalizedContentHash = computeSnapshotContentHash;

export default {
    parseAuthorityDate,
    parseCurrencyAmount,
    normalizeBooleanStatus,
    normalizeCategoricalBoolean,
    normalizeLitigationStatus,
    normalizeMortgageStatus,
    deriveDuesStatus,
    deriveLeaseRentStatus,
    normalizePropertyId,
    normalizeSectorNumber,
    normalizePhaseCode,
    classifyLocationComponent,
    buildCompositeKey,
    AUTHORITY_IDENTITY_REQUIREMENTS,
    normalizeAuthorityRecord,
    computeSnapshotContentHash,
    computeNormalizedContentHash,
    isPermittedHashField,
    isExcludedHashField,
    isPermittedNestedKey,
    getPermittedHashFields,
    getExcludedHashFields,
    CANONICAL_HASH_CROSSWALK,
    getCrosswalkEntry,
    getCanonicalHashCrosswalk,
    PERMITTED_HASH_FIELDS,
    PERMITTED_HASH_SET,
    PERMITTED_NESTED_KEYS,
    EXCLUDED_HASH_FIELDS,
};
