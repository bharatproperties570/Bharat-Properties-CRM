import { Worker } from '../config/redis.js';
import redisConnection from '../config/redis.js';
import mongoose from 'mongoose';
import { executeEffect } from './effectOrchestrator.js';

export const processDomainEvent = async (job) => {
    const { eventId, eventType, aggregateType, aggregateId, payload, correlationId } = job.data;
    
    if (!eventId || !eventType || !aggregateType || !aggregateId || !payload) {
        throw new Error('Invalid event envelope payload');
    }

    console.log(`[DomainEventWorker] Processing ${eventType} for ${aggregateType} ${aggregateId} (eventId: ${eventId})`);

    switch (eventType) {
        case 'LeadCreated': {
            const { runFullLeadEnrichment } = await import('../utils/enrichmentEngine.js');
            const LeadScoringService = (await import('../services/LeadScoringService.js')).default;
            const { distributeEntity } = await import('../utils/distributionEngine.js');

            const Lead = mongoose.model('Lead');

            await executeEffect(eventId, 'enrichment', aggregateType, aggregateId, async () => {
                const freshLead = await Lead.findById(aggregateId);
                if (freshLead) await runFullLeadEnrichment(freshLead);
            });

            await executeEffect(eventId, 'scoring', aggregateType, aggregateId, async () => {
                const freshLead = await Lead.findById(aggregateId);
                if (freshLead) await LeadScoringService.computeAndSave(freshLead._id);
            });

            await executeEffect(eventId, 'distribution', aggregateType, aggregateId, async () => {
                const freshLead = await Lead.findById(aggregateId);
                if (freshLead) await distributeEntity(freshLead, payload.triggerEvent || 'create', false);
            });

            break;
        }

        case 'DealCreated': {
            const Deal = mongoose.model('Deal');
            const deal = await Deal.findById(aggregateId).populate('inventoryId owner associatedContact').lean();
            if (!deal) throw new Error(`Deal ${aggregateId} not found`);

            const dealEffects = [];

            if (payload.triggerDistribution) {
                dealEffects.push({
                    key: 'distribution',
                    fn: async () => {
                        const { distributeEntity } = await import('../utils/distributionEngine.js');
                        await distributeEntity(deal, 'create', false);
                    }
                });
            }
            if (payload.triggerMarketing && deal.stage === 'Hot') {
                dealEffects.push({
                    key: 'marketing',
                    fn: async () => {
                        const CampaignEngineModule = await import('../../services/CampaignEngine.js');
                        const CampaignEngine = CampaignEngineModule.default || CampaignEngineModule;
                        await CampaignEngine.launch({ dealId: deal._id });
                    }
                });
            }
            if (payload.triggerSms) {
                dealEffects.push({
                    key: 'sms',
                    fn: async () => {
                        const smsServiceModule = await import('../../services/SmsService.js');
                        const smsService = smsServiceModule.default || smsServiceModule.smsService || smsServiceModule.SmsService || smsServiceModule;
                        if (smsService && typeof smsService.sendSMSWithTemplate === 'function') {
                            const extractPhone = (o) => o?.phone || o?.mobile || null;
                            const phone = extractPhone(deal.owner) || extractPhone(deal.associatedContact);
                            if (phone) {
                                await smsService.sendSMSWithTemplate(phone, 'deal_created', { deal });
                            }
                        }
                    }
                });
            }
            if (payload.triggerAiMatch) {
                dealEffects.push({
                    key: 'ai_match',
                    fn: async () => {
                        const { executeDispatch } = await import('../../controllers/marketing.controller.js');
                        await executeDispatch({ dealIds: [deal._id], toggles: { systemMatch: true }, hidePrice: false, hideUnit: false, hideLocation: false }, { id: deal.createdBy });
                    }
                });
            }
            if (payload.documents && payload.documents.length > 0) {
                dealEffects.push({
                    key: 'documents',
                    fn: async () => {
                        const { syncDocumentsToContact } = await import('../../utils/sync.js');
                        await syncDocumentsToContact(deal.associatedContact?._id || deal.associatedContact, payload.documents);
                    }
                });
            }
            if (payload.triggerDiscovery) {
                dealEffects.push({
                    key: 'discovery',
                    fn: async () => {
                        const invId = deal.inventoryId?._id || deal.inventoryId || payload.inventoryId;
                        if (invId) {
                            const { runProactiveDiscoveryForInventory } = await import('../../services/discovery.service.js');
                            await runProactiveDiscoveryForInventory(invId);
                        }
                    }
                });
            }

            const failures = [];
            for (const effect of dealEffects) {
                try {
                    await executeEffect(eventId, effect.key, aggregateType, aggregateId, effect.fn);
                } catch (err) {
                    console.error(`[DomainEventWorker] Deal ${aggregateId} effect ${effect.key} failed:`, err.message);
                    failures.push(err);
                }
            }

            if (failures.length > 0) {
                throw new AggregateError(failures, `DealCreated DomainEvent encountered ${failures.length} effect failures.`);
            }

            break;
        }


        case 'DealUpdated': {
            const Deal = mongoose.model('Deal');
            const User = mongoose.model('User');
            const Role = mongoose.models.Role || mongoose.model('Role', new mongoose.Schema({ name: String }, {strict:false}));
            const deal = await Deal.findById(aggregateId).lean();
            if (!deal) throw new Error(`Deal ${aggregateId} not found`);

            const dealEffects = [];

            dealEffects.push({
                key: 'campaign',
                fn: async () => {
                    const CampaignEngineModule = await import('../../services/CampaignEngine.js');
                    const CampaignEngine = CampaignEngineModule.default || CampaignEngineModule;
                    await CampaignEngine.launch(deal._id);
                }
            });

            if (payload.stageChanged) {
                dealEffects.push({
                    key: 'notification',
                    fn: async () => {
                        const { createNotification } = await import('../../controllers/notification.controller.js');

                        const assignedRMId = deal.assignedTo || deal.assignment?.assignedTo;
                        if (assignedRMId && String(assignedRMId) !== String(payload.triggeredBy)) {
                            await createNotification(
                                assignedRMId,
                                'deal',
                                `🔥 Deal Stage: ${payload.newStage}`,
                                `Deal for project "${deal.projectName}" moved to ${payload.newStage}.`,
                                `/deals/${deal._id}`,
                                { dealId: deal._id, stage: payload.newStage }
                            );
                        }

                        const milestoneStages = ['Won', 'Booked', 'Token Received', 'Sold Out'];
                        if (milestoneStages.includes(payload.newStage)) {
                            const mgrRoles = await Role.find({ name: { $in: ['manager', 'admin'] } }).select('_id').lean();
                            const roleIds = mgrRoles.map(r => r._id);
                            const managers = await User.find({
                                role: { $in: roleIds },
                                _id: { $ne: payload.triggeredBy }
                            }).select('_id').lean();

                            for (const mgr of managers) {
                                await createNotification(
                                    mgr._id,
                                    'deal',
                                    `💰 Achievement: Deal ${payload.newStage}!`,
                                    `Great news! A deal for "${deal.projectName}" has reached ${payload.newStage} status.`,
                                    `/deals/${deal._id}`,
                                    { dealId: deal._id, type: 'milestone' }
                                );
                            }
                        }
                    }
                });
            }

            if (payload.stageProvided) {
                dealEffects.push({
                    key: 'sms',
                    fn: async () => {
                        const smsServiceModule = await import('../modules/sms/sms.service.js');
                        const smsService = smsServiceModule.default || smsServiceModule;
                        const dealPop = await Deal.findById(deal._id).populate('owner associatedContact').lean();
                        const extractPhone = (contact) => {
                            if (!contact) return null;
                            if (contact.phones && Array.isArray(contact.phones) && contact.phones.length > 0) return contact.phones[0].number;
                            return contact.phone || contact.mobile || null;
                        };
                        const phone = extractPhone(dealPop.owner) || extractPhone(dealPop.associatedContact);
                        if (phone) {
                            await smsService.sendSMSWithTemplate(phone, 'deal_stage_updated', {
                                dealId: dealPop.dealId || dealPop._id.toString().slice(-6).toUpperCase(),
                                stage: dealPop.stage
                            });
                        }
                    }
                });
            }

            if (payload.stageChanged) {
                dealEffects.push({
                    key: 'workflow',
                    fn: async () => {
                        const { WorkflowEngine } = await import('../utils/WorkflowEngine.js');
                        await WorkflowEngine.fireEvent('deals', 'deal_stage_changed', deal, deal.companyId);
                    }
                });
            }

            if (payload.documents && Array.isArray(payload.documents)) {
                dealEffects.push({
                    key: 'documents',
                    fn: async () => {
                        const { syncDocumentsToContact } = await import('../../utils/sync.js');
                        const metadata = { projectName: deal.projectName, block: deal.block, unitNumber: deal.unitNo };
                        await syncDocumentsToContact(payload.documents, metadata);
                    }
                });
            }

            const failures = [];
            for (const effect of dealEffects) {
                try {
                    await executeEffect(eventId, effect.key, aggregateType, aggregateId, effect.fn);
                } catch (err) {
                    console.error(`[DomainEventWorker] DealUpdated effect ${effect.key} failed:`, err.message);
                    failures.push(err);
                }
            }

            if (failures.length > 0) {
                throw new AggregateError(failures, `DealUpdated DomainEvent encountered ${failures.length} effect failures.`);
            }

            break;
        }

        case 'LeadReassignmentRequested': {
            const { distributeEntity } = await import('../utils/distributionEngine.js');
            const Lead = mongoose.model('Lead');

            await executeEffect(eventId, 'distribution', aggregateType, aggregateId, async () => {
                const freshLead = await Lead.findById(aggregateId);
                if (freshLead) {
                    await distributeEntity(freshLead, payload.triggerEvent, false);
                }
            });

            break;
        }

        default:
            throw new Error(`Unsupported eventType: ${eventType}`);
    }

    return { success: true };
};

export const domainEventWorker = new Worker('domainEventQueue', processDomainEvent, { connection: redisConnection });

domainEventWorker.on('failed', (job, err) => {
    console.error(`[DomainEventWorker] Job ${job?.id} failed with error ${err.message}`);
});

// eslint-disable-next-line no-unused-vars
domainEventWorker.on('error', err => {
    // console.warn('⚠️ [DomainEventWorker] Redis Offline, suppressing crash...');
});

console.log('✅ Domain Event Worker Initialized');
