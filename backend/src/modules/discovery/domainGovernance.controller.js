import mongoose from 'mongoose';
import ApprovedDomain from '../../../models/ApprovedDomain.js';
import AuditLog from '../../../models/AuditLog.js';
import { domainGovernancePolicy, extractCleanDomain } from '../../../services/discovery/SourceAuthorizationMatrix.js';

/**
 * Approve a domain for automated web fetching.
 * Route: POST /api/discovery/domains/approve
 * Access: Authenticated Admin / SuperAdmin ONLY
 */
export const approveDomain = async (req, res) => {
    try {
        const { domain, reason, notes } = req.body;
        if (!domain || typeof domain !== 'string') {
            return res.status(400).json({ success: false, message: 'Valid domain is required' });
        }

        const clean = extractCleanDomain(domain);
        if (!clean) {
            return res.status(400).json({ success: false, message: 'Invalid domain format' });
        }

        // STRICT RBAC & Identity Enforcement:
        // Extract operator identity strictly from authenticated req.user — disallow caller spoofing.
        const operatorId = req.user?._id || req.user?.id;
        const operatorEmail = req.user?.email;
        const operatorRole = req.user?.role?.name || req.user?.role || 'Admin';

        if (!operatorId || !operatorEmail) {
            return res.status(401).json({ success: false, message: 'Authenticated operator identity required' });
        }

        const approvalReasonText = reason || notes || 'Operator approved domain';

        // Check previous status for audit history
        let previousStatus = 'unregistered';
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const existing = await ApprovedDomain.findOne({ domain: clean }).lean();
                if (existing) previousStatus = existing.status;
            } catch {}
        } else {
            const existing = domainGovernancePolicy.getDomainRecord(clean);
            if (existing) previousStatus = existing.status;
        }

        // Perform durable registration
        const record = await domainGovernancePolicy.registerDomainDurable({
            domain: clean,
            operatorId,
            operatorEmail,
            operatorRole,
            reason: approvalReasonText,
            notes
        });

        // Ensure durable AuditLog entry exists
        try {
            await AuditLog.create({
                eventType: 'domain_approved',
                actorId: operatorId,
                actorEmail: operatorEmail,
                targetType: 'domain',
                targetName: clean,
                description: `Operator ${operatorEmail} (${operatorRole}) approved domain '${clean}': ${approvalReasonText}`,
                changes: {
                    before: { status: previousStatus },
                    after: { status: 'approved' }
                },
                metadata: { domain: clean, reason: approvalReasonText, operatorRole }
            });
        } catch (auditErr) {
            console.warn('[DomainGovernanceController:AuditLog Error]:', auditErr.message);
        }

        return res.status(200).json({
            success: true,
            message: `Domain '${clean}' successfully approved`,
            data: record
        });
    } catch (error) {
        console.error('[DomainGovernanceController:Approve Error]:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Revoke approval for a domain.
 * Route: POST /api/discovery/domains/revoke
 * Access: Authenticated Admin / SuperAdmin ONLY
 */
export const revokeDomain = async (req, res) => {
    try {
        const { domain, reason } = req.body;
        if (!domain || typeof domain !== 'string') {
            return res.status(400).json({ success: false, message: 'Valid domain is required' });
        }

        const clean = extractCleanDomain(domain);
        if (!clean) {
            return res.status(400).json({ success: false, message: 'Invalid domain format' });
        }

        const operatorId = req.user?._id || req.user?.id;
        const operatorEmail = req.user?.email;
        const operatorRole = req.user?.role?.name || req.user?.role || 'Admin';

        if (!operatorId || !operatorEmail) {
            return res.status(401).json({ success: false, message: 'Authenticated operator identity required' });
        }

        const revocationReasonText = reason || 'Operator revoked domain approval';

        let previousStatus = 'approved';
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                const existing = await ApprovedDomain.findOne({ domain: clean }).lean();
                if (existing) previousStatus = existing.status;
            } catch {}
        } else {
            const existing = domainGovernancePolicy.getDomainRecord(clean);
            if (existing) previousStatus = existing.status;
        }

        const record = await domainGovernancePolicy.revokeDomainDurable({
            domain: clean,
            operatorId,
            operatorEmail,
            operatorRole,
            reason: revocationReasonText
        });

        try {
            await AuditLog.create({
                eventType: 'domain_revoked',
                actorId: operatorId,
                actorEmail: operatorEmail,
                targetType: 'domain',
                targetName: clean,
                description: `Operator ${operatorEmail} (${operatorRole}) revoked domain '${clean}': ${revocationReasonText}`,
                changes: {
                    before: { status: previousStatus },
                    after: { status: 'revoked' }
                },
                metadata: { domain: clean, reason: revocationReasonText, operatorRole }
            });
        } catch (auditErr) {
            console.warn('[DomainGovernanceController:AuditLog Error]:', auditErr.message);
        }

        return res.status(200).json({
            success: true,
            message: `Domain '${clean}' approval successfully revoked`,
            data: record
        });
    } catch (error) {
        console.error('[DomainGovernanceController:Revoke Error]:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * List all managed domains and governance status.
 * Route: GET /api/discovery/domains
 * Access: Authenticated Admin, SuperAdmin, Manager
 */
export const listDomains = async (req, res) => {
    try {
        let domains = [];
        try {
            domains = await ApprovedDomain.find().sort('-updatedAt').lean();
        } catch (dbErr) {
            domains = domainGovernancePolicy.listDomains();
        }
        return res.status(200).json({
            success: true,
            count: domains.length,
            data: domains
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get governance record for a specific domain.
 * Route: GET /api/discovery/domains/:domain
 * Access: Authenticated Admin, SuperAdmin, Manager
 */
export const getDomainDetails = async (req, res) => {
    try {
        const clean = extractCleanDomain(req.params.domain);
        if (!clean) {
            return res.status(400).json({ success: false, message: 'Invalid domain' });
        }

        let record = null;
        try {
            record = await ApprovedDomain.findOne({ domain: clean }).lean();
        } catch (dbErr) {
            record = domainGovernancePolicy.getDomainRecord(clean);
        }

        if (!record) {
            return res.status(404).json({ success: false, message: 'Domain record not found' });
        }

        return res.status(200).json({ success: true, data: record });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
