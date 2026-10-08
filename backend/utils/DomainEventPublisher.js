import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_EVENTS = [
    'LeadUpdated',
    'ActivityCreated',
    'ActivityUpdated',
    'ManualEnrichmentRequested'
];

async function _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance) {
    if (!session) throw new Error("SECURITY_VIOLATION: Transaction session is required for domain event publishing");
    if (!ALLOWED_EVENTS.includes(eventType)) {
        throw new Error(`SECURITY_VIOLATION: Unauthorized event type: ${eventType}`);
    }
    
    if (['LeadUpdated', 'ManualEnrichmentRequested'].includes(eventType) && aggregateType !== 'Lead') {
        throw new Error(`SECURITY_VIOLATION: aggregateType must be Lead for ${eventType}`);
    }
    if (['ActivityCreated', 'ActivityUpdated'].includes(eventType) && aggregateType !== 'Activity') {
        throw new Error(`SECURITY_VIOLATION: aggregateType must be Activity for ${eventType}`);
    }

    const OutboxEvent = mongoose.models.OutboxEvent || mongoose.model('OutboxEvent');
    await OutboxEvent.create([{
        eventId: uuidv4(),
        eventType,
        aggregateType,
        aggregateId,
        payload,
        provenance
    }], { session });
}

export class DomainEventPublisher {
    static async publishFromHttp(req, session, { eventType, aggregateType, aggregateId, payload }) {
        const provenance = {
            source: 'HTTP',
            actorType: 'HUMAN',
            actorId: req.user?.id || req.user?._id || null,
            correlationId: global.getCorrelationId ? global.getCorrelationId() : null
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }

    static async publishFromMobile(req, session, { eventType, aggregateType, aggregateId, payload }) {
        const provenance = {
            source: 'MOBILE',
            actorType: 'HUMAN',
            actorId: req.user?.id || req.user?._id || null,
            correlationId: global.getCorrelationId ? global.getCorrelationId() : null
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }

    static async publishFromPublicForm(req, session, { eventType, aggregateType, aggregateId, payload }) {
        const provenance = {
            source: 'PUBLIC_FORM',
            actorType: 'EXTERNAL',
            actorId: null,
            correlationId: global.getCorrelationId ? global.getCorrelationId() : null
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }

    static async publishFromWebhook(req, session, { eventType, aggregateType, aggregateId, payload }) {
        const provenance = {
            source: 'WEBHOOK',
            actorType: 'WEBHOOK',
            actorId: null,
            correlationId: global.getCorrelationId ? global.getCorrelationId() : null
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }
}
