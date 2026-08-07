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
import { evaluateSequenceGuard } from '../../services/SequenceGuardService.js';
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
        
        // --- PRO FIX: Extract outcome from Site Visit details if top-level is generic or empty ---
        let effectiveOutcome = outcome || '';
        const isGenericOutcome = ['conducted', 'done', 'completed', 'meeting done'].includes(effectiveOutcome.toLowerCase());
        
        if ((!effectiveOutcome || isGenericOutcome) && activity.type?.toLowerCase() === 'site visit' && activity.details?.visitedProperties?.length > 0) {
            const priorityMap = { 'very interested': 1, 'shortlisted': 2, 'interested': 3, 'somewhat interested': 4 };
            const results = activity.details.visitedProperties
                .map(p => (p.result || '').toLowerCase())
                .filter(r => r)
                .sort((a, b) => (priorityMap[a] || 99) - (priorityMap[b] || 99));
            
            if (results.length > 0) {
                effectiveOutcome = results[0];
                console.log(`[ActivityCompletion] Auto-detected effective outcome for transition: ${effectiveOutcome}`);
            }
        }

        // 3. Evaluate stage transition
        const transitionResult = await evaluateAndTransition(
            leadId,
            activity.type,
            effectiveOutcome,
            outcomeReason || '',
            stageFormData,
            {
                activityId: activity._id,
                triggeredByUser: req.user?._id || req.user?.id || null,
                purpose: activity.details?.purpose || ''
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

        // 3b. ── SEQUENCE GUARD CHECK ──────────────────────────────────────────
        // Runs after stage computation so we know the computed target stage.
        // If guard is in 'block' mode AND a hard-block condition fires (e.g. terminal re-entry),
        // we return the guard result and let the frontend confirm before retrying.
        let sequenceGuard = { passed: true, mode: 'off', warnings: [], blocked: false };
        if (transitionResult.newStage && leadId) {
            sequenceGuard = await evaluateSequenceGuard(
                leadId,
                activity.type,
                transitionResult.newStage
            );
        }

        if (sequenceGuard.blocked) {
            return res.status(200).json({
                success: true,
                data: activity,
                requiresForm: false,
                stageChanged: false,
                sequenceGuardBlocked: true,
                sequenceGuard,
                message: sequenceGuard.warnings[0]?.message || 'Activity blocked by Sequence Guard. Confirm to proceed.'
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

        // 6. 🚀 ENTERPRISE FIX: Mobile App Trigger Execution on Completion
        // Mobile APIs bypass the React Frontend TriggerEngine. We must process WhatsApp Activity Triggers here.
        try {
            if (['Site Visit', 'Meeting'].includes(activity.type)) {
                const TriggerModel = mongoose.model('Trigger');
                const query = {
                    module: 'activities', // MUST match enum in Trigger.js
                    event: 'activity_completed', // For completion event
                    isActive: true
                };
                if (req.user?.companyId) {
                    query.$or = [{ companyId: req.user.companyId }, { companyId: null }, { companyId: { $exists: false } }];
                }

                const activeTriggers = await TriggerModel.find(query);

                if (activeTriggers.length > 0) {
                    const recipientPhone = await Lead.findById(activity.entityId).select('mobile primaryPhone').then(l => l?.primaryPhone || l?.mobile || null);
                    
                    if (recipientPhone) {
                        for (const trigger of activeTriggers) {
                            let shouldFire = false;
                            if (trigger.conditions?.rules?.length > 0) {
                                shouldFire = trigger.conditions.rules.some(r => r.field === 'type' && (r.value === activity.type || r.value?.includes?.(activity.type)));
                            } else {
                                shouldFire = true; 
                            }
                            
                            if (shouldFire) {
                                for (const action of trigger.actions) {
                                    if (action.type === 'send_communication' && action.channel === 'whatsapp') {
                                        let body = action.body || action.message || '';
                                        
                                        let ownerName = 'Valued Client';
                                        if (entity) {
                                            const fn = entity.firstName || '';
                                            const ln = entity.lastName || '';
                                            const combined = `${fn} ${ln}`.trim();
                                            if (combined) {
                                                ownerName = combined;
                                            } else if (entity.fullName && !entity.fullName.includes('null') && !entity.fullName.includes('undefined')) {
                                                ownerName = entity.fullName;
                                            }
                                        }

                                        let rawLocation = activity.details?.location || activity.location || 'Site';
                                        let searchLocation = rawLocation;
                                        if (activity.type?.toLowerCase() === 'site visit') {
                                            const hasUnit = activity.details?.visitedProperties && activity.details.visitedProperties.length > 0 && activity.details.visitedProperties[0].property;
                                            if (activity.details?.sendUnitLocation !== false && hasUnit) {
                                                const prop = activity.details.visitedProperties[0];
                                                rawLocation = `${prop.project || 'Project'} - Block ${prop.block || ''}, Unit ${prop.property}`;
                                                searchLocation = `${prop.project || ''} ${prop.block || ''} Kurukshetra`;
                                            } else {
                                                rawLocation = req.user?.preferences?.officeLocation || '166, Huda Market, Sector 3, Kurukshetra';
                                                searchLocation = req.user?.preferences?.officeLocation || 'Bharat Properties Kurukshetra';
                                            }
                                        } else if (activity.type?.toLowerCase() === 'meeting') {
                                            const meetType = activity.details?.meetingType || '';
                                            const meetLoc = activity.details?.meetingLocation || '';
                                            rawLocation = meetType ? `${meetType} - ${meetLoc}` : (meetLoc || 'Office');
                                            searchLocation = meetLoc || 'Bharat Properties Kurukshetra';
                                        }
                                        const locationLink = searchLocation ? `${rawLocation} (https://maps.google.com/?q=${encodeURIComponent(searchLocation)})` : rawLocation;

                                        let summaryText = activity.subject || activity.description || 'Discussion';
                                        if (activity.type?.toLowerCase() === 'meeting' && activity.details?.agenda) {
                                            summaryText = activity.details.agenda;
                                        } else if (activity.type?.toLowerCase() === 'site visit' && activity.details?.purpose) {
                                            summaryText = activity.details.purpose;
                                        } else if (activity.details?.agenda) {
                                            summaryText = activity.details.agenda;
                                        }

                                        const placeholders = {
                                            '{agentName}': req.user?.name || 'Your Agent',
                                            '{leadName}': ownerName,
                                            '{activityType}': activity.type,
                                            '{date}': activity.completedAt ? new Date(activity.completedAt).toLocaleDateString() : 'recently',
                                            '{time}': activity.completedAt ? new Date(activity.completedAt).toLocaleTimeString() : '',
                                            '{{First name}}': ownerName.split(' ')[0],
                                            '{{ContactName}}': ownerName,
                                            '{{ProjectName}}': activity.details?.project || 'our project',
                                            
                                            // Exact mapping for Meta named variables (like meeting_sitevisit_schedule)
                                            '{lead_name}': ownerName,
                                            '{activity_type}': activity.type,
                                            '{activity_date}': activity.completedAt ? new Date(activity.completedAt).toLocaleDateString() : 'recently',
                                            '{activity_time}': activity.completedAt ? new Date(activity.completedAt).toLocaleTimeString() : '',
                                            '{activity_location}': locationLink,
                                            '{activity_summary}': summaryText,
                                            '{employee_name}': req.user?.name || 'Bharat Properties Agent',
                                            '{employee_mobile}': req.user?.phone || req.user?.mobile || '9999999999'
                                        };
                                        Object.keys(placeholders).forEach(key => {
                                            body = body.replaceAll(key, placeholders[key] || '');
                                        });

                                        const templateComponents = Object.keys(placeholders).map(key => ({
                                            parameter_name: key.replace(/[{}]/g, ''),
                                            text: placeholders[key]
                                        }));

                                        const { sendWhatsAppMessage } = await import('../../controllers/social.controller.js');
                                        const mockReq = {
                                            user: { companyId: req.user?.companyId },
                                            body: { 
                                                mobile: recipientPhone, 
                                                message: body, 
                                                type: action.templateId ? 'template' : 'text', 
                                                templateId: action.templateId,
                                                templateComponents
                                            }
                                        };
                                        const mockRes = { status: () => mockRes, json: () => mockRes };
                                        await sendWhatsAppMessage(mockReq, mockRes, () => {}).catch(e => console.error('[Backend Trigger] Meta API err:', e.message));
                                        console.log(`[Backend Trigger] Dispatched WhatsApp for completion to ${recipientPhone}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (triggerErr) {
            console.error('[Backend Trigger] Failed to execute completion triggers:', triggerErr);
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
            intent: scoreResult?.intent,
            sequenceGuard: sequenceGuard.warnings.length > 0 ? sequenceGuard : undefined
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
                triggeredByUser: req.user?._id || req.user?.id || null,
                purpose: activity.details?.purpose || ''
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
