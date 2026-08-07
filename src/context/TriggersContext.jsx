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
        // Track recursion depth context
        const currentDepth = context.depth || 0;

        try {
            // Action Handlers - These connect triggers to actual system functions
            const actionHandlers = {
                startSequence: async (entityId, sequenceId) => {
                    // ── Enterprise: Source Stamp 'trigger' ────────────────────────────────
                    // Idempotency guard in enrollInSequence will block if entity is already
                    // enrolled via 'sequence_engine' (evaluateAndEnroll) or another trigger.
                    const result = enrollInSequence(entityId, sequenceId, { source: 'trigger' });
                    return { success: result?.success ?? true, sequenceId, result };
                },

                stopSequence: async (entityId, sequenceId) => {
                    if (sequenceId === 'all') {
                        updateEnrollmentStatus(entityId, 'paused');
                    } else {
                        updateEnrollmentStatus(entityId, 'paused');
                    }
                    return { success: true };
                },

                sendNotification: async ({ target, template, data, message }) => {
                    const finalMessage = message || data?.message || `Trigger: ${template}`;
                    // Real implementation (simulated with toast/log for now)
                    console.log(`[TRIGGER_NOTIFICATION] to ${target}: ${finalMessage}`);
                    return { success: true, message: finalMessage };
                },

                sendCommunication: async ({ channel, templateId, entity, context: actionContext = {} }) => {
                    const resolvedContext = { ...context, ...actionContext };
                    const library = channel === 'whatsapp' ? whatsappTemplates
                        : channel === 'sms' ? smsTemplates
                        : emailTemplates;
                    const template = library.find(t => String(t.id) === String(templateId));

                    if (!template) return { success: false, reason: `Template '${templateId}' not found in ${channel} library` };

                    let body = template.content || template.body || '';

                    // Universal Variable Resolver — supports both legacy {tag} and modern {{tag}}
                    const ownerName = entity.ownerName || entity.name || 'Sir/Ma\'am';
                    const unitInfo  = entity.unitNo ? `Unit ${entity.unitNo}` : (entity.propertyName || 'the property');

                    const placeholders = {
                        // Legacy tags (Feedback Hub)
                        '{owner}' : ownerName,
                        '{unit}'  : unitInfo,
                        '{time}'  : resolvedContext.nextActionTime
                            ? `${resolvedContext.nextActionTime} on ${resolvedContext.nextActionDate}`
                            : 'later',
                        '{reason}': resolvedContext.reason || resolvedContext.outcome || 'as discussed',

                        // Modern standard tags
                        '{{First name}}' : ownerName.split(' ')[0],
                        '{{ContactName}}': ownerName,
                        '{{fullName}}'   : ownerName,
                        '{{lead.name}}'  : ownerName,
                        '{{1}}'          : ownerName.split(' ')[0],
                        '{{Address}}'    : entity.location || entity.address || 'your location',
                        '{{PropertyName}}': unitInfo,
                        '{{ProjectName}}': entity.projectName || 'the project'
                    };

                    Object.keys(placeholders).forEach(key => {
                        body = body.replaceAll(key, placeholders[key] || '');
                    });

                    const recipient = entity.ownerPhone || entity.mobile || entity.email || 'N/A';
                    
                    // 🚀 Professional: Dispatch Real Message + Log as a completed Activity
                    try {
                        const activityType = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email';
                        
                        // Robust Recipient Identification
                        const owner = entity.owners?.[0];
                        const recipientPhone = (typeof owner === 'object' ? owner.phones?.[0]?.number : null) || entity.ownerPhone || entity.mobile || '';
                        const recipientEmail = (typeof owner === 'object' ? owner.emails?.[0]?.address : null) || entity.ownerEmail || entity.email || '';

                        // 1. Dispatch Real Communication via Hardened Dispatcher
                        if (channel === 'whatsapp' && recipientPhone) {
                            await dispatchWhatsApp({
                                phone: recipientPhone,
                                message: body
                            });
                        } else if (channel === 'sms' && recipientPhone) {
                            await dispatchSMS({
                                phone: recipientPhone,
                                message: body
                            });
                        } else if (channel === 'email' && recipientEmail) {
                            await dispatchEmail({
                                email: recipientEmail,
                                message: body
                            });
                        }

                        // 2. Log in Timeline
                        await activitiesAPI.create({
                            type: activityType,
                            subject: `Auto ${activityType}: ${template.name}`,
                            entityType: context.entityType || 'inventory',
                            entityId: entity.id || entity._id,
                            description: body,
                            status: 'Completed',
                            performedAt: new Date(),
                            dueDate: new Date(), 
                            priority: 'Normal',
                            details: {
                                channel,
                                templateId,
                                recipient: channel === 'email' ? recipientEmail : recipientPhone,
                                autoGenerated: true
                            }
                        });
                        console.log(`[TRIGGER_COMM] ${channel.toUpperCase()} dispatched to ${recipient}`);
                        return { success: true, channel, templateId, preview: body.substring(0, 120) };
                    } catch (error) {
                        console.error('[TRIGGER_COMM] Failed:', error);
                        return { success: false, error: error.message };
                    }
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
                    try {
                        const res = await activitiesAPI.create(activityData);
                        return { success: res?.success, activityId: res?.data?._id };
                    } catch (error) {
                        console.error('Trigger Action: Failed to create activity:', error);
                        return { success: false, error: error.message };
                    }
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
    }, [triggers, enrollInSequence, updateEnrollmentStatus, automatedActionsCtx]);

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
