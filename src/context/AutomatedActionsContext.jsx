import React, { createContext, useContext, useState, useCallback } from 'react';
import { executeAction } from '../utils/automatedActionsEngine';
import { useFieldRules } from './FieldRulesContext';

const AutomatedActionsContext = createContext();

export const AutomatedActionsProvider = ({ children }) => {
    const { validate } = useFieldRules();
    // Action definitions
    const [actions, setActions] = useState([
        {
            id: 'aa_1',
            name: 'Auto-Create Follow-up',
            targetModule: 'activities',
            actionType: 'create_record',
            invokedByTrigger: 'trigger_2', // Reference to new lead trigger
            isActive: true,
            fieldMapping: {
                type: 'Follow-up',
                title: 'Introduction Call',
                priority: 'High',
                description: 'Auto-generated follow-up for new lead'
            },
            rollbackPolicy: 'Manual'
        },
        {
            id: 'aa_2',
            name: 'Lock Inventory on Booking',
            targetModule: 'inventory',
            actionType: 'lock_inventory',
            invokedByTrigger: 'trigger_deal_booked',
            isActive: true,
            rollbackPolicy: 'Auto'
        }
    ]);

    // Audit logs for all executions
    const [auditLogs, setAuditLogs] = useState([]);

    /**
     * Invoke an automated action (Typically called by Triggers)
     */
    const invokeAction = useCallback(async (actionId, entity, context = {}) => {
        const action = actions.find(a => a.id === actionId);

        if (!action) {
            console.error(`Automated Action ${actionId} not found.`);
            return null;
        }

        if (!action.isActive) {
            console.log(`Action ${action.name} is disabled.`);
            return null;
        }

        // Action Handlers - Connection to CRM systems
        const handlers = {
            updateEntity: async (module, id, mapping) => {
                // Field Rule Validation
                const validation = validate(module.toLowerCase(), { ...entity, ...mapping });
                if (!validation.isValid) {
                    throw new Error(`Field Rule Violation: ${Object.values(validation.errors).join(', ')}`);
                }

                console.log(`[AA_SYSTEM] Updating ${module} ${id} with:`, mapping);
                return { ...entity, ...mapping };
            },
            createRecord: async (module, mapping) => {
                console.log(`[AA_SYSTEM] Creating ${module} record:`, mapping);
                return { id: `new_${Date.now()}`, ...mapping };
            },
            setLockState: async (id, locked) => {
                console.log(`[AA_SYSTEM] Setting Inventory ${id} lock state to: ${locked}`);
                return { id, lockState: locked ? 'Locked' : 'Available' };
            },
            sendNotification: async (payload) => {
                console.log(`[AA_SYSTEM] Sending Notification:`, payload);
                return { success: true };
            }
        };

        const result = await executeAction(action, entity, handlers);

        // Save audit log
        setAuditLogs(prev => [result, ...prev].slice(0, 500)); // Last 500 entries

        return result;
    }, [actions]);

    const addAction = useCallback((newAction) => {
        setActions(prev => [...prev, { ...newAction, id: `aa_${Date.now()}` }]);
    }, []);

    const toggleAction = useCallback((id) => {
        setActions(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
    }, []);

    const deleteAction = useCallback((id) => {
        setActions(prev => prev.filter(a => a.id !== id));
    }, []);

    const value = {
        actions,
        auditLogs,
        invokeAction,
        addAction,
        toggleAction,
        deleteAction
    };

    return (
        <AutomatedActionsContext.Provider value={value}>
            {children}
        </AutomatedActionsContext.Provider>
    );
};

export const useAutomatedActions = () => {
    const context = useContext(AutomatedActionsContext);
    if (!context) throw new Error('useAutomatedActions must be used within an AutomatedActionsProvider');
    return context;
};
