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
import RevivalSyncService from './RevivalSyncService.js';
import DealSyncEngine from './DealSyncEngine.js';
import AuditLog from '../../models/AuditLog.js';
import StageTransitionLog from '../../models/StageTransitionLog.js';
import { safeRedisCall } from '../config/redis.js';


const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// ━━ ENTERPRISE FORM MAPPING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const FORM_FIELD_MAPPING = {
    'Requirement Form': ['requirement', 'propertyType', 'subType', 'sizeType', 'budgetMin', 'budgetMax', 'locState', 'locCity', 'locArea', 'sector', 'projectName'],
    'Meetings Form': ['notes', 'description'],
    'Quotation Form': ['budget', 'budgetMax', 'notes'],
    'Offer Form': ['budget', 'budgetMax', 'notes'],
    'Booking Form': ['bookingAmount', 'bookingDate', 'bookingRefNo'], // New Enterprise Gate
    'Site Visit Form': [] // Handled dynamically based on activity completion
};

const getNextActionSuggestion = (targetStage) => {
    const suggestions = {
        'Prospect': 'Schedule an initial discovery call to understand detailed requirements. Share brochures and project details for the shortlisted properties.',
        'Opportunity': 'Plan a detailed site visit or meeting to finalize preferences.',
        'Negotiation': 'Draft the final quotation and offer letter. Address any pricing concerns.',
        'Booked': 'Initiate document collection and verify payment status for initial booking.',
        'Closed Won': 'Onboard the client and transition to the CRM Post-Sales module.'
    };
    return suggestions[targetStage] || 'Schedule a follow-up activity to keep the momentum going.';
};

// ─── DEFAULT RULES (seed data — admin can override via settings page) ─────────
export const DEFAULT_STAGE_RULES = [
    // ══════════════════════════════════════════════════════════
    //  NEW OUTCOMES (PHASE 3)
    // ══════════════════════════════════════════════════════════
    {
        id: 'visit_cancelled',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Visit Cancelled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'visit_no_show',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'No Show',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'visit_rescheduled',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Visit Rescheduled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'call_voicemail_left',
        activityType: 'Call',
        purpose: '*',
        outcome: 'Voicemail Left',
        reason: '*',
        newStage: 'Incoming',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'call_qualifying_very_interested',
        activityType: 'Call',
        purpose: 'Qualifying',
        outcome: 'Connected',
        reason: 'Very Interested',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 15,
        active: true
    },
    {
        id: 'call_intro_very_interested',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Connected',
        reason: 'Very Interested',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 15,
        active: true
    },
    {
        id: 'meeting_cancelled',
        activityType: 'Meeting',
        purpose: '*',
        outcome: 'Meeting Cancelled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'meeting_demo_interested',
        activityType: 'Meeting',
        purpose: 'Demo Given',
        outcome: 'Conducted',
        reason: 'Interested',
        newStage: 'Opportunity',
        requiredForms: [],
        priority: 20,
        active: true
    },
    {
        id: 'digital_replied_not_interested',
        activityType: 'Email', // or WhatsApp, we'll use * 
        purpose: '*',
        outcome: 'Replied',
        reason: 'Not Interested',
        newStage: 'Closed',
        requiredForms: [],
        priority: 30,
        active: true
    },
    {
        id: 'digital_bounced',
        activityType: 'Email',
        purpose: '*',
        outcome: 'Bounced',
        reason: '*',
        newStage: 'Incoming',
        requiredForms: [],
        priority: 30,
        active: true
    },
    {
        id: 'digital_whatsapp_blocked',
        activityType: 'WhatsApp',
        purpose: '*',
        outcome: 'Blocked',
        reason: '*',
        newStage: 'Closed',
        requiredForms: [],
        priority: 30,
        active: true
    },


    // ══════════════════════════════════════════════════════════
    //  CALL RULES
    // ══════════════════════════════════════════════════════════

    // Introduction calls
    {
        id: 'call_intro_interested',
        activityType: 'Call',
        purpose: 'Introduction', // Will match 'Introduction / First Contact' via .includes
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
        outcome: 'Not Connected', // Matches 'no answer', 'busy', 'missed' via resolveTransition contains logic
        reason: '*',
        newStage: 'Incoming', // Stay in Incoming if not connected
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
        newStage: 'Closed',
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
        newStage: 'Closed',
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
        newStage: 'Prospect',
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
        newStage: 'Prospect',
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
        newStage: 'Prospect',
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
        newStage: 'Prospect', // Stay in Prospect (follow-up implies already a prospect)
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
        newStage: 'Closed',
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
        newStage: 'Closed',
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
        newStage: 'Closed',
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
        purpose: '*', // Meetings should trigger stage changes regardless of specific agenda label
        outcome: 'Meeting Done',
        reason: 'Interested',
        newStage: 'Prospect',
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
        newStage: 'Closed',
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
        newStage: 'Negotiation',
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
        newStage: 'Opportunity',
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
        newStage: 'Closed',
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
        purpose: 'Site Visit', 
        outcome: 'Interested',
        reason: '*',
        newStage: 'Opportunity',
        requiredForms: ['Requirement Form', 'Site Visit Form'],
        priority: 25,
        active: true
    },
    {
        id: 'sv_interested_alt',
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
        purpose: 'Site Visit',
        outcome: 'Very Interested',
        reason: '*',
        newStage: 'Negotiation',
        requiredForms: ['Requirement Form', 'Site Visit Form', 'Quotation Form'],
        priority: 25,
        active: true
    },
    {
        id: 'sv_very_interested_alt',
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
        // 🚀 [FIX] Wildcard purpose — matches "Re Visit (with family)", etc.
        id: 'sv_very_interested_any_purpose',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Very Interested',
        reason: '*',
        newStage: 'Negotiation',
        requiredForms: ['Requirement Form', 'Site Visit Form', 'Quotation Form'],
        priority: 24,
        active: true
    },
    {
        id: 'sv_shortlisted',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Shortlisted',
        reason: '*',
        newStage: 'Opportunity',
        requiredForms: ['Requirement Form', 'Site Visit Form'],
        priority: 25,
        active: true
    },
    {
        // 🚀 [FIX] "Somewhat Interested" outcome — move to Qualified stage
        id: 'sv_somewhat_interested',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Somewhat Interested',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: ['Requirement Form'],
        priority: 25,
        active: true
    },
    {
        // 🚀 [FIX] "Conducted" outcome — Site Visit happened, move to Opportunity
        // Covers: visit completed but no specific interest level marked
        id: 'sv_conducted',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Conducted',
        reason: '*',
        newStage: 'Opportunity',
        requiredForms: ['Requirement Form'],
        priority: 23,
        active: true,
        description: 'Site Visit Conducted (any purpose) → Opportunity — covers Re-Visit, Property Tour, etc.'
    },
    {
        // 🚀 [FIX] "Will Think" outcome after site visit — stay engaged at Qualified
        id: 'sv_will_think',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Will Think',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 23,
        active: true
    },
    {
        // 🚀 [FIX] "Second Visit Requested" / "Re-Visit" — move to Opportunity
        id: 'sv_revisit_requested',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Second Visit',
        reason: '*',
        newStage: 'Opportunity',
        requiredForms: ['Site Visit Form'],
        priority: 25,
        active: true
    },
    {
        id: 'sv_cancelled',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Visit Cancelled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 15,
        active: true,
        description: 'Site Visit → Cancelled → Return to Prospect (Regression guard will protect Opportunity)'
    },
    {
        id: 'sv_no_show',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'No Show',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 15,
        active: true,
        description: 'Site Visit → No Show → Return to Prospect (Regression guard will protect Opportunity)'
    },
    {
        id: 'sv_rescheduled',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Rescheduled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 15,
        active: true,
        description: 'Site Visit → Rescheduled → Return to Prospect (Regression guard will protect Opportunity)'
    },
    {
        id: 'sv_not_interested_price',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Not Interested',
        reason: 'Price High',
        newStage: 'Closed',
        requiredForms: [],
        priority: 26,
        active: true
    },
    {
        id: 'sv_not_interested_location',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Not Interested',
        reason: 'Location Mismatch',
        newStage: 'Closed',
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
        newStage: 'Closed',
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
        newStage: 'Incoming',
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
        newStage: 'Incoming',
        requiredForms: [],
        priority: 5,
        active: true,
        description: 'WhatsApp → No Reply → stay Incoming'
    },

    // ══════════════════════════════════════════════════════════
    //  INBOUND REVIVAL RULES
    // ══════════════════════════════════════════════════════════
    {
        id: 'inbound_revival_whatsapp',
        activityType: 'WhatsApp',
        purpose: 'Inbound',
        outcome: 'Inbound Message',
        reason: '*',
        newStage: 'Prospect',   // Pipeline Re-entry Point
        requiredForms: [],
        priority: 60,           // High priority (overrides standard rules)
        active: true,
        description: 'Auto-revive Closed/Dormant lead upon receiving inbound WhatsApp message'
    },

    // ══════════════════════════════════════════════════════════
    //  CLOSURE RULES (any activity type)
    // ══════════════════════════════════════════════════════════

    {
        // 🚀 [BUG FIX] Was 'Negotiation' — corrected to 'Booked'
        id: 'any_booking_done',
        activityType: '*',
        purpose: '*',
        outcome: 'Booking Done',
        reason: '*',
        newStage: 'Booked',
        requiredForms: ['Quotation Form', 'Offer Form', 'Booking Form'],
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
        newStage: 'Closed',
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
        newStage: 'Closed',
        requiredForms: [],
        priority: 50,
        active: true,
        description: 'Any Activity → Lost to Competitor → Closed Lost'
    },
    {
        // 🚀 [BUG FIX] Description corrected: moves to 'Closed' (was incorrectly saying 'Dormant')
        id: 'any_not_interested_global',
        activityType: '*',
        purpose: '*',
        outcome: 'Not Interested',
        reason: '*',
        newStage: 'Closed',
        requiredForms: [],
        priority: 9, // Lowest catch-all — specific Not Interested rules take precedence
        active: true,
        description: 'System Rule: Any Activity with Not Interested outcome moves to Closed'
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
let _localRulesCache = null;

const flattenMasterFields = (activityMasterFields) => {
    const defaultRules = [];
    if (!activityMasterFields || !activityMasterFields.activities) return defaultRules;
    for (const act of activityMasterFields.activities) {
        for (const purp of (act.purposes || [])) {
            for (const out of (purp.outcomes || [])) {
                if (out.stage) {
                    defaultRules.push({
                        id: `default_${act.name}_${purp.name}_${out.label}`.replace(/\s+/g, '_').toLowerCase(),
                        activityType: act.name,
                        purpose: purp.name,
                        outcome: out.label,
                        status: out.status || '*',
                        reason: '*',
                        newStage: out.stage,
                        requiredForms: Array.isArray(out.requiredForms) ? out.requiredForms : (out.requiredForm ? [out.requiredForm] : []),
                        priority: 100, // lower priority than overrides (which default to 1-99)
                        active: true,
                        description: `Default Mapping: ${act.name} -> ${out.stage}`
                    });
                }
            }
        }
    }
    return defaultRules;
};

export const loadTransitionRules = async () => {
    try {
        // 1. Try Redis First
        const redisCache = await safeRedisCall('get', 'stage_rules_cache');
        if (redisCache) {
            const parsed = JSON.parse(redisCache);
            _localRulesCache = parsed;
            return parsed;
        }
        
        // 2. Fallback to DB
        const [transitionSetting, mappingSetting, activityMasterFieldsSetting] = await Promise.all([
            SystemSetting.findOne({ key: 'stage_transition_rules' }).lean(),
            SystemSetting.findOne({ key: 'stageMappingRules' }).lean(),
            SystemSetting.findOne({ key: 'activityMasterFields' }).lean()
        ]);

        let rules = transitionSetting?.value?.rules || [];
        
        if (activityMasterFieldsSetting?.value) {
            const defaults = flattenMasterFields(activityMasterFieldsSetting.value);
            rules = [...rules, ...defaults];
        }

        if (mappingSetting?.value && Array.isArray(mappingSetting.value)) {
            const mapped = mappingSetting.value.map(r => ({
                ...r,
                newStage: r.newStage || r.stage, 
                active: r.isActive !== undefined ? r.isActive : (r.active !== undefined ? r.active : true)
            }));
            rules = [...rules, ...mapped];
        }

        const finalRules = rules.length > 0 ? rules : DEFAULT_STAGE_RULES;
        
        // 3. Save to Redis (TTL 1 hour, invalidated manually on save)
        await safeRedisCall('setex', 'stage_rules_cache', 3600, JSON.stringify(finalRules));
        _localRulesCache = finalRules;
        return finalRules;
    } catch (err) {
        console.error('[StageTransitionEngine] Load rules error:', err.message);
        return _localRulesCache || DEFAULT_STAGE_RULES;
    }
};

export const invalidateRulesCache = async () => {
    _localRulesCache = null;
    await safeRedisCall('del', 'stage_rules_cache');
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
// ━━ PURPOSE ALIAS GROUPS — Semantic matching for flexible purpose names ━━━━━━━
// Maps user-facing purpose strings to canonical group names.
// Any purpose string containing any of the listed keywords maps to that group.
const PURPOSE_ALIAS_GROUPS = {
    SITE_VISIT:   ['site visit', 'property tour', 're visit', 'revisit', 're-visit',
                   'second visit', 'family visit', 'site revisit', 'property revisit',
                   'visit with', 'property visit'],
    INTRO_CALL:   ['introduction', 'intro call', 'first contact', 'initial call',
                   'cold call', 'first call'],
    FOLLOW_UP:    ['follow up', 'followup', 'follow-up', 'callback',
                   'call back', 'scheduled callback'],
    NEGOTIATION:  ['price discussion', 'negotiation', 'offer discussion',
                   'final offer', 'closing discussion', 'negotiation meeting'],
    MEETING:      ['meeting', 'product presentation', 'demo', 'presentation',
                   'walkthrough', 'webinar'],
};

const getPurposeGroup = (purposeStr) => {
    const p = (purposeStr || '').toLowerCase().trim();
    for (const [group, keywords] of Object.entries(PURPOSE_ALIAS_GROUPS)) {
        if (keywords.some(k => p.includes(k) || k.includes(p))) return group;
    }
    return p; // fallback: use raw normalised string
};

// ━━ SAFE OUTCOME ALIASES — exact synonyms that should match the same rule ━━━━━
// Prevents dangerous substring match ("Not Interested".includes("Interested") = true)
const OUTCOME_EXACT_ALIASES = {
    'not connected': ['no answer', 'no-answer', 'busy', 'missed', 'switched off',
                      'not reachable', 'unreachable', 'failed'],
    'connected':     ['picked up', 'answered'],
    'very interested': ['highly interested', 'very keen', 'extremely interested'],
    'shortlisted':   ['short listed', 'finalized', 'finalised'],
    'booking done':  ['booked', 'token paid', 'advance paid', 'allotment done'],
    'deal closed':   ['closed won', 'won'],
    'not interested': ['rejected', 'declined', 'no interest'],
};

const matchOutcome = (outNorm, ruleOutNorm) => {
    if (ruleOutNorm === '*') return true;
    if (outNorm === '') return false;
    // 1. Exact match (primary — safest)
    if (ruleOutNorm === outNorm) return true;
    // 2. Alias match (rule outcome → check if actual outcome is an alias)
    const aliases = OUTCOME_EXACT_ALIASES[ruleOutNorm] || [];
    if (aliases.includes(outNorm)) return true;
    // 3. Reverse alias match (actual outcome → check if rule outcome is an alias)
    for (const [canonical, aliasList] of Object.entries(OUTCOME_EXACT_ALIASES)) {
        if (aliasList.includes(outNorm) && canonical === ruleOutNorm) return true;
    }
    return false;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DEBUG_STAGE = process.env.STAGE_ENGINE_DEBUG === 'true';
const debugLog = (...args) => { if (DEBUG_STAGE) console.log(...args); };

export const resolveTransition = async (activityType, outcome, reason = '', purpose = '', status = '') => {
    const rules = await loadTransitionRules();
    const activeRules = rules
        .filter(r => (r.isActive !== false && r.active !== false))
        // 🚀 [FIX] Sort by priority ASCENDING. 1 is highest priority and should be evaluated first.
        .sort((a, b) => (a.priority || 99) - (b.priority || 99));

    const normalize = str => (str || '').toString().toLowerCase().trim().replace(/[-_/]/g, ' ').replace(/\s+/g, ' ');
    const actNorm = normalize(activityType);
    const outNorm = normalize(outcome);
    const resNorm = normalize(reason);
    const purpNorm = normalize(purpose);
    const statNorm = normalize(status);
    const purpGroup = getPurposeGroup(purpNorm);

    for (const rule of activeRules) {
        const ruleActNorm = normalize(rule.activityType);
        const rulePurpNorm = normalize(rule.purpose);
        const ruleOutNorm = normalize(rule.outcome);
        const ruleResNorm = normalize(rule.reason);
        const ruleStatNorm = normalize(rule.status);
        const rulePurpGroup = getPurposeGroup(rulePurpNorm);

        // 1. Activity type match: exact or wildcard (handle legacy empty string as wildcard)
        const actMatch = ruleActNorm === '*' || ruleActNorm === '' || ruleActNorm === actNorm;

        // 2. Purpose match: wildcard OR same group (semantic alias) OR exact
        const purpMatch = !rule.purpose || rulePurpNorm === '*' || rulePurpNorm === '' ||
                          rulePurpNorm === purpNorm ||
                          (purpGroup && rulePurpGroup && purpGroup === rulePurpGroup);

        // 3. Outcome match: wildcard OR exact OR safe alias table (handle legacy empty string as wildcard)
        //    ⚠️ NO .includes() — prevents "Not Interested".includes("Interested") false positives
        const outMatch = matchOutcome(outNorm, ruleOutNorm) || ruleOutNorm === '';

        // 4. Reason match: wildcard OR exact OR safe partial (reason is a sub-label, partial ok)
        const resMatch = ruleResNorm === '*' || !rule.reason || ruleResNorm === '' ||
                         resNorm === ruleResNorm ||
                         (resNorm && resNorm.startsWith(ruleResNorm)) ||
                         (ruleResNorm && ruleResNorm.startsWith(resNorm));

        // 5. Status match: wildcard OR exact. (If missing in rule, treat as wildcard to not break old rules)
        const statMatch = ruleStatNorm === '*' || !rule.status || ruleStatNorm === '' || ruleStatNorm === statNorm;

        const isMatch = actMatch && purpMatch && outMatch && resMatch && statMatch;
        // Only log per-rule detail in debug mode (set STAGE_ENGINE_DEBUG=true in .env)
        debugLog(`[StageEngine] Rule ${rule.id || 'unnamed'}: ${isMatch ? '✅ MATCH' : '❌ FAIL'} | Act=${actMatch} Purp=${purpMatch} Stat=${statMatch} Out=${outMatch} Res=${resMatch}`);

        if (isMatch) {
            console.log(`[StageEngine] ✅ Matched Rule: ${rule.id} for Act=${actNorm}, Purp=${purpNorm}, Stat=${statNorm}, Out=${outNorm}`);
            return { matched: true, rule };
        }
    }

    console.log(`[StageEngine] ❌ No match for Act=${actNorm}, Purp=${purpNorm}, Out=${outNorm}, Res=${resNorm}`);
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
        stageFormData = {},
        scoreModifier = 0,
        visitedProperties = []
    } = options;

    const lead = await Lead.findById(leadId)
        .populate('stage', 'lookup_value')
        .populate('status', 'lookup_value')
        .lean();
    if (!lead) throw new Error(`StageTransitionEngine: Lead ${leadId} not found`);

    const prevStageName = lead.stage?.lookup_value || lead.stage || 'Unknown';

    // Skip if already in the target stage
    if (prevStageName.toLowerCase() === newStageName.toLowerCase()) {
        return { success: true, prevStage: prevStageName, newStage: newStageName, skipped: true };
    }

    // 🚀 [FEATURE] Stage Regression Guard (Forward-only enforcement)
    const STAGE_ORDER = {
        'incoming': 0, 'prospect': 1,
        'opportunity': 3, 'negotiation': 4, 'booked': 5, 'closed': 6
    };

    const currentOrder = STAGE_ORDER[prevStageName.toLowerCase()] ?? -1;
    const targetOrder = STAGE_ORDER[newStageName.toLowerCase()] ?? -1;

    // Block if trying to move backward, unless triggered by manual_override
    if (targetOrder > -1 && currentOrder > -1 && targetOrder < currentOrder && triggeredBy !== 'manual_override') {
        console.warn(`[StageEngine] Regression blocked: ${prevStageName} → ${newStageName}`);
        return { success: false, blocked: true, reason: 'Stage regression not allowed', prevStage: prevStageName, newStage: newStageName };
    }

    // Handle terminal states properly for Mobile/Backend auto-triggers
    let targetStageName = newStageName;
    let targetStatusName = null;
    const terminalStatuses = ['Won', 'Lost', 'Unqualified'];
    
    const currentStatusName = lead.status?.lookup_value || '';

    if (terminalStatuses.includes(newStageName)) {
        targetStageName = 'Closed';
        targetStatusName = newStageName;
    } else if (targetStageName.toLowerCase() === 'prospect') {
        // Auto-promote status to 'Contacted' if it is 'New', 'Dormant', 'Stalled', or missing
        if (!currentStatusName || ['new', 'dormant', 'stalled'].includes(currentStatusName.toLowerCase())) {
            targetStatusName = 'Contacted';
        }
    } else if (['opportunity', 'negotiation'].includes(targetStageName.toLowerCase())) {
        // Auto-promote status to 'Working' if it is 'New', 'contacted', 'dormant', 'stalled', or missing
        if (!currentStatusName || ['new', 'contacted', 'dormant', 'stalled'].includes(currentStatusName.toLowerCase())) {
            targetStatusName = 'Working';
        }
    }

    // Resolve the new stage lookup ObjectId
    let newStageId = null;
    const stageLookup = await Lookup.findOne({
        lookup_type: { $regex: /^stage$/i },
        lookup_value: { $regex: new RegExp(`^${escapeRegExp(targetStageName)}$`, 'i') }
    });
    if (stageLookup) newStageId = stageLookup._id;
    
    // Resolve the new status lookup ObjectId if applicable
    let newStatusId = null;
    if (targetStatusName) {
        const statusLookup = await Lookup.findOne({
            lookup_type: { $regex: /^status$/i },
            lookup_value: { $regex: new RegExp(`^${escapeRegExp(targetStatusName)}$`, 'i') }
        });
        if (statusLookup) newStatusId = statusLookup._id;
    }

    // Build stage history entry
    const now = new Date();
    const historyEntry = {
        stage: targetStageName,
        enteredAt: now,
        triggeredBy,
        activityId: activityId || undefined,
        activityType: activityType || undefined,
        outcome: outcome || undefined,
        reason: reason || (targetStatusName ? `Moved to terminal status: ${targetStatusName}` : undefined),
        triggeredByUser: triggeredByUser || undefined
    };

    // Merge stageFormData fields into lead update
    const updatePayload = {
        stage: newStageId || targetStageName,
        stageChangedAt: now,
        $push: { stageHistory: historyEntry }
    };

    // 🚀 [BUG FIX] Update previous stageHistory entry with exitedAt and daysInStage
    if (lead.stageHistory && lead.stageHistory.length > 0) {
        const lastIndex = lead.stageHistory.length - 1;
        const lastEntry = lead.stageHistory[lastIndex];
        if (!lastEntry.exitedAt) {
            const enteredAt = lastEntry.enteredAt || lead.createdAt;
            const daysInStage = Math.max(0, Math.floor((now - new Date(enteredAt)) / (1000 * 60 * 60 * 24)));
            updatePayload[`stageHistory.${lastIndex}.exitedAt`] = now;
            updatePayload[`stageHistory.${lastIndex}.daysInStage`] = daysInStage;
        }
    }

    if (newStatusId) {
        updatePayload.status = newStatusId;
    }

    // Apply any stageFormData fields (e.g., budget, location, timeline filled in form)
    const ALLOWED_STAGE_FORM_FIELDS = [
        'budget', 'budgetMin', 'budgetMax', 'location', 'locCity', 'locArea',
        'timeline', 'propertyType', 'requirement', 'subRequirement', 'notes', 'description',
        'bookingAmount', 'bookingDate', 'bookingRefNo', 'kycVerified', 'kycDocumentUrl'
    ];
    for (const [k, v] of Object.entries(stageFormData)) {
        if (ALLOWED_STAGE_FORM_FIELDS.includes(k) && v !== undefined && v !== null && v !== '') {
            updatePayload[k] = v;
        }
    }

    console.log(`[StageEngine] Executing transition for Lead ${leadId}: ${prevStageName} -> ${newStageName}`);
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
    
    // 🚀 DEAL SYNC ENGINE (Phase 4)
    DealSyncEngine.syncLeadToDeal(leadId, newStageName, triggeredByUser, visitedProperties).catch(err => {
        console.error('[StageTransitionEngine] Deal sync trigger failed:', err.message);
    });

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
export const evaluateAndTransition = async (leadId, activityType, outcome, reason = '', stageFormData = {}, context = {}) => {
    // Check if the engine should run for this specific activity type based on admin settings
    const shouldRun = true; // Hardcoded fallback since it was missing
    
    // ✅ [BUG FIX] Removed invalidateRulesCache() — it was wiping cache before every evaluation,
    // causing 2 extra MongoDB queries per activity (cache always missed).
    // Cache is now invalidated only when admin saves rules via the settings page.
    
    let finalOutcome = outcome;
    const purpose = context.purpose || '';
    const status = context.status || '';

    // 🌟 SITE VISIT INTELLIGENCE: Extract outcome from visitedProperties if top-level is missing
    if (!finalOutcome && activityType?.toLowerCase() === 'site visit' && context.activityId) {
        try {
            const Activity = (await import('../../models/Activity.js')).default || (await import('../../models/Activity.js'));
            const activity = await Activity.findById(context.activityId).lean();
            if (activity?.details?.visitedProperties?.length > 0) {
                console.log(`[StageEngine] Extracting outcome from ${activity.details.visitedProperties.length} visited properties...`);
                // Priority order for outcomes
                const priority = { 'very interested': 1, 'shortlisted': 2, 'interested': 3, 'somewhat interested': 4 };
                const results = activity.details.visitedProperties
                    .map(p => (p.result || '').toLowerCase())
                    .filter(r => r)
                    .sort((a, b) => (priority[a] || 99) - (priority[b] || 99));
                
                if (results.length > 0) {
                    finalOutcome = results[0];
                    console.log(`[StageEngine] Auto-extracted Site Visit outcome: ${finalOutcome}`);
                }
            }
        } catch (err) {
            console.error('[StageEngine] Site Visit outcome extraction failed:', err.message);
        }
    }

    // Step 1: Find matching rule (now also matches on purpose)
    console.log(`[StageEngine] Resolving transition for Type: ${activityType}, Purpose: ${purpose}, Outcome: ${finalOutcome}`);
    const { matched, rule } = await resolveTransition(activityType, finalOutcome, reason, purpose);

    if (!matched) {
        console.log(`[StageEngine] ℹ️ No matching rule for ${activityType}/${finalOutcome}`);
        
        // 🚀 [FEATURE] Log failure to StageTransitionLog
        try {
            await StageTransitionLog.create({
                leadId,
                activityId: context.activityId,
                activityType,
                purpose,
                outcome: finalOutcome,
                reason,
                status: 'no_rule',
                failureReason: `No matching rule for ${activityType}/${finalOutcome}`,
                triggeredByUser: context.triggeredByUser
            });
        } catch (_) {}

        return {
            stageChanged: false,
            reason: 'No matching transition rule found',
            requiredForms: [],
            missingFields: []
        };
    }

    console.log(`[StageEngine] 🎯 Matched Rule: ${rule.id} (New Stage: ${rule.newStage})`);

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
            // 🚀 [FEATURE] Log blocked attempt
            try {
                await StageTransitionLog.create({
                    leadId, activityId: context.activityId, activityType, purpose, outcome: finalOutcome, reason,
                    status: 'missing_fields', matchedRuleId: rule.id, newStage: rule.newStage,
                    failureReason: `Missing required fields: ${missingFields.join(', ')}`, triggeredByUser: context.triggeredByUser
                });
            } catch (_) {}

            return {
                stageChanged: false,
                requiresForm: true,
                newStage: rule.newStage,
                requiredForms,
                missingFields,
                requiredFields: leadRequiredFields, // Fix: Ensure frontend knows what to render
                ruleId: rule.id
            };
        }
    }

    // Step 3: Check required forms (Database-driven verification)
    if (requiredForms.length > 0) {
        const lead = await Lead.findById(leadId).lean();
        const missingForms = [];

        for (const formName of requiredForms) {
            // Case 1: Site Visit Form is satisfied if we are currently completing a Site Visit
            if (formName === 'Site Visit Form' && activityType?.toLowerCase() === 'site visit') {
                continue;
            }

            // Case 2: Custom Strict Validation for Requirement Form
            if (formName === 'Requirement Form') {
                const getVal = (f) => {
                    const val = stageFormData[f] !== undefined ? stageFormData[f] : lead[f];
                    return (val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)) ? val : null;
                };

                // Details Page validation
                const detailsValid = getVal('requirement') && getVal('propertyType') && getVal('subType') && getVal('sizeType') && getVal('budgetMin') && getVal('budgetMax');

                // Location Page validation
                const isProjectLocation = getVal('projectName') && getVal('projectName').length > 0;
                const locationValid = isProjectLocation 
                    ? (getVal('locCity') && getVal('projectName')) 
                    : (getVal('locState') && getVal('locCity') && (getVal('locArea') || getVal('sector')));

                if (detailsValid && locationValid) {
                    continue; // Form is strictly filled
                } else {
                    missingForms.push(formName);
                    continue; // Skip generic fallback mapping check below
                }
            }

            // Case 3: Check mapping if fields exist on lead or were just submitted
            const mappedFields = FORM_FIELD_MAPPING[formName];
            if (mappedFields && mappedFields.length > 0) {
                const hasData = mappedFields.some(field => {
                    const val = stageFormData[field] !== undefined ? stageFormData[field] : lead[field];
                    return val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
                });
                
                if (hasData) continue; // Form is effectively filled
            } else {
                // Form is NOT in mapping (legacy or custom rule). Use fallback field 'notes' to unblock.
                if (stageFormData['notes'] !== undefined && stageFormData['notes'] !== '') {
                    continue; // Effectively filled via fallback
                }
            }

            const completedInContext = (context.completedForms || []).includes(formName);
            if (completedInContext) continue;

            missingForms.push(formName);
        }

        if (missingForms.length > 0) {
            // Log notification for missing forms
            try {
                const { createNotification } = await import('../../controllers/notification.controller.js');
                await createNotification(
                    context.triggeredByUser,
                    'systemAlerts',
                    '⚠️ Missing Required Data',
                    `Stage transition to "${rule.newStage}" blocked. Please fill: ${missingForms.join(', ')}`,
                    `/leads/${leadId}`
                );
            } catch (_) {}

            // Map missing forms to canonical fields so the frontend StageTransitionModal can render them
            const derivedMissingFields = [];
            for (const form of missingForms) {
                const mapped = FORM_FIELD_MAPPING[form];
                if (mapped && mapped.length > 0) {
                    // Push the first 4 essential fields of the form so the modal isn't too crowded
                    derivedMissingFields.push(...mapped.slice(0, 4));
                } else {
                    derivedMissingFields.push('notes'); // Fallback field
                }
            }

            // Deduplicate
            const uniqueMissingFields = [...new Set(derivedMissingFields)];

            // 🚀 [FEATURE] Log blocked attempt due to forms
            try {
                await StageTransitionLog.create({
                    leadId, activityId: context.activityId, activityType, purpose, outcome: finalOutcome, reason,
                    status: 'missing_fields', matchedRuleId: rule.id, newStage: rule.newStage,
                    failureReason: `Missing required forms: ${missingForms.join(', ')}`, triggeredByUser: context.triggeredByUser
                });
            } catch (_) {}

            return {
                stageChanged: false,
                requiresForm: true,
                newStage: rule.newStage,
                requiredForms,
                missingForms,
                missingFields: uniqueMissingFields,
                requiredFields: uniqueMissingFields, // Required for frontend to render
                ruleId: rule.id,
                notification: `Please fill ${missingForms.join(', ')} to move to ${rule.newStage}`
            };
        }
    }

    // 🛡️ LAYER 3: ENTERPRISE KYC HARD GATE (Booking Strictness)
    if (rule.newStage.toLowerCase() === 'booked') {
        const leadCheck = await Lead.findById(leadId).select('kycVerified kycDocumentUrl documents').lean();
        
        // 1. Check Traditional fields
        const hasTraditionalKyc = leadCheck?.kycVerified === true || (leadCheck?.kycDocumentUrl && leadCheck.kycDocumentUrl.trim() !== '') || (stageFormData && (stageFormData.kycVerified === true || stageFormData.kycVerified === 'true'));
        
        // 2. Deep scan the documents array for an 'ID Proof'
        let hasIdProofDoc = false;
        if (leadCheck?.documents && Array.isArray(leadCheck.documents)) {
            hasIdProofDoc = leadCheck.documents.some(doc => {
                const cat = doc.documentCategory;
                if (!cat) return false;
                // Extract category name if it's an object/Lookup, otherwise use the string directly
                const catName = (typeof cat === 'object' && cat.name) ? cat.name : String(cat);
                return catName.toLowerCase() === 'id proof';
            });
        }

        const hasKyc = hasTraditionalKyc || hasIdProofDoc;
        
        if (!hasKyc) {
            try {
                await StageTransitionLog.create({
                    leadId, activityId: context.activityId, activityType, purpose, outcome: finalOutcome, reason,
                    status: 'missing_kyc', matchedRuleId: rule.id, newStage: rule.newStage,
                    failureReason: `Strict KYC Gate: Missing KYC Document or Verification`, triggeredByUser: context.triggeredByUser
                });
            } catch (_) {}

            return {
                stageChanged: false,
                requiresForm: true,
                newStage: rule.newStage,
                requiredForms: [...requiredForms, 'KYC Document Verification'],
                missingForms: ['KYC Document Verification'],
                missingFields: ['kycVerified', 'kycDocumentUrl'],
                requiredFields: ['kycVerified', 'kycDocumentUrl'], 
                ruleId: rule.id,
                notification: `KYC Document Verification is strictly required before moving to Booked stage.`
            };
        }
    }

    // 🛡️ LAYER 3.5: ENTERPRISE SEQUENCE GUARD & STABILITY LOCK
    try {
        const sequenceConfigDoc = await SystemSetting.findOne({ key: 'sequenceConfig' }).lean();
        const sequenceConfig = sequenceConfigDoc?.value || null;
        
        const currentLead = await Lead.findById(leadId).select('stage stageChangedAt createdAt').lean();
        const currentStage = currentLead?.stage || 'New';
        
        if (sequenceConfig && sequenceConfig.enforcementMode !== 'off' && sequenceConfig.sequence) {
            const seq = sequenceConfig.sequence;
            const currentIdx = seq.findIndex(s => s.stage.toLowerCase() === currentStage.toLowerCase());
            const targetIdx = seq.findIndex(s => s.stage.toLowerCase() === rule.newStage.toLowerCase());
            
            // 1. SEQUENCE GUARD (Preventing forward skips)
            if (currentIdx !== -1 && targetIdx !== -1 && targetIdx > currentIdx + 1) {
                const missingStages = seq.slice(currentIdx + 1, targetIdx).map(s => s.stage);
                if (sequenceConfig.enforcementMode === 'block') {
                    try {
                        await StageTransitionLog.create({
                            leadId, activityId: context.activityId, activityType, purpose, outcome: finalOutcome, reason,
                            status: 'sequence_violation', matchedRuleId: rule.id, newStage: rule.newStage,
                            failureReason: `Strict Sequence Gate: Cannot skip stages. Missing: ${missingStages.join(', ')}`, triggeredByUser: context.triggeredByUser
                        });
                    } catch (_) {}

                    return {
                        stageChanged: false,
                        newStage: rule.newStage,
                        requiresForm: false,
                        ruleId: rule.id,
                        notification: `Sequence Error: You must pass through ${missingStages.join(', ')} first.`
                    };
                } else if (sequenceConfig.enforcementMode === 'warn') {
                    try {
                        await StageTransitionLog.create({
                            leadId, activityId: context.activityId, activityType, purpose, outcome: finalOutcome, reason,
                            status: 'sequence_warning', matchedRuleId: rule.id, newStage: rule.newStage,
                            failureReason: `Warning: Skipped stages ${missingStages.join(', ')}`, triggeredByUser: context.triggeredByUser
                        });
                    } catch (_) {}
                }
            }
            
            // 2. STABILITY LOCK (Preventing false regressions)
            if (currentIdx !== -1 && targetIdx !== -1 && targetIdx < currentIdx) {
                const stabilityConfigDoc = await SystemSetting.findOne({ key: 'stabilityLockConfig' }).lean();
                const STABILITY_CONFIG = stabilityConfigDoc?.value || {
                    Opportunity: { minActivities: 1, minDays: 0, label: 'Opportunity requires 1 activity before downgrade' },
                    Negotiation: { minActivities: 1, minDays: 0, label: 'Negotiation requires 1 activity before downgrade' },
                    Closed: { minActivities: 999, minDays: 999, label: 'Closed deals cannot be downgraded automatically' }
                };
                
                const lock = STABILITY_CONFIG[currentStage];
                if (lock) {
                    const Activity = (await import('../../models/Activity.js')).default || (await import('../../models/Activity.js'));
                    const sinceDate = currentLead.stageChangedAt || currentLead.createdAt || new Date();
                    const activitiesInStage = await Activity.countDocuments({ 
                        entityType: 'Lead', 
                        entityId: leadId, 
                        createdAt: { $gte: sinceDate } 
                    });
                    
                    const daysInStage = Math.floor((Date.now() - new Date(sinceDate).getTime()) / (1000 * 60 * 60 * 24));
                    
                    if (activitiesInStage < lock.minActivities || daysInStage < lock.minDays) {
                        try {
                            await StageTransitionLog.create({
                                leadId, activityId: context.activityId, activityType, purpose, outcome: finalOutcome, reason,
                                status: 'stability_lock', matchedRuleId: rule.id, newStage: rule.newStage,
                                failureReason: `Stability Lock: Cannot downgrade. Requires ${lock.minActivities} activities, has ${activitiesInStage}.`, triggeredByUser: context.triggeredByUser
                            });
                        } catch (_) {}

                        return {
                            stageChanged: false,
                            newStage: rule.newStage,
                            ruleId: rule.id,
                            notification: `Stability Lock: Cannot downgrade to ${rule.newStage}. Required activities in ${currentStage}: ${lock.minActivities} (You have ${activitiesInStage}).`
                        };
                    }
                }
            }
        }
    } catch (error) {
        console.error('[StageEngine] Sequence/Stability Gate error:', error);
    }

    // Step 4: Execute transition
    const result = await executeTransition(leadId, rule.newStage, {
        triggeredBy: 'activity',
        activityId: context.activityId,
        activityType,
        outcome,
        reason,
        triggeredByUser: context.triggeredByUser,
        stageFormData,
        visitedProperties: context.visitedProperties || []
    });

    // Post-Transition: Add AI Intelligence & Notifications
    const nextAction = getNextActionSuggestion(rule.newStage);
    
    try {
        const { createNotification } = await import('../../controllers/notification.controller.js');
        await createNotification(
            context.triggeredByUser,
            'stageChanges',
            '🚀 Stage Transition Successful',
            `Lead moved to "${rule.newStage}". AI Suggestion: ${nextAction}`,
            `/leads/${leadId}`
        );
    } catch (_) {}

    return {
        stageChanged: result.success && !result.skipped,
        skipped: result.skipped || false,
        prevStage: result.prevStage,
        newStage: result.newStage,
        requiredForms,
        missingForms: [],
        missingFields: [],
        ruleId: rule.id,
        aiSuggestion: nextAction,
        playbookLink: `/playbook/${rule.newStage.toLowerCase()}`
    };
};

// End of file cleanup

export default { resolveTransition, evaluateAndTransition, executeTransition, loadTransitionRules, validateRequiredFields };
