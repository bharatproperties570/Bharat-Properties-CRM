import mongoose from 'mongoose';
import Lead, { resolveLeadLookup } from '../models/Lead.js';
import { resolveContactIdentity } from './contactIdentity.service.js';
import { runFullLeadEnrichment } from '../src/utils/enrichmentEngine.js';
import LeadScoringService from '../src/services/LeadScoringService.js';

import OutboxEvent from '../models/OutboxEvent.js';
import { v4 as uuidv4 } from 'uuid';

export const createStandardizedLead = async (data, context = {}) => {
    let createdLeadId;
    let createdLeadDoc = null;
    let newContact = null;

    const isExternalSession = !!context.session;
    const session = context.session || await mongoose.startSession();
    
    const executeInTransaction = async () => {
        const effectiveTenantId = data.tenantId || context.tenantId || null;

        const contactRes = await resolveContactIdentity({
            mobile: data.mobile,
            email: data.email,
            tenantId: effectiveTenantId,
            session,
            createIfMissing: true,
            contactData: {
                name: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown Lead',
                title: data.salutation,
                tags: [...(data.tags || []), 'Lead Contact'],
                source: data.source,
                subSource: data.subSource,
                campaign: data.campaign,
                assignedTo: data.assignment?.assignedTo || data.owner,
                owner: data.owner,
                teams: data.teams || [],
                department: data.department,
                requirement: data.requirement,
                budget: data.budget,
                location: data.location,
                personalAddress: data.personalAddress,
                tenantId: effectiveTenantId
            }
        });

        if (contactRes.success && contactRes.contact && !contactRes.conflict) {
            data.contactDetails = contactRes.contact._id;
            newContact = contactRes.contact;
        }

        // 🛡️ Stage Qualification Engine: Auto-promote to targetStage if requirement completeness threshold is met
        if (!data.stage) {
            try {
                const { evaluateLeadStageQualification } = await import('../utils/leadDataCompleteness.js');
                const qualResult = await evaluateLeadStageQualification(data);
                if (qualResult.qualified) {
                    data.stage = await resolveLeadLookup('Stage', qualResult.targetStage || 'Prospect');
                } else {
                    data.stage = await resolveLeadLookup('Stage', 'Incoming');
                }
            } catch (err) {
                data.stage = await resolveLeadLookup('Stage', 'Incoming');
            }
        }

        if (effectiveTenantId && !data.tenantId) {
            data.tenantId = effectiveTenantId;
        }

        const leadDoc = new Lead(data);
        await leadDoc.save({ session });
        createdLeadId = leadDoc._id;
        createdLeadDoc = leadDoc;

        // R56 STAGE 1: Durable Outbox Integration with Multi-Tenancy & Provenance
        const outboxEntry = {
            eventId: uuidv4(),
            eventType: 'LeadCreated',
            aggregateType: 'Lead',
            aggregateId: leadDoc._id,
            payload: { triggerEvent: context.triggerEvent || 'onCreate' }
        };

        if (effectiveTenantId) {
            outboxEntry.tenantId = effectiveTenantId;
        }

        if (context.actorId || context.actorType || context.source) {
            outboxEntry.provenance = {
                source: context.source || 'HTTP',
                actorType: context.actorType || 'HUMAN',
                actorId: context.actorId || null,
                correlationId: context.correlationId || null
            };
        }

        await OutboxEvent.create([outboxEntry], { session });
    };

    if (isExternalSession) {
        await executeInTransaction();
    } else {
        try {
            await session.withTransaction(async () => {
                await executeInTransaction();
            });
        } finally {
            await session.endSession();
        }
    }

    const lead = isExternalSession
        ? ((await Lead.findById(createdLeadId).session(session)) || createdLeadDoc)
        : await Lead.findById(createdLeadId);

    // Return the exact same contract. Assignment is deferred to the domainEventWorker.
    return { success: true, lead, contact: newContact, assignment: null };
};

export default { createStandardizedLead };
