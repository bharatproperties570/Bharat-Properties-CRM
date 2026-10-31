/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — BASE FIXTURE ADAPTER
 *  Phase 3A: Isolated Fixture-Only Adapter Contract
 * ============================================================================
 * 
 *  CRITICAL SAFETY & GOVERNANCE RULES:
 *  1. FIXTURE-ONLY EXECUTION: Consumes explicit local test fixtures only.
 *  2. NO LIVE NETWORK ACCESS: No http, https, fetch, axios, Playwright, or Puppeteer.
 *  3. SOURCE DISABLED BOUNDARY: Sources remain disabled (authorizationStatus: NOT_OBTAINED).
 *  4. NO CRM MUTATIONS: Adapters produce verification candidates for human review.
 *     They NEVER mutate Inventory documents or create Contact records.
 *  5. SANITIZATION: Scrubs credentials, personal identifiers, and script fragments.
 * 
 *  @module BaseFixtureAdapter
 *  @version 3.0.0-phase3a
 */

import {
    SOURCE_FIELD_MAPS,
    SOURCE_EVIDENCE_STATUS,
    isSentinel,
    SENTINEL
} from './authorityFieldDictionary.js';
import {
    normalizeAuthorityRecord,
    buildCompositeKey,
    computeSnapshotContentHash
} from './authorityNormalizer.js';
import {
    ALLOWED_UPDATE_FIELDS,
    BLOCKED_UPDATE_FIELDS
} from '../../models/PropertyVerificationRunItem.js';

// Forbidden network configuration parameters in fixtures
const FORBIDDEN_NETWORK_KEYS = new Set([
    'url', 'endpoint', 'scrapeOptions', 'proxyUrl', 'proxy',
    'port', 'headers', 'scrapeProxy', 'method', 'agent', 'host'
]);

// Sensitive credential keys that must never enter adapter state
const CREDENTIAL_KEYS = new Set([
    'apiKey', 'password', 'authToken', 'bearerToken',
    'secretKey', 'token', 'secret', 'accessKey', 'privateKey'
]);

// Personal Data (PII) keys that must be scrubbed from fixture processing
const PII_KEYS = new Set([
    'allotteeName', 'allotteeAddress', 'allotteePhone', 'allotteeEmail',
    'ownerName', 'ownerPhone', 'ownerEmail', 'allottee', 'Address',
    'aadhaar', 'pan', 'phone', 'email', 'mobile'
]);

// Regex to strip dangerous script fragments or HTML tags
const SCRIPT_BLOCK_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const IFRAME_BLOCK_REGEX = /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi;
const ANY_TAG_REGEX = /<[^>]+>|javascript:/gi;

// Disallowed characters in property identifiers:
// - Markup or script tags (<[^>]*>, <, >, javascript:)
// - ASCII control characters (0x00-0x1F, 0x7F-0x9F)
// - Directional / layout Unicode formatting overrides (U+200E, U+200F, U+202A-U+202E, U+2066-U+2069)
// - Zero-width or invisible characters (U+200B-U+200D, U+FEFF)
const DISALLOWED_IDENTIFIER_CHARS_REGEX = /[\x00-\x1F\x7F-\x9F\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]|<[^>]*>|[<>]|javascript:/i;

// Identifies whether a field is a property/plot/sector/phase/block/file identifier
export const isIdentifierField = (fieldName) => {
    if (!fieldName || typeof fieldName !== 'string') return false;
    const clean = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return /^(propertyid|plotno|plotnumber|sitenumber|fileno|filenumber|memono|memonumber|sector|sectornumber|sectorcode|phase|phasecode|block|blockcode|urbanestate|urbanestatecode|unitno|unitnumber|boothno|scfno|scono|flatno|schemecolony)/.test(clean) ||
           clean.includes('propertyno') || clean.includes('plotpropertyno') || clean.includes('sitebuildingno') || clean.includes('sectorphase');
};

export default class BaseFixtureAdapter {
    /**
     * @param {string} authorityCode - 'HSVP', 'CHD', or 'GMADA'
     * @param {string} authorityName - Human-readable authority title
     * @param {object} [options]
     */
    constructor(authorityCode, authorityName, options = {}) {
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            throw new Error(`UNKNOWN_AUTHORITY: Cannot construct adapter for unknown code "${authorityCode}". Fail closed.`);
        }
        this.authorityCode = authorityCode;
        this.authorityName = authorityName;
        this.options = Object.freeze({ ...options });
    }

    /**
     * Authority unique code.
     * @returns {'HSVP'|'CHD'|'GMADA'}
     */
    getAuthorityCode() {
        return this.authorityCode;
    }

    /**
     * Authority display name.
     * @returns {string}
     */
    getAuthorityName() {
        return this.authorityName;
    }

    /**
     * Verification source activation status.
     * In Phase 3A, all sources are strictly disabled.
     * @returns {boolean} Always false
     */
    isSourceActivated() {
        return false;
    }

    /**
     * Retrieve source mapping dictionary for this authority.
     * Handles CHD alias to ESTATE_OFFICE_CHD in SOURCE_FIELD_MAPS.
     * 
     * @returns {object}
     */
    getSourceMap() {
        return SOURCE_FIELD_MAPS[this.authorityCode] ||
               (this.authorityCode === 'CHD' ? SOURCE_FIELD_MAPS['ESTATE_OFFICE_CHD'] : null) || {};
    }

    /**
     * Look up source evidence status for a canonical field.
     * @param {string} canonicalField
     * @returns {string}
     */
    getSourceEvidenceStatus(canonicalField) {
        const map = this.getSourceMap();
        if (!map || !map[canonicalField]) return SOURCE_EVIDENCE_STATUS.UNVERIFIED;
        return map[canonicalField].sourceEvidenceStatus || SOURCE_EVIDENCE_STATUS.UNVERIFIED;
    }

    /**
     * 1. VALIDATE FIXTURE
     * Inspects, validates, and sanitizes input data.
     * Strips credentials, network directives, PII, and script injection tokens.
     * 
     * @param {unknown} input - Raw fixture object
     * @returns {{ isValid: boolean, errors: string[], warnings: string[], sanitizedData: object|null }}
     */
    validateFixture(input) {
        const errors = [];
        const warnings = [];

        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            return {
                isValid: false,
                errors: ['Fixture input must be a non-null plain Object'],
                warnings: [],
                sanitizedData: null
            };
        }

        // Deep-clone / sanitize fields
        const sanitized = {};
        for (const [key, rawVal] of Object.entries(input)) {
            // 1. Detect forbidden network keys
            if (FORBIDDEN_NETWORK_KEYS.has(key)) {
                warnings.push(`Forbidden network parameter stripped from fixture: ${key}`);
                continue;
            }

            // 2. Detect credential injections
            if (CREDENTIAL_KEYS.has(key)) {
                warnings.push(`Credential parameter stripped from fixture: ${key}`);
                continue;
            }

            // 3. Detect PII keys
            if (PII_KEYS.has(key)) {
                warnings.push(`Personal information parameter scrubbed from fixture: ${key}`);
                continue;
            }

            // 4. Handle String Fields: Differentiate Identifiers vs General Content
            if (typeof rawVal === 'string') {
                if (isIdentifierField(key)) {
                    // Security validation: check for disallowed markup or control characters
                    if (DISALLOWED_IDENTIFIER_CHARS_REGEX.test(rawVal)) {
                        warnings.push(`Malformed identifier rejected in field "${key}": contains disallowed markup or control characters`);
                        // DO NOT silently transform or strip! Reject identifier
                        sanitized[key] = {
                            value: null,
                            raw: '[REJECTED_IDENTIFIER]',
                            sentinel: 'PARSE_ERROR',
                            error: 'MALFORMED_IDENTIFIER',
                            isRejected: true
                        };
                    } else {
                        // Ordinary whitespace normalization separated from security validation
                        sanitized[key] = rawVal.trim().replace(/\s+/g, ' ');
                    }
                } else {
                    // Non-identifier string field (e.g. remarks, notes)
                    if (SCRIPT_BLOCK_REGEX.test(rawVal) || IFRAME_BLOCK_REGEX.test(rawVal) || ANY_TAG_REGEX.test(rawVal)) {
                        warnings.push(`Potential script/HTML injection sanitized in field: ${key}`);
                        const cleanStr = rawVal
                            .replace(SCRIPT_BLOCK_REGEX, '')
                            .replace(IFRAME_BLOCK_REGEX, '')
                            .replace(ANY_TAG_REGEX, '')
                            .trim();
                        sanitized[key] = cleanStr;
                    } else {
                        sanitized[key] = rawVal.trim();
                    }
                }
            } else if (rawVal !== null && typeof rawVal === 'object') {
                // If nested object or array, preserve for malformed type testing, but warn
                warnings.push(`Malformed or non-primitive type in field: ${key}`);
                sanitized[key] = rawVal;
            } else {
                sanitized[key] = rawVal;
            }
        }

        return {
            isValid: true,
            errors,
            warnings,
            sanitizedData: sanitized
        };
    }

    /**
     * 2. PARSE FIXTURE
     * Maps raw authority-specific keys to canonical fields using SOURCE_FIELD_MAPS.
     * 
     * @param {object} sanitizedData
     * @returns {object} Raw record mapped by canonical field names
     */
    parseFixture(sanitizedData) {
        if (!sanitizedData || typeof sanitizedData !== 'object') {
            return {};
        }

        const sourceMap = this.getSourceMap();
        const parsedRecord = {};

        // For each canonical field in the source map, extract by sourceLabel
        for (const [canonicalField, mapping] of Object.entries(sourceMap)) {
            const { sourceLabel } = mapping;
            if (sourceLabel && sanitizedData[sourceLabel] !== undefined) {
                parsedRecord[sourceLabel] = sanitizedData[sourceLabel];
            }
        }

        // Also pass through any non-mapped raw fields for edge-case testing
        for (const [key, val] of Object.entries(sanitizedData)) {
            if (parsedRecord[key] === undefined) {
                parsedRecord[key] = val;
            }
        }

        // Subclass hook for authority-specific parsing nuances
        return this._customParse(sanitizedData, parsedRecord);
    }

    /**
     * Subclass hook for custom parsing. Default implementation is no-op.
     * @protected
     */
    _customParse(sanitizedData, parsedRecord) {
        return parsedRecord;
    }

    /**
     * 3. NORMALIZE RECORD
     * Runs standard canonical normalization rules and calculates compositeKey + contentHash.
     * 
     * @param {object} parsedRecord
     * @returns {object} Canonical normalized record
     */
    normalizeRecord(parsedRecord) {
        const sourceMap = this.getSourceMap();
        const normResult = normalizeAuthorityRecord(this.authorityCode, parsedRecord, sourceMap);

        if (normResult.error) {
            throw new Error(`NORMALIZATION_ERROR: Failed to normalize ${this.authorityCode} record: ${normResult.error}`);
        }

        const record = normResult.record;

        // Calculate composite key with defensive string unnesting
        const sec = typeof record.sectorNumber === 'object' && record.sectorNumber !== null
            ? (record.sectorNumber.error ? null : (record.sectorNumber.normalized || record.sectorNumber.raw))
            : (record.sectorNumber || null);

        const prop = typeof record.propertyId === 'object' && record.propertyId !== null
            ? (record.propertyId.error ? null : (record.propertyId.normalized || record.propertyId.raw))
            : (record.propertyId || null);

        const uEstate = typeof record.urbanEstate === 'object' && record.urbanEstate !== null
            ? (record.urbanEstate.error ? null : (record.urbanEstate.normalized || record.urbanEstate.raw))
            : (record.urbanEstate || null);

        const ph = typeof record.phaseCode === 'object' && record.phaseCode !== null
            ? (record.phaseCode.error ? null : (record.phaseCode.normalized || record.phaseCode.raw))
            : (record.phaseCode || null);

        record._compositeKey = buildCompositeKey(this.authorityCode, sec, prop, uEstate, ph);

        // Calculate deterministic content hash
        record._contentHash = computeSnapshotContentHash(record);

        return record;
    }

    /**
     * 4. COMPARE WITH INVENTORY & PRODUCE CANDIDATE
     * Compares normalized facts against synthetic CRM inventory context.
     * Produces match evidence, data quality warnings, unverified field list,
     * and proposed field-by-field diff.
     * 
     * @param {object} normalizedRecord
     * @param {object|null} [inventoryContext]
     * @returns {{ matchEvidence: object, dataQualityWarnings: string[], unverifiedFields: string[], proposedChanges: object[] }}
     */
    compareWithInventory(normalizedRecord, inventoryContext = null) {
        const dataQualityWarnings = [];
        const unverifiedFields = [];
        const proposedChanges = [];

        // 1. Identify unverified fields
        const sourceMap = this.getSourceMap();
        for (const [field, mapping] of Object.entries(sourceMap)) {
            if (mapping.sourceEvidenceStatus === SOURCE_EVIDENCE_STATUS.UNVERIFIED) {
                unverifiedFields.push(field);
            }
        }
        // Proposed contract additions are always unverified
        if (!unverifiedFields.includes('groundRentStatus')) unverifiedFields.push('groundRentStatus');
        if (!unverifiedFields.includes('tenureType')) unverifiedFields.push('tenureType');

        // 2. Data Quality Warnings
        const propId = typeof normalizedRecord.propertyId === 'object' && normalizedRecord.propertyId !== null
            ? (normalizedRecord.propertyId.error ? null : normalizedRecord.propertyId.normalized)
            : (typeof normalizedRecord.propertyId === 'string' ? normalizedRecord.propertyId : null);

        if (!propId || isSentinel(propId)) {
            dataQualityWarnings.push('Missing property identifier (propertyId)');
        }
        if (normalizedRecord.propertyId?.error === 'MALFORMED_IDENTIFIER') {
            dataQualityWarnings.push('Malformed identifier rejected in field "propertyId"');
        }

        const sector = typeof normalizedRecord.sectorNumber === 'object' && normalizedRecord.sectorNumber !== null
            ? (normalizedRecord.sectorNumber.error ? null : normalizedRecord.sectorNumber.normalized)
            : (typeof normalizedRecord.sectorNumber === 'string' ? normalizedRecord.sectorNumber : null);

        if (!sector || isSentinel(sector)) {
            dataQualityWarnings.push('Missing sector coordinate (sectorNumber)');
        }
        if (normalizedRecord.sectorNumber?.error === 'MALFORMED_IDENTIFIER') {
            dataQualityWarnings.push('Malformed identifier rejected in field "sectorNumber"');
        }

        // Location classification warning from custom parse
        if (normalizedRecord._locationClassificationWarning) {
            dataQualityWarnings.push(normalizedRecord._locationClassificationWarning);
        }

        // Contradictory dates check
        const allotDate = normalizedRecord.allotmentDate?.date;
        const possDate = normalizedRecord.possessionDate?.date;
        if (allotDate instanceof Date && possDate instanceof Date && possDate < allotDate) {
            dataQualityWarnings.push('Contradictory dates: possessionDate occurs prior to allotmentDate');
        }

        // Categorical observations inspection
        const litStr = typeof normalizedRecord.litigationStatus === 'object' && normalizedRecord.litigationStatus !== null
            ? (normalizedRecord.litigationStatus.controlledString || normalizedRecord.litigationStatus.status || normalizedRecord.litigationStatus.raw)
            : (typeof normalizedRecord.litigationStatus === 'string' ? normalizedRecord.litigationStatus : null);

        if (litStr && !['NO_LITIGATION', 'LITIGATION_REPORTED'].includes(litStr) && !isSentinel(litStr)) {
            dataQualityWarnings.push(`Categorical litigation observation present: "${litStr}"`);
        }

        const mortStr = typeof normalizedRecord.mortgageStatus === 'object' && normalizedRecord.mortgageStatus !== null
            ? (normalizedRecord.mortgageStatus.controlledString || normalizedRecord.mortgageStatus.status || normalizedRecord.mortgageStatus.raw)
            : (typeof normalizedRecord.mortgageStatus === 'string' ? normalizedRecord.mortgageStatus : null);

        if (mortStr && !['NO_MORTGAGE', 'MORTGAGE_REPORTED'].includes(mortStr) && !isSentinel(mortStr)) {
            dataQualityWarnings.push(`Categorical mortgage observation present: "${mortStr}"`);
        }

        // Disputed dues check
        if (normalizedRecord.duesStatus === 'DISPUTED') {
            dataQualityWarnings.push('Outstanding dues status is DISPUTED');
        }

        // 3. Match Evidence against Inventory Context
        let confidence = 'NONE';
        const matchedFields = [];
        const conflictingFields = [];
        let matchDetails = 'No Inventory context provided for matching';

        if (inventoryContext && typeof inventoryContext === 'object') {
            const crmPropId = inventoryContext.propertyId || inventoryContext.unitNo || inventoryContext.unitNumber || null;
            const crmSector = inventoryContext.sectorNumber || inventoryContext.sector || null;

            const cleanPropId = propId ? String(propId).trim().toLowerCase() : null;
            const cleanCrmPropId = crmPropId ? String(crmPropId).trim().toLowerCase() : null;

            // Strip "sector" prefix for comparison so "Sector 14" matches "14"
            const cleanSector = sector ? String(sector).replace(/^sector\s*/i, '').trim().toLowerCase() : null;
            const cleanCrmSector = crmSector ? String(crmSector).replace(/^sector\s*/i, '').trim().toLowerCase() : null;

            const propMatch = cleanPropId && cleanCrmPropId && cleanPropId === cleanCrmPropId;
            const sectorMatch = cleanSector && cleanCrmSector && cleanSector === cleanCrmSector;

            if (propMatch && sectorMatch) {
                confidence = 'EXACT';
                matchedFields.push('propertyId', 'sectorNumber');
                matchDetails = 'Exact match on propertyId and sectorNumber';
            } else if (propMatch && !crmSector) {
                confidence = 'HIGH';
                matchedFields.push('propertyId');
                matchDetails = 'PropertyId matched; inventory has no sector specified';
            } else if (propMatch && !sectorMatch) {
                confidence = 'CONFLICT';
                matchedFields.push('propertyId');
                conflictingFields.push('sectorNumber');
                matchDetails = `PropertyId matches but sector coordinates conflict: "${sector}" vs CRM "${crmSector}"`;
            } else if (sectorMatch && !propMatch) {
                confidence = 'LOW';
                matchedFields.push('sectorNumber');
                matchDetails = 'Sector matched but propertyId is missing or distinct';
            } else {
                confidence = 'NONE';
                matchDetails = 'No matching property identifier or sector coordinate';
            }

            // Ambiguous key status
            if (normalizedRecord._compositeKey?.error === 'AMBIGUOUS' || normalizedRecord._compositeKey?.status === 'AMBIGUOUS') {
                confidence = 'AMBIGUOUS';
                matchDetails = `Identity key is ambiguous: ${normalizedRecord._compositeKey.note || 'Missing distinguishing jurisdictional component'}`;
            }

            // 4. Field-by-Field Proposed Changes
            for (const allowedField of ALLOWED_UPDATE_FIELDS) {
                // Strip 'authorityVerification.' prefix to inspect normalized field
                const fieldName = allowedField.replace(/^authorityVerification\./, '');
                let rawAuthVal = normalizedRecord[fieldName];
                if (fieldName === 'transferDate' && rawAuthVal === undefined) {
                    rawAuthVal = normalizedRecord['lastTransferDate'];
                } else if (fieldName === 'propertyAreaValue' && rawAuthVal === undefined) {
                    rawAuthVal = normalizedRecord.area?.value;
                } else if (fieldName === 'propertyAreaUnit' && rawAuthVal === undefined) {
                    rawAuthVal = normalizedRecord.area?.unit;
                }

                // Extract clean value prioritizing controlledString for litigation/mortgage
                let proposedVal = rawAuthVal;
                if (rawAuthVal && typeof rawAuthVal === 'object') {
                    if (rawAuthVal.controlledString !== undefined) proposedVal = rawAuthVal.controlledString;
                    else if (rawAuthVal.normalized !== undefined) proposedVal = rawAuthVal.normalized;
                    else if (rawAuthVal.value !== undefined) proposedVal = rawAuthVal.value;
                    else if (rawAuthVal.date !== undefined) proposedVal = rawAuthVal.date;
                }

                const currentCrmVal = inventoryContext.authorityVerification?.[fieldName] ?? null;

                // Action evaluation rules:
                if (BLOCKED_UPDATE_FIELDS.has(allowedField) || BLOCKED_UPDATE_FIELDS.has(fieldName)) {
                    proposedChanges.push({
                        field: allowedField,
                        currentCrmValue: currentCrmVal,
                        proposedAuthorityValue: proposedVal,
                        action: 'REJECT_BLOCKED',
                        rationale: 'Field is in strict BLOCKED_UPDATE_FIELDS list'
                    });
                } else if (isSentinel(proposedVal) || isSentinel(rawAuthVal) || rawAuthVal === undefined || rawAuthVal === null) {
                    proposedChanges.push({
                        field: allowedField,
                        currentCrmValue: currentCrmVal,
                        proposedAuthorityValue: '[SENTINEL]',
                        action: 'REJECT_SENTINEL',
                        rationale: 'Missing or unparseable authority facts MUST NEVER overwrite CRM inventory'
                    });
                } else if (proposedVal === currentCrmVal || (proposedVal === null && currentCrmVal === null)) {
                    proposedChanges.push({
                        field: allowedField,
                        currentCrmValue: currentCrmVal,
                        proposedAuthorityValue: proposedVal,
                        action: 'NOOP',
                        rationale: 'Authority value matches existing CRM record'
                    });
                } else {
                    proposedChanges.push({
                        field: allowedField,
                        currentCrmValue: currentCrmVal,
                        proposedAuthorityValue: proposedVal,
                        action: 'PROPOSED_UPDATE',
                        rationale: 'Valid authority observation differs from CRM record'
                    });
                }
            }
        }

        return {
            matchEvidence: {
                confidence,
                matchedFields,
                conflictingFields,
                details: matchDetails
            },
            dataQualityWarnings,
            unverifiedFields,
            proposedChanges
        };
    }

    /**
     * 5. BUILD VERIFICATION CANDIDATE
     * Assembles complete candidate package.
     * Enforces human-review requirement and zero automatic mutation.
     * 
     * @param {object} normalizedRecord
     * @param {object|null} [inventoryContext]
     * @returns {object} Verification candidate package
     */
    buildVerificationCandidate(normalizedRecord, inventoryContext = null) {
        const {
            matchEvidence,
            dataQualityWarnings,
            unverifiedFields,
            proposedChanges
        } = this.compareWithInventory(normalizedRecord, inventoryContext);

        const compKey = normalizedRecord._compositeKey;
        const keyStatus = compKey?.error ? compKey.error : (compKey?.key ? 'COMPLETE' : 'INCOMPLETE');

        // Determine candidate status
        let status = 'READY_FOR_REVIEW';
        if (matchEvidence.confidence === 'CONFLICT' || matchEvidence.confidence === 'AMBIGUOUS' || compKey?.error === 'AMBIGUOUS' || compKey?.status === 'AMBIGUOUS') {
            status = 'FLAGGED_AMBIGUOUS';
        } else if (dataQualityWarnings.some(w => w.includes('Missing or rejected property identifier') || w.includes('Missing property identifier') || w.includes('Contradictory dates') || w.includes('Malformed identifier rejected'))) {
            status = 'REJECTED_QUALITY';
        }

        return Object.freeze({
            candidateId: `cand_${this.authorityCode.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            authorityCode: this.authorityCode,
            authorityName: this.authorityName,
            compositeKey: compKey?.key || null,
            keyStatus,
            contentHash: normalizedRecord._contentHash || null,
            normalizedFacts: normalizedRecord,
            matchEvidence,
            dataQualityWarnings,
            unverifiedFields,
            proposedChanges,
            status,
            requiresHumanReview: true, // STRICT: Always requires explicit human review
            isApplied: false,          // STRICT: Adapters NEVER automatically apply changes
            auditMeta: Object.freeze({
                isFixtureExecution: true,
                syntheticEvidenceOnly: true,
                sourceEvidenceStatus: SOURCE_EVIDENCE_STATUS.UNVERIFIED,
                authorizationStatus: 'NOT_OBTAINED',
                generatedAt: new Date().toISOString()
            })
        });
    }

    /**
     * PROHIBITED LIVE NETWORK METHOD
     * Throws an explicit fatal error if called.
     */
    async fetchLive() {
        const err = new Error(`NETWORK_PROHIBITED: Outbound network calls are strictly prohibited (${this.authorityCode}). Fixture execution only.`);
        err.code = 'ERR_SOURCE_DISABLED';
        throw err;
    }

    /**
     * PROHIBITED SCRAPER METHOD
     * Throws an explicit fatal error if called.
     */
    async scrapePortal() {
        const err = new Error(`SCRAPER_PROHIBITED: Web scraping and headless browsing are strictly prohibited (${this.authorityCode}).`);
        err.code = 'ERR_SOURCE_DISABLED';
        throw err;
    }
}
