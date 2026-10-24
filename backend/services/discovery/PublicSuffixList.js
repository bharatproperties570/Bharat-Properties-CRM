/**
 * ==============================================================================
 *  PUBLIC SUFFIX & DOMAIN BOUNDARY VALIDATOR (Phase 1.2.3 Consolidated Fix)
 *  Protects against public suffix approvals, shared parent bleed, and malformed hostnames
 * ==============================================================================
 */

/**
 * Public Suffix Set containing top-level domains, country-code second-level domains,
 * statutory/government suffixes, and multi-tenant shared hosting platforms.
 * Approving any domain in this set is strictly forbidden as it would authorize
 * unrelated third parties or entire national/organizational namespaces.
 */
export const PUBLIC_SUFFIX_SET = new Set([
    // Generic Top-Level Domains (gTLDs)
    'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'io', 'co', 'me',
    'app', 'dev', 'ai', 'xyz', 'top', 'site', 'online', 'tech', 'store', 'club', 'pro',
    'mobi', 'name', 'tel', 'asia', 'cat', 'jobs', 'travel',

    // Common Country-Code TLDs (ccTLDs)
    'in', 'us', 'uk', 'ca', 'au', 'de', 'fr', 'jp', 'cn', 'ru', 'br', 'za', 'ch', 'se',
    'nl', 'no', 'es', 'it', 'ru', 'sg', 'ae', 'nz', 'ie', 'pk', 'bd', 'lk', 'np',

    // India Country-Code Second-Level Domains (.in ccSLDs)
    'co.in', 'gov.in', 'nic.in', 'ac.in', 'org.in', 'net.in', 'res.in', 'edu.in', 'mil.in',
    'gen.in', 'firm.in', 'ind.in',

    // United Kingdom ccSLDs (.uk)
    'co.uk', 'gov.uk', 'ac.uk', 'org.uk', 'net.uk', 'me.uk', 'ltd.uk', 'plc.uk',

    // Australia ccSLDs (.au)
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',

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
 * 
 * @param {string} domain 
 * @returns {boolean}
 */
export function isPublicSuffix(domain) {
    if (!domain || typeof domain !== 'string') return true;
    const clean = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!clean) return true;
    // Single label (e.g. "localhost", "com") is always a suffix / non-registrable
    if (!clean.includes('.')) return true;
    return PUBLIC_SUFFIX_SET.has(clean);
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

    // Reject Public Suffixes & Top-Level Domains (e.g. gov.in, co.in, com, io, in, github.io)
    if (isPublicSuffix(clean)) {
        return { valid: false, error: `Cannot approve public suffix or shared parent boundary '${clean}'` };
    }

    if (clean.length < 3 || clean.length > 253) {
        return { valid: false, error: 'Domain length must be between 3 and 253 characters' };
    }

    // Reject IPv4 literals (e.g. 127.0.0.1, 169.254.169.254, 93.184.216.34)
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clean)) {
        return { valid: false, error: 'IP literals cannot be registered as approved web domains' };
    }

    // Reject IPv6 literals
    if (clean.includes(':') || clean.startsWith('[') || clean.endsWith(']')) {
        return { valid: false, error: 'IPv6 literals cannot be registered as approved web domains' };
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
 * (e.g. gov.in, co.in, com, github.io) are NEVER returned as candidate authorizers.
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
    const parts = clean.split('.');
    
    // Need at least 3 parts for a subdomain under a 2-part domain (e.g. sub.example.com)
    if (parts.length < 3) return [];

    const parents = [];
    for (let i = 1; i < parts.length - 1; i++) {
        const candidate = parts.slice(i).join('.');
        // Stop if candidate is a public suffix (e.g. "gov.in", "com", "github.io")
        if (isPublicSuffix(candidate)) {
            break;
        }
        parents.push(candidate);
    }

    return parents;
}

export default {
    PUBLIC_SUFFIX_SET,
    isPublicSuffix,
    validateDomainForApproval,
    getSafeParentDomains
};
