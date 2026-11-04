/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — AUTHORITY ADAPTER REGISTRY
 *  Phase 3A: Centralized Registry & Fail-Closed Execution Gate
 * ============================================================================
 * 
 *  1. FAIL-CLOSED: Unknown authority codes trigger explicit errors.
 *  2. DISABLED-BY-DEFAULT: All sources have authorizationStatus: NOT_OBTAINED.
 *  3. EXPLICIT FIXTURE PATH: Live requests are blocked at runtime.
 * 
 *  @module adapterRegistry
 *  @version 3.0.0-phase3a
 */

import HsvpFixtureAdapter from './HsvpFixtureAdapter.js';
import ChandigarhFixtureAdapter from './ChandigarhFixtureAdapter.js';
import GmadaFixtureAdapter from './GmadaFixtureAdapter.js';

// Pre-instantiated adapter singletons
const ADAPTERS = Object.freeze({
    HSVP: new HsvpFixtureAdapter(),
    CHD: new ChandigarhFixtureAdapter(),
    GMADA: new GmadaFixtureAdapter()
});

/**
 * Retrieve an adapter instance by authority code.
 * Throws an explicit error for unknown authority codes (fail-closed).
 * 
 * @param {string} authorityCode - 'HSVP' | 'CHD' | 'GMADA'
 * @returns {import('./BaseFixtureAdapter.js').default}
 */
export function getAdapter(authorityCode) {
    if (!authorityCode || typeof authorityCode !== 'string') {
        throw new Error('UNKNOWN_AUTHORITY: Authority code must be a non-empty string. Fail closed.');
    }

    const upperCode = authorityCode.toUpperCase().trim();
    const adapter = ADAPTERS[upperCode];

    if (!adapter) {
        throw new Error(`UNKNOWN_AUTHORITY: Authority code "${authorityCode}" is not recognized. Permitted codes: HSVP, CHD, GMADA. Fail closed.`);
    }

    return adapter;
}

/**
 * Retrieve all registered authority adapters.
 * @returns {Array<import('./BaseFixtureAdapter.js').default>}
 */
export function getAllAdapters() {
    return Object.values(ADAPTERS);
}

/**
 * Check if an authority source is registered.
 * @param {string} authorityCode
 * @returns {boolean}
 */
export function isKnownAuthority(authorityCode) {
    if (!authorityCode || typeof authorityCode !== 'string') return false;
    return Boolean(ADAPTERS[authorityCode.toUpperCase().trim()]);
}

/**
 * Execute the complete fixture verification pipeline for a given authority and input.
 * Explicit test-only / offline execution path.
 * 
 * @param {string} authorityCode
 * @param {object} rawFixtureInput
 * @param {object|null} [inventoryContext]
 * @returns {object} Verification candidate package
 */
export function executeFixturePipeline(authorityCode, rawFixtureInput, inventoryContext = null) {
    const adapter = getAdapter(authorityCode);

    // 1. Validate & Sanitize
    const valResult = adapter.validateFixture(rawFixtureInput);
    if (!valResult.isValid) {
        return Object.freeze({
            candidateId: `cand_${authorityCode.toLowerCase()}_rejected_${Date.now()}`,
            authorityCode,
            status: 'REJECTED_QUALITY',
            errors: valResult.errors,
            warnings: valResult.warnings,
            requiresHumanReview: true,
            isApplied: false,
            auditMeta: {
                isFixtureExecution: true,
                validationFailed: true
            }
        });
    }

    // 2. Parse Fixture
    const parsed = adapter.parseFixture(valResult.sanitizedData);

    // 3. Normalize Record
    const normalized = adapter.normalizeRecord(parsed);

    // 4. Build Candidate
    const candidate = adapter.buildVerificationCandidate(normalized, inventoryContext);

    // If validation had warnings, attach them
    if (valResult.warnings.length > 0) {
        candidate.dataQualityWarnings.push(...valResult.warnings);
    }

    return candidate;
}

/**
 * Live authority verification entry point.
 * In Phase 3A, this method is strictly blocked.
 * 
 * @throws {Error} Always throws SOURCE_DISABLED error
 */
export function executeLiveVerification() {
    throw new Error('SOURCE_DISABLED: Live authority fetching is prohibited in Phase 3A. Authorization status: NOT_OBTAINED.');
}

export const hasAdapter = isKnownAuthority;
export const listAdapters = getAllAdapters;

export default {
    getAdapter,
    getAllAdapters,
    listAdapters,
    isKnownAuthority,
    hasAdapter,
    executeFixturePipeline,
    executeLiveVerification
};
