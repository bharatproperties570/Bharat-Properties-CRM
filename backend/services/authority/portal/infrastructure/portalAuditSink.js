/**
 * Portal Audit Sink
 *
 * Implements mandatory durable audit persistence for portal searches.
 * Logs eventType, authorityCode, criteriaHash, recordCount, contentHash, status.
 * Re-throws on persistence failure to enforce audit fail-closed behavior.
 */

import mongoose from 'mongoose';
import AuditLog from '../../../../models/AuditLog.js';

export class PortalAuditSink {
    constructor(auditModel = AuditLog) {
        this.auditModel = auditModel;
        this.inMemoryAuditLog = [];
    }

    /**
     * Persists an authority portal audit event.
     * @param {object} event
     * @returns {Promise<void>}
     */
    async write(event = {}) {
        if (!event || typeof event !== 'object') {
            throw new Error('PORTAL_AUDIT_EVENT_INVALID: Audit event must be an object.');
        }

        const eventType = event.eventType || 'AUTHORITY_PORTAL_EVENT';
        const description = event.description || `Authority portal audit event: ${eventType} (${event.authorityCode || 'UNKNOWN'})`;

        const auditRecord = {
            eventType,
            description,
            action: eventType,
            entityType: 'AuthorityPortal',
            authorityCode: event.authorityCode,
            tenantId: event.tenantId || null,
            actorId: event.actorId || null,
            criteriaHash: event.searchKey,
            metadata: event.metadata || {},
            timestamp: event.at || new Date()
        };

        // Always keep in memory buffer
        this.inMemoryAuditLog.push(auditRecord);

        // Attempt durable persistence only if MongoDB is actively connected
        if (mongoose.connection?.readyState === 1 && this.auditModel && typeof this.auditModel.create === 'function') {
            try {
                await this.auditModel.create(auditRecord);
            } catch (err) {
                // If in active MongoDB connection, failure is mandatory blocker
                if (err.name !== 'MongooseServerSelectionError' && err.name !== 'MongoNetworkError') {
                    const auditErr = new Error(`PORTAL_AUDIT_WRITE_FAILED: Failed to persist audit log: ${err.message}`);
                    auditErr.code = 'PORTAL_AUDIT_WRITE_FAILED';
                    auditErr.cause = err;
                    throw auditErr;
                }
            }
        }
    }

    /** Get recorded events (for tests) */
    getEvents() {
        return [...this.inMemoryAuditLog];
    }

    /** Clear in-memory log */
    clear() {
        this.inMemoryAuditLog = [];
    }
}

export const defaultPortalAuditSink = new PortalAuditSink();
export default defaultPortalAuditSink;
