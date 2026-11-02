/**
 * Portal Audit Sink
 *
 * Implements mandatory durable audit persistence for portal searches.
 * Logs eventType, authorityCode, criteriaHash, recordCount, contentHash, status.
 * Re-throws on persistence failure in production to enforce audit fail-closed behavior.
 */

import mongoose from 'mongoose';
import AuditLog from '../../../../models/AuditLog.js';

const SENSITIVE_KEY_PATTERN = /(?:cookie|token|csrf|viewstate|eventvalidation|eventtarget|eventargument|viewstategenerator|auth|authorization|bearer|password|secret|allottee|aadhaar|\bpan\b|mobile|email|phone|address)/i;

function sanitizeAuditMetadata(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            continue; // Exclude sensitive keys entirely
        }
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            sanitized[key] = sanitizeAuditMetadata(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

export class PortalAuditSink {
    constructor(auditModel = AuditLog, options = {}) {
        this.auditModel = auditModel;
        const isRunningInTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.argv.some(arg => String(arg).includes('test'));
        this.testMode = options.testMode ?? isRunningInTest;
        this.allowInMemoryFallback = Boolean(options.allowInMemoryFallback ?? this.testMode);
        if (process.env.NODE_ENV === 'production') {
            this.allowInMemoryFallback = false;
        }
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

        const rawEventType = String(event.eventType || 'authority_portal_search_requested').toLowerCase();
        const eventType = rawEventType.startsWith('authority_') ? rawEventType : `authority_${rawEventType}`;
        const description = event.description || `Authority portal audit event: ${eventType} (${event.authorityCode || 'UNKNOWN'})`;

        const metadata = sanitizeAuditMetadata(event.metadata || {});
        if (event.runId) metadata.runId = String(event.runId);
        if (event.runItemId) metadata.runItemId = String(event.runItemId);
        if (event.searchKey) metadata.criteriaHash = String(event.searchKey);

        const auditRecord = {
            eventType,
            description,
            action: eventType,
            targetType: 'authority_portal',
            userId: event.actorId || undefined,
            actorId: event.actorId || undefined,
            tenantId: event.tenantId || undefined,
            metadata,
            timestamp: event.occurredAt || event.at || new Date()
        };

        // Always keep in memory buffer
        this.inMemoryAuditLog.push(auditRecord);

        // Attempt durable persistence
        if (mongoose.connection?.readyState === 1 && this.auditModel && typeof this.auditModel.create === 'function') {
            try {
                await this.auditModel.create(auditRecord);
            } catch (err) {
                if (!this.allowInMemoryFallback) {
                    const auditErr = new Error(`PORTAL_AUDIT_WRITE_FAILED: Failed to persist audit log: ${err.message}`);
                    auditErr.code = 'PORTAL_AUDIT_WRITE_FAILED';
                    auditErr.cause = err;
                    throw auditErr;
                }
            }
        } else if (!this.allowInMemoryFallback) {
            const auditErr = new Error('PORTAL_AUDIT_WRITE_FAILED: MongoDB is not connected; mandatory audit record cannot be persisted.');
            auditErr.code = 'PORTAL_AUDIT_WRITE_FAILED';
            throw auditErr;
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
