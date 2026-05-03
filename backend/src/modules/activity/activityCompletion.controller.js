/**
 * Activity Completion Controller
 *
 * POST /api/activities/:id/complete
 *
 * This is the central trigger point for the Stage + Scoring pipeline:
 * 1. Marks activity as completed
 * 2. Evaluates StageTransitionEngine → determines if stage should change
 * 3. If required fields are missing → returns { requiresForm: true, missingFields } (frontend shows modal)
 * 4. If all fields present → executes stage transition
 * 5. Runs LeadScoringService → recalculates and saves leadScore
 *
 * Body:
 *   outcome        {string}  - e.g. "Interested", "Not Interested", "Shortlisted"
 *   outcomeReason  {string}  - e.g. "Budget Issue", "Shortlisted Unit A"
 *   stageFormData  {Object}  - Fields submitted by StageTransitionModal (budget, location, etc.)
 *   completionNotes {string} - Optional notes
 */

import Activity from '../../../models/Activity.js';
import Lead from '../../../models/Lead.js';
import { evaluateAndTransition } from '../../services/StageTransitionEngine.js';
import { computeAndSave as computeScore } from '../../services/LeadScoringService.js';
import { AppError } from '../../middlewares/error.middleware.js';

/**
 * Complete an activity and trigger stage + scoring pipeline for the associated lead.
 */
export const completeActivity = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { outcome, outcomeReason, stageFormData = {}, completionNotes } = req.body;

        if (!outcome) {
            return next(new AppError('outcome is required to complete an activity', 400));
        }

        // 1. Load and mark activity as completed
        const activity = await Activity.findById(id);
        if (!activity) return next(new AppError('Activity not found', 404));

        if (activity.status === 'Completed') {
            return next(new AppError('Activity is already completed', 409));
        }

        activity.status = 'Completed';
        activity.completedAt = new Date();
        activity.completionResult = outcome;

        if (completionNotes) {
            activity.description = activity.description
                ? `${activity.description}\n--- Completion Notes ---\n${completionNotes}`
                : completionNotes;
        }

        // Store outcome + reason in details for scoring engine
        if (!activity.details) activity.details = {};
        activity.details.outcome = outcome;
        activity.details.outcomeReason = outcomeReason || '';

        // 🌟 Senior Enterprise Feature: Auto-detect latest call log for duration auto-fill
        if (activity.type?.toLowerCase() === 'call' && activity.entityId) {
            try {
                // Find the most recent automated call log for this entity
                const latestLog = await Activity.findOne({
                    entityId: activity.entityId,
                    type: { $regex: /^Call$/i },
                    'details.sid': { $exists: true },
                    createdAt: { $lt: new Date() }
                }).sort({ createdAt: -1 }).lean();

                if (latestLog && latestLog.details?.duration) {
                    activity.details.duration = latestLog.details.duration;
                    activity.details.callSid = latestLog.details.sid;
                    activity.details.autoDetected = true;
                    // Auto-append to description for professional record keeping
                    const durationText = `\n[System] Auto-matched with latest call log (Duration: ${latestLog.details.duration}s)`;
                    activity.description = activity.description 
                        ? `${activity.description}${durationText}`
                        : durationText.trim();
                }
            } catch (err) {
                console.error('[ActivityCompletion] Failed to auto-detect call log:', err.message);
            }
        }

        await activity.save();


        // 2. Only process stage + scoring if this activity is linked to a Lead
        if (activity.entityType !== 'Lead' || !activity.entityId) {
            return res.status(200).json({
                success: true,
                data: activity,
                stageChanged: false,
                scoreUpdated: false
            });
        }

        const leadId = activity.entityId;

        // 3. Evaluate stage transition
        const transitionResult = await evaluateAndTransition(
            leadId,
            activity.type,
            outcome,
            outcomeReason || '',
            stageFormData,
            {
                activityId: activity._id,
                triggeredByUser: req.user?._id || req.user?.id || null
            }
        );

        // If required fields are missing → return early so frontend shows modal
        if (transitionResult.requiresForm) {
            return res.status(200).json({
                success: true,
                data: activity,
                requiresForm: true,
                stageChanged: false,
                newStage: transitionResult.newStage,
                requiredFields: transitionResult.requiredFields,
                missingFields: transitionResult.missingFields,
                ruleId: transitionResult.ruleId,
                scoreUpdated: false
            });
        }

        // 4. Update lastActivityAt on lead (only if not a missed call)
        const isMissed = ['no-answer', 'no answer', 'busy', 'failed', 'not connected', 'missed'].some(s => outcome.toLowerCase().includes(s));
        if (!isMissed) {
            await Lead.findByIdAndUpdate(leadId, { lastActivityAt: new Date() }).catch(() => { });
        }

        // 5. Recalculate and save unified lead score
        let scoreResult = null;
        try {
            scoreResult = await computeScore(leadId, {
                triggeredBy: 'activity'
            });
        } catch (err) {
            console.error('[ActivityComplete] Scoring failed (non-critical):', err.message);
        }

        return res.status(200).json({
            success: true,
            data: activity,
            requiresForm: false,
            stageChanged: transitionResult.stageChanged,
            skippedStage: transitionResult.skipped,
            prevStage: transitionResult.prevStage,
            newStage: transitionResult.newStage,
            ruleId: transitionResult.ruleId,
            scoreUpdated: !!scoreResult,
            score: scoreResult?.score,
            scoreBreakdown: scoreResult?.breakdown,
            temperature: scoreResult?.temperature,
            intent: scoreResult?.intent
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Submit the stage transition form and retry the completion (Phase 2 of 2).
 * Called when the frontend StageTransitionModal submits the required fields.
 *
 * POST /api/activities/:id/complete-with-form
 * Body: { outcome, outcomeReason, stageFormData: { ...requiredFields } }
 */
export const completeActivityWithForm = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { outcome, outcomeReason, stageFormData = {} } = req.body;

        const activity = await Activity.findById(id);
        if (!activity) return next(new AppError('Activity not found', 404));

        const leadId = activity.entityId;
        if (!leadId) return next(new AppError('Activity is not linked to a Lead', 400));

        // Re-evaluate with form data now provided
        const transitionResult = await evaluateAndTransition(
            leadId,
            activity.type,
            outcome || activity.completionResult,
            outcomeReason || activity.details?.outcomeReason || '',
            stageFormData,
            {
                activityId: activity._id,
                triggeredByUser: req.user?._id || req.user?.id || null
            }
        );

        if (transitionResult.requiresForm) {
            // Still missing fields
            return res.status(422).json({
                success: false,
                requiresForm: true,
                missingFields: transitionResult.missingFields,
                requiredFields: transitionResult.requiredFields,
                message: `Required fields still missing: ${transitionResult.missingFields.join(', ')}`
            });
        }

        // Update lastActivityAt (only if not a missed call)
        const finalOutcome = (outcome || activity.completionResult || '').toLowerCase();
        const isMissed = ['no-answer', 'no answer', 'busy', 'failed', 'not connected', 'missed'].some(s => finalOutcome.includes(s));
        if (!isMissed) {
            await Lead.findByIdAndUpdate(leadId, { lastActivityAt: new Date() }).catch(() => { });
        }

        // Recalculate score
        let scoreResult = null;
        try {
            scoreResult = await computeScore(leadId, { triggeredBy: 'activity' });
        } catch (err) {
            console.error('[ActivityCompleteForm] Scoring failed:', err.message);
        }

        return res.status(200).json({
            success: true,
            stageChanged: transitionResult.stageChanged,
            prevStage: transitionResult.prevStage,
            newStage: transitionResult.newStage,
            scoreUpdated: !!scoreResult,
            score: scoreResult?.score,
            scoreBreakdown: scoreResult?.breakdown,
            temperature: scoreResult?.temperature,
            intent: scoreResult?.intent
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Manually trigger score recalculation for a lead.
 * POST /api/leads/:leadId/recalculate-score
 */
export const recalculateLeadScore = async (req, res, next) => {
    try {
        const { leadId } = req.params;
        const result = await computeScore(leadId, { triggeredBy: 'manual' });

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};
