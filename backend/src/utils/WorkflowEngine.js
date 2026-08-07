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

    static async executeAction(action, entityData, trigger, companyId) {
        try {
            if (action.type === 'send_communication' && action.channel === 'whatsapp') {
                // Here we would dispatch to the WhatsApp API
                console.log(`[WorkflowEngine] Sending WhatsApp Template '${action.templateId}' to ${entityData.mobile}`);
                // await WhatsAppService.sendTemplate(entityData.mobile, action.templateId, ...);
            } else if (action.type === 'start_sequence') {
                console.log(`[WorkflowEngine] Enrolling entity ${entityData._id} into Sequence ${action.sequenceId}`);
                // Add entity to Sequence tracking collection
            }
            // Add other action types as needed
            
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
