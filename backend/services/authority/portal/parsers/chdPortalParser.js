/**
 * Chandigarh Estate Office Portal Parser
 * Version: chd-portal-v1
 *
 * Extracts property verification data from Chandigarh Administration Know Your Property Search HTML.
 * Strictly excludes all PII (owner/allottee name, mobile, address).
 * Detects challenge/login, server errors, no-record states, and markup drift.
 */

import * as cheerio from 'cheerio';
import { FORBIDDEN_AUTHORITY_PERSONAL_FIELD } from '../authorityPortalResultSanitizer.js';

export const CHD_PARSER_VERSION = 'chd-portal-v1';

const CHALLENGE_PATTERNS = [
    /captcha/i,
    /verify\s+you\s+are\s+human/i,
    /security\s+check/i,
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
    /server\s+error\s+in\s+'\/'\s+application/i,
    /runtime\s+error/i
];

const NO_RECORD_PATTERNS = [
    /no\s+record(?:s)?\s+found/i,
    /record\s+not\s+found/i,
    /no\s+matching\s+record/i,
    /no\s+property\s+found/i,
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
    'property no': 'propertyId',
    'property number': 'propertyId',
    'sector': 'sectorNumber',
    'sector no': 'sectorNumber',
    'sector number': 'sectorNumber',
    'file number': 'fileNumber',
    'file no': 'fileNumber',
    'file type': 'fileType',
    'category': 'propertyCategory',
    'property category': 'propertyCategory',
    'property type': 'propertyType',
    'type': 'propertyType',
    'site area': 'area',
    'area': 'area',
    'plot size': 'area',
    'status': 'authorityStatus',
    'ownership status': 'authorityStatus',
    'property status': 'authorityStatus',
    'allotment date': 'allotmentDate',
    'building plan approval': 'buildingPlanApproved',
    'building plan approved': 'buildingPlanApproved',
    'completion certificate': 'occupancyCertificate',
    'occupancy certificate': 'occupancyCertificate',
    'oc status': 'occupancyCertificate',
    'litigation': 'litigationStatus',
    'litigation status': 'litigationStatus',
    'court case': 'litigationStatus',
    'mortgage status': 'mortgageStatus',
    'mortgage': 'mortgageStatus'
});

export const chdPortalParser = Object.freeze({
    authorityCode: 'CHD',
    version: CHD_PARSER_VERSION,

    /**
     * Parses Chandigarh Estate Office response HTML.
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
                const err = new Error('PORTAL_CHALLENGE_DETECTED: Captcha challenge found in Chandigarh response.');
                err.code = 'PORTAL_CHALLENGE_DETECTED';
                throw err;
            }
        }
        for (const pattern of LOGIN_PATTERNS) {
            if (pattern.test(text)) {
                const err = new Error('PORTAL_LOGIN_DETECTED: Login wall or session expiration found in Chandigarh response.');
                err.code = 'PORTAL_LOGIN_DETECTED';
                throw err;
            }
        }

        // 2. Guard against server errors
        for (const pattern of SERVER_ERROR_PATTERNS) {
            if (pattern.test(text)) {
                const err = new Error('PORTAL_SERVER_ERROR: Server error encountered in Chandigarh response.');
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

        // 4. Check for known structures (#frmSearchProperty, results table, or result div)
        const hasForm = $('#frmSearchProperty').length > 0 || $('form[action*="Search"]').length > 0;
        const hasResultDiv = $('#dvResult, #dvPropertyDetails, .search-result-table').length > 0;
        const hasAnyTable = $('table').length > 0;

        if (!hasForm && !hasResultDiv && !hasAnyTable) {
            const err = new Error('PARSER_DRIFT: Unrecognized Chandigarh HTML structure. Expected frmSearchProperty or results container.');
            err.code = 'PARSER_DRIFT';
            throw err;
        }

        const records = [];

        // 5. Extract from results container or tables
        const resultContainers = hasResultDiv
            ? $('#dvResult, #dvPropertyDetails, .search-result-table')
            : $('table');

        resultContainers.each((_, elem) => {
            const container = $(elem);
            const record = {};

            container.find('tr').each((_, r) => {
                const tr = $(r);
                const th = tr.find('th, td:first-child').text().trim();
                const td = tr.find('td:last-child').text().trim();
                if (th && td && th !== td) {
                    const canonical = FIELD_MAPPINGS[normalizeKey(th)];
                    if (canonical && !FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(canonical)) {
                        record[canonical] = td;
                    }
                }
            });

            if (Object.keys(record).length > 0 && (record.propertyId || record.fileNumber)) {
                records.push(record);
            }
        });

        // 6. If table has standard row headers
        if (records.length === 0 && hasAnyTable) {
            $('table').each((_, tbl) => {
                const table = $(tbl);
                const headers = [];
                table.find('thead th, tr:first-child th').each((_, h) => {
                    headers.push(normalizeKey($(h).text()));
                });

                if (headers.some(h => h.includes('property') || h.includes('plot') || h.includes('sector') || h.includes('file'))) {
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

export default chdPortalParser;
