import Trigger from '../../models/Trigger.js';
import AutomationLog from '../../models/AutomationLog.js';
import { sendWhatsAppMessage } from '../../controllers/social.controller.js'; // Ensure correct path or use an internal service method
// If sendWhatsAppMessage expects req/res, we might need a dedicated internal service for server-to-server calls.
// For now, let's mock the dispatcher or use an internal function.

export class WorkflowEngine {
    static evaluateCondition(rule, entityData) {
        const value = entityData[rule.field];
        
        switch (rule.operator) {
            case '==': return value == rule.value;
            case '!=': return value != rule.value;
            case '>': return value > rule.value;
            case '>=': return value >= rule.value;
            case '<': return value < rule.value;
            case '<=': return value <= rule.value;
            case 'IN': {
                const arr = Array.isArray(rule.value) ? rule.value : String(rule.value || '').split(',').map(s => s.trim());
                return arr.includes(value);
            }
            case 'NOT_IN': {
                const arr = Array.isArray(rule.value) ? rule.value : String(rule.value || '').split(',').map(s => s.trim());
                return !arr.includes(value);
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

    static async executeAction(action, entityData, trigger, companyId, isDelayedExecution = false) {
        try {
            // Process Delayed Actions if this is a 'fire_automated_action' and not already delayed
            if (!isDelayedExecution && action.type === 'fire_automated_action' && action.automatedActionId) {
                const AutomatedAction = (await import('../../models/AutomatedAction.js')).default;
                const autoAction = await AutomatedAction.findById(action.automatedActionId);
                
                if (autoAction && autoAction.delay && autoAction.delay.isActive) {
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
                    
                const existingLog = await AutomationLog.findOne({ idempotencyKey });
                if (existingLog) {
                    console.log(`[WorkflowEngine] Action already executed for key: ${idempotencyKey}. Skipping.`);
                    return;
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
                    }
                    
                    // Log success
                    await AutomationLog.create({
                        ruleType: 'AutomatedAction',
                        ruleId: autoAction._id,
                        targetEntityId: entityData._id || entityData.id,
                        targetModule: trigger.module,
                        status: 'success',
                        idempotencyKey,
                        companyId
                    });
                } catch (execError) {
                    console.error(`[WorkflowEngine] Automated Action Execution failed:`, execError);
                    await AutomationLog.create({
                        ruleType: 'AutomatedAction',
                        ruleId: autoAction._id,
                        targetEntityId: entityData._id || entityData.id,
                        targetModule: trigger.module,
                        status: 'failed',
                        details: { error: execError.message },
                        idempotencyKey,
                        companyId
                    });
                    throw execError;
                }
                
                return; // Automated action logic executed successfully
            }

            // ─── Native Raw Trigger Actions ───
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
                        const { sendWhatsAppMessage } = await import('../../controllers/social.controller.js');
                        const resolvedTemplate = VariableResolver.resolve(action.templateId || action.message || '', entityData);
                        console.log(`[WorkflowEngine] Sending WhatsApp to ${recipientMobile} | Template: ${action.templateId || 'text'}`);

                        // 🚀 ENTERPRISE: Build templateComponents with named parameters for Meta API
                        let templateComponents = [];
                        if (action.templateId) {
                            try {
                                templateComponents = await this._buildTemplateComponents(entityData, trigger.module, companyId);
                                console.log(`[WorkflowEngine] Built ${templateComponents.length} template components for ${trigger.module}`);
                            } catch (tcErr) {
                                console.error('[WorkflowEngine] Failed to build template components:', tcErr.message);
                            }
                        }

                        const mockReq = {
                            user: { companyId },
                            body: {
                                mobile: recipientMobile,
                                message: resolvedTemplate,
                                type: action.templateId ? 'template' : 'text',
                                templateId: action.templateId,
                                templateComponents: templateComponents.length > 0 ? templateComponents : undefined
                            }
                        };
                        const mockRes = { status: () => mockRes, json: () => mockRes };
                        await sendWhatsAppMessage(mockReq, mockRes, () => {}).catch(e => console.error('[WorkflowEngine] Meta API err:', e.message));
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
            }
            
            await AutomationLog.create({
                ruleType: 'Trigger',
                ruleId: trigger._id,
                targetEntityId: entityData._id || entityData.id,
                targetModule: trigger.module,
                status: 'success',
                companyId
            });
        } catch (error) {
            console.error(`[WorkflowEngine] Action failed:`, error);
            await AutomationLog.create({
                ruleType: 'Trigger',
                ruleId: trigger._id,
                targetEntityId: entityData._id || entityData.id,
                targetModule: trigger.module,
                status: 'failed',
                details: { error: error.message },
                companyId
            });
        }
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

        // ─── Helper: Format Mixed/Array fields to comma-separated strings ───
        const formatField = (val) => {
            if (!val) return '';
            if (Array.isArray(val)) {
                return val.map(v => {
                    if (typeof v === 'object' && v !== null) return v.name || v.label || String(v);
                    return String(v);
                }).filter(Boolean).join(', ');
            }
            if (typeof val === 'object' && val !== null) return val.name || val.label || String(val);
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
                const User = mongoose.model('User');
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
            formatField(entityData.location),
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
            'lead_source': formatField(entityData.source),
            'lead_status': formatField(entityData.status),
            'lead_stage': formatField(entityData.stage),
            'lead_requirement': formatField(entityData.requirement),

            // Property Requirement
            'size': formatField(entityData.sizeType),
            'property_size': formatField(entityData.sizeType),
            'sub_category': formatField(entityData.subType),
            'property_subcategory': formatField(entityData.subType),
            'location': locationStr,
            'preferred_area': formatField(entityData.location) || entityData.locArea || entityData.sector || '',
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

    static async fireEvent(moduleName, eventName, entityData, companyId) {
        try {
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
                    for (const action of trigger.actions) {
                        await this.executeAction(action, entityData, trigger, companyId);
                    }
                }
            }
        } catch (error) {
            console.error(`[WorkflowEngine] Failed to process event ${moduleName}.${eventName}:`, error);
        }
    }
}
