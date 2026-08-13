import eventBus from './EventBus.js';
import AutomatedAction from '../models/AutomatedAction.js';
import Trigger from '../models/Trigger.js';
import AutomationLog from '../models/AutomationLog.js';
import sendWhatsAppMessage from './whatsappService.js';
// We'll import other services as needed

class AutomationEngine {
    constructor() {
        this.initializeListeners();
    }

    initializeListeners() {
        // Core entity events
        eventBus.on('LEAD_CREATED', (lead) => this.processEvent('LEAD_CREATED', lead, 'Lead'));
        eventBus.on('LEAD_UPDATED', (lead) => this.processEvent('LEAD_UPDATED', lead, 'Lead'));
        eventBus.on('DEAL_CREATED', (deal) => this.processEvent('DEAL_CREATED', deal, 'Deal'));
        eventBus.on('DEAL_UPDATED', (deal) => this.processEvent('DEAL_UPDATED', deal, 'Deal'));
        eventBus.on('INVENTORY_CREATED', (inv) => this.processEvent('INVENTORY_CREATED', inv, 'Inventory'));
        eventBus.on('INVENTORY_UPDATED', (inv) => this.processEvent('INVENTORY_UPDATED', inv, 'Inventory'));
    }

    async processEvent(eventName, entity, entityType) {
        try {
            console.log(`[AutomationEngine] Received ${eventName} for ${entityType} ${entity._id}`);
            
            // Map uppercase backend events to frontend trigger event names
            const triggerEventMap = {
                'LEAD_CREATED': 'lead_created',
                'LEAD_UPDATED': 'lead_updated',
                'DEAL_CREATED': 'deal_created',
                'DEAL_UPDATED': 'deal_updated',
                'INVENTORY_CREATED': 'inventory_created',
                'INVENTORY_UPDATED': 'inventory_updated'
            };

            const mappedEvent = triggerEventMap[eventName] || eventName.toLowerCase();

            // Find Triggers listening to this event
            const activeTriggers = await Trigger.find({ 
                event: mappedEvent,
                isActive: true
            }).sort({ priority: 1 });

            if (activeTriggers.length === 0) {
                console.log(`[AutomationEngine] No active triggers for ${mappedEvent}.`);
                return;
            }

            console.log(`[AutomationEngine] Found ${activeTriggers.length} triggers for ${mappedEvent}. Evaluating...`);

            for (const trigger of activeTriggers) {
                // Condition evaluation (basic implementation)
                let conditionsMet = true;
                if (trigger.conditions && Object.keys(trigger.conditions).length > 0) {
                    for (const [key, value] of Object.entries(trigger.conditions)) {
                        if (entity[key] !== value) {
                            conditionsMet = false;
                            break;
                        }
                    }
                }

                if (!conditionsMet) {
                    console.log(`[AutomationEngine] Trigger ${trigger.name} conditions not met.`);
                    continue;
                }

                console.log(`[AutomationEngine] Trigger ${trigger.name} conditions MET. Executing actions...`);

                // Execute Actions
                for (const action of trigger.actions || []) {
                    await this.executeAction(action, entity, entityType);
                }
            }

        } catch (error) {
            console.error(`[AutomationEngine] Error processing ${eventName}:`, error);
        }
    }

    async executeAction(action, entity, entityType) {
        try {
            if (action.type === 'send_communication') {
                console.log(`[AutomationEngine] Dispatching ${action.channel} to entity ${entity._id}`);
                // In production, invoke dispatcher here.
            } else if (action.type === 'fire_automated_action' || action.automatedActionId) {
                const autoAction = await AutomatedAction.findById(action.automatedActionId);
                if (autoAction && autoAction.isActive) {
                    console.log(`[AutomationEngine] Executing Automated Action: ${autoAction.name}`);
                    // Execute specific rules (e.g. update field)
                }
            } else {
                console.log(`[AutomationEngine] Executing Action: ${action.type || 'Unknown'}`);
            }
        } catch (error) {
            console.error(`[AutomationEngine] Action Execution Failed:`, error);
        }
    }
}

// Global singleton instance
const engine = new AutomationEngine();

export default engine;
