import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    evaluateConditions,
    distributeRoundRobin,
    distributeLoadBased,
    distributeSkillBased,
    distributeLocationBased,
    distributeSourceBased,
    distributeScoreBased,
    calculateWorkload,
    checkReassignment,
    validateAssignment,
    getFallbackAssignment
} from '../utils/distributionEngine';

const DistributionContext = createContext();

export const useDistribution = () => {
    const context = useContext(DistributionContext);
    if (!context) {
        throw new Error('useDistribution must be used within DistributionProvider');
    }
    return context;
};

export const DistributionProvider = ({ children }) => {
    // Load from localStorage
    const [distributionRules, setDistributionRules] = useState(() => {
        try {
            const saved = localStorage.getItem('distributionRules');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error parsing distributionRules', e);
            return [];
        }
    });

    const [distributionLog, setDistributionLog] = useState(() => {
        try {
            const saved = localStorage.getItem('distributionLog');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error parsing distributionLog', e);
            return [];
        }
    });

    const [agentWorkload, setAgentWorkload] = useState({});
    const [roundRobinState, setRoundRobinState] = useState({});

    // Persist to localStorage
    useEffect(() => {
        localStorage.setItem('distributionRules', JSON.stringify(distributionRules));
    }, [distributionRules]);

    useEffect(() => {
        localStorage.setItem('distributionLog', JSON.stringify(distributionLog));
    }, [distributionLog]);

    /**
     * Add new distribution rule
     */
    const addDistributionRule = (rule) => {
        const newRule = {
            ...rule,
            id: `rule_${Date.now()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        setDistributionRules(prev => [...prev, newRule]);
        return newRule;
    };

    /**
     * Update existing distribution rule
     */
    const updateDistributionRule = (id, updates) => {
        setDistributionRules(prev => prev.map(rule =>
            rule.id === id
                ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
                : rule
        ));
    };

    /**
     * Delete distribution rule
     */
    const deleteDistributionRule = (id) => {
        setDistributionRules(prev => prev.filter(rule => rule.id !== id));
    };

    /**
     * Main distribution execution engine
     * @param {string} entityType - 'lead', 'activity', 'campaign'
     * @param {object} entityData - The entity being distributed
     * @param {object} context - Additional context (users, teams, etc.)
     * @returns {object} - Assignment result
     */
    const executeDistribution = (entityType, entityData, context = {}) => {
        const { users = [], teams = [], leads = [], activities = [], deals = [], inventory = [] } = context;

        // Find applicable rules
        const applicableRules = distributionRules
            .filter(rule => rule.enabled && rule.module === entityType)
            .filter(rule => evaluateConditions(rule.conditions, entityData))
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));

        if (applicableRules.length === 0) {
            return { success: false, reason: 'No applicable distribution rules found' };
        }

        // Execute first matching rule
        const rule = applicableRules[0];

        // Calculate current workload
        const workload = {};
        rule.assignmentTarget.ids.forEach(agentId => {
            workload[agentId] = calculateWorkload(agentId, leads, activities, deals, inventory);
        });

        // Execute distribution based on type
        let assignmentResult = null;

        switch (rule.distributionType) {
            case 'roundRobin':
                const lastIndex = roundRobinState[rule.id] || 0;
                assignmentResult = distributeRoundRobin(rule.assignmentTarget, workload, lastIndex, users);
                if (assignmentResult) {
                    setRoundRobinState(prev => ({
                        ...prev,
                        [rule.id]: assignmentResult.nextIndex
                    }));
                }
                break;

            case 'loadBased':
                assignmentResult = distributeLoadBased(rule.assignmentTarget, workload, users);
                break;

            case 'skillBased':
                assignmentResult = distributeSkillBased(
                    rule.assignmentTarget,
                    entityData,
                    context.agentSkills || {}
                );
                break;

            case 'locationBased':
                assignmentResult = distributeLocationBased(
                    rule.assignmentTarget,
                    entityData,
                    context.agentTerritories || {}
                );
                break;

            case 'sourceBased':
                assignmentResult = distributeSourceBased(
                    rule.assignmentTarget,
                    entityData,
                    context.sourceMapping || {}
                );
                break;

            case 'scoreBased':
                assignmentResult = distributeScoreBased(
                    rule.assignmentTarget,
                    entityData,
                    context.scoreBands || {}
                );
                break;

            default:
                return { success: false, reason: 'Invalid distribution type' };
        }

        // Validate assignment
        if (!assignmentResult || !assignmentResult.assignedTo) {
            // Try fallback
            const fallbackId = getFallbackAssignment(rule.fallbackTarget, users, teams);
            if (fallbackId) {
                assignmentResult = { assignedTo: fallbackId };
            } else {
                return { success: false, reason: 'No valid assignment target found' };
            }
        }

        const validation = validateAssignment(assignmentResult.assignedTo, users, teams);
        if (!validation.valid) {
            // Try fallback
            const fallbackId = getFallbackAssignment(rule.fallbackTarget, users, teams);
            if (fallbackId) {
                assignmentResult = { assignedTo: fallbackId };
            } else {
                return { success: false, reason: validation.reason };
            }
        }

        // Log distribution
        logDistribution({
            entityType,
            entityId: entityData.id || `temp_${Date.now()}`,
            ruleId: rule.id,
            ruleName: rule.name,
            assignedTo: assignmentResult.assignedTo,
            distributionType: rule.distributionType,
            reason: `Auto-assigned via ${rule.name}`,
            overrideBy: null
        });

        return {
            success: true,
            assignedTo: assignmentResult.assignedTo,
            ruleId: rule.id,
            ruleName: rule.name
        };
    };

    /**
     * Manual override of assignment
     */
    const manualOverride = (entityType, entityId, newOwner, reason, overrideBy) => {
        if (!reason || !overrideBy) {
            return { success: false, reason: 'Reason and override user required' };
        }

        logDistribution({
            entityType,
            entityId,
            ruleId: null,
            ruleName: 'Manual Override',
            assignedTo: newOwner,
            distributionType: 'manual',
            reason,
            overrideBy
        });

        return { success: true, assignedTo: newOwner };
    };

    /**
     * Log distribution action
     */
    const logDistribution = (logEntry) => {
        const entry = {
            ...logEntry,
            id: `log_${Date.now()}`,
            assignedAt: new Date().toISOString()
        };
        setDistributionLog(prev => [entry, ...prev].slice(0, 1000)); // Keep last 1000 entries
    };

    /**
     * Check and execute reassignment if needed
     */
    const checkAndReassign = (entity, entityType, context) => {
        // Find rule that originally assigned this entity
        const originalLog = distributionLog.find(
            log => log.entityId === entity.id && log.entityType === entityType
        );

        if (!originalLog) return null;

        const rule = distributionRules.find(r => r.id === originalLog.ruleId);
        if (!rule || !rule.reassignmentPolicy?.enabled) return null;

        const needsReassignment = checkReassignment(
            entity,
            rule.reassignmentPolicy,
            new Date()
        );

        if (needsReassignment) {
            // Escalate to manager or reassign
            const escalateTo = rule.reassignmentPolicy.escalateTo;
            if (escalateTo) {
                logDistribution({
                    entityType,
                    entityId: entity.id,
                    ruleId: rule.id,
                    ruleName: rule.name,
                    assignedTo: escalateTo,
                    distributionType: 'reassignment',
                    reason: `Reassigned due to inactivity (${rule.reassignmentPolicy.inactivityHours}h)`,
                    overrideBy: 'system'
                });

                return { assignedTo: escalateTo, reason: 'inactivity' };
            }
        }

        return null;
    };

    /**
     * Get distribution analytics
     */
    const getDistributionAnalytics = () => {
        const last30Days = distributionLog.filter(log => {
            const logDate = new Date(log.assignedAt);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return logDate >= thirtyDaysAgo;
        });

        const byRule = {};
        const byAgent = {};
        const byType = {};

        last30Days.forEach(log => {
            // By rule
            if (!byRule[log.ruleName]) {
                byRule[log.ruleName] = 0;
            }
            byRule[log.ruleName]++;

            // By agent
            if (!byAgent[log.assignedTo]) {
                byAgent[log.assignedTo] = 0;
            }
            byAgent[log.assignedTo]++;

            // By type
            if (!byType[log.distributionType]) {
                byType[log.distributionType] = 0;
            }
            byType[log.distributionType]++;
        });

        return {
            totalAssignments: last30Days.length,
            byRule,
            byAgent,
            byType,
            manualOverrides: last30Days.filter(log => log.overrideBy).length
        };
    };

    /**
     * Get distribution log for entity
     */
    const getEntityDistributionHistory = (entityId) => {
        return distributionLog.filter(log => log.entityId === entityId);
    };

    const value = {
        distributionRules,
        distributionLog,
        agentWorkload,
        addDistributionRule,
        updateDistributionRule,
        deleteDistributionRule,
        executeDistribution,
        manualOverride,
        checkAndReassign,
        getDistributionAnalytics,
        getEntityDistributionHistory
    };

    return (
        <DistributionContext.Provider value={value}>
            {children}
        </DistributionContext.Provider>
    );
};
