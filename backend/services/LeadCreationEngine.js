import mongoose from 'mongoose';
import Lead, { resolveLeadLookup } from '../models/Lead.js';
import { resolveContactIdentity } from './contactIdentity.service.js';
import { runFullLeadEnrichment } from '../src/utils/enrichmentEngine.js';
import LeadScoringService from '../src/services/LeadScoringService.js';

import OutboxEvent from '../models/OutboxEvent.js';
import { v4 as uuidv4 } from 'uuid';

export const createStandardizedLead = async (data, context = {}) => {
    let createdLeadId;
    let newContact = null;

    const isExternalSession = !!context.session;
    const session = context.session || await mongoose.startSession();
    
    const executeInTransaction = async () => {
        const contactRes = await resolveContactIdentity({
            mobile: data.mobile,
            email: data.email,
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
                personalAddress: data.personalAddress
            }
        });

        if (contactRes.success && contactRes.contact && !contactRes.conflict) {
            data.contactDetails = contactRes.contact._id;
            newContact = contactRes.contact;
        }

        const leadDoc = new Lead(data);
        await leadDoc.save({ session });
        createdLeadId = leadDoc._id;

        // R56 STAGE 1: Durable Outbox Integration
        await OutboxEvent.create([{
            eventId: uuidv4(),
            eventType: 'LeadCreated',
            aggregateType: 'Lead',
            aggregateId: leadDoc._id,
            payload: { triggerEvent: context.triggerEvent || 'onCreate' }
        }], { session });
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

    const lead = await Lead.findById(createdLeadId);

    // Return the exact same contract. Assignment is deferred to the domainEventWorker.
    return { success: true, lead, contact: newContact, assignment: null };
};

export default { createStandardizedLead };
