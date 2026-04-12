/**
 * StageTransitionEngine — Activity Outcome → Stage Change
 *
 * Rules stored in SystemSetting (key: 'stage_transition_rules', category: 'sales_config').
 *
 * Rule structure:
 * {
 *   rules: [
 *     {
 *       id: "sv_interested_opp",
 *       activityType: "Site Visit",            // "Call", "Meeting", "Site Visit", "Email", "*"
 *       outcome: "Interested",                 // outcome label (case-insensitive match)
 *       reason: "*",                           // outcomeReason ("*" = any)
 *       newStage: "Opportunity",               // target stage lookup_value
 *       requiredFields: ["budget", "location", "timeline"],
 *       priority: 10,                          // higher = evaluated first
 *       active: true
 *     }
 *   ]
 * }
 *
 * Required fields validation works as follows:
 *   - Each requiredField name maps to a lead field
 *   - If a field is empty/null on the lead AND not provided in stageFormData → validation fails
 *   - The API returns { shouldChange, newStage, requiredFields, missingFields } for the frontend
 */

import Lead from '../../models/Lead.js';
import Lookup from '../../models/Lookup.js';

import SystemSetting from '../modules/systemSettings/system.model.js';
import AuditLog from '../../models/AuditLog.js';
import RevivalSyncService from './RevivalSyncService.js';

// ─── DEFAULT RULES (seed data — admin can override via settings page) ─────────
export const DEFAULT_STAGE_RULES = [

    // ══════════════════════════════════════════════════════════
    //  CALL RULES
    // ══════════════════════════════════════════════════════════

    // Introduction calls
    {
        id: 'call_intro_interested',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Connected',
        reason: 'Interested',
        newStage: 'Prospect',
        requiredForms: ['Requirement Form'],
        priority: 10,
        active: true,
        description: 'Call Intro -> Connected -> Interested -> Prospect + Req Form'
    },
    {
        id: 'call_intro_positive',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Connected',
        reason: 'Positive Response',
        newStage: 'Prospect',
        requiredForms: ['Requirement Form'],
        priority: 10,
        active: true,
        description: 'Call Intro -> Connected -> Positive -> Prospect'
    },
    {
        id: 'call_intro_will_think',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Connected',
        reason: 'Will Think',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'call_intro_callback',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Connected',
        reason: 'Call Back Later',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'call_intro_not_connected',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Not Connected',
        reason: '*',
        newStage: 'New',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'call_intro_busy',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Not Interested',
        reason: 'Busy/No Time',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 11,
        active: true
    },
    {
        id: 'call_intro_not_looking',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Not Interested',
        reason: 'Not Looking',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 11,
        active: true
    },

    // Follow-up calls
    {
        id: 'call_followup_interested',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Connected',
        reason: 'Interested',
        newStage: 'Qualified',
        requiredForms: ['Requirement Form'],
        priority: 15,
        active: true
    },
    {
        id: 'call_followup_very_interested',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Connected',
        reason: 'Very Interested',
        newStage: 'Qualified',
        requiredForms: ['Requirement Form'],
        priority: 15,
        active: true
    },
    {
        id: 'call_followup_meeting_confirmed',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Connected',
        reason: 'Meeting Confirmed',
        newStage: 'Qualified',
        requiredForms: ['Requirement Form'],
        priority: 15,
        active: true
    },
    {
        id: 'call_followup_will_think',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Connected',
        reason: 'Will Think',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 15,
        active: true
    },
    {
        id: 'call_followup_not_connected',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Not Connected',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 15,
        active: true
    },
    {
        id: 'call_followup_not_interested_budget',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Not Interested',
        reason: 'Budget Issue',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 16,
        active: true
    },
    {
        id: 'call_followup_not_interested_bought_elsewhere',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Not Interested',
        reason: 'Bought Elsewhere',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 16,
        active: true
    },
    {
        id: 'call_followup_not_interested_general',
        activityType: 'Call',
        purpose: 'Follow Up',
        outcome: 'Not Interested',
        reason: '*',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 15,
        active: true
    },

    // ══════════════════════════════════════════════════════════
    //  MEETING RULES
    // ══════════════════════════════════════════════════════════

    {
        id: 'meeting_presentation_interested',
        activityType: 'Meeting',
        purpose: 'Product Presentation',
        outcome: 'Meeting Done',
        reason: 'Interested',
        newStage: 'Qualified',
        requiredForms: ['Requirement Form', 'Meetings Form'],
        priority: 20,
        active: true
    },
    {
        id: 'meeting_presentation_very_interested',
        activityType: 'Meeting',
        purpose: 'Product Presentation',
        outcome: 'Meeting Done',
        reason: 'Very Interested',
        newStage: 'Opportunity',
        requiredForms: ['Requirement Form', 'Meetings Form'],
        priority: 20,
        active: true
    },
    {
        id: 'meeting_presentation_deal_likely',
        activityType: 'Meeting',
        purpose: 'Product Presentation',
        outcome: 'Meeting Done',
        reason: 'Deal Likely',
        newStage: 'Negotiation',
        requiredForms: ['Requirement Form', 'Meetings Form', 'Quotation Form'],
        priority: 20,
        active: true
    },
    {
        id: 'meeting_presentation_no_show',
        activityType: 'Meeting',
        purpose: 'Product Presentation',
        outcome: 'No Show',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 20,
        active: true
    },
    {
        id: 'meeting_presentation_rescheduled',
        activityType: 'Meeting',
        purpose: 'Product Presentation',
        outcome: 'Rescheduled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: ['Meetings Form'],
        priority: 20,
        active: true
    },
    {
        id: 'meeting_presentation_not_interested',
        activityType: 'Meeting',
        purpose: 'Product Presentation',
        outcome: 'Not Interested',
        reason: '*',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 20,
        active: true
    },
    {
        id: 'meeting_negotiation_deal_agreed',
        activityType: 'Meeting',
        purpose: 'Negotiation Meeting',
        outcome: 'Deal Agreed',
        reason: '*',
        newStage: 'Booked',
        requiredForms: ['Quotation Form', 'Offer Form'],
        priority: 30,
        active: true
    },
    {
        id: 'meeting_negotiation_deal_likely',
        activityType: 'Meeting',
        purpose: 'Negotiation Meeting',
        outcome: 'Deal Likely',
        reason: '*',
        newStage: 'Negotiation',
        requiredForms: ['Quotation Form'],
        priority: 30,
        active: true
    },
    {
        id: 'meeting_negotiation_on_hold',
        activityType: 'Meeting',
        purpose: 'Negotiation Meeting',
        outcome: 'On Hold',
        reason: '*',
        newStage: 'Stalled',
        requiredForms: [],
        priority: 30,
        active: true
    },
    {
        id: 'meeting_negotiation_price_high',
        activityType: 'Meeting',
        purpose: 'Negotiation Meeting',
        outcome: 'Not Interested',
        reason: 'Price High',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 31,
        active: true
    },

    // ══════════════════════════════════════════════════════════
    //  SITE VISIT RULES
    // ══════════════════════════════════════════════════════════

    {
        id: 'sv_interested',
        activityType: 'Site Visit',
        purpose: 'Property Tour',
        outcome: 'Interested',
        reason: '*',
        newStage: 'Opportunity',
        requiredForms: ['Requirement Form', 'Site Visit Form'],
        priority: 25,
        active: true
    },
    {
        id: 'sv_very_interested',
        activityType: 'Site Visit',
        purpose: 'Property Tour',
        outcome: 'Very Interested',
        reason: '*',
        newStage: 'Negotiation',
        requiredForms: ['Requirement Form', 'Site Visit Form', 'Quotation Form'],
        priority: 25,
        active: true
    },
    {
        id: 'sv_shortlisted',
        activityType: 'Site Visit',
        purpose: 'Property Tour',
        outcome: 'Shortlisted',
        reason: '*',
        newStage: 'Opportunity',
        requiredForms: ['Requirement Form', 'Site Visit Form'],
        priority: 25,
        active: true
    },
    {
        id: 'sv_not_interested_price',
        activityType: 'Site Visit',
        purpose: 'Property Tour',
        outcome: 'Not Interested',
        reason: 'Price High',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 26,
        active: true
    },
    {
        id: 'sv_not_interested_location',
        activityType: 'Site Visit',
        purpose: 'Property Tour',
        outcome: 'Not Interested',
        reason: 'Location Mismatch',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 26,
        active: true
    },
    {
        id: 'sv_not_interested_budget',
        activityType: 'Site Visit',
        purpose: 'Property Tour',
        outcome: 'Not Interested',
        reason: 'Budget Mismatch',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 26,
        active: true
    },
    {
        id: 'sv_second_visit',
        activityType: 'Site Visit',
        purpose: 'Property Tour',
        outcome: 'Second Visit Requested',
        reason: '*',
        newStage: 'Opportunity',
        requiredForms: ['Site Visit Form'],
        priority: 25,
        active: true
    },

    // ══════════════════════════════════════════════════════════
    //  EMAIL RULES
    // ══════════════════════════════════════════════════════════

    {
        id: 'email_replied_interested',
        activityType: 'Email',
        purpose: '*',
        outcome: 'Replied - Interested',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 5,
        active: true,
        description: 'Email → Replied - Interested → Prospect'
    },
    {
        id: 'email_no_reply',
        activityType: 'Email',
        purpose: '*',
        outcome: 'No Reply',
        reason: '*',
        newStage: 'New',
        requiredForms: [],
        priority: 5,
        active: true,
        description: 'Email → No Reply → stay New'
    },

    // ══════════════════════════════════════════════════════════
    //  WHATSAPP / MESSAGING RULES
    // ══════════════════════════════════════════════════════════

    {
        id: 'whatsapp_replied_interested',
        activityType: 'WhatsApp',
        purpose: '*',
        outcome: 'Replied - Interested',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 5,
        active: true,
        description: 'WhatsApp → Replied - Interested → Prospect'
    },
    {
        id: 'whatsapp_no_reply',
        activityType: 'WhatsApp',
        purpose: '*',
        outcome: 'No Reply',
        reason: '*',
        newStage: 'New',
        requiredForms: [],
        priority: 5,
        active: true,
        description: 'WhatsApp → No Reply → stay New'
    },

    // ══════════════════════════════════════════════════════════
    //  CLOSURE RULES (any activity type)
    // ══════════════════════════════════════════════════════════

    {
        id: 'any_booking_done',
        activityType: '*',
        purpose: '*',
        outcome: 'Booking Done',
        reason: '*',
        newStage: 'Booked',
        requiredForms: ['Quotation Form', 'Offer Form'],
        priority: 50,
        active: true,
        description: 'Any Activity → Booking Done → Booked'
    },
    {
        id: 'any_deal_closed',
        activityType: '*',
        purpose: '*',
        outcome: 'Deal Closed',
        reason: '*',
        newStage: 'Closed Won',
        requiredForms: ['Offer Form'],
        priority: 50,
        active: true,
        description: 'Any Activity → Deal Closed → Closed Won'
    },
    {
        id: 'any_lost_to_competitor',
        activityType: '*',
        purpose: '*',
        outcome: 'Lost to Competitor',
        reason: '*',
        newStage: 'Closed Lost',
        requiredForms: [],
        priority: 50,
        active: true,
        description: 'Any Activity → Lost to Competitor → Closed Lost'
    },
    {
        id: 'any_not_interested_global',
        activityType: '*',
        purpose: '*',
        outcome: 'Not Interested',
        reason: '*',
        newStage: 'Dormant',
        requiredForms: [],
        priority: 9, // Lowest among specific Not Interested rules, but acts as catch-all
        active: true,
        description: 'System Rule: Any Activity with Not Interested outcome moves to Dormant'
    },
    // ══════════════════════════════════════════════════════════
    //  REVIVAL RULES (Dormant → Prospect)
    // ══════════════════════════════════════════════════════════
    {
        id: 'revival_generic_action',
        activityType: '*',
        purpose: '*',
        outcome: 'Connected', 
        reason: '*',
        newStage: 'Prospect',
        priority: 1, // Lowest priority, acts as a fallback for any connection
        active: true,
        description: 'Auto-Revival: Any "Connected" activity moves lead out of Dormant status'
    }
];

// ────────────────────────────────────────────────────────────────────────────
let _rulesCache = null;
let _rulesCacheAt = 0;
const RULES_TTL_MS = 60 * 1000;

export const loadTransitionRules = async () => {
    const now = Date.now();
    if (_rulesCache && (now - _rulesCacheAt) < RULES_TTL_MS) return _rulesCache;

    try {
        const setting = await SystemSetting.findOne({ key: 'stage_transition_rules' }).lean();
        _rulesCache = setting?.value?.rules || DEFAULT_STAGE_RULES;
    } catch {
        _rulesCache = DEFAULT_STAGE_RULES;
    }
    _rulesCacheAt = now;
    return _rulesCache;
};

export const invalidateRulesCache = () => {
    _rulesCache = null;
    _rulesCacheAt = 0;
};

// ─── RESOLVE: Find matching rule ─────────────────────────────────────────────
/**
 * Find the best matching stage transition rule for a given activity completion.
 *
 * @param {string} activityType - e.g. 'Site Visit'
 * @param {string} outcome - e.g. 'Interested'
 * @param {string} [reason] - e.g. 'Shortlisted'
 * @returns {Promise<{ matched: boolean, rule: Object|null }>}
 */
export const resolveTransition = async (activityType, outcome, reason = '', purpose = '') => {
    const rules = await loadTransitionRules();
    const activeRules = rules
        .filter(r => r.active !== false)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // highest priority first

    const normalize = str => (str || '').toString().toLowerCase().trim();
    const actNorm = normalize(activityType);
    const outNorm = normalize(outcome);
    const resNorm = normalize(reason);
    const purpNorm = normalize(purpose);

    for (const rule of activeRules) {
        const ruleActNorm = normalize(rule.activityType);
        const rulePurpNorm = normalize(rule.purpose);
        const ruleOutNorm = normalize(rule.outcome);
        const ruleResNorm = normalize(rule.reason);

        const actMatch = ruleActNorm === '*' || ruleActNorm === actNorm;
        // Purpose match: '*' = any, '' = any (old rules without purpose), exact match
        const purpMatch = !rule.purpose || rulePurpNorm === '*' || rulePurpNorm === '' ||
                          rulePurpNorm === purpNorm || purpNorm.includes(rulePurpNorm);
        const outMatch = ruleOutNorm === '*' || ruleOutNorm === outNorm ||
                         outNorm.includes(ruleOutNorm) || ruleOutNorm.includes(outNorm);
        // Reason: specific rules (non-*) take priority because we sort by priority desc
        const resMatch = ruleResNorm === '*' || !rule.reason || ruleResNorm === '' ||
                         ruleResNorm === resNorm || resNorm.includes(ruleResNorm);

        if (actMatch && purpMatch && outMatch && resMatch) {
            return { matched: true, rule };
        }
    }

    return { matched: false, rule: null };
};

// ─── VALIDATE: Check required fields ─────────────────────────────────────────
/**
 * Check which required fields are missing from both lead and the submitted stageFormData.
 *
 * @param {Object} lead - Current lead document (lean)
 * @param {string[]} requiredFields - Field names to check
 * @param {Object} stageFormData - Data submitted by user in the transition modal
 * @returns {{ valid: boolean, missingFields: string[] }}
 */
export const validateRequiredFields = (lead, requiredFields, stageFormData = {}) => {
    if (!requiredFields || requiredFields.length === 0) {
        return { valid: true, missingFields: [] };
    }

    const missingFields = requiredFields.filter(fieldName => {
        // Check if provided in form
        const inForm = stageFormData && stageFormData[fieldName] !== undefined
            && stageFormData[fieldName] !== null
            && stageFormData[fieldName] !== '';

        // Check if already on lead
        let onLead = false;
        const val = lead[fieldName];
        if (val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)) {
            onLead = true;
        }

        return !inForm && !onLead;
    });

    return { valid: missingFields.length === 0, missingFields };
};

// ─── EXECUTE TRANSITION: Apply stage change to lead ─────────────────────────
/**
 * Execute a stage transition after all validation passes.
 * Updates lead.stage + lead.stageHistory + any stageFormData fields.
 *
 * @param {string|ObjectId} leadId
 * @param {string} newStageName - e.g. 'Opportunity'
 * @param {Object} options
 * @param {string} [options.triggeredBy] - 'activity'|'manual_override'|'system'
 * @param {Object|null} [options.activityId] - Related activity ID
 * @param {string} [options.activityType]
 * @param {string} [options.outcome]
 * @param {string} [options.reason]
 * @param {string|null} [options.triggeredByUser]
 * @param {Object} [options.stageFormData] - Fields to update on lead from form
 * @returns {Promise<{ success: boolean, prevStage: string, newStage: string }>}
 */
export const executeTransition = async (leadId, newStageName, options = {}) => {
    const {
        triggeredBy = 'activity',
        activityId = null,
        activityType = '',
        outcome = '',
        reason = '',
        triggeredByUser = null,
        stageFormData = {}
    } = options;

    const lead = await Lead.findById(leadId).populate('stage', 'lookup_value').lean();
    if (!lead) throw new Error(`StageTransitionEngine: Lead ${leadId} not found`);

    const prevStageName = lead.stage?.lookup_value || lead.stage || 'Unknown';

    // Skip if already in the target stage
    if (prevStageName.toLowerCase() === newStageName.toLowerCase()) {
        return { success: true, prevStage: prevStageName, newStage: newStageName, skipped: true };
    }

    // Resolve the new stage lookup ObjectId
    let newStageId = null;
    const stageLookup = await Lookup.findOne({
        lookup_type: { $regex: /^stage$/i },
        lookup_value: { $regex: new RegExp(`^${escapeRegex(newStageName)}$`, 'i') }
    });
    if (stageLookup) newStageId = stageLookup._id;

    // Build stage history entry
    const now = new Date();
    const historyEntry = {
        stage: newStageName,
        enteredAt: now,
        triggeredBy,
        activityId: activityId || undefined,
        activityType: activityType || undefined,
        outcome: outcome || undefined,
        reason: reason || undefined,
        triggeredByUser: triggeredByUser || undefined
    };

    // Merge stageFormData fields into lead update
    const updatePayload = {
        stage: newStageId || newStageName,
        stageChangedAt: now,
        $push: { stageHistory: historyEntry }
    };

    // Apply any stageFormData fields (e.g., budget, location, timeline filled in form)
    const ALLOWED_STAGE_FORM_FIELDS = [
        'budget', 'budgetMin', 'budgetMax', 'location', 'locCity', 'locArea',
        'timeline', 'propertyType', 'requirement', 'subRequirement', 'notes', 'description'
    ];
    for (const [k, v] of Object.entries(stageFormData)) {
        if (ALLOWED_STAGE_FORM_FIELDS.includes(k) && v !== undefined && v !== null && v !== '') {
            updatePayload[k] = v;
        }
    }

    await Lead.findByIdAndUpdate(leadId, updatePayload);

    // Audit log
    try {
        await AuditLog.logEntityUpdate(
            'stage_changed',
            'lead',
            leadId,
            `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
            triggeredByUser,
            { before: prevStageName, after: newStageName },
            `Stage: "${prevStageName}" → "${newStageName}" via ${activityType} [${outcome}${reason ? ` / ${reason}` : ''}] (${triggeredBy})`
        );
    } catch (_) { /* Non-critical */ }

    // 🚀 LEAD REVIVAL AUTOMATION
    if (prevStageName.toLowerCase() === 'dormant' && newStageName.toLowerCase() === 'prospect') {
        RevivalSyncService.processRevivalActions(leadId, triggeredByUser).catch(err => {
            console.error('[StageTransitionEngine] Revival automation trigger failed:', err.message);
        });
    }

    return { success: true, prevStage: prevStageName, newStage: newStageName };
};

// ─── HIGH-LEVEL: Evaluate and execute in one call ────────────────────────────
/**
 * Given a completed activity, evaluate if a stage change is needed and execute it.
 * Returns the transition result with required fields info for the API layer.
 *
 * This is the function called by the Activity Completion API.
 *
 * @param {string|ObjectId} leadId
 * @param {string} activityType
 * @param {string} outcome
 * @param {string} reason
 * @param {Object} stageFormData - Fields submitted by user in StageTransitionModal
 * @param {Object} context - { activityId, triggeredByUser }
 * @returns {Promise<Object>} transition result
 */
export const evaluateAndTransition = async (leadId, activityType, outcome, reason, stageFormData = {}, context = {}) => {
    const purpose = context.purpose || '';
    // Step 1: Find matching rule (now also matches on purpose)
    const { matched, rule } = await resolveTransition(activityType, outcome, reason, purpose);

    if (!matched) {
        return {
            stageChanged: false,
            reason: 'No matching transition rule found',
            requiredForms: [],
            missingFields: []
        };
    }

    // Normalize requiredForms — supports old rules using requiredFields for field names
    const requiredForms = Array.isArray(rule.requiredForms)
        ? rule.requiredForms
        : (rule.requiredForm ? [rule.requiredForm] : []);

    // requiredFields are lead data fields (budget, location) — for backward compat
    const leadRequiredFields = Array.isArray(rule.requiredFields) ? rule.requiredFields : [];

    // Step 2: Validate required lead data fields
    if (leadRequiredFields.length > 0) {
        const lead = await Lead.findById(leadId).lean();
        const { valid, missingFields } = validateRequiredFields(lead, leadRequiredFields, stageFormData);
        if (!valid) {
            return {
                stageChanged: false,
                requiresForm: true,
                newStage: rule.newStage,
                requiredForms,
                missingFields,
                ruleId: rule.id
            };
        }
    }

    // Step 3: Check required forms have been provided by frontend
    if (requiredForms.length > 0) {
        const completedForms = context.completedForms || [];
        const missingForms = requiredForms.filter(f => !completedForms.includes(f));
        if (missingForms.length > 0) {
            return {
                stageChanged: false,
                requiresForm: true,
                newStage: rule.newStage,
                requiredForms,
                missingForms,
                ruleId: rule.id
            };
        }
    }

    // Step 4: Execute transition
    const result = await executeTransition(leadId, rule.newStage, {
        triggeredBy: 'activity',
        activityId: context.activityId,
        activityType,
        outcome,
        reason,
        triggeredByUser: context.triggeredByUser,
        stageFormData
    });

    return {
        stageChanged: result.success && !result.skipped,
        skipped: result.skipped || false,
        prevStage: result.prevStage,
        newStage: result.newStage,
        requiredForms,
        missingForms: [],
        ruleId: rule.id
    };
};

const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default { resolveTransition, evaluateAndTransition, executeTransition, loadTransitionRules, validateRequiredFields };
