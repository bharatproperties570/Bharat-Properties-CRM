import { createContext, useContext, useState, useCallback } from 'react';
import { evaluateAndExecuteTriggers } from '../utils/triggersEngine';
import { activitiesAPI } from '../utils/api';
import { whatsappTemplates, smsTemplates, emailTemplates } from '../constants/templates';
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
        },

        // ─── LEAD LIFECYCLE RULES ───────────────────────────────────────────
        {
            id: 'trigger_lead_welcome',
            name: 'New Lead — Send Welcome WhatsApp',
            module: 'leads',
            event: 'lead_created',
            priority: 6,
            isActive: true,
            conditions: { operator: 'AND', rules: [] }, // Fire for ALL new leads
            actions: [
                {
                    type: 'send_communication',
                    channel: 'whatsapp',
                    templateId: 7  // 'Welcome Message' template
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },

        // ─── DEAL LIFECYCLE RULES ───────────────────────────────────────────
        {
            id: 'trigger_deal_won',
            name: 'Deal Won — Send Congratulations Email',
            module: 'deals',
            event: 'deal_stage_changed',
            priority: 7,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'stage', operator: '==', value: 'Won' }
                ]
            },
            actions: [
                {
                    type: 'send_communication',
                    channel: 'email',
                    templateId: 6  // 'Booking Success' email template
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },

        // ─── INVENTORY FEEDBACK RULES ───────────────────────────────────────
        {
            id: 'trigger_fb_hot',
            name: 'Feedback: Interested (Hot) — Send Priority WhatsApp',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 10,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Interested / Hot' }
                ]
            },
            actions: [
                {
                    type: 'send_communication',
                    channel: 'whatsapp',
                    templateId: 'fb_interested_hot_wa'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_fb_warm',
            name: 'Feedback: Interested (Warm) — Send WhatsApp',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 11,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Interested / Warm' }
                ]
            },
            actions: [
                {
                    type: 'send_communication',
                    channel: 'whatsapp',
                    templateId: 'fb_interested_warm_wa'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_fb_callback',
            name: 'Feedback: Request Call Back — Send SMS',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 12,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Request Call Back' }
                ]
            },
            actions: [
                {
                    type: 'send_communication',
                    channel: 'sms',
                    templateId: 'fb_callback_sms'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_fb_not_interested',
            name: 'Feedback: Not Interested — Send WhatsApp',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 13,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Not Interested' }
                ]
            },
            actions: [
                {
                    type: 'send_communication',
                    channel: 'whatsapp',
                    templateId: 'fb_not_interested_wa'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_fb_busy',
            name: 'Feedback: Busy / Driving — Send SMS',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 14,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Busy / Driving' }
                ]
            },
            actions: [
                {
                    type: 'send_communication',
                    channel: 'sms',
                    templateId: 'fb_busy_driving_sms'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_fb_market',
            name: 'Feedback: Market Feedback — Send WhatsApp',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 15,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Market Feedback' }
                ]
            },
            actions: [
                {
                    type: 'send_communication',
                    channel: 'whatsapp',
                    templateId: 'fb_market_feedback_wa'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_fb_switch_off',
            name: 'Feedback: Switch Off / Unreachable — No Message (Log Only)',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 16,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Switch Off / Unreachable' }
                ]
            },
            actions: [
                {
                    type: 'send_notification',
                    target: 'owner',
                    message: 'Owner {{ownerName}} of Unit {{unitNo}} is unreachable. Please retry later.'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        },
        {
            id: 'trigger_fb_wrong_number',
            name: 'Feedback: Wrong Number — Internal Alert',
            module: 'inventory',
            event: 'inventory_feedback_submitted',
            priority: 17,
            isActive: true,
            conditions: {
                operator: 'AND',
                rules: [
                    { field: 'outcome', operator: '==', value: 'Wrong Number / Invalid' }
                ]
            },
            actions: [
                {
                    type: 'send_notification',
                    target: 'manager',
                    message: 'Invalid number detected for Unit {{unitNo}}. Please verify owner contact details.'
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
                    
                    // 🚀 Professional: Log as a completed Activity in the timeline
                    try {
                        const activityType = channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email';
                        await activitiesAPI.create({
                            type: activityType,
                            subject: `Auto ${activityType}: ${template.name}`,
                            entityType: context.entityType || 'inventory',
                            entityId: entity.id || entity._id,
                            description: body,
                            status: 'Completed',
                            performedAt: new Date(),
                            dueDate: new Date(), // Required field
                            priority: 'Normal',
                            details: {
                                channel,
                                templateId,
                                recipient,
                                autoGenerated: true
                            }
                        });
                        console.log(`[TRIGGER_COMM] ${channel.toUpperCase()} sent to ${recipient}`);
                        return { success: true, channel, templateId, preview: body.substring(0, 120) };
                    } catch (error) {
                        console.error('[TRIGGER_COMM] Failed to log activity:', error);
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
        throw new Error('useTriggers must be used within a TriggersProvider');
    }
    return context;
};
