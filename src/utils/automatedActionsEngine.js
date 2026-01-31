/**
 * Automated Actions Engine - Safe Execution Layer
 * 
 * Core Philosophy:
 * - System Hands (Triggers are the Brain)
 * - Safe & Repetitive tasks only
 * - No financial or inventory decision making
 */

const MODULE_RESTRICTIONS = {
    leads: {
        forbiddenActions: ['auto_convert_to_deal', 'lead_closure'],
        allowedUpdateFields: ['status', 'score', 'remarks', 'tags', 'source'],
        criticalFields: ['owner', 'assignedTo'] // Requires higher scrutiny
    },
    inventory: {
        forbiddenActions: ['modify_price', 'change_owner', 'auto_activate'],
        allowedUpdateFields: ['status', 'availabilityFlag', 'lockState'],
        criticalFields: ['lockState']
    },
    deals: {
        forbiddenActions: ['auto_close', 'commission_payout', 'modify_price'],
        allowedUpdateFields: ['stage', 'remarks', 'tags'],
        criticalFields: ['stage']
    },
    post_sale: {
        forbiddenActions: ['auto_refund', 'registry_completion', 'commission_release'],
        allowedUpdateFields: ['paymentStatus', 'documentationStatus'],
        criticalFields: ['paymentStatus']
    },
    activities: {
        forbiddenActions: ['reassign_without_approval', 'auto_complete_activity'],
        allowedUpdateFields: ['status', 'priority', 'dueDate'],
        criticalFields: []
    },
    contacts: {
        forbiddenActions: ['merge_records', 'delete_contact'],
        allowedUpdateFields: ['status', 'type', 'remarks', 'tags'],
        criticalFields: ['mobile', 'email']
    },
    communication: {
        forbiddenActions: ['delete_logs'],
        allowedUpdateFields: ['tags', 'remarks'],
        criticalFields: []
    }
};

/**
 * Validate if an action is safe to execute for a given module
 */
export const validateActionSafety = (module, actionType, fieldUpdates = {}) => {
    const restrictions = MODULE_RESTRICTIONS[module.toLowerCase()];
    if (!restrictions) return { valid: true }; // Generic safety for unlisted modules

    // Check forbidden actions
    if (restrictions.forbiddenActions.includes(actionType)) {
        return { valid: false, reason: `Action "${actionType}" is strictly forbidden for ${module}` };
    }

    // Check field updates
    const fields = Object.keys(fieldUpdates);
    const unauthorizedFields = fields.filter(f => !restrictions.allowedUpdateFields.includes(f));

    if (unauthorizedFields.length > 0) {
        return {
            valid: false,
            reason: `Automated Engine cannot update critical fields: ${unauthorizedFields.join(', ')} for ${module}`
        };
    }

    return { valid: true };
};

/**
 * Execute an automated action logic
 * @param {Object} action - The action definition
 * @param {Object} entity - The target entity (Lead, Inventory, etc.)
 * @param {Object} handlers - System handlers (api calls, state updates)
 * @returns {Promise<Object>} - Execution result with audit log
 */
export const executeAction = async (action, entity, handlers) => {
    const startTime = Date.now();
    const auditEntry = {
        actionId: action.id,
        actionName: action.name,
        entityId: entity.id,
        beforeValue: { ...entity },
        afterValue: null,
        timestamp: new Date().toISOString(),
        success: false,
        logs: []
    };

    try {
        // 1. Safety Validation
        const safety = validateActionSafety(action.targetModule, action.actionType, action.fieldMapping || {});
        if (!safety.valid) {
            throw new Error(`Safety Violation: ${safety.reason}`);
        }

        // 2. Permission Validation
        if (action.permissionLevelRequired === 'Admin' && (!handlers.currentUser || !handlers.currentUser.isAdmin)) {
            throw new Error(`Permission Denied: Admin authorization required for action "${action.name}"`);
        }

        // 3. Logic Execution based on type
        let result;
        switch (action.actionType) {
            case 'update_field':
                if (handlers.updateEntity) {
                    result = await handlers.updateEntity(action.targetModule, entity.id, action.fieldMapping);
                }
                break;

            case 'create_record':
                if (handlers.createRecord) {
                    result = await handlers.createRecord(action.targetModule, action.fieldMapping);
                }
                break;

            case 'add_tag':
                if (handlers.updateTags) {
                    result = await handlers.updateTags(action.targetModule, entity.id, action.tags, 'add');
                }
                break;

            case 'lock_inventory':
                if (action.targetModule === 'inventory' && handlers.setLockState) {
                    result = await handlers.setLockState(entity.id, true);
                }
                break;

            case 'unlock_inventory':
                if (action.targetModule === 'inventory' && handlers.setLockState) {
                    result = await handlers.setLockState(entity.id, false);
                }
                break;

            case 'send_notification':
                if (handlers.sendNotification) {
                    result = await handlers.sendNotification({
                        target: action.target,
                        template: action.template,
                        entity
                    });
                }
                break;

            default:
                throw new Error(`Execution Handler missing for type: ${action.actionType}`);
        }

        auditEntry.success = true;
        auditEntry.afterValue = result || { ...entity, ...action.fieldMapping };
        auditEntry.executionTime = Date.now() - startTime;
        return auditEntry;

    } catch (error) {
        auditEntry.success = false;
        auditEntry.error = error.message;
        auditEntry.logs.push(`FAILED: ${error.message}`);
        console.error(`[AutomatedAction_Engine] Execution Error:`, error);
        return auditEntry;
    }
};
