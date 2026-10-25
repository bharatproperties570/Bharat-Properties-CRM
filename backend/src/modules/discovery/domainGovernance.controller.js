import mongoose from 'mongoose';
import ApprovedDomain from '../../../models/ApprovedDomain.js';
import { domainGovernancePolicy, extractCleanDomain } from '../../../services/discovery/SourceAuthorizationMatrix.js';
import { validateDomainForApproval } from '../../../services/discovery/PublicSuffixList.js';

/**
 * Approve a domain for automated web fetching.
 * Route: POST /api/discovery/domains/approve
 * Access: Authenticated Admin / SuperAdmin ONLY
 */
export const approveDomain = async (req, res) => {
    try {
        const { domain, reason, notes, includeSubdomains } = req.body || {};

        // 1. Validate domain syntax, reject IP literals and Public Suffixes
        const validation = validateDomainForApproval(domain);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.error || 'Invalid domain format'
            });
        }
        const clean = validation.domain;

        // 2. Mandatory non-empty reason
        const reasonText = typeof reason === 'string' ? reason.trim() : '';
        if (!reasonText) {
            return res.status(400).json({
                success: false,
                message: 'Approval reason is required and cannot be empty'
            });
        }

        // 3. STRICT RBAC & Identity Enforcement:
        // Extract operator identity strictly from authenticated req.user — disallow caller spoofing.
        const operatorId = req.user?._id || req.user?.id;
        const operatorEmail = req.user?.email;
        const operatorRole = req.user?.role?.name || req.user?.role || 'Admin';

        if (!operatorId || !operatorEmail) {
            return res.status(401).json({
                success: false,
                message: 'Authenticated operator identity required'
            });
        }

        // 4. Fail-closed if database is disconnected
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                message: 'Database connection unavailable for durable domain approval'
            });
        }

        // 5. Perform durable registration & audit logging atomically
        const record = await domainGovernancePolicy.registerDomainDurable({
            domain: clean,
            operatorId,
            operatorEmail,
            operatorRole,
            reason: reasonText,
            notes: (notes || '').trim(),
            includeSubdomains: Boolean(includeSubdomains)
        });

        return res.status(200).json({
            success: true,
            message: `Domain '${clean}' successfully approved`,
            data: record
        });
    } catch (error) {
        console.error('[DomainGovernanceController:Approve Error]:', error);
        const statusCode = error.message && error.message.includes('unavailable') ? 503 : 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Revoke approval for a domain.
 * Route: POST /api/discovery/domains/revoke
 * Access: Authenticated Admin / SuperAdmin ONLY
 */
export const revokeDomain = async (req, res) => {
    try {
        const { domain, reason } = req.body || {};

        // 1. Validate domain syntax
        const validation = validateDomainForApproval(domain);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.error || 'Invalid domain format'
            });
        }
        const clean = validation.domain;

        // 2. Mandatory non-empty reason
        const reasonText = typeof reason === 'string' ? reason.trim() : '';
        if (!reasonText) {
            return res.status(400).json({
                success: false,
                message: 'Revocation reason is required and cannot be empty'
            });
        }

        // 3. STRICT RBAC & Identity Enforcement
        const operatorId = req.user?._id || req.user?.id;
        const operatorEmail = req.user?.email;
        const operatorRole = req.user?.role?.name || req.user?.role || 'Admin';

        if (!operatorId || !operatorEmail) {
            return res.status(401).json({
                success: false,
                message: 'Authenticated operator identity required'
            });
        }

        // 4. Fail-closed if database is disconnected
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                message: 'Database connection unavailable for durable domain revocation'
            });
        }

        // 5. Perform durable revocation & audit logging atomically
        const record = await domainGovernancePolicy.revokeDomainDurable({
            domain: clean,
            operatorId,
            operatorEmail,
            operatorRole,
            reason: reasonText
        });

        return res.status(200).json({
            success: true,
            message: `Domain '${clean}' approval successfully revoked`,
            data: record
        });
    } catch (error) {
        console.error('[DomainGovernanceController:Revoke Error]:', error);
        const statusCode = error.message && error.message.includes('unavailable') ? 503 : 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * List all managed domains and governance status.
 * Route: GET /api/discovery/domains
 * Access: Authenticated Admin, SuperAdmin, Manager
 */
export const listDomains = async (req, res) => {
    try {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                message: 'Database connection unavailable'
            });
        }

        const domains = await ApprovedDomain.find().sort('-updatedAt').lean();
        return res.status(200).json({
            success: true,
            count: domains.length,
            data: domains
        });
    } catch (error) {
        console.error('[DomainGovernanceController:List Error]:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get governance record for a specific domain.
 * Route: GET /api/discovery/domains/:domain
 * Access: Authenticated Admin, SuperAdmin, Manager
 */
export const getDomainDetails = async (req, res) => {
    try {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                message: 'Database connection unavailable'
            });
        }

        const clean = extractCleanDomain(req.params.domain);
        if (!clean) {
            return res.status(400).json({
                success: false,
                message: 'Invalid domain'
            });
        }

        const record = await ApprovedDomain.findOne({ domain: clean }).lean();
        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Domain record not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: record
        });
    } catch (error) {
        console.error('[DomainGovernanceController:GetDetails Error]:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
