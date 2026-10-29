/**
 * ============================================================================
 *  AUTHORITY PROPERTY VERIFICATION — CANONICAL FIELD DICTIONARY
 *  Phase 1: Data contract only. No live HTTP, no model changes, no deployment.
 * ============================================================================
 *
 *  Sources:
 *    HSVP    — Haryana Shehri Vikas Pradhikaran (formerly HUDA)
 *    ESTATE_OFFICE_CHD — Estate Office, Chandigarh Administration
 *    GMADA   — Greater Mohali Area Development Authority
 *
 *  This module exports:
 *    - CANONICAL_FIELDS:  The target schema for authority-verification data
 *    - SOURCE_FIELD_MAPS: Per-source mapping from source labels to canonical fields
 *    - EVIDENCE_STATUS:   Enum for mapping verification evidence
 *    - SENTINEL_VALUES:   Typed sentinels for missing/restricted/error data
 *    - AREA_UNIT_REGISTRY: Known area units (no implicit conversions)
 *    - AUTHORITY_REGISTRY: Authority identity metadata
 *
 *  Non-negotiable rules enforced by this contract:
 *    1. Authority status NEVER maps to Inventory.status
 *    2. unitNo is the canonical CRM identifier
 *    3. No implicit area-unit conversions
 *    4. Missing/empty source fields → SENTINEL, not false/zero/null-clear
 *    5. Owner/allottee identity is recorded but never auto-linked to Contact
 *    6. No raw cookies, session IDs, CSRF tokens, credentials stored
 *    7. Source labels and policy versions are preserved alongside normalized values
 *
 *  @module authorityFieldDictionary
 *  @version 1.0.0-phase1
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 0: Immutability Runtime Utilities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Creates a truly tamper-proof Read-Only Set Proxy.
 * 
 * Guards against the V8 internal-slot exploit where calling
 * Set.prototype.add.call(subclassInstance, 'evil') or
 * Set.prototype.delete.call(subclassInstance, ...) operates directly on
 * the internal [[SetData]] slot, bypassing subclass method overrides.
 * 
 * When wrapped in a Proxy:
 * 1. direct .add(), .delete(), .clear() calls throw TypeError.
 * 2. Set.prototype.add.call(proxy, ...), Set.prototype.delete.call(proxy, ...),
 *    and Set.prototype.clear.call(proxy) fail with:
 *    TypeError: Method Set.prototype.add called on incompatible receiver #<Set>
 *    because V8 native methods strictly reject Proxy receivers!
 * 3. proxy instanceof Set evaluates to true.
 * 4. Object.isFrozen(proxy) evaluates to true.
 * 
 * @param {Set} targetSet
 * @returns {Proxy<Set>}
 */
export function createReadOnlySetGuard(targetSet) {
    if (!targetSet || !(targetSet instanceof Set)) {
        throw new TypeError('createReadOnlySetGuard requires a Set instance');
    }
    const guard = new Proxy(targetSet, {
        get(t, prop) {
            if (prop === 'add' || prop === 'delete' || prop === 'clear') {
                return () => { throw new TypeError(`Cannot mutate immutable Set: .${String(prop)}() is prohibited`); };
            }
            if (prop === 'size') {
                return t.size;
            }
            const val = Reflect.get(t, prop, t);
            if (typeof val === 'function') {
                return val.bind(t);
            }
            return val;
        },
        set() { throw new TypeError('Cannot mutate immutable Set properties'); },
        defineProperty() { throw new TypeError('Cannot define property on immutable Set'); },
        deleteProperty() { throw new TypeError('Cannot delete property on immutable Set'); }
    });
    return Object.freeze(guard);
}

export const createReadOnlySetProxy = createReadOnlySetGuard;

/**
 * Immutable Set subclass that returns a tamper-proof Proxy receiver from its constructor.
 */
export class ImmutableSet extends Set {
    constructor(iterable) {
        super(iterable);
        return createReadOnlySetProxy(this);
    }
}

/**
 * Factory creating a truly frozen, unmodifiable Set protected against prototype reflection.
 */
export function createImmutableSet(iterable) {
    return createReadOnlySetProxy(new Set(iterable));
}

/**
 * Deep recursive freeze for objects and nested Sets.
 */
export function deepFreeze(obj, seen = new WeakSet()) {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) {
        return obj;
    }
    seen.add(obj);
    if (obj instanceof Set) {
        return createReadOnlySetProxy(obj);
    }
    Object.freeze(obj);
    for (const key of Object.getOwnPropertyNames(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object') {
            deepFreeze(val, seen);
        }
    }
    return obj;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 1: Evidence & contract mapping status definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Status of the contract mapping in the codebase / schema.
 * Indicates whether the canonical field has a consistent documented representation,
 * type, normalization rule, and storage decision in models/schemas.
 */
export const CONTRACT_MAPPING_STATUS = deepFreeze({
    /** Contract is verified: type, normalization rule, and storage disposition are fully implemented & tested */
    VERIFIED: 'VERIFIED',
    /** Contract is provisional: defined but normalization/disposition under review */
    PROVISIONAL: 'PROVISIONAL',
    /** Contract is explicitly deferred: recognized in dictionary, but storage/processing intentionally deferred */
    DEFERRED: 'DEFERRED',
    /** Not supported by this authority or not applicable */
    NOT_APPLICABLE: 'NOT_APPLICABLE',
});

/**
 * Status of real-world evidence for the source mapping.
 * Indicates whether the actual field label, structure, and value semantics have been
 * verified using a real redacted portal response sample or an authoritative specification.
 * 
 * CRITICAL RULE: All data-derived source portal mappings MUST remain UNVERIFIED
 * until a genuine redacted response sample or official portal API spec is provided.
 */
export const SOURCE_EVIDENCE_STATUS = deepFreeze({
    /** Mapping verified against a real (redacted) source response sample */
    VERIFIED_FROM_SAMPLE: 'VERIFIED_FROM_SAMPLE',
    /** Mapping verified from an official specification, published gazette, or official portal manual/API docs */
    VERIFIED_FROM_OFFICIAL_SPEC: 'VERIFIED_FROM_OFFICIAL_SPEC',
    /** Field is believed/known to exist on portal, but mapping and semantics are unverified due to lack of real response sample */
    UNVERIFIED: 'UNVERIFIED',
    /** Credible source evidence affirmatively establishes that the source does not provide or support this data */
    NOT_SUPPORTED: 'NOT_SUPPORTED',
    /** Internal CRM engine/orchestrator artifact; not retrieved from or defined by external government portals */
    NOT_APPLICABLE: 'NOT_APPLICABLE',
    /** Dedicated alias for internal engine provenance */
    INTERNAL_ENGINE: 'NOT_APPLICABLE',
});

/** Backward-compatible alias for Phase 1/Phase 2 test suites */
export const EVIDENCE_STATUS = SOURCE_EVIDENCE_STATUS;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 2: Typed sentinel values for missing/restricted/error data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SENTINEL = deepFreeze({
    /** The source was queried and explicitly returned a No / false / negative */
    FALSE: { _sentinel: 'FALSE', meaning: 'Source explicitly returned No/false/negative' },
    /** The source was queried but this field was not present in the response */
    NOT_RETURNED: { _sentinel: 'NOT_RETURNED', meaning: 'Field absent from source response' },
    /** The value is conceptually not applicable for this property type */
    NOT_APPLICABLE: { _sentinel: 'NOT_APPLICABLE', meaning: 'Field not applicable to this property type' },
    /** The source returned data but it could not be parsed into the expected type */
    PARSE_ERROR: { _sentinel: 'PARSE_ERROR', meaning: 'Source returned data but parsing failed' },
    /** The source returned a placeholder indicating the value is restricted/masked */
    RESTRICTED: { _sentinel: 'RESTRICTED', meaning: 'Source masks or restricts this value' },
    /** The source was not queried or we have no information about this field */
    UNKNOWN: { _sentinel: 'UNKNOWN', meaning: 'No information available; source not queried or field status unknown' },
    /** The source returned a categorical status that cannot be safely coerced to boolean true/false */
    CATEGORICAL_STATUS: { _sentinel: 'CATEGORICAL_STATUS', meaning: 'Source returned a categorical status (e.g. Pending, Rejected, descriptive text) that is not a definitive yes/no answer' },
    /** The source field label is ambiguous and requires manual review to determine its semantic meaning */
    NEEDS_REVIEW: { _sentinel: 'NEEDS_REVIEW', meaning: 'Source value cannot be automatically classified; needs manual review or verified source sample' },
});

/**
 * Check if a value is one of our typed sentinels.
 * @param {*} val
 * @returns {boolean}
 */
export const isSentinel = (val) => {
    return val !== null && typeof val === 'object' && typeof val._sentinel === 'string';
};

/**
 * Return the sentinel type string, or null if not a sentinel.
 * @param {*} val
 * @returns {string|null}
 */
export const sentinelType = (val) => {
    return isSentinel(val) ? val._sentinel : null;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 3: Area unit registry — no implicit conversions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AREA_UNIT_REGISTRY = deepFreeze({
    MARLA:          { id: 'MARLA',      label: 'Marla',        sqftFactor: null, note: 'Conversion factor varies by region (approx 272.25 sqft in Punjab/Haryana). NOT auto-converted.' },
    KANAL:          { id: 'KANAL',      label: 'Kanal',        sqftFactor: null, note: 'Conversion factor varies. NOT auto-converted.' },
    SQ_YARD:        { id: 'SQ_YARD',   label: 'Sq. Yard',     sqftFactor: null, note: 'Standard 1 sq yard = 9 sqft, but not auto-converted without approved rule.' },
    SQ_FEET:        { id: 'SQ_FEET',   label: 'Sq. Ft.',      sqftFactor: 1,    note: 'Base unit in CRM Inventory.size, but authority values stored as-is.' },
    SQ_METER:       { id: 'SQ_METER',  label: 'Sq. Meter',    sqftFactor: null, note: 'NOT auto-converted.' },
    ACRE:           { id: 'ACRE',       label: 'Acre',         sqftFactor: null, note: 'NOT auto-converted.' },
    BIGHA:          { id: 'BIGHA',      label: 'Bigha',        sqftFactor: null, note: 'Varies by state. NOT auto-converted.' },
    HECTARE:        { id: 'HECTARE',    label: 'Hectare',      sqftFactor: null, note: 'NOT auto-converted.' },
});

/**
 * Parse a raw area string from an authority source.
 * Returns { value: number|null, unit: string|null, raw: string, mode: string|null }
 *
 * This function SEPARATES area from allotment mode.
 * e.g. "10 Marla (Auction)" → { value: 10, unit: 'MARLA', raw: '10 Marla (Auction)', mode: 'Auction' }
 * e.g. "500 Sq. Yards"      → { value: 500, unit: 'SQ_YARD', raw: '500 Sq. Yards', mode: null }
 *
 * No conversion is performed. The numeric value is preserved in the source unit.
 */
export const parseAreaString = (raw) => {
    if (!raw || typeof raw !== 'string') {
        return { value: null, unit: null, raw: raw ?? '', mode: null, error: null };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return { value: null, unit: null, raw: '', mode: null, error: null };
    }

    // Extract parenthesized mode suffix: e.g. "(Auction)", "(eAuction)", "(Allotment)"
    let mode = null;
    let areaStr = trimmed;
    const modeMatch = trimmed.match(/\(([^)]+)\)\s*$/);
    if (modeMatch) {
        mode = modeMatch[1].trim();
        areaStr = trimmed.slice(0, modeMatch.index).trim();
    }

    // Attempt to extract numeric value and unit
    const numericMatch = areaStr.match(/^([\d,]+(?:\.\d+)?)\s*(.*)$/);
    if (!numericMatch) {
        return { value: null, unit: null, raw: trimmed, mode, error: 'PARSE_ERROR' };
    }

    const numStr = numericMatch[1].replace(/,/g, '');
    const value = parseFloat(numStr);
    if (isNaN(value)) {
        return { value: null, unit: null, raw: trimmed, mode, error: 'PARSE_ERROR' };
    }

    const unitStr = (numericMatch[2] || '').trim().toLowerCase();
    let unit = null;

    // Map raw unit strings to registry keys
    if (/^marla/i.test(unitStr))                           unit = 'MARLA';
    else if (/^kanal/i.test(unitStr))                      unit = 'KANAL';
    else if (/^sq\.?\s*y(ar)?d/i.test(unitStr))            unit = 'SQ_YARD';
    else if (/^sq\.?\s*f(ee)?t/i.test(unitStr))            unit = 'SQ_FEET';
    else if (/^sq\.?\s*m(eter|etre)?/i.test(unitStr))      unit = 'SQ_METER';
    else if (/^acre/i.test(unitStr))                       unit = 'ACRE';
    else if (/^bigha/i.test(unitStr))                      unit = 'BIGHA';
    else if (/^hectare/i.test(unitStr))                    unit = 'HECTARE';
    else if (unitStr === '')                                unit = null; // bare number
    else unit = null; // unrecognized unit, but we still have value

    return { value, unit, raw: trimmed, mode, error: unit === null && unitStr ? 'UNKNOWN_UNIT' : null };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 4: Authority registry — identity and policy metadata
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AUTHORITY_REGISTRY = deepFreeze({
    HSVP: {
        id: 'HSVP',
        fullName: 'Haryana Shehri Vikas Pradhikaran',
        formerNames: ['HUDA — Haryana Urban Development Authority'],
        jurisdiction: 'Haryana',
        coversCities: ['Gurugram', 'Faridabad', 'Panchkula', 'Karnal', 'Hisar', 'Rohtak', 'Panipat', 'Ambala', 'Kurukshetra', 'Sonipat', 'Yamunanagar'],
        portalDomain: 'hsvphry.org.in',
        permissionStatus: 'NOT_OBTAINED',
        policyVersion: '2026-10-27-PHASE1-DRAFT',
    },
    ESTATE_OFFICE_CHD: {
        id: 'ESTATE_OFFICE_CHD',
        fullName: 'Estate Office, Chandigarh Administration',
        formerNames: [],
        jurisdiction: 'Chandigarh (UT)',
        coversCities: ['Chandigarh'],
        portalDomain: 'chdestateoffice.gov.in',
        permissionStatus: 'NOT_OBTAINED',
        policyVersion: '2026-10-27-PHASE1-DRAFT',
    },
    GMADA: {
        id: 'GMADA',
        fullName: 'Greater Mohali Area Development Authority',
        formerNames: [],
        jurisdiction: 'Punjab (SAS Nagar district)',
        coversCities: ['Mohali', 'Kharar', 'Zirakpur', 'Dera Bassi', 'Naya Gaon'],
        portalDomain: 'gmada.gov.in',
        permissionStatus: 'NOT_OBTAINED',
        policyVersion: '2026-10-27-PHASE1-DRAFT',
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 5: Canonical field definitions for authority-verification data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * The canonical schema for authority verification data.
 * This will eventually be stored as `Inventory.authorityVerification` (Phase 2+).
 *
 * Every field includes:
 *   - type: expected JS type
 *   - description: human-readable
 *   - crm_mapping: how it relates to existing CRM fields (NEVER overwrites Inventory.status)
 *   - required: whether it must be present for a valid verification record
 */
export const CANONICAL_FIELDS = deepFreeze({

    // ──── Authority identity ────────────────────────────────────────────────
    authority: {
        type: 'string',
        description: 'Authority identifier from AUTHORITY_REGISTRY (e.g. HSVP, ESTATE_OFFICE_CHD, GMADA)',
        crm_mapping: 'authorityVerification.authority',
        required: true,
    },
    policyVersion: {
        type: 'string',
        description: 'Version tag of the source-policy contract at time of query',
        crm_mapping: 'authorityVerification.policyVersion',
        required: true,
    },

    // ──── Property identity (authority-side) ────────────────────────────────
    propertyId: {
        type: 'string',
        description: 'Primary property/plot number as assigned by the authority',
        crm_mapping: 'authorityVerification.propertyId',
        required: true,
    },
    fileNumber: {
        type: 'string|SENTINEL',
        description: 'Authority file/case number for the allotment',
        crm_mapping: 'authorityVerification.fileNumber',
        required: false,
    },
    formNumber: {
        type: 'string|SENTINEL',
        description: 'Form number used in the authority application/record',
        crm_mapping: 'authorityVerification.formNumber',
        required: false,
    },

    // ──── Location / scheme identity ────────────────────────────────────────
    schemeName: {
        type: 'string|SENTINEL',
        description: 'Name of the scheme/urban estate/sector development as per authority. NOT auto-mapped to Project.name.',
        crm_mapping: 'authorityVerification.schemeName',
        required: false,
    },
    urbanEstate: {
        type: 'string|SENTINEL',
        description: 'Urban estate name as used by HSVP (e.g. "Urban Estate Kurukshetra"). NOT auto-mapped to Inventory.city.',
        crm_mapping: 'authorityVerification.urbanEstate',
        required: false,
    },
    sectorNumber: {
        type: 'string|SENTINEL',
        description: 'Sector number within the scheme (sector only — phase is a separate concept; see phaseCode)',
        crm_mapping: 'authorityVerification.sectorNumber',
        required: false,
    },
    phaseCode: {
        type: 'string|SENTINEL',
        description: 'Phase identifier within the scheme (e.g. Phase-II, Phase XI). Distinct from sectorNumber and blockCode. Not all authorities use phases.',
        crm_mapping: 'authorityVerification.phaseCode',
        required: false,
    },
    blockCode: {
        type: 'string|SENTINEL',
        description: 'Block identifier within a sector or phase. Not all authorities use blocks.',
        crm_mapping: 'authorityVerification.blockCode',
        required: false,
    },
    estateOffice: {
        type: 'string|SENTINEL',
        description: 'Administering estate office name or location (Chandigarh specific)',
        crm_mapping: 'authorityVerification.estateOffice',
        required: false,
    },

    // ──── Property category / type ──────────────────────────────────────────
    propertyCategory: {
        type: 'string|SENTINEL',
        description: 'Authority property category label (e.g. Residential, Commercial, Industrial). Stored as source label + normalized.',
        crm_mapping: 'authorityVerification.propertyCategory',
        required: false,
    },
    propertyType: {
        type: 'string|SENTINEL',
        description: 'Sub-type label from authority (e.g. Plot, Booth, SCF, SCO, Flat, House)',
        crm_mapping: 'authorityVerification.propertyType',
        required: false,
    },

    // ──── Area / size (NEVER auto-converted) ────────────────────────────────
    area: {
        type: 'object',
        description: '{ value: number, unit: AREA_UNIT_REGISTRY key, raw: string }. Numeric value preserved in source unit. No conversions.',
        crm_mapping: 'authorityVerification.area',
        required: false,
    },
    allotmentMode: {
        type: 'string|SENTINEL',
        description: 'Allotment/sale mode separated from area label (e.g. Allotment, Auction, eAuction, Rehabilitation)',
        crm_mapping: 'authorityVerification.allotmentMode',
        required: false,
    },

    // ──── Authority-side status (NEVER mapped to Inventory.status) ─────────
    authorityStatus: {
        type: 'string|SENTINEL',
        description: 'Property status as per authority (e.g. Allotted, Transferred, Resumed, Cancelled). NEVER overwrites Inventory.status.',
        crm_mapping: 'authorityVerification.authorityStatus',
        required: false,
    },
    possessionStatus: {
        type: 'string|SENTINEL',
        description: 'Possession status (e.g. Offered, Taken, Not Offered, Deemed)',
        crm_mapping: 'authorityVerification.possessionStatus',
        required: false,
    },

    // ──── Allottee/owner identity (PRIVACY DEFERRED — NOT STORED) ────────────
    allotteeName: {
        type: 'string|SENTINEL',
        description: 'Allottee/owner name as per authority. DEFERRED under Phase 2.7 privacy review. NOT stored in database, snapshots, inventory, or logs. NOT auto-linked to Contact.',
        crm_mapping: 'DEFERRED_PRIVACY_REVIEW (NOT STORED)',
        storageDestination: 'NOT_STORED',
        privacyReviewDisposition: 'PRIVACY_DEFERRED_NOT_STORED',
        required: false,
    },
    allotteeAddress: {
        type: 'string|SENTINEL',
        description: 'Allottee address as per authority. DEFERRED under Phase 2.7 privacy review. NOT stored in database, snapshots, inventory, or logs. NOT auto-linked to Contact.',
        crm_mapping: 'DEFERRED_PRIVACY_REVIEW (NOT STORED)',
        storageDestination: 'NOT_STORED',
        privacyReviewDisposition: 'PRIVACY_DEFERRED_NOT_STORED',
        required: false,
    },

    // ──── Financial facts ───────────────────────────────────────────────────
    allotmentPrice: {
        type: 'object|SENTINEL',
        description: '{ value: number, currency: "INR", raw: string }. Original allotment price.',
        crm_mapping: 'authorityVerification.allotmentPrice',
        required: false,
    },
    currentDues: {
        type: 'object|SENTINEL',
        description: '{ value: number, currency: "INR", raw: string }. Outstanding dues/installments.',
        crm_mapping: 'authorityVerification.currentDues',
        required: false,
    },
    totalPaid: {
        type: 'object|SENTINEL',
        description: '{ value: number, currency: "INR", raw: string }. Total amount paid to authority.',
        crm_mapping: 'authorityVerification.totalPaid',
        required: false,
    },

    // ──── Dates ─────────────────────────────────────────────────────────────
    allotmentDate: {
        type: 'Date|SENTINEL',
        description: 'Date of original allotment. Parsed from source format.',
        crm_mapping: 'authorityVerification.allotmentDate',
        required: false,
    },
    possessionDate: {
        type: 'Date|SENTINEL',
        description: 'Date possession was offered/taken.',
        crm_mapping: 'authorityVerification.possessionDate',
        required: false,
    },
    lastTransferDate: {
        type: 'Date|SENTINEL',
        description: 'Date of last recorded transfer/mutation.',
        crm_mapping: 'authorityVerification.lastTransferDate',
        required: false,
    },

    // ──── Encumbrance / legal status ────────────────────────────────────────
    litigationStatus: {
        type: 'string|SENTINEL',
        description: 'Legal encumbrance status. String contract: NO_LITIGATION | LITIGATION_REPORTED | Categorical observation | Sentinel. Never JavaScript Boolean.',
        crm_mapping: 'authorityVerification.litigationStatus',
        required: false,
    },
    mortgageStatus: {
        type: 'string|SENTINEL',
        description: 'Financial encumbrance status. String contract: NO_MORTGAGE | MORTGAGE_REPORTED | Categorical observation | Sentinel. Never JavaScript Boolean.',
        crm_mapping: 'authorityVerification.mortgageStatus',
        required: false,
    },

    // ──── Building plan / construction ──────────────────────────────────────
    buildingPlanApproved: {
        type: 'boolean|SENTINEL',
        description: 'Whether building plan is approved. Must distinguish FALSE from UNKNOWN/NOT_RETURNED.',
        crm_mapping: 'authorityVerification.buildingPlanApproved',
        required: false,
    },
    occupancyCertificate: {
        type: 'boolean|SENTINEL',
        description: 'Whether occupancy/completion certificate is issued. Distinguish FALSE from UNKNOWN.',
        crm_mapping: 'authorityVerification.occupancyCertificate',
        required: false,
    },

    // ──── Verification metadata ─────────────────────────────────────────────
    verificationStatus: {
        type: 'string',
        description: 'Outcome of this verification attempt',
        enum: ['verified', 'mismatch', 'not_found', 'error', 'expired', 'pending'],
        crm_mapping: 'authorityVerification.status',
        required: true,
    },
    matchConfidence: {
        type: 'number|null',
        description: '0-100 confidence score for identity matching. null if not computed.',
        crm_mapping: 'authorityVerification.matchConfidence',
        required: false,
    },
    matchStrategy: {
        type: 'string|null',
        description: 'Strategy used: exact_composite, fuzzy_name, manual_confirm, property_id_only',
        crm_mapping: 'authorityVerification.matchStrategy',
        required: false,
    },
    verifiedAt: {
        type: 'Date',
        description: 'Timestamp of this verification attempt (UTC)',
        crm_mapping: 'authorityVerification.lastVerifiedAt',
        required: true,
    },
    verifiedBy: {
        type: 'ObjectId|string|null',
        description: 'User who triggered this verification (null for automated)',
        crm_mapping: 'authorityVerification.verifiedBy',
        required: false,
    },
    source: {
        type: 'string',
        description: 'How the data was obtained: manual | automated | import',
        crm_mapping: 'authorityVerification.source',
        required: true,
    },
    snapshotContentHash: {
        type: 'string|null',
        description: 'SHA-256 hash of the normalized permitted property facts (excludes PII/tokens). Canonical change-detection digest.',
        crm_mapping: 'authorityVerification.snapshotContentHash',
        required: false,
    },
    rawSnapshotHash: {
        type: 'string|null',
        description: 'Backward-compatible alias for snapshotContentHash in Inventory.authorityVerification.',
        crm_mapping: 'authorityVerification.rawSnapshotHash',
        required: false,
    },
});

// Module-private policy collection (inaccessible and unmodifiable from outside)
const _INTERNAL_ENGINE_FIELDS = new Set([
    'authority',
    'policyVersion',
    'verificationStatus',
    'matchConfidence',
    'matchStrategy',
    'verifiedAt',
    'verifiedBy',
    'source',
    'snapshotContentHash',
    'rawSnapshotHash'
]);

/**
 * Checks whether a given field name is a canonical internal engine field.
 * Queries the private unmodifiable Set.
 * 
 * @param {string} key
 * @returns {boolean}
 */
export function isInternalEngineField(key) {
    return _INTERNAL_ENGINE_FIELDS.has(key);
}

/**
 * Returns a defensive copy of all canonical internal engine field names.
 * 
 * @returns {string[]}
 */
export function getInternalEngineFields() {
    return Array.from(_INTERNAL_ENGINE_FIELDS);
}

/**
 * Canonical orchestrator / engine artifacts that are generated internally by the CRM
 * and do not correspond to external government authority response fields.
 * These MUST always have sourceEvidenceStatus: NOT_APPLICABLE.
 * Exported as a tamper-proof Read-Only Set Proxy for backward compatibility.
 */
export const INTERNAL_ENGINE_FIELDS = createReadOnlySetProxy(_INTERNAL_ENGINE_FIELDS);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 6: Source-specific field mapping tables
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Each entry maps:
 *   canonicalField → {
 *     sourceLabel:    raw label/key as it appears in the source response
 *     sourceExample:  redacted example value (or null if no sample available)
 *     evidence:       EVIDENCE_STATUS value
 *     transform:      description of any normalization applied
 *     notes:          caveats, restrictions, or verification requirements
 *   }
 *
 * CRITICAL:
 *   - Where no real source sample exists, evidence = UNVERIFIED
 *   - No HTML selectors, endpoints, or response structures are invented
 *   - Only publicly known field labels from authority forms are referenced
 */

export const SOURCE_FIELD_MAPS = deepFreeze({

    // ════════════════════════════════════════════════════════════════════════
    //  HSVP
    // ════════════════════════════════════════════════════════════════════════
    HSVP: {
        authority:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: "HSVP", contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, evidence: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, transform: "Constant", notes: "Internal engine constant/metadata; not retrieved from or defined by external government portals." },
        policyVersion:         { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: "2026-10-27-PHASE1-DRAFT", contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, evidence: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, transform: "Constant", notes: "Internal engine constant/metadata; not retrieved from or defined by external government portals." },
        propertyId:            { sourceLabel: "Property No.", proposedSourceLabel: "Property No.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Primary identifier on HSVP property records. No real sample available." },
        fileNumber:            { sourceLabel: "File No.", proposedSourceLabel: "File No.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "HSVP file reference. No real sample available." },
        formNumber:            { sourceLabel: "Form No.", proposedSourceLabel: "Form No.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Application form number. No real sample available." },
        schemeName:            { sourceLabel: "Scheme", proposedSourceLabel: "Scheme", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Scheme name. NOT mapped to CRM projectName." },
        urbanEstate:           { sourceLabel: "Urban Estate", proposedSourceLabel: "Urban Estate", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Urban estate identifier. NOT mapped to CRM city." },
        sectorNumber:          { sourceLabel: "Sector", proposedSourceLabel: "Sector", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). Strip \"Sector\" prefix if present.", notes: "Sector within estate." },
        phaseCode:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: null, notes: "HSVP scheme names may embed phase info (e.g. \"Urban Estate Phase-II\") but no separate phase field is confirmed. UNVERIFIED." },
        blockCode:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: null, notes: "No separate block field confirmed for HSVP. UNVERIFIED." },
        estateOffice:          { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.NOT_APPLICABLE, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, evidence: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, transform: null, notes: "HSVP does not use estate office field." },
        propertyCategory:      { sourceLabel: "Category", proposedSourceLabel: "Category", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). Preserve source label.", notes: "E.g. Residential, Commercial, Industrial." },
        propertyType:          { sourceLabel: "Type", proposedSourceLabel: "Type", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). Preserve source label.", notes: "E.g. Plot, Booth, SCF, Flat." },
        area:                  { sourceLabel: "Size/Area", proposedSourceLabel: "Size/Area", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAreaString(). Separates value, unit, mode.", notes: "No unit conversion. Mode (Auction/Allotment) separated." },
        allotmentMode:         { sourceLabel: "(extracted from area)", proposedSourceLabel: "(extracted from area)", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "Extracted from parenthesized suffix in area label.", notes: "e.g. \"(Auction)\" from \"10 Marla (Auction)\"" },
        authorityStatus:       { sourceLabel: "Status", proposedSourceLabel: "Status", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). Preserve as-is.", notes: "NEVER mapped to Inventory.status." },
        possessionStatus:      { sourceLabel: "Possession", proposedSourceLabel: "Possession", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "E.g. Offered, Taken, Not Offered." },
        allotteeName:          { sourceLabel: "Allottee Name", proposedSourceLabel: "Allottee Name", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.DEFERRED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). NEVER auto-linked to Contact.", privacyDisposition: "PRIVACY_DEFERRED_NOT_STORED", notes: "Personal data strictly deferred pending legal basis and privacy review. Under Phase 2.7 policy, this field is NEVER stored in database, snapshots, inventory, audit logs, or CRM contacts." },
        allotteeAddress:       { sourceLabel: "Address", proposedSourceLabel: "Address", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.DEFERRED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). NEVER auto-linked.", privacyDisposition: "PRIVACY_DEFERRED_NOT_STORED", notes: "Personal data strictly deferred pending legal basis and privacy review. Under Phase 2.7 policy, this field is NEVER stored in database, snapshots, inventory, audit logs, or CRM contacts." },
        allotmentPrice:        { sourceLabel: "Allotment Price", proposedSourceLabel: "Allotment Price", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "Assumed INR. Retained as snapshot observation only." },
        currentDues:           { sourceLabel: "Outstanding Dues", proposedSourceLabel: "Outstanding Dues", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "May not be present. Categorical dues status maps to Inventory." },
        totalPaid:             { sourceLabel: "Amount Paid", proposedSourceLabel: "Amount Paid", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "May not be present. Retained as snapshot observation only." },
        allotmentDate:         { sourceLabel: "Date of Allotment", proposedSourceLabel: "Date of Allotment", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "Expected DD/MM/YYYY or DD-MM-YYYY." },
        possessionDate:        { sourceLabel: "Possession Date", proposedSourceLabel: "Possession Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "May not be present." },
        lastTransferDate:      { sourceLabel: "Transfer Date", proposedSourceLabel: "Transfer Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "Date of last mutation." },
        litigationStatus:      { sourceLabel: "Litigation", proposedSourceLabel: "Litigation", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeLitigationStatus()", notes: "String contract: NO_LITIGATION | LITIGATION_REPORTED | Categorical observation | Sentinel. Never boolean." },
        mortgageStatus:        { sourceLabel: "Mortgage", proposedSourceLabel: "Mortgage", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeMortgageStatus()", notes: "String contract: NO_MORTGAGE | MORTGAGE_REPORTED | Categorical observation | Sentinel. Never boolean." },
        buildingPlanApproved:  { sourceLabel: "Building Plan", proposedSourceLabel: "Building Plan", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeBooleanStatus()", notes: "Approved / Not Approved / Not Applied." },
        occupancyCertificate:  { sourceLabel: "OC", proposedSourceLabel: "OC", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeBooleanStatus()", notes: "Issued / Not Issued." },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  ESTATE_OFFICE_CHD
    // ════════════════════════════════════════════════════════════════════════
    ESTATE_OFFICE_CHD: {
        authority:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: "ESTATE_OFFICE_CHD", contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, evidence: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, transform: "Constant", notes: "Internal engine constant/metadata; not retrieved from or defined by external government portals." },
        policyVersion:         { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: "2026-10-27-PHASE1-DRAFT", contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, evidence: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, transform: "Constant", notes: "Internal engine constant/metadata; not retrieved from or defined by external government portals." },
        propertyId:            { sourceLabel: "Property No.", proposedSourceLabel: "Property No.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Property number in Chandigarh estate records. No real sample." },
        fileNumber:            { sourceLabel: "File No.", proposedSourceLabel: "File No.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Estate office file number. No real sample." },
        formNumber:            { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: null, notes: "Uncertain if Chandigarh uses a form number. Marked UNVERIFIED." },
        schemeName:            { sourceLabel: "Scheme/Colony", proposedSourceLabel: "Scheme/Colony", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Colony or scheme name. NOT mapped to CRM projectName." },
        urbanEstate:           { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.NOT_APPLICABLE, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, evidence: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, transform: null, notes: "Chandigarh uses sectors, not \"urban estates\"." },
        sectorNumber:          { sourceLabel: "Sector", proposedSourceLabel: "Sector", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Sector within Chandigarh." },
        phaseCode:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: null, notes: "Chandigarh primarily uses sectors, but certain areas (e.g. Industrial Area Phase I & II) use phase terminology. Absent a definitive official specification or sample proving non-support, this remains UNVERIFIED under Phase 2.7 standards." },
        blockCode:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: null, notes: "No separate block field confirmed for CHD. Sector suffixes (e.g. 22-B) may encode block info. UNVERIFIED." },
        estateOffice:          { sourceLabel: "Estate Office", proposedSourceLabel: "Estate Office", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Administering estate office name." },
        propertyCategory:      { sourceLabel: "Category", proposedSourceLabel: "Category", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Residential / Commercial / Industrial etc." },
        propertyType:          { sourceLabel: "Type", proposedSourceLabel: "Type", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Plot, Booth, SCF, Flat etc." },
        area:                  { sourceLabel: "Size", proposedSourceLabel: "Size", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAreaString()", notes: "No unit conversion." },
        allotmentMode:         { sourceLabel: "Mode of Allotment", proposedSourceLabel: "Mode of Allotment", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "May be a separate field or embedded in area." },
        authorityStatus:       { sourceLabel: "Status", proposedSourceLabel: "Status", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "NEVER mapped to Inventory.status." },
        possessionStatus:      { sourceLabel: "Possession Status", proposedSourceLabel: "Possession Status", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Offered / Not Offered / Taken." },
        allotteeName:          { sourceLabel: "Allottee", proposedSourceLabel: "Allottee", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.DEFERRED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). NOT auto-linked.", privacyDisposition: "PRIVACY_DEFERRED_NOT_STORED", notes: "Personal data strictly deferred pending legal basis and privacy review. Under Phase 2.7 policy, this field is NEVER stored in database, snapshots, inventory, audit logs, or CRM contacts." },
        allotteeAddress:       { sourceLabel: "Address", proposedSourceLabel: "Address", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.DEFERRED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). NOT auto-linked.", privacyDisposition: "PRIVACY_DEFERRED_NOT_STORED", notes: "Personal data strictly deferred pending legal basis and privacy review. Under Phase 2.7 policy, this field is NEVER stored in database, snapshots, inventory, audit logs, or CRM contacts." },
        allotmentPrice:        { sourceLabel: "Allotment Price", proposedSourceLabel: "Allotment Price", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "INR assumed. Retained as snapshot observation only." },
        currentDues:           { sourceLabel: "Dues", proposedSourceLabel: "Dues", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "Outstanding dues." },
        totalPaid:             { sourceLabel: "Paid Amount", proposedSourceLabel: "Paid Amount", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "Total paid. Retained as snapshot observation only." },
        allotmentDate:         { sourceLabel: "Allotment Date", proposedSourceLabel: "Allotment Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "DD/MM/YYYY expected." },
        possessionDate:        { sourceLabel: "Possession Date", proposedSourceLabel: "Possession Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "May not be present." },
        lastTransferDate:      { sourceLabel: "Last Transfer Date", proposedSourceLabel: "Last Transfer Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "Date of last mutation/transfer." },
        litigationStatus:      { sourceLabel: "Court Case", proposedSourceLabel: "Court Case", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeLitigationStatus()", notes: "String contract: NO_LITIGATION | LITIGATION_REPORTED | Categorical observation | Sentinel. Never boolean." },
        mortgageStatus:        { sourceLabel: "Mortgage", proposedSourceLabel: "Mortgage", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeMortgageStatus()", notes: "String contract: NO_MORTGAGE | MORTGAGE_REPORTED | Categorical observation | Sentinel. Never boolean." },
        buildingPlanApproved:  { sourceLabel: "Building Plan", proposedSourceLabel: "Building Plan", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeBooleanStatus()", notes: "Approved / Not." },
        occupancyCertificate:  { sourceLabel: "Completion Cert.", proposedSourceLabel: "Completion Cert.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeBooleanStatus()", notes: "Issued / Not Issued." },
    },

    // ════════════════════════════════════════════════════════════════════════
    //  GMADA
    // ════════════════════════════════════════════════════════════════════════
    GMADA: {
        authority:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: "GMADA", contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, evidence: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, transform: "Constant", notes: "Internal engine constant/metadata; not retrieved from or defined by external government portals." },
        policyVersion:         { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: "2026-10-27-PHASE1-DRAFT", contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, evidence: SOURCE_EVIDENCE_STATUS.NOT_APPLICABLE, transform: "Constant", notes: "Internal engine constant/metadata; not retrieved from or defined by external government portals." },
        propertyId:            { sourceLabel: "Plot No. / Property No.", proposedSourceLabel: "Plot No. / Property No.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "GMADA property identifier. No real sample." },
        fileNumber:            { sourceLabel: "File No.", proposedSourceLabel: "File No.", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "GMADA file reference. No real sample." },
        formNumber:            { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: null, notes: "Uncertain if GMADA uses form numbers. Marked UNVERIFIED." },
        schemeName:            { sourceLabel: "Scheme / Phase", proposedSourceLabel: "Scheme / Phase", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "e.g. \"IT City Sector 66A Mohali\". NOT mapped to projectName." },
        urbanEstate:           { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.NOT_APPLICABLE, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, evidence: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, transform: null, notes: "GMADA does not use \"Urban Estate\" terminology." },
        sectorNumber:          { sourceLabel: "Sector / Phase", proposedSourceLabel: "Sector / Phase", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "classifyLocationComponent(). If classified as sector, normalize. If phase, route to phaseCode. If bare/ambiguous, return NEEDS_REVIEW.", notes: "GMADA source label \"Sector / Phase\" is UNVERIFIED — may contain a sector number, a phase identifier, or a combined value. Do NOT blindly assign to sectorNumber." },
        phaseCode:             { sourceLabel: "(may be extracted from Sector / Phase)", proposedSourceLabel: "(may be extracted from Sector / Phase)", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "classifyLocationComponent()", notes: "GMADA may embed phase in the \"Sector / Phase\" field. No separate phase field confirmed. UNVERIFIED." },
        blockCode:             { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: null, notes: "No separate block field confirmed for GMADA. UNVERIFIED." },
        estateOffice:          { sourceLabel: null, proposedSourceLabel: null, verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.NOT_APPLICABLE, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, evidence: SOURCE_EVIDENCE_STATUS.NOT_SUPPORTED, transform: null, notes: "GMADA is the authority itself, not an estate office structure." },
        propertyCategory:      { sourceLabel: "Category", proposedSourceLabel: "Category", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Residential / Commercial / Industrial / Institutional." },
        propertyType:          { sourceLabel: "Type", proposedSourceLabel: "Type", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Plot, SCO, SCF, Flat, Villa etc." },
        area:                  { sourceLabel: "Size / Area", proposedSourceLabel: "Size / Area", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAreaString()", notes: "No unit conversion." },
        allotmentMode:         { sourceLabel: "Mode", proposedSourceLabel: "Mode", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Allotment, Auction, eAuction etc." },
        authorityStatus:       { sourceLabel: "Status", proposedSourceLabel: "Status", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "NEVER mapped to Inventory.status." },
        possessionStatus:      { sourceLabel: "Possession", proposedSourceLabel: "Possession", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim()", notes: "Offered / Taken etc." },
        allotteeName:          { sourceLabel: "Allottee Name", proposedSourceLabel: "Allottee Name", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.DEFERRED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). NOT auto-linked.", privacyDisposition: "PRIVACY_DEFERRED_NOT_STORED", notes: "Personal data strictly deferred pending legal basis and privacy review. Under Phase 2.7 policy, this field is NEVER stored in database, snapshots, inventory, audit logs, or CRM contacts." },
        allotteeAddress:       { sourceLabel: "Address", proposedSourceLabel: "Address", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.DEFERRED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "trim(). NOT auto-linked.", privacyDisposition: "PRIVACY_DEFERRED_NOT_STORED", notes: "Personal data strictly deferred pending legal basis and privacy review. Under Phase 2.7 policy, this field is NEVER stored in database, snapshots, inventory, audit logs, or CRM contacts." },
        allotmentPrice:        { sourceLabel: "Allotment Price", proposedSourceLabel: "Allotment Price", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "INR assumed. Retained as snapshot observation only." },
        currentDues:           { sourceLabel: "Dues", proposedSourceLabel: "Dues", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "Outstanding dues." },
        totalPaid:             { sourceLabel: "Total Paid", proposedSourceLabel: "Total Paid", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseCurrencyAmount()", notes: "Amount paid to GMADA. Retained as snapshot observation only." },
        allotmentDate:         { sourceLabel: "Allotment Date", proposedSourceLabel: "Allotment Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "DD/MM/YYYY expected." },
        possessionDate:        { sourceLabel: "Possession Date", proposedSourceLabel: "Possession Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "May not be present." },
        lastTransferDate:      { sourceLabel: "Transfer Date", proposedSourceLabel: "Transfer Date", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "parseAuthorityDate()", notes: "Last mutation." },
        litigationStatus:      { sourceLabel: "Litigation", proposedSourceLabel: "Litigation", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeLitigationStatus()", notes: "String contract: NO_LITIGATION | LITIGATION_REPORTED | Categorical observation | Sentinel. Never boolean." },
        mortgageStatus:        { sourceLabel: "Mortgage", proposedSourceLabel: "Mortgage", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeMortgageStatus()", notes: "String contract: NO_MORTGAGE | MORTGAGE_REPORTED | Categorical observation | Sentinel. Never boolean." },
        buildingPlanApproved:  { sourceLabel: "Building Plan", proposedSourceLabel: "Building Plan", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeBooleanStatus()", notes: "Approved / Not." },
        occupancyCertificate:  { sourceLabel: "OC / CC", proposedSourceLabel: "OC / CC", verifiedSourceLabel: null, sourceExample: null, contractMappingStatus: CONTRACT_MAPPING_STATUS.VERIFIED, sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED, evidence: SOURCE_EVIDENCE_STATUS.UNVERIFIED, transform: "normalizeBooleanStatus()", notes: "Issued / Not Issued." },
    },
});

export default {
    createReadOnlySetGuard,
    createReadOnlySetProxy,
    ImmutableSet,
    createImmutableSet,
    deepFreeze,
    isInternalEngineField,
    getInternalEngineFields,
    CONTRACT_MAPPING_STATUS,
    SOURCE_EVIDENCE_STATUS,
    EVIDENCE_STATUS,
    SENTINEL,
    isSentinel,
    sentinelType,
    AREA_UNIT_REGISTRY,
    AUTHORITY_REGISTRY,
    CANONICAL_FIELDS,
    INTERNAL_ENGINE_FIELDS,
    SOURCE_FIELD_MAPS,
    parseAreaString,
};
