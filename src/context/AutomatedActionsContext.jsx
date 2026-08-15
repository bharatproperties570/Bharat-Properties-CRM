import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { executeAction } from '../utils/automatedActionsEngine';
import { useFieldRules } from './FieldRulesContext';
import api, { automationAPI } from '../utils/api';
import toast from 'react-hot-toast';

// eslint-disable-next-line react-refresh/only-export-components
export const AutomatedActionsContext = createContext();

export const AutomatedActionsProvider = ({ children }) => {
    const { validate } = useFieldRules();
    const [actions, setActions] = useState([]);

    useEffect(() => {
        const fetchActions = async () => {
            try {
                const data = await automationAPI.getAutomatedActions();
                setActions(data);
            } catch (error) {
                console.error("Failed to fetch automated actions:", error);
            }
        };
        fetchActions();
    }, []);

    // Audit logs for all executions
    const [auditLogs, setAuditLogs] = useState([]);

    /**
     * Invoke an automated action (Typically called by Triggers)
     */
    const invokeAction = useCallback(async (actionId, entity) => {
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
            },
            runAiLeadMatch: async (entity, action) => {
                if (!entity._id && !entity.id) throw new Error("Entity ID is missing for AI Match");
                const dealId = entity._id || entity.id;
                console.log(`[AA_SYSTEM] Running AI Lead Match for deal ${dealId}`);
                
                // 1. Get matches
                const matchRes = await api.get('leads/match', { params: { dealId } });
                if (!matchRes.data?.success || !matchRes.data?.matchingLeads?.length) {
                    return { success: true, message: 'No matching leads found.' };
                }
                let matches = matchRes.data.matchingLeads;
                
                // 1.5 Apply Advanced Constraints
                const constraints = action.matchConstraints || {};
                const minScore = constraints.minScore || 0;
                const originalCount = matches.length;
                
                matches = matches.filter(lead => {
                    if (lead.score < minScore) return false;
                    
                    if (constraints.strictLocation && (!lead.scoreBreakdown?.location || lead.scoreBreakdown.location.earned < 25)) return false;
                    if (constraints.strictType && (!lead.scoreBreakdown?.type || lead.scoreBreakdown.type.earned < 18)) return false;
                    if (constraints.strictBudget && (!lead.scoreBreakdown?.budget || lead.scoreBreakdown.budget.earned < 25)) return false;
                    if (constraints.strictSize && (!lead.scoreBreakdown?.size || lead.scoreBreakdown.size.earned < 25)) return false;
                    
                    return true;
                });
                
                if (matches.length === 0) {
                    return { success: true, message: `Found ${originalCount} raw leads, but none passed the strict constraints (Min Score: ${minScore}%).` };
                }

                
                // 2. Dispatch to selected channels
                const channels = action.notificationConfig?.channels || {};
                const activeChannels = Object.keys(channels).filter(k => channels[k]);
                
                if (activeChannels.length > 0) {
                    for (let ch of activeChannels) {
                        try {
                            await api.post('marketing/send-manual', {
                                dealIds: [dealId],
                                leadIds: matches.map(m => m._id),
                                toggles: { [ch]: true },
                                scheduledAt: action.delay?.isActive ? action.delay.amount : null, // Simplistic scheduling
                                matchContext: 'perfect'
                            });
                        } catch(e) { 
                            console.error(`Failed to dispatch ${ch}`, e); 
                        }
                    }
                }
                
                return { 
                    success: true, 
                    matchedCount: matches.length, 
                    dispatchedChannels: activeChannels 
                };
            }
        };

        const result = await executeAction(action, entity, handlers);

        // Save audit log
        setAuditLogs(prev => [result, ...prev].slice(0, 500)); // Last 500 entries

        return result;
    }, [actions, validate]);

    const addAction = useCallback(async (newAction) => {
        try {
            const savedAction = await automationAPI.createAutomatedAction(newAction);
            setActions(prev => [...prev, savedAction]);
            toast.success("Automated action saved successfully");
        } catch (error) {
            console.error("Failed to create action:", error);
            toast.error("Failed to save action");
        }
    }, []);

    const toggleAction = useCallback(async (id) => {
        try {
            const actionToUpdate = actions.find(a => a.id === id || a._id === id);
            if (!actionToUpdate) return;
            const updated = await automationAPI.updateAutomatedAction(actionToUpdate._id || actionToUpdate.id, { isActive: !actionToUpdate.isActive });
            setActions(prev => prev.map(a => (a.id === id || a._id === id) ? updated : a));
            toast.success(`Action ${updated.isActive ? 'activated' : 'deactivated'}`);
        } catch (error) {
            console.error("Failed to toggle action:", error);
            toast.error("Failed to update action status");
        }
    }, [actions]);

    const deleteAction = useCallback(async (id) => {
        try {
            const actionToDelete = actions.find(a => a.id === id || a._id === id);
            if (!actionToDelete) return;
            await automationAPI.deleteAutomatedAction(actionToDelete._id || actionToDelete.id);
            setActions(prev => prev.filter(a => (a.id !== id && a._id !== id)));
            toast.success("Automated action deleted successfully");
        } catch (error) {
            console.error("Failed to delete action:", error);
            toast.error("Failed to delete action");
        }
    }, [actions]);

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

// eslint-disable-next-line react-refresh/only-export-components
export const useAutomatedActions = () => {
    const context = useContext(AutomatedActionsContext);
    if (!context) throw new Error('useAutomatedActions must be used within an AutomatedActionsProvider');
    return context;
};
