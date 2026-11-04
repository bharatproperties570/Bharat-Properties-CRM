/**
 * ==============================================================================
 *  PUBLIC SUFFIX & DOMAIN BOUNDARY VALIDATOR (Phase 1.2.3 Final Fix)
 *  Protects against public suffix approvals, shared parent bleed, and malformed hostnames
 *  Authoritative PSL Engine: Complete offline Mozilla Public Suffix List via 'tldts'.
 * ==============================================================================
 * 
 * UPDATE STRATEGY:
 * The Public Suffix List is maintained and vendored via the pinned `tldts` package.
 * `tldts` bundles the complete, compiled Mozilla Public Suffix List offline with zero runtime
 * network requests, handling international ccTLDs, wildcard rules, and exception rules.
 * Updates to the Public Suffix List are applied during regular dependency maintenance via:
 *   npm update tldts
 */

import * as tldts from 'tldts';

/**
 * Pinned offline Mozilla Public Suffix List parsing options.
 * allowPrivateDomains: true ensures shared-hosting and multi-tenant platforms
 * (e.g., github.io, vercel.app, s3.amazonaws.com, herokuapp.com) are recognized
 * as public boundaries and cannot be approved as root or authorize other tenants.
 */
export const TLDTS_PSL_OPTIONS = Object.freeze({
    allowPrivateDomains: true,
    extractHostname: true
});

/**
 * Common Public Suffix Set maintained for backwards compatibility and fast lookups.
 * The authoritative engine is the complete offline Mozilla Public Suffix List provided by `tldts`.
 */
export const PUBLIC_SUFFIX_SET = new Set([
    // Generic Top-Level Domains (gTLDs)
    'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'io', 'co', 'me',
    'app', 'dev', 'ai', 'xyz', 'top', 'site', 'online', 'tech', 'store', 'club', 'pro',
    'mobi', 'name', 'tel', 'asia', 'cat', 'jobs', 'travel',

    // Common Country-Code TLDs (ccTLDs)
    'in', 'us', 'uk', 'ca', 'au', 'de', 'fr', 'jp', 'cn', 'ru', 'br', 'za', 'ch', 'se',
    'nl', 'no', 'es', 'it', 'sg', 'ae', 'nz', 'ie', 'pk', 'bd', 'lk', 'np',

    // India Country-Code Second-Level Domains (.in ccSLDs)
    'co.in', 'gov.in', 'nic.in', 'ac.in', 'org.in', 'net.in', 'res.in', 'edu.in', 'mil.in',
    'gen.in', 'firm.in', 'ind.in',

    // United Kingdom ccSLDs (.uk)
    'co.uk', 'gov.uk', 'ac.uk', 'org.uk', 'net.uk', 'me.uk', 'ltd.uk', 'plc.uk',

    // Australia ccSLDs (.au)
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',

    // New Zealand ccSLDs (.nz)
    'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',

    // Brazil ccSLDs (.br)
    'com.br', 'gov.br', 'org.br', 'net.br', 'edu.br',

    // United States (.us ccSLDs & state domains)
    'fed.us', 'dni.us',
    'state.ak.us', 'state.al.us', 'state.ar.us', 'state.az.us', 'state.ca.us', 'state.co.us',
    'state.ct.us', 'state.de.us', 'state.fl.us', 'state.ga.us', 'state.hi.us', 'state.ia.us',
    'state.id.us', 'state.il.us', 'state.in.us', 'state.ks.us', 'state.ky.us', 'state.la.us',
    'state.ma.us', 'state.md.us', 'state.me.us', 'state.mi.us', 'state.mn.us', 'state.mo.us',
    'state.ms.us', 'state.mt.us', 'state.nc.us', 'state.nd.us', 'state.ne.us', 'state.nh.us',
    'state.nj.us', 'state.nm.us', 'state.nv.us', 'state.ny.us', 'state.oh.us', 'state.ok.us',
    'state.or.us', 'state.pa.us', 'state.ri.us', 'state.sc.us', 'state.sd.us', 'state.tn.us',
    'state.tx.us', 'state.ut.us', 'state.va.us', 'state.vt.us', 'state.wa.us', 'state.wi.us',
    'state.wv.us', 'state.wy.us',

    // Multi-tenant shared hosting platforms & dynamic cloud boundaries
    'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'herokuapp.com', 'pages.dev',
    'firebaseapp.com', 'web.app', 'amazonaws.com', 'azurewebsites.net', 'blogspot.com',
    'wordpress.com', 'cloudfront.net', 'ngrok.io', 'loca.lt', 's3.amazonaws.com'
]);

/**
 * Checks whether a given hostname is an unregistrable Public Suffix.
 * Evaluated against the complete Mozilla Public Suffix List (including ICANN & private domains).
 * 
 * @param {string} domain 
 * @returns {boolean}
 */
export function isPublicSuffix(domain) {
    if (!domain || typeof domain !== 'string') return true;
    const clean = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!clean) return true;
    
    // IP literals are addresses, not public suffixes
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clean) || clean.includes(':') || clean.startsWith('[')) {
        return false;
    }

    // Single label (e.g. "localhost", "com", "io", "in") is always a suffix / non-registrable
    if (!clean.includes('.')) return true;

    try {
        const parsed = tldts.parse(clean, TLDTS_PSL_OPTIONS);
        if (parsed.isIp) {
            return false;
        }

        // In tldts with allowPrivateDomains: true:
        // If clean is a public suffix (e.g. 'co.in', 'gov.in', 'co.nz', 'com.br', 'github.io', 'vercel.app'):
        // parsed.publicSuffix will equal clean, and parsed.domain will be null!
        if (parsed.publicSuffix === clean || !parsed.domain) {
            return true;
        }

        // Fast fallback to PUBLIC_SUFFIX_SET
        if (PUBLIC_SUFFIX_SET.has(clean)) {
            return true;
        }

        return false;
    } catch {
        // Fail-closed on parsing errors
        return true;
    }
}

/**
 * Validates a domain name submitted for operator governance approval.
 * Rejects IP literals, malformed hostnames, single-label names, and public suffixes.
 * 
 * @param {string} domain 
 * @returns {{ valid: boolean, domain?: string, error?: string }}
 */
export function validateDomainForApproval(domain) {
    if (!domain || typeof domain !== 'string') {
        return { valid: false, error: 'Domain must be a non-empty string' };
    }

    let clean = domain.trim().toLowerCase();

    // Strip scheme if caller pasted a full URL
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
        try {
            const parsed = new URL(clean);
            clean = parsed.hostname.toLowerCase();
        } catch {
            return { valid: false, error: 'Malformed URL provided as domain' };
        }
    }

    // Strip path, query, and trailing slash if present
    clean = clean.split('/')[0].split('?')[0].split('#')[0].replace(/^www\./, '').replace(/^\.+|\.+$/g, '');

    if (!clean) {
        return { valid: false, error: 'Domain must be a non-empty string' };
    }

    // Reject IPv4 literals (e.g. 127.0.0.1, 169.254.169.254, 93.184.216.34)
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clean)) {
        return { valid: false, error: 'IP literals cannot be registered as approved web domains' };
    }

    // Reject IPv6 literals
    if (clean.includes(':') || clean.startsWith('[') || clean.endsWith(']')) {
        return { valid: false, error: 'IPv6 literals cannot be registered as approved web domains' };
    }

    let parsed;
    try {
        parsed = tldts.parse(clean, TLDTS_PSL_OPTIONS);
        if (parsed.isIp) {
            return { valid: false, error: 'IP literals cannot be registered as approved web domains' };
        }
    } catch {
        return { valid: false, error: `Malformed domain name '${clean}'` };
    }

    // Reject Public Suffixes & Top-Level Domains (e.g. gov.in, co.in, com, io, in, github.io, co.nz, com.br, vercel.app)
    if (isPublicSuffix(clean)) {
        return { valid: false, error: `Cannot approve public suffix or shared parent boundary '${clean}'` };
    }

    if (clean.length < 3 || clean.length > 253) {
        return { valid: false, error: 'Domain length must be between 3 and 253 characters' };
    }

    // Must contain at least one dot separating labels
    if (!clean.includes('.')) {
        return { valid: false, error: 'Domain must contain at least one dot separating labels (e.g. example.com)' };
    }

    // Validate hostname labels (RFC 1123)
    const labels = clean.split('.');
    for (const label of labels) {
        if (!label || label.length > 63) {
            return { valid: false, error: 'Domain labels must be between 1 and 63 characters' };
        }
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) {
            return { valid: false, error: `Invalid domain label '${label}': must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen` };
        }
    }

    return { valid: true, domain: clean };
}

/**
 * Extracts candidate parent domains that can legally authorize a subdomain.
 * Stops immediately before any Public Suffix or TLD, ensuring shared parents
 * (e.g. gov.in, co.in, com, github.io, co.nz, com.br) are NEVER returned as candidate authorizers.
 * 
 * Example:
 *   "a.b.tcpharyana.gov.in" -> ["b.tcpharyana.gov.in", "tcpharyana.gov.in"] (stops before "gov.in")
 *   "sub.example.com"       -> ["example.com"] (stops before "com")
 *   "tenant.github.io"      -> [] (no parent above "tenant.github.io" because "github.io" is a public suffix)
 *   "example.com"           -> [] (no parent above "example.com")
 * 
 * @param {string} hostname 
 * @returns {string[]} Safe parent domains
 */
export function getSafeParentDomains(hostname) {
    if (!hostname || typeof hostname !== 'string') return [];
    const clean = hostname.trim().toLowerCase().replace(/^www\./, '').replace(/^\.+|\.+$/g, '');
    if (!clean || !clean.includes('.')) return [];

    let parsed;
    try {
        parsed = tldts.parse(clean, TLDTS_PSL_OPTIONS);
        // If clean is an IP literal or is itself a public suffix or has no registrable domain, no safe parents!
        if (parsed.isIp || !parsed.domain || parsed.publicSuffix === clean) {
            return [];
        }
    } catch {
        return [];
    }

    const parts = clean.split('.');
    if (parts.length < 3) return [];

    const parents = [];
    for (let i = 1; i < parts.length - 1; i++) {
        const candidate = parts.slice(i).join('.');
        // Stop if candidate is a public suffix (e.g. "gov.in", "com", "github.io", "co.nz", "com.br")
        if (isPublicSuffix(candidate)) {
            break;
        }
        parents.push(candidate);
    }

    return parents;
}

export default {
    TLDTS_PSL_OPTIONS,
    PUBLIC_SUFFIX_SET,
    isPublicSuffix,
    validateDomainForApproval,
    getSafeParentDomains
};
