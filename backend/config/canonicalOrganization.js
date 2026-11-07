import mongoose from 'mongoose';

/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — CANONICAL SINGLE-ORGANIZATION CONTEXT
 * ============================================================================
 *
 *  Bharat Properties operates strictly as a single organization.
 *  All multi-tenant development remains strictly on HOLD.
 *  This module provides the verified, immutable single-organization context
 *  to eliminate unscoped queries and arbitrary first-record ID inference.
 */

export const CANONICAL_ORGANIZATION_ID = Object.freeze(
    new mongoose.Types.ObjectId(process.env.ORGANIZATION_ID || '000000000000000000000001')
);

export const CANONICAL_ORGANIZATION_NAME = 'Bharat Properties';

/**
 * Returns the proven single organization context.
 * 
 * @returns {{ organizationId: mongoose.Types.ObjectId, organizationName: string, model: string, tenantDevelopmentStatus: string }}
 */
export function getCanonicalOrganizationContext() {
    if (!CANONICAL_ORGANIZATION_ID || !mongoose.isValidObjectId(CANONICAL_ORGANIZATION_ID)) {
        throw new Error('BLOCKED_CANONICAL_ORGANIZATION_UNRESOLVED: Canonical organization ID is invalid or missing.');
    }

    return Object.freeze({
        organizationId: CANONICAL_ORGANIZATION_ID,
        canonicalOrganizationId: CANONICAL_ORGANIZATION_ID,
        organizationName: CANONICAL_ORGANIZATION_NAME,
        canonicalOrganizationName: CANONICAL_ORGANIZATION_NAME,
        model: 'SINGLE_ORGANIZATION',
        tenantDevelopmentStatus: 'HOLD'
    });
}
