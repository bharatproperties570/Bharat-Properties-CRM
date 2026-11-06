/**
 * GMADA (Greater Mohali Area Development Authority) Portal Parser
 * Version: gmada-portal-v1
 *
 * Extracts property verification data from GMADA Property Ledger Report HTML.
 * Strictly excludes all PII (owner/allottee name, mobile, address).
 * Detects challenge/login, ASP.NET server errors, 502 gateway errors, no-record states, and markup drift.
 */

import * as cheerio from 'cheerio';
import { FORBIDDEN_AUTHORITY_PERSONAL_FIELD } from '../authorityPortalResultSanitizer.js';

export const GMADA_PARSER_VERSION = 'gmada-portal-v1';

const CHALLENGE_PATTERNS = [
    /captcha/i,
    /hfCaptcha/i,
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
    /server\s+error\s+in\s+'\/'\s+application/i,
    /502\s+bad\s+gateway/i,
    /bad\s+gateway/i,
    /runtime\s+error/i,
    /an\s+unhandled\s+exception\s+was\s+generated/i
];

const NO_RECORD_PATTERNS = [
    /no\s+record(?:s)?\s+found/i,
    /no\s+data\s+found/i,
    /record\s+not\s+found/i,
    /no\s+property\s+found/i,
    /no\s+matching\s+record/i,
    /no\s+match\s+found/i,
    /please\s+enter\s+valid\s+details\s+to\s+open\s+property\s+ledger/i
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
    'location': 'urbanEstate',
    'location name': 'urbanEstate',
    'scheme': 'schemeName',
    'scheme name': 'schemeName',
    'sector': 'sectorNumber',
    'sectors': 'sectorNumber',
    'sector name': 'sectorNumber',
    'sector/scheme': 'sectorNumber',
    'sector / scheme': 'sectorNumber',
    'property no': 'propertyId',
    'property number': 'propertyId',
    'plot no': 'propertyId',
    'form no': 'formNumber',
    'form number': 'formNumber',
    'application no': 'formNumber',
    'usage type': 'propertyCategory',
    'usage': 'propertyCategory',
    'category': 'propertyCategory',
    'property type': 'propertyType',
    'type': 'propertyType',
    'area': 'area',
    'size': 'area',
    'plot size': 'area',
    'status': 'authorityStatus',
    'property status': 'authorityStatus',
    'allotment price': 'allotmentPrice',
    'total amount paid': 'totalPaid',
    'amount paid': 'totalPaid',
    'total paid': 'totalPaid',
    'current dues': 'currentDues',
    'balance due': 'currentDues',
    'outstanding balance': 'currentDues',
    'possession status': 'possessionStatus',
    'possession date': 'possessionDate',
    'litigation status': 'litigationStatus',
    'court case': 'litigationStatus',
    'building plan approved': 'buildingPlanApproved',
    'occupancy certificate': 'occupancyCertificate',
    'oc status': 'occupancyCertificate'
});

export const gmadaPortalParser = Object.freeze({
    authorityCode: 'GMADA',
    version: GMADA_PARSER_VERSION,

    /**
     * Parses GMADA response HTML.
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
            // Note: Don't trip on harmless hidden input name unless it contains an active challenge prompt
            if (pattern.test(text) && !text.includes('id="ctl00_Column1_ContentPlaceHolder_hfCaptcha" value=""')) {
                // Check if it's an actual active captcha challenge
                if (/enter\s+(?:the\s+)?captcha/i.test(text) || /captcha\.ashx/i.test(text)) {
                    const err = new Error('PORTAL_CHALLENGE_DETECTED: Captcha challenge found in GMADA response.');
                    err.code = 'PORTAL_CHALLENGE_DETECTED';
                    throw err;
                }
            }
        }
        for (const pattern of LOGIN_PATTERNS) {
            if (pattern.test(text)) {
                const err = new Error('PORTAL_LOGIN_DETECTED: Login wall or session expiration found in GMADA response.');
                err.code = 'PORTAL_LOGIN_DETECTED';
                throw err;
            }
        }

        // 2. Guard against server errors
        for (const pattern of SERVER_ERROR_PATTERNS) {
            if (pattern.test(text)) {
                const err = new Error('PORTAL_SERVER_ERROR: Server error encountered in GMADA response.');
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

        // 4. Check for known structures (aspnetForm, GridView, or report table)
        const hasForm = $('#aspnetForm').length > 0 || $('form[name="aspnetForm"]').length > 0;
        const hasGrid = $('table[id*="gvProperty"], table[id*="grd"], table[id*="Report"], .report-table').length > 0;
        const hasAnyTable = $('table').length > 0;

        if (!hasForm && !hasGrid && !hasAnyTable) {
            const err = new Error('PARSER_DRIFT: Unrecognized GMADA HTML structure. Expected aspnetForm or report GridView.');
            err.code = 'PARSER_DRIFT';
            throw err;
        }

        const records = [];

        // 5. Extract from GridView / Report tables
        const targetTables = hasGrid
            ? $('table[id*="gvProperty"], table[id*="grd"], table[id*="Report"], .report-table')
            : $('table');

        targetTables.each((_, tbl) => {
            const table = $(tbl);
            const headers = [];
            table.find('tr:first-child th, tr:first-child td').each((_, h) => {
                headers.push(normalizeKey($(h).text()));
            });

            if (headers.some(h => h.includes('location') || h.includes('sector') || h.includes('property') || h.includes('plot'))) {
                table.find('tr:not(:first-child)').each((_, row) => {
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

        // 6. If details panel or key-value list exists
        if (records.length === 0) {
            const detailRecord = {};
            $('tr').each((_, r) => {
                const tr = $(r);
                const th = tr.find('th, td:first-child').text().trim();
                const td = tr.find('td:last-child').text().trim();
                if (th && td && th !== td) {
                    const canonical = FIELD_MAPPINGS[normalizeKey(th)];
                    if (canonical && !FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(canonical)) {
                        detailRecord[canonical] = td;
                    }
                }
            });
            if (Object.keys(detailRecord).length > 0 && (detailRecord.propertyId || detailRecord.formNumber)) {
                records.push(detailRecord);
            }
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

export default gmadaPortalParser;
