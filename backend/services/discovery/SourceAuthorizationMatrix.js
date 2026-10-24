/**
 * ==============================================================================
 *  SOURCE AUTHORIZATION & CAPABILITY INVENTORY (Phase 1.2)
 *  Enterprise governance, access control, rate limiting, and capability matrix
 * ==============================================================================
 */

export const SOURCE_TIERS = {
    TIER_1_OFFICIAL_API: 'tier_1_official_api',
    TIER_2_PUBLIC_PAGE: 'tier_2_public_page',
    TIER_3_COMMERCIAL_PORTAL: 'tier_3_commercial_portal',
    TIER_4_WALLED_GARDEN: 'tier_4_walled_garden'
};

export const SOURCE_STATUS = {
    AUTHORIZED: 'authorized',
    RESTRICTED_PERMISSION_REQUIRED: 'restricted_permission_required',
    UNSUPPORTED_BLOCKED: 'unsupported_blocked'
};

/**
 * Master Source Authorization & Capability Matrix
 */
export const SOURCE_CAPABILITY_MATRIX = {
    [SOURCE_TIERS.TIER_1_OFFICIAL_API]: {
        tier: SOURCE_TIERS.TIER_1_OFFICIAL_API,
        name: 'Tier 1 — Official Search API',
        status: SOURCE_STATUS.AUTHORIZED,
        description: 'Direct programmatic search discovery via official Google Custom Search API v1.',
        connectors: ['google_index', 'google_discovery'],
        authType: 'api_key',
        requiredEnvVars: ['GOOGLE_API_KEY', 'GOOGLE_SEARCH_ENGINE_ID'],
        optionalEnvVars: ['GOOGLE_PLACES_API_KEY'],
        rateLimits: {
            maxRequestsPerSecond: 1,
            defaultDailyQuota: 100, // Google Custom Search free tier
            burstMax: 5
        },
        timeoutMs: 10000,
        requiresWrittenPermission: false,
        supportsExtraction: false, // Indexing/discovery only; fetches URLs for subsequent queueing
        notes: 'Official Google Cloud Custom Search JSON API. Uses cx and auth parameters.'
    },

    [SOURCE_TIERS.TIER_2_PUBLIC_PAGE]: {
        tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
        name: 'Tier 2 — Public Page Accessible',
        status: SOURCE_STATUS.AUTHORIZED,
        description: 'Public property listing pages accessible via standard HTTP with non-intrusive rate limits.',
        connectors: ['public_url', 'property_listing'],
        authType: 'none',
        requiredEnvVars: [],
        rateLimits: {
            maxRequestsPerSecond: 0.5, // 1 request per 2 seconds
            concurrentRequests: 2,
            crawlDelayMs: 2000
        },
        timeoutMs: 15000,
        requiresWrittenPermission: false,
        supportsExtraction: true,
        notes: 'Permitted for standalone public web pages and user-submitted URLs under strict non-bot headers and timeouts.'
    },

    [SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL]: {
        tier: SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL,
        name: 'Tier 3 — Commercial Real Estate Portals (Permission/Syndication Required)',
        status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
        description: 'Commercial real estate aggregators protected by anti-bot systems and terms of service.',
        knownDomains: [
            '99acres.com',
            'magicbricks.com',
            'housing.com',
            'olx.in',
            'commonfloor.com',
            'nobroker.in',
            'squareyards.com',
            'makaan.com',
            'proptiger.com',
            'quikr.com'
        ],
        connectors: ['public_url', 'property_listing'],
        authType: 'syndication_api_or_partner_agreement',
        requiredEnvVars: [],
        rateLimits: {
            maxRequestsPerSecond: 0.2, // 1 request per 5 seconds if authorized
            concurrentRequests: 1,
            crawlDelayMs: 5000
        },
        timeoutMs: 15000,
        requiresWrittenPermission: true,
        supportsExtraction: true,
        notes: 'Direct mass scraping prohibited. Single listings discovered through search engine indices or submitted manually by users are processed for evaluation, but remain UNVERIFIED and flagged for mandatory human review.'
    },

    [SOURCE_TIERS.TIER_4_WALLED_GARDEN]: {
        tier: SOURCE_TIERS.TIER_4_WALLED_GARDEN,
        name: 'Tier 4 — Walled Gardens & Private Communities (Blocked Pending Authorization)',
        status: SOURCE_STATUS.UNSUPPORTED_BLOCKED,
        description: 'Login-gated social networks, private groups, and platforms requiring individual user credentials.',
        knownDomains: [
            'facebook.com',
            'instagram.com',
            'linkedin.com',
            'youtube.com',
            'twitter.com',
            'x.com',
            'telegram.org',
            't.me',
            'reddit.com'
        ],
        connectors: [],
        authType: 'oauth2_or_official_webhook',
        requiredEnvVars: [],
        rateLimits: null,
        timeoutMs: 0,
        requiresWrittenPermission: true,
        supportsExtraction: false,
        notes: 'Automated harvesting without official OAuth app credentials and platform compliance is strictly blocked to maintain platform policy compliance.'
    }
};

/**
 * Extracts clean domain hostname from a URL or domain string.
 * 
 * @param {string} input 
 * @returns {string|null}
 */
export function extractCleanDomain(input) {
    if (!input || typeof input !== 'string') return null;
    try {
        const urlStr = input.trim().startsWith('http://') || input.trim().startsWith('https://')
            ? input.trim()
            : `https://${input.trim()}`;
        const parsed = new URL(urlStr);
        return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return null;
    }
}

/**
 * Classifies a given URL or source identifier into its authorization tier.
 * 
 * @param {string} urlOrSource 
 * @returns {object} Tier specification and authorization details
 */
export function classifySource(urlOrSource) {
    if (!urlOrSource || typeof urlOrSource !== 'string') {
        return {
            tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
            status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
            authorized: false,
            domain: null,
            reason: 'missing_source_identifier',
            spec: SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_2_PUBLIC_PAGE]
        };
    }

    const cleanInput = urlOrSource.trim().toLowerCase();

    // 1. Direct source type check
    if (cleanInput === 'google_index' || cleanInput === 'google_discovery') {
        const spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_1_OFFICIAL_API];
        return {
            tier: SOURCE_TIERS.TIER_1_OFFICIAL_API,
            status: spec.status,
            authorized: true,
            domain: 'googleapis.com',
            reason: null,
            spec
        };
    }

    const domain = extractCleanDomain(cleanInput);

    // 2. Check Tier 4 Walled Gardens
    const tier4Spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_4_WALLED_GARDEN];
    if (domain && tier4Spec.knownDomains.some(d => domain === d || domain.endsWith(`.${d}`))) {
        return {
            tier: SOURCE_TIERS.TIER_4_WALLED_GARDEN,
            status: tier4Spec.status,
            authorized: false,
            domain,
            reason: 'walled_garden_blocked_pending_oauth',
            spec: tier4Spec
        };
    }

    // 3. Check Tier 3 Commercial Portals
    const tier3Spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL];
    if (domain && tier3Spec.knownDomains.some(d => domain === d || domain.endsWith(`.${d}`))) {
        return {
            tier: SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL,
            status: tier3Spec.status,
            // Permitted for single URL review, but marked with restricted permission status
            authorized: true,
            requiresPermission: true,
            domain,
            reason: 'commercial_portal_requires_written_syndication',
            spec: tier3Spec
        };
    }

    // 4. Default: Tier 2 Public Page
    const tier2Spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_2_PUBLIC_PAGE];
    return {
        tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
        status: tier2Spec.status,
        authorized: true,
        domain: domain || 'unknown',
        reason: null,
        spec: tier2Spec
    };
}

/**
 * Checks whether a given URL or source is authorized for ingestion.
 * 
 * @param {string} urlOrSource 
 * @returns {boolean}
 */
export function isSourceAuthorized(urlOrSource) {
    const classification = classifySource(urlOrSource);
    return classification.authorized === true && classification.tier !== SOURCE_TIERS.TIER_4_WALLED_GARDEN;
}

export default {
    SOURCE_TIERS,
    SOURCE_STATUS,
    SOURCE_CAPABILITY_MATRIX,
    classifySource,
    isSourceAuthorized,
    extractCleanDomain
};
