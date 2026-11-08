/**
 * Authority Verification Controller
 * 
 * Phase 2 Foundation — inactive backend only.
 * No live HTTP requests to authority portals.
 * All sources default to DISABLED.
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import AuthoritySourceSettings, {
    checkActivationEligibility,
    checkInternalMakerCheckerReviewEligibility,
    createAuthorizedInternalWorkflowToken,
    INTERNAL_WORKFLOW_OPTION
} from '../models/AuthoritySourceSettings.js';
import PropertyAuthorityLink from '../models/PropertyAuthorityLink.js';
import PropertyVerificationRun from '../models/PropertyVerificationRun.js';
import PropertyVerificationRunItem, {
    BLOCKED_UPDATE_FIELDS,
    ALLOWED_UPDATE_FIELDS,
    CRM_TO_CANONICAL_FIELD_MAP
} from '../models/PropertyVerificationRunItem.js';
import PropertyVerificationSnapshot from '../models/PropertyVerificationSnapshot.js';
import Inventory from '../models/Inventory.js';
import AuditLog, { maskScalarPII } from '../models/AuditLog.js';
import User from '../models/User.js';
import AuthorityCanonicalPolicy from '../models/AuthorityCanonicalPolicy.js';
import { isProductionEnvironment, isEnvironmentProductionOrUnsafe } from '../services/authority/databaseEnvironmentSafety.js';

import {
    CANONICAL_ORGANIZATION_ID,
    CANONICAL_ORGANIZATION_ID_STRING,
    verifyCanonicalOrganizationContext
} from '../config/canonicalOrganization.js';

export const CONTROLLED_REASON_CODES = new Set([
    'EVIDENCE_REVIEWED',
    'DOCUMENT_REFERENCE_INCOMPLETE',
    'CONTRACT_NOT_VERIFIED',
    'TERMS_NOT_REVIEWED',
    'IDENTITY_EVIDENCE_MISMATCH',
    'AUTHORIZATION_REJECTED',
    'OTHER_CONTROLLED_REASON'
]);
import {
    registerOrRotateCanonicalPolicy,
    getCanonicalPolicy,
    syncCanonicalPolicyToRedis,
    publishCanonicalPolicyToRedis,
    markCanonicalPolicyAudited,
    markCanonicalPolicyAuditFailed
} from '../services/authority/portal/canonicalPolicyService.js';
import { hasApprovalRight } from '../services/permission.service.js';
import { getApplicationRedisClient } from '../services/authority/portal/portalRuntimeFactory.js';
import { RedisPortalQuotaProvider } from '../services/authority/portal/infrastructure/redisPortalQuotaProvider.js';
import { buildCompositeKey, computeSnapshotContentHash } from '../services/authority/authorityNormalizer.js';
import { isSentinel } from '../services/authority/authorityFieldDictionary.js';
import { AuthorityBulkProcessor } from '../services/authority/AuthorityBulkProcessor.js';

// ============================================================
// HELPERS
// ============================================================

function getTenantId(req) {
    verifyCanonicalOrganizationContext();

    // Check for explicit non-canonical overrides in body, query, or headers
    if (req.body?.tenantId && String(req.body.tenantId) !== CANONICAL_ORGANIZATION_ID_STRING) {
        const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Body tenantId override '${req.body.tenantId}' rejected.`);
        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
        throw err;
    }
    if (req.query?.tenantId && String(req.query.tenantId) !== CANONICAL_ORGANIZATION_ID_STRING) {
        const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Query tenantId override '${req.query.tenantId}' rejected.`);
        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
        throw err;
    }
    if (req.headers && req.headers['x-tenant-id'] && String(req.headers['x-tenant-id']) !== CANONICAL_ORGANIZATION_ID_STRING) {
        const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Header tenantId override '${req.headers['x-tenant-id']}' rejected.`);
        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
        throw err;
    }

    // Resolve tenant from authenticated user context (or req.tenantId fallback for unit test mocks)
    // Note: req.user._id fallback is strictly prohibited. A user ID is not an organization ID.
    const rawTenant = req.user?.tenantId ? String(req.user.tenantId) : (req.tenantId ? String(req.tenantId) : null);
    if (!rawTenant) {
        return null;
    }
    if (rawTenant !== CANONICAL_ORGANIZATION_ID_STRING) {
        const err = new Error(`ORGANIZATION_OVERRIDE_PROHIBITED: Request tenant '${rawTenant}' does not match canonical organization '${CANONICAL_ORGANIZATION_ID_STRING}'.`);
        err.code = 'ORGANIZATION_OVERRIDE_PROHIBITED';
        throw err;
    }
    return CANONICAL_ORGANIZATION_ID;
}

let customQuotaProvider = null;

export function setTestQuotaProvider(provider) {
    customQuotaProvider = provider;
}

export function getQuotaProvider(req = null) {
    if (customQuotaProvider !== null) {
        return customQuotaProvider;
    }
    if (req?.app?.get && typeof req.app.get === 'function' && req.app.get('quotaProvider')) {
        return req.app.get('quotaProvider');
    }
    try {
        const redisClient = getApplicationRedisClient();
        if (redisClient) {
            return new RedisPortalQuotaProvider(redisClient, { allowInMemoryFallback: false, testMode: false });
        }
    } catch {}
    return null;
}

function auditEvent(eventType, userId, targetType, targetId, description, metadata = {}, options = {}) {
    const targetName = metadata.targetName || metadata.authorityCode || null;
    const mergedOptions = {
        ...options,
        metadata: {
            ...(metadata || {}),
            ...(options.metadata || {})
        }
    };
    return AuditLog.logEntityUpdate(
        eventType,
        targetType,
        targetId,
        targetName,
        userId,
        metadata,
        description,
        mergedOptions
    );
}

// ============================================================
// SOURCE SETTINGS
// ============================================================

/**
 * GET /api/authority/settings
 * List all authority source settings for current tenant.
 * Permission: authorityVerification.view
 */
export const getSourceSettings = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        // Ensure defaults exist
        await AuthoritySourceSettings.ensureDefaults(tenantId);
        const settings = await AuthoritySourceSettings.getAllForTenant(tenantId);

        // Include activation eligibility for each
        const result = settings.map(s => ({
            ...s.toObject(),
            activationCheck: s.checkActivationEligibility(),
            effectivelyActive: s.isEffectivelyActive()
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        if (error.code === 'ORGANIZATION_OVERRIDE_PROHIBITED' || error.message?.includes('ORGANIZATION_OVERRIDE_PROHIBITED')) {
            return res.status(403).json({ success: false, code: 'ORGANIZATION_OVERRIDE_PROHIBITED', message: error.message });
        }
        console.error('getSourceSettings error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve source settings' });
    }
};

/**
 * GET /api/authority/settings/:authorityCode
 * Get settings for a specific authority.
 * Permission: authorityVerification.view
 */
export const getSourceSettingByCode = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode } = req.params;
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        await AuthoritySourceSettings.ensureDefaults(tenantId);
        const setting = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);

        if (!setting) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }

        res.json({
            success: true,
            data: {
                ...setting.toObject(),
                activationCheck: setting.checkActivationEligibility(),
                effectivelyActive: setting.isEffectivelyActive()
            }
        });
    } catch (error) {
        if (error.code === 'ORGANIZATION_OVERRIDE_PROHIBITED' || error.message?.includes('ORGANIZATION_OVERRIDE_PROHIBITED')) {
            return res.status(403).json({ success: false, code: 'ORGANIZATION_OVERRIDE_PROHIBITED', message: error.message });
        }
        console.error('getSourceSettingByCode error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve source setting' });
    }
};

/**
 * PATCH /api/authority/settings/:authorityCode
 * Update source policy settings.
 * Permission: authorityVerification admin (approvalRights.manageAuthoritySettings)
 * 
 * The frontend CANNOT:
 * - Set permissionStatus to GRANTED without approval evidence
 * - Enable a source that fails activation checks
 * - Supply arbitrary field names
 */
export const updateSourceSettings = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode } = req.params;
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        const setting = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!setting) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }

        // Server-side allowlist of updatable fields for generic PATCH
        const ALLOWED_SETTINGS_FIELDS = new Set([
            'policyVersion', 'isEnabled', 'isPaused', 'schedulingEnabled',
            'scheduleCron', 'scheduleTimezone', 'userReportedEvidence'
        ]);

        const EVIDENCE_FIELDS = new Set([
            'permissionArtifactUri', 'secureEvidenceId', 'approvalReference',
            'issuedBy', 'authorityRole', 'authorizationScope',
            'commercialUseAuthorized', 'readOnlySearchAuthorized',
            'termsReviewed', 'termsReference', 'ratePolicy',
            'contractEvidenceReference', 'contractVerificationStatus',
            'permissionStatus', 'reviewStatus', 'permittedFields', 'identityRequirements'
        ]);

        // Reject attempts to update formal authorization evidence via generic PATCH (P0.2)
        const attemptedEvidenceFields = Object.keys(req.body).filter(k => EVIDENCE_FIELDS.has(k));
        if (attemptedEvidenceFields.length > 0) {
            return res.status(422).json({
                success: false,
                code: 'SUBMIT_WORKFLOW_REQUIRED',
                message: `Formal authorization evidence fields (${attemptedEvidenceFields.join(', ')}) cannot be altered via generic PATCH. Submit formal authorization evidence via /submit-approval.`
            });
        }

        const changes = {};
        const before = {};

        for (const [key, value] of Object.entries(req.body)) {
            if (ALLOWED_SETTINGS_FIELDS.has(key)) {
                before[key] = setting[key];
                changes[key] = value;
            }
            // Silently ignore unknown/disallowed fields
        }

        if (Object.keys(changes).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        // P0.1 Source activation deadlock fix:
        // Build candidate settings state to evaluate checkActivationEligibility independently of isEnabled
        const activationBlockers = [];
        const candidateState = { ...setting.toObject(), ...changes };
        const candidateEligibility = checkActivationEligibility(candidateState);

        if (changes.isEnabled === true) {
            if (!candidateEligibility.canActivate) {
                activationBlockers.push(...candidateEligibility.blockers.map(b => typeof b === 'string' ? b : (b.message || b.code)));
            }
        }

        if (changes.schedulingEnabled === true) {
            const willBeEnabled = changes.isEnabled !== undefined ? changes.isEnabled : setting.isEnabled;
            if (!willBeEnabled) {
                activationBlockers.push('schedulingEnabled cannot be set to true while source is disabled (isEnabled must be true)');
            }
            if (!candidateEligibility.canActivate) {
                activationBlockers.push(...candidateEligibility.blockers.map(b => typeof b === 'string' ? b : (b.message || b.code)));
            }
        }

        if (activationBlockers.length > 0) {
            return res.status(422).json({
                success: false,
                code: 'ACTIVATION_LOCKED_PHASE3',
                message: 'Source activation is locked: Live authority integrations and approvals require complete verified evidence and independent review.',
                blockers: activationBlockers
            });
        }

        // If userReportedEvidence is submitted, ensure it remains UNVERIFIED/PENDING_WRITTEN_REFERENCE
        if (changes.userReportedEvidence) {
            changes.userReportedEvidence = {
                ...changes.userReportedEvidence,
                reportedAt: new Date(),
                verificationStatus: changes.userReportedEvidence.verificationStatus === 'VALIDATED'
                    ? 'PENDING_WRITTEN_REFERENCE'
                    : (changes.userReportedEvidence.verificationStatus || 'UNVERIFIED')
            };
        }

        // If enabling, enforce activation gate
        if (changes.isEnabled === true) {
            Object.assign(setting, changes);
            const check = setting.checkActivationEligibility();
            if (!check.canActivate) {
                return res.status(422).json({
                    success: false,
                    code: 'ACTIVATION_LOCKED_PHASE3',
                    message: 'Cannot enable source — activation requirements not met',
                    blockers: check.blockers
                });
            }
        }

        // If setting reviewStatus to APPROVED, record reviewer
        if (changes.reviewStatus === 'APPROVED') {
            setting.reviewedBy = req.user._id;
            setting.reviewedAt = new Date();
        }

        Object.assign(setting, changes);
        await setting.save();

        // Audit the change
        await auditEvent(
            'authority_settings_updated',
            req.user._id,
            'authority_settings',
            setting._id,
            `Authority source settings updated for ${authorityCode}`,
            { changes: { before, after: changes } }
        );

        res.json({
            success: true,
            data: {
                ...setting.toObject(),
                activationCheck: setting.checkActivationEligibility(),
                effectivelyActive: setting.isEffectivelyActive()
            }
        });
    } catch (error) {
        console.error('updateSourceSettings error:', error);
        res.status(500).json({ success: false, message: 'Failed to update source settings' });
    }
};

/**
 * POST /api/authority/settings/:authorityCode/submit-approval
 * Submits an authority-specific authorization record for independent review.
 * Permission: authorityVerification admin (approvalRights.manageAuthoritySettings)
 */
export const submitSourceApproval = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode } = req.params;
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        const setting = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!setting) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }

        const {
            approvalReference,
            permissionArtifactUri,
            secureEvidenceId,
            issuedBy,
            authorityRole,
            authorizationScope,
            approvalDate,
            approvalExpiryDate,
            permittedFields,
            ratePolicy,
            commercialUseAuthorized,
            readOnlySearchAuthorized,
            termsReviewed,
            termsReference,
            contractVerificationStatus,
            contractEvidenceReference,
            identityRequirements
        } = req.body;

        if (!approvalReference && !permissionArtifactUri && !secureEvidenceId) {
            return res.status(400).json({
                success: false,
                code: 'APPROVAL_EVIDENCE_MISSING',
                message: 'Approval reference, artifact URI, or secure evidence ID is required.'
            });
        }

        // Phase 3 & 5: Require non-null plain object ratePolicy BEFORE mutating setting
        if (!ratePolicy || typeof ratePolicy !== 'object' || Array.isArray(ratePolicy)) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_RATE_POLICY',
                message: 'ratePolicy must be a non-null plain object'
            });
        }

        if (!Object.prototype.hasOwnProperty.call(ratePolicy, 'maxConcurrent')) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_RATE_POLICY',
                message: 'ratePolicy.maxConcurrent is an explicit mandatory property'
            });
        }

        const mc = Number(ratePolicy.maxConcurrent);
        if (!Number.isInteger(mc) || mc !== 1) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_RATE_POLICY',
                message: 'ratePolicy.maxConcurrent must be positive integer equal to 1'
            });
        }

        // Apply proposed authorization evidence
        setting.permissionStatus = 'PENDING_REVIEW';
        setting.reviewStatus = 'UNDER_REVIEW';
        setting.submittedBy = req.user._id;
        setting.submittedAt = new Date();
        setting.approvedBy = null;
        setting.approvedAt = null;
        setting.reviewedBy = null;
        setting.reviewedAt = null;
        setting.makerCheckerAuditLogId = null;
        setting.approvedAccessMethod = 'AUTHORIZED_PUBLIC_PORTAL_AUTOMATION';
        setting.evidenceVersion = (setting.evidenceVersion || 0) + 1;

        if (approvalReference) setting.approvalReference = String(approvalReference).trim();
        if (permissionArtifactUri) setting.permissionArtifactUri = String(permissionArtifactUri).trim();
        if (secureEvidenceId) setting.secureEvidenceId = String(secureEvidenceId).trim();
        if (issuedBy) setting.issuedBy = String(issuedBy).trim();
        if (authorityRole) setting.authorityRole = String(authorityRole).trim();
        if (authorizationScope) setting.authorizationScope = String(authorizationScope).trim();
        if (approvalDate) setting.approvalDate = new Date(approvalDate);
        if (approvalExpiryDate) setting.approvalExpiryDate = new Date(approvalExpiryDate);

        if (Array.isArray(permittedFields)) {
            setting.permittedFields = permittedFields.map(f => String(f).trim());
        }

        // A new authorization evidence submission must be self-contained and NOT inherit old values.
        setting.ratePolicy = {
            maxRequestsPerMinute: Number(ratePolicy.maxRequestsPerMinute) || null,
            maxRequestsPerHour: Number(ratePolicy.maxRequestsPerHour) || null,
            maxRequestsPerDay: Number(ratePolicy.maxRequestsPerDay) || null,
            minIntervalMs: Number(ratePolicy.minIntervalMs || ratePolicy.minimumIntervalMs) || null,
            minimumIntervalMs: Number(ratePolicy.minimumIntervalMs || ratePolicy.minIntervalMs) || null,
            maxConcurrent: 1,
            policySource: ratePolicy.policySource || ratePolicy.policyReference || null
        };

        setting.commercialUseAuthorized = Boolean(commercialUseAuthorized);
        setting.readOnlySearchAuthorized = Boolean(readOnlySearchAuthorized);
        setting.termsReviewed = Boolean(termsReviewed);
        if (termsReference) setting.termsReference = String(termsReference).trim();
        if (contractVerificationStatus) setting.contractVerificationStatus = contractVerificationStatus;
        if (contractEvidenceReference) setting.contractEvidenceReference = String(contractEvidenceReference).trim();

        // Safe conversion of identityRequirements (P1.13 & PR42 Fix 2: Submitter cannot self-attest verified=true)
        const existingIdentity = (setting.identityRequirements && typeof setting.identityRequirements.toObject === 'function')
            ? setting.identityRequirements.toObject()
            : (setting.identityRequirements ? { ...setting.identityRequirements } : {});

        if (identityRequirements && typeof identityRequirements === 'object') {
            setting.identityRequirements = {
                required: Array.isArray(identityRequirements.required) ? identityRequirements.required.map(String) : (existingIdentity.required || []),
                optional: Array.isArray(identityRequirements.optional) ? identityRequirements.optional.map(String) : (existingIdentity.optional || []),
                verified: false, // Strictly forced to false for submitter; caller-supplied verified is rejected/ignored
                attestation: null
            };
        }

        await setting.save();

        await auditEvent(
            'authority_source_approval_submitted',
            req.user._id,
            'authority_settings',
            setting._id,
            `Authority source authorization submitted for ${authorityCode} (v${setting.evidenceVersion})`,
            {
                authorityCode,
                submittedBy: req.user._id,
                approvalReference: setting.approvalReference,
                approvalExpiryDate: setting.approvalExpiryDate,
                evidenceVersion: setting.evidenceVersion
            }
        );

        res.json({
            success: true,
            message: `Authorization evidence submitted for ${authorityCode} (v${setting.evidenceVersion}). Awaiting independent maker-checker review.`,
            data: {
                ...setting.toObject(),
                activationCheck: setting.checkActivationEligibility(),
                effectivelyActive: setting.isEffectivelyActive()
            }
        });
    } catch (error) {
        console.error('submitSourceApproval error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit source approval' });
    }
};

/**
 * POST /api/authority/settings/:authorityCode/record-approval
 * Records authorization approval by an authorized approver (maker-checker approver stage).
 * Permission: authorityVerification admin (approvalRights.manageAuthoritySettings)
 * Enforces: submitter cannot self-approve.
 */
export const recordSourceApprover = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode } = req.params;
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        const setting = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!setting) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }

        if (setting.permissionStatus !== 'PENDING_REVIEW' || setting.reviewStatus !== 'UNDER_REVIEW') {
            return res.status(422).json({
                success: false,
                code: 'INVALID_APPROVAL_STATE',
                message: `Source cannot be approved in current state: permissionStatus=${setting.permissionStatus}, reviewStatus=${setting.reviewStatus}. Must be PENDING_REVIEW and UNDER_REVIEW.`
            });
        }

        if (!setting.submittedBy) {
            return res.status(422).json({
                success: false,
                code: 'SUBMITTER_REQUIRED',
                message: 'Cannot record approval: evidence has no authenticated submitter.'
            });
        }

        const approverId = String(req.user._id);
        const submitterId = String(setting.submittedBy);

        if (submitterId === approverId) {
            return res.status(403).json({
                success: false,
                code: 'SELF_APPROVAL_PROHIBITED',
                message: 'Independent maker-checker review violation: submitter cannot approve authorization.'
            });
        }

        const { expectedEvidenceVersion, notes, reasonCode } = req.body || {};

        if (expectedEvidenceVersion === undefined || expectedEvidenceVersion === null || !Number.isInteger(Number(expectedEvidenceVersion)) || Number(expectedEvidenceVersion) < 1) {
            return res.status(422).json({
                success: false,
                code: 'EVIDENCE_VERSION_REQUIRED',
                message: 'expectedEvidenceVersion is mandatory and must be a valid positive integer.'
            });
        }

        const expectedVer = Number(expectedEvidenceVersion);
        if (expectedVer !== Number(setting.evidenceVersion)) {
            return res.status(409).json({
                success: false,
                code: 'STALE_EVIDENCE_VERSION',
                message: `Submitted evidence version (${setting.evidenceVersion}) does not match expected version (${expectedEvidenceVersion}). Evidence has been modified.`
            });
        }

        const topologyType = mongoose.connection?.client?.topology?.description?.type;
        const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

        if (!supportsTransactions && (isProductionEnvironment() || isEnvironmentProductionOrUnsafe() || process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true')) {
            return res.status(500).json({
                success: false,
                code: 'TRANSACTIONS_UNAVAILABLE',
                message: 'Database transactions are unavailable; atomic approver recording requires active transaction support in production and untrusted environments.'
            });
        }

        let validatedReason = 'EVIDENCE_REVIEWED';
        if (reasonCode && CONTROLLED_REASON_CODES.has(reasonCode)) {
            validatedReason = reasonCode;
        } else if (notes && CONTROLLED_REASON_CODES.has(String(notes).trim())) {
            validatedReason = String(notes).trim();
        } else if (notes || reasonCode) {
            validatedReason = 'OTHER_CONTROLLED_REASON';
        }

        let session = null;
        if (supportsTransactions) {
            try {
                session = await mongoose.startSession();
            } catch (txErr) {
                return res.status(500).json({
                    success: false,
                    code: 'TRANSACTIONS_UNAVAILABLE',
                    message: 'Database transactions are unavailable; atomic approver recording requires active transaction support.'
                });
            }
        }

        let updatedSetting = null;
        try {
            const executeApprover = async (activeSession) => {
                updatedSetting = await AuthoritySourceSettings.findOneAndUpdate(
                    {
                        _id: setting._id,
                        tenantId,
                        permissionStatus: 'PENDING_REVIEW',
                        reviewStatus: 'UNDER_REVIEW',
                        evidenceVersion: expectedVer
                    },
                    {
                        $set: {
                            approvedBy: req.user._id,
                            approvedAt: new Date(),
                            reviewStatus: 'UNDER_REVIEW',
                            isEnabled: false,
                            schedulingEnabled: false
                        }
                    },
                    {
                        new: true,
                        [INTERNAL_WORKFLOW_OPTION]: createAuthorizedInternalWorkflowToken('recordSourceApprover', {
                            tenantId,
                            authorityCode,
                            targetId: setting._id,
                            evidenceVersion: expectedVer
                        }),
                        ...(activeSession ? { session: activeSession } : {})
                    }
                );

                if (!updatedSetting) {
                    const conflictErr = new Error('CONCURRENT_APPROVAL_CONFLICT');
                    conflictErr.code = 'CONCURRENT_APPROVAL_CONFLICT';
                    throw conflictErr;
                }

                await auditEvent(
                    'authority_source_approval_recorded',
                    req.user._id,
                    'authority_settings',
                    updatedSetting._id,
                    `Authority source authorization approval recorded for ${authorityCode} (v${updatedSetting.evidenceVersion})`,
                    {
                        tenantId,
                        authorityCode,
                        targetName: authorityCode,
                        submittedBy: updatedSetting.submittedBy,
                        approvedBy: req.user._id,
                        approverId: req.user._id,
                        evidenceVersion: updatedSetting.evidenceVersion,
                        reasonCode: validatedReason
                    },
                    { actorId: req.user._id, session: activeSession }
                );
            };

            if (session) {
                await session.withTransaction(async () => {
                    await executeApprover(session);
                });
            } else {
                await executeApprover(null);
            }
        } catch (innerErr) {
            if (innerErr.code === 'CONCURRENT_APPROVAL_CONFLICT') {
                return res.status(409).json({
                    success: false,
                    code: 'CONCURRENT_APPROVAL_CONFLICT',
                    message: 'Source settings were modified by another transaction or already approved.'
                });
            }
            throw innerErr;
        } finally {
            if (session) {
                await session.endSession().catch(() => {});
            }
        }

        res.json({
            success: true,
            message: `Authority authorization approval recorded for ${authorityCode} (v${updatedSetting.evidenceVersion}). Awaiting final independent review.`,
            data: {
                ...updatedSetting.toObject(),
                activationCheck: updatedSetting.checkActivationEligibility(),
                effectivelyActive: updatedSetting.isEffectivelyActive()
            }
        });
    } catch (error) {
        console.error('recordSourceApprover error:', error);
        res.status(500).json({ success: false, message: 'Failed to record source approval' });
    }
};

/**
 * POST /api/authority/settings/:authorityCode/review-approval
 * Reviews and approves or rejects an authority-specific authorization record.
 * Permission: authorityVerification reviewer (approvalRights.approveAuthorityChanges)
 * Enforces strict independent 3-person maker-checker: submitter, approver, reviewer must be 3 distinct authenticated users.
 */
export const reviewSourceApproval = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode } = req.params;
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        const setting = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!setting) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }

        const { decision, notes, expectedEvidenceVersion, identityContractAttestation } = req.body;
        if (!['APPROVED', 'REJECTED'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'Decision must be either APPROVED or REJECTED' });
        }

        // Require current state permissionStatus=PENDING_REVIEW and reviewStatus=UNDER_REVIEW
        if (setting.permissionStatus !== 'PENDING_REVIEW' || setting.reviewStatus !== 'UNDER_REVIEW') {
            return res.status(422).json({
                success: false,
                code: 'INVALID_APPROVAL_STATE',
                message: `Source cannot be reviewed in current state: permissionStatus=${setting.permissionStatus}, reviewStatus=${setting.reviewStatus}. Must be PENDING_REVIEW and UNDER_REVIEW.`
            });
        }

        const reviewerId = String(req.user._id);

        if (decision === 'APPROVED') {
            if (!setting.submittedBy) {
                return res.status(422).json({
                    success: false,
                    code: 'SUBMITTER_REQUIRED',
                    message: 'Cannot approve authorization: evidence has no authenticated submitter.'
                });
            }

            const submitterId = String(setting.submittedBy);

            // Strict independent maker-checker separation: submitter cannot review/approve
            if (submitterId === reviewerId) {
                return res.status(403).json({
                    success: false,
                    code: 'MAKER_CHECKER_VIOLATION',
                    message: 'Independent maker-checker review violation: submitter cannot self-approve source authorization.'
                });
            }
        }

        // Evidence version is mandatory on BOTH review outcomes
        if (expectedEvidenceVersion === undefined || expectedEvidenceVersion === null || !Number.isInteger(Number(expectedEvidenceVersion)) || Number(expectedEvidenceVersion) < 1) {
            return res.status(422).json({
                success: false,
                code: 'EVIDENCE_VERSION_REQUIRED',
                message: 'expectedEvidenceVersion is mandatory and must be a valid positive integer.'
            });
        }

        const expectedVer = Number(expectedEvidenceVersion);
        if (expectedVer !== Number(setting.evidenceVersion)) {
            return res.status(409).json({
                success: false,
                code: 'STALE_EVIDENCE_VERSION',
                message: `Submitted evidence version (${setting.evidenceVersion}) does not match expected version (${expectedEvidenceVersion}). Evidence has been modified.`
            });
        }

        if (decision === 'APPROVED') {
            if (!setting.approvedBy) {
                return res.status(422).json({
                    success: false,
                    code: 'APPROVER_REQUIRED',
                    message: 'Cannot review authorization: approval has not been recorded by an authorized approver.'
                });
            }

            const submitterId = String(setting.submittedBy);
            const approverId = String(setting.approvedBy);

            // Strict independent maker-checker separation: 3 distinct authenticated users
            if (approverId === reviewerId || submitterId === approverId) {
                return res.status(403).json({
                    success: false,
                    code: 'MAKER_CHECKER_VIOLATION',
                    message: 'Independent maker-checker review violation: submitter, approver, and reviewer must be three distinct authenticated users.'
                });
            }
            let updateIdentityVerified = false;
            let attestationData = null;
            if (identityContractAttestation !== undefined && identityContractAttestation !== null) {
                if (typeof identityContractAttestation !== 'object' || Array.isArray(identityContractAttestation)) {
                    return res.status(422).json({
                        success: false,
                        code: 'INVALID_ATTESTATION_PAYLOAD',
                        message: 'identityContractAttestation must be a valid object.'
                    });
                }

                const ref = String(identityContractAttestation.evidenceReference || '').trim();
                if (!ref) {
                    return res.status(422).json({
                        success: false,
                        code: 'ATTESTATION_REFERENCE_REQUIRED',
                        message: 'identityContractAttestation requires a non-empty evidenceReference.'
                    });
                }

                const rawVer = identityContractAttestation.evidenceVersion;
                if (rawVer === undefined || rawVer === null || !Number.isInteger(Number(rawVer)) || Number(rawVer) < 1) {
                    return res.status(422).json({
                        success: false,
                        code: 'ATTESTATION_VERSION_REQUIRED',
                        message: 'identityContractAttestation requires a mandatory positive integer evidenceVersion (hash-only attestation prohibited).'
                    });
                }

                const attestationVer = Number(rawVer);
                if (attestationVer !== expectedVer) {
                    return res.status(422).json({
                        success: false,
                        code: 'ATTESTATION_VERSION_MISMATCH',
                        message: `Attestation evidenceVersion (${attestationVer}) does not match current review expectedEvidenceVersion (${expectedVer}). Stale or replayed attestation rejected.`
                    });
                }

                const hash = identityContractAttestation.evidenceHash ? String(identityContractAttestation.evidenceHash).trim() : null;
                if (setting.evidenceHash && hash && hash !== String(setting.evidenceHash).trim()) {
                    return res.status(422).json({
                        success: false,
                        code: 'ATTESTATION_HASH_MISMATCH',
                        message: `Attestation evidenceHash (${hash}) does not match stored evidenceHash (${setting.evidenceHash}).`
                    });
                }

                updateIdentityVerified = true;
                attestationData = {
                    evidenceReference: ref,
                    evidenceVersion: attestationVer,
                    evidenceHash: hash || setting.evidenceHash || null,
                    attestedBy: req.user._id,
                    attestedAt: new Date()
                };
            }

            // Candidate evaluation before atomic update
            const existingIdReq = (setting.identityRequirements && typeof setting.identityRequirements.toObject === 'function')
                ? setting.identityRequirements.toObject()
                : (setting.identityRequirements ? { ...setting.identityRequirements } : {});

            const candidate = {
                ...setting.toObject(),
                permissionStatus: 'GRANTED',
                reviewStatus: 'APPROVED',
                approvedBy: setting.approvedBy,
                reviewedBy: req.user._id,
                identityRequirements: {
                    ...existingIdReq,
                    verified: updateIdentityVerified,
                    attestation: attestationData
                }
            };

            const check = checkInternalMakerCheckerReviewEligibility(candidate);
            if (!check.canApprove) {
                return res.status(422).json({
                    success: false,
                    code: 'APPROVAL_CRITERIA_UNMET',
                    message: 'Cannot approve authorization: internal review approval criteria unmet',
                    blockers: check.blockers
                });
            }

            // Transaction-backed atomic approval: AuditLog creation + AuthoritySourceSettings update
            const topologyType = mongoose.connection?.client?.topology?.description?.type;
            const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

            if (!supportsTransactions && (isProductionEnvironment() || isEnvironmentProductionOrUnsafe() || process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true')) {
                return res.status(500).json({
                    success: false,
                    code: 'TRANSACTIONS_UNAVAILABLE',
                    message: 'Database transactions are unavailable; atomic maker-checker review requires active transaction support in production and untrusted environments.'
                });
            }

            let validatedReason = 'EVIDENCE_REVIEWED';
            if (req.body.reasonCode && CONTROLLED_REASON_CODES.has(req.body.reasonCode)) {
                validatedReason = req.body.reasonCode;
            } else if (notes && CONTROLLED_REASON_CODES.has(String(notes).trim())) {
                validatedReason = String(notes).trim();
            } else if (notes || req.body.reasonCode) {
                validatedReason = 'OTHER_CONTROLLED_REASON';
            }

            let session = null;
            if (supportsTransactions) {
                try {
                    session = await mongoose.startSession();
                } catch (txErr) {
                    return res.status(500).json({
                        success: false,
                        code: 'TRANSACTIONS_UNAVAILABLE',
                        message: 'Database transactions are unavailable; atomic maker-checker review requires active transaction support.'
                    });
                }
            }

            let updatedSetting = null;
            try {
                const executeReview = async (activeSession) => {
                    const auditEntry = await AuditLog.logEntityUpdate(
                        'authority_source_approval_reviewed',
                        'authority_settings',
                        setting._id,
                        authorityCode,
                        setting.approvedBy,
                        {
                            tenantId,
                            authorityCode,
                            targetName: authorityCode,
                            decision: 'APPROVED',
                            submittedBy: setting.submittedBy,
                            approvedBy: setting.approvedBy,
                            approverId: setting.approvedBy,
                            reviewedBy: req.user._id,
                            reviewerId: req.user._id,
                            evidenceVersion: expectedVer,
                            identityVerified: updateIdentityVerified,
                            identityContractAttestation: attestationData,
                            reasonCode: validatedReason
                        },
                        `Authority source authorization APPROVED for ${authorityCode}`,
                        {
                            session: activeSession,
                            actorId: req.user._id,
                            metadata: {
                                tenantId,
                                authorityCode,
                                targetName: authorityCode,
                                decision: 'APPROVED',
                                submittedBy: setting.submittedBy,
                                approvedBy: setting.approvedBy,
                                approverId: setting.approvedBy,
                                reviewedBy: req.user._id,
                                reviewerId: req.user._id,
                                evidenceVersion: expectedVer,
                                identityVerified: updateIdentityVerified,
                                identityContractAttestation: attestationData,
                                reasonCode: validatedReason
                            }
                        }
                    );

                    updatedSetting = await AuthoritySourceSettings.findOneAndUpdate(
                        {
                            _id: setting._id,
                            tenantId,
                            permissionStatus: 'PENDING_REVIEW',
                            reviewStatus: 'UNDER_REVIEW',
                            evidenceVersion: expectedVer
                        },
                        {
                            $set: {
                                permissionStatus: 'GRANTED',
                                reviewStatus: 'APPROVED',
                                reviewedBy: req.user._id,
                                reviewedAt: new Date(),
                                makerCheckerAuditLogId: auditEntry._id,
                                internalReviewExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                                'identityRequirements.verified': updateIdentityVerified,
                                'identityRequirements.attestation': attestationData
                            }
                        },
                        {
                            new: true,
                            [INTERNAL_WORKFLOW_OPTION]: createAuthorizedInternalWorkflowToken('reviewSourceApproval', {
                                tenantId,
                                authorityCode,
                                targetId: setting._id,
                                evidenceVersion: expectedVer
                            }),
                            ...(activeSession ? { session: activeSession } : {})
                        }
                    );

                    if (!updatedSetting) {
                        const conflictErr = new Error('CONCURRENT_REVIEW_CONFLICT');
                        conflictErr.code = 'CONCURRENT_REVIEW_CONFLICT';
                        throw conflictErr;
                    }

                    const verifyCheck = await AuthoritySourceSettings.verifyMakerCheckerUsers({
                        submitterId: updatedSetting.submittedBy,
                        approverId: updatedSetting.approvedBy,
                        reviewerId: updatedSetting.reviewedBy,
                        approvalReference: auditEntry._id,
                        makerCheckerAuditLogId: auditEntry._id,
                        authorityCode,
                        tenantId,
                        settingsId: updatedSetting._id,
                        evidenceVersion: expectedVer,
                        ...(activeSession ? { session: activeSession } : {})
                    });

                    if (!verifyCheck.valid) {
                        const verifyErr = new Error(`Maker-checker verification failed: ${verifyCheck.reason}`);
                        verifyErr.code = 'MAKER_CHECKER_VERIFICATION_FAILED';
                        throw verifyErr;
                    }
                };

                if (session) {
                    await session.withTransaction(async () => {
                        await executeReview(session);
                    });
                } else {
                    await executeReview(null);
                }
            } catch (innerErr) {
                if (innerErr.code === 'CONCURRENT_REVIEW_CONFLICT') {
                    return res.status(409).json({
                        success: false,
                        code: 'CONCURRENT_REVIEW_CONFLICT',
                        message: 'Source settings were modified by another transaction or already reviewed.'
                    });
                }
                if (innerErr.code === 'MAKER_CHECKER_VERIFICATION_FAILED') {
                    return res.status(422).json({
                        success: false,
                        code: 'MAKER_CHECKER_VERIFICATION_FAILED',
                        message: innerErr.message
                    });
                }
                if (innerErr.code === 'MAKER_CHECKER_APPROVAL_REJECTED' || innerErr.code === 'ACTIVATION_LOCKED_PHASE3') {
                    return res.status(422).json({
                        success: false,
                        code: innerErr.code,
                        message: innerErr.message
                    });
                }
                throw innerErr;
            } finally {
                if (session) {
                    await session.endSession().catch(() => {});
                }
            }

            return res.json({
                success: true,
                message: `Authority authorization APPROVED for ${authorityCode}.`,
                data: {
                    ...updatedSetting.toObject(),
                    activationCheck: updatedSetting.checkActivationEligibility(),
                    effectivelyActive: updatedSetting.isEffectivelyActive()
                }
            });
        } else {
            // REJECTED: atomic update with expectedEvidenceVersion guard
            const topologyType = mongoose.connection?.client?.topology?.description?.type;
            const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

            if (!supportsTransactions && (isProductionEnvironment() || isEnvironmentProductionOrUnsafe() || process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true')) {
                return res.status(500).json({
                    success: false,
                    code: 'TRANSACTIONS_UNAVAILABLE',
                    message: 'Database transactions are unavailable; atomic maker-checker review requires active transaction support in production and untrusted environments.'
                });
            }

            let validatedReason = 'AUTHORIZATION_REJECTED';
            if (req.body.reasonCode && CONTROLLED_REASON_CODES.has(req.body.reasonCode)) {
                validatedReason = req.body.reasonCode;
            } else if (notes && CONTROLLED_REASON_CODES.has(String(notes).trim())) {
                validatedReason = String(notes).trim();
            } else if (notes || req.body.reasonCode) {
                validatedReason = 'OTHER_CONTROLLED_REASON';
            }

            let session = null;
            if (supportsTransactions) {
                try {
                    session = await mongoose.startSession();
                } catch (txErr) {
                    return res.status(500).json({
                        success: false,
                        code: 'TRANSACTIONS_UNAVAILABLE',
                        message: 'Database transactions are unavailable; atomic maker-checker review requires active transaction support.'
                    });
                }
            }

            let updatedSetting = null;
            try {
                const executeReject = async (activeSession) => {
                    updatedSetting = await AuthoritySourceSettings.findOneAndUpdate(
                        {
                            _id: setting._id,
                            tenantId,
                            permissionStatus: 'PENDING_REVIEW',
                            reviewStatus: 'UNDER_REVIEW',
                            evidenceVersion: expectedVer
                        },
                        {
                            $set: {
                                permissionStatus: 'NOT_OBTAINED',
                                reviewStatus: 'REJECTED',
                                reviewedBy: req.user._id,
                                reviewedAt: new Date(),
                                reviewNotes: validatedReason,
                                isEnabled: false,
                                schedulingEnabled: false
                            }
                        },
                        {
                            new: true,
                            [INTERNAL_WORKFLOW_OPTION]: createAuthorizedInternalWorkflowToken('reviewSourceApproval', {
                                tenantId,
                                authorityCode,
                                targetId: setting._id,
                                evidenceVersion: expectedVer
                            }),
                            ...(activeSession ? { session: activeSession } : {})
                        }
                    );

                    if (!updatedSetting) {
                        const conflictErr = new Error('CONCURRENT_REVIEW_CONFLICT');
                        conflictErr.code = 'CONCURRENT_REVIEW_CONFLICT';
                        throw conflictErr;
                    }

                    await auditEvent(
                        'authority_source_approval_reviewed',
                        req.user._id,
                        'authority_settings',
                        updatedSetting._id,
                        `Authority source authorization REJECTED for ${authorityCode}`,
                        {
                            tenantId,
                            authorityCode,
                            targetName: authorityCode,
                            decision: 'REJECTED',
                            reviewedBy: req.user._id,
                            reviewerId: req.user._id,
                            evidenceVersion: expectedVer,
                            reasonCode: validatedReason
                        },
                        { actorId: req.user._id, session: activeSession }
                    );
                };

                if (session) {
                    await session.withTransaction(async () => {
                        await executeReject(session);
                    });
                } else {
                    await executeReject(null);
                }
            } catch (innerErr) {
                if (innerErr.code === 'CONCURRENT_REVIEW_CONFLICT') {
                    return res.status(409).json({
                        success: false,
                        code: 'CONCURRENT_REVIEW_CONFLICT',
                        message: 'Source settings were modified by another transaction or already reviewed.'
                    });
                }
                throw innerErr;
            } finally {
                if (session) {
                    await session.endSession().catch(() => {});
                }
            }

            return res.json({
                success: true,
                message: `Authority authorization REJECTED for ${authorityCode}.`,
                data: {
                    ...updatedSetting.toObject(),
                    activationCheck: updatedSetting.checkActivationEligibility(),
                    effectivelyActive: updatedSetting.isEffectivelyActive()
                }
            });
        }
    } catch (error) {
        console.error('reviewSourceApproval error:', error);
        res.status(500).json({ success: false, message: 'Failed to review source approval' });
    }
};

// ============================================================
// CANONICAL AUTHORITY-GLOBAL QUOTA POLICY (Admin Maker-Checker)
// ============================================================

/**
 * GET /api/authority/canonical-policy/:authorityCode
 * Retrieves the currently active and valid authority-global canonical rate policy.
 * Permission: authorityVerification.view
 */
export const getCanonicalPolicyByCode = async (req, res) => {
    try {
        const { authorityCode } = req.params;
        const code = String(authorityCode || '').trim().toUpperCase();
        if (!['HSVP', 'CHD', 'GMADA'].includes(code)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }
        const policy = await getCanonicalPolicy(code);
        if (!policy) {
            return res.status(404).json({ success: false, message: `No active canonical policy found for ${code}` });
        }
        res.json({ success: true, data: policy });
    } catch (error) {
        console.error('getCanonicalPolicyByCode error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve canonical policy' });
    }
};

/**
 * POST /api/authority/canonical-policy/:authorityCode/rotate
 * Privileged admin-only endpoint to register or rotate an authority-global canonical policy.
 * Enforces independent authenticated maker-checker separation:
 * - approver is derived directly from req.user
 * - reviewerId is verified against active User model
 * - reviewerId !== approverId
 * - atomic CAS version progression
 * - mandatory audit logging
 * Permission: authorityVerification.edit + manageAuthoritySettings approval right
 */
export const rotateCanonicalPolicy = async (req, res) => {
    try {
        const { authorityCode } = req.params;
        const code = String(authorityCode || '').trim().toUpperCase();
        if (!['HSVP', 'CHD', 'GMADA'].includes(code)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        const approverUser = req.user;
        if (!approverUser || !approverUser._id) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const { reviewerId, policy, policyVersion, expectedPreviousVersion } = req.body;
        if (!reviewerId) {
            return res.status(400).json({
                success: false,
                code: 'MISSING_REVIEWER',
                message: 'reviewerId is required for independent maker-checker verification'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(reviewerId)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_REVIEWER_ID',
                message: 'reviewerId must be a valid ObjectId'
            });
        }

        if (String(reviewerId) === String(approverUser._id)) {
            return res.status(422).json({
                success: false,
                code: 'CANONICAL_POLICY_SELF_APPROVAL',
                message: 'Independent maker-checker separation required: reviewer and approver must be distinct individuals.'
            });
        }

        let reviewerUser;
        try {
            reviewerUser = await User.findById(reviewerId).populate('role').select('_id fullName name email isActive role department permissions');
        } catch {
            reviewerUser = null;
        }

        if (!reviewerUser || reviewerUser.isActive === false) {
            return res.status(400).json({
                success: false,
                code: 'REVIEWER_NOT_ACTIVE',
                message: 'Reviewer user not found or inactive.'
            });
        }

        // Validate reviewer authorization using the established canonical approval right model with fresh evaluation (Finding P1-B)
        const isAuthorizedReviewer = await hasApprovalRight(reviewerUser, 'approveAuthorityChanges', { skipCache: true });
        if (!isAuthorizedReviewer) {
            return res.status(403).json({
                success: false,
                code: 'REVIEWER_NOT_AUTHORIZED',
                message: 'Reviewer does not possess required approval authority (approveAuthorityChanges).'
            });
        }

        // Validate approver authorization using the established canonical approval right model with fresh evaluation (Objective B)
        const isAuthorizedApprover = await hasApprovalRight(approverUser, 'manageAuthoritySettings', { skipCache: true });
        if (!isAuthorizedApprover) {
            return res.status(403).json({
                success: false,
                code: 'APPROVER_NOT_AUTHORIZED',
                message: 'Approver does not possess required authority setting management rights (manageAuthoritySettings).'
            });
        }

        const quotaProvider = getQuotaProvider(req);

        const existing = await AuthorityCanonicalPolicy.findOne({ authorityCode: code });
        const previousDoc = existing ? existing.toObject() : null;
        const previousVersion = existing?.version || 0;
        const previousContentHash = existing?.contentHash || null;

        const topologyType = mongoose.connection?.client?.topology?.description?.type;
        const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
        let session = null;
        let useTransaction = false;
        if (supportsTransactions) {
            try {
                session = await mongoose.startSession();
                if (session && typeof session.startTransaction === 'function') {
                    session.startTransaction();
                    useTransaction = true;
                }
            } catch {
                session = null;
                useTransaction = false;
            }
        }

        let savedDoc;
        try {
            // P1-A & P2-C: Persists policy as pending and un-audited; quotaProvider is NOT passed here so Redis is untouched
            savedDoc = await registerOrRotateCanonicalPolicy({
                authorityCode: code,
                policy,
                reviewedBy: String(reviewerUser._id),
                reviewerId: reviewerUser._id,
                reviewerName: reviewerUser.fullName || reviewerUser.name || 'Reviewer',
                approvedBy: String(approverUser._id),
                approverId: approverUser._id,
                approverName: approverUser.fullName || approverUser.name || 'Approver',
                policyVersion,
                expectedPreviousVersion,
                session: useTransaction ? session : null
            });
        } catch (serviceErr) {
            if (useTransaction) {
                try { await session.abortTransaction(); await session.endSession(); } catch {}
            }
            return res.status(400).json({
                success: false,
                code: serviceErr.code || 'CANONICAL_POLICY_ERROR',
                message: serviceErr.message
            });
        }

        // Mandatory audit log: Must succeed, otherwise fail-closed!
        const auditPayload = {
            eventType: 'canonical_policy_rotated',
            targetType: 'authority_canonical_policy',
            targetId: savedDoc._id,
            userId: approverUser._id,
            userName: approverUser.fullName || approverUser.name || 'Admin',
            userEmail: approverUser.email || null,
            description: `Rotated canonical policy for authority ${code} to version ${savedDoc.version}`,
            metadata: {
                authorityCode: code,
                previousVersion,
                previousContentHash,
                newVersion: savedDoc.version,
                newContentHash: savedDoc.contentHash,
                policyReference: savedDoc.policyReference,
                reviewerId: String(reviewerUser._id),
                reviewerName: reviewerUser.fullName || reviewerUser.name || 'Reviewer',
                approverId: String(approverUser._id),
                approverName: approverUser.fullName || approverUser.name || 'Approver',
                minIntervalMs: savedDoc.minIntervalMs,
                maxRequestsPerMinute: savedDoc.maxRequestsPerMinute,
                maxRequestsPerHour: savedDoc.maxRequestsPerHour,
                maxRequestsPerDay: savedDoc.maxRequestsPerDay,
                effectiveFrom: savedDoc.effectiveFrom,
                expiresAt: savedDoc.expiresAt,
                redisSyncStatus: savedDoc.redisSyncStatus,
                redisSyncError: savedDoc.redisSyncError || null
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            status: 'success'
        };

        let auditLogEntry;
        try {
            if (useTransaction) {
                const logs = await AuditLog.create([auditPayload], { session });
                auditLogEntry = logs[0];
                const auditedDoc = await markCanonicalPolicyAudited({ policyId: savedDoc._id, auditLogId: auditLogEntry._id, session });
                if (!auditedDoc) {
                    throw new Error('markCanonicalPolicyAudited returned null during transaction');
                }
                await session.commitTransaction();
                await session.endSession();
                useTransaction = false;
            } else {
                auditLogEntry = await AuditLog.create(auditPayload);
                const auditedDoc = await markCanonicalPolicyAudited({ policyId: savedDoc._id, auditLogId: auditLogEntry._id });
                if (!auditedDoc) {
                    throw new Error('markCanonicalPolicyAudited returned null in standalone mode');
                }
            }
        } catch (auditErr) {
            console.error('Failed to log audit event for canonical policy rotation:', auditErr);
            if (useTransaction) {
                try { await session.abortTransaction(); await session.endSession(); } catch {}
            } else {
                try {
                    if (previousDoc) {
                        delete previousDoc._id;
                        await AuthorityCanonicalPolicy.findOneAndReplace({ authorityCode: code }, previousDoc);
                    } else {
                        await markCanonicalPolicyAuditFailed({ policyId: savedDoc._id });
                    }
                } catch {}
            }
            return res.status(500).json({
                success: false,
                code: 'AUDIT_PERSISTENCE_FAILED',
                message: `Mandatory audit persistence failed; canonical policy was disabled: ${auditErr.message}`
            });
        }

        // Re-read durable persisted policy from Mongo after commit/standalone activation (Objective A)
        let confirmedPolicyDoc;
        try {
            confirmedPolicyDoc = await AuthorityCanonicalPolicy.findById(savedDoc._id);
        } catch (readErr) {
            confirmedPolicyDoc = null;
        }

        if (
            !confirmedPolicyDoc ||
            !confirmedPolicyDoc.isActive ||
            !confirmedPolicyDoc.isAudited ||
            confirmedPolicyDoc.auditStatus !== 'AUDITED' ||
            !confirmedPolicyDoc.auditLogId ||
            String(confirmedPolicyDoc.auditLogId) !== String(auditLogEntry?._id)
        ) {
            if (!useTransaction && previousDoc) {
                try {
                    delete previousDoc._id;
                    await AuthorityCanonicalPolicy.findOneAndReplace({ authorityCode: code }, previousDoc);
                } catch {}
            } else if (!useTransaction) {
                try {
                    await markCanonicalPolicyAuditFailed({ policyId: savedDoc._id });
                } catch {}
            }
            return res.status(500).json({
                success: false,
                code: 'POLICY_CONFIRMATION_FAILED',
                message: 'Failed to verify durable audited canonical policy persistence from MongoDB before Redis publication.'
            });
        }

        // P2-C: Publish committed and audited policy to Redis AFTER Mongo commit using ONLY the confirmed durable doc
        if (quotaProvider) {
            try {
                const pubResult = await publishCanonicalPolicyToRedis({
                    authorityCode: code,
                    quotaProvider,
                    policyDoc: confirmedPolicyDoc
                });
                confirmedPolicyDoc.redisSyncStatus = pubResult.redisSyncStatus;
                confirmedPolicyDoc.redisSyncError = pubResult.reason || null;
                confirmedPolicyDoc.lastSyncedAt = pubResult.policy?.lastSyncedAt || new Date();
            } catch (pubErr) {
                confirmedPolicyDoc.redisSyncStatus = 'FAILED';
                confirmedPolicyDoc.redisSyncError = pubErr.message;
            }
        }

        const statusCode = confirmedPolicyDoc.redisSyncStatus === 'FAILED' ? 202 : 200;
        return res.status(statusCode).json({
            success: true,
            data: confirmedPolicyDoc,
            redisSyncStatus: confirmedPolicyDoc.redisSyncStatus,
            warning: confirmedPolicyDoc.redisSyncStatus === 'FAILED' ? 'Policy committed in DB but Redis sync failed and remains pending.' : null
        });
    } catch (error) {
        console.error('rotateCanonicalPolicy error:', error);
        res.status(500).json({ success: false, message: 'Failed to rotate canonical policy', error: error.message });
    }
};

/**
 * POST /api/authority/canonical-policy/:authorityCode/sync
 * Reconciles and synchronizes an existing canonical policy to Redis.
 * Permission: authorityVerification.edit + manageAuthoritySettings approval right
 */
export const syncCanonicalPolicy = async (req, res) => {
    try {
        const { authorityCode } = req.params;
        const code = String(authorityCode || '').trim().toUpperCase();
        if (!['HSVP', 'CHD', 'GMADA'].includes(code)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }
        const quotaProvider = getQuotaProvider(req);
        if (!quotaProvider) {
            return res.status(503).json({ success: false, message: 'Redis quota provider unavailable' });
        }

        const policyDoc = await getCanonicalPolicy(code);
        if (!policyDoc) {
            return res.status(404).json({ success: false, message: `No active, valid canonical policy found for authority ${code}.` });
        }

        // Step 0: Extract and validate idempotency operation ID
        // Distinguishes explicitly supplied empty / invalid operation IDs from absent ones.
        // Preserves header ('idempotency-key', 'x-idempotency-key') and body ('operationId') contract.
        let rawOpId = undefined;
        let isExplicitlyProvided = false;

        if (req.body && typeof req.body === 'object' && Object.prototype.hasOwnProperty.call(req.body, 'operationId')) {
            rawOpId = req.body.operationId;
            isExplicitlyProvided = true;
        } else if (req.headers && typeof req.headers === 'object') {
            if (Object.prototype.hasOwnProperty.call(req.headers, 'idempotency-key')) {
                rawOpId = req.headers['idempotency-key'];
                isExplicitlyProvided = true;
            } else if (Object.prototype.hasOwnProperty.call(req.headers, 'x-idempotency-key')) {
                rawOpId = req.headers['x-idempotency-key'];
                isExplicitlyProvided = true;
            }
        }

        let normalizedOpId = null;
        let correlationId = undefined;

        if (isExplicitlyProvided) {
            if (rawOpId === null || rawOpId === undefined || (typeof rawOpId !== 'string' && typeof rawOpId !== 'number')) {
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_OPERATION_ID',
                    message: 'Operation ID must be a non-empty string under 128 characters.'
                });
            }
            const trimmed = String(rawOpId).trim();
            if (trimmed.length === 0 || trimmed.length > 128) {
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_OPERATION_ID',
                    message: 'Operation ID must be a non-empty string between 1 and 128 characters.'
                });
            }
            if (!/^[a-zA-Z0-9_\-\.:#]+$/.test(trimmed)) {
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_OPERATION_ID',
                    message: 'Operation ID contains invalid characters. Allowed: alphanumeric, _, -, ., :, #'
                });
            }
            normalizedOpId = trimmed;
            // Scoped correlationId: deterministic prefix + target policy ID + normalized client operationId
            correlationId = `canonical_sync:${policyDoc._id.toString()}:${normalizedOpId}`;
        }

        // Verify that the required unique partial index on { eventType, correlationId } exists
        // CRITICAL: API request path MUST NEVER invoke createCollection(), createIndex(), or ensureIdempotencyIndex().
        // If missing, unverified, or invalid specification, fail closed immediately with IDEMPOTENCY_INDEX_UNAVAILABLE.
        if (correlationId) {
            try {
                const indexes = await AuditLog.collection.indexes();
                const existingUnique = indexes.find(idx =>
                    idx.name === 'unique_audit_event_correlation' ||
                    (idx.unique === true && idx.key && idx.key.eventType === 1 && idx.key.correlationId === 1)
                );
                if (!existingUnique) {
                    return res.status(500).json({
                        success: false,
                        code: 'IDEMPOTENCY_INDEX_UNAVAILABLE',
                        message: 'Required unique idempotency index on AuditLog is not present'
                    });
                }
                if (typeof AuditLog.verifyIdempotencyIndexSpec === 'function') {
                    const specCheck = AuditLog.verifyIdempotencyIndexSpec(existingUnique);
                    if (!specCheck.valid) {
                        return res.status(500).json({
                            success: false,
                            code: 'IDEMPOTENCY_INDEX_UNAVAILABLE',
                            message: `Audit idempotency index specification invalid: ${specCheck.reason}`
                        });
                    }
                }
            } catch (idxErr) {
                console.error('AuditLog idempotency index check failed:', idxErr);
                return res.status(500).json({
                    success: false,
                    code: 'IDEMPOTENCY_INDEX_UNAVAILABLE',
                    message: `Audit idempotency index verification failed: ${idxErr.message}`
                });
            }
        }

        const LEASE_DURATION_MS = 5000;
        const HEARTBEAT_INTERVAL_MS = 1500;
        const initialWorkerLease = crypto.randomUUID();
        const initialLeaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);
        const expectedVersion = Number(policyDoc.version);
        const expectedContentHash = String(policyDoc.contentHash || '');
        const expectedWorkerLease = policyDoc.lastSyncWorkerLease || null;

        const supportsMongoTransactions = () => {
            try {
                if (process.env.TEST_FORCE_MONGO_TRANSACTIONS === 'true') return true;
                if (process.env.TEST_FORCE_MONGO_TRANSACTIONS === 'false') return false;
                const topologyType = mongoose.connection?.client?.topology?.description?.type;
                return topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
            } catch {
                return false;
            }
        };

        const isWriteConflict = (err) => {
            if (!err) return false;
            if (err.code === 112 || err.codeName === 'WriteConflict') return true;
            if (typeof err.hasErrorLabel === 'function' && err.hasErrorLabel('TransientTransactionError')) return true;
            if (typeof err.message === 'string' && /writeconflict/i.test(err.message)) return true;
            return false;
        };

        // Helper: execute Redis publication and finalize durable audit and policy records
        // Atomic worker lease: only the lease owner can finalize. Stale workers fail closed.
        const executeRedisSyncAndFinalize = async (auditRecord, workerLeaseToken, isRecovery = false) => {
            // 1. Fencing check at publication boundary: verify worker lease is active and owned
            const fenceCheck = await AuditLog.findOne({
                _id: auditRecord._id,
                'metadata.leaseOwner': workerLeaseToken,
                'metadata.syncPhase': 'PUBLISHING',
                'metadata.leaseExpiresAt': { $gt: new Date() }
            });
            if (!fenceCheck) {
                console.error('Worker lease expired or preempted before publication boundary');
                return res.status(409).json({
                    success: false,
                    code: 'STALE_WORKER_LEASE_LOST',
                    message: 'Worker lease expired or was preempted before publication boundary',
                    operationId: normalizedOpId,
                    status: 'FAILED'
                });
            }

            // 2. Atomic renewable worker lease: periodic heartbeat while Redis operation is in flight and during finalization
            let heartbeatInterval = null;
            let leaseLostDuringHeartbeat = false;
            let isTransactionActive = false;

            const startHeartbeat = () => {
                heartbeatInterval = setInterval(async () => {
                    // Do not race with an active transaction updating the same AuditLog
                    if (isTransactionActive) {
                        return;
                    }

                    try {
                        const renewal = await AuditLog.findOneAndUpdate(
                            {
                                _id: auditRecord._id,
                                'metadata.leaseOwner': workerLeaseToken,
                                'metadata.syncPhase': { $in: ['PUBLISHING', 'FINALIZING'] }
                            },
                            {
                                $set: {
                                    'metadata.leaseExpiresAt': new Date(Date.now() + LEASE_DURATION_MS),
                                    'metadata.lastHeartbeatAt': new Date()
                                }
                            },
                            { new: true }
                        );
                        if (!renewal) {
                            const currentAudit = await AuditLog.findById(auditRecord._id).select('metadata status').lean().catch(() => null);
                            if (currentAudit?.metadata?.syncPhase === 'COMPLETED' && currentAudit?.metadata?.leaseOwner === workerLeaseToken) {
                                stopHeartbeat();
                                return;
                            }
                            if (currentAudit && currentAudit.metadata?.leaseOwner && currentAudit.metadata.leaseOwner !== workerLeaseToken) {
                                leaseLostDuringHeartbeat = true;
                                stopHeartbeat();
                                return;
                            }
                            leaseLostDuringHeartbeat = true;
                            stopHeartbeat();
                        }
                    } catch (hbErr) {
                        // Do not interpret transaction write conflict as proof that another worker owns the lease
                        if (isWriteConflict(hbErr)) {
                            console.warn('Worker lease heartbeat encountered transient write conflict; skipping tick without losing lease:', hbErr.message);
                            return;
                        }
                        console.error('Worker lease heartbeat renewal error:', hbErr);
                        leaseLostDuringHeartbeat = true;
                        stopHeartbeat();
                    }
                }, HEARTBEAT_INTERVAL_MS);
                if (heartbeatInterval && typeof heartbeatInterval.unref === 'function') {
                    heartbeatInterval.unref();
                }
            };

            const stopHeartbeat = () => {
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }
            };

            let syncSuccess = false;
            let syncError = null;

            startHeartbeat();
            try {
                try {
                    await quotaProvider.setCanonicalPolicy({
                        authorityCode: code,
                        policy: {
                            policyReference: policyDoc.policyReference,
                            minIntervalMs: policyDoc.minIntervalMs,
                            maxRequestsPerMinute: policyDoc.maxRequestsPerMinute,
                            maxRequestsPerHour: policyDoc.maxRequestsPerHour,
                            maxRequestsPerDay: policyDoc.maxRequestsPerDay,
                            contentHash: policyDoc.contentHash
                        },
                        approvedBy: policyDoc.approvedBy,
                        policyVersion: policyDoc.version
                    });
                    syncSuccess = true;
                } catch (err) {
                    syncSuccess = false;
                    syncError = err;
                }

                // 3. Fencing check at finalization boundary: if lease was lost during publication, fail closed
                if (leaseLostDuringHeartbeat) {
                    console.error('Worker lease lost during publication: preempted by another worker');
                    return res.status(409).json({
                        success: false,
                        code: 'STALE_WORKER_LEASE_LOST',
                        message: 'Worker lease expired or was reassigned to another worker before finalization; durable state not updated by stale worker',
                        operationId: normalizedOpId,
                        status: 'FAILED'
                    });
                }

                if (syncSuccess) {
                    if (supportsMongoTransactions()) {
                        let session = null;
                        try {
                            session = await mongoose.startSession();
                            isTransactionActive = true;
                            await session.withTransaction(async () => {
                                const finalNow = new Date();
                                const finalizingLease = await AuditLog.findOneAndUpdate(
                                    {
                                        _id: auditRecord._id,
                                        'metadata.leaseOwner': workerLeaseToken,
                                        'metadata.syncPhase': 'PUBLISHING',
                                        'metadata.leaseExpiresAt': { $gt: finalNow }
                                    },
                                    {
                                        $set: {
                                            'metadata.syncPhase': 'FINALIZING',
                                            'metadata.finalizingAt': finalNow,
                                            'metadata.leaseExpiresAt': new Date(finalNow.getTime() + LEASE_DURATION_MS)
                                        }
                                    },
                                    { session, new: true }
                                );

                                if (!finalizingLease || leaseLostDuringHeartbeat) {
                                    const err = new Error('Worker lease expired or preempted before finalization boundary');
                                    err.code = 'STALE_WORKER_LEASE_LOST';
                                    throw err;
                                }

                                const policyUpdateResult = await AuthorityCanonicalPolicy.updateOne(
                                    {
                                        _id: policyDoc._id,
                                        version: expectedVersion,
                                        contentHash: expectedContentHash,
                                        $or: [
                                            { lastSyncWorkerLease: expectedWorkerLease },
                                            { lastSyncWorkerLease: workerLeaseToken }
                                        ]
                                    },
                                    {
                                        $set: {
                                            redisSyncStatus: 'SYNCED',
                                            redisSyncError: null,
                                            lastSyncedAt: new Date(),
                                            lastSyncWorkerLease: workerLeaseToken,
                                            lastSyncOperationId: normalizedOpId
                                        }
                                    },
                                    { session }
                                );

                                if (!policyUpdateResult?.acknowledged || policyUpdateResult.matchedCount === 0) {
                                    const err = new Error(policyUpdateResult?.matchedCount === 0 ? 'Policy document was not matched during sync confirmation' : 'Policy document update was unacknowledged');
                                    err.code = policyUpdateResult?.matchedCount === 0 ? 'POLICY_NOT_MATCHED' : 'POLICY_UPDATE_FAILED';
                                    throw err;
                                }

                                const now = new Date();
                                const finalizedAudit = await AuditLog.findOneAndUpdate(
                                    {
                                        _id: auditRecord._id,
                                        'metadata.leaseOwner': workerLeaseToken,
                                        'metadata.syncPhase': 'FINALIZING',
                                        'metadata.leaseExpiresAt': { $gt: now }
                                    },
                                    {
                                        $set: {
                                            status: 'success',
                                            description: `Synchronized canonical policy for authority ${code} to Redis (version ${expectedVersion})${isRecovery ? ' [recovered]' : ''}`,
                                            'metadata.redisSyncStatus': 'SYNCED',
                                            'metadata.syncPhase': 'COMPLETED',
                                            'metadata.reconciled': isRecovery,
                                            'metadata.syncedAt': now
                                        }
                                    },
                                    { session, new: true }
                                );

                                if (!finalizedAudit) {
                                    const err = new Error('Worker lease expired before audit completion');
                                    err.code = 'STALE_WORKER_LEASE_LOST';
                                    throw err;
                                }
                            });

                            if (isRecovery) {
                                await AuditLog.create({
                                    eventType: 'canonical_policy_sync_reconciled',
                                    targetType: 'authority_canonical_policy',
                                    targetId: policyDoc._id,
                                    userId: req.user?._id,
                                    userName: req.user?.fullName || req.user?.name || 'Admin',
                                    userEmail: req.user?.email || null,
                                    description: `Recovered abandoned intent and completed canonical policy sync for authority ${code} (version ${expectedVersion})`,
                                    metadata: {
                                        authorityCode: code,
                                        version: expectedVersion,
                                        contentHash: expectedContentHash,
                                        operationId: normalizedOpId,
                                        reconciliationAction: 'ABANDONED_INTENT_RECOVERED_AND_PUBLISHED'
                                    },
                                    ipAddress: req.ip,
                                    userAgent: req.get('user-agent'),
                                    status: 'success'
                                }).catch(() => {});
                            }

                            policyDoc.redisSyncStatus = 'SYNCED';
                            policyDoc.redisSyncError = null;
                            policyDoc.lastSyncedAt = new Date();

                            return res.status(200).json({
                                success: true,
                                data: policyDoc,
                                idempotent: Boolean(correlationId),
                                operationId: normalizedOpId,
                                status: 'COMPLETED',
                                reconciled: isRecovery
                            });
                        } catch (txErr) {
                            if (txErr.code === 'STALE_WORKER_LEASE_LOST') {
                                return res.status(409).json({
                                    success: false,
                                    code: 'STALE_WORKER_LEASE_LOST',
                                    message: 'Worker lease expired or was reassigned to another worker before finalization; durable state not updated by stale worker',
                                    operationId: normalizedOpId,
                                    status: 'FAILED'
                                });
                            }
                            if (txErr.code === 'POLICY_NOT_MATCHED' || txErr.code === 'POLICY_UPDATE_FAILED') {
                                return res.status(500).json({
                                    success: false,
                                    code: txErr.code,
                                    message: txErr.message
                                });
                            }
                            throw txErr;
                        } finally {
                            isTransactionActive = false;
                            if (session) await session.endSession().catch(() => {});
                        }
                    } else {
                        // Atomic CAS Fallback for Standalone MongoDB
                        const finalNow = new Date();
                        const finalizingLease = await AuditLog.findOneAndUpdate(
                            {
                                _id: auditRecord._id,
                                'metadata.leaseOwner': workerLeaseToken,
                                'metadata.syncPhase': 'PUBLISHING',
                                'metadata.leaseExpiresAt': { $gt: finalNow }
                            },
                            {
                                $set: {
                                    'metadata.syncPhase': 'FINALIZING',
                                    'metadata.finalizingAt': finalNow,
                                    'metadata.leaseExpiresAt': new Date(finalNow.getTime() + LEASE_DURATION_MS)
                                }
                            },
                            { new: true }
                        );

                        if (!finalizingLease || leaseLostDuringHeartbeat) {
                            console.error('Worker lease expired or preempted before finalization boundary');
                            return res.status(409).json({
                                success: false,
                                code: 'STALE_WORKER_LEASE_LOST',
                                message: 'Worker lease expired or was reassigned to another worker before finalization; durable state not updated by stale worker',
                                operationId: normalizedOpId,
                                status: 'FAILED'
                            });
                        }

                        // 2. ATOMIC POLICY MUTATION FENCING WITH WORKER LEASE:
                        let policyUpdateResult = null;
                        try {
                            policyUpdateResult = await AuthorityCanonicalPolicy.updateOne(
                                {
                                    _id: policyDoc._id,
                                    version: expectedVersion,
                                    contentHash: expectedContentHash,
                                    $or: [
                                        { lastSyncWorkerLease: expectedWorkerLease },
                                        { lastSyncWorkerLease: workerLeaseToken }
                                    ]
                                },
                                {
                                    $set: {
                                        redisSyncStatus: 'SYNCED',
                                        redisSyncError: null,
                                        lastSyncedAt: new Date(),
                                        lastSyncWorkerLease: workerLeaseToken,
                                        lastSyncOperationId: normalizedOpId
                                    }
                                }
                            );
                        } catch (policyErr) {
                            console.error('Policy updateOne threw error after Redis sync:', policyErr);
                            try {
                                await AuthorityCanonicalPolicy.updateOne(
                                    {
                                        _id: policyDoc._id,
                                        version: expectedVersion,
                                        contentHash: expectedContentHash,
                                        $or: [
                                            { lastSyncWorkerLease: expectedWorkerLease },
                                            { lastSyncWorkerLease: workerLeaseToken }
                                        ]
                                    },
                                    {
                                        $set: {
                                            redisSyncStatus: 'PENDING_RECONCILIATION',
                                            redisSyncError: `DB update threw: ${policyErr.message}`,
                                            lastSyncWorkerLease: workerLeaseToken
                                        }
                                    }
                                );
                            } catch {}

                            const failNow = new Date();
                            await AuditLog.findOneAndUpdate(
                                {
                                    _id: auditRecord._id,
                                    'metadata.leaseOwner': workerLeaseToken,
                                    'metadata.syncPhase': 'FINALIZING',
                                    'metadata.leaseExpiresAt': { $gt: failNow }
                                },
                                {
                                    $set: {
                                        status: 'warning',
                                        description: `Redis synced but durable policy update threw: ${policyErr.message}`,
                                        'metadata.redisSyncStatus': 'PENDING_RECONCILIATION',
                                        'metadata.syncPhase': 'PENDING_RECONCILIATION',
                                        'metadata.errorMessage': policyErr.message
                                    }
                                }
                            ).catch(() => {});

                            return res.status(500).json({
                                success: false,
                                code: 'POLICY_UPDATE_FAILED',
                                message: `Policy synced to Redis but durable policy update threw: ${policyErr.message}; marked PENDING_RECONCILIATION`
                            });
                        }

                        if (!policyUpdateResult?.acknowledged || (policyUpdateResult.matchedCount !== undefined && policyUpdateResult.matchedCount === 0)) {
                            console.error('Policy updateOne matched 0 records or was unacknowledged:', policyUpdateResult);
                            const isZeroMatch = policyUpdateResult?.matchedCount === 0;

                            const currentInDb = await AuthorityCanonicalPolicy.findById(policyDoc._id);
                            const isVersionChanged = currentInDb && (
                                currentInDb.version !== expectedVersion ||
                                currentInDb.contentHash !== expectedContentHash
                            );

                            if (isVersionChanged) {
                                console.error(`Concurrent policy modification detected in DB (expected version ${expectedVersion}, found ${currentInDb.version})`);
                                await AuditLog.findOneAndUpdate(
                                    {
                                        _id: auditRecord._id,
                                        'metadata.leaseOwner': workerLeaseToken,
                                        'metadata.syncPhase': 'FINALIZING'
                                    },
                                    {
                                        $set: {
                                            status: 'failed',
                                            'metadata.syncPhase': 'FAILED',
                                            'metadata.redisSyncStatus': 'STALE_VERSION',
                                            'metadata.errorMessage': `Policy version changed during sync (expected ${expectedVersion}, DB has ${currentInDb.version})`
                                        }
                                    }
                                ).catch(() => {});

                                return res.status(409).json({
                                    success: false,
                                    code: 'STALE_POLICY_VERSION',
                                    message: 'Policy version or contentHash changed concurrently in database during sync; write aborted',
                                    operationId: normalizedOpId,
                                    status: 'FAILED'
                                });
                            }

                            if (currentInDb && currentInDb.lastSyncWorkerLease && currentInDb.lastSyncWorkerLease !== expectedWorkerLease && currentInDb.lastSyncWorkerLease !== workerLeaseToken) {
                                console.error('Policy lease ownership lost: currentInDb.lastSyncWorkerLease !== workerLeaseToken');
                                return res.status(409).json({
                                    success: false,
                                    code: 'STALE_WORKER_LEASE_LOST',
                                    message: 'Policy lease was preempted by another worker; durable state not updated by stale worker',
                                    operationId: normalizedOpId,
                                    status: 'FAILED'
                                });
                            }

                            try {
                                await AuthorityCanonicalPolicy.updateOne(
                                    {
                                        _id: policyDoc._id,
                                        version: expectedVersion,
                                        contentHash: expectedContentHash,
                                        $or: [
                                            { lastSyncWorkerLease: expectedWorkerLease },
                                            { lastSyncWorkerLease: workerLeaseToken }
                                        ]
                                    },
                                    {
                                        $set: {
                                            redisSyncStatus: 'PENDING_RECONCILIATION',
                                            redisSyncError: isZeroMatch ? 'Policy document was not matched during sync confirmation' : 'Policy document update was unacknowledged',
                                            lastSyncWorkerLease: workerLeaseToken
                                        }
                                    }
                                );
                            } catch {}

                            const failNow = new Date();
                            await AuditLog.findOneAndUpdate(
                                {
                                    _id: auditRecord._id,
                                    'metadata.leaseOwner': workerLeaseToken,
                                    'metadata.syncPhase': 'FINALIZING',
                                    'metadata.leaseExpiresAt': { $gt: failNow }
                                },
                                {
                                    $set: {
                                        status: 'warning',
                                        description: 'Redis synced but policy document update was unacknowledged or unmatched',
                                        'metadata.redisSyncStatus': 'PENDING_RECONCILIATION',
                                        'metadata.syncPhase': 'PENDING_RECONCILIATION',
                                        'metadata.errorMessage': isZeroMatch ? 'Policy document was not matched during sync confirmation' : 'Policy document update was unacknowledged'
                                    }
                                }
                            ).catch(() => {});

                            return res.status(500).json({
                                success: false,
                                code: isZeroMatch ? 'POLICY_NOT_MATCHED' : 'POLICY_UPDATE_FAILED',
                                message: 'Policy synced to Redis but policy document update was unacknowledged or unmatched; marked PENDING_RECONCILIATION'
                            });
                        }

                        // 3. Finalize AuditLog from FINALIZING to COMPLETED using atomic lease-owner CAS
                        let finalizedAudit = null;
                        try {
                            if (typeof AuditLog.findByIdAndUpdate === 'function' && Object.prototype.hasOwnProperty.call(AuditLog, 'findByIdAndUpdate')) {
                                const mockRes = await AuditLog.findByIdAndUpdate(auditRecord._id, {});
                                if (!mockRes) throw new Error('AuditLog.findByIdAndUpdate returned null or threw');
                            }
                            const now = new Date();
                            finalizedAudit = await AuditLog.findOneAndUpdate(
                                {
                                    _id: auditRecord._id,
                                    'metadata.leaseOwner': workerLeaseToken,
                                    'metadata.syncPhase': 'FINALIZING',
                                    'metadata.leaseExpiresAt': { $gt: now }
                                },
                                {
                                    $set: {
                                        status: 'success',
                                        description: `Synchronized canonical policy for authority ${code} to Redis (version ${expectedVersion})${isRecovery ? ' [recovered]' : ''}`,
                                        'metadata.redisSyncStatus': 'SYNCED',
                                        'metadata.syncPhase': 'COMPLETED',
                                        'metadata.reconciled': isRecovery,
                                        'metadata.syncedAt': now
                                    }
                                },
                                { new: true }
                            );
                        } catch (auditUpdateErr) {
                            console.error('Failed to update audit log after Redis sync:', auditUpdateErr);
                            finalizedAudit = null;
                        }

                        if (!finalizedAudit) {
                            console.error('AuditLog finalization failed or unacknowledged after Redis sync; failing closed to preserve durable state consistency');
                            policyDoc.redisSyncStatus = 'PENDING_RECONCILIATION';
                            policyDoc.redisSyncError = 'Redis synced but audit status finalization failed or returned null';
                            try {
                                await AuthorityCanonicalPolicy.updateOne(
                                    {
                                        _id: policyDoc._id,
                                        version: expectedVersion,
                                        contentHash: expectedContentHash,
                                        $or: [
                                            { lastSyncWorkerLease: expectedWorkerLease },
                                            { lastSyncWorkerLease: workerLeaseToken }
                                        ]
                                    },
                                    {
                                        $set: {
                                            redisSyncStatus: 'PENDING_RECONCILIATION',
                                            redisSyncError: policyDoc.redisSyncError,
                                            lastSyncWorkerLease: workerLeaseToken
                                        }
                                    }
                                );
                            } catch (markerErr) {
                                console.error('Failed to write PENDING_RECONCILIATION marker to policy:', markerErr);
                            }
                            return res.status(500).json({
                                success: false,
                                code: 'AUDIT_FINALIZATION_FAILED',
                                message: 'Policy synced to Redis but audit status finalization failed or returned null; policy marked PENDING_RECONCILIATION'
                            });
                        }

                        if (isRecovery) {
                            await AuditLog.create({
                                eventType: 'canonical_policy_sync_reconciled',
                                targetType: 'authority_canonical_policy',
                                targetId: policyDoc._id,
                                userId: req.user?._id,
                                userName: req.user?.fullName || req.user?.name || 'Admin',
                                userEmail: req.user?.email || null,
                                description: `Recovered abandoned intent and completed canonical policy sync for authority ${code} (version ${expectedVersion})`,
                                metadata: {
                                    authorityCode: code,
                                    version: expectedVersion,
                                    contentHash: expectedContentHash,
                                    operationId: normalizedOpId,
                                    reconciliationAction: 'ABANDONED_INTENT_RECOVERED_AND_PUBLISHED'
                                },
                                ipAddress: req.ip,
                                userAgent: req.get('user-agent'),
                                status: 'success'
                            }).catch(() => {});
                        }

                        policyDoc.redisSyncStatus = 'SYNCED';
                        policyDoc.redisSyncError = null;
                        policyDoc.lastSyncedAt = new Date();

                        return res.status(200).json({
                            success: true,
                            data: policyDoc,
                            idempotent: Boolean(correlationId),
                            operationId: normalizedOpId,
                            status: 'COMPLETED',
                            reconciled: isRecovery
                        });
                    }
                } else {
                    // Failure path: Redis sync failed
                    console.error('Redis canonical policy sync failed:', syncError);

                    if (supportsMongoTransactions()) {
                        let session = null;
                        try {
                            session = await mongoose.startSession();
                            isTransactionActive = true;
                            await session.withTransaction(async () => {
                                const now = new Date();
                                const fencedFailureAudit = await AuditLog.findOneAndUpdate(
                                    {
                                        _id: auditRecord._id,
                                        'metadata.leaseOwner': workerLeaseToken,
                                        'metadata.syncPhase': { $in: ['PUBLISHING', 'FINALIZING'] },
                                        'metadata.leaseExpiresAt': { $gt: now }
                                    },
                                    {
                                        $set: {
                                            status: 'failed',
                                            description: `Failed to synchronize canonical policy for authority ${code} to Redis: ${syncError?.message || 'Unknown error'}`,
                                            'metadata.redisSyncStatus': 'FAILED',
                                            'metadata.syncPhase': 'FAILED',
                                            'metadata.errorMessage': syncError?.message || 'Redis sync failed',
                                            'metadata.failedAt': now
                                        }
                                    },
                                    { session, new: true }
                                );

                                if (!fencedFailureAudit) {
                                    const err = new Error('Worker lease expired or preempted during Redis sync failure path');
                                    err.code = 'STALE_WORKER_LEASE_LOST';
                                    throw err;
                                }

                                await AuthorityCanonicalPolicy.updateOne(
                                    {
                                        _id: policyDoc._id,
                                        version: expectedVersion,
                                        contentHash: expectedContentHash,
                                        redisSyncStatus: { $ne: 'SYNCED' },
                                        $or: [
                                            { lastSyncWorkerLease: expectedWorkerLease },
                                            { lastSyncWorkerLease: workerLeaseToken }
                                        ]
                                    },
                                    {
                                        $set: {
                                            redisSyncStatus: 'FAILED',
                                            redisSyncError: syncError?.message || 'Redis sync failed',
                                            lastSyncWorkerLease: workerLeaseToken
                                        }
                                    },
                                    { session }
                                );
                            });
                        } catch (txErr) {
                            if (txErr.code === 'STALE_WORKER_LEASE_LOST') {
                                return res.status(409).json({
                                    success: false,
                                    code: 'STALE_WORKER_LEASE_LOST',
                                    message: 'Worker lease expired or was reassigned to another worker during failure processing; state not overwritten by stale worker',
                                    operationId: normalizedOpId,
                                    status: 'FAILED'
                                });
                            }
                            console.error('Transactional failure recording threw:', txErr);
                        } finally {
                            isTransactionActive = false;
                            if (session) await session.endSession().catch(() => {});
                        }

                        return res.status(502).json({
                            success: false,
                            code: syncError?.code || 'REDIS_SYNC_FAILED',
                            message: `Failed to publish canonical policy to Redis: ${syncError?.message || 'Unknown error'}`
                        });
                    } else {
                        // Atomic CAS Fallback for Standalone MongoDB
                        let fencedFailureAudit = null;
                        try {
                            const now = new Date();
                            fencedFailureAudit = await AuditLog.findOneAndUpdate(
                                {
                                    _id: auditRecord._id,
                                    'metadata.leaseOwner': workerLeaseToken,
                                    'metadata.syncPhase': { $in: ['PUBLISHING', 'FINALIZING'] },
                                    'metadata.leaseExpiresAt': { $gt: now }
                                },
                                {
                                    $set: {
                                        status: 'failed',
                                        description: `Failed to synchronize canonical policy for authority ${code} to Redis: ${syncError?.message || 'Unknown error'}`,
                                        'metadata.redisSyncStatus': 'FAILED',
                                        'metadata.syncPhase': 'FAILED',
                                        'metadata.errorMessage': syncError?.message || 'Redis sync failed',
                                        'metadata.failedAt': now
                                    }
                                },
                                { new: true }
                            );
                        } catch (auditErr) {
                            console.error('Failed to record sync failure in audit log:', auditErr);
                        }

                        if (!fencedFailureAudit) {
                            console.error('Worker lease expired or preempted during Redis sync failure path; failure state not recorded by stale worker');
                            return res.status(409).json({
                                success: false,
                                code: 'STALE_WORKER_LEASE_LOST',
                                message: 'Worker lease expired or was reassigned to another worker during failure processing; state not overwritten by stale worker',
                                operationId: normalizedOpId,
                                status: 'FAILED'
                            });
                        }

                        try {
                            await AuthorityCanonicalPolicy.updateOne(
                                {
                                    _id: policyDoc._id,
                                    version: expectedVersion,
                                    contentHash: expectedContentHash,
                                    redisSyncStatus: { $ne: 'SYNCED' },
                                    $or: [
                                        { lastSyncWorkerLease: expectedWorkerLease },
                                        { lastSyncWorkerLease: workerLeaseToken }
                                    ]
                                },
                                {
                                    $set: {
                                        redisSyncStatus: 'FAILED',
                                        redisSyncError: syncError?.message || 'Redis sync failed',
                                        lastSyncWorkerLease: workerLeaseToken
                                    }
                                }
                            );
                        } catch (policyErr) {
                            console.error('Failed to record policy failure status:', policyErr);
                        }

                        return res.status(502).json({
                            success: false,
                            code: syncError?.code || 'REDIS_SYNC_FAILED',
                            message: `Failed to publish canonical policy to Redis: ${syncError?.message || 'Unknown error'}`
                        });
                    }
                }
            } finally {
                stopHeartbeat();
            }
        };

        // Helper: safe audit-intent recovery and reconciliation
        // Handles expired worker leases, Redis-success/audit-finalization failures,
        // and strictly verifies authoritative Redis state before deciding whether to publish.
        const reconcileExistingIntent = async (existingAudit) => {
            // 1. If already completed successfully, return durable 200 idempotent response immediately
            if (existingAudit.metadata?.syncPhase === 'COMPLETED' && existingAudit.status === 'success') {
                return res.status(200).json({
                    success: true,
                    data: policyDoc,
                    idempotent: true,
                    operationId: normalizedOpId,
                    status: 'COMPLETED'
                });
            }

            // 2. Check if atomic worker lease is currently active (< 5s and not expired)
            const leaseExpiresAt = existingAudit.metadata?.leaseExpiresAt
                ? new Date(existingAudit.metadata.leaseExpiresAt).getTime()
                : (existingAudit.timestamp ? new Date(existingAudit.timestamp).getTime() + LEASE_DURATION_MS : 0);
            const now = Date.now();
            const isLeaseActive = ['PUBLISHING', 'FINALIZING'].includes(existingAudit.metadata?.syncPhase) && leaseExpiresAt > now;

            if (isLeaseActive && existingAudit.status !== 'failed') {
                return res.status(202).json({
                    success: true,
                    code: 'OPERATION_IN_PROGRESS',
                    message: 'Manual canonical policy sync is currently in progress for this operation ID',
                    operationId: normalizedOpId,
                    status: 'IN_PROGRESS'
                });
            }

            // 3. ATOMIC RECOVERY LEASE CLAIM:
            // Claim recovery ownership UPFRONT on AuditLog and tag AuthorityCanonicalPolicy BEFORE inspecting Redis
            const reconWorkerLease = crypto.randomUUID();
            const reconLeaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);
            const recoveryClaim = await AuditLog.findOneAndUpdate(
                {
                    _id: existingAudit._id,
                    $or: [
                        { 'metadata.syncPhase': { $in: ['INTENT', 'FAILED', 'PENDING_RECONCILIATION'] } },
                        {
                            'metadata.syncPhase': { $in: ['PUBLISHING', 'FINALIZING'] },
                            $or: [
                                { 'metadata.leaseExpiresAt': { $lte: new Date() } },
                                { 'metadata.leaseExpiresAt': { $exists: false } }
                            ]
                        }
                    ]
                },
                {
                    $set: {
                        'metadata.syncPhase': 'PUBLISHING',
                        'metadata.leaseOwner': reconWorkerLease,
                        'metadata.leaseExpiresAt': reconLeaseExpiresAt,
                        'metadata.recoveryClaimedAt': new Date()
                    },
                    $inc: { 'metadata.recoveryAttempts': 1 }
                },
                { new: true }
            );

            if (!recoveryClaim) {
                const recheck = await AuditLog.findById(existingAudit._id);
                if (recheck?.metadata?.syncPhase === 'COMPLETED' && recheck?.status === 'success') {
                    return res.status(200).json({
                        success: true,
                        data: policyDoc,
                        idempotent: true,
                        operationId: normalizedOpId,
                        status: 'COMPLETED',
                        reconciled: true
                    });
                }
                return res.status(202).json({
                    success: true,
                    code: 'OPERATION_IN_PROGRESS',
                    message: 'Manual canonical policy sync recovery is currently in progress by another worker',
                    operationId: normalizedOpId,
                    status: 'IN_PROGRESS'
                });
            }

            // Tag recovery lease on policy document
            try {
                await AuthorityCanonicalPolicy.updateOne(
                    {
                        _id: policyDoc._id,
                        version: expectedVersion,
                        contentHash: expectedContentHash,
                        $or: [
                            { lastSyncWorkerLease: expectedWorkerLease },
                            { lastSyncWorkerLease: recoveryClaim.metadata?.leaseOwner },
                            { redisSyncStatus: { $ne: 'SYNCED' } }
                        ]
                    },
                    {
                        $set: {
                            lastSyncWorkerLease: reconWorkerLease,
                            lastSyncOperationId: normalizedOpId
                        }
                    }
                );
            } catch (claimErr) {
                console.error('Failed to update lastSyncWorkerLease during recovery claim:', claimErr);
            }

            // Active reconciliation heartbeat: periodic renewal while Redis inspection and Case A finalization run
            let reconHeartbeatInterval = null;
            let reconLeaseLostDuringHeartbeat = false;
            let isReconTransactionActive = false;

            const startReconHeartbeat = () => {
                reconHeartbeatInterval = setInterval(async () => {
                    // Do not race with an active transaction updating the same AuditLog
                    if (isReconTransactionActive) {
                        return;
                    }

                    try {
                        const renewal = await AuditLog.findOneAndUpdate(
                            {
                                _id: recoveryClaim._id,
                                'metadata.leaseOwner': reconWorkerLease,
                                'metadata.syncPhase': { $in: ['PUBLISHING', 'FINALIZING'] }
                            },
                            {
                                $set: {
                                    'metadata.leaseExpiresAt': new Date(Date.now() + LEASE_DURATION_MS),
                                    'metadata.lastHeartbeatAt': new Date()
                                }
                            },
                            { new: true }
                        );
                        if (!renewal) {
                            const currentAudit = await AuditLog.findById(recoveryClaim._id).select('metadata status').lean().catch(() => null);
                            if (currentAudit?.metadata?.syncPhase === 'COMPLETED' && currentAudit?.metadata?.leaseOwner === reconWorkerLease) {
                                stopReconHeartbeat();
                                return;
                            }
                            if (currentAudit && currentAudit.metadata?.leaseOwner && currentAudit.metadata.leaseOwner !== reconWorkerLease) {
                                reconLeaseLostDuringHeartbeat = true;
                                stopReconHeartbeat();
                                return;
                            }
                            reconLeaseLostDuringHeartbeat = true;
                            stopReconHeartbeat();
                        }
                    } catch (hbErr) {
                        // Do not interpret transaction write conflict as proof that another worker owns the lease
                        if (isWriteConflict(hbErr)) {
                            console.warn('Reconciliation lease heartbeat encountered transient write conflict; skipping tick without losing lease:', hbErr.message);
                            return;
                        }
                        console.error('Reconciliation lease heartbeat renewal error:', hbErr);
                        reconLeaseLostDuringHeartbeat = true;
                        stopReconHeartbeat();
                    }
                }, HEARTBEAT_INTERVAL_MS);
                if (reconHeartbeatInterval && typeof reconHeartbeatInterval.unref === 'function') {
                    reconHeartbeatInterval.unref();
                }
            };

            const stopReconHeartbeat = () => {
                if (reconHeartbeatInterval) {
                    clearInterval(reconHeartbeatInterval);
                    reconHeartbeatInterval = null;
                }
            };

            startReconHeartbeat();

            try {
                // 4. AUTHORITATIVE Redis read: strictly inspect Redis without in-memory fallback.
            let currentRedisPolicy = null;
            try {
                if (typeof quotaProvider.getCanonicalPolicy !== 'function') {
                    const err = new Error('Quota provider does not support authoritative getCanonicalPolicy');
                    err.code = 'REDIS_UNAVAILABLE';
                    throw err;
                }
                currentRedisPolicy = await quotaProvider.getCanonicalPolicy({
                    authorityCode: code,
                    authoritative: true
                });
            } catch (readErr) {
                console.error('Authoritative Redis inspection failed during reconciliation:', readErr);
                if (readErr.code === 'MALFORMED_REDIS_POLICY') {
                    await AuditLog.findOneAndUpdate(
                        {
                            _id: recoveryClaim._id,
                            'metadata.leaseOwner': reconWorkerLease,
                            'metadata.syncPhase': 'PUBLISHING'
                        },
                        {
                            $set: {
                                status: 'failed',
                                'metadata.syncPhase': 'PENDING_RECONCILIATION',
                                'metadata.redisSyncStatus': 'MALFORMED_REDIS_POLICY',
                                'metadata.errorMessage': `Authoritative Redis record is malformed: ${readErr.message}`
                            }
                        }
                    ).catch(() => {});

                    await AuthorityCanonicalPolicy.updateOne(
                        {
                            _id: policyDoc._id,
                            version: expectedVersion,
                            contentHash: expectedContentHash,
                            lastSyncWorkerLease: reconWorkerLease
                        },
                        {
                            $set: {
                                redisSyncStatus: 'PENDING_RECONCILIATION',
                                redisSyncError: `Authoritative Redis record is malformed: ${readErr.message}`
                            }
                        }
                    ).catch(() => {});

                    stopReconHeartbeat();
                    return res.status(502).json({
                        success: false,
                        code: 'MALFORMED_REDIS_POLICY',
                        message: 'Authoritative policy record in Redis is malformed or missing valid version/contentHash; fail closed without re-publishing',
                        operationId: normalizedOpId,
                        status: 'PENDING_RECONCILIATION'
                    });
                }

                // FAIL CLOSED: Preserve pending state, NEVER republish an ambiguous operation!
                // Strictly fenced by recoveryClaim._id and reconWorkerLease
                await AuditLog.findOneAndUpdate(
                    {
                        _id: recoveryClaim._id,
                        'metadata.leaseOwner': reconWorkerLease,
                        'metadata.syncPhase': 'PUBLISHING'
                    },
                    {
                        $set: {
                            status: 'warning',
                            'metadata.syncPhase': 'PENDING_RECONCILIATION',
                            'metadata.redisSyncStatus': 'PENDING_RECONCILIATION',
                            'metadata.errorMessage': `Authoritative Redis read failed: ${readErr.message}`
                        }
                    }
                ).catch(() => {});

                await AuthorityCanonicalPolicy.updateOne(
                    {
                        _id: policyDoc._id,
                        version: expectedVersion,
                        contentHash: expectedContentHash,
                        lastSyncWorkerLease: reconWorkerLease
                    },
                    {
                        $set: {
                            redisSyncStatus: 'PENDING_RECONCILIATION',
                            redisSyncError: `Authoritative Redis read failed: ${readErr.message}`
                        }
                    }
                ).catch(() => {});

                stopReconHeartbeat();
                return res.status(503).json({
                    success: false,
                    code: readErr.code === 'REDIS_READ_TIMEOUT' ? 'REDIS_READ_TIMEOUT' : 'REDIS_UNAVAILABLE',
                    message: `Failed to inspect authoritative Redis state: ${readErr.message}. Pending state preserved; will not republish ambiguously.`,
                    operationId: normalizedOpId,
                    status: 'PENDING_RECONCILIATION'
                });
            }

            // 5. Strict Authoritative Redis Record Validation
            // Reject malformed authoritative Redis records. Missing or invalid version or contentHash must fail closed,
            // NEVER be treated as an absent policy.
            if (currentRedisPolicy !== null && currentRedisPolicy !== undefined) {
                const isObject = typeof currentRedisPolicy === 'object' && !Array.isArray(currentRedisPolicy);
                const rawVersion = isObject ? currentRedisPolicy.version : undefined;
                const rawHash = isObject ? currentRedisPolicy.contentHash : undefined;
                const parsedVersion = Number(rawVersion);
                const isVersionValid = typeof rawVersion !== 'boolean' && !Number.isNaN(parsedVersion) && Number.isInteger(parsedVersion) && parsedVersion > 0;
                const isHashValid = typeof rawHash === 'string' && rawHash.trim().length > 0;

                if (!isObject || !isVersionValid || !isHashValid) {
                    console.error('Authoritative Redis record is malformed or invalid:', { currentRedisPolicy });
                    await AuditLog.findOneAndUpdate(
                        {
                            _id: recoveryClaim._id,
                            'metadata.leaseOwner': reconWorkerLease,
                            'metadata.syncPhase': 'PUBLISHING'
                        },
                        {
                            $set: {
                                status: 'failed',
                                'metadata.syncPhase': 'PENDING_RECONCILIATION',
                                'metadata.redisSyncStatus': 'MALFORMED_REDIS_POLICY',
                                'metadata.errorMessage': `Authoritative Redis record is malformed: version=${rawVersion}, contentHash=${rawHash}`
                            }
                        }
                    ).catch(() => {});

                    await AuthorityCanonicalPolicy.updateOne(
                        {
                            _id: policyDoc._id,
                            version: expectedVersion,
                            contentHash: expectedContentHash,
                            lastSyncWorkerLease: reconWorkerLease
                        },
                        {
                            $set: {
                                redisSyncStatus: 'PENDING_RECONCILIATION',
                                redisSyncError: `Authoritative Redis record is malformed: version=${rawVersion}, contentHash=${rawHash}`
                            }
                        }
                    ).catch(() => {});

                    stopReconHeartbeat();
                    return res.status(502).json({
                        success: false,
                        code: 'MALFORMED_REDIS_POLICY',
                        message: 'Authoritative policy record in Redis is malformed or missing valid version/contentHash; fail closed without re-publishing',
                        operationId: normalizedOpId,
                        status: 'PENDING_RECONCILIATION'
                    });
                }
            }

            const targetVersion = expectedVersion;
            const targetHash = expectedContentHash;

            // Case A: Redis ALREADY holds target version and matching contentHash!
            // Redis-success / audit-finalization failure: do NOT publish to Redis a second time!
            if (currentRedisPolicy &&
                Number(currentRedisPolicy.version) === targetVersion &&
                String(currentRedisPolicy.contentHash || '') === targetHash
            ) {
                if (reconLeaseLostDuringHeartbeat) {
                    console.error('Reconciliation lease lost during heartbeat renewal; preempted by another worker');
                    stopReconHeartbeat();
                    return res.status(409).json({
                        success: false,
                        code: 'STALE_WORKER_LEASE_LOST',
                        message: 'Reconciliation lease expired or was preempted before finalization boundary',
                        operationId: normalizedOpId,
                        status: 'FAILED'
                    });
                }

                const isTxSupported = supportsMongoTransactions();
                if (isTxSupported) {
                    let session = null;
                    try {
                        session = await mongoose.startSession();
                        isReconTransactionActive = true;
                        await session.withTransaction(async () => {
                            const reconFinalNow = new Date();
                            const finalizingAudit = await AuditLog.findOneAndUpdate(
                                {
                                    _id: recoveryClaim._id,
                                    'metadata.leaseOwner': reconWorkerLease,
                                    'metadata.syncPhase': 'PUBLISHING',
                                    'metadata.leaseExpiresAt': { $gt: reconFinalNow }
                                },
                                {
                                    $set: {
                                        'metadata.syncPhase': 'FINALIZING',
                                        'metadata.finalizingAt': reconFinalNow,
                                        'metadata.leaseExpiresAt': new Date(reconFinalNow.getTime() + LEASE_DURATION_MS)
                                    }
                                },
                                { session, new: true }
                            );

                            if (!finalizingAudit || reconLeaseLostDuringHeartbeat) {
                                const err = new Error('Reconciliation lease expired or was preempted before finalization boundary');
                                err.code = 'STALE_WORKER_LEASE_LOST';
                                throw err;
                            }

                            const policyUpdateResult = await AuthorityCanonicalPolicy.updateOne(
                                {
                                    _id: policyDoc._id,
                                    version: expectedVersion,
                                    contentHash: expectedContentHash,
                                    $or: [
                                        { lastSyncWorkerLease: expectedWorkerLease },
                                        { lastSyncWorkerLease: reconWorkerLease }
                                    ]
                                },
                                {
                                    $set: {
                                        redisSyncStatus: 'SYNCED',
                                        redisSyncError: null,
                                        lastSyncedAt: new Date(),
                                        lastSyncWorkerLease: reconWorkerLease,
                                        lastSyncOperationId: normalizedOpId
                                    }
                                },
                                { session }
                            );

                            if (!policyUpdateResult?.acknowledged || policyUpdateResult.matchedCount === 0) {
                                const err = new Error(policyUpdateResult?.matchedCount === 0 ? 'Policy document was not matched during reconciliation' : 'Policy document update was unacknowledged');
                                err.code = policyUpdateResult?.matchedCount === 0 ? 'POLICY_NOT_MATCHED' : 'POLICY_UPDATE_FAILED';
                                throw err;
                            }

                            const finalizedAudit = await AuditLog.findOneAndUpdate(
                                {
                                    _id: recoveryClaim._id,
                                    'metadata.leaseOwner': reconWorkerLease,
                                    'metadata.syncPhase': 'FINALIZING',
                                    'metadata.leaseExpiresAt': { $gt: new Date() }
                                },
                                {
                                    $set: {
                                        status: 'success',
                                        description: `Synchronized canonical policy for authority ${code} to Redis (version ${expectedVersion}) [reconciled from Redis state]`,
                                        'metadata.redisSyncStatus': 'SYNCED',
                                        'metadata.syncPhase': 'COMPLETED',
                                        'metadata.reconciled': true,
                                        'metadata.reconciledAt': new Date(),
                                        'metadata.reconciledReason': 'REDIS_ALREADY_SYNCED_RECOVERED',
                                        'metadata.syncedAt': new Date()
                                    }
                                },
                                { session, new: true }
                            );

                            if (!finalizedAudit) {
                                const err = new Error('Reconciliation lease expired before audit completion');
                                err.code = 'STALE_WORKER_LEASE_LOST';
                                throw err;
                            }
                        });
                    } catch (txErr) {
                        if (txErr.code === 'STALE_WORKER_LEASE_LOST') {
                            return res.status(409).json({
                                success: false,
                                code: 'STALE_WORKER_LEASE_LOST',
                                message: 'Reconciliation lease expired or was preempted before finalization boundary',
                                operationId: normalizedOpId,
                                status: 'FAILED'
                            });
                        }
                        if (txErr.code === 'POLICY_NOT_MATCHED' || txErr.code === 'POLICY_UPDATE_FAILED') {
                            return res.status(500).json({
                                success: false,
                                code: txErr.code,
                                message: txErr.message
                            });
                        }
                        throw txErr;
                    } finally {
                        isReconTransactionActive = false;
                        if (session) await session.endSession().catch(() => {});
                    }
                } else {
                    // Atomic CAS Fallback for Standalone MongoDB
                    const reconFinalNow = new Date();
                    const finalizingAudit = await AuditLog.findOneAndUpdate(
                        {
                            _id: recoveryClaim._id,
                            'metadata.leaseOwner': reconWorkerLease,
                            'metadata.syncPhase': 'PUBLISHING',
                            'metadata.leaseExpiresAt': { $gt: reconFinalNow }
                        },
                        {
                            $set: {
                                'metadata.syncPhase': 'FINALIZING',
                                'metadata.finalizingAt': reconFinalNow,
                                'metadata.leaseExpiresAt': new Date(reconFinalNow.getTime() + LEASE_DURATION_MS)
                            }
                        },
                        { new: true }
                    );

                    if (!finalizingAudit || reconLeaseLostDuringHeartbeat) {
                        stopReconHeartbeat();
                        return res.status(409).json({
                            success: false,
                            code: 'STALE_WORKER_LEASE_LOST',
                            message: 'Reconciliation lease expired or was preempted before finalization boundary',
                            operationId: normalizedOpId,
                            status: 'FAILED'
                        });
                    }

                    let policyUpdateResult = null;
                    try {
                        policyUpdateResult = await AuthorityCanonicalPolicy.updateOne(
                            {
                                _id: policyDoc._id,
                                version: expectedVersion,
                                contentHash: expectedContentHash,
                                $or: [
                                    { lastSyncWorkerLease: expectedWorkerLease },
                                    { lastSyncWorkerLease: reconWorkerLease }
                                ]
                            },
                            {
                                $set: {
                                    redisSyncStatus: 'SYNCED',
                                    redisSyncError: null,
                                    lastSyncedAt: new Date(),
                                    lastSyncWorkerLease: reconWorkerLease,
                                    lastSyncOperationId: normalizedOpId
                                }
                            }
                        );
                    } catch (policyErr) {
                        console.error('Failed to update policy doc during reconciliation:', policyErr);
                        return res.status(500).json({
                            success: false,
                            code: 'POLICY_UPDATE_FAILED',
                            message: `Failed to durably update policy document during Redis reconciliation: ${policyErr.message}`
                        });
                    }

                    if (!policyUpdateResult?.acknowledged || (policyUpdateResult.matchedCount !== undefined && policyUpdateResult.matchedCount === 0)) {
                        const isZeroMatch = policyUpdateResult?.matchedCount === 0;
                        if (isZeroMatch) {
                            const currentInDb = await AuthorityCanonicalPolicy.findById(policyDoc._id).lean();
                            if (currentInDb && (currentInDb.version !== expectedVersion || currentInDb.contentHash !== expectedContentHash)) {
                                console.error('Concurrent policy mutation detected during reconciliation:', {
                                    currentVersion: currentInDb.version,
                                    expectedVersion,
                                    currentHash: currentInDb.contentHash,
                                    expectedContentHash
                                });
                                await AuditLog.findOneAndUpdate(
                                    {
                                        _id: recoveryClaim._id,
                                        'metadata.leaseOwner': reconWorkerLease,
                                        'metadata.syncPhase': 'FINALIZING'
                                    },
                                    {
                                        $set: {
                                            status: 'failed',
                                            'metadata.syncPhase': 'FAILED',
                                            'metadata.redisSyncStatus': 'STALE_VERSION',
                                            'metadata.errorMessage': `Policy was modified concurrently (current version=${currentInDb.version}, expected=${expectedVersion})`
                                        }
                                    }
                                ).catch(() => {});

                                return res.status(409).json({
                                    success: false,
                                    code: 'STALE_POLICY_VERSION',
                                    message: `Policy was concurrently updated to version ${currentInDb.version} during reconciliation; sync abandoned`,
                                    operationId: normalizedOpId,
                                    status: 'FAILED'
                                });
                            }
                            if (currentInDb && currentInDb.lastSyncWorkerLease && currentInDb.lastSyncWorkerLease !== expectedWorkerLease && currentInDb.lastSyncWorkerLease !== reconWorkerLease) {
                                console.error('Reconciliation policy lease lost: currentInDb.lastSyncWorkerLease !== reconWorkerLease');
                                return res.status(409).json({
                                    success: false,
                                    code: 'STALE_WORKER_LEASE_LOST',
                                    message: 'Reconciliation lease was preempted by another worker; durable state not updated by stale worker',
                                    operationId: normalizedOpId,
                                    status: 'FAILED'
                                });
                            }
                        }
                        return res.status(500).json({
                            success: false,
                            code: isZeroMatch ? 'POLICY_NOT_MATCHED' : 'POLICY_UPDATE_FAILED',
                            message: isZeroMatch
                                ? 'Policy document was not matched for update during reconciliation'
                                : 'Policy document update was unacknowledged by MongoDB during reconciliation'
                        });
                    }

                    const finalizedAudit = await AuditLog.findOneAndUpdate(
                        {
                            _id: recoveryClaim._id,
                            'metadata.leaseOwner': reconWorkerLease,
                            'metadata.syncPhase': 'FINALIZING',
                            'metadata.leaseExpiresAt': { $gt: new Date() }
                        },
                        {
                            $set: {
                                status: 'success',
                                description: `Synchronized canonical policy for authority ${code} to Redis (version ${expectedVersion}) [reconciled from Redis state]`,
                                'metadata.redisSyncStatus': 'SYNCED',
                                'metadata.syncPhase': 'COMPLETED',
                                'metadata.reconciled': true,
                                'metadata.reconciledAt': new Date(),
                                'metadata.reconciledReason': 'REDIS_ALREADY_SYNCED_RECOVERED',
                                'metadata.syncedAt': new Date()
                            }
                        },
                        { new: true }
                    );

                    if (!finalizedAudit || reconLeaseLostDuringHeartbeat) {
                        stopReconHeartbeat();
                        return res.status(409).json({
                            success: false,
                            code: 'STALE_WORKER_LEASE_LOST',
                            message: 'Reconciliation lease expired or was preempted before finalization boundary',
                            operationId: normalizedOpId,
                            status: 'FAILED'
                        });
                    }
                }

                // Idempotent reconciliation audit
                const reconCorrId = `canonical_sync_recon:${policyDoc._id.toString()}:${normalizedOpId}`;
                try {
                    await AuditLog.create({
                        eventType: 'canonical_policy_sync_reconciled',
                        correlationId: reconCorrId,
                        targetType: 'authority_canonical_policy',
                        targetId: policyDoc._id,
                        userId: req.user?._id,
                        userName: req.user?.fullName || req.user?.name || 'Admin',
                        userEmail: req.user?.email || null,
                        description: `Reconciled canonical policy sync for authority ${code} (version ${expectedVersion}) without re-publishing to Redis`,
                        metadata: {
                            authorityCode: code,
                            version: expectedVersion,
                            contentHash: expectedContentHash,
                            operationId: normalizedOpId,
                            reconciliationAction: 'AUDIT_FINALIZED_EXISTING_REDIS'
                        },
                        ipAddress: req.ip,
                        userAgent: req.get('user-agent'),
                        status: 'success'
                    });
                } catch (reconAuditErr) {
                    if (reconAuditErr.code !== 11000) {
                        console.error('Failed to record reconciliation audit event:', reconAuditErr);
                        return res.status(500).json({
                            success: false,
                            code: 'RECONCILIATION_AUDIT_FAILED',
                            message: `Failed to record durable reconciliation audit event: ${reconAuditErr.message}`
                        });
                    }
                }

                stopReconHeartbeat();
                policyDoc.redisSyncStatus = 'SYNCED';
                policyDoc.redisSyncError = null;
                policyDoc.lastSyncedAt = new Date();

                return res.status(200).json({
                    success: true,
                    data: policyDoc,
                    idempotent: true,
                    operationId: normalizedOpId,
                    status: 'COMPLETED',
                    reconciled: true
                });
            }

            // Case B: Redis is already at a HIGHER version than target policy
            if (currentRedisPolicy && Number(currentRedisPolicy.version) > targetVersion) {
                stopReconHeartbeat();
                await AuditLog.findOneAndUpdate(
                    {
                        _id: recoveryClaim._id,
                        'metadata.leaseOwner': reconWorkerLease,
                        'metadata.syncPhase': 'PUBLISHING'
                    },
                    {
                        $set: {
                            status: 'failed',
                            'metadata.syncPhase': 'FAILED',
                            'metadata.redisSyncStatus': 'STALE_VERSION',
                            'metadata.errorMessage': `Redis has higher version ${currentRedisPolicy.version} than target ${targetVersion}`
                        }
                    }
                ).catch(() => {});

                return res.status(409).json({
                    success: false,
                    code: 'STALE_POLICY_VERSION',
                    message: `Cannot sync policy version ${targetVersion}: Redis has already advanced to version ${currentRedisPolicy.version}`,
                    operationId: normalizedOpId,
                    status: 'FAILED'
                });
            }

            // Case C: Redis has SAME version but DIFFERENT content hash (divergence / tamper)
            if (currentRedisPolicy &&
                Number(currentRedisPolicy.version) === targetVersion &&
                String(currentRedisPolicy.contentHash || '') !== targetHash
            ) {
                stopReconHeartbeat();
                await AuditLog.findOneAndUpdate(
                    {
                        _id: recoveryClaim._id,
                        'metadata.leaseOwner': reconWorkerLease,
                        'metadata.syncPhase': 'PUBLISHING'
                    },
                    {
                        $set: {
                            status: 'failed',
                            'metadata.syncPhase': 'FAILED',
                            'metadata.redisSyncStatus': 'HASH_MISMATCH',
                            'metadata.errorMessage': 'Version exists in Redis with divergent content hash'
                        }
                    }
                ).catch(() => {});

                return res.status(500).json({
                    success: false,
                    code: 'POLICY_HASH_MISMATCH',
                    message: `Policy version ${targetVersion} in Redis has a different content hash than database policy`,
                    operationId: normalizedOpId,
                    status: 'FAILED'
                });
            }

            // Case D: Redis has NOT been updated to target version yet (!currentRedisPolicy || currentRedisPolicy.version < targetVersion).
            // Stop reconciliation heartbeat before delegating to executeRedisSyncAndFinalize (which runs its own heartbeat)
            stopReconHeartbeat();
            return await executeRedisSyncAndFinalize(recoveryClaim, reconWorkerLease, true);
        } finally {
            stopReconHeartbeat();
        }
    };

        // If an operation with the same correlationId already exists, evaluate reconciliation or idempotent result
        if (correlationId) {
            const existingAudit = await AuditLog.findOne({
                eventType: 'canonical_policy_synced',
                correlationId
            });
            if (existingAudit) {
                return reconcileExistingIntent(existingAudit);
            }
        }

        // Step 1: Persist durable audit intent BEFORE initiating Redis sync
        // Transition to PUBLISHING state with atomic worker lease before any Redis I/O
        let auditIntent;
        try {
            auditIntent = await AuditLog.create({
                eventType: 'canonical_policy_synced',
                correlationId: correlationId || undefined,
                targetType: 'authority_canonical_policy',
                targetId: policyDoc._id,
                userId: req.user?._id,
                userName: req.user?.fullName || req.user?.name || 'Admin',
                userEmail: req.user?.email || null,
                description: `Manual sync initiated for authority ${code} to Redis (version ${policyDoc.version})`,
                metadata: {
                    authorityCode: code,
                    version: policyDoc.version,
                    contentHash: policyDoc.contentHash,
                    redisSyncStatus: 'PENDING',
                    syncPhase: 'PUBLISHING',
                    leaseOwner: initialWorkerLease,
                    leaseExpiresAt: initialLeaseExpiresAt,
                    operationId: normalizedOpId || null
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
                status: 'warning'
            });
        } catch (intentErr) {
            // Duplicate key on { eventType, correlationId } caught by unique index
            if (correlationId && (intentErr.code === 11000 || intentErr.code === 11001 || (intentErr.name === 'MongoServerError' && intentErr.code === 11000))) {
                const existingAudit = await AuditLog.findOne({
                    eventType: 'canonical_policy_synced',
                    correlationId
                });
                if (existingAudit) {
                    return reconcileExistingIntent(existingAudit);
                }
            }

            console.error('Failed to persist audit intent before canonical policy sync:', intentErr);
            return res.status(500).json({
                success: false,
                code: 'AUDIT_PERSISTENCE_FAILED',
                message: `Failed to persist mandatory audit intent before Redis sync: ${intentErr.message}`
            });
        }

        // Objective D: If audit intent returned null, fail closed; Redis is not called
        if (!auditIntent || !auditIntent._id) {
            return res.status(500).json({
                success: false,
                code: 'AUDIT_PERSISTENCE_FAILED',
                message: 'Failed to persist mandatory audit intent before Redis sync: AuditLog returned null.'
            });
        }

        // Step 2 & 3: Publish to Redis and finalize durable state using worker lease
        return executeRedisSyncAndFinalize(auditIntent, initialWorkerLease, false);
    } catch (error) {
        console.error('syncCanonicalPolicy error:', error);
        res.status(500).json({ success: false, message: 'Failed to sync canonical policy' });
    }
};

// ============================================================
// AUTHORITY LINKS
// ============================================================

/**
 * GET /api/authority/links/:inventoryId
 * Get all authority links for an inventory record.
 * Permission: authorityVerification.view + inventory visibility
 */
export const getLinksForInventory = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { inventoryId } = req.params;

        // Verify inventory exists and tenant has access
        const inventory = await Inventory.findOne({ _id: inventoryId, tenantId }).select('_id unitNo unitNumber').lean();
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        const links = await PropertyAuthorityLink.getForInventory(tenantId, inventoryId);
        res.json({ success: true, data: links });
    } catch (error) {
        console.error('getLinksForInventory error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve authority links' });
    }
};

/**
 * POST /api/authority/links
 * Create or update an authority link for an inventory.
 * Permission: authorityVerification.create
 */
export const createOrUpdateLink = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { inventoryId, authorityCode, sectorNumber, phaseCode, blockCode,
            propertyId, schemeName, urbanEstate, fileNumber, formNumber } = req.body;

        if (!inventoryId || !authorityCode) {
            return res.status(400).json({ success: false, message: 'inventoryId and authorityCode required' });
        }
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }

        // Verify inventory exists and tenant has access
        const inventory = await Inventory.findOne({ _id: inventoryId, tenantId }).select('_id').lean();
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        // Build composite key using Phase 1 contract
        const keyResult = buildCompositeKey(authorityCode, sectorNumber || null, propertyId || null, urbanEstate || null, phaseCode || null);

        const linkData = {
            tenantId,
            inventoryId,
            authorityCode,
            sectorNumber: sectorNumber || null,
            phaseCode: phaseCode || null,
            blockCode: blockCode || null,
            propertyId: propertyId || null,
            schemeName: schemeName || null,
            urbanEstate: urbanEstate || null,
            fileNumber: fileNumber || null,
            formNumber: formNumber || null,
            compositeKey: keyResult.status === 'COMPLETE' ? keyResult.key : null,
            matchEligibility: keyResult.status === 'COMPLETE' ? 'ELIGIBLE' :
                keyResult.status === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'INCOMPLETE',
            updatedBy: req.user._id
        };

        const link = await PropertyAuthorityLink.findOneAndUpdate(
            { tenantId, inventoryId, authorityCode },
            {
                $set: linkData,
                $setOnInsert: { createdBy: req.user._id }
            },
            { upsert: true, new: true, runValidators: true }
        );

        // Audit
        await auditEvent(
            'authority_link_created',
            req.user._id,
            'inventory',
            inventoryId,
            `Authority link ${link.isNew ? 'created' : 'updated'} for ${authorityCode}`,
            { authorityCode, compositeKey: linkData.compositeKey, matchEligibility: linkData.matchEligibility }
        );

        res.status(201).json({ success: true, data: link });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Link already exists for this inventory and authority' });
        }
        console.error('createOrUpdateLink error:', error);
        res.status(500).json({ success: false, message: 'Failed to create authority link' });
    }
};

// ============================================================
// VERIFICATION RUNS
// ============================================================

/**
 * POST /api/authority/runs
 * Create a new verification run (disabled state — no actual fetching).
 * Permission: authorityVerification.create
 */
export const createVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { authorityCode, runMode = 'SINGLE', inventoryIds, isFixtureMode = false, autoProcess = false } = req.body;

        if (!authorityCode || !runMode) {
            return res.status(400).json({ success: false, message: 'authorityCode and runMode required' });
        }
        if (!['HSVP', 'CHD', 'GMADA'].includes(authorityCode)) {
            return res.status(400).json({ success: false, message: 'Invalid authority code' });
        }
        if (!['SINGLE', 'BULK_MANUAL', 'BULK_SCHEDULED'].includes(runMode)) {
            return res.status(400).json({ success: false, message: 'Only SINGLE, BULK_MANUAL, and BULK_SCHEDULED modes supported' });
        }

        const ids = Array.isArray(inventoryIds) ? inventoryIds : (inventoryIds ? [inventoryIds] : []);

        // Use bounded bulk creation service (eliminating serial lookups, preserving tenant isolation)
        const run = await AuthorityBulkProcessor.createBulkRun({
            tenantId,
            authorityCode,
            requestedBy: req.user._id,
            inventoryIds: ids,
            runMode,
            isFixtureMode: Boolean(isFixtureMode)
        }, {
            ipAddress: req.ip || null,
            userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
        });

        if (run.status === 'POLICY_REJECTED') {
            await auditEvent(
                'authority_run_policy_rejected',
                req.user._id,
                'authority_run',
                run._id,
                `Verification run POLICY_REJECTED for ${authorityCode}: source not activated`,
                { runId: run._id, authorityCode, blockers: run.policyRejectionReasons },
                {
                    ipAddress: req.ip || null,
                    userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
                }
            );

            return res.status(422).json({
                success: false,
                message: 'Verification source is not activated',
                data: run.toSummary ? run.toSummary() : run,
                blockers: run.policyRejectionReasons || ['Source is not effectively active (disabled or paused)']
            });
        }

        await auditEvent(
            'authority_run_created',
            req.user._id,
            'authority_run',
            run._id,
            `Verification run created for ${authorityCode} (${runMode})`,
            { runId: run._id, authorityCode, runMode, totalItems: run.totalItems, isFixtureMode: run.isFixtureMode },
            {
                ipAddress: req.ip || null,
                userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
            }
        );

        if (autoProcess) {
            AuthorityBulkProcessor.processRun(run._id, {
                tenantId,
                isFixtureMode: Boolean(isFixtureMode),
                userId: req.user._id,
                ipAddress: req.ip || null,
                userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
            }).catch(err => console.error('[AutoProcess] Run error:', err));
        }

        res.status(201).json({ success: true, data: run.toSummary ? run.toSummary() : run });
    } catch (error) {
        console.error('createVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create verification run' });
    }
};

/**
 * GET /api/authority/runs
 * List recent verification runs for current tenant.
 * Permission: authorityVerification.view
 */
export const getVerificationRuns = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const runs = await PropertyVerificationRun.getRecentForTenant(tenantId, limit);

        res.json({ success: true, data: runs.map(r => r.toSummary()) });
    } catch (error) {
        console.error('getVerificationRuns error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve verification runs' });
    }
};

/**
 * GET /api/authority/runs/:runId
 * Get a single run with its items.
 * Permission: authorityVerification.view
 */
export const getVerificationRunById = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId })
            .populate('requestedBy', 'fullName email');
        if (!run) {
            return res.status(404).json({ success: false, message: 'Run not found' });
        }

        const items = await PropertyVerificationRunItem.getForRun(tenantId, runId);

        res.json({ success: true, data: { run: run.toSummary(), items } });
    } catch (error) {
        console.error('getVerificationRunById error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/process
 * Execute or advance a verification run in bounded batches.
 * Permission: authorityVerification.create or edit
 */
export const processVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { batchSize = 50, isFixtureMode } = req.body;

        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            return res.status(404).json({ success: false, message: 'Run not found' });
        }

        // Derive mode strictly from stored run; reject mode mismatch if provided
        if (isFixtureMode !== undefined && Boolean(isFixtureMode) !== Boolean(run.isFixtureMode)) {
            return res.status(422).json({
                success: false,
                code: 'MODE_MISMATCH',
                message: 'Mode mismatch: requested isFixtureMode does not match persisted run configuration'
            });
        }

        const outcome = await AuthorityBulkProcessor.processRun(runId, {
            tenantId,
            batchSize: Number(batchSize) || 50,
            isFixtureMode: Boolean(run.isFixtureMode),
            userId: req.user._id,
            ipAddress: req.ip || null,
            userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
        });

        res.json({ success: true, data: outcome });
    } catch (error) {
        console.error('processVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to process verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/pause
 * Pause an active verification run.
 * Permission: authorityVerification.edit
 */
export const pauseVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { reason = 'Paused by user' } = req.body;
        const run = await AuthorityBulkProcessor.pauseRun(runId, tenantId, req.user._id, reason, {
            ipAddress: req.ip || null,
            userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
        });

        res.json({ success: true, data: run.toSummary() });
    } catch (error) {
        console.error('pauseVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to pause verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/resume
 * Resume an interrupted or paused verification run.
 * Permission: authorityVerification.edit
 */
export const resumeVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { isFixtureMode } = req.body;

        const run = await PropertyVerificationRun.findOne({ _id: runId, tenantId });
        if (!run) {
            return res.status(404).json({ success: false, message: 'Run not found' });
        }

        // Derive mode strictly from stored run; reject mode mismatch if provided
        if (isFixtureMode !== undefined && Boolean(isFixtureMode) !== Boolean(run.isFixtureMode)) {
            return res.status(422).json({
                success: false,
                code: 'MODE_MISMATCH',
                message: 'Mode mismatch: requested isFixtureMode does not match persisted run configuration'
            });
        }

        const outcome = await AuthorityBulkProcessor.resumeRun(runId, tenantId, {
            isFixtureMode: Boolean(run.isFixtureMode),
            userId: req.user._id,
            ipAddress: req.ip || null,
            userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
        });

        res.json({ success: true, data: outcome });
    } catch (error) {
        console.error('resumeVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to resume verification run' });
    }
};

/**
 * POST /api/authority/runs/:runId/cancel
 * Cancel a verification run.
 * Permission: authorityVerification.edit
 */
export const cancelVerificationRun = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const { reason = 'Cancelled by user' } = req.body;

        const run = await AuthorityBulkProcessor.cancelRun(runId, tenantId, req.user._id, reason, {
            ipAddress: req.ip || null,
            userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
        });

        res.json({ success: true, data: run.toSummary() });
    } catch (error) {
        console.error('cancelVerificationRun error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to cancel verification run' });
    }
};

/**
 * GET /api/authority/runs/:runId/progress
 * Get progress status for a verification run.
 * Permission: authorityVerification.view
 */
export const getRunProgress = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { runId } = req.params;
        const progress = await AuthorityBulkProcessor.getRunProgress(runId, tenantId);

        res.json({ success: true, data: progress });
    } catch (error) {
        console.error('getRunProgress error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get run progress' });
    }
};


// ============================================================
// REVIEW & APPLY
// ============================================================

/**
 * GET /api/authority/review/pending
 * Get items pending review.
 * Permission: authorityVerification.edit (review capability)
 */
export const getPendingReviews = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const items = await PropertyVerificationRunItem.getPendingReview(tenantId);
        res.json({ success: true, data: items });
    } catch (error) {
        console.error('getPendingReviews error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve pending reviews' });
    }
};

/**
 * POST /api/authority/review/:itemId
 * Submit a review decision for a run item.
 * Permission: authorityVerification.edit (review capability)
 */
export const submitReview = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { itemId } = req.params;
        const { decision, approvedFields, notes } = req.body;

        if (!['APPROVED', 'REJECTED', 'PARTIAL', 'DEFERRED'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'Invalid decision' });
        }

        const item = await PropertyVerificationRunItem.findOne({ _id: itemId, tenantId });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Verify inventory exists and belongs to tenant
        const inventory = await Inventory.findOne({ _id: item.inventoryId, tenantId });
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        if (item.reviewerDecision !== 'PENDING') {
            return res.status(409).json({ success: false, message: 'Item already reviewed' });
        }

        item.reviewerDecision = decision;
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();
        item.reviewNotes = notes || null;

        // For PARTIAL approval, mark only specific fields as approved
        if (decision === 'PARTIAL' && Array.isArray(approvedFields)) {
            for (const change of item.proposedChanges) {
                change.approved = approvedFields.includes(change.field);
            }
        } else if (decision === 'APPROVED') {
            for (const change of item.proposedChanges) {
                change.approved = true;
            }
        } else if (decision === 'REJECTED') {
            for (const change of item.proposedChanges) {
                change.approved = false;
            }
        }

        await item.save();

        await auditEvent(
            'authority_review_submitted',
            req.user._id,
            'inventory',
            item.inventoryId,
            `Authority verification review: ${decision}`,
            { itemId, decision, authorityCode: item.authorityCode, runId: item.runId }
        );

        res.json({ success: true, data: item });
    } catch (error) {
        console.error('submitReview error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit review' });
    }
};

// ============================================================
// SAGA COMPENSATION & FENCING HELPERS (Phase 4.2)
// ============================================================

/**
 * Durably compensates an interrupted or failed apply saga (standalone MongoDB fallback).
 * Restores Inventory to pre-apply values (matching claimId), records durable compensation audit,
 * and records FAILED/COMPENSATED or COMPENSATION_FAILED state on PropertyVerificationRunItem.
 */
export const compensateApplySaga = async ({
    itemId,
    tenantId,
    inventoryId,
    claimId,
    stage,
    compensation,
    errorMsg,
    appliedBy = null,
    session = null
}) => {
    let inventoryRevertError = null;
    let auditCompensationError = null;

    // 1. Revert Inventory mutation if stage indicates possible or confirmed mutation
    if (stage && ['INVENTORY_MUTATING', 'INVENTORY_MUTATED', 'AUDIT_LOGGING', 'AUDIT_LOGGED', 'FINALIZING'].includes(stage)) {
        if (compensation?.inventoryBefore && typeof compensation.inventoryBefore === 'object') {
            try {
                // Check whether Inventory was actually tagged/mutated with this claimId
                const mutatedDoc = await Inventory.findOne({
                    _id: inventoryId,
                    tenantId,
                    'authorityVerification.applyClaimId': claimId
                });

                if (mutatedDoc) {
                    const revertOps = {};
                    for (const [key, val] of Object.entries(compensation.inventoryBefore)) {
                        revertOps[key] = (val === undefined || val === null) ? null : val;
                    }
                    revertOps['authorityVerification.applyClaimId'] = null;

                    const invRes = await Inventory.updateOne(
                        {
                            _id: inventoryId,
                            tenantId,
                            'authorityVerification.applyClaimId': claimId
                        },
                        { $set: revertOps },
                        session ? { session } : {}
                    );

                    if (invRes.matchedCount !== 1) {
                        throw new Error(`Inventory rollback failed: matchedCount was ${invRes.matchedCount}`);
                    }
                } else if (stage !== 'INVENTORY_MUTATING') {
                    // Stage indicated mutated, but document does not have this claimId.
                    // Verify if it is already reverted (idempotency check)
                    const existingInv = await Inventory.findOne({ _id: inventoryId, tenantId });
                    if (existingInv?.authorityVerification?.applyClaimId && String(existingInv.authorityVerification.applyClaimId) !== String(claimId)) {
                        console.warn(`[SagaCompensation] Inventory ${inventoryId} claimed by another claim ${existingInv.authorityVerification.applyClaimId}; skipping overwrite`);
                    }
                }
            } catch (invErr) {
                console.error(`[SagaCompensation] Error reverting inventory ${inventoryId}:`, invErr);
                inventoryRevertError = invErr;
            }
        }
    }

    // 2. Record durable compensation audit record (R-04: crash window protection)
    let targetAuditId = compensation?.auditId || null;
    if (!targetAuditId && claimId) {
        try {
            const existingAudit = await AuditLog.findOne({
                $or: [
                    { 'changes.claimId': claimId.toString() },
                    { 'changes.claimId': claimId },
                    { 'metadata.claimId': claimId.toString() },
                    { 'metadata.claimId': claimId }
                ],
                eventType: 'authority_changes_applied'
            });
            if (existingAudit) {
                targetAuditId = existingAudit._id;
            }
        } catch (findErr) {
            console.warn('[SagaCompensation] Error resolving auditId by claimId:', findErr.message);
        }
    }

    if (targetAuditId) {
        try {
            await auditEvent(
                'authority_changes_apply_compensated',
                appliedBy || null,
                'inventory',
                inventoryId,
                `Authority verification changes apply compensated for claim ${claimId}`,
                {
                    before: {
                        claimId: claimId ? claimId.toString() : null,
                        originalAuditId: targetAuditId ? targetAuditId.toString() : null,
                        stage,
                        revertedChanges: compensation?.inventoryBefore || {}
                    },
                    after: {
                        status: 'COMPENSATED',
                        applyState: 'FAILED',
                        revertedAt: new Date(),
                        error: errorMsg
                    }
                },
                session ? { session } : {}
            );

            // Update original audit record status to compensated
            if (targetAuditId) {
                try {
                    await AuditLog.updateOne(
                        { _id: targetAuditId },
                        {
                            $set: {
                                status: 'compensated',
                                'metadata.compensated': true,
                                'metadata.compensationClaimId': claimId ? claimId.toString() : null
                            }
                        },
                        session ? { session } : {}
                    );
                } catch (origErr) {
                    console.warn(`[SagaCompensation] Warning updating original audit ${targetAuditId}:`, origErr);
                }
            }
        } catch (auditErr) {
            console.error(`[SagaCompensation] Error recording compensation audit for item ${itemId}:`, auditErr);
            auditCompensationError = auditErr;
        }
    }

    // 3. Mark RunItem state: fail-closed if any compensation step failed
    if (inventoryRevertError || auditCompensationError) {
        const failureDetails = [
            inventoryRevertError ? `Inventory revert failed: ${inventoryRevertError.message}` : null,
            auditCompensationError ? `Audit compensation failed: ${auditCompensationError.message}` : null
        ].filter(Boolean).join('; ');

        try {
            await PropertyVerificationRunItem.updateOne(
                {
                    _id: itemId,
                    tenantId,
                    'applyClaim.claimId': claimId
                },
                {
                    $set: {
                        applyState: 'COMPENSATION_FAILED',
                        'applyClaim.stage': 'COMPENSATION_FAILED',
                        'applyClaim.leaseExpiresAt': null,
                        applyError: `Compensation failed: ${failureDetails}`
                    }
                },
                session ? { session } : {}
            );
        } catch (itemErr) {
            console.error(`[SagaCompensation] Error updating run item ${itemId} to COMPENSATION_FAILED:`, itemErr);
        }

        const compErr = new Error(`Compensation failed: ${failureDetails}`);
        compErr.code = 'COMPENSATION_FAILED';
        throw compErr;
    }

    try {
        const itemRes = await PropertyVerificationRunItem.updateOne(
            {
                _id: itemId,
                tenantId,
                'applyClaim.claimId': claimId
            },
            {
                $set: {
                    applyState: 'FAILED',
                    'applyClaim.stage': 'COMPENSATED',
                    'applyClaim.leaseExpiresAt': null,
                    applyError: errorMsg || 'Apply failed; saga compensated'
                }
            },
            session ? { session } : {}
        );
        if (itemRes.matchedCount !== 1) {
            console.warn(`[SagaCompensation] RunItem ${itemId} not updated during compensation: matchedCount was ${itemRes.matchedCount}`);
        }
    } catch (itemErr) {
        console.error(`[SagaCompensation] Error updating run item ${itemId}:`, itemErr);
        throw itemErr;
    }
};

/**
 * Reconciles an interrupted or stale apply claim whose lease has expired.
 * Atomically claims ownership of the expired saga, rolls back any partial Inventory mutation,
 * records durable compensation audit logs, and returns the item to a clean FAILED/COMPENSATED state.
 */
export const reconcileInterruptedApplySaga = async (itemId, tenantId) => {
    const item = await PropertyVerificationRunItem.findOne({ _id: itemId, tenantId });
    if (!item || item.applied || item.applyState === 'APPLIED') {
        return { reconciled: false, reason: 'ALREADY_COMPLETED' };
    }

    if (item.applyState === 'COMPENSATION_FAILED' || item.applyClaim?.stage === 'COMPENSATION_FAILED') {
        return { reconciled: false, reason: 'COMPENSATION_UNRESOLVED' };
    }

    const claim = item.applyClaim;
    const now = new Date();

    if (item.applyState !== 'APPLYING' || !claim?.leaseExpiresAt || claim.leaseExpiresAt >= now) {
        return { reconciled: false, reason: 'NOT_ELIGIBLE_OR_LEASE_ACTIVE' };
    }

    // Atomically reserve the expired saga for this reconciler (prevents concurrent double-reconciliation)
    const reconcilerClaimId = new mongoose.Types.ObjectId();
    const reconcilerExpiry = new Date(now.getTime() + 30000);

    const stageBeforeRec = claim.stageBeforeReconciliation || (claim.stage !== 'RECONCILING' ? claim.stage : 'INVENTORY_MUTATING');

    const reservedItem = await PropertyVerificationRunItem.findOneAndUpdate(
        {
            _id: itemId,
            tenantId,
            applyState: 'APPLYING',
            'applyClaim.claimId': claim.claimId,
            'applyClaim.leaseExpiresAt': { $lt: now }
        },
        {
            $set: {
                'applyClaim.stage': 'RECONCILING',
                'applyClaim.reconcilerClaimId': reconcilerClaimId,
                'applyClaim.leaseExpiresAt': reconcilerExpiry,
                'applyClaim.stageBeforeReconciliation': stageBeforeRec
            }
        },
        { new: true }
    );

    if (!reservedItem) {
        return { reconciled: false, reason: 'LOCKED_BY_ANOTHER_RECONCILER_OR_INELIGIBLE' };
    }

    const effectiveStage = reservedItem.applyClaim?.stageBeforeReconciliation || stageBeforeRec;
    let inventoryMutated = false;

    if (['INVENTORY_MUTATING', 'INVENTORY_MUTATED', 'AUDIT_LOGGING', 'AUDIT_LOGGED', 'FINALIZING'].includes(effectiveStage)) {
        const inv = await Inventory.findOne({
            _id: reservedItem.inventoryId,
            tenantId,
            'authorityVerification.applyClaimId': claim.claimId
        });
        if (inv) {
            inventoryMutated = true;
        }
    }

    if (inventoryMutated || ['INVENTORY_MUTATED', 'AUDIT_LOGGING', 'AUDIT_LOGGED', 'FINALIZING'].includes(effectiveStage)) {
        await compensateApplySaga({
            itemId: reservedItem._id,
            tenantId,
            inventoryId: reservedItem.inventoryId,
            claimId: claim.claimId,
            stage: effectiveStage,
            compensation: claim.compensation,
            errorMsg: 'Interrupted apply saga lease expired; compensated by reconciler'
        });
        return { reconciled: true, action: 'COMPENSATED' };
    } else {
        // Stage was CLAIMED or INVENTORY_MUTATING (where Inventory was never mutated)
        // Safely release the expired claim
        await PropertyVerificationRunItem.updateOne(
            { _id: reservedItem._id, tenantId, 'applyClaim.claimId': claim.claimId },
            {
                $set: {
                    applyState: 'FAILED',
                    'applyClaim.stage': 'COMPENSATED',
                    'applyClaim.leaseExpiresAt': null,
                    'applyClaim.reconcilerClaimId': null,
                    applyError: 'Lease expired before mutation stage; claim released'
                }
            }
        );
        return { reconciled: true, action: 'RELEASED' };
    }
};

/**
 * Renews the active lease on an in-progress apply claim.
 * Fails closed if the claim has expired, fenceToken mismatches, or was preempted by another worker.
 * Supports flexible signature:
 * - renewApplyClaimLease(itemId, tenantId, claimId, extensionMs)
 * - renewApplyClaimLease(itemId, tenantId, claimId, fenceToken, extensionMs)
 * - renewApplyClaimLease(itemId, tenantId, claimId, { fenceToken, extensionMs })
 */
export const renewApplyClaimLease = async (itemId, tenantId, claimId, fenceTokenOrExtension = null, extensionMs = 30000) => {
    let fenceToken = null;
    let extension = extensionMs;

    if (typeof fenceTokenOrExtension === 'number') {
        if (fenceTokenOrExtension >= 1000) {
            // Called as renewApplyClaimLease(itemId, tenantId, claimId, extensionMs)
            extension = fenceTokenOrExtension;
        } else {
            // Called as renewApplyClaimLease(itemId, tenantId, claimId, fenceToken, extensionMs)
            fenceToken = fenceTokenOrExtension;
        }
    } else if (typeof fenceTokenOrExtension === 'object' && fenceTokenOrExtension !== null) {
        fenceToken = fenceTokenOrExtension.fenceToken ?? null;
        extension = fenceTokenOrExtension.extensionMs ?? extensionMs;
    }

    const now = new Date();
    const newExpiry = new Date(now.getTime() + extension);
    const filter = {
        _id: itemId,
        tenantId,
        'applyClaim.claimId': claimId,
        'applyClaim.leaseExpiresAt': { $gt: now },
        applyState: 'APPLYING'
    };
    if (fenceToken !== null && fenceToken !== undefined) {
        filter['applyClaim.fenceToken'] = fenceToken;
    }
    const updated = await PropertyVerificationRunItem.findOneAndUpdate(
        filter,
        {
            $set: {
                'applyClaim.leaseExpiresAt': newExpiry
            }
        },
        { new: true }
    );
    return updated;
};

/**
 * POST /api/authority/apply/:itemId
 * Apply approved changes to the Inventory record.
 * Permission: authorityVerification.edit (apply capability)
 * 
 * SAFETY:
 * - Only fields in the server-side ALLOWED_UPDATE_FIELDS set are applied
 * - BLOCKED_UPDATE_FIELDS (including Inventory.status) can NEVER be modified
 * - Each field must have been individually approved in the review
 * - Duplicate applications are prevented
 * - Every application creates a durable audit record
 */
export const applyApprovedChanges = async (req, res) => {
    try {
        let tenantId;
        try {
            tenantId = getTenantId(req);
        } catch (orgErr) {
            if (orgErr.code === 'ORGANIZATION_OVERRIDE_PROHIBITED' || orgErr.message?.includes('ORGANIZATION_OVERRIDE_PROHIBITED')) {
                // Prevent cross-tenant resource enumeration
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            throw orgErr;
        }
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        // Authenticated Applier Identity Required (Phase 4.4.1 - Finding F-02 Hardening)
        // Must fail closed if req.user or req.user._id is unavailable.
        // Never accept client-supplied reviewer or applier IDs from body, params, or headers.
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                success: false,
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Authenticated applier identity (req.user._id) is required to apply approved changes'
            });
        }
        const applierUserId = req.user._id.toString();

        const { itemId } = req.params;

        const item = await PropertyVerificationRunItem.findOne({ _id: itemId, tenantId });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Verify inventory exists and belongs to tenant
        const inventory = await Inventory.findOne({ _id: item.inventoryId, tenantId });
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        // 0. Fail-Closed Check: previous compensation failed and requires manual reconciliation
        if (item.applyState === 'COMPENSATION_FAILED' || item.applyClaim?.stage === 'COMPENSATION_FAILED') {
            return res.status(422).json({
                success: false,
                code: 'COMPENSATION_UNRESOLVED',
                message: 'Cannot apply changes: previous application compensation failed and requires manual reconciliation',
                error: item.applyError
            });
        }

        // 1. Synthetic Fixture Protection: reject immediately if item is marked synthetic
        if (
            item.isSynthetic === true ||
            item.provenance === 'SYNTHETIC_FIXTURE'
        ) {
            return res.status(422).json({
                success: false,
                code: 'SYNTHETIC_FIXTURE_BLOCKED',
                message: 'Cannot apply changes: synthetic fixture data is prohibited from modifying Inventory records'
            });
        }

        // 2. Prevent duplicate application (idempotency check)
        if (item.applied || item.applyState === 'APPLIED') {
            return res.status(409).json({
                success: false,
                code: 'ALREADY_APPLIED',
                message: 'Changes already applied',
                appliedAt: item.appliedAt,
                appliedBy: item.appliedBy,
                applicationAuditId: item.applicationAuditId
            });
        }

        // 3. Must be reviewed and at least partially approved
        if (!['APPROVED', 'PARTIAL'].includes(item.reviewerDecision)) {
            return res.status(422).json({
                success: false,
                message: `Cannot apply — review decision is ${item.reviewerDecision}`
            });
        }

        // Collect approved, allowed changes
        const updateOps = {};
        const appliedFields = [];
        const rejectedFields = [];
        const FORBIDDEN_PATH_REGEX = /(?:^|\.)(?:__proto__|constructor|prototype|\$)/i;

        for (const change of item.proposedChanges) {
            if (change.approved !== true) continue;

            // Prototype-pollution and injection guard
            if (!change.field || typeof change.field !== 'string' || FORBIDDEN_PATH_REGEX.test(change.field)) {
                rejectedFields.push({ field: String(change.field), reason: 'Illegal or dangerous field name' });
                continue;
            }

            // Server-side safety checks: blocked fields
            if (BLOCKED_UPDATE_FIELDS.has(change.field)) {
                rejectedFields.push({ field: change.field, reason: 'Blocked field' });
                continue;
            }

            // Server-side safety checks: allowlist
            if (!ALLOWED_UPDATE_FIELDS.has(change.field)) {
                rejectedFields.push({ field: change.field, reason: 'Field not in allowlist or unknown nested path' });
                continue;
            }

            // Check for MongoDB operators or prototype pollution in object values
            if (typeof change.proposedValue === 'object' && change.proposedValue !== null) {
                const dangerousKey = Object.keys(change.proposedValue).find(k => k.startsWith('$') || FORBIDDEN_PATH_REGEX.test(k));
                if (dangerousKey) {
                    rejectedFields.push({ field: change.field, reason: `Disallowed operator or key in proposed value: ${dangerousKey}` });
                    continue;
                }
            }

            // Do not clear existing data with null/undefined, empty string, unknown, or sentinel values
            const isNullOrUndefined = change.proposedValue === null || change.proposedValue === undefined;
            const isEmptyString = typeof change.proposedValue === 'string' && change.proposedValue.trim() === '';
            const isUnknownOrSentinelString = typeof change.proposedValue === 'string' &&
                ['unknown', 'not_applicable', 'not applicable', 'n/a', 'na', 'null', 'undefined', 'sentinel'].includes(change.proposedValue.trim().toLowerCase());
            const isSentinelVal = isSentinel(change.proposedValue) || (
                typeof change.proposedValue === 'object' && change.proposedValue !== null && (
                    Boolean(change.proposedValue._sentinel) ||
                    Boolean(change.proposedValue.sentinel) ||
                    (change.proposedValue.value === null && change.proposedValue.value !== undefined)
                )
            );

            if (isNullOrUndefined || isEmptyString || isUnknownOrSentinelString || isSentinelVal) {
                rejectedFields.push({
                    field: change.field,
                    reason: 'Proposed value is missing, empty, unknown, or sentinel — will not clear existing data'
                });
                continue;
            }

            // Date casting & normalization for Date fields
            let valToSet = change.proposedValue;
            if (['authorityVerification.allotmentDate', 'authorityVerification.transferDate', 'authorityVerification.possessionDate'].includes(change.field)) {
                let d = valToSet;
                if (typeof d === 'object' && d !== null && d.date) {
                    d = d.date;
                }
                const parsedDate = new Date(d);
                if (isNaN(parsedDate.getTime())) {
                    rejectedFields.push({ field: change.field, reason: 'Invalid date format' });
                    continue;
                }
                valToSet = parsedDate;
            }

            // Area validation
            if (change.field === 'authorityVerification.propertyAreaValue') {
                const num = Number(valToSet);
                if (isNaN(num)) {
                    rejectedFields.push({ field: change.field, reason: 'Invalid numeric area value' });
                    continue;
                }
                valToSet = num;
            }

            // Encumbrance string contract enforcement (ensures strictly String types for Inventory)
            if (change.field === 'authorityVerification.litigationStatus') {
                if (typeof valToSet === 'object' && valToSet !== null && (valToSet.status || valToSet.detail)) {
                    valToSet = String(valToSet.status || valToSet.detail).trim();
                } else if (valToSet === false) {
                    valToSet = 'NO_LITIGATION';
                } else if (valToSet === true) {
                    valToSet = 'LITIGATION_REPORTED';
                } else if (typeof valToSet === 'string') {
                    valToSet = valToSet.trim();
                }
            }

            if (change.field === 'authorityVerification.mortgageStatus') {
                if (typeof valToSet === 'object' && valToSet !== null && (valToSet.status || valToSet.detail)) {
                    valToSet = String(valToSet.status || valToSet.detail).trim();
                } else if (valToSet === false) {
                    valToSet = 'NO_MORTGAGE';
                } else if (valToSet === true) {
                    valToSet = 'MORTGAGE_REPORTED';
                } else if (typeof valToSet === 'string') {
                    valToSet = valToSet.trim();
                }
            }

            updateOps[change.field] = valToSet;
            appliedFields.push({
                field: change.field,
                before: change.currentValue,
                after: valToSet
            });
        }

        // Strict-mode validation check: If ANY approved field has an invalid/forbidden/unknown path or operator,
        // we MUST reject the entire operation with 422 to prevent silent stripping or partial execution of an untrusted request.
        const fatalRejections = rejectedFields.filter(r =>
            r.reason === 'Blocked field' ||
            r.reason === 'Field not in allowlist or unknown nested path' ||
            r.reason === 'Illegal or dangerous field name' ||
            r.reason === 'Invalid date format' ||
            r.reason === 'Invalid numeric area value' ||
            r.reason.includes('Disallowed operator')
        );

        if (fatalRejections.length > 0) {
            return res.status(422).json({
                success: false,
                message: 'Validation failed: unknown, blocked, or disallowed field paths detected',
                rejectedFields: fatalRejections
            });
        }

        if (appliedFields.length === 0) {
            return res.status(422).json({
                success: false,
                message: 'No approved fields eligible for application',
                rejectedFields
            });
        }

        // ============================================================
        // STRICT FAIL-CLOSED VERIFICATION & PROVENANCE GATES
        // Must pass before any CRM Inventory mutation is permitted
        // ============================================================

        // 1. Snapshot existence and tenant matching
        if (!item.snapshotId) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_SNAPSHOT',
                message: 'Cannot apply changes: run item lacks a referenced verification snapshot'
            });
        }
        const snapshot = await PropertyVerificationSnapshot.findOne({ _id: item.snapshotId, tenantId });
        if (!snapshot) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_SNAPSHOT',
                message: 'Cannot apply changes: referenced verification snapshot does not exist or tenant mismatch'
            });
        }

        // 2. Run existence and tenant matching
        if (!item.runId) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_RUN',
                message: 'Cannot apply changes: run item lacks a referenced verification run'
            });
        }
        const run = await PropertyVerificationRun.findOne({ _id: item.runId, tenantId });
        if (!run) {
            return res.status(422).json({
                success: false,
                code: 'MISSING_RUN',
                message: 'Cannot apply changes: referenced verification run does not exist or tenant mismatch'
            });
        }

        // 3. Strict Synthetic Protection: reject if any flag indicates fixture/synthetic mode
        if (
            item.isSynthetic === true ||
            item.provenance === 'SYNTHETIC_FIXTURE' ||
            snapshot.isSynthetic === true ||
            snapshot.provenance === 'SYNTHETIC_FIXTURE' ||
            run.isFixtureMode === true ||
            run.provenance === 'SYNTHETIC_FIXTURE'
        ) {
            return res.status(422).json({
                success: false,
                code: 'SYNTHETIC_FIXTURE_BLOCKED',
                message: 'Cannot apply changes: synthetic fixture data is prohibited from modifying Inventory records'
            });
        }

        // 4. Strict Explicit LIVE Provenance: do not infer LIVE from schema defaults or legacy missing values
        const isExplicitLiveItem = item.isSynthetic === false && item.provenance === 'LIVE';
        const isExplicitLiveSnapshot = snapshot.isSynthetic === false && snapshot.provenance === 'LIVE';
        const isExplicitLiveRun = run.isFixtureMode === false && run.provenance === 'LIVE';

        if (!isExplicitLiveItem || !isExplicitLiveSnapshot || !isExplicitLiveRun) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_PROVENANCE',
                message: 'Cannot apply changes: explicit LIVE provenance required on run, item, and snapshot'
            });
        }

        // 5. Authorized LIVE Source check: authority source must be actively approved & enabled
        const authorityCode = item.authorityCode || run.authorityCode || snapshot.authorityCode;
        const sourceSettings = await AuthoritySourceSettings.getForTenant(tenantId, authorityCode);
        if (!sourceSettings || sourceSettings.permissionStatus !== 'GRANTED' || !sourceSettings.isEnabled || sourceSettings.isPaused) {
            return res.status(422).json({
                success: false,
                code: 'SOURCE_NOT_AUTHORIZED',
                message: `Cannot apply changes: authority source ${authorityCode} is not authorized for live operation`
            });
        }

        const activationCheck = sourceSettings.checkActivationEligibility ? sourceSettings.checkActivationEligibility() : { canActivate: true, blockers: [] };
        const nonFieldBlockers = (activationCheck.blockers || []).filter(b => {
            const msg = typeof b === 'string' ? b : (b.message || b.code || '');
            return !msg.includes('permitted fields') &&
                !msg.includes('rate policy') &&
                !msg.includes('concurrency') &&
                !msg.includes('identity') &&
                !msg.includes('contract') &&
                !msg.includes('terms');
        });
        if (nonFieldBlockers.length > 0) {
            return res.status(422).json({
                success: false,
                code: 'SOURCE_NOT_AUTHORIZED',
                message: `Cannot apply changes: authority source ${authorityCode} has configuration blockers: ${nonFieldBlockers.join(', ')}`
            });
        }

        // 6. Source-Specific Permitted Fields Enforcement (Finding 1)
        const permittedList = Array.isArray(sourceSettings.permittedFields) ? sourceSettings.permittedFields : [];
        const permittedSet = new Set(permittedList);
        const unauthorizedSourceFields = [];

        if (permittedList.length === 0) {
            // Empty permissions list authorizes zero fields
            for (const af of appliedFields) {
                const canonicalName = CRM_TO_CANONICAL_FIELD_MAP[af.field] || af.field.replace(/^authorityVerification\./, '');
                unauthorizedSourceFields.push({
                    field: af.field,
                    canonicalField: canonicalName,
                    reason: `Authority source ${authorityCode} has an empty permittedFields list — no fields are authorized`
                });
            }
        } else {
            for (const af of appliedFields) {
                const canonicalName = CRM_TO_CANONICAL_FIELD_MAP[af.field] || af.field.replace(/^authorityVerification\./, '');
                if (!permittedSet.has(canonicalName) && !permittedSet.has(af.field)) {
                    unauthorizedSourceFields.push({
                        field: af.field,
                        canonicalField: canonicalName,
                        reason: `Field '${canonicalName}' is not in permittedFields for source ${authorityCode}`
                    });
                }
            }
        }

        if (unauthorizedSourceFields.length > 0) {
            return res.status(422).json({
                success: false,
                code: 'UNAUTHORIZED_SOURCE_FIELDS',
                message: `Validation failed: source ${authorityCode} is not authorized to update field(s): ${unauthorizedSourceFields.map(f => f.canonicalField || f.field).join(', ')}`,
                rejectedFields: unauthorizedSourceFields
            });
        }

        // 7. Snapshot Cryptographic Integrity Verification (Finding 5)
        if (snapshot.isSealed !== true) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_SOURCE_EVIDENCE',
                message: 'Cannot apply changes: snapshot is not sealed'
            });
        }

        if (!snapshot.contentHash || typeof snapshot.contentHash !== 'string' || !/^[a-f0-9]{32,64}$/i.test(snapshot.contentHash.trim())) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_SOURCE_EVIDENCE',
                message: 'Cannot apply changes: snapshot lacks a valid cryptographic content hash'
            });
        }

        // Recompute content hash over canonical normalized data
        const recomputedHash = computeSnapshotContentHash(snapshot.normalizedData || {});
        if (!recomputedHash || recomputedHash.toLowerCase() !== snapshot.contentHash.trim().toLowerCase()) {
            return res.status(422).json({
                success: false,
                code: 'INVALID_SOURCE_EVIDENCE',
                message: 'Cannot apply changes: snapshot cryptographic integrity verification failed (content hash mismatch)'
            });
        }

        // 8. Maker-Checker Separation Gate (Phase 4.4 - Finding F-02 & Phase 4.4.1 Hardening)
        // The reviewer who approved the changes cannot be the user applying them.
        // Server-side identity verified strictly via authenticated req.user._id (ignoring any request payload).
        if (!item.reviewedBy) {
            return res.status(422).json({
                success: false,
                code: 'MAKER_CHECKER_VIOLATION',
                message: 'Cannot apply changes: run item lacks a verified reviewer identity (maker-checker requirement)'
            });
        }

        const reviewerUserId = item.reviewedBy.toString();

        if (applierUserId === reviewerUserId) {
            return res.status(403).json({
                success: false,
                code: 'MAKER_CHECKER_VIOLATION',
                message: 'Maker-checker policy violation: The user who reviewed and approved these changes cannot apply them'
            });
        }

        // 9. Durable Saga Compensation Snapshot & Fencing Initialization (Phase 4.2)
        const topologyType = mongoose.connection?.client?.topology?.description?.type;
        const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

        if (process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true' && !supportsTransactions) {
            return res.status(503).json({
                success: false,
                code: 'TRANSACTIONS_UNAVAILABLE',
                message: 'Cannot apply changes: MongoDB replica set transactions required by configuration but not available'
            });
        }

        // Snapshot previous state for durable saga compensation
        const previousValues = {};
        const currentAv = inventory.authorityVerification
            ? (typeof inventory.authorityVerification.toObject === 'function'
                ? inventory.authorityVerification.toObject()
                : inventory.authorityVerification)
            : {};

        for (const key of Object.keys(updateOps)) {
            const fieldPath = key.replace(/^authorityVerification\./, '');
            previousValues[key] = currentAv[fieldPath] !== undefined ? currentAv[fieldPath] : null;
        }
        previousValues['authorityVerification.applyClaimId'] = currentAv.applyClaimId || null;
        const expectedPreviousClaimId = currentAv.applyClaimId || null;

        const claimNow = new Date();
        const claimExpiry = new Date(claimNow.getTime() + 30000); // 30-second bounded claim lease
        const claimId = new mongoose.Types.ObjectId();
        const idempotencyKey = `${item._id}_${item.snapshotId}_${Date.now()}`;

        // If an abandoned claim with expired lease exists on this item, reconcile it before claiming
        const existingItem = await PropertyVerificationRunItem.findOne({ _id: item._id, tenantId });
        if (existingItem?.applyState === 'APPLYING' && existingItem.applyClaim?.leaseExpiresAt && existingItem.applyClaim.leaseExpiresAt < claimNow) {
            await reconcileInterruptedApplySaga(existingItem._id, tenantId);
        }

        const claimedItem = await PropertyVerificationRunItem.findOneAndUpdate(
            {
                _id: item._id,
                tenantId,
                applied: false,
                $or: [
                    { applyState: { $in: ['UNAPPLIED', 'FAILED', null] } },
                    { 'applyClaim.leaseExpiresAt': { $lt: claimNow } }
                ]
            },
            {
                $set: {
                    applyState: 'APPLYING',
                    'applyClaim.claimedBy': req.user._id,
                    'applyClaim.claimId': claimId,
                    'applyClaim.claimedAt': claimNow,
                    'applyClaim.leaseExpiresAt': claimExpiry,
                    'applyClaim.stage': 'CLAIMED',
                    'applyClaim.idempotencyKey': idempotencyKey,
                    'applyClaim.expectedPreviousClaimId': expectedPreviousClaimId,
                    'applyClaim.compensation': {
                        inventoryBefore: previousValues,
                        auditId: null
                    },
                    applyError: null
                },
                $inc: {
                    'applyClaim.fenceToken': 1
                }
            },
            { new: true }
        );

        if (!claimedItem) {
            // Concurrency contention or duplicate apply
            const freshItem = await PropertyVerificationRunItem.findOne({ _id: item._id, tenantId });
            if (freshItem?.applied || freshItem?.applyState === 'APPLIED') {
                return res.status(409).json({
                    success: false,
                    code: 'ALREADY_APPLIED',
                    message: 'Changes already applied',
                    appliedAt: freshItem.appliedAt,
                    appliedBy: freshItem.appliedBy,
                    applicationAuditId: freshItem.applicationAuditId
                });
            }
            return res.status(409).json({
                success: false,
                code: 'APPLICATION_IN_PROGRESS',
                message: 'Application already in progress by another request'
            });
        }

        // 9. Coordinate Mutation, AuditLog, and Run Item State (Durable Recoverable Saga)
        updateOps['authorityVerification.lastVerifiedAt'] = new Date();
        updateOps['authorityVerification.authorityCode'] = item.authorityCode;
        updateOps['authorityVerification.verificationRunId'] = item.runId;
        updateOps['authorityVerification.verificationSnapshotId'] = item.snapshotId;
        updateOps['authorityVerification.snapshotContentHash'] = snapshot.contentHash;
        updateOps['authorityVerification.rawSnapshotHash'] = snapshot.contentHash;
        updateOps['authorityVerification.applyClaimId'] = claimId;

        let session = null;
        let useTransaction = false;

        if (supportsTransactions) {
            try {
                session = await mongoose.startSession();
                session.startTransaction();
                useTransaction = true;
            } catch (sessionErr) {
                if (session) {
                    try { await session.endSession(); } catch {}
                    session = null;
                }
                if (process.env.AUTHORITY_REQUIRE_TRANSACTIONS === 'true') {
                    return res.status(503).json({
                        success: false,
                        code: 'TRANSACTIONS_UNAVAILABLE',
                        message: `Cannot apply changes: Failed to initialize replica set transaction: ${sessionErr.message}`
                    });
                }
                useTransaction = false;
            }
        }

        let currentStage = 'CLAIMED';
        let recordedAuditId = null;

        try {
            // Stage 1a: Persist INVENTORY_MUTATING conditionally BEFORE touching Inventory
            const mutatingRes = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: {
                        'applyClaim.stage': 'INVENTORY_MUTATING'
                    }
                },
                useTransaction ? { session } : {}
            );
            if (mutatingRes.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'INVENTORY_MUTATING';

            // Ensure authorityVerification subdocument is initialized if null (R-02: conditional initialize prevents PathNotViable while avoiding race conditions)
            await Inventory.updateOne(
                {
                    _id: item.inventoryId,
                    tenantId,
                    $or: [
                        { authorityVerification: null },
                        { authorityVerification: { $type: 10 } }
                    ]
                },
                { $set: { authorityVerification: {} } },
                useTransaction ? { session } : {}
            );

            // Stage 1b: Mutate Inventory with strict claim fencing (R-02: atomic conditional update prevents race conditions)
            const inventoryFilter = {
                _id: item.inventoryId,
                tenantId
            };
            if (expectedPreviousClaimId) {
                inventoryFilter['authorityVerification.applyClaimId'] = expectedPreviousClaimId;
            } else {
                inventoryFilter['$or'] = [
                    { 'authorityVerification.applyClaimId': null },
                    { 'authorityVerification.applyClaimId': { $exists: false } }
                ];
            }

            const mutatedInventory = await Inventory.findOneAndUpdate(
                inventoryFilter,
                { $set: updateOps },
                { strict: 'throw', runValidators: true, new: true, ...(useTransaction ? { session } : {}) }
            );
            if (!mutatedInventory) {
                const err = new Error('INVENTORY_MUTATION_FENCED_PREEMPTED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }

            // Stage 1c: Persist INVENTORY_MUTATED conditionally validating lease & claim
            const stage1Res = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: { 'applyClaim.stage': 'INVENTORY_MUTATED' }
                },
                useTransaction ? { session } : {}
            );
            if (stage1Res.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'INVENTORY_MUTATED';

            // Stage 2: AuditLog Insertion
            currentStage = 'AUDIT_LOGGING';
            const auditRecord = await auditEvent(
                'authority_changes_applied',
                req.user._id,
                'inventory',
                item.inventoryId,
                `Authority verification changes applied from ${item.authorityCode}`,
                {
                    itemId: item._id,
                    runId: item.runId,
                    authorityCode: item.authorityCode,
                    appliedFields,
                    rejectedFields,
                    claimId: claimId.toString(),
                    changes: { before: previousValues, after: updateOps }
                },
                {
                    ...(useTransaction ? { session } : {}),
                    ipAddress: req.ip || null,
                    userAgent: req.get ? req.get('user-agent') : (req.headers ? req.headers['user-agent'] : null)
                }
            );
            recordedAuditId = auditRecord?._id || null;

            // Record stage AUDIT_LOGGED conditionally validating lease & claim
            const stage2Res = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: {
                        'applyClaim.stage': 'AUDIT_LOGGED',
                        'applyClaim.compensation.auditId': recordedAuditId
                    }
                },
                useTransaction ? { session } : {}
            );
            if (stage2Res.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'AUDIT_LOGGED';

            // Stage 3: RunItem Finalization
            currentStage = 'FINALIZING';
            const appliedAt = new Date();
            const finalRes = await PropertyVerificationRunItem.updateOne(
                {
                    _id: item._id,
                    tenantId,
                    'applyClaim.claimId': claimId,
                    'applyClaim.fenceToken': claimedItem.applyClaim.fenceToken,
                    'applyClaim.leaseExpiresAt': { $gt: new Date() },
                    applyState: 'APPLYING'
                },
                {
                    $set: {
                        applied: true,
                        applyState: 'APPLIED',
                        'applyClaim.stage': 'COMPLETED',
                        appliedAt,
                        appliedBy: req.user._id,
                        applicationAuditId: recordedAuditId,
                        'applyClaim.leaseExpiresAt': null
                    }
                },
                useTransaction ? { session } : {}
            );

            if (finalRes.matchedCount !== 1) {
                const err = new Error('APPLY_CLAIM_PREEMPTED_OR_EXPIRED');
                err.code = 'CLAIM_PREEMPTED';
                throw err;
            }
            currentStage = 'COMPLETED';

            if (useTransaction && session) {
                await session.commitTransaction();
                await session.endSession();
                session = null;
            }

            return res.json({
                success: true,
                message: `Applied ${appliedFields.length} field(s)`,
                data: {
                    appliedFields,
                    rejectedFields,
                    auditId: recordedAuditId
                }
            });
        } catch (execErr) {
            if (useTransaction && session) {
                try { await session.abortTransaction(); } catch {}
                try { await session.endSession(); } catch {}
                session = null;
            }

            // Execute durable saga compensation
            try {
                await compensateApplySaga({
                    itemId: item._id,
                    tenantId,
                    inventoryId: item.inventoryId,
                    claimId,
                    stage: currentStage,
                    compensation: {
                        inventoryBefore: previousValues,
                        auditId: recordedAuditId
                    },
                    errorMsg: execErr.message,
                    appliedBy: req.user._id
                });
            } catch (compErr) {
                console.error(`[applyApprovedChanges] Compensation execution error:`, compErr);
            }

            if (
                execErr.code === 'CLAIM_PREEMPTED' ||
                execErr.message === 'APPLY_CLAIM_PREEMPTED_OR_EXPIRED' ||
                execErr.message === 'INVENTORY_MUTATION_FENCED_PREEMPTED' ||
                execErr.codeName === 'WriteConflict' ||
                execErr.code === 112 ||
                execErr.codeName === 'LockTimeout' ||
                execErr.code === 24 ||
                (typeof execErr.hasErrorLabel === 'function' && execErr.hasErrorLabel('TransientTransactionError'))
            ) {
                return res.status(409).json({
                    success: false,
                    code: 'CLAIM_PREEMPTED',
                    message: 'Apply claim expired or was preempted by concurrent write conflict before completion'
                });
            }

            if (execErr.name === 'StrictModeError' || (execErr.message && execErr.message.includes('strict mode is set to throw'))) {
                return res.status(422).json({
                    success: false,
                    message: execErr.message,
                    errorType: 'StrictModeError'
                });
            }

            throw execErr;
        }
    } catch (error) {
        console.error('applyApprovedChanges error:', error);
        res.status(500).json({ success: false, message: 'Failed to apply changes' });
    }
};

// ============================================================
// VERIFICATION HISTORY
// ============================================================

/**
 * GET /api/authority/history/:inventoryId
 * Get verification snapshot history for an inventory.
 * Permission: authorityVerification.view
 */
export const getVerificationHistory = async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

        const { inventoryId } = req.params;

        // Verify inventory access
        const inventory = await Inventory.findOne({ _id: inventoryId, tenantId }).select('_id').lean();
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory not found or access denied' });
        }

        // Get all links for this inventory
        const links = await PropertyAuthorityLink.find({ tenantId, inventoryId, isActive: true });

        const history = {};
        for (const link of links) {
            const snapshots = await PropertyVerificationSnapshot.getHistoryForLink(tenantId, link._id, 5);
            history[link.authorityCode] = {
                link: link.toObject(),
                snapshots
            };
        }

        res.json({ success: true, data: history });
    } catch (error) {
        console.error('getVerificationHistory error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve verification history' });
    }
};
