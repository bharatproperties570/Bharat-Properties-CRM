/**
 * Canonical-field allow-list for authority portal results.
 * Unknown fields, personal information, nested objects and control characters
 * are never persisted by this integration boundary.
 */

import { createHash } from 'node:crypto';

export const FORBIDDEN_AUTHORITY_PERSONAL_FIELD = /(?:owner|allottee|applicant|father|husband|aadhaar|\bpan\b|pan_?no|pan_?card|phone|mobile|email|postal.?address|correspondence.?address|contact|date.?of.?birth)/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
const MAX_FIELD_TEXT_LENGTH = 1000;

function stableValue(value) {
    if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function normalizeScalar(value, fieldName) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean' || typeof value === 'number') {
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new Error(`PORTAL_FIELD_INVALID_NUMBER: ${fieldName}`);
        }
        return value;
    }
    if (typeof value !== 'string') {
        throw new Error(`PORTAL_FIELD_NON_SCALAR_REJECTED: ${fieldName}`);
    }
    const normalized = value.normalize('NFKC').trim();
    if (normalized.length > MAX_FIELD_TEXT_LENGTH || CONTROL_CHARACTER_PATTERN.test(normalized)) {
        throw new Error(`PORTAL_FIELD_UNSAFE_TEXT_REJECTED: ${fieldName}`);
    }
    return normalized || null;
}

/**
 * Keep only source-approved canonical fields and reject unsafe value shapes.
 * This does not silently map source labels; that belongs in a verified parser.
 */
export function sanitizeAuthorityPortalRecord(record, permittedFields = []) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('PORTAL_RECORD_INVALID: Parsed portal record must be an object.');
    }
    if (!Array.isArray(permittedFields) || permittedFields.length === 0) {
        throw new Error('PORTAL_FIELD_SCOPE_MISSING: No authority-approved canonical fields were supplied.');
    }

    const allowed = new Set(permittedFields.map((field) => String(field).trim()).filter(Boolean));
    for (const field of allowed) {
        if (FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(field)) {
            throw new Error(`PORTAL_PERSONAL_FIELD_BLOCKED: ${field}`);
        }
    }

    const sanitized = {};
    for (const [field, value] of Object.entries(record)) {
        if (!allowed.has(field)) continue;
        if (FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(field)) continue;
        if (Array.isArray(value)) {
            if (value.length > 50) throw new Error(`PORTAL_FIELD_ARRAY_TOO_LARGE: ${field}`);
            sanitized[field] = value.map((item) => normalizeScalar(item, field)).filter((item) => item !== null);
        } else {
            const normalized = normalizeScalar(value, field);
            if (normalized !== null) sanitized[field] = normalized;
        }
    }

    return Object.freeze(sanitized);
}

export function createAuthorityPortalContentHash(value) {
    return createHash('sha256').update(stableValue(value)).digest('hex');
}

export function createAuthorityPortalSearchKey({ authorityCode, criteria } = {}) {
    const normalizedCode = String(authorityCode || '').trim().toUpperCase();
    if (!normalizedCode || !criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
        throw new Error('PORTAL_SEARCH_KEY_INPUT_INVALID');
    }
    return createHash('sha256')
        .update(`${normalizedCode}:${stableValue(criteria)}`)
        .digest('hex');
}
