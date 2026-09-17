import mongoose from 'mongoose';
import Lead from '../../../models/Lead.js';
import AutomationLog from '../../../models/AutomationLog.js';
import { resolveLookup, resolveAllReferenceFields } from '../../../controllers/lead.controller.js';
import { resolveContactIdentity } from '../../../services/contactIdentity.service.js';
import { withMongoTransaction } from '../../../utils/withMongoTransaction.js';

export class IdentityConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IdentityConflictError';
    }
}

export class DuplicateRequestError extends Error {
    constructor(message, lead) {
        super(message);
        this.name = 'DuplicateRequestError';
        this.lead = lead;
    }
}

export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class LeadCreationEngine {
    static async createLead(payload, context, session = null) {
        const execute = async (sess) => {
            // 1. Idempotency Check (if provided)
            let idempotencyLog = null;
            if (context.idempotencyKey) {
                const existingLog = await AutomationLog.findOne({
                    idempotencyKey: context.idempotencyKey,
                    ruleType: 'LeadCreationRequest'
                }).session(sess);

                if (existingLog) {
                    const existingLead = await Lead.findById(existingLog.targetEntityId).session(sess);
                    if (existingLead) {
                        return { lead: existingLead, isIdempotentRetry: true };
                    }
                }
            }

            // 2. Normalization & Reference Resolution
            const data = { ...payload };
            await resolveAllReferenceFields(data);

            // 3. Defaults
            if (!data.stage) data.stage = await resolveLookup('Stage', 'Incoming');
            if (!data.status) data.status = await resolveLookup('Status', 'New');

            // 4. Enterprise Context
            if (context.user) {
                if (context.user.department && !data.department) data.department = context.user.department;
                if (context.user.teams && context.user.teams.length > 0 && (!data.teams || data.teams.length === 0)) {
                    data.teams = context.user.teams.map(t => t._id || t);
                }
            }

            // 5. Contact Identity Resolution
            const contactRes = await resolveContactIdentity({
                mobile: data.mobile,
                email: data.email,
                session: sess,
                createIfMissing: false
            });

            if (contactRes.conflict) {
                throw new IdentityConflictError('Mobile and Email resolve to different Contacts.');
            }

            if (contactRes.success && contactRes.contact) {
                data.contactDetails = contactRes.contact._id;
            }

            // 6. Lead Persistence
            const leadDoc = new Lead(data);
            await leadDoc.save({ session: sess });

            // 7. Request Idempotency Record
            if (context.idempotencyKey) {
                idempotencyLog = new AutomationLog({
                    ruleType: 'LeadCreationRequest',
                    targetEntityId: leadDoc._id,
                    targetModule: 'LeadCreation',
                    status: 'success',
                    idempotencyKey: context.idempotencyKey,
                    executedAt: new Date(),
                    details: { message: 'Lead created successfully' }
                });
                await idempotencyLog.save({ session: sess });
            }

            
            // 8. PendingDistribution Outbox Record
            const pendingDistributionLog = new AutomationLog({
                ruleType: 'TriggerDistribution',
                targetEntityId: leadDoc._id,
                targetModule: 'LeadDistribution',
                status: 'pending',
                idempotencyKey: `PendingDistribution:${leadDoc._id}`,
                executedAt: new Date(),
                details: { triggerEvent: 'onCreate' }
            });
            await pendingDistributionLog.save({ session: sess });

            // 9. Transactional Outbox (DomainEvent)
            const domainEventLog = new AutomationLog({
                ruleType: 'DomainEvent',
                targetEntityId: leadDoc._id,
                targetModule: 'Lead',
                status: 'pending',
                idempotencyKey: `DomainEvent:LEAD_CREATED:${leadDoc._id}`,
                executedAt: new Date(),
                details: { eventType: 'LEAD_CREATED', entityId: leadDoc._id, entityType: 'Lead' }
            });
            await domainEventLog.save({ session: sess });

            return { lead: leadDoc, isIdempotentRetry: false };
        };

        if (session) {
            return await execute(session);
        } else {
            let result;
            await withMongoTransaction(async (sess) => {
                result = await execute(sess);
            });
            
            // POST-COMMIT ENQUEUE: Immediate processing if we owned the transaction
            if (result && !result.isIdempotentRetry) {
                try {
                    const { distributionQueue } = await import('../../queues/queueManager.js');
                    await distributionQueue.add('process_domain_event', {
                        idempotencyKey: `DomainEvent:LEAD_CREATED:${result.lead._id}`
                    }, { jobId: `DomainEvent:LEAD_CREATED:${result.lead._id}`, removeOnComplete: true });
                } catch (err) {
                    console.error('[LeadCreationEngine] Failed to enqueue process_domain_event', err);
                }
            }
            return result;
        }
    }
}
