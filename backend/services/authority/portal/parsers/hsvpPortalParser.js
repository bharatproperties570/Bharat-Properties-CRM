/**
 * HSVP (Haryana Shehri Vikas Pradhikaran) Portal Parser
 * Version: hsvp-portal-v1
 *
 * Extracts property verification data from HSVP Plot Status Enquiry HTML.
 * Strictly excludes all PII (owner/allottee name, mobile, address).
 * Detects challenge/login, server errors, no-record states, and markup drift.
 */

import * as cheerio from 'cheerio';
import { FORBIDDEN_AUTHORITY_PERSONAL_FIELD } from '../authorityPortalResultSanitizer.js';

export const HSVP_PARSER_VERSION = 'hsvp-portal-v1';

const CHALLENGE_PATTERNS = [
    /captcha/i,
    /verify\s+you\s+are\s+human/i,
    /security\s+check/i,
    /automated\s+traffic/i,
    /bot\s+detection/i
];

const LOGIN_PATTERNS = [
    /sign\s*in\s+to\s+continue/i,
    /login\s+required/i,
    /session\s+expired/i
];

const SERVER_ERROR_PATTERNS = [
    /an\s+error\s+occurred\s+while\s+processing\s+your\s+request/i,
    /internal\s+server\s+error/i,
    /runtime\s+error/i,
    /server\s+error\s+in\s+'\/'\s+application/i
];

const NO_RECORD_PATTERNS = [
    /no\s+record(?:s)?\s+found/i,
    /no\s+plot(?:s)?\s+found/i,
    /record\s+not\s+found/i,
    /no\s+matching\s+record/i,
    /no\s+data\s+available/i
];

function normalizeKey(label) {
    return String(label || '')
        .normalize('NFKC')
        .replace(/[:.]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

const FIELD_MAPPINGS = Object.freeze({
    'plot no': 'propertyId',
    'plot number': 'propertyId',
    'plot id': 'propertyId',
    'property no': 'propertyId',
    'property number': 'propertyId',
    'urban estate': 'urbanEstate',
    'urban estate name': 'urbanEstate',
    'sector': 'sectorNumber',
    'sector no': 'sectorNumber',
    'sector number': 'sectorNumber',
    'category': 'propertyCategory',
    'property category': 'propertyCategory',
    'property sub category': 'propertyType',
    'sub category': 'propertyType',
    'sub-category': 'propertyType',
    'size': 'area',
    'plot size': 'area',
    'area': 'area',
    'dimension': 'area',
    'status': 'authorityStatus',
    'plot status': 'authorityStatus',
    'allotment date': 'allotmentDate',
    'allotment price': 'allotmentPrice',
    'allotment amount': 'allotmentPrice',
    'total amount paid': 'totalPaid',
    'total paid': 'totalPaid',
    'current dues': 'currentDues',
    'balance dues': 'currentDues',
    'balance due': 'currentDues',
    'possession date': 'possessionDate',
    'possession status': 'possessionStatus',
    'physical possession date': 'possessionDate',
    'last transfer date': 'lastTransferDate',
    'litigation status': 'litigationStatus',
    'court case': 'litigationStatus',
    'mortgage status': 'mortgageStatus',
    'building plan approval': 'buildingPlanApproved',
    'building plan approved': 'buildingPlanApproved',
    'occupancy certificate': 'occupancyCertificate',
    'oc status': 'occupancyCertificate'
});

export const hsvpPortalParser = Object.freeze({
    authorityCode: 'HSVP',
    version: HSVP_PARSER_VERSION,

    /**
     * Parses HSVP response HTML.
     * @param {string} html
     * @param {object} [context]
     * @returns {Promise<Array<object>>}
     */
    async parse(html, context = {}) {
        if (!html || typeof html !== 'string') {
            throw new Error('PORTAL_PARSER_EMPTY_INPUT: Input HTML must be a non-empty string.');
        }

        const text = html.trim();

        // 1. Guard against challenges & login walls
        for (const pattern of CHALLENGE_PATTERNS) {
            if (pattern.test(text)) {
                const err = new Error('PORTAL_CHALLENGE_DETECTED: Captcha or bot challenge found in HSVP response.');
                err.code = 'PORTAL_CHALLENGE_DETECTED';
                throw err;
            }
        }
        for (const pattern of LOGIN_PATTERNS) {
            if (pattern.test(text)) {
                const err = new Error('PORTAL_LOGIN_DETECTED: Login wall or session expiration found in HSVP response.');
                err.code = 'PORTAL_LOGIN_DETECTED';
                throw err;
            }
        }

        // 2. Guard against server errors
        for (const pattern of SERVER_ERROR_PATTERNS) {
            if (pattern.test(text)) {
                const err = new Error('PORTAL_SERVER_ERROR: Server error encountered in HSVP response.');
                err.code = 'PORTAL_SERVER_ERROR';
                throw err;
            }
        }

        // 3. Check for confirmed "No Records Found"
        for (const pattern of NO_RECORD_PATTERNS) {
            if (pattern.test(text)) {
                return [];
            }
        }

        const $ = cheerio.load(text);

        // 4. Check for known structures (#detailsPanel, table, or #enquiryForm)
        const hasDetailsPanel = $('#detailsPanel').length > 0 || $('.plot-status-details').length > 0;
        const hasResultTable = $('table').length > 0;
        const hasForm = $('#enquiryForm').length > 0 || $('form[action*="PlotStatusEnquiry"]').length > 0;

        if (!hasDetailsPanel && !hasResultTable && !hasForm) {
            const err = new Error('PARSER_DRIFT: Unrecognized HSVP HTML structure. Expected #detailsPanel, results table, or #enquiryForm.');
            err.code = 'PARSER_DRIFT';
            throw err;
        }

        const records = [];

        // 5. Extract from #detailsPanel (detail view)
        if (hasDetailsPanel) {
            const panel = $('#detailsPanel').length > 0 ? $('#detailsPanel') : $('.plot-status-details');
            const record = {};

            panel.find('tr, .row, dl').each((_, elem) => {
                const tr = $(elem);
                if (tr.is('tr')) {
                    const th = tr.find('th, td:first-child').text().trim();
                    const td = tr.find('td:last-child').text().trim();
                    if (th && td && th !== td) {
                        const canonical = FIELD_MAPPINGS[normalizeKey(th)];
                        if (canonical && !FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(canonical)) {
                            record[canonical] = td;
                        }
                    }
                } else if (tr.hasClass('row')) {
                    const label = tr.find('.col-form-label, label, strong').text().trim();
                    const val = tr.find('.form-control-plaintext, span, div:last-child').text().trim();
                    if (label && val) {
                        const canonical = FIELD_MAPPINGS[normalizeKey(label)];
                        if (canonical && !FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(canonical)) {
                            record[canonical] = val;
                        }
                    }
                }
            });

            if (Object.keys(record).length > 0) {
                // If context provided criteria, backfill missing identity fields if confirmed
                if (context.criteria?.urbanEstate && !record.urbanEstate) {
                    record.urbanEstate = context.criteria.urbanEstate;
                }
                if (context.criteria?.sector && !record.sectorNumber) {
                    record.sectorNumber = context.criteria.sector;
                }
                if (context.criteria?.plotNumber && !record.propertyId) {
                    record.propertyId = context.criteria.plotNumber;
                }
                records.push(record);
            }
        }

        // 6. Extract from search result table if details panel wasn't populated
        if (records.length === 0 && hasResultTable) {
            $('table').each((_, tbl) => {
                const table = $(tbl);
                const headers = [];
                table.find('thead th, tr:first-child th').each((_, th) => {
                    headers.push(normalizeKey($(th).text()));
                });

                if (headers.some(h => h.includes('plot') || h.includes('sector') || h.includes('estate'))) {
                    table.find('tbody tr, tr:not(:first-child)').each((_, row) => {
                        const cells = $(row).find('td');
                        if (cells.length >= 2) {
                            const rowRecord = {};
                            cells.each((colIdx, cell) => {
                                const h = headers[colIdx];
                                const val = $(cell).text().trim();
                                if (h && val) {
                                    const canonical = FIELD_MAPPINGS[h];
                                    if (canonical && !FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(canonical)) {
                                        rowRecord[canonical] = val;
                                    }
                                }
                            });
                            if (Object.keys(rowRecord).length > 0) {
                                records.push(rowRecord);
                            }
                        }
                    });
                }
            });
        }

        // 7. If initial form is shown with no results rendered and no error, return empty array
        if (records.length === 0 && hasForm) {
            return [];
        }

        // 8. Sanitize away any accidental personal fields
        const sanitizedRecords = records.map(rec => {
            const clean = {};
            for (const [k, v] of Object.entries(rec)) {
                if (!FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(k)) {
                    clean[k] = v;
                }
            }
            return clean;
        });

        return sanitizedRecords;
    }
});

export default hsvpPortalParser;
