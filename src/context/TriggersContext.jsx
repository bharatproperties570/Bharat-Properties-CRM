import React, { createContext, useContext, useState, useCallback } from 'react';
import { evaluateAndExecuteTriggers } from '../utils/triggersEngine';
import { useSequences } from './SequenceContext';

const TriggersContext = createContext();

export const TriggersProvider = ({ children }) => {
    const { enrollInSequence, updateEnrollmentStatus } = useSequences();

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
                        // TODO: Implement specific sequence stopping
                        updateEnrollmentStatus(entityId, 'paused');
                    }
                    return { success: true };
                },

                sendNotification: async ({ target, template, entity, data }) => {
                    // TODO: Implement notification system
                    console.log('Notification sent:', { target, template, entity, data });
                    return { success: true, notificationId: `notif_${Date.now()}` };
                },

                fireAutomatedAction: async (automatedActionId, entity) => {
                    // TODO: Implement automated actions system
                    console.log('Automated action fired:', automatedActionId, entity);
                    return { success: true, actionId: automatedActionId };
                },

                updateField: async (entityId, field, value) => {
                    // TODO: Implement field update with validation
                    console.log('Field updated:', entityId, field, value);
                    return { success: true, field, value };
                },

                createActivity: async (activityData) => {
                    // TODO: Integrate with ActivityContext
                    console.log('Activity created:', activityData);
                    return { success: true, activityId: `activity_${Date.now()}` };
                }
            };

            const logs = await evaluateAndExecuteTriggers(
                event,
                entity,
                triggers,
                actionHandlers,
                context
            );

            // Store execution logs
            setExecutionLogs(prev => [...logs, ...prev].slice(0, 1000)); // Keep last 1000 logs

            // Update stats
            const successCount = logs.filter(log => log.success).length;
            const failureCount = logs.length - successCount;

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
