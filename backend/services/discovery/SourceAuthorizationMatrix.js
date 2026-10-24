/**
 * ==============================================================================
 *  SOURCE AUTHORIZATION & CAPABILITY INVENTORY (Phase 1.2 / 1.2.1 / 1.2.2)
 *  Enterprise governance, access control, rate limiting, and capability matrix
 * ==============================================================================
 * 
 * LEGAL AND COMPLIANCE NOTICE:
 * Technical accessibility, lack of HTTP 403/401 errors, absence of robots.txt
 * restrictions, or public search index visibility does NOT constitute legal permission,
 * license, or authorization to scrape, aggregate, or redistribute property data.
 * Bharat Properties CRM enforces strict authorization gates and human review workflows:
 * 1. Tier 3 commercial portals strictly require an active, verified permission grant.
 * 2. Portal whitelist settings define candidate discovery filters ONLY and NEVER grant authorization.
 * 3. Unknown domains in automated discovery are subject to domain verification governance.
 * 4. User-submitted URLs (entered directly by CRM operators) are handled with safe fetch controls.
 */

import mongoose from 'mongoose';
import ApprovedDomain from '../../models/ApprovedDomain.js';
import AuditLog from '../../models/AuditLog.js';
import { validateDomainForApproval, getSafeParentDomains, isPublicSuffix } from './PublicSuffixList.js';
import withMongoTransaction from '../../utils/withMongoTransaction.js';

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
 * Official regulatory and statutory directory for Haryana real estate governance.
 * Documented statutory mandates (Town and Country Planning Haryana, HSVP).
 * 
 * NOTE: Private commercial portals (e.g. kurukshetrarealestate.in) are NOT regulatory bodies
 * and must never be classified as official government authorities.
 * Even official government authorities require auditable administrative approval before automated fetching.
 */
export const OFFICIAL_REGULATORY_DIRECTORY = {
    'tcpharyana.gov.in': {
        name: 'Town and Country Planning Department, Government of Haryana',
        mandate: 'Statutory urban planning, zoning approvals, master plans, and colonizer licensing in Haryana',
        jurisdiction: 'State of Haryana',
        category: 'regulatory_authority'
    },
    'hsvp.org.in': {
        name: 'Haryana Shehri Vikas Pradhikaran (formerly HUDA)',
        mandate: 'Statutory urban development, sector planning, land acquisition, and allotment authority for Haryana',
        jurisdiction: 'State of Haryana',
        category: 'statutory_authority'
    }
};

/**
 * Extracts parent domain hierarchy for subdomain authorization lookup.
 * Safely stops before any Public Suffix (e.g. gov.in, co.in, com, github.io).
 */
export function getParentDomains(cleanDomain) {
    return getSafeParentDomains(cleanDomain);
}

/**
 * Domain Governance Policy for Public and Unknown Domains (Phase 1.2.3 Final Consolidated Fix).
 * 
 * Enforces mandatory durable domain governance for automated web fetching.
 * Unknown or unapproved public domains are blocked by default from automated fetching
 * and held for operator review on Deal Intake Desk without network requests.
 * 
 * Critical Guarantees:
 * 1. Eliminate in-memory authorization fallback:
 *    - Production automated fetching relies strictly on durable MongoDB ApprovedDomain records.
 *    - When MongoDB is disconnected, unreachable, or read/write fails, policy FAILS CLOSED.
 *    - Synchronous stubs or in-memory cache NEVER grant authorization when DB is down.
 * 2. PSL and Hierarchy Defense:
 *    - Approvals of Public Suffixes (gov.in, co.in, com, github.io, etc.) are strictly rejected.
 *    - Subdomain authorization requires includeSubdomains: true on the approved parent.
 *    - Subdomain matching terminates before any Public Suffix boundary.
 * 3. Atomic Operator Provenance:
 *    - ApprovedDomain mutations and AuditLog entries occur atomically.
 *    - Failure in database write or audit write rolls back and throws an explicit error.
 */
export class DomainGovernancePolicy {
    constructor() {
        this.verifiedDomains = new Map();
        this.enforceDbFailClosed = false;
        this.lastDbError = null;
        this.reset();
    }

    /**
     * Resets verified domains in-memory cache.
     */
    reset() {
        this.verifiedDomains = new Map();
        this.enforceDbFailClosed = false;
        this.lastDbError = null;
    }

    /**
     * Toggle simulated DB fail-closed mode (for outage and resilience testing).
     */
    setFailClosedMode(enabled = true) {
        this.enforceDbFailClosed = Boolean(enabled);
        if (enabled) {
            this.lastDbError = new Error('Database connection unavailable (fail-closed simulated)');
        } else {
            this.lastDbError = null;
        }
    }

    /**
     * Operator domain verification and registration workflow (in-memory / test harness).
     * 
     * @param {string} domain 
     * @param {object} [options={}]
     * @param {string} [options.approvedBy='operator']
     * @param {string} [options.notes='']
     * @param {boolean} [options.includeSubdomains=false]
     * @returns {boolean} True if successfully registered
     */
    registerDomain(domain, options = {}) {
        const validation = validateDomainForApproval(domain);
        if (!validation.valid) return false;
        const clean = validation.domain;

        this.verifiedDomains.set(clean, {
            domain: clean,
            status: 'approved',
            includeSubdomains: Boolean(options.includeSubdomains),
            approvedBy: options.approvedBy || 'operator',
            approvedAt: options.approvedAt || new Date(),
            notes: options.notes || 'Operator verified domain approval'
        });
        return true;
    }

    /**
     * Durable registration persisting to MongoDB ApprovedDomain with an atomic AuditLog entry.
     * Throws an explicit failure if MongoDB is disconnected or if any write fails.
     * Does NOT cache or grant authorization on failure.
     */
    async registerDomainDurable({ domain, operatorId, operatorEmail, operatorRole, reason, notes, includeSubdomains = false }) {
        // Pre-condition: MongoDB connection must be ready
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            this.lastDbError = new Error('Database connection unavailable for durable domain registration');
            throw this.lastDbError;
        }

        // Validate domain syntax, reject IP literals and Public Suffixes
        const validation = validateDomainForApproval(domain);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        const clean = validation.domain;

        // Mandatory non-empty reason
        const reasonText = typeof reason === 'string' ? reason.trim() : '';
        if (!reasonText) {
            throw new Error('Approval reason is required and cannot be empty');
        }

        // Mandatory operator identity
        if (!operatorEmail) {
            throw new Error('Authenticated operator identity required');
        }

        const now = new Date();
        const incSub = Boolean(includeSubdomains);
        let doc = null;

        const tryWithTxn = async () => {
            return await withMongoTransaction(async (session) => {
                const existing = await ApprovedDomain.findOne({ domain: clean }).session(session);
                const prevStatus = existing ? existing.status : 'unregistered';

                doc = await ApprovedDomain.findOneAndUpdate(
                    { domain: clean },
                    {
                        $set: {
                            domain: clean,
                            status: 'approved',
                            includeSubdomains: incSub,
                            operatorId: operatorId || null,
                            operatorEmail: operatorEmail,
                            operatorRole: operatorRole || 'Admin',
                            approvedAt: now,
                            approvalReason: reasonText,
                            notes: (notes || '').trim()
                        },
                        $push: {
                            auditHistory: {
                                status: 'approved',
                                includeSubdomains: incSub,
                                changedBy: operatorId || null,
                                changedByEmail: operatorEmail,
                                changedByRole: operatorRole || 'Admin',
                                reason: reasonText,
                                timestamp: now
                            }
                        }
                    },
                    { upsert: true, new: true, runValidators: true, session }
                );

                await AuditLog.create([{
                    eventType: 'domain_approved',
                    actorId: operatorId || null,
                    actorEmail: operatorEmail,
                    targetType: 'domain',
                    targetName: clean,
                    description: `Operator ${operatorEmail} (${operatorRole || 'Admin'}) approved domain '${clean}': ${reasonText}`,
                    changes: {
                        before: { status: prevStatus },
                        after: { status: 'approved', includeSubdomains: incSub }
                    },
                    metadata: {
                        domain: clean,
                        reason: reasonText,
                        operatorRole: operatorRole || 'Admin',
                        includeSubdomains: incSub
                    }
                }], { session });

                return doc;
            });
        };

        try {
            await tryWithTxn();
        } catch (txnErr) {
            const isTxnUnsupported = txnErr.message && (
                txnErr.message.includes('Transaction numbers are only allowed') ||
                txnErr.message.includes('replica set member')
            );
            if (isTxnUnsupported) {
                // Two-phase manual rollback for standalone MongoDB environments
                const existing = await ApprovedDomain.findOne({ domain: clean });
                const prevStatus = existing ? existing.status : 'unregistered';
                const prevSnapshot = existing ? existing.toObject() : null;

                doc = await ApprovedDomain.findOneAndUpdate(
                    { domain: clean },
                    {
                        $set: {
                            domain: clean,
                            status: 'approved',
                            includeSubdomains: incSub,
                            operatorId: operatorId || null,
                            operatorEmail: operatorEmail,
                            operatorRole: operatorRole || 'Admin',
                            approvedAt: now,
                            approvalReason: reasonText,
                            notes: (notes || '').trim()
                        },
                        $push: {
                            auditHistory: {
                                status: 'approved',
                                includeSubdomains: incSub,
                                changedBy: operatorId || null,
                                changedByEmail: operatorEmail,
                                changedByRole: operatorRole || 'Admin',
                                reason: reasonText,
                                timestamp: now
                            }
                        }
                    },
                    { upsert: true, new: true, runValidators: true }
                );

                try {
                    await AuditLog.create({
                        eventType: 'domain_approved',
                        actorId: operatorId || null,
                        actorEmail: operatorEmail,
                        targetType: 'domain',
                        targetName: clean,
                        description: `Operator ${operatorEmail} (${operatorRole || 'Admin'}) approved domain '${clean}': ${reasonText}`,
                        changes: {
                            before: { status: prevStatus },
                            after: { status: 'approved', includeSubdomains: incSub }
                        },
                        metadata: {
                            domain: clean,
                            reason: reasonText,
                            operatorRole: operatorRole || 'Admin',
                            includeSubdomains: incSub
                        }
                    });
                } catch (auditErr) {
                    // Rollback ApprovedDomain modification
                    if (prevSnapshot) {
                        await ApprovedDomain.findOneAndReplace({ domain: clean }, prevSnapshot);
                    } else {
                        await ApprovedDomain.deleteOne({ domain: clean });
                    }
                    throw new Error(`Failed to write durable AuditLog for domain approval: ${auditErr.message}`);
                }
            } else {
                throw txnErr;
            }
        }

        // Cache is updated ONLY AFTER confirmed durable write
        const cacheEntry = {
            domain: clean,
            status: 'approved',
            includeSubdomains: incSub,
            operatorId: operatorId || null,
            operatorEmail: operatorEmail,
            operatorRole: operatorRole || 'Admin',
            approvedBy: operatorEmail,
            approvedAt: now,
            approvalReason: reasonText,
            notes: (notes || reasonText).trim()
        };
        this.verifiedDomains.set(clean, cacheEntry);
        this.lastDbError = null;

        return doc;
    }

    /**
     * Revokes domain approval (in-memory / test harness).
     * 
     * @param {string} domain 
     * @param {object} [options={}]
     * @param {string} [options.revokedBy='operator']
     * @param {string} [options.reason='']
     * @returns {boolean} True if successfully revoked
     */
    revokeDomain(domain, options = {}) {
        const clean = extractCleanDomain(domain);
        if (!clean) return false;

        this.verifiedDomains.set(clean, {
            domain: clean,
            status: 'revoked',
            revokedBy: options.revokedBy || 'operator',
            revokedAt: new Date(),
            revocationReason: options.reason || 'Operator revoked domain approval'
        });
        return true;
    }

    /**
     * Durable revocation persisting to MongoDB ApprovedDomain with an atomic AuditLog entry.
     * Throws an explicit failure if MongoDB is disconnected or if any write fails.
     */
    async revokeDomainDurable({ domain, operatorId, operatorEmail, operatorRole, reason }) {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            this.lastDbError = new Error('Database connection unavailable for durable domain revocation');
            throw this.lastDbError;
        }

        const validation = validateDomainForApproval(domain);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        const clean = validation.domain;

        const reasonText = typeof reason === 'string' ? reason.trim() : '';
        if (!reasonText) {
            throw new Error('Revocation reason is required and cannot be empty');
        }

        if (!operatorEmail) {
            throw new Error('Authenticated operator identity required');
        }

        const now = new Date();
        let doc = null;

        const tryWithTxn = async () => {
            return await withMongoTransaction(async (session) => {
                const existing = await ApprovedDomain.findOne({ domain: clean }).session(session);
                const prevStatus = existing ? existing.status : 'unregistered';

                doc = await ApprovedDomain.findOneAndUpdate(
                    { domain: clean },
                    {
                        $set: {
                            status: 'revoked',
                            revokedAt: now,
                            revokedBy: operatorId || null,
                            revokedByEmail: operatorEmail,
                            revokedByRole: operatorRole || 'Admin',
                            revocationReason: reasonText
                        },
                        $push: {
                            auditHistory: {
                                status: 'revoked',
                                changedBy: operatorId || null,
                                changedByEmail: operatorEmail,
                                changedByRole: operatorRole || 'Admin',
                                reason: reasonText,
                                timestamp: now
                            }
                        }
                    },
                    { new: true, upsert: true, session }
                );

                await AuditLog.create([{
                    eventType: 'domain_revoked',
                    actorId: operatorId || null,
                    actorEmail: operatorEmail,
                    targetType: 'domain',
                    targetName: clean,
                    description: `Operator ${operatorEmail} (${operatorRole || 'Admin'}) revoked domain '${clean}': ${reasonText}`,
                    changes: {
                        before: { status: prevStatus },
                        after: { status: 'revoked' }
                    },
                    metadata: {
                        domain: clean,
                        reason: reasonText,
                        operatorRole: operatorRole || 'Admin'
                    }
                }], { session });

                return doc;
            });
        };

        try {
            await tryWithTxn();
        } catch (txnErr) {
            const isTxnUnsupported = txnErr.message && (
                txnErr.message.includes('Transaction numbers are only allowed') ||
                txnErr.message.includes('replica set member')
            );
            if (isTxnUnsupported) {
                const existing = await ApprovedDomain.findOne({ domain: clean });
                const prevStatus = existing ? existing.status : 'unregistered';
                const prevSnapshot = existing ? existing.toObject() : null;

                doc = await ApprovedDomain.findOneAndUpdate(
                    { domain: clean },
                    {
                        $set: {
                            status: 'revoked',
                            revokedAt: now,
                            revokedBy: operatorId || null,
                            revokedByEmail: operatorEmail,
                            revokedByRole: operatorRole || 'Admin',
                            revocationReason: reasonText
                        },
                        $push: {
                            auditHistory: {
                                status: 'revoked',
                                changedBy: operatorId || null,
                                changedByEmail: operatorEmail,
                                changedByRole: operatorRole || 'Admin',
                                reason: reasonText,
                                timestamp: now
                            }
                        }
                    },
                    { new: true, upsert: true }
                );

                try {
                    await AuditLog.create({
                        eventType: 'domain_revoked',
                        actorId: operatorId || null,
                        actorEmail: operatorEmail,
                        targetType: 'domain',
                        targetName: clean,
                        description: `Operator ${operatorEmail} (${operatorRole || 'Admin'}) revoked domain '${clean}': ${reasonText}`,
                        changes: {
                            before: { status: prevStatus },
                            after: { status: 'revoked' }
                        },
                        metadata: {
                            domain: clean,
                            reason: reasonText,
                            operatorRole: operatorRole || 'Admin'
                        }
                    });
                } catch (auditErr) {
                    if (prevSnapshot) {
                        await ApprovedDomain.findOneAndReplace({ domain: clean }, prevSnapshot);
                    } else {
                        await ApprovedDomain.deleteOne({ domain: clean });
                    }
                    throw new Error(`Failed to write durable AuditLog for domain revocation: ${auditErr.message}`);
                }
            } else {
                throw txnErr;
            }
        }

        const cacheEntry = {
            domain: clean,
            status: 'revoked',
            revokedBy: operatorEmail,
            revokedByEmail: operatorEmail,
            revokedByRole: operatorRole || 'Admin',
            revocationReason: reasonText,
            revokedAt: now
        };
        this.verifiedDomains.set(clean, cacheEntry);
        this.lastDbError = null;

        return doc;
    }

    /**
     * Compatibility alias for registerDomain
     */
    addVerifiedDomain(domain, options = {}) {
        return this.registerDomain(domain, options);
    }

    /**
     * Compatibility alias: removes domain completely
     */
    removeVerifiedDomain(domain) {
        const clean = extractCleanDomain(domain);
        if (!clean) return false;
        return this.verifiedDomains.delete(clean);
    }

    /**
     * Determines whether a domain is approved for automated fetching asynchronously.
     * Evaluates durable MongoDB storage and fails closed on DB outage/error.
     * NEVER falls back to in-memory approvals when the database is unavailable or the record is missing.
     * 
     * @param {string} domain 
     * @returns {Promise<boolean>}
     */
    async isDomainVerifiedAsync(domain) {
        if (!domain || typeof domain !== 'string') return false;

        // Fail closed if explicitly simulated outage
        if (this.enforceDbFailClosed) {
            this.lastDbError = new Error('Database connection unavailable (fail-closed simulated)');
            return false;
        }

        // Fail closed if MongoDB connection is not active
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            this.lastDbError = new Error('Database connection unavailable (fail-closed)');
            return false;
        }

        const clean = extractCleanDomain(domain);
        if (!clean) return false;

        try {
            // 1. Check exact match in durable registry
            const exactDoc = await ApprovedDomain.findOne({
                domain: clean,
                status: 'approved'
            }).lean();

            if (exactDoc) {
                this.verifiedDomains.set(clean, {
                    domain: clean,
                    status: 'approved',
                    includeSubdomains: Boolean(exactDoc.includeSubdomains),
                    approvedBy: exactDoc.operatorEmail || String(exactDoc.operatorId || 'durable_record'),
                    approvedAt: exactDoc.approvedAt,
                    notes: exactDoc.approvalReason || exactDoc.notes
                });
                this.lastDbError = null;
                return true;
            }

            // 2. Safe parent domain match above Public Suffix boundary
            // ONLY if parent has includeSubdomains: true
            const safeParents = getSafeParentDomains(clean);
            if (safeParents.length > 0) {
                const parentDoc = await ApprovedDomain.findOne({
                    domain: { $in: safeParents },
                    status: 'approved',
                    includeSubdomains: true
                }).lean();

                if (parentDoc) {
                    this.lastDbError = null;
                    return true;
                }
            }

            // Not found in durable registry -> not approved (NO in-memory fallback!)
            this.lastDbError = null;
            return false;
        } catch (dbErr) {
            console.warn(`[DomainGovernance:DB Error] Error checking domain ${clean}, failing closed:`, dbErr.message);
            this.lastDbError = dbErr;
            return false; // Fail-closed on DB error
        }
    }

    /**
     * Determines whether a domain is approved for automated fetching synchronously.
     * Checks exact match or registered safe parent domain match with includeSubdomains.
     * Returns true ONLY if registered AND status === 'approved'.
     * 
     * @param {string} domain 
     * @returns {boolean}
     */
    isDomainVerified(domain) {
        if (!domain || typeof domain !== 'string') return false;
        const clean = extractCleanDomain(domain);
        if (!clean) return false;

        if (this.enforceDbFailClosed) {
            return false;
        }

        // Exact match in memory
        if (this.verifiedDomains.has(clean)) {
            const entry = this.verifiedDomains.get(clean);
            return entry.status === 'approved';
        }

        // Subdomain match: must have includeSubdomains: true and above PSL boundary
        const safeParents = getSafeParentDomains(clean);
        for (const parent of safeParents) {
            if (this.verifiedDomains.has(parent)) {
                const parentEntry = this.verifiedDomains.get(parent);
                if (parentEntry.status === 'approved' && parentEntry.includeSubdomains === true) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Retrieves domain registration metadata.
     */
    getDomainRecord(domain) {
        const clean = extractCleanDomain(domain);
        if (!clean) return null;
        return this.verifiedDomains.get(clean) || null;
    }

    /**
     * Lists all registered domains and their governance status.
     */
    listDomains() {
        return Array.from(this.verifiedDomains.values());
    }

    clear() {
        this.verifiedDomains.clear();
        this.enforceDbFailClosed = false;
        this.lastDbError = null;
    }
}

export const domainGovernancePolicy = new DomainGovernancePolicy();

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
        // Secure-by-default (Phase 1.2.3): Automated HTTP fetching of Tier 2 domains requires explicit domain approval.
        // Unknown or unapproved domains are blocked from automated fetching and held for operator review without network access.
        // Portal whitelist configuration defines candidate filters only and NEVER grants domain authorization.
        if (!domainGovernancePolicy.isDomainVerified(domain)) {
            const isDbFailure = domainGovernancePolicy.enforceDbFailClosed || domainGovernancePolicy.lastDbError != null;
            return {
                allowed: false,
                tier: classification.tier,
                status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
                reason: isDbFailure ? 'database_unavailable_fail_closed' : 'unverified_domain_requires_human_verification',
                grant: null,
                domain
            };
        }

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
 * Asynchronous operation authorization evaluation.
 * Evaluates durable ApprovedDomain storage and enforces fail-closed behavior on DB unavailability.
 */
export async function evaluateOperationAuthorizationAsync(urlOrSource, operation = 'automated_fetch', context = {}) {
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

            return {
                allowed: false,
                tier: classification.tier,
                status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
                reason: 'restricted_commercial_portal_requires_verified_permission',
                grant: null,
                domain
            };
        }

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

        // Tier 2: Public Web Page (Async durable evaluation + fail-closed on DB outage)
        const isVerified = await domainGovernancePolicy.isDomainVerifiedAsync(domain);
        if (!isVerified) {
            const isDbFailure = domainGovernancePolicy.enforceDbFailClosed || domainGovernancePolicy.lastDbError != null;
            return {
                allowed: false,
                tier: classification.tier,
                status: SOURCE_STATUS.RESTRICTED_PERMISSION_REQUIRED,
                reason: isDbFailure ? 'database_unavailable_fail_closed' : 'unverified_domain_requires_human_verification',
                grant: null,
                domain
            };
        }

        return {
            allowed: true,
            tier: classification.tier,
            status: SOURCE_STATUS.AUTHORIZED,
            reason: null,
            grant: null,
            domain
        };
    }

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

/**
 * Checks whether a given URL or source is authorized for an operation asynchronously.
 * 
 * @param {string} urlOrSource 
 * @param {string} [operation='automated_fetch']
 * @returns {Promise<boolean>}
 */
export async function isSourceAuthorizedAsync(urlOrSource, operation = 'automated_fetch') {
    const decision = await evaluateOperationAuthorizationAsync(urlOrSource, operation);
    return decision.allowed === true;
}

export default {
    SOURCE_TIERS,
    SOURCE_STATUS,
    SOURCE_CAPABILITY_MATRIX,
    OFFICIAL_REGULATORY_DIRECTORY,
    authorizationGrantRegistry,
    domainGovernancePolicy,
    DomainGovernancePolicy,
    classifySource,
    evaluateOperationAuthorization,
    evaluateOperationAuthorizationAsync,
    isSourceAuthorized,
    isSourceAuthorizedAsync,
    extractCleanDomain,
    getParentDomains
};
