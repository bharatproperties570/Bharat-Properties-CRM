import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_EVENTS = {
    'LeadUpdated': 'Lead',
    'ManualEnrichmentRequested': 'Lead',
    'ActivityCreated': 'Activity',
    'ActivityUpdated': 'Activity'
};

async function _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance) {
    if (!session) throw new Error("SECURITY_VIOLATION: Transaction session is required for domain event publishing");
    
    if (!ALLOWED_EVENTS[eventType]) {
        throw new Error(`SECURITY_VIOLATION: Unauthorized event type: ${eventType}`);
    }
    
    if (ALLOWED_EVENTS[eventType] !== aggregateType) {
        throw new Error(`SECURITY_VIOLATION: aggregateType must be ${ALLOWED_EVENTS[eventType]} for ${eventType}`);
    }

    if (!mongoose.Types.ObjectId.isValid(aggregateId)) {
        throw new Error("SECURITY_VIOLATION: Invalid aggregateId format");
    }

    const ModelName = aggregateType === 'Lead' ? 'Lead' : 'Activity';
    const Model = mongoose.models[ModelName] || mongoose.model(ModelName);
    const aggregateExists = await Model.exists({ _id: aggregateId }).session(session);
    if (!aggregateExists) {
        throw new Error(`SECURITY_VIOLATION: Target aggregate ${aggregateType} ${aggregateId} does not exist`);
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
            correlationId: global.getCorrelationId ? global.getCorrelationId() : uuidv4()
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }

    static async publishFromMobile(req, session, { eventType, aggregateType, aggregateId, payload }) {
        const provenance = {
            source: 'MOBILE',
            actorType: 'HUMAN',
            actorId: req.user?.id || req.user?._id || null,
            correlationId: global.getCorrelationId ? global.getCorrelationId() : uuidv4()
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }

    static async publishFromPublicForm(req, session, { eventType, aggregateType, aggregateId, payload }) {
        const provenance = {
            source: 'PUBLIC_FORM',
            actorType: 'EXTERNAL',
            actorId: null,
            correlationId: global.getCorrelationId ? global.getCorrelationId() : uuidv4()
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }

    static async publishFromWebhook(req, session, { eventType, aggregateType, aggregateId, payload }) {
        const provenance = {
            source: 'WEBHOOK',
            actorType: 'WEBHOOK',
            actorId: null,
            correlationId: global.getCorrelationId ? global.getCorrelationId() : uuidv4()
        };
        await _publishInternal(session, eventType, aggregateType, aggregateId, payload, provenance);
    }
}
