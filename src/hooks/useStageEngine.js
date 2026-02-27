/**
 * useStageEngine — Stage Computation Hook v3
 *
 * Wraps computeStage + validateStageTransition (Stability Lock) + PUT /leads/:id.
 * Single source of truth for stage updates across the CRM.
 *
 * v3 Additions:
 * - syncDealStage(): auto-cascade deal stage after lead stage update
 * - Deals stage synced via computeDealStageFromLeads (syncEngine) — no duplicate logic
 */

import { useCallback } from 'react';
import { computeStage, validateStageTransition } from '../utils/stageEngine';
import { computeDealStageFromLeads, DEFAULT_SYNC_RULES } from '../utils/syncEngine';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { api } from '../utils/api';

export const useStageEngine = () => {
    const { activityMasterFields, stageMappingRules } = usePropertyConfig();

    /**
     * Compute stage from activity params, validate stability lock,
     * and PUT the new stage to MongoDB.
     *
     * @param {string} leadId                     - MongoDB _id of the lead
     * @param {string} activityType              - 'Call' | 'Meeting' | 'Site Visit' | 'Email' | 'Task'
     * @param {string} purpose                   - e.g. 'Introduction / First Contact'
     * @param {string} outcome                   - e.g. 'Connected', 'Completed'
     * @param {Object} opts                      - optional stability check params
     * @param {string} opts.currentStage         - current lead stage (for lock check)
     * @param {number} opts.activitiesInStage    - # activities since last stage change
     * @param {number} opts.daysInStage          - days since last stage change
     * @param {string} opts.dealId               - linked deal's _id (if any, for cascade)
     * @param {Array}  opts.allLeadStages        - all linked lead stages for deal sync
     * @returns {Promise<{ stage, success, blocked, reason, error }>}
     */
    const triggerStageUpdate = useCallback(async (
        leadId,
        activityType,
        purpose,
        outcome,
        opts = {}
    ) => {
        if (!leadId) return { stage: null, success: false, error: 'No leadId provided' };

        // ── Step 1: Compute new stage ──────────────────────────────────────────
        const newStage = computeStage(
            activityType,
            purpose,
            outcome,
            stageMappingRules || [],
            activityMasterFields || {}
        );

        // ── Step 2: Stability Lock — prevent false regressions ─────────────────
        const { currentStage, activitiesInStage = 0, daysInStage = 0 } = opts;
        if (currentStage && currentStage !== newStage) {
            const lockResult = validateStageTransition(
                currentStage,
                newStage,
                activitiesInStage,
                daysInStage
            );
            if (!lockResult.allowed) {
                console.warn(`[StageEngine] Stability lock blocked: ${lockResult.reason}`);
                return {
                    stage: currentStage,   // Stay at current stage
                    success: false,
                    blocked: true,
                    reason: lockResult.reason,
                };
            }
        }

        // ── Step 3: POST to /api/stage-engine/leads/:id/stage (dedicated endpoint) ───
        // Sends all params needed for stageHistory persistence
        let updateSuccess = false;
        try {
            const response = await api.put(`/stage-engine/leads/${leadId}/stage`, {
                stage: newStage,
                triggeredBy: 'activity',
                activityType,
                outcome,
                reason: purpose,
                activityId: opts.activityId || null,
                userId: opts.userId || null,
            });
            updateSuccess = response?.data?.success === true;
        } catch (err) {
            console.error('[StageEngine] triggerStageUpdate error:', err?.message);
            return { stage: newStage, success: false, error: err.message };
        }

        // ── Step 4: Cascade to linked Deal (if dealId + allLeadStages provided) ─
        if (opts.dealId && Array.isArray(opts.allLeadStages)) {
            // Include the just-updated lead stage in the array
            const updatedLeadStages = opts.allLeadStages.map(s =>
                s.leadId === leadId ? newStage : s.stage
            );
            syncDealStage(opts.dealId, updatedLeadStages).catch(err =>
                console.warn('[StageEngine] Deal cascade failed:', err.message)
            );
        }

        return { stage: newStage, success: updateSuccess, blocked: false };
    }, [activityMasterFields, stageMappingRules]);

    /**
     * Sync a Deal's stage based on its linked leads' stages.
     * Uses computeDealStageFromLeads (syncEngine) — no duplicate computation.
     *
     * Call this:
     * 1. After a lead stage update (triggerStageUpdate cascade above)
     * 2. After ActivityOutcomeModal saves for a deal entity
     * 3. After any deal-level activity completion
     *
     * @param {string}  dealId           - MongoDB _id of the deal
     * @param {Array}   leadStages       - string[] of current lead stages e.g. ['Negotiation', 'Qualified']
     * @param {boolean} hasOwnerWithdrawal
     * @param {Array}   syncRules        - from PropertyConfigContext or DEFAULT_SYNC_RULES
     * @returns {Promise<{ stage, changed, reason, success }>}
     */
    const syncDealStage = useCallback(async (
        dealId,
        leadStages = [],
        hasOwnerWithdrawal = false,
        syncRules = DEFAULT_SYNC_RULES
    ) => {
        if (!dealId) return { stage: null, changed: false, success: false };

        // Compute what deal stage should be
        const { stage: computedDealStage, reason } = computeDealStageFromLeads(
            leadStages,
            syncRules,
            hasOwnerWithdrawal
        );

        // Fetch current deal stage to avoid unnecessary writes
        let currentDealStage = null;
        try {
            const resp = await api.get(`/deals/${dealId}`);
            currentDealStage = resp?.data?.deal?.stage || resp?.data?.stage;
        } catch (e) {
            // Proceed anyway
        }

        if (currentDealStage === computedDealStage) {
            return { stage: computedDealStage, changed: false, reason: 'Stage unchanged', success: true };
        }

        // Write new deal stage via dedicated sync endpoint
        try {
            const response = await api.put(`/stage-engine/deals/${dealId}/sync`, {
                leadStages,
                stage: computedDealStage,
                reason,
                userId: opts?.userId || null,
            });
            const changed = response?.data?.changed === true;
            const finalStage = response?.data?.stage || computedDealStage;
            if (changed) console.info(`[StageEngine] Deal ${dealId} synced: → ${finalStage} (${reason})`);
            return { stage: finalStage, changed, reason, success: response?.data?.success === true };
        } catch (err) {
            console.error('[StageEngine] syncDealStage error:', err?.message);
            return { stage: computedDealStage, changed: false, reason, success: false, error: err.message };
        }
    }, []);

    /**
     * Fetch stage history for a lead or deal from MongoDB.
     * @param {'lead'|'deal'} entityType
     * @param {string} entityId
     */
    const fetchStageHistory = useCallback(async (entityType, entityId) => {
        if (!entityId) return { stageHistory: [], currentStage: null };
        try {
            const endpoint = entityType === 'deal'
                ? `/stage-engine/deals/${entityId}/history`
                : `/stage-engine/leads/${entityId}/history`;
            const response = await api.get(endpoint);
            return response?.data || { stageHistory: [], currentStage: null };
        } catch (err) {
            console.error('[StageEngine] fetchStageHistory error:', err?.message);
            return { stageHistory: [], currentStage: null };
        }
    }, []);

    /**
     * Extract outcome string from activity details.
     */
    const extractOutcome = useCallback((activityType, details = {}) => {
        if (activityType === 'Call') return details.callOutcome || '';
        if (activityType === 'Meeting') return details.meetingOutcomeStatus || details.completionResult || '';
        if (activityType === 'Site Visit') return details.meetingOutcomeStatus || '';
        if (activityType === 'Email') return details.mailStatus || '';
        return details.completionResult || '';
    }, []);

    return { triggerStageUpdate, syncDealStage, fetchStageHistory, extractOutcome };
};

export default useStageEngine;
