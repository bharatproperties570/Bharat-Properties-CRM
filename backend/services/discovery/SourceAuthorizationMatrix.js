/**
 * ==============================================================================
 *  SOURCE AUTHORIZATION & CAPABILITY INVENTORY (Phase 1.2 / 1.2.1)
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
 * In-memory and configurable registry for verified partner authorization grants.
 * An authorization grant represents documented, verified written permission,
 * syndication partnership, or direct commercial API agreement for a specific domain.
 */
class AuthorizationGrantRegistry {
    constructor() {
        this.grants = new Map();
    }

    /**
     * Registers a verified partner grant for a domain.
     * 
     * @param {object} grant 
     * @param {string} grant.domain - e.g. '99acres.com'
     * @param {string} grant.grantType - e.g. 'syndication_partner' | 'commercial_api' | 'written_permission'
     * @param {string} grant.status - e.g. 'verified'
     * @param {string} [grant.agreementReference]
     * @param {Date|string} [grant.expiresAt]
     */
    registerGrant(grant) {
        if (!grant || !grant.domain) return;
        const cleanDomain = extractCleanDomain(grant.domain);
        if (!cleanDomain) return;

        this.grants.set(cleanDomain, {
            domain: cleanDomain,
            grantType: grant.grantType || 'written_permission',
            status: grant.status || 'verified',
            agreementReference: grant.agreementReference || 'GRANT-' + Date.now(),
            expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
            registeredAt: new Date()
        });
    }

    /**
     * Revokes a partner grant.
     * 
     * @param {string} domain 
     */
    revokeGrant(domain) {
        const cleanDomain = extractCleanDomain(domain);
        if (cleanDomain) {
            this.grants.delete(cleanDomain);
        }
    }

    /**
     * Clears all registered grants (useful for test resets).
     */
    clearAll() {
        this.grants.clear();
    }

    /**
     * Retrieves the grant record for a domain.
     * 
     * @param {string} domain 
     * @returns {object|null}
     */
    getGrant(domain) {
        const cleanDomain = extractCleanDomain(domain);
        if (!cleanDomain) return null;

        // Exact match or sub-domain match
        if (this.grants.has(cleanDomain)) {
            return this.grants.get(cleanDomain);
        }
        for (const [registeredDomain, grant] of this.grants.entries()) {
            if (cleanDomain.endsWith(`.${registeredDomain}`)) {
                return grant;
            }
        }
        return null;
    }

    /**
     * Determines whether a domain has an active, verified grant.
     * 
     * @param {string} domain 
     * @returns {boolean}
     */
    hasVerifiedGrant(domain) {
        const grant = this.getGrant(domain);
        if (!grant) return false;
        if (grant.status !== 'verified') return false;
        if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) return false;
        return true;
    }
}

export const authorizationGrantRegistry = new AuthorizationGrantRegistry();

/**
 * Master Source Authorization & Capability Matrix
 */
export const SOURCE_CAPABILITY_MATRIX = {
    [SOURCE_TIERS.TIER_1_OFFICIAL_API]: {
        tier: SOURCE_TIERS.TIER_1_OFFICIAL_API,
        name: 'Tier 1 — Official Search API',
        defaultStatus: SOURCE_STATUS.AUTHORIZED,
        description: 'Direct programmatic search discovery via official Google Custom Search API v1.',
        connectors: ['google_index', 'google_discovery'],
        authType: 'api_key',
        requiredEnvVars: ['GOOGLE_API_KEY', 'GOOGLE_SEARCH_ENGINE_ID'],
        optionalEnvVars: ['GOOGLE_PLACES_API_KEY'],
        rateLimits: {
            maxRequestsPerSecond: 1,
            defaultDailyQuota: 100,
            burstMax: 5
        },
        timeoutMs: 10000,
        requiresWrittenPermission: false,
        supportsExtraction: false,
        notes: 'Official Google Cloud Custom Search JSON API. Uses cx and auth parameters.'
    },

    [SOURCE_TIERS.TIER_2_PUBLIC_PAGE]: {
        tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
        name: 'Tier 2 — Public Page Accessible',
        defaultStatus: SOURCE_STATUS.AUTHORIZED,
        description: 'Public property listing pages accessible via standard HTTP with non-intrusive rate limits.',
        connectors: ['public_url', 'property_listing'],
        authType: 'none',
        requiredEnvVars: [],
        rateLimits: {
            maxRequestsPerSecond: 0.5,
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
        defaultStatus: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
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
            maxRequestsPerSecond: 0.2,
            concurrentRequests: 1,
            crawlDelayMs: 5000
        },
        timeoutMs: 15000,
        requiresWrittenPermission: true,
        supportsExtraction: true,
        notes: 'Direct mass scraping prohibited. Automated network fetching is BLOCKED unless verified written permission or syndication grant is registered. Search index records are preserved without network fetching for authorized human review.'
    },

    [SOURCE_TIERS.TIER_4_WALLED_GARDEN]: {
        tier: SOURCE_TIERS.TIER_4_WALLED_GARDEN,
        name: 'Tier 4 — Walled Gardens & Private Communities (Blocked Pending Authorization)',
        defaultStatus: SOURCE_STATUS.UNSUPPORTED_BLOCKED,
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
        notes: 'Automated harvesting without official OAuth app credentials and platform compliance is strictly blocked.'
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
 * 1. Source Classification
 * Classifies a given URL or source identifier into its structural tier.
 * 
 * @param {string} urlOrSource 
 * @returns {object} Tier classification, accessibility, and governance requirements
 */
export function classifySource(urlOrSource) {
    if (!urlOrSource || typeof urlOrSource !== 'string') {
        const spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_2_PUBLIC_PAGE];
        return {
            tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
            defaultStatus: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
            status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
            authorized: false,
            domain: null,
            technicallyAccessible: false,
            requiresWrittenPermission: true,
            reason: 'missing_source_identifier',
            spec
        };
    }

    const cleanInput = urlOrSource.trim().toLowerCase();

    // 1. Direct source type check
    if (cleanInput === 'google_index' || cleanInput === 'google_discovery') {
        const spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_1_OFFICIAL_API];
        return {
            tier: SOURCE_TIERS.TIER_1_OFFICIAL_API,
            defaultStatus: spec.defaultStatus,
            status: spec.defaultStatus,
            authorized: true,
            domain: 'googleapis.com',
            technicallyAccessible: true,
            requiresWrittenPermission: false,
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
            defaultStatus: tier4Spec.defaultStatus,
            status: tier4Spec.defaultStatus,
            authorized: false,
            domain,
            technicallyAccessible: false,
            requiresWrittenPermission: true,
            reason: 'walled_garden_blocked_pending_oauth',
            spec: tier4Spec
        };
    }

    // 3. Check Tier 3 Commercial Portals
    const tier3Spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL];
    if (domain && tier3Spec.knownDomains.some(d => domain === d || domain.endsWith(`.${d}`))) {
        return {
            tier: SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL,
            defaultStatus: tier3Spec.defaultStatus,
            status: tier3Spec.defaultStatus,
            authorized: false,
            domain,
            technicallyAccessible: true,
            requiresWrittenPermission: true,
            reason: 'commercial_portal_requires_written_syndication',
            spec: tier3Spec
        };
    }

    // 4. Default: Tier 2 Public Page
    const tier2Spec = SOURCE_CAPABILITY_MATRIX[SOURCE_TIERS.TIER_2_PUBLIC_PAGE];
    return {
        tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
        defaultStatus: tier2Spec.defaultStatus,
        status: tier2Spec.defaultStatus,
        authorized: true,
        domain: domain || 'unknown',
        technicallyAccessible: true,
        requiresWrittenPermission: false,
        reason: null,
        spec: tier2Spec
    };
}

/**
 * 2 & 3. Permission & Operation Authorization Evaluation
 * Evaluates whether a specific operation (e.g. 'automated_fetch') is authorized for a URL.
 * 
 * Rules:
 * - Scheme must be strictly http: or https:
 * - Tier 1: Allowed if official credentials exist.
 * - Tier 2: Allowed under standard public crawl terms.
 * - Tier 3: BLOCKED for automated fetch UNLESS an explicit, verified authorization grant is registered.
 *           portal_whitelist does NOT grant authorization; it is only a domain filter.
 * - Tier 4: Blocked for automated web fetch.
 * 
 * @param {string} urlOrSource 
 * @param {string} [operation='automated_fetch']
 * @param {object} [context={}]
 * @returns {{ allowed: boolean, tier: string, status: string, reason: string|null, grant: object|null, domain: string|null }}
 */
export function evaluateOperationAuthorization(urlOrSource, operation = 'automated_fetch', context = {}) {
    if (!urlOrSource || typeof urlOrSource !== 'string') {
        return {
            allowed: false,
            tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
            status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
            reason: 'missing_source_identifier',
            grant: null,
            domain: null
        };
    }

    // Scheme Validation: only http and https are allowed for web URLs
    if (urlOrSource.includes('://')) {
        try {
            const parsed = new URL(urlOrSource.trim());
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return {
                    allowed: false,
                    tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
                    status: SOURCE_STATUS.UNSUPPORTED_BLOCKED,
                    reason: `unsafe_scheme_${parsed.protocol.replace(':', '')}`,
                    grant: null,
                    domain: null
                };
            }
        } catch {
            return {
                allowed: false,
                tier: SOURCE_TIERS.TIER_2_PUBLIC_PAGE,
                status: SOURCE_STATUS.UNSUPPORTED_BLOCKED,
                reason: 'malformed_url',
                grant: null,
                domain: null
            };
        }
    }

    const classification = classifySource(urlOrSource);
    const domain = classification.domain;

    if (operation === 'automated_fetch') {
        // Tier 4: Blocked
        if (classification.tier === SOURCE_TIERS.TIER_4_WALLED_GARDEN) {
            return {
                allowed: false,
                tier: classification.tier,
                status: SOURCE_STATUS.UNSUPPORTED_BLOCKED,
                reason: 'walled_garden_blocked_pending_oauth',
                grant: null,
                domain
            };
        }

        // Tier 3: Restricted — Requires verified written permission or syndication grant
        if (classification.tier === SOURCE_TIERS.TIER_3_COMMERCIAL_PORTAL) {
            const hasGrant = authorizationGrantRegistry.hasVerifiedGrant(domain);
            if (hasGrant) {
                return {
                    allowed: true,
                    tier: classification.tier,
                    status: SOURCE_STATUS.AUTHORIZED,
                    reason: null,
                    grant: authorizationGrantRegistry.getGrant(domain),
                    domain
                };
            }

            // CRITICAL: portal_whitelist does NOT grant authorization!
            return {
                allowed: false,
                tier: classification.tier,
                status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
                reason: 'restricted_commercial_portal_requires_verified_permission',
                grant: null,
                domain
            };
        }

        // Tier 1: Official API
        if (classification.tier === SOURCE_TIERS.TIER_1_OFFICIAL_API) {
            const hasKeys = !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID);
            return {
                allowed: hasKeys,
                tier: classification.tier,
                status: hasKeys ? SOURCE_STATUS.AUTHORIZED : SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
                reason: hasKeys ? null : 'missing_official_api_credentials',
                grant: null,
                domain
            };
        }

        // Tier 2: Public Web Page
        return {
            allowed: true,
            tier: classification.tier,
            status: SOURCE_STATUS.AUTHORIZED,
            reason: null,
            grant: null,
            domain
        };
    }

    // For non-fetch operations (e.g. metadata intake, manual review)
    return {
        allowed: classification.tier !== SOURCE_TIERS.TIER_4_WALLED_GARDEN,
        tier: classification.tier,
        status: classification.defaultStatus,
        reason: classification.reason,
        grant: null,
        domain
    };
}

/**
 * Checks whether a given URL or source is authorized for an operation.
 * 
 * @param {string} urlOrSource 
 * @param {string} [operation='automated_fetch']
 * @returns {boolean}
 */
export function isSourceAuthorized(urlOrSource, operation = 'automated_fetch') {
    const decision = evaluateOperationAuthorization(urlOrSource, operation);
    return decision.allowed === true;
}

export default {
    SOURCE_TIERS,
    SOURCE_STATUS,
    SOURCE_CAPABILITY_MATRIX,
    authorizationGrantRegistry,
    classifySource,
    evaluateOperationAuthorization,
    isSourceAuthorized,
    extractCleanDomain
};
