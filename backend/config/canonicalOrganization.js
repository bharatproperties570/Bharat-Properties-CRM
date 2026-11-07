import mongoose from 'mongoose';

/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — CANONICAL SINGLE-ORGANIZATION CONTEXT
 * ============================================================================
 *
 *  Bharat Properties operates strictly as a single organization.
 *  All multi-tenant development remains strictly on HOLD.
 *  This module enforces the verified, immutable single-organization context.
 *  Arbitrary environment overrides and first-record ID inference are strictly prohibited.
 */

export const CANONICAL_ORGANIZATION_ID_STRING = '000000000000000000000001';

export const CANONICAL_ORGANIZATION_ID = Object.freeze(
    new mongoose.Types.ObjectId(CANONICAL_ORGANIZATION_ID_STRING)
);

export const CANONICAL_ORGANIZATION_NAME = 'Bharat Properties';

/**
 * Validates that any environment-specified organization ID strictly matches
 * the immutable canonical organization ID. Never silently overrides.
 * 
 * @throws {Error} If process.env.ORGANIZATION_ID is set and does not match canonical ID
 * @returns {boolean} True if context is verified
 */
export function verifyCanonicalOrganizationContext() {
    const envOrgId = process.env.ORGANIZATION_ID;
    if (envOrgId && envOrgId !== 'undefined' && String(envOrgId).trim() !== CANONICAL_ORGANIZATION_ID_STRING) {
        const err = new Error(
            `BLOCKED_CANONICAL_ORGANIZATION_MISMATCH: Environment ORGANIZATION_ID '${envOrgId}' does not match established canonical organization ID '${CANONICAL_ORGANIZATION_ID_STRING}'. Multi-tenant override is prohibited.`
        );
        err.code = 'BLOCKED_CANONICAL_ORGANIZATION_MISMATCH';
        throw err;
    }
    return true;
}

/**
 * Returns the proven single organization context.
 * 
 * @returns {{ organizationId: mongoose.Types.ObjectId, organizationName: string, model: string, tenantDevelopmentStatus: string }}
 */
export function getCanonicalOrganizationContext() {
    verifyCanonicalOrganizationContext();

    return Object.freeze({
        organizationId: CANONICAL_ORGANIZATION_ID,
        canonicalOrganizationId: CANONICAL_ORGANIZATION_ID,
        organizationName: CANONICAL_ORGANIZATION_NAME,
        canonicalOrganizationName: CANONICAL_ORGANIZATION_NAME,
        model: 'SINGLE_ORGANIZATION',
        tenantDevelopmentStatus: 'HOLD'
    });
}
