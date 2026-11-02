import crypto from 'crypto';

export const MIGRATION_NAME = '004-contact-phone-unique-index-migration';
export const PRODUCTION_CLUSTER_ID = 'production-atlas-7dehanz';
export const MAX_APPROVAL_TOKEN_AGE_MS = 5 * 60 * 1000;

/**
 * Generates an ephemeral Ed25519 asymmetric key pair for test suites.
 * Private key is strictly confined to test execution harnesses.
 */
export function generateTestDbaKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    return {
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' })
    };
}

/**
 * Test-only approval token signer using asymmetric digital signatures (Ed25519).
 * Used exclusively by test assertions to verify signature validation in Migration 004.
 */
export function signTestDbaApprovalToken(params = {}, privateKeyPem) {
    if (!privateKeyPem || typeof privateKeyPem !== 'string') {
        throw new Error('Test signer requires privateKeyPem');
    }
    const fullPayload = {
        approvalId: params.approvalId || crypto.randomUUID(),
        migration: params.migration || MIGRATION_NAME,
        operation: (params.operation || '').toUpperCase(),
        clusterId: params.clusterId || PRODUCTION_CLUSTER_ID,
        approver: params.approver,
        issuedAt: params.issuedAt !== undefined ? params.issuedAt : Date.now(),
        expiresAt: params.expiresAt !== undefined ? params.expiresAt : (Date.now() + MAX_APPROVAL_TOKEN_AGE_MS),
        purpose: params.purpose !== undefined ? params.purpose : 'PRODUCTION_UNIQUE_PHONE_INDEX_CREATION',
        auditRef: params.auditRef !== undefined ? params.auditRef : 'RFC-2026-004-TEST'
    };

    const payloadJson = JSON.stringify(fullPayload);
    const encodedPayload = Buffer.from(payloadJson, 'utf8').toString('base64url');
    const signature = crypto.sign(null, Buffer.from(encodedPayload, 'utf8'), privateKeyPem);
    const encodedSignature = signature.toString('base64url');

    return `${encodedPayload}.${encodedSignature}`;
}

/**
 * Creates an unauthenticated colon-separated local token.
 * Used exclusively by negative regression tests to prove that unsigned/local tokens are rejected.
 */
export function createUnauthenticatedLocalToken({
    migration = MIGRATION_NAME,
    operation = 'EXECUTE',
    clusterId = PRODUCTION_CLUSTER_ID,
    issuedAt = Date.now(),
    nonce = crypto.randomBytes(16).toString('hex')
} = {}) {
    return `${migration}:${operation.toUpperCase()}:${clusterId}:${issuedAt}:${nonce}`;
}
