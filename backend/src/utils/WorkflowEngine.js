import Trigger from '../../models/Trigger.js';
import AutomationLog from '../../models/AutomationLog.js';
// Phase C: Removed static import of sendWhatsAppMessage from social.controller.js.
// WorkflowEngine now calls WhatsAppService directly (service boundary fix).

export class WorkflowEngine {
    static evaluateCondition(rule, entityData) {
        let rawValue = entityData[rule.field];

        // Extract string representation if it's a populated object (e.g. status, stage)
        const extractValue = (v) => {
            if (v && typeof v === 'object') {
                return String(v.lookup_value || v.name || v.title || v._id || v);
            }
            return v !== null && v !== undefined ? String(v) : '';
        };

        const value = Array.isArray(rawValue)
            ? rawValue.map(extractValue).join(',') // If array of objects, convert to comma-separated string for simpler IN logic
            : extractValue(rawValue);

        // For comparison, normalize everything to lowercase for case-insensitive matching
        const valStr = value.toLowerCase();

        switch (rule.operator) {
            case '==': return valStr == String(rule.value || '').toLowerCase();
            case '!=': return valStr != String(rule.value || '').toLowerCase();
            case '>': {
                const numVal = Number(rawValue);
                const numRule = Number(rule.value);
                if (!isNaN(numVal) && !isNaN(numRule)) return numVal > numRule;
                return value > rule.value;
            }
            case '>=': {
                const numVal = Number(rawValue);
                const numRule = Number(rule.value);
                if (!isNaN(numVal) && !isNaN(numRule)) return numVal >= numRule;
                return value >= rule.value;
            }
            case '<': {
                const numVal = Number(rawValue);
                const numRule = Number(rule.value);
                if (!isNaN(numVal) && !isNaN(numRule)) return numVal < numRule;
                return value < rule.value;
            }
            case '<=': {
                const numVal = Number(rawValue);
                const numRule = Number(rule.value);
                if (!isNaN(numVal) && !isNaN(numRule)) return numVal <= numRule;
                return value <= rule.value;
            }
            case 'IN': {
                const arr = Array.isArray(rule.value) ? rule.value : String(rule.value || '').split(',').map(s => s.trim().toLowerCase());
                // Handle case where entity field is an array (e.g. tags) by checking if ANY element matches
                if (Array.isArray(rawValue)) {
                     return rawValue.map(extractValue).some(v => arr.includes(v.toLowerCase()));
                }
                return arr.includes(valStr);
            }
            case 'NOT_IN': {
                const arr = Array.isArray(rule.value) ? rule.value : String(rule.value || '').split(',').map(s => s.trim().toLowerCase());
                if (Array.isArray(rawValue)) {
                     return !rawValue.map(extractValue).some(v => arr.includes(v.toLowerCase()));
                }
                return !arr.includes(valStr);
            }
            default: return false;
        }
    }

    static evaluateRules(conditions, entityData) {
        if (!conditions || typeof conditions !== 'object') return true;

        // If it's a leaf node (has a field instead of an operator)
        if (conditions.field && conditions.operator) {
            return this.evaluateCondition(conditions, entityData);
        }

        if (!conditions.rules || conditions.rules.length === 0) return true;

        if (conditions.operator === 'OR') {
            return conditions.rules.some(rule => this.evaluateRules(rule, entityData));
        } else {
            return conditions.rules.every(rule => this.evaluateRules(rule, entityData));
        }
    }

    static async executeAction(action, entityData, trigger, companyId, isDelayedExecution = false, executionOptions = {}) {
        const isDealCreatedNative = trigger?.module === 'deals' &&
            (trigger?.event === 'deal_created' || trigger?.event === 'DealCreated') &&
            action?.type !== 'fire_automated_action';

        let canonicalKey = null;
        let claimToken = null;
        let leaseUntil = null;
        let claimAcquired = false;

        try {
            // Process Delayed Actions if this is a 'fire_automated_action' and not already delayed
            if (action.type === 'fire_automated_action' && action.automatedActionId) {
                const AutomatedAction = (await import('../../models/AutomatedAction.js')).default;
                const autoAction = await AutomatedAction.findById(action.automatedActionId);

                if (!isDelayedExecution && autoAction && autoAction.delay && autoAction.delay.isActive) {
                    const relativeDate = entityData[autoAction.delay.relativeToField] ? new Date(entityData[autoAction.delay.relativeToField]) : new Date();

                    let offsetMs = 0;
                    const amount = autoAction.delay.amount || 0;
                    switch (autoAction.delay.unit) {
                        case 'minutes': offsetMs = amount * 60 * 1000; break;
                        case 'hours': offsetMs = amount * 60 * 60 * 1000; break;
                        case 'days': offsetMs = amount * 24 * 60 * 60 * 1000; break;
                        case 'weeks': offsetMs = amount * 7 * 24 * 60 * 60 * 1000; break;
                    }

                    const targetDate = new Date(relativeDate.getTime() + offsetMs);
                    const delayMs = targetDate.getTime() - Date.now();

                    if (delayMs > 0) {
                        const { enqueueAction } = await import('../../services/automationQueue/automationQueue.js');
                        await enqueueAction({ action, entityData, trigger, companyId }, delayMs);
                        return; // Successfully queued for delayed execution
                    }
                }

                // If we reach here, it's either immediate or the delay has already elapsed
                console.log(`[WorkflowEngine] Executing Automated Action: ${autoAction?.name}`);

                // Idempotency check: Include updatedAt to allow repeating actions on subsequent updates
                const entityUpdatedTime = entityData.updatedAt ? new Date(entityData.updatedAt).getTime() : Date.now();
                const idempotencyKey = isDelayedExecution
                    ? `delay-${action.automatedActionId}-${entityData._id || entityData.id}-${entityUpdatedTime}`
                    : `imm-${action.automatedActionId}-${entityData._id || entityData.id}-${entityUpdatedTime}`;

                const crypto = (await import('crypto')).default;
                const autoClaimToken = crypto.randomUUID();
                const autoLeaseDuration = executionOptions.leaseDurationMs || 120000;
                const autoLeaseUntil = new Date(Date.now() + autoLeaseDuration);
                let autoClaimAcquired = false;

                try {
                    await AutomationLog.create({
                        ruleType: 'AutomatedAction',
                        ruleId: autoAction._id,
                        targetEntityId: entityData._id || entityData.id,
                        targetModule: trigger?.module || autoAction.module || 'general',
                        status: 'pending',
                        idempotencyKey,
                        claimToken: autoClaimToken,
                        leaseUntil: autoLeaseUntil,
                        companyId: companyId || entityData.companyId || null,
                        tenantId: entityData.tenantId || trigger?.tenantId || null
                    });
                    autoClaimAcquired = true;
                } catch (autoErr) {
                    if (autoErr.code === 11000) {
                        const existing = await AutomationLog.findOne({ idempotencyKey });
                        const existingDoc = existing?.lean ? await existing.lean() : existing;
                        if (existingDoc && existingDoc.status === 'success') {
                            console.log(`[WorkflowEngine] Action already executed for key: ${idempotencyKey}. Skipping.`);
                            return;
                        }
                        if (existingDoc && existingDoc.status === 'failed') {
                            if (existingDoc.details?.retryable === true) {
                                const updated = await AutomationLog.findOneAndUpdate(
                                    { idempotencyKey, status: 'failed' },
                                    { $set: { status: 'pending', claimToken: autoClaimToken, leaseUntil: autoLeaseUntil } },
                                    { new: true }
                                );
                                if (updated) {
                                    autoClaimAcquired = true;
                                } else {
                                    console.log(`[WorkflowEngine] Lost retry claim race for key: ${idempotencyKey}. Skipping.`);
                                    return;
                                }
                            } else {
                                console.log(`[WorkflowEngine] Action previously reached terminal failure for key: ${idempotencyKey}. Skipping.`);
                                return;
                            }
                        } else if (existingDoc && existingDoc.status === 'pending') {
                            if (existingDoc.leaseUntil && new Date(existingDoc.leaseUntil) > new Date()) {
                                console.log(`[WorkflowEngine] Active claim held for key: ${idempotencyKey}. Skipping.`);
                                return;
                            }
                            const updated = await AutomationLog.findOneAndUpdate(
                                { idempotencyKey, status: 'pending', leaseUntil: { $lte: new Date() } },
                                { $set: { claimToken: autoClaimToken, leaseUntil: autoLeaseUntil } },
                                { new: true }
                            );
                            if (updated) {
                                autoClaimAcquired = true;
                            } else {
                                console.log(`[WorkflowEngine] Lost claim race for key: ${idempotencyKey}. Skipping.`);
                                return;
                            }
                        }
                    } else {
                        throw autoErr;
                    }
                }

                try {
                    // Action execution logic
                    if (autoAction.actionType === 'send_notification') {
                        if (!entityData.mobile) {
                            console.log(`[WorkflowEngine] Skipping send_notification: No mobile number for entity ${entityData._id || entityData.id}`);
                        } else {
                            const VariableResolver = (await import('./VariableResolver.js')).default;
                            const WhatsAppService = (await import('../../services/WhatsAppService.js')).default;
                            const config = autoAction.notificationConfig;

                            if (config.channels.whatsapp && config.templates.whatsapp) {
                                const resolvedTemplate = VariableResolver.resolve(config.templates.whatsapp, entityData);
                                console.log(`[WorkflowEngine] Sending WhatsApp to ${entityData.mobile} using template: ${resolvedTemplate}`);
                                await WhatsAppService.sendMessage(entityData.mobile, resolvedTemplate);
                            }
                            if (config.channels.sms && config.templates.sms) {
                                const resolvedSms = VariableResolver.resolve(config.templates.sms, entityData);
                                console.log(`[WorkflowEngine] Sending SMS to ${entityData.mobile}: ${resolvedSms}`);
                            }
                        }

                    } else if (autoAction.actionType === 'auto_match_dispatch') {
                        console.log(`[WorkflowEngine] Enqueueing Auto-Match Dispatch for Lead ${entityData._id || entityData.id}`);
                        try {
                            const { marketingQueue } = await import('../queues/marketingQueue.js');
                            if (marketingQueue) {
                                await marketingQueue.add('auto-match-dispatch', {
                                    leadId: entityData._id || entityData.id,
                                    toggles: autoAction.configuration?.toggles || { whatsapp: true },
                                    matchContext: autoAction.configuration?.matchContext || 'perfect',
                                    companyId: companyId
                                });
                            } else {
                                console.error('[WorkflowEngine] Cannot dispatch match: marketingQueue is not initialized.');
                            }
                        } catch (err) {
                            console.error('[WorkflowEngine] AutoMatch queue error:', err);
                        }
                    } else if (autoAction.actionType === 'update_field') {
                        console.log(`[WorkflowEngine] Updating field for ${trigger.module} ID ${entityData._id || entityData.id} with data:`, autoAction.fieldMapping);
                        const mongoose = (await import('mongoose')).default;

                        // Robust Model Name Mapping
                        const modelMap = { leads: 'Lead', deals: 'Deal', activities: 'Activity', inventory: 'Inventory', communication: 'Communication', post_sale: 'PostSale', campaigns: 'Campaign' };
                        const modelName = modelMap[trigger.module] || trigger.module;

                        const Model = mongoose.model(modelName);
                        await Model.findByIdAndUpdate(entityData._id || entityData.id, { $set: autoAction.fieldMapping }, { new: true });
                    } else if (autoAction.actionType === 'lock_inventory') {
                        console.log(`[WorkflowEngine] Locking inventory for ${entityData._id || entityData.id}`);
                        const mongoose = (await import('mongoose')).default;
                        const Inventory = mongoose.model('Inventory');
                        await Inventory.findByIdAndUpdate(entityData._id || entityData.id, { $set: { status: 'Locked' } }, { new: true });
                    } else if (autoAction.actionType === 'broadcast_deal' || autoAction.actionType === 'deal_broadcast') {
                        console.log(`[WorkflowEngine] Executing Automated Action 'broadcast_deal' for ${trigger?.module || 'entity'} ID ${entityData._id || entityData.id}`);
                        await this.executeBroadcastDealAction(autoAction, entityData, trigger, companyId);
                    }

                    // Finalize success with claim fencing
                    if (autoClaimAcquired) {
                        const finalizeResult = await AutomationLog.updateOne(
                            { idempotencyKey, claimToken: autoClaimToken },
                            { $set: { status: 'success', executedAt: new Date() } }
                        );
                        if (finalizeResult.modifiedCount !== 1) {
                            console.warn(`[WorkflowEngine] Ownership lost during finalization for automated action key: ${idempotencyKey}`);
                            if (executionOptions.propagateError || executionOptions.rethrowErrors) {
                                throw new Error(`Automation execution ownership lost during automated action finalization: ${idempotencyKey}`);
                            }
                        }
                    } else {
                        await AutomationLog.create({
                            ruleType: 'AutomatedAction',
                            ruleId: autoAction._id,
                            targetEntityId: entityData._id || entityData.id,
                            targetModule: trigger?.module || autoAction.module || 'general',
                            status: 'success',
                            idempotencyKey,
                            companyId: companyId || entityData.companyId || null,
                            tenantId: entityData.tenantId || trigger?.tenantId || null
                        });
                    }
                } catch (execError) {
                    console.error(`[WorkflowEngine] Automated Action Execution failed:`, execError);
                    if (autoClaimAcquired) {
                        await AutomationLog.updateOne(
                            { idempotencyKey, claimToken: autoClaimToken },
                            { $set: { status: 'failed', details: { error: execError.message, retryable: true } } }
                        );
                    }
                    throw execError;
                }

                return; // Automated action logic executed successfully
            }

            // ─── Native Raw Trigger Actions ───
            const isNativeRawAction = Boolean(trigger && action?.type !== 'fire_automated_action' && !executionOptions.skipLogging);
            if (isNativeRawAction) {
                const targetEntityId = String(entityData._id || entityData.id || '');
                const triggerId = String(trigger._id || 'direct');
                const actionId = action._id ? String(action._id) : (executionOptions.actionIndex !== undefined ? String(executionOptions.actionIndex) : '0');

                if (isDealCreatedNative) {
                    canonicalKey = executionOptions.idempotencyKey || `canonical-deal_created-${targetEntityId}-${triggerId}-${actionId}`;
                } else if (executionOptions.idempotencyKey) {
                    canonicalKey = executionOptions.idempotencyKey;
                } else {
                    const normalizedMod = String(trigger.module || 'general').toLowerCase();
                    const normalizedEv = String(trigger.event || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
                    const stagePart = (normalizedEv.includes('stage') && entityData.stage)
                        ? `-${String(entityData.stage).toLowerCase().replace(/[^a-z0-9_]/g, '')}`
                        : '';
                    canonicalKey = `canonical-${normalizedMod}-${normalizedEv}-${targetEntityId}${stagePart}-${triggerId}-${actionId}`;
                }

                if (executionOptions.callerManagedClaim && executionOptions.canonicalClaimAcquired) {
                    claimAcquired = true;
                    canonicalKey = executionOptions.idempotencyKey || canonicalKey;
                    claimToken = executionOptions.claimToken;
                    leaseUntil = executionOptions.leaseUntil || null;
                } else {
                    const { validateExecutionAuthority } = await import('./executionCoordinator.js');
                    const authority = await validateExecutionAuthority('LEGACY', trigger?.event);
                    if (!authority.authorized) {
                        console.log(`[WorkflowEngine] executeAction for ${trigger?.event} suppressed by ExecutionCoordinator (owner: ${authority.owner}, epoch: ${authority.epoch}, reason: ${authority.reason})`);
                        return;
                    }

                    const crypto = (await import('crypto')).default;
                    claimToken = crypto.randomUUID();
                    const leaseDuration = executionOptions.leaseDurationMs || 120000;
                    leaseUntil = new Date(Date.now() + leaseDuration);

                    try {
                        await AutomationLog.create({
                            ruleType: 'Trigger',
                            ruleId: trigger._id || null,
                            targetEntityId,
                            targetModule: trigger.module || 'general',
                            status: 'pending',
                            idempotencyKey: canonicalKey,
                            companyId: companyId || entityData.companyId || null,
                            claimToken,
                            leaseUntil,
                            tenantId: entityData.tenantId || trigger.tenantId || null
                        });
                        claimAcquired = true;
                    } catch (claimErr) {
                        if (claimErr.code === 11000) {
                            const existing = await AutomationLog.findOne({ idempotencyKey: canonicalKey });
                            const existingDoc = existing?.lean ? await existing.lean() : existing;
                            if (existingDoc && existingDoc.status === 'success') {
                                console.log(`[WorkflowEngine] Action already executed for canonical key: ${canonicalKey}. Skipping.`);
                                return;
                            }
                            if (existingDoc && existingDoc.status === 'failed') {
                                if (existingDoc.details?.retryable === true) {
                                    // Retryable transient failure re-acquisition
                                    const updated = await AutomationLog.findOneAndUpdate(
                                        { idempotencyKey: canonicalKey, status: 'failed' },
                                        { $set: { status: 'pending', claimToken, leaseUntil } },
                                        { new: true }
                                    );
                                    if (updated) {
                                        claimAcquired = true;
                                        leaseUntil = updated.leaseUntil || leaseUntil;
                                    } else {
                                        console.log(`[WorkflowEngine] Lost retry claim race for canonical key: ${canonicalKey}. Skipping.`);
                                        return;
                                    }
                                } else {
                                    console.log(`[WorkflowEngine] Action previously reached terminal failure for canonical key: ${canonicalKey}. Skipping.`);
                                    return;
                                }
                            } else if (existingDoc && existingDoc.status === 'pending') {
                                if (existingDoc.leaseUntil && new Date(existingDoc.leaseUntil) > new Date()) {
                                    console.log(`[WorkflowEngine] Active claim held for canonical key: ${canonicalKey}. Skipping.`);
                                    return;
                                }
                                // Stale lease acquisition
                                const updated = await AutomationLog.findOneAndUpdate(
                                    { idempotencyKey: canonicalKey, status: 'pending', leaseUntil: { $lte: new Date() } },
                                    { $set: { claimToken, leaseUntil } },
                                    { new: true }
                                );
                                if (updated) {
                                    claimAcquired = true;
                                    leaseUntil = updated.leaseUntil || leaseUntil;
                                } else {
                                    console.log(`[WorkflowEngine] Lost claim race for canonical key: ${canonicalKey}. Skipping.`);
                                    return;
                                }
                            }
                        } else {
                            throw claimErr;
                        }
                    }
                }
            }

            if (action.type === 'send_communication') {
                let recipientMobile = entityData.mobile || entityData.primaryPhone || null;
                if (!recipientMobile && entityData.entityId) {
                    try {
                        const mongoose = (await import('mongoose')).default;
                        const Lead = mongoose.model('Lead');
                        const leadDoc = await Lead.findById(entityData.entityId).select('mobile primaryPhone').lean();
                        if (leadDoc) {
                            recipientMobile = leadDoc.primaryPhone || leadDoc.mobile;
                        }
                    } catch (lErr) {
                        console.error('[WorkflowEngine] Failed to resolve Lead mobile:', lErr.message);
                    }
                }

                if (!recipientMobile) {
                    console.log(`[WorkflowEngine] Skipping send_communication (Raw): No mobile number found for entity ${entityData._id || entityData.id}`);
                } else {
                    const VariableResolver = (await import('./VariableResolver.js')).default;
                    if (action.channel === 'whatsapp') {
                        const WhatsAppService = (await import('../../services/WhatsAppService.js')).default;

                        if (action.templateId) {
                            // Phase C.2: Build CRM variable map first (named-param flat array)
                            let crmParams = [];
                            try {
                                crmParams = await this._buildTemplateComponents(entityData, trigger.module, companyId);
                                console.log(`[WorkflowEngine] Built ${crmParams.length} CRM params for template ${action.templateId}`);
                            } catch (tcErr) {
                                console.error('[WorkflowEngine] Failed to build CRM params:', tcErr.message);
                            }

                            // Phase C.2: Fetch template definition — same as old controller path.
                            // Required to: (a) get correct language, (b) build Meta-format components.
                            const templates = await WhatsAppService.getTemplates();
                            const templateDef = templates.find(t => t.name === action.templateId);

                            // Language: from template definition (mirrors old: templateDef?.language || language || 'en')
                            // 'language' in old mockReq.body was never set → always resolved to templateDef?.language || 'en'
                            const langCode = templateDef?.language || 'en';

                            // Build Meta-format components (body + header + buttons)
                            const metaComponents = await this._buildMetaComponents(
                                templateDef, crmParams, action.templateId
                            );

                            // Pre-dispatch fencing check (Stage 1 Safety Questions 2 & 4)
                            if (claimAcquired && leaseUntil && new Date() >= leaseUntil) {
                                throw new Error(`[WorkflowEngine] Lease expired prior to external WhatsApp template dispatch for canonical key: ${canonicalKey}`);
                            }

                            console.log(`[WorkflowEngine] Sending WhatsApp template "${action.templateId}" lang="${langCode}" to ${recipientMobile}`);
                            const waResult = await WhatsAppService.sendTemplate(
                                recipientMobile,
                                action.templateId,
                                langCode,
                                metaComponents
                            );
                            if (!waResult?.success && waResult?.error) {
                                throw new Error(`WhatsApp template send failed: ${JSON.stringify(waResult.error)}`);
                            }
                        } else {
                            // Plain text — unchanged from Phase C
                            const VariableResolver = (await import('./VariableResolver.js')).default;
                            const resolvedMessage = VariableResolver.resolve(action.message || '', entityData);

                            // Pre-dispatch fencing check (Stage 1 Safety Questions 2 & 4)
                            if (claimAcquired && leaseUntil && new Date() >= leaseUntil) {
                                throw new Error(`[WorkflowEngine] Lease expired prior to external WhatsApp text dispatch for canonical key: ${canonicalKey}`);
                            }

                            console.log(`[WorkflowEngine] Sending WhatsApp text to ${recipientMobile}`);
                            if (resolvedMessage) {
                                await WhatsAppService.sendMessage(recipientMobile, resolvedMessage);
                            } else {
                                console.log(`[WorkflowEngine] Skipping WhatsApp send: no templateId and no message`);
                            }
                        }
                    } else if (action.channel === 'sms') {
                        const resolvedSms = VariableResolver.resolve(action.templateId || '', entityData);
                        console.log(`[WorkflowEngine] Sending SMS (Raw) to ${recipientMobile}`);
                    }
                }
            } else if (action.type === 'start_sequence' && action.sequenceId) {
                console.log(`[WorkflowEngine] Enrolling entity ${entityData._id || entityData.id} into Sequence ${action.sequenceId}`);
                try {
                    const mod = await import('../../src/queues/marketingQueue.js');
                    const marketingQueue = mod.marketingQueue;
                    if (marketingQueue) {
                        await marketingQueue.add('drip', {
                            leadId: entityData._id || entityData.id,
                            sequenceId: action.sequenceId,
                            step: 1
                        }, { delay: 0 });
                    }
                } catch (qErr) {
                    console.error('[WorkflowEngine] Failed to enqueue sequence:', qErr.message);
                }
            } else if (action.type === 'send_notification' && action.message) {
                console.log(`[WorkflowEngine] Sending Internal Notification (Raw) to ${action.target}`);
                try {
                    const { createNotification } = await import('../../controllers/notification.controller.js');
                    // Resolve target user (defaulting to entity owner/assignedTo)
                    const targetUserId = entityData.owner || entityData.assignedTo;
                    if (targetUserId) {
                        await createNotification(
                            targetUserId,
                            'system',
                            'Automated Trigger Alert',
                            action.message,
                            `/${trigger.module}/${entityData._id || entityData.id}`,
                            { source: 'WorkflowEngine' }
                        );
                    } else {
                        console.log(`[WorkflowEngine] Skipping send_notification (Raw): No owner/assignedTo found on entity`);
                    }
                } catch (nErr) {
                    console.error('[WorkflowEngine] Failed to send notification:', nErr.message);
                }
            } else if (action.type === 'update_field' && action.field && action.value) {
                console.log(`[WorkflowEngine] Updating field (Raw) for ${trigger.module} ID ${entityData._id || entityData.id}: ${action.field} = ${action.value}`);
                const mongoose = (await import('mongoose')).default;
                const modelMap = { leads: 'Lead', deals: 'Deal', activities: 'Activity', inventory: 'Inventory', communication: 'Communication', post_sale: 'PostSale', campaigns: 'Campaign' };
                const modelName = modelMap[trigger.module] || trigger.module;
                const Model = mongoose.model(modelName);
                await Model.findByIdAndUpdate(entityData._id || entityData.id, { $set: { [action.field]: action.value } }, { new: true });
            } else if (action.type === 'broadcast_deal' || action.type === 'deal_broadcast') {
                console.log(`[WorkflowEngine] Executing Raw Action 'broadcast_deal' for ${trigger?.module || 'entity'} ID ${entityData._id || entityData.id}`);
                await this.executeBroadcastDealAction(action, entityData, trigger, companyId);
            }

            if (claimAcquired) {
                if (!executionOptions.callerManagedClaim) {
                    const finalizeResult = await AutomationLog.updateOne(
                        { idempotencyKey: canonicalKey, claimToken },
                        { $set: { status: 'success', executedAt: new Date() } }
                    );
                    if (finalizeResult.modifiedCount !== 1) {
                        console.warn(`[WorkflowEngine] Ownership lost during finalization for canonical key: ${canonicalKey}`);
                        if (executionOptions.propagateError || executionOptions.rethrowErrors) {
                            throw new Error(`Automation execution ownership lost during canonical success finalization: ${canonicalKey}`);
                        }
                    }
                }
            } else if (!isNativeRawAction) {
                await AutomationLog.create({
                    ruleType: 'Trigger',
                    ruleId: trigger?._id || null,
                    targetEntityId: entityData._id || entityData.id,
                    targetModule: trigger?.module || 'general',
                    status: 'success',
                    companyId: companyId || entityData.companyId || null,
                    tenantId: entityData.tenantId || trigger?.tenantId || null
                });
            }
        } catch (error) {
            console.error(`[WorkflowEngine] Action failed:`, error);
            if (claimAcquired && !executionOptions.callerManagedClaim) {
                const isRetryable = executionOptions.isRetryable !== false;
                await AutomationLog.updateOne(
                    { idempotencyKey: canonicalKey, claimToken },
                    { $set: { status: 'failed', details: { error: error.message, retryable: isRetryable } } }
                );
            } else if (!claimAcquired && !isNativeRawAction) {
                await AutomationLog.create({
                    ruleType: 'Trigger',
                    ruleId: trigger?._id || null,
                    targetEntityId: entityData._id || entityData.id,
                    targetModule: trigger?.module || 'general',
                    status: 'failed',
                    details: { error: error.message },
                    companyId: companyId || entityData.companyId || null,
                    tenantId: entityData.tenantId || trigger?.tenantId || null
                });
            }
            if (executionOptions.rethrowErrors || executionOptions.propagateError) {
                throw error;
            }
        }
    }

    /**
     * Phase C.2 — Build Meta-format components from a CRM named-param array.
     *
     * Replicates the template-building logic previously inside sendWhatsAppMessage()
     * in social.controller.js, adapted for non-HTTP / server-to-server execution.
     *
     * Covers:
     *  - BODY: named ({{OwnerName}}) and numbered ({{1}}) variable resolution
     *  - HEADER TEXT: variable-bearing text headers
     *  - HEADER media (IMAGE/VIDEO/DOCUMENT): DB-configured default or hardcoded fallback
     *  - BUTTONS: URL with dynamic variable, FLOW tokens, QUICK_REPLY (no-op)
     *  - Fallback when template definition is not found
     *
     * @param {object|null}  templateDef  Template definition from WhatsAppService.getTemplates()
     * @param {Array}        crmParams    Output of _buildTemplateComponents(): [{parameter_name, text}]
     * @param {string}       templateId   Template name (for logging)
     * @returns {Array}                   Meta-format components array
     */
    static async _buildMetaComponents(templateDef, crmParams, templateId) {
        const components = [];

        // ─── Build lookup maps from CRM params (mirrors controller) ──────────────
        const namedParamMap   = {};   // exact-case lookup
        const namedParamMapLC = {};   // lowercase lookup for case-insensitive match
        const positionalValues = [];  // ordered list for {{1}}, {{2}} …
        const plainTextList    = [];  // bare string items without parameter_name

        if (Array.isArray(crmParams) && crmParams.length > 0) {
            crmParams.forEach(item => {
                if (item && typeof item === 'object' && item.parameter_name) {
                    namedParamMap[item.parameter_name]                    = item.text || '';
                    namedParamMapLC[item.parameter_name.toLowerCase()]    = item.text || '';
                    positionalValues.push(item.text || '');
                } else {
                    plainTextList.push(typeof item === 'string' ? item : (item?.text || ''));
                }
            });
        }

        let positionalIdx = 0;
        let plainIdx      = 0;

        if (templateDef) {
            for (const compDef of templateDef.components) {

                // ── BODY ──────────────────────────────────────────────────────────
                if (compDef.type === 'BODY') {
                    const bodyMatches = (compDef.text || '').match(/{{([a-zA-Z0-9_]+)}}/g) || [];
                    const uniqueVars  = Array.from(new Set(bodyMatches.map(m => m.replace(/[{}]/g, '').trim())));

                    if (uniqueVars.length > 0) {
                        const parameters = uniqueVars.map(varName => {
                            const isNumberedVar = /^\d+$/.test(varName);
                            const varLC         = varName.toLowerCase();
                            let textVal;

                            if (namedParamMapLC[varLC] !== undefined) {
                                textVal = namedParamMapLC[varLC];
                            } else if (isNumberedVar && positionalIdx < positionalValues.length) {
                                textVal = positionalValues[positionalIdx++];
                            } else if (plainIdx < plainTextList.length) {
                                textVal = plainTextList[plainIdx++];
                            } else {
                                textVal = '-';
                            }

                            // Meta rejects empty-string variables — use '-' as fallback
                            let finalVal = String(textVal).trim();
                            if (finalVal === '' || finalVal === 'null' || finalVal === 'undefined') finalVal = '-';

                            const param = { type: 'text', text: finalVal };
                            if (!isNumberedVar) param.parameter_name = varName; // preserve named-var identity
                            return param;
                        });
                        components.push({ type: 'body', parameters });
                    }

                // ── BUTTONS ───────────────────────────────────────────────────────
                } else if (compDef.type === 'BUTTONS') {
                    compDef.buttons?.forEach((btn, btnIdx) => {
                        if (btn.type === 'URL' && btn.url && /{{([a-zA-Z0-9_]+)}}/.test(btn.url)) {
                            const urlVarName = btn.url.match(/{{([a-zA-Z0-9_]+)}}/)[1];
                            let btnTokenVal  = namedParamMap[urlVarName]
                                || namedParamMap['siteVisitToken']
                                || namedParamMap['site_visit_token']
                                || plainTextList[plainIdx]
                                || 'visit';
                            // JWT dots must be encoded as '~' for Meta URL template vars
                            if (typeof btnTokenVal === 'string' && btnTokenVal.includes('.')) {
                                btnTokenVal = btnTokenVal.replace(/\./g, '~');
                            }
                            components.push({
                                type:       'button',
                                sub_type:   'url',
                                index:      String(btnIdx),
                                parameters: [{ type: 'text', text: String(btnTokenVal) }]
                            });
                        } else if (btn.type === 'FLOW') {
                            components.push({
                                type:       'button',
                                sub_type:   'flow',
                                index:      String(btnIdx),
                                parameters: [{
                                    type:   'action',
                                    action: { flow_token: `crm_flow_${Date.now()}_${Math.floor(Math.random() * 1000)}` }
                                }]
                            });
                        }
                        // QUICK_REPLY: no component needed — Meta renders automatically
                    });

                // ── TEXT HEADER ───────────────────────────────────────────────────
                } else if (compDef.type === 'HEADER' && compDef.format === 'TEXT') {
                    const headerMatches = (compDef.text || '').match(/{{([a-zA-Z0-9_]+)}}/g) || [];
                    if (headerMatches.length > 0) {
                        const parameters = headerMatches.map(match => {
                            const varName   = match.replace(/[{}]/g, '').trim();
                            const isNumbered = /^\d+$/.test(varName);
                            let textVal;
                            if (namedParamMapLC[varName.toLowerCase()] !== undefined) {
                                textVal = namedParamMapLC[varName.toLowerCase()];
                            } else if (isNumbered && positionalIdx < positionalValues.length) {
                                textVal = positionalValues[positionalIdx++];
                            } else {
                                textVal = plainTextList[plainIdx] || 'Update';
                            }
                            const param = { type: 'text', text: String(textVal).substring(0, 200) };
                            if (!isNumbered) param.parameter_name = varName;
                            return param;
                        });
                        components.push({ type: 'header', parameters });
                    }

                // ── MEDIA HEADER (IMAGE / VIDEO / DOCUMENT) ───────────────────────
                // Note: controller also accepted headerImageUrl/mediaUrl from req.body.
                // WorkflowEngine has no HTTP request — media URL comes from DB default
                // or hardcoded fallback, same as when controller ran without explicit media.
                } else if (compDef.type === 'HEADER' && compDef.format && compDef.format !== 'TEXT') {
                    const hType = compDef.format.toLowerCase(); // 'image' | 'video' | 'document'

                    let dbDefaultImage = null;
                    try {
                        const mongoose = (await import('mongoose')).default;
                        const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting');
                        const imgSetting = await SystemSetting.findOne({ key: 'wa_feedback_header_image' }).lean();
                        dbDefaultImage = imgSetting?.value?.url || null;
                    } catch (_e) { /* non-fatal — fall through to hardcoded default */ }

                    const finalMediaUrl = dbDefaultImage || (
                        hType === 'document' ? 'https://api.bharatproperties.co/uploads/Huda_Map_Book_KKR.pdf?v=compressed_v1' :
                        hType === 'image'    ? '/uploads/whatsapp_feedback_header.jpg' :
                        'https://www.w3schools.com/html/mov_bbb.mp4'
                    );

                    // WorkflowEngine cannot upload local files to Meta (no req/res context).
                    // Use link-based reference — same as controller's non-local-file path.
                    const mediaObject = { link: finalMediaUrl };
                    if (hType === 'document') mediaObject.filename = 'Huda_Map_Book_KKR.pdf';

                    const headerComp = {
                        type:       'header',
                        parameters: [{ type: hType, [hType]: mediaObject }]
                    };
                    const existingHeaderIdx = components.findIndex(c => c.type === 'header');
                    if (existingHeaderIdx >= 0) components[existingHeaderIdx] = headerComp;
                    else components.push(headerComp);
                }
            }

        // ─── Fallback — template definition not found (mirrors controller fallback) ─
        } else {
            console.warn(`[WorkflowEngine] ⚠️ Template definition NOT found for: ${templateId}. Using flat param fallback.`);
            if (Array.isArray(crmParams) && crmParams.length > 0) {
                components.push({
                    type:       'body',
                    parameters: crmParams.map(item => {
                        let textVal = typeof item === 'string' ? item : (item?.text || '');
                        textVal = String(textVal).trim();
                        if (textVal === '' || textVal === 'null' || textVal === 'undefined') textVal = '-';
                        const param = { type: 'text', text: textVal };
                        if (item?.parameter_name) param.parameter_name = item.parameter_name;
                        return param;
                    })
                });
            }
        }

        return components;
    }

    /**
     * 🚀 ENTERPRISE: Build comprehensive templateComponents from entity data.
     * Maps CRM fields to Meta-approved template variables so that WhatsApp
     * templates receive real, dynamic data instead of empty placeholders.

     * Also generates JWT tokens for CTA button URLs (public form pre-fill).
     */
    static async _buildTemplateComponents(entityData, moduleName, companyId) {
        const mongoose = (await import('mongoose')).default;
        const LeadTokenGenerator = (await import('./LeadTokenGenerator.js')).default;

        // ─── Resolve Lookups ───
        // If entityData has raw ObjectIds for lookup fields, resolve them to human-readable text
        const resolvedFields = {};
        try {
            const LookupModel = mongoose.models.Lookup || mongoose.model('Lookup');
            const extractIds = (val) => {
                if (Array.isArray(val)) return val.map(extractIds).flat().filter(Boolean);
                if (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) return [val];
                if (val && typeof val === 'object' && val._id) return [val._id.toString()];
                return [];
            };

            const lookupFields = ['sizeType', 'propertyType', 'subType', 'transactionType', 'source', 'status', 'stage', 'requirement', 'location'];
            const idsToResolve = [];
            lookupFields.forEach(field => {
                const ids = extractIds(entityData[field]);
                if (ids && ids.length) idsToResolve.push(...ids);
            });

            if (idsToResolve.length > 0) {
                const lookups = await LookupModel.find({ _id: { $in: idsToResolve } }).lean();
                const lookupMap = {};
                lookups.forEach(l => lookupMap[l._id.toString()] = l.label || l.value || l.lookup_value || l.name);

                lookupFields.forEach(field => {
                    const val = entityData[field];
                    if (!val) return;
                    if (Array.isArray(val)) {
                        resolvedFields[field] = val.map(v => {
                            const id = typeof v === 'object' ? v._id?.toString() : String(v);
                            return lookupMap[id] || (typeof v === 'object' ? (v.label || v.value || v.lookup_value || v.name) : v);
                        }).filter(Boolean).join(', ');
                    } else {
                        const id = typeof val === 'object' ? val._id?.toString() : String(val);
                        resolvedFields[field] = lookupMap[id] || (typeof val === 'object' ? (val.label || val.value || val.lookup_value || val.name) : val);
                    }
                });
            }
        } catch (err) {
            console.error('[WorkflowEngine] Failed to resolve lookups:', err);
        }

        // ─── Helper: Format Mixed/Array fields to comma-separated strings ───
        const formatField = (val, fieldName) => {
            if (fieldName && resolvedFields[fieldName]) return resolvedFields[fieldName];
            if (!val) return '';
            if (Array.isArray(val)) {
                return val.map(v => {
                    if (typeof v === 'object' && v !== null) return v.label || v.value || v.lookup_value || v.name || String(v);
                    return String(v);
                }).filter(Boolean).join(', ');
            }
            if (typeof val === 'object' && val !== null) return val.label || val.value || val.lookup_value || val.name || String(val);
            return String(val);
        };

        // ─── Helper: Format budget to human-readable Indian notation ───
        const formatBudget = (entity) => {
            if (entity.budget && typeof entity.budget === 'string') return entity.budget;
            if (entity.budget && typeof entity.budget === 'object') return entity.budget.name || entity.budget.label || '';
            const val = Number(entity.budgetMax || entity.budgetMin || 0);
            if (!val) return '';
            if (val >= 10000000) return `${(val / 10000000).toFixed(2)} Cr.`;
            if (val >= 100000) return `${(val / 100000).toFixed(2)} Lac`;
            return String(val);
        };

        // ─── Resolve assigned agent (User) details ───
        let agentName = 'Bharat Properties';
        let agentMobile = '';
        let agentEmail = '';
        const assignedToId = entityData.assignment?.assignedTo || entityData.assignedTo || entityData.createdBy;
        if (assignedToId) {
            try {
                const User = mongoose.models.User || mongoose.model('User');
                const agent = await User.findById(assignedToId).select('name fullName mobile phone email').lean();
                if (agent) {
                    agentName = agent.fullName || agent.name || 'Bharat Properties';
                    agentMobile = agent.mobile || agent.phone || '';
                    agentEmail = agent.email || '';
                }
            } catch (e) {
                console.error('[WorkflowEngine] Failed to resolve agent:', e.message);
            }
        }

        // ─── Build full name ───
        const fullName = [entityData.firstName, entityData.lastName].filter(Boolean).join(' ')
            || entityData.fullName || entityData.name || 'Valued Customer';

        // ─── Build location string ───
        const locationParts = [
            formatField(entityData.location, 'location'),
            entityData.sector,
            entityData.locArea,
            entityData.locCity
        ].filter(Boolean);
        const locationStr = locationParts.join(', ');

        // ─── Generate JWT token for CTA button URLs ───
        let leadToken = '';
        if (moduleName === 'leads' && (entityData._id || entityData.id)) {
            leadToken = LeadTokenGenerator.generate(entityData._id || entityData.id);
        }

        // ─── Comprehensive Variable Map (covers ALL Settings > Messaging > Variables) ───
        const variableMap = {
            // Customer / Lead Data
            'lead_name': fullName,
            'full_name': fullName,
            'first_name': entityData.firstName || fullName.split(' ')[0] || '',
            'last_name': entityData.lastName || '',
            'mobile': entityData.mobile || '',
            'email': entityData.email || '',
            'lead_source': formatField(entityData.source, 'source'),
            'lead_status': formatField(entityData.status, 'status'),
            'lead_stage': formatField(entityData.stage, 'stage'),
            'lead_requirement': formatField(entityData.requirement, 'requirement'),

            // Property Requirement
            'intent': formatField(entityData.requirement, 'requirement'),
            'transaction_type': formatField(entityData.transactionType, 'transactionType'),
            'size': formatField(entityData.sizeType, 'sizeType'),
            'property_size': formatField(entityData.sizeType, 'sizeType'),
            'sub_category': formatField(entityData.subType, 'subType'),
            'property_subcategory': formatField(entityData.subType, 'subType'),
            'location': locationStr,
            'preferred_area': formatField(entityData.location, 'location') || entityData.locArea || entityData.sector || '',
            'preferred_city': entityData.locCity || '',
            'budget': formatBudget(entityData),
            'budget_max': formatBudget(entityData),
            'budget_min': entityData.budgetMin ? String(entityData.budgetMin) : '',

            // Agent / Employee Data
            'employee_name': agentName,
            'employee_mobile': agentMobile,
            'agent_name': agentName,
            'agent_mobile': agentMobile,
            'agent_email': agentEmail,

            // Feedback-style Aliases
            'OwnerName': fullName,
            'ownername': fullName,
            'EmployeeName': agentName,
            'employeename': agentName,
            'EmployeeMobile': agentMobile,
            'employeemobile': agentMobile,

            // System
            'company_name': 'Bharat Properties',

            // CTA Button URL Token (for {{1}} in Meta button URLs)
            'lead_token': leadToken,
            '1': leadToken,
        };

        return Object.entries(variableMap)
            .filter(([_, val]) => val !== undefined && val !== null)
            .map(([key, val]) => ({
                parameter_name: key,
                text: String(val || '')
            }));
    }

    /**
     * 🏢 Broadcast Deal (Omnichannel BNA) Execution
     * Shared across Automated Actions, Native Triggers, and Drip Sequences.
     * Enqueues to 'bna-broadcast' so it strictly honors:
     *  - 5-chat forward limit per batch
     *  - 3-10m cooldown between batches
     *  - 8-15s intra-group jitter
     *  - Single-account dispatch
     */
    static async executeBroadcastDealAction(actionConfig, entityData, trigger, companyId) {
        const mongoose = (await import('mongoose')).default;
        const Deal = mongoose.model('Deal');

        // 1. Locate Target Deal ID
        let targetDealId = null;
        if (entityData && (trigger?.module === 'deals' || entityData.dealCode || entityData.price || entityData.broadcastMetadata)) {
            targetDealId = entityData._id || entityData.id;
        } else if (entityData?.dealId) {
            targetDealId = entityData.dealId;
        } else if (actionConfig?.configuration?.dealId) {
            targetDealId = actionConfig.configuration.dealId;
        } else if (entityData && (trigger?.module === 'inventory' || entityData.inventoryId)) {
            const invId = entityData.inventoryId?._id || entityData.inventoryId || entityData._id || entityData.id;
            const linkedDeal = await Deal.findOne({ inventoryId: invId }).sort({ createdAt: -1 }).lean();
            if (linkedDeal) targetDealId = linkedDeal._id;
        }

        if (!targetDealId) {
            console.warn(`[WorkflowEngine] broadcast_deal skipped: No target Deal ID could be identified from entity ${entityData?._id}`);
            return;
        }

        // 2. Fetch Deal with full relational population
        const freshDeal = await Deal.findById(targetDealId)
            .populate('inventoryId')
            .populate('owner')
            .populate('projectId')
            .populate('partyStructure.owner')
            .populate('assignedTo')
            .lean();

        if (!freshDeal) {
            console.warn(`[WorkflowEngine] broadcast_deal skipped: Deal ${targetDealId} not found in database.`);
            return;
        }

        // 3. Build Broadcast Metadata
        let meta = freshDeal.broadcastMetadata;
        if (!meta || !meta.isReady) {
            const p = freshDeal.price || freshDeal.quotePrice || freshDeal.value;
            const formattedPrice = p ? (p >= 10000000 ? `₹ ${(p / 10000000).toFixed(2)} Cr` : p >= 100000 ? `₹ ${(p / 100000).toFixed(2)} Lac` : `₹ ${p.toLocaleString('en-IN')}`) : 'Price on Request';
            meta = {
                title: freshDeal.title || freshDeal.dealCode || 'Exclusive Deal',
                location: freshDeal.location || freshDeal.locationDetails?.locality || 'Kurukshetra',
                price: formattedPrice,
                features: [freshDeal.size ? `${freshDeal.size} ${freshDeal.sizeUnit || 'Sq.Ft'}` : null, freshDeal.unitType].filter(Boolean),
                description: freshDeal.remarks || freshDeal.description || 'Verified property listing',
                isReady: true,
                inventoryId: freshDeal.inventoryId
            };
        }
        const shareableId = freshDeal.shareableId || freshDeal.dealCode || `BP-${String(freshDeal._id).slice(-6).toUpperCase()}`;

        // 4. Resolve Target Audience from audienceConfig
        const aud = actionConfig.audienceConfig || actionConfig.configuration?.audienceConfig || {};
        const rawRecipients = [];
        const normalizePhone = (num) => {
            if (!num) return '';
            let cleaned = String(num).replace(/[^0-9+]/g, '');
            if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
            if (!cleaned.startsWith('+') && cleaned.length === 10) cleaned = '91' + cleaned;
            else if (cleaned.startsWith('+')) cleaned = cleaned.replace('+', '');
            return cleaned;
        };

        // A. Broker Groups
        if (aud.sendToBrokerGroups) {
            const Company = mongoose.model('Company');
            const compFilter = {};
            if (!aud.allBrokerGroups && Array.isArray(aud.selectedGroups) && aud.selectedGroups.length > 0) {
                compFilter.groups = { $in: aud.selectedGroups };
            }
            if (companyId) compFilter.companyId = companyId;

            const companies = await Company.find(compFilter).lean();
            companies.forEach(c => {
                const phone = c.phones?.[0]?.phoneNumber || '';
                const email = c.emails?.[0]?.address || '';
                if (phone || email) {
                    rawRecipients.push({
                        id: c._id,
                        name: c.name,
                        mobile: normalizePhone(phone),
                        email: email,
                        isVerified: c.isVerifiedBroker,
                        context: { originalType: 'Company' }
                    });
                }
            });
        }

        // B. Contact Groups
        if (aud.includeContactGroups) {
            const Contact = mongoose.model('Contact');
            const contactFilter = {};
            if (!aud.allContactGroups && Array.isArray(aud.selectedContactGroups) && aud.selectedContactGroups.length > 0) {
                contactFilter.groups = { $in: aud.selectedContactGroups };
            }
            if (companyId) contactFilter.companyId = companyId;

            const contacts = await Contact.find(contactFilter).lean();
            contacts.forEach(c => {
                const phone = c.phones?.[0]?.number || '';
                const email = c.emails?.[0]?.address || '';
                if (phone || email) {
                    rawRecipients.push({
                        id: c._id,
                        name: `${c.name || ''} ${c.surname || ''}`.trim() || 'Valued Client',
                        mobile: normalizePhone(phone),
                        email: email,
                        isVerified: false,
                        context: { originalType: 'Contact' }
                    });
                }
            });
        }

        // C. WhatsApp Web Groups (@g.us)
        if (aud.includeWaGroups) {
            if (aud.allWaGroups) {
                try {
                    const waService = (await import('../../services/WhatsAppService.js')).default;
                    const allGroups = await waService.getGroups();
                    // Exclude announce/locked channels where we cannot post
                    const openGroups = allGroups.filter(g => g.canSend !== false && g.announce !== true);
                    openGroups.forEach(g => {
                        rawRecipients.push({
                            id: g.id,
                            name: g.subject || g.name || 'WhatsApp Group',
                            mobile: g.id,
                            email: '',
                            isVerified: false,
                            isGroup: true,
                            context: { originalType: 'WhatsAppGroup' }
                        });
                    });
                } catch (gErr) {
                    console.warn('[WorkflowEngine] Failed to auto-fetch WhatsApp groups:', gErr.message);
                }
            } else if (Array.isArray(aud.selectedWaGroups) && aud.selectedWaGroups.length > 0) {
                aud.selectedWaGroups.forEach(jid => {
                    rawRecipients.push({
                        id: jid,
                        name: 'WhatsApp Group',
                        mobile: jid,
                        email: '',
                        isVerified: false,
                        isGroup: true,
                        context: { originalType: 'WhatsAppGroup' }
                    });
                });
            }
        }

        // D. Matched Buyer Leads
        if (aud.includeMatchedBuyers) {
            try {
                const Lead = mongoose.model('Lead');
                const leadFilter = { status: { $nin: ['Lost', 'Disqualified', 'Junk'] } };
                if (companyId) leadFilter.companyId = companyId;
                if (freshDeal.propertyType) {
                    leadFilter.$or = [
                        { propertyType: freshDeal.propertyType },
                        { propertyType: { $exists: false } },
                        { propertyType: null }
                    ];
                }
                const candidateLeads = await Lead.find(leadFilter).limit(50).lean();
                candidateLeads.forEach(l => {
                    const phone = l.mobile || l.primaryPhone || '';
                    if (phone) {
                        rawRecipients.push({
                            id: l._id,
                            name: `${l.salutation || ''} ${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Buyer',
                            firstName: l.firstName || 'Customer',
                            lastName: l.lastName || '',
                            mobile: normalizePhone(phone),
                            email: l.email || '',
                            isVerified: false,
                            context: { originalType: 'Lead' }
                        });
                    }
                });
            } catch (mErr) {
                console.warn('[WorkflowEngine] Failed to fetch matched buyer leads:', mErr.message);
            }
        }

        // Deduplicate Recipients
        const seen = new Set();
        const recipients = [];
        for (const r of rawRecipients) {
            const key = r.mobile ? `m:${r.mobile}` : (r.email ? `e:${String(r.email).toLowerCase()}` : `id:${r.id}`);
            if (!seen.has(key)) {
                seen.add(key);
                recipients.push(r);
            }
        }

        if (recipients.length === 0) {
            console.log(`[WorkflowEngine] broadcast_deal: 0 recipients found matching audience configuration.`);
            return;
        }

        // 5. Build channels and payload
        const notif = actionConfig.notificationConfig || {};
        const channels = notif.channels
            ? Object.keys(notif.channels).filter(k => notif.channels[k])
            : ['whatsapp'];
        const activeChannels = channels.length > 0 ? channels : ['whatsapp'];

        const isBaileys = (aud.whatsappMode || 'baileys') === 'baileys';
        const templateId = notif.templates?.whatsapp || 'deal_broadcast';

        const jobData = {
            name: `Automated Action BNA: ${freshDeal.title || freshDeal.dealCode}`,
            dealId: freshDeal._id,
            dealIds: [freshDeal._id],
            deal: freshDeal,
            deals: [freshDeal],
            channels: activeChannels,
            recipients,
            meta,
            templateId,
            templateText: actionConfig.configuration?.templateText || null,
            isBaileys,
            language: 'en',
            integrationId: actionConfig.configuration?.integrationId || null,
            shareableId,
            smsTemplate: notif.templates?.sms ? { id: notif.templates.sms } : null,
            rcsTemplate: notif.templates?.rcs ? { id: notif.templates.rcs } : null,
            emailTemplate: notif.templates?.email ? { id: notif.templates.email } : null,
            forceBroadcast: false,
            deduplicationWindowHours: 4,
            performedBy: `Automated Action: ${actionConfig.name || 'System Workflow'}`
        };

        // 6. Enqueue or Direct Dispatch
        try {
            const { marketingQueue } = await import('../queues/marketingQueue.js');
            const { isRedisOnline } = await import('../config/redis.js');

            if (marketingQueue && isRedisOnline) {
                const queuedJob = await marketingQueue.add('bna-broadcast', jobData, { removeOnComplete: true });
                console.log(`[WorkflowEngine] ✅ Queued BNA Broadcast job #${queuedJob.id} for Deal ${freshDeal._id} (${recipients.length} recipients)`);
            } else {
                console.warn('[WorkflowEngine] Redis Offline - Fallback to Direct Background BNA Dispatch');
                const { _dispatchBNADirectly } = await import('../../controllers/marketing.controller.js');
                _dispatchBNADirectly(jobData).catch(err => console.error('[WorkflowEngine] Direct BNA Error:', err));
            }
        } catch (queueErr) {
            console.error('[WorkflowEngine] Queue dispatch error:', queueErr);
            const { _dispatchBNADirectly } = await import('../../controllers/marketing.controller.js');
            _dispatchBNADirectly(jobData).catch(err => console.error('[WorkflowEngine] Fallback Direct BNA Error:', err));
        }
    }

    static async fireEvent(moduleName, eventName, entityData, companyId) {
        try {
            // Phase E.3-D.9-B2-B: Check ExecutionCoordinator authority for coordinated events
            if (moduleName === 'deals' && (eventName === 'deal_created' || eventName === 'DealCreated')) {
                const { validateExecutionAuthority } = await import('./executionCoordinator.js');
                const authority = await validateExecutionAuthority('LEGACY', eventName);
                if (!authority.authorized) {
                    console.log(`[WorkflowEngine] Event ${moduleName}.${eventName} execution suppressed by ExecutionCoordinator (owner: ${authority.owner}, epoch: ${authority.epoch}, reason: ${authority.reason})`);
                    return;
                }
            }

            const activeTriggers = await Trigger.find({
                module: moduleName,
                event: eventName,
                isActive: true,
                companyId: companyId
            }).sort({ priority: 1 });

            for (const trigger of activeTriggers) {
                const shouldFire = this.evaluateRules(trigger.conditions, entityData);
                if (shouldFire) {
                    console.log(`[WorkflowEngine] Trigger '${trigger.name}' fired for ${moduleName}.${eventName}`);
                    for (let actionIndex = 0; actionIndex < trigger.actions.length; actionIndex++) {
                        const action = trigger.actions[actionIndex];
                        await this.executeAction(action, entityData, trigger, companyId, false, { actionIndex });
                    }
                }
            }
        } catch (error) {
            console.error(`[WorkflowEngine] Failed to process event ${moduleName}.${eventName}:`, error);
        }
    }
}
