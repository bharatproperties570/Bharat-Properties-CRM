/**
 * Represents a logical CRM authorization grant.
 * Stateless implementation.
 */
export default class AccessGrant {
    /**
     * @param {Object} params
     * @param {string} params.grantId - Unique ID for this grant (e.g. UUID)
     * @param {string} params.documentId - CRM Document ID
     * @param {string} params.versionId - Specific version ID (if bound to version)
     * @param {string} params.operation - READ, WRITE, DELETE
     * @param {string} params.subjectId - User ID who requested access
     * @param {number} params.expiresAt - Unix timestamp
     */
    constructor({ grantId, documentId, versionId, operation, subjectId, expiresAt }) {
        this.grantId = grantId;
        this.documentId = documentId;
        this.versionId = versionId;
        this.operation = operation;
        this.subjectId = subjectId;
        this.issuedAt = Date.now();
        this.expiresAt = expiresAt;
    }

    isExpired() {
        return Date.now() > this.expiresAt;
    }
}
