import crypto from 'crypto';

export const MIGRATION_NAME = '004-contact-phone-unique-index-migration';
export const PRODUCTION_CLUSTER_ID = 'production-atlas-7dehanz';
export const MAX_APPROVAL_TOKEN_AGE_MS = 5 * 60 * 1000;

/**
 * Computes standard SHA-256 SubjectPublicKeyInfo (SPKI) fingerprint.
 * Format: "SHA256:<64-char hex>"
 */
export function computePublicKeyFingerprint(publicKeyPem) {
    const keyObject = crypto.createPublicKey(publicKeyPem.trim());
    const der = keyObject.export({ type: 'spki', format: 'der' });
    return `SHA256:${crypto.createHash('sha256').update(der).digest('hex')}`;
}

/**
 * Generates an ephemeral Ed25519 asymmetric key pair for test suites.
 * Private key is strictly confined to test execution harnesses.
 */
export function generateTestDbaKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const fingerprint = computePublicKeyFingerprint(publicKeyPem);
    return {
        publicKeyPem,
        privateKeyPem,
        fingerprint
    };
}

/**
 * Creates a trusted key registry object pinning a test key pair to an approver.
 */
export function createTestTrustStore({
    approver = 'dba.lead@bharatproperties.in',
    keyId = 'kid-test-lead-2026',
    keyPair,
    status = 'ACTIVE',
    validFrom = Date.now() - 60000,
    validUntil = Date.now() + 86400000,
    revocationReason = null
} = {}) {
    const fingerprint = keyPair ? keyPair.fingerprint : 'SHA256:0000000000000000000000000000000000000000000000000000000000000000';
    const publicKey = keyPair ? keyPair.publicKeyPem : null;
    return {
        [approver]: {
            keyId,
            approver,
            fingerprint,
            publicKey,
            status,
            validFrom,
            validUntil,
            revocationReason
        }
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
        keyId: params.keyId || 'kid-test-lead-2026',
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
