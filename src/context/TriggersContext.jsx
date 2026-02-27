import React, { createContext, useContext, useState, useCallback } from 'react';
import { evaluateAndExecuteTriggers } from '../utils/triggersEngine';
import { useSequences } from './SequenceContext';
import { AutomatedActionsContext } from './AutomatedActionsContext';

const TriggersContext = createContext();

export const TriggersProvider = ({ children }) => {
    const { enrollInSequence, updateEnrollmentStatus } = useSequences();
    // AutomatedActionsContext is read lazily inside fireEvent to avoid
    // provider ordering issues during React HMR refresh.
    const automatedActionsCtx = useContext(AutomatedActionsContext);

    // Trigger Definitions (Pre-seeded with examples)
    const [triggers, setTriggers] = useState([
        {
            id: 'trigger_1',
            name: 'Hot Lead Notification',
            module: 'leads',
            event: 'lead_score_changed',
            priority: 1,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'score', operator: '>=', value: 70 },
                    { field: 'stage', operator: '==', value: 'Prospect' }
                ]
            },
            actions: [
                {
                    type: 'send_notification',
                    target: 'manager',
                    template: 'hot_lead_alert',
                    data: { message: 'High-value lead detected' }
                },
                {
                    type: 'start_sequence',
                    sequenceId: 'seq2' // Hot Lead Fast-Track
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_2',
            name: 'New Lead Auto-Enroll',
            module: 'leads',
            event: 'lead_created',
            priority: 2,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'source', operator: '!=', value: 'Manual' }
                ]
            },
            actions: [
                {
                    type: 'start_sequence',
                    sequenceId: 'seq1' // New Lead Follow-up
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_3',
            name: 'Activity Completed - Pause Sequence',
            module: 'activities',
            event: 'activity_completed',
            priority: 3,
            isActive: true,
            conditions: {
                operator: 'OR',
                rules: [
                    { field: 'type', operator: '==', value: 'Call' },
                    { field: 'type', operator: '==', value: 'Meeting' }
                ]
            },
            actions: [
                {
                    type: 'stop_sequence',
                    sequenceId: 'all' // Stop all active sequences for this entity
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_4',
            name: 'Deal Stage Changed - Associate Follow-up',
            module: 'deals',
            event: 'deal_stage_changed',
            priority: 4,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'status', operator: '==', value: 'Negotiation' }
                ]
            },
            actions: [
                {
                    type: 'start_sequence',
                    sequenceId: 'seq1',
                    target: 'associatedContact.mobile' // Enroll the associate
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_5',
            name: 'Inventory Created - Notify Owner',
            module: 'inventory',
            event: 'inventory_created',
            priority: 5,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'status', operator: '==', value: 'Active' }
                ]
            },
            actions: [
                {
                    type: 'send_notification',
                    target: 'owner',
                    message: 'A new active inventory {{unitNo}} has been listed.'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        }
    ]);

    // Execution Logs
    const [executionLogs, setExecutionLogs] = useState([]);

    // Statistics
    const [stats, setStats] = useState({
        totalFired: 0,
        successCount: 0,
        failureCount: 0
    });

    /**
     * Add a new trigger
     */
    const addTrigger = useCallback((triggerData) => {
        const newTrigger = {
            ...triggerData,
            id: `trigger_${Date.now()}`,
            isActive: true,
            createdAt: new Date().toISOString(),
            createdBy: 'current_user' // TODO: Get from auth context
        };

        setTriggers(prev => [...prev, newTrigger]);
        return newTrigger;
    }, []);

    /**
     * Update an existing trigger
     */
    const updateTrigger = useCallback((triggerId, updates) => {
        setTriggers(prev => prev.map(trigger =>
            trigger.id === triggerId
                ? { ...trigger, ...updates, lastModified: new Date().toISOString() }
                : trigger
        ));
    }, []);

    /**
     * Delete a trigger
     */
    const deleteTrigger = useCallback((triggerId) => {
        // Check if trigger has recent executions
        const recentLogs = executionLogs.filter(log =>
            log.triggerId === triggerId &&
            new Date(log.executedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        );

        if (recentLogs.length > 0) {
            return {
                success: false,
                message: `Cannot delete: Trigger has ${recentLogs.length} executions in the last 24 hours. Disable it instead.`
            };
        }

        setTriggers(prev => prev.filter(t => t.id !== triggerId));
        return { success: true };
    }, [executionLogs]);

    /**
     * Toggle trigger active status
     */
    const toggleTrigger = useCallback((triggerId) => {
        setTriggers(prev => prev.map(trigger =>
            trigger.id === triggerId
                ? { ...trigger, isActive: !trigger.isActive }
                : trigger
        ));
    }, []);

    /**
     * Duplicate a trigger
     */
    const duplicateTrigger = useCallback((triggerId) => {
        const trigger = triggers.find(t => t.id === triggerId);
        if (!trigger) return null;

        const duplicate = {
            ...trigger,
            id: `trigger_${Date.now()}`,
            name: `${trigger.name} (Copy)`,
            isActive: false, // Start disabled for safety
            createdAt: new Date().toISOString(),
            createdBy: 'current_user'
        };

        setTriggers(prev => [...prev, duplicate]);
        return duplicate;
    }, [triggers]);

    /**
     * Fire an event and evaluate triggers
     */
    const fireEvent = useCallback(async (event, entity, context = {}) => {
        // Track recursion depth context
        const currentDepth = context.depth || 0;

        try {
            // Action Handlers - These connect triggers to actual system functions
            const actionHandlers = {
                startSequence: async (entityId, sequenceId) => {
                    enrollInSequence(entityId, sequenceId);
                    return { success: true, sequenceId };
                },

                stopSequence: async (entityId, sequenceId) => {
                    if (sequenceId === 'all') {
                        updateEnrollmentStatus(entityId, 'paused');
                    } else {
                        updateEnrollmentStatus(entityId, 'paused');
                    }
                    return { success: true };
                },

                sendNotification: async ({ target, template, entity, data, message }) => {
                    const finalMessage = message || data?.message || `Trigger: ${template}`;
                    // Real implementation (simulated with toast/log for now)
                    console.log(`[TRIGGER_NOTIFICATION] to ${target}: ${finalMessage}`);
                    return { success: true, message: finalMessage };
                },

                fireAutomatedAction: async (automatedActionId, entity) => {
                    if (!automatedActionsCtx?.invokeAction) {
                        console.warn('[Triggers] AutomatedActionsContext not available — skipping action');
                        return { success: false, reason: 'AutomatedActionsContext unavailable' };
                    }
                    const result = await automatedActionsCtx.invokeAction(automatedActionId, entity, context);
                    return result;
                },

                updateField: async (entityId, field, value) => {
                    // Critical safety: Prevent recursion if updating same entity
                    if (entity.id === entityId) {
                        // Recursively fire event with incremented depth
                        const updatedEntity = { ...entity, [field]: value };

                        console.log(`[TRIGGER_ACTION] Updating ${field} to ${value} on ${entityId}`);

                        // Fire "field_updated" event to check for subsequent triggers
                        await fireEvent(`${context.entityType}_field_updated`, updatedEntity, {
                            ...context,
                            previousEntity: entity,
                            depth: currentDepth + 1
                        });

                        return { success: true, field, value };
                    }
                    return { success: false, reason: 'Cross-entity updates not fully supported yet' };
                },

                createActivity: async (activityData) => {
                    console.log('Activity created:', activityData);
                    return { success: true, activityId: `activity_${Date.now()}` };
                }
            };

            const logs = await evaluateAndExecuteTriggers(
                event,
                entity,
                triggers,
                actionHandlers,
                {
                    ...context,
                    depth: currentDepth
                }
            );

            setExecutionLogs(prev => [...logs, ...prev].slice(0, 1000));

            const successCount = logs.filter(log => log.success && log.conditionsMet).length;
            const failureCount = logs.filter(log => log.conditionsMet && !log.success).length;

            setStats(prev => ({
                totalFired: prev.totalFired + logs.length,
                successCount: prev.successCount + successCount,
                failureCount: prev.failureCount + failureCount
            }));

            return logs;
        } catch (error) {
            console.error('Error firing event:', error);
            return [];
        }
    }, [triggers, enrollInSequence, updateEnrollmentStatus]);

    /**
     * Get trigger statistics
     */
    const getTriggerStats = useCallback((triggerId) => {
        const triggerLogs = executionLogs.filter(log => log.triggerId === triggerId);
        const successLogs = triggerLogs.filter(log => log.success);
        const failedLogs = triggerLogs.filter(log => !log.success);

        return {
            totalFired: triggerLogs.length,
            successCount: successLogs.length,
            failureCount: failedLogs.length,
            successRate: triggerLogs.length > 0
                ? Math.round((successLogs.length / triggerLogs.length) * 100)
                : 0,
            avgExecutionTime: triggerLogs.length > 0
                ? Math.round(triggerLogs.reduce((sum, log) => sum + (log.totalExecutionTime || 0), 0) / triggerLogs.length)
                : 0,
            lastFired: triggerLogs.length > 0 ? triggerLogs[0].executedAt : null
        };
    }, [executionLogs]);

    /**
     * Get execution logs with filters
     */
    const getExecutionLogs = useCallback((filters = {}) => {
        let filtered = [...executionLogs];

        if (filters.triggerId) {
            filtered = filtered.filter(log => log.triggerId === filters.triggerId);
        }

        if (filters.entityType) {
            filtered = filtered.filter(log => log.entityType === filters.entityType);
        }

        if (filters.success !== undefined) {
            filtered = filtered.filter(log => log.success === filters.success);
        }

        if (filters.startDate) {
            filtered = filtered.filter(log => new Date(log.executedAt) >= new Date(filters.startDate));
        }

        if (filters.endDate) {
            filtered = filtered.filter(log => new Date(log.executedAt) <= new Date(filters.endDate));
        }

        return filtered;
    }, [executionLogs]);

    /**
     * Clear old execution logs
     */
    const clearOldLogs = useCallback((daysToKeep = 30) => {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        setExecutionLogs(prev => prev.filter(log => new Date(log.executedAt) > cutoffDate));
    }, []);

    const value = {
        // Trigger Management
        triggers,
        addTrigger,
        updateTrigger,
        deleteTrigger,
        toggleTrigger,
        duplicateTrigger,

        // Event Firing
        fireEvent,

        // Logs & Analytics
        executionLogs,
        getExecutionLogs,
        getTriggerStats,
        clearOldLogs,
        stats
    };

    return (
        <TriggersContext.Provider value={value}>
            {children}
        </TriggersContext.Provider>
    );
};

export const useTriggers = () => {
    const context = useContext(TriggersContext);
    if (!context) {
        throw new Error('useTriggers must be used within a TriggersProvider');
    }
    return context;
};
