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
            const { leadPopulateFields } = await import('../../controllers/lead.controller.js');

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

            await executeEffect(eventId, 'sms_welcome', aggregateType, aggregateId, async () => {
                const freshLead = await Lead.findById(aggregateId);
                if (freshLead && freshLead.mobile) {
                    const smsService = (await import('../modules/sms/sms.service.js')).default;
                    await smsService.sendSMSWithTemplate(
                        freshLead.mobile,
                        'Get Response',
                        { Name: freshLead.firstName || 'Customer' },
                        { entityType: 'Lead', entityId: freshLead._id }
                    );
                }
            });

            await executeEffect(eventId, 'conflict_notification', aggregateType, aggregateId, async () => {
                const freshLead = await Lead.findById(aggregateId);
                if (freshLead && freshLead.mobile) {
                    const existingLead = await Lead.findOne({
                        _id: { $ne: aggregateId },
                        mobile: freshLead.mobile
                    }).populate('owner').lean();

                    if (existingLead && existingLead.owner) {
                        const { createNotification } = await import('../../controllers/notification.controller.js');
                        await createNotification(
                            existingLead.owner._id,
                            'conflictAlerts',
                            '⚠️ Duplicate Lead Attempt',
                            `Someone just tried to register your client ${freshLead.firstName} (${freshLead.mobile}). Lead was merged/blocked.`,
                            `/leads/${existingLead._id}`,
                            { duplicateLeadId: freshLead._id }
                        );
                    }
                }
            });

            await executeEffect(eventId, 'workflow_trigger', aggregateType, aggregateId, async () => {
                const freshLead = await Lead.findById(aggregateId).populate(leadPopulateFields);
                if (freshLead) {
                    const { WorkflowEngine } = await import('../utils/WorkflowEngine.js');
                    await WorkflowEngine.fireEvent('leads', 'lead_created', freshLead, freshLead.companyId);
                }
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

            dealEffects.push({
                key: 'workflow',
                fn: async () => {
                    const { WorkflowEngine } = await import('../../src/utils/WorkflowEngine.js');
                    await WorkflowEngine.fireEvent('deals', 'deal_created', deal, deal.companyId);
                }
            });

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


        case 'ActivityCreated':
            if (payload.entityType?.toLowerCase() === 'lead' && payload.entityId) {
                await executeEffect(eventId, 'activity_enrichment', aggregateType, aggregateId, async () => {
                    const QueueManager = await import('../queues/queueManager.js');
                    await QueueManager.enrichmentQueue.add('enrichLead', { leadId: payload.entityId });
                });
                await executeEffect(eventId, 'activity_scoring', aggregateType, aggregateId, async () => {
                    const { default: LeadScoringService } = await import('../services/LeadScoringService.js');
                    await LeadScoringService.computeAndSave(payload.entityId, { triggeredBy: 'activity_created' });
                });
            }
            await executeEffect(eventId, 'activity_notification', aggregateType, aggregateId, async () => {
                const { default: NotificationEngine } = await import('../../services/NotificationEngine.js');
                if (payload.assignedTo || payload.owner) {
                    const recipient = payload.assignedTo || payload.owner;
                    await NotificationEngine.notifyWhatsApp(recipient, 'activities', 'New Activity', `Activity created: ${payload.subject}`, `/activities/${aggregateId}`);
                }
            });
            await executeEffect(eventId, 'activity_google_sync', aggregateType, aggregateId, async () => {
                const QueueManager = await import('../queues/queueManager.js');
                await QueueManager.googleSyncQueue.add('syncEvent', { activityId: aggregateId });
            });
            await executeEffect(eventId, 'activity_whatsapp_trigger', aggregateType, aggregateId, async () => {
                const { default: ActivityTriggerService } = await import('../services/ActivityTriggerService.js');
                await ActivityTriggerService.executeActivityWhatsAppTriggers({ _id: aggregateId, ...payload }, { id: payload.actorId }, 'activity_created');
            });
            await executeEffect(eventId, 'activity_workflow_created', aggregateType, aggregateId, async () => {
                const { WorkflowEngine } = await import("../utils/WorkflowEngine.js");
                await WorkflowEngine.fireEvent('activities', 'activity_created', { _id: aggregateId, ...payload }, payload.companyId);
            });
            if (['Call', 'Call Back', 'call', 'Voice'].includes(payload.type)) {
                await executeEffect(eventId, 'activity_workflow_call_logged', aggregateType, aggregateId, async () => {
                    const { WorkflowEngine } = await import("../utils/WorkflowEngine.js");
                    await WorkflowEngine.fireEvent('communication', 'call_logged', { _id: aggregateId, ...payload }, payload.companyId);
                });
                if (payload.details?.callOutcome || payload.completionResult) {
                    await executeEffect(eventId, 'activity_workflow_call_outcome', aggregateType, aggregateId, async () => {
                        const { WorkflowEngine } = await import("../utils/WorkflowEngine.js");
                        await WorkflowEngine.fireEvent('communication', 'call_outcome_selected', { _id: aggregateId, ...payload }, payload.companyId);
                    });
                }
            }
            await executeEffect(eventId, 'activity_media_download', aggregateType, aggregateId, async () => {
                if (payload.details && payload.details.attachment && payload.details.attachment.id) {
                    const { default: WhatsAppService } = await import('../../services/WhatsAppService.js');
                    const Activity = mongoose.model('Activity');
                    const downloaded = await WhatsAppService.downloadMedia(payload.details.attachment.id);
                    await Activity.updateOne(
                        { _id: aggregateId },
                        { $set: {
                            'details.attachment.url': downloaded.url,
                            'details.attachment.mimeType': downloaded.mimeType,
                            'details.attachment.filename': downloaded.fileName
                        }}
                    );
                }
            });
            await executeEffect(eventId, 'activity_ai_response', aggregateType, aggregateId, async () => {
                if (payload.type === 'WhatsApp' && payload.details && payload.details.waId) {
                    const Activity = mongoose.model('Activity');
                    const Conversation = mongoose.model('Conversation');
                    const Lead = mongoose.model('Lead');
                    const Contact = mongoose.model('Contact');
                    const { generateBotResponse } = await import('../../services/aiBot.service.js');

                    const activity = await Activity.findById(aggregateId).lean();
                    if (!activity) return;

                    const phoneNumber = activity.details.phoneNumber;
                    if (!phoneNumber) return;

                    const conversation = await Conversation.findOne({ phoneNumber, status: 'active' });
                    if (!conversation) return;

                    let entity = null;
                    if (activity.entityId) {
                        entity = await Lead.findById(activity.entityId).lean();
                        if (!entity) entity = await Contact.findById(activity.entityId).lean();
                    }

                    // Format chat history
                    const chatHistory = conversation.messages.map(item => `${item.role}: ${item.content}`).join('\n');

                    // We only process if there is new user input that requires a response
                    // In a production system, we'd check if the last message was from the user and not already replied to.
                    const lastMessage = conversation.messages[conversation.messages.length - 1];
                    if (lastMessage && lastMessage.role === 'user' && lastMessage.metadata?.waId === activity.details.waId) {
                        const aiResult = await generateBotResponse(lastMessage.content, {
                            chatHistory,
                            userName: entity?.name || 'Client',
                            entity: entity ? { name: entity.name, type: activity.entityType, id: entity._id, stage: entity.stage, requirements: entity.requirements, description: entity.description, customFields: entity.customFields } : null,
                            entityType: activity.entityType,
                        }, { useCase: conversation.currentUseCase || 'whatsapp_live' });

                        if (aiResult.success && aiResult.reply) {
                            const { default: WhatsAppService } = await import('../../services/WhatsAppService.js');
                            await WhatsAppService.sendMessage(phoneNumber, aiResult.reply);

                            // It's safe to update Conversation here because it's asynchronous
                            // But wait, updating conversation messages should probably just append the assistant reply
                            await Conversation.updateOne(
                                { _id: conversation._id },
                                {
                                    $push: {
                                        messages: {
                                            role: 'assistant',
                                            content: aiResult.reply,
                                            timestamp: new Date()
                                        }
                                    }
                                }
                            );
                        }
                    }
                }
            });
            break;

                case 'ActivityUpdated':
            if (payload.statusChanged && payload.newStatus?.toLowerCase() === 'completed') {
                await executeEffect(eventId, 'activity_whatsapp_trigger_completed', aggregateType, aggregateId, async () => {
                    const { default: ActivityTriggerService } = await import('../services/ActivityTriggerService.js');
                    await ActivityTriggerService.executeActivityWhatsAppTriggers({ _id: aggregateId, ...payload }, { id: payload.actorId }, 'activity_completed');
                });
                if (payload.entityType?.toLowerCase() === 'lead' && payload.entityId) {
                    await executeEffect(eventId, 'activity_scoring_completed', aggregateType, aggregateId, async () => {
                        const { default: LeadScoringService } = await import('../services/LeadScoringService.js');
                        await LeadScoringService.computeAndSave(payload.entityId, { triggeredBy: 'activity_completion' });
                    });
                }
            }

            if (payload.status?.toLowerCase() === 'completed') {
                await executeEffect(eventId, 'activity_workflow_completed', aggregateType, aggregateId, async () => {
                    const { WorkflowEngine } = await import("../utils/WorkflowEngine.js");
                    await WorkflowEngine.fireEvent('activities', 'activity_completed', { _id: aggregateId, ...payload }, payload.companyId);
                });
            }

            if (['Call', 'Call Back', 'call', 'Voice'].includes(payload.type) && payload.outcomeChanged && (payload.details?.callOutcome || payload.completionResult)) {
                await executeEffect(eventId, 'activity_workflow_call_outcome', aggregateType, aggregateId, async () => {
                    const { WorkflowEngine } = await import("../utils/WorkflowEngine.js");
                    await WorkflowEngine.fireEvent('communication', 'call_outcome_selected', { _id: aggregateId, ...payload }, payload.companyId);
                });
            }

            await executeEffect(eventId, 'activity_google_sync_updated', aggregateType, aggregateId, async () => {
                const QueueManager = await import('../queues/queueManager.js');
                await QueueManager.googleSyncQueue.add('syncEvent', { activityId: aggregateId });
            });
            break;

        case 'ActivityDeleted':
            await executeEffect(eventId, 'activity_google_sync_deleted', aggregateType, aggregateId, async () => {
                if (payload.googleEventId) {
                    const QueueManager = await import('../queues/queueManager.js');
                    await QueueManager.googleSyncQueue.add('deleteEvent', { googleEventId: payload.googleEventId });
                }
            });
            await executeEffect(eventId, 'activity_entity_update', aggregateType, aggregateId, async () => {
                if (payload.entityType?.toLowerCase() === 'lead' && payload.entityId) {
                    const Activity = mongoose.model('Activity');
                    const Lead = mongoose.model('Lead');
                    const lastLog = await Activity.findOne({ entityId: payload.entityId }).sort({ createdAt: -1 });
                    await Lead.findByIdAndUpdate(payload.entityId, { lastActivityAt: lastLog ? (lastLog.completedAt || lastLog.createdAt) : null });
                } else if (payload.entityType?.toLowerCase() === 'deal' && payload.entityId) {
                    const Activity = mongoose.model('Activity');
                    const Deal = mongoose.model('Deal');
                    const lastLog = await Activity.findOne({ entityId: payload.entityId }).sort({ createdAt: -1 });
                    await Deal.findByIdAndUpdate(payload.entityId, { lastActivityAt: lastLog ? (lastLog.completedAt || lastLog.createdAt) : null });
                }
            });
            break;

        case 'ContactCreated':
            if (payload.syncToGoogle) {
                await executeEffect(eventId, 'contact_google_sync', aggregateType, aggregateId, async () => {
                    const QueueManager = await import('../queues/queueManager.js');
                    await QueueManager.googleSyncQueue.add('syncContact', { contactId: aggregateId });
                });
            }
            break;

        case 'ContactMerged':
            await executeEffect(eventId, 'contact_merge_audit_task', aggregateType, aggregateId, async () => {
                const MergeAudit = mongoose.model('MergeAudit');
                const Activity = mongoose.model('Activity');
                const Contact = mongoose.model('Contact');

                const audit = await MergeAudit.findOne({ mergeOperationId: payload.mergeOperationId }).lean();
                if (!audit) throw new Error(`MergeAudit not found for mergeOperationId: ${payload.mergeOperationId}`);

                const masterContact = await Contact.findById(audit.masterContactId).lean();

                await Activity.create([{
                    type: 'Task',
                    subject: 'Contacts Merged',
                    entityType: 'Contact',
                    entityId: audit.masterContactId,
                    dueDate: new Date(),
                    status: 'Completed',
                    description: `Merged 1 duplicate contact into this master record via Enterprise Engine.`,
                    createdBy: audit.createdBy,
                    owner: masterContact?.owner || audit.createdBy
                }]);
            });
            break;

        // ─── C5: Time-Based Trigger Durable Execution ───────────────────────────────
        case 'TimeTriggerExecutionRequested': {
            const { triggerId, entityType, automationLogIdempotencyKey, companyId: triggerCompanyId } = payload;

            // [C5] Re-fetch current Trigger document. Worker does NOT use a cached snapshot.
            const TriggerModel = mongoose.models.Trigger || mongoose.model('Trigger', (await import('../../models/Trigger.js')).default.schema);
            const AutomationLog = mongoose.models.AutomationLog || mongoose.model('AutomationLog', (await import('../../models/AutomationLog.js')).default.schema);

            const trigger = await TriggerModel.findById(triggerId).lean();
            if (!trigger) {
                console.error(`[DomainEventWorker] [C5] Trigger ${triggerId} not found — marking AutomationLog failed.`);
                await AutomationLog.updateOne(
                    { idempotencyKey: automationLogIdempotencyKey },
                    { $set: { status: 'failed', details: { error: `Trigger ${triggerId} not found` } } }
                );
                break;
            }

            // [C5] Re-fetch fresh entity using the entityType from payload.
            const modelNameMap = { leads: 'Lead', deals: 'Deal', activities: 'Activity' };
            const modelName = modelNameMap[entityType];
            if (!modelName) {
                console.error(`[DomainEventWorker] [C5] Unknown entityType: ${entityType}`);
                await AutomationLog.updateOne(
                    { idempotencyKey: automationLogIdempotencyKey },
                    { $set: { status: 'failed', details: { error: `Unknown entityType: ${entityType}` } } }
                );
                break;
            }
            const EntityModel = mongoose.models[modelName];
            const entity = await EntityModel.findById(aggregateId).lean();
            if (!entity) {
                console.error(`[DomainEventWorker] [C5] Entity ${modelName} ${aggregateId} not found — marking AutomationLog failed.`);
                await AutomationLog.updateOne(
                    { idempotencyKey: automationLogIdempotencyKey },
                    { $set: { status: 'failed', details: { error: `Entity ${modelName} ${aggregateId} not found` } } }
                );
                break;
            }

            const { WorkflowEngine } = await import('../utils/WorkflowEngine.js');

            console.log(`[DomainEventWorker] [C5] Processing TimeTriggerExecutionRequested — trigger=${triggerId} entity=${aggregateId} actions=${trigger.actions.length}`);

            try {
                // [C5] Execute actions SEQUENTIALLY in trigger.actions[] array order.
                // Each action gets its own EffectExecution keyed by the stable action._id.
                // COMPLETED effects are skipped on retry. Failed effects are retried by EffectOrchestrator.
                // The next action MUST NOT execute before the previous one completes.
                for (const action of trigger.actions) {
                    const effectKey = `action-${action._id}`;
                    await executeEffect(eventId, effectKey, aggregateType, aggregateId, async () => {
                        await WorkflowEngine.executeAction(
                            action,
                            entity,
                            trigger,
                            triggerCompanyId,
                            false,
                            { skipLogging: true, propagateError: true }
                        );
                    });
                    // Reaching here means this effect is COMPLETED or was SKIPPED (already done).
                    // Proceed to next action.
                }

                // All required effects are COMPLETED (or SKIPPED if already done).
                // Update AutomationLog to success as the business-level execution record.
                await AutomationLog.updateOne(
                    { idempotencyKey: automationLogIdempotencyKey },
                    { $set: { status: 'success' } }
                );
                console.log(`[DomainEventWorker] [C5] TimeTriggerExecution succeeded — trigger=${triggerId} entity=${aggregateId}`);
            } catch (err) {
                // A required action effect reached terminal failure (MAX_ATTEMPTS) or threw unexpectedly.
                // Stop remaining actions. Mark AutomationLog failed.
                console.error(`[DomainEventWorker] [C5] TimeTriggerExecution failed — trigger=${triggerId} entity=${aggregateId}:`, err.message);
                await AutomationLog.updateOne(
                    { idempotencyKey: automationLogIdempotencyKey },
                    { $set: { status: 'failed', details: { error: err.message } } }
                );
                throw err; // Re-throw so BullMQ marks the job as failed for its own retry tracking
            }
            break;
        }

        case 'LeadUpdated': {
            const Lead = mongoose.model('Lead');
            const lead = await Lead.findById(aggregateId).populate('owner assignment.assignedTo').lean();
            if (!lead) throw new Error(`Lead ${aggregateId} not found`);

            const effects = [];

            effects.push({
                key: 'whatsapp',
                fn: async () => {
                    let newStageStr = String(lead.stage?.lookup_value || lead.stage || '').toLowerCase();
                    let readableStage = String(payload.newStage || lead.stage || 'closed');

                    if (mongoose.Types.ObjectId.isValid(readableStage) && /^[a-fA-F0-9]{24}$/.test(readableStage)) {
                        const Lookup = mongoose.model('Lookup');
                        const lookup = await Lookup.findById(readableStage).select('lookup_value').lean();
                        if (lookup) {
                            readableStage = lookup.lookup_value;
                            newStageStr = readableStage.toLowerCase();
                        }
                    }

                    const isNewStageClosed = newStageStr.includes('closed') || newStageStr.includes('lost') || newStageStr.includes('won') || newStageStr.includes('unqualified') || newStageStr.includes('junk');

                    if (isNewStageClosed && payload.stageChanged !== undefined && payload.newStage) {
                        const mobileNumber = lead.mobile || lead.phones?.[0];
                        if (mobileNumber) {
                            const templateComponents = [{ type: "body", parameters: [{ type: "text", text: lead.firstName || 'Customer' }] }];
                            const WhatsAppService = (await import('../../services/WhatsAppService.js')).default || (await import('../../services/WhatsAppService.js'));
                            await WhatsAppService.sendTemplate(mobileNumber, 'exit_interview_winback', 'en_US', templateComponents);

                            const Activity = mongoose.model('Activity');
                            await Activity.create({
                                entityType: 'Lead',
                                entityId: aggregateId,
                                type: 'whatsapp',
                                subject: 'Automated Exit Survey',
                                details: `Automated exit survey dispatched to ${mobileNumber} due to stage change to ${readableStage}.`,
                                user: payload.triggeredBy || null,
                                timestamp: new Date()
                            });
                        }
                    }
                }
            });

            effects.push({
                key: 'sms',
                fn: async () => {
                    if (lead.mobile && payload.stageChanged !== undefined && payload.newStage) {
                        const smsServiceModule = await import('../modules/sms/sms.service.js');
                        const smsService = smsServiceModule.default || smsServiceModule.smsService || smsServiceModule.SmsService || smsServiceModule;
                        if (smsService && typeof smsService.sendSMSWithTemplate === 'function') {
                            await smsService.sendSMSWithTemplate(
                                lead.mobile,
                                'Get Response',
                                { Name: lead.firstName || 'Customer' },
                                { entityType: 'Lead', entityId: aggregateId }
                            );
                        }
                    }
                }
            });

            effects.push({
                key: 'workflow',
                fn: async () => {
                    const { WorkflowEngine } = await import('../utils/WorkflowEngine.js');
                    if (payload.stageChanged !== undefined && payload.newStage) {
                        await WorkflowEngine.fireEvent('leads', 'lead_stage_changed', lead, lead.companyId);
                    }
                    if (payload.statusChanged !== undefined && lead.status) {
                        await WorkflowEngine.fireEvent('leads', 'lead_status_changed', lead, lead.companyId);
                    }
                    if (payload.scoreChanged === true) {
                        await WorkflowEngine.fireEvent('leads', 'lead_score_changed', lead, lead.companyId);
                    }
                }
            });

            const failures = [];
            for (const effect of effects) {
                try {
                    await executeEffect(eventId, effect.key, aggregateType, aggregateId, effect.fn);
                } catch (err) {
                    console.error(`[DomainEventWorker] LeadUpdated effect ${effect.key} failed:`, err.message);
                    failures.push(err);
                }
            }
            if (failures.length > 0) throw new AggregateError(failures, `LeadUpdated event encountered ${failures.length} effect failures.`);
            break;
        }

        case 'ContactUpdated': {
            const Contact = mongoose.model('Contact');
            const contact = await Contact.findById(aggregateId).lean();
            if (!contact) throw new Error(`Contact ${aggregateId} not found`);

            const effects = [];

            effects.push({
                key: 'auditLog',
                fn: async () => {
                    if (payload.stageChanged && payload.previousStage !== payload.newStage) {
                        const AuditLog = mongoose.model('AuditLog');
                        await AuditLog.logEntityUpdate(
                            'stage_changed',
                            'contact',
                            aggregateId,
                            `${contact.name} ${contact.surname || ''}`.trim(),
                            payload.triggeredBy,
                            { before: payload.previousStage || 'New', after: payload.newStage },
                            `Contact stage shifted from ${payload.previousStage || 'New'} to ${payload.newStage}`
                        );
                    }
                }
            });

            effects.push({
                key: 'inventorySync',
                fn: async () => {
                    if (payload.documents && Array.isArray(payload.documents)) {
                        const { syncDocumentsToInventory } = await import('../../utils/sync.js');
                        const primaryPhone = contact.phones?.find(p => p.isPrimary)?.number || contact.phones?.[0]?.number;
                        await syncDocumentsToInventory(payload.documents, { name: contact.name, mobile: primaryPhone });
                    }
                }
            });

            effects.push({
                key: 'googleSync',
                fn: async () => {
                    const { googleSyncQueue } = await import('../queues/queueManager.js');
                    await googleSyncQueue.add('syncContact', { contactId: aggregateId }, { jobId: eventId.toString() });
                }
            });

            const failures = [];
            for (const effect of effects) {
                try {
                    await executeEffect(eventId, effect.key, aggregateType, aggregateId, effect.fn);
                } catch (err) {
                    console.error(`[DomainEventWorker] ContactUpdated effect ${effect.key} failed:`, err.message);
                    failures.push(err);
                }
            }
            if (failures.length > 0) throw new AggregateError(failures, `ContactUpdated event encountered ${failures.length} effect failures.`);
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
