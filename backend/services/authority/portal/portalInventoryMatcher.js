/**
 * Portal Inventory Matcher & Candidate Builder
 *
 * Enforces exact identity matching between CRM Inventory records
 * and parsed authority portal records:
 *   - HSVP: Urban Estate + Sector + Plot Number
 *   - GMADA: Location + Sector + Property Number (or Form Number)
 *   - CHD: Plot Number + Sector (or File Type + File Number)
 *
 * Produces immutable verification candidates with:
 *   provenance = 'LIVE'
 *   isSynthetic = false
 *   requiresHumanReview = true
 *   isApplied = false
 *
 * Never mutates Inventory or Contact automatically.
 */

import { resolveHsvpUrbanEstateCode } from './adapters/hsvpPortalAdapter.js';
import { resolveGmadaLocation } from './adapters/gmadaPortalAdapter.js';
import { createAuthorityPortalContentHash } from './authorityPortalResultSanitizer.js';

function normalizeText(val) {
    if (val === null || val === undefined) return '';
    return String(val)
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeSector(val) {
    return normalizeText(val)
        .replace(/^(?:sector|sec)[\s.-]*/i, '')
        .trim();
}

export function matchHsvpRecord(inventory = {}, link = {}, record = {}) {
    const invUe = resolveHsvpUrbanEstateCode(link.urbanEstate || inventory.urbanEstate || inventory.city || inventory.address?.city);
    const recUe = resolveHsvpUrbanEstateCode(record.urbanEstate);

    const invSector = normalizeSector(link.sectorNumber || inventory.sector);
    const recSector = normalizeSector(record.sectorNumber);

    const invPlot = normalizeText(link.propertyId || inventory.propertyId || inventory.unitNo || inventory.unitNumber);
    const recPlot = normalizeText(record.propertyId);

    const mismatches = [];
    if (!invUe || !recUe || invUe !== recUe) {
        mismatches.push(`Urban Estate mismatch: expected "${invUe || '(empty)'}", got "${recUe || '(empty)'}"`);
    }
    if (!invSector || !recSector || invSector !== recSector) {
        mismatches.push(`Sector mismatch: expected "${invSector || '(empty)'}", got "${recSector || '(empty)'}"`);
    }
    if (!invPlot || !recPlot || invPlot !== recPlot) {
        mismatches.push(`Plot Number mismatch: expected "${invPlot || '(empty)'}", got "${recPlot || '(empty)'}"`);
    }

    return Object.freeze({
        matches: mismatches.length === 0,
        mismatches: Object.freeze(mismatches),
        authorityCode: 'HSVP'
    });
}

export function matchGmadaRecord(inventory = {}, link = {}, record = {}) {
    const invLocation = resolveGmadaLocation(link.urbanEstate || inventory.urbanEstate || inventory.city || inventory.address?.city);
    const recLocation = resolveGmadaLocation(record.urbanEstate);

    const invSector = normalizeSector(link.sectorNumber || inventory.sector);
    // P1.7: Strictly use sectorNumber; do NOT fall back to schemeName as sector
    const recSector = normalizeSector(record.sectorNumber);

    const invPropertyNo = normalizeText(link.propertyId || inventory.unitNo || inventory.unitNumber);
    const recPropertyNo = normalizeText(record.propertyId);

    const invFormNo = normalizeText(link.formNumber || inventory.formNumber);
    const recFormNo = normalizeText(record.formNumber);

    const mismatches = [];
    if (!invLocation || !recLocation || invLocation !== recLocation) {
        mismatches.push(`Location mismatch: expected "${invLocation || '(empty)'}", got "${recLocation || '(empty)'}"`);
    }
    if (!invSector || !recSector || invSector !== recSector) {
        mismatches.push(`Sector mismatch: expected "${invSector || '(empty)'}", got "${recSector || '(empty)'}"`);
    }

    const propertyMatched = Boolean(invPropertyNo && recPropertyNo && invPropertyNo === recPropertyNo);
    const formMatched = Boolean(invFormNo && recFormNo && invFormNo === recFormNo);

    if (!propertyMatched && !formMatched) {
        mismatches.push(`Identifier mismatch: neither Property No nor Form No matched (expected plot="${invPropertyNo}", form="${invFormNo}")`);
    }

    return Object.freeze({
        matches: mismatches.length === 0,
        mismatches: Object.freeze(mismatches),
        authorityCode: 'GMADA'
    });
}

export function matchChdRecord(inventory = {}, link = {}, record = {}) {
    const invPlot = normalizeText(link.propertyId || inventory.propertyId || inventory.unitNo || inventory.unitNumber);
    const recPlot = normalizeText(record.propertyId);

    const invSector = normalizeSector(link.sectorNumber || inventory.sector);
    const recSector = normalizeSector(record.sectorNumber);

    const invFile = normalizeText(link.fileNumber || inventory.fileNumber);
    const recFile = normalizeText(record.fileNumber);

    const invFileType = normalizeText(link.fileType || inventory.fileType);
    const recFileType = normalizeText(record.fileType);

    const plotSectorMatched = Boolean(invPlot && recPlot && invPlot === recPlot && invSector && recSector && invSector === recSector);
    // P1.6: File mode requires exact match on BOTH File Type AND File Number
    const fileMatched = Boolean(invFile && recFile && invFile === recFile && invFileType && recFileType && invFileType === recFileType);

    const mismatches = [];
    if (!plotSectorMatched && !fileMatched) {
        mismatches.push(`Chandigarh match failed: neither (Plot+Sector) nor exact (File Type + File Number) matched.`);
    }

    return Object.freeze({
        matches: mismatches.length === 0,
        mismatches: Object.freeze(mismatches),
        authorityCode: 'CHD'
    });
}

/**
 * Validates exact inventory matching across any authority source.
 * @param {string} authorityCode
 * @param {object} inventory
 * @param {object} link
 * @param {object} record
 * @returns {object} { matches: boolean, mismatches: string[], authorityCode: string }
 */
export function matchAuthorityInventory(authorityCode, inventory = {}, link = {}, record = {}) {
    const code = String(authorityCode || '').trim().toUpperCase();
    if (!record || typeof record !== 'object') {
        return Object.freeze({
            matches: false,
            mismatches: Object.freeze(['No authority record returned from portal']),
            authorityCode: code
        });
    }
    if (code === 'HSVP') {
        return matchHsvpRecord(inventory, link, record);
    }
    if (code === 'GMADA') {
        return matchGmadaRecord(inventory, link, record);
    }
    if (code === 'CHD') {
        return matchChdRecord(inventory, link, record);
    }
    throw new Error(`UNKNOWN_AUTHORITY: Cannot match unknown authority "${authorityCode}".`);
}

/**
 * Builds a verified live verification candidate package.
 * Enforces maker-checker requirements and prevents automated CRM mutations.
 * @param {object} args
 * @param {string} args.authorityCode
 * @param {object} args.record Sanitized authority record
 * @param {object} args.inventory CRM inventory document
 * @param {object} args.link CRM authority link document
 * @param {string} args.parserVersion
 * @returns {object}
 */
export function buildLiveVerificationCandidate({ authorityCode, record = {}, inventory = {}, link = {}, parserVersion = '' } = {}) {
    const matchResult = matchAuthorityInventory(authorityCode, inventory, link, record);

    if (!matchResult.matches) {
        return Object.freeze({
            status: 'REJECTED_IDENTITY_MISMATCH',
            authorityCode,
            matches: false,
            mismatches: matchResult.mismatches,
            requiresHumanReview: true,
            isApplied: false,
            provenance: 'LIVE',
            isSynthetic: false
        });
    }

    const contentHash = createAuthorityPortalContentHash(record);

    return Object.freeze({
        candidateId: `cand_live_${authorityCode.toLowerCase()}_${Date.now()}`,
        status: 'PENDING_REVIEW',
        authorityCode,
        matches: true,
        record: Object.freeze({ ...record }),
        contentHash,
        provenance: 'LIVE',
        isSynthetic: false,
        requiresHumanReview: true,
        isApplied: false,
        parserVersion,
        observedAt: new Date()
    });
}

export default {
    matchAuthorityInventory,
    matchHsvpRecord,
    matchGmadaRecord,
    matchChdRecord,
    buildLiveVerificationCandidate
};
