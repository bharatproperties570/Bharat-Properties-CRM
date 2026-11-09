/**
 * auditCapabilityToken.js
 * 
 * Ephemeral, unforgeable capability symbol for document verification audit mutations.
 * This symbol is private to the trusted DocumentAuditService and Document model.
 * 
 * Ordinary callers, controllers, routes, user request bodies, or query options
 * passing plain boolean flags (e.g. { isAuthorizedAuditWorkflow: true }) cannot
 * forge this JavaScript Symbol.
 */

export const AUDIT_CAPABILITY_TOKEN = Symbol('DOCUMENT_AUDIT_AUTHORIZATION_CAPABILITY');
