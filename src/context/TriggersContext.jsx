import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useUserContext } from './UserContext';
import { evaluateAndExecuteTriggers } from '../utils/triggersEngine';
import { activitiesAPI, automationAPI } from '../utils/api';
import { dispatchWhatsApp, dispatchSMS, dispatchEmail } from '../utils/communicationDispatcher';
import { whatsappTemplates, smsTemplates, emailTemplates } from '../constants/templates';
import { useSequences } from './SequenceContext';
import { AutomatedActionsContext } from './AutomatedActionsContext';

const TriggersContext = createContext();

export const TriggersProvider = ({ children }) => {
    const { enrollInSequence, updateEnrollmentStatus } = useSequences();
    const { currentUser } = useUserContext();
    // AutomatedActionsContext is read lazily inside fireEvent to avoid
    // provider ordering issues during React HMR refresh.
    const automatedActionsCtx = useContext(AutomatedActionsContext);

    // Trigger Definitions
    const [triggers, setTriggers] = useState([]);

    // Fetch triggers from the Enterprise Backend Engine on mount
    import('react').then(({ useEffect }) => {
        // dynamic import not needed if it's top level, wait useEffect is already imported!
    });

    useEffect(() => {
        automationAPI.getTriggers().then(data => {
            if (data && data.length > 0) {
                setTriggers(data);
            }
        }).catch(err => console.error('Failed to load Triggers from Backend:', err));
    }, []);


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
    const addTrigger = useCallback(async (triggerData) => {
        try {
            const newTrigger = await automationAPI.createTrigger(triggerData);
            setTriggers(prev => [...prev, newTrigger]);
            return newTrigger;
        } catch (error) {
            console.error('Failed to save trigger:', error);
            throw error;
        }
    }, []);

    /**
     * Update an existing trigger
     */
    const updateTrigger = useCallback(async (triggerId, updates) => {
        try {
            const updatedTrigger = await automationAPI.updateTrigger(triggerId, updates);
            setTriggers(prev => prev.map(trigger =>
                trigger._id === triggerId || trigger.id === triggerId
                    ? updatedTrigger
                    : trigger
            ));
        } catch (error) {
            console.error('Failed to update trigger:', error);
            throw error;
        }
    }, []);

    /**
     * Delete a trigger
     */
    const deleteTrigger = useCallback(async (triggerId) => {
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

        try {
            await automationAPI.deleteTrigger(triggerId);
            setTriggers(prev => prev.filter(t => t._id !== triggerId && t.id !== triggerId));
            return { success: true };
        } catch (error) {
            console.error('Failed to delete trigger:', error);
            return { success: false, message: error.message };
        }
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
            createdBy: currentUser?._id || 'current_user'
        };

        setTriggers(prev => [...prev, duplicate]);
        return duplicate;
    }, [triggers]);

    /**
     * Fire an event and evaluate triggers
     */
    const fireEvent = useCallback(async (event, entity, context = {}) => {
        // [PHASE 5 EDA MIGRATION]
        // Execution is now handled entirely by the backend EventBus and AutomationEngine.
        // Frontend no longer simulates or executes triggers.
        console.log(`[TriggersContext] Event '${event}' delegated to backend EventBus.`);
        return [];
    }, []);

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

// eslint-disable-next-line react-refresh/only-export-components
export const useTriggers = () => {
    const context = useContext(TriggersContext);
    if (!context) {
        console.warn('⚠️ [TriggersContext] useTriggers was called outside of a TriggersProvider. Using robust safe-fallback to prevent application crash.');
        return {
            triggers: [],
            executionLogs: [],
            stats: { totalExecuted: 0, activeTriggers: 0 },
            fireEvent: (event, data, payload) => {
                console.warn(`⚠️ [TriggersContext Fallback] fireEvent called for event: ${event} but provider is missing.`);
            },
            addTrigger: () => {},
            updateTrigger: () => {},
            toggleTrigger: () => {},
            deleteTrigger: () => {},
            duplicateTrigger: () => {},
            getTriggerStats: () => ({ totalExecuted: 0, activeTriggers: 0 }),
            getExecutionLogs: () => []
        };
    }
    return context;
};
