/**
 * Stage Computation Engine v2
 *
 * Computes the stage of a lead/deal based on:
 * 1. Explicit override rules (stageMappingRules) — checked first, ordered by priority
 * 2. Default outcome.stage inside activityMasterFields hierarchy
 * 3. Fallback to 'New'
 *
 * IMPORTANT: Stages are computed, never manually edited.
 *
 * v2 Additions:
 * - Probability Calibration per stage
 * - Stage Stability Lock (prevent false regressions)
 */

// ─── STAGE PIPELINE ───────────────────────────────────────────────────────────
export const STAGE_PIPELINE = [
    {
        id: 'incoming',
        label: 'Incoming',
        subStages: ['Incoming', 'Incoming', 'Inbound'],
        isTerminal: false,
        bucket: 'fresh',
        probability: 10,
        color: '#8b5cf6',
        icon: 'fa-inbox'
    },
    {
        id: 'prospect',
        label: 'Prospect',
        subStages: ['Prospect', 'Prospect', 'Warm'],
        isTerminal: false,
        bucket: 'prospect',
        probability: 20,
        color: '#3b82f6',
        icon: 'fa-user'
    },
    {
        id: 'opportunity',
        label: 'Opportunity',
        subStages: ['Opportunity', 'Hot', 'Quote'],
        isTerminal: false,
        bucket: 'opportunity',
        probability: 40,
        color: '#f59e0b',
        icon: 'fa-star'
    },
    {
        id: 'negotiation',
        label: 'Negotiation',
        subStages: ['Negotiation', 'Negotiation', 'Under Review'],
        isTerminal: false,
        bucket: 'negotiation',
        probability: 65,
        color: '#eab308',
        icon: 'fa-handshake'
    },
    {
        id: 'closed_won',
        label: 'Closed (Won)',
        subStages: [],
        isTerminal: true,
        bucket: 'closed',
        probability: 100,
        color: '#10b981',
        icon: 'fa-check-circle'
    },
    {
        id: 'closed_lost',
        label: 'Closed (Lost)',
        subStages: [],
        isTerminal: true,
        bucket: 'closed',
        probability: 0,
        color: '#ef4444',
        icon: 'fa-times-circle'
    },
    {
        id: 'closed_unqualified',
        label: 'Closed (Unqualified)',
        subStages: [],
        isTerminal: true,
        bucket: 'closed',
        probability: 0,
        color: '#6b7280',
        icon: 'fa-ban'
    }
];

export const STAGE_ORDER = STAGE_PIPELINE.map(s => s.id);
export const STAGE_LABELS = STAGE_PIPELINE.map(s => s.label);

// ─── IMPROVEMENT 2: PROBABILITY CALIBRATION ───────────────────────────────────
/**
 * Get win probability % for any stage.
 * Used in forecast: weighted pipeline value = dealValue × (probability / 100)
 */
export const getStageProbability = (stageName) => {
    const stage = STAGE_PIPELINE.find(s => s.label.toLowerCase() === (stageName || '').toLowerCase());
    return stage?.probability ?? 5;
};

// ─── IMPROVEMENT 1: STAGE STABILITY LOCK ──────────────────────────────────────
/**
 * Minimum activities required in the current stage before a downgrade is allowed.
 * Prevents false regressions (e.g., a re-intro call moving Negotiation → Prospect).
 */
export const STAGE_STABILITY_CONFIG = {
    Opportunity: { minActivities: 1, minDays: 0, label: 'Opportunity requires 1 activity before downgrade' },
    Negotiation: { minActivities: 1, minDays: 0, label: 'Negotiation requires 1 activity before downgrade' },
    'Closed (Won)': { minActivities: 999, minDays: 999, label: 'Closed deals cannot be downgraded automatically' },
    'Closed (Lost)': { minActivities: 999, minDays: 999, label: 'Closed deals cannot be downgraded automatically' },
    'Closed (Unqualified)': { minActivities: 999, minDays: 999, label: 'Closed deals cannot be downgraded automatically' }
};

// Stage priority order (higher index = more advanced stage)
// 'Closed Lost' is the lowest terminal.
// We use the exported STAGE_ORDER.

/** Returns true for terminal/sideways states that cannot be further downgraded. */
export const isTerminalStage = (stageName) =>
    stageName?.startsWith('Closed');

const getStageRank = (stageName) => {
    const idx = STAGE_ORDER.indexOf(stageName?.toLowerCase());
    return idx === -1 ? 1 : idx; // default to 1 if unknown
};

/**
 * Validate whether a stage transition (possible downgrade) is allowed.
 *
 * @param {string} currentStage  - current lead stage e.g. 'Negotiation'
 * @param {string} newStage      - proposed new stage e.g. 'Prospect'
 * @param {number} activitiesInCurrentStage - count of activities logged since last stage change
 * @param {number} daysInCurrentStage - days since last stage change
 * @param {Object} config - STAGE_STABILITY_CONFIG or custom override
 * @returns {{ allowed: boolean, reason: string }}
 */
export const validateStageTransition = (
    currentStage,
    newStage,
    activitiesInCurrentStage = 0,
    daysInCurrentStage = 0,
    config = STAGE_STABILITY_CONFIG
) => {
    const currentRank = getStageRank(currentStage);
    const newRank = getStageRank(newStage);

    // Upgrade always allowed (or moving out of a terminal/stalled state = recovery, always allowed)
    if (newRank >= currentRank) return { allowed: true, reason: 'Upgrade — no lock check needed' };
    if (isTerminalStage(currentStage)) return { allowed: true, reason: 'Recovery from terminal/stalled state — always allowed' };

    // Downgrade check
    const lock = config[currentStage];
    if (!lock) return { allowed: true, reason: 'No stability lock configured for this stage' };

    if (activitiesInCurrentStage < lock.minActivities) {
        return {
            allowed: false,
            reason: `Stage locked: ${lock.label}. Current activities: ${activitiesInCurrentStage}, required: ${lock.minActivities}.`
        };
    }

    if (daysInCurrentStage < lock.minDays) {
        return {
            allowed: false,
            reason: `Stage locked: Minimum ${lock.minDays} day(s) required in ${currentStage}. Current: ${daysInCurrentStage}.`
        };
    }

    return { allowed: true, reason: 'Stability check passed' };
};

// ─── CORE STAGE COMPUTATION ───────────────────────────────────────────────────
/**
 * Compute stage from activity metadata.
 *
 * @param {string} activityType   - e.g. 'Call', 'Meeting', 'Site Visit'
 * @param {string} purpose        - e.g. 'Introduction / First Contact'
 * @param {string} outcome        - e.g. 'Connected'
 * @param {Array}  stageMappingRules - explicit override rules from admin config
 * @param {Object} activityMasterFields - the activity master config { activities: [...] }
 * @returns {string} computed stage label
 */
export const computeStage = (activityType, purpose, outcome, stageMappingRules = [], activityMasterFields = {}) => {
    const actLower = (activityType || '').toLowerCase();
    const purpLower = (purpose || '').toLowerCase();
    const outLower = (outcome || '').toLowerCase();

    let computedStage = null; // No fallback — stay in current stage if no rule matches
    let requiredForms = []; // ← array (was single string)

    // 1. Check explicit override rules (ordered by priority ascending)
    const sortedRules = [...stageMappingRules]
        .filter(r => r.isActive)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Highest priority first (matching backend)

    for (const rule of sortedRules) {
        const typeMatch = !rule.activityType || rule.activityType === '*' || rule.activityType.toLowerCase() === actLower;
        const purpMatch = !rule.purpose || rule.purpose === '*' || rule.purpose.toLowerCase() === purpLower;
        const outcMatch = !rule.outcome || rule.outcome === '*' || rule.outcome.toLowerCase() === outLower;
        if (typeMatch && purpMatch && outcMatch) {
            computedStage = rule.stage;
            // Support both old single requiredForm and new requiredForms[]
            requiredForms = Array.isArray(rule.requiredForms)
                ? rule.requiredForms
                : (rule.requiredForm ? [rule.requiredForm] : []);
            return { stage: computedStage, requiredForms };
        }
    }

    // 2. Fall back to outcome.stage in activityMasterFields
    const activities = activityMasterFields?.activities || [];
    const act = activities.find(a => (a.name || '').toLowerCase() === actLower);
    if (act) {
        const purp = act.purposes?.find(p => (p.name || '').toLowerCase() === purpLower);
        if (purp) {
            const out = purp.outcomes?.find(o => (o.label || '').toLowerCase() === outLower);
            if (out?.stage) {
                computedStage = out.stage;
                requiredForms = Array.isArray(out.requiredForms)
                    ? out.requiredForms
                    : (out.requiredForm ? [out.requiredForm] : []);
                return { stage: computedStage, requiredForms };
            }
        }
    }

    // 3. Fallback
    return { stage: null, requiredForms: [] };
};

/**
 * STAGE_MAP — Enterprise Real Estate CRM
 * Source of truth for all outcome → stage mappings.
 * Key: "ActivityType|Purpose|OutcomeLabel"
 * Merged at render time — overrides stale localStorage/DB cache.
 */
export const STAGE_MAP = {
    // ─── CALL: Introduction / First Contact ────────────────────────────────
    'Call|Introduction / First Contact|Connected':                     'Prospect',
    'Call|Introduction / First Contact|Not Reachable':                 'Incoming',
    'Call|Introduction / First Contact|Wrong Number':                  'Incoming',
    'Call|Introduction / First Contact|Callback Requested':            'Prospect',
    'Call|Introduction / First Contact|Busy':                          'Prospect',

    // ─── CALL: Requirement Gathering ───────────────────────────────────────
    'Call|Requirement Gathering|Requirements Shared':                  'Prospect',
    'Call|Requirement Gathering|Partial Info':                         'Prospect',
    'Call|Requirement Gathering|Refused to Share':                     'Incoming',
    'Call|Requirement Gathering|Rescheduled':                          'Prospect',

    // ─── CALL: Follow-up ───────────────────────────────────────────────────
    'Call|Follow-up|Still Interested':                                 'Prospect',
    'Call|Follow-up|Ready for Visit':                                  'Opportunity',
    'Call|Follow-up|Negotiation Mode':                                 'Negotiation',
    'Call|Follow-up|Lost Interest':                                    'Closed (Lost)',
    'Call|Follow-up|No Response':                                      'Closed (Lost)',

    // ─── CALL: Negotiation ─────────────────────────────────────────────────
    'Call|Negotiation|Offer Accepted':                                 'Negotiation',
    'Call|Negotiation|Offer Rejected':                                 'Negotiation',
    'Call|Negotiation|Counter Offer Made':                             'Negotiation',
    'Call|Negotiation|Decision Pending':                               'Negotiation',

    // ─── CALL: Post-Visit Feedback ─────────────────────────────────────────
    'Call|Post-Visit Feedback|Liked Property':                         'Opportunity',
    'Call|Post-Visit Feedback|Disliked - Price':                       'Negotiation',
    'Call|Post-Visit Feedback|Disliked - Location':                    'Prospect',
    'Call|Post-Visit Feedback|Thinking / Hold':                        'Opportunity',
    'Call|Post-Visit Feedback|Booking Request':                        'Negotiation',

    // ─── CALL: Payment Reminder ────────────────────────────────────────────
    'Call|Payment Reminder|Payment Promised':                          'Negotiation',
    'Call|Payment Reminder|Already Paid':                              'Negotiation',
    'Call|Payment Reminder|Dispute':                                   'Negotiation',
    'Call|Payment Reminder|Extension Requested':                       'Negotiation',

    // ─── CALL: Site Visit Confirmation Call ────────────────────────────────
    'Call|Site Visit Confirmation Call|Confirmed – Will Come':         'Opportunity',
    'Call|Site Visit Confirmation Call|Rescheduled to New Date':       'Opportunity',
    'Call|Site Visit Confirmation Call|Cancelled – No Reason':         'Prospect',
    'Call|Site Visit Confirmation Call|Cancelled – Going to Competitor': 'Closed (Lost)',
    'Call|Site Visit Confirmation Call|Not Reachable':                 'Prospect',
    'Call|Site Visit Confirmation Call|Coming with Family Now':        'Opportunity',

    // ─── CALL: Loan / Finance Discussion Call ──────────────────────────────
    'Call|Loan / Finance Discussion Call|Self-Funded / Cash Ready':    'Negotiation',
    'Call|Loan / Finance Discussion Call|Loan Pre-approved':           'Opportunity',
    'Call|Loan / Finance Discussion Call|Loan Applied – Awaiting Approval': 'Opportunity',
    'Call|Loan / Finance Discussion Call|Needs Loan Assistance from Us': 'Prospect',
    'Call|Loan / Finance Discussion Call|Cannot Arrange Finance':      'Closed (Lost)',
    'Call|Loan / Finance Discussion Call|Selling Existing Property First': 'Closed (Lost)',
    'Call|Loan / Finance Discussion Call|EMI Affordable – Wants Calculator': 'Prospect',

    // ─── CALL: CP / Channel Partner Coordination Call ──────────────────────
    'Call|CP / Channel Partner Coordination Call|CP Confirmed Visit for Client': 'Opportunity',
    'Call|CP / Channel Partner Coordination Call|CP Needs More Inventory Options': 'Prospect',
    'Call|CP / Channel Partner Coordination Call|Commission Dispute':  'Prospect',
    'Call|CP / Channel Partner Coordination Call|CP Submitted New Leads': 'Incoming',
    'Call|CP / Channel Partner Coordination Call|CP Dropped the Deal': 'Prospect',
    'Call|CP / Channel Partner Coordination Call|CP Redirecting to Another Project': 'Prospect',

    // ─── CALL: Token / Booking Confirmation Call ───────────────────────────
    'Call|Token / Booking Confirmation Call|Token Amount Confirmed':   'Negotiation',
    'Call|Token / Booking Confirmation Call|Cheque Ready – Date Confirmed': 'Negotiation',
    'Call|Token / Booking Confirmation Call|Transfer in Process':      'Negotiation',
    'Call|Token / Booking Confirmation Call|Backing Out':              'Closed (Lost)',
    'Call|Token / Booking Confirmation Call|Wants Agreement First':    'Negotiation',
    'Call|Token / Booking Confirmation Call|Price Renegotiation Before Token': 'Negotiation',

    // ─── CALL: Owner / Landlord Call ───────────────────────────────────────
    'Call|Owner / Landlord Call|Owner Agreed to Price':                'Negotiation',
    'Call|Owner / Landlord Call|Owner Reduced Price':                  'Negotiation',
    'Call|Owner / Landlord Call|Owner Not Selling':                    'Closed (Lost)',
    'Call|Owner / Landlord Call|Property Still Available':             'Opportunity',
    'Call|Owner / Landlord Call|Owner Wants 15 Days to Decide':        'Negotiation',
    'Call|Owner / Landlord Call|Owner Wants All-Cash Payment Only':    'Negotiation',
    'Call|Owner / Landlord Call|Owner Ready for Token':                'Negotiation',

    // ─── CALL: Agreement / Registry Reminder Call ──────────────────────────
    'Call|Agreement / Registry Reminder Call|Agreement Date Fixed':    'Negotiation',
    'Call|Agreement / Registry Reminder Call|Client Delaying Signing': 'Negotiation',
    'Call|Agreement / Registry Reminder Call|Documents Ready':         'Negotiation',
    'Call|Agreement / Registry Reminder Call|Lawyer Query from Client': 'Negotiation',
    'Call|Agreement / Registry Reminder Call|Cancellation Requested':  'Closed (Lost)',
    'Call|Agreement / Registry Reminder Call|Re-negotiation on Terms': 'Negotiation',

    // ─── CALL: Cold / Database Call ────────────────────────────────────────
    'Call|Cold / Database Call|Interested – Wants Details':            'Prospect',
    'Call|Cold / Database Call|Call Back Later':                       'Incoming',
    'Call|Cold / Database Call|Do Not Call':                           'Closed (Lost)',
    'Call|Cold / Database Call|Wants WhatsApp Instead':                'Incoming',
    'Call|Cold / Database Call|Already Bought Elsewhere':              'Closed (Lost)',
    'Call|Cold / Database Call|Can Refer Someone':                     'Prospect',

    // ─── CALL: Existing Customer / Referral Call ───────────────────────────
    'Call|Existing Customer / Referral Call|Referral Name Shared':     'Incoming',
    'Call|Existing Customer / Referral Call|Interested in Another Unit': 'Prospect',
    'Call|Existing Customer / Referral Call|Not Happy – Complaint':    'Incoming',
    'Call|Existing Customer / Referral Call|Positive Feedback Given':  'Prospect',
    'Call|Existing Customer / Referral Call|Wants to Rent Out Property': 'Prospect',

    // ─── EMAIL: Project Brochure / E-Catalogue Send ────────────────────────
    'Email|Project Brochure / E-Catalogue Send|Opened + Clicked':      'Prospect',
    'Email|Project Brochure / E-Catalogue Send|Opened – No Response':  'Incoming',
    'Email|Project Brochure / E-Catalogue Send|Delivered – Not Opened': 'Incoming',
    'Email|Project Brochure / E-Catalogue Send|Bounced':               'Incoming',
    'Email|Project Brochure / E-Catalogue Send|Replied with Query':    'Prospect',
    'Email|Project Brochure / E-Catalogue Send|Forwarded to Family':   'Opportunity',

    // ─── EMAIL: Floor Plan / Site Map Share ────────────────────────────────
    'Email|Floor Plan / Site Map Share|Replied – Interested in Unit':  'Opportunity',
    'Email|Floor Plan / Site Map Share|Replied – Wants Different Floor': 'Opportunity',
    'Email|Floor Plan / Site Map Share|Opened – No Action':            'Prospect',
    'Email|Floor Plan / Site Map Share|Too Expensive per Reply':        'Negotiation',
    'Email|Floor Plan / Site Map Share|Shared Plan with Family':        'Opportunity',

    // ─── EMAIL: Quotation / Price Sheet Send ───────────────────────────────
    'Email|Quotation / Price Sheet Send|Accepted Price – Wants to Meet': 'Negotiation',
    'Email|Quotation / Price Sheet Send|Counter-Offered in Reply':     'Negotiation',
    'Email|Quotation / Price Sheet Send|Too High – Replied Negatively': 'Negotiation',
    'Email|Quotation / Price Sheet Send|No Response After Price':       'Closed (Lost)',
    'Email|Quotation / Price Sheet Send|Wants Legal Charges Clarification': 'Negotiation',

    // ─── EMAIL: Legal Document / Agreement Send ────────────────────────────
    'Email|Legal Document / Agreement Send|Signed – Returned via Email': 'Closed (Won)',
    'Email|Legal Document / Agreement Send|Lawyer Reviewing':          'Negotiation',
    'Email|Legal Document / Agreement Send|Queries Raised':            'Negotiation',
    'Email|Legal Document / Agreement Send|Rejected Agreement Terms':  'Negotiation',
    'Email|Legal Document / Agreement Send|Requesting Amendments':     'Negotiation',

    // ─── EMAIL: Welcome / Thank You Email ──────────────────────────────────
    'Email|Welcome / Thank You Email|Replied Positively':              'Closed (Won)',
    'Email|Welcome / Thank You Email|Referred New Lead':               'Closed (Won)',
    'Email|Welcome / Thank You Email|Raised Post-Booking Concern':     'Negotiation',

    // ─── EMAIL: Festival / Offer Campaign Email ────────────────────────────
    'Email|Festival / Offer Campaign Email|Replied – Wants to Visit Now': 'Opportunity',
    'Email|Festival / Offer Campaign Email|Called Back After Email':   'Prospect',
    'Email|Festival / Offer Campaign Email|Opened – No Action':        'Incoming',
    'Email|Festival / Offer Campaign Email|Unsubscribed':              'Closed (Lost)',

    // ─── EMAIL: Payment Due Reminder ───────────────────────────────────────
    'Email|Payment Due Reminder|Payment Confirmed Reply':              'Negotiation',
    'Email|Payment Due Reminder|10 Day Extension Requested':           'Negotiation',
    'Email|Payment Due Reminder|Dispute on Amount':                    'Negotiation',
    'Email|Payment Due Reminder|No Response':                          'Negotiation',

    // ─── SITE VISIT: First Visit (Solo) ────────────────────────────────────
    'Site Visit|First Visit (Solo)|Very Interested':                   'Opportunity',
    'Site Visit|First Visit (Solo)|Somewhat Interested':               'Opportunity',
    'Site Visit|First Visit (Solo)|Not Interested':                    'Closed (Lost)',
    'Site Visit|First Visit (Solo)|Price Issue':                       'Negotiation',

    // ─── SITE VISIT: Re-Visit (With Family) ────────────────────────────────
    'Site Visit|Re-Visit (With Family)|Shortlisted':                   'Opportunity',
    'Site Visit|Re-Visit (With Family)|Family Liked':                  'Opportunity',
    'Site Visit|Re-Visit (With Family)|Family Disliked':               'Opportunity',
    'Site Visit|Re-Visit (With Family)|Need Consensus':                'Opportunity',

    // ─── SITE VISIT: Unit Selection ────────────────────────────────────────
    'Site Visit|Unit Selection|Unit Blocked':                          'Negotiation',
    'Site Visit|Unit Selection|Unit Not Available':                    'Opportunity',
    'Site Visit|Unit Selection|Changed Preference':                    'Opportunity',
    'Site Visit|Unit Selection|Thinking':                              'Opportunity',

    // ─── SITE VISIT: Competitor Comparison ─────────────────────────────────
    'Site Visit|Competitor Comparison|Favors Us':                      'Opportunity',
    'Site Visit|Competitor Comparison|Favors Competitor':              'Incoming',
    'Site Visit|Competitor Comparison|Undecided':                      'Prospect',

    // ─── SITE VISIT: Virtual Tour / Video Call Visit ───────────────────────
    'Site Visit|Virtual Tour / Video Call Visit|Liked – Wants Physical Visit Now': 'Opportunity',
    'Site Visit|Virtual Tour / Video Call Visit|Needs More Areas Shown': 'Prospect',
    'Site Visit|Virtual Tour / Video Call Visit|Not Convinced – Wants In-Person': 'Prospect',
    'Site Visit|Virtual Tour / Video Call Visit|Wants Visit Recording': 'Prospect',
    'Site Visit|Virtual Tour / Video Call Visit|Lost Interest After Tour': 'Prospect',

    // ─── SITE VISIT: Developer / Builder Showroom Visit ────────────────────
    'Site Visit|Developer / Builder Showroom Visit|Very Impressed with Sample Flat': 'Opportunity',
    'Site Visit|Developer / Builder Showroom Visit|Liked Amenities – Price Concern': 'Negotiation',
    'Site Visit|Developer / Builder Showroom Visit|Wants Second Visit with Spouse': 'Opportunity',
    'Site Visit|Developer / Builder Showroom Visit|Project Looks Incomplete / Delay Fear': 'Prospect',
    'Site Visit|Developer / Builder Showroom Visit|Requested Legal Documents': 'Negotiation',
    'Site Visit|Developer / Builder Showroom Visit|Ready to Block Unit Today': 'Negotiation',

    // ─── SITE VISIT: Construction Site Visit ───────────────────────────────
    'Site Visit|Construction Site Visit|Satisfied with Progress':      'Opportunity',
    'Site Visit|Construction Site Visit|Concerns about Delivery Timeline': 'Prospect',
    'Site Visit|Construction Site Visit|Appreciated Build Quality':    'Opportunity',
    'Site Visit|Construction Site Visit|Poor Site Condition – Concerned': 'Prospect',
    'Site Visit|Construction Site Visit|Wants to Visit Again in 3 Months': 'Prospect',

    // ─── SITE VISIT: Possession / Ready-to-Move Visit ──────────────────────
    'Site Visit|Possession / Ready-to-Move Visit|Fully Satisfied – Ready to Register': 'Negotiation',
    'Site Visit|Possession / Ready-to-Move Visit|Minor Snags – Acceptable': 'Negotiation',
    'Site Visit|Possession / Ready-to-Move Visit|Major Issues – Needs Fixing First': 'Negotiation',
    'Site Visit|Possession / Ready-to-Move Visit|Not Satisfied – Withdrawing': 'Closed (Lost)',
    'Site Visit|Possession / Ready-to-Move Visit|Snagging List Submitted': 'Negotiation',

    // ─── SITE VISIT: Neighborhood / Locality Tour ──────────────────────────
    'Site Visit|Neighborhood / Locality Tour|Loved the Locality':      'Opportunity',
    'Site Visit|Neighborhood / Locality Tour|Connectivity Issues Concern': 'Prospect',
    'Site Visit|Neighborhood / Locality Tour|School / Hospital Proximity Liked': 'Opportunity',
    'Site Visit|Neighborhood / Locality Tour|Area Not Suitable':        'Prospect',
    'Site Visit|Neighborhood / Locality Tour|Wants to Compare with Another Area': 'Prospect',

    // ─── SITE VISIT: Resale Property Inspection ────────────────────────────
    'Site Visit|Resale Property Inspection|Ready to Make an Offer':    'Negotiation',
    'Site Visit|Resale Property Inspection|Price Negotiation After Inspection': 'Negotiation',
    "Site Visit|Resale Property Inspection|Renovation Required – Considering": 'Prospect',
    "Site Visit|Resale Property Inspection|Property Doesn't Match Description": 'Prospect',
    'Site Visit|Resale Property Inspection|Owner Possessive / Not Flexible': 'Negotiation',
    'Site Visit|Resale Property Inspection|Title / Legal Check Requested': 'Negotiation',

    // ─── SITE VISIT: Pre-Launch / Soft Launch Visit ────────────────────────
    'Site Visit|Pre-Launch / Soft Launch Visit|Booked at Pre-Launch Price': 'Negotiation',
    'Site Visit|Pre-Launch / Soft Launch Visit|Interested – Will Decide at Launch': 'Opportunity',
    'Site Visit|Pre-Launch / Soft Launch Visit|Price Already High at Pre-Launch': 'Prospect',
    'Site Visit|Pre-Launch / Soft Launch Visit|Bringing Investor Friends': 'Prospect',

    // ─── MEETING: Initial Consultation ─────────────────────────────────────
    'Meeting|Initial Consultation|Qualified':                          'Prospect',
    'Meeting|Initial Consultation|Need More Time':                     'Prospect',
    'Meeting|Initial Consultation|Not Qualified':                      'Closed (Lost)',
    'Meeting|Initial Consultation|Rescheduled':                        'Prospect',

    // ─── MEETING: Project Presentation ─────────────────────────────────────
    'Meeting|Project Presentation|Impressed':                          'Opportunity',
    'Meeting|Project Presentation|Neutral':                            'Prospect',
    'Meeting|Project Presentation|Skeptical':                          'Prospect',
    'Meeting|Project Presentation|Requested Site Visit':               'Opportunity',

    // ─── MEETING: Price Negotiation ────────────────────────────────────────
    'Meeting|Price Negotiation|Deal Closed':                           'Negotiation',
    'Meeting|Price Negotiation|Stalemate':                             'Negotiation',
    'Meeting|Price Negotiation|Discount Approved':                     'Negotiation',
    'Meeting|Price Negotiation|Walk-away':                             'Closed (Lost)',

    // ─── MEETING: Document Collection ──────────────────────────────────────
    'Meeting|Document Collection|All Collected':                       'Negotiation',
    'Meeting|Document Collection|Partial':                             'Negotiation',
    'Meeting|Document Collection|Pending':                             'Negotiation',
    'Meeting|Document Collection|Issues Found':                        'Negotiation',

    // ─── MEETING: Final Closing ─────────────────────────────────────────────
    'Meeting|Final Closing|Signed':                                    'Closed (Won)',
    'Meeting|Final Closing|Reviewing Draft':                           'Negotiation',
    'Meeting|Final Closing|Postponed':                                 'Negotiation',
    'Meeting|Final Closing|Cancelled':                                 'Closed (Lost)',

    // ─── MEETING: Token / Booking Meeting ──────────────────────────────────
    'Meeting|Token / Booking Meeting|Token Received – Deal Locked':    'Negotiation',
    'Meeting|Token / Booking Meeting|Cheque Given – Clearing Pending': 'Negotiation',
    'Meeting|Token / Booking Meeting|Part Token Only':                 'Negotiation',
    'Meeting|Token / Booking Meeting|Changed Mind at Last Minute':     'Negotiation',
    'Meeting|Token / Booking Meeting|Token Tomorrow – Confirmed':      'Negotiation',

    // ─── MEETING: Agreement Signing Meeting ────────────────────────────────
    'Meeting|Agreement Signing Meeting|Agreement Signed':              'Closed (Won)',
    'Meeting|Agreement Signing Meeting|Co-Applicant Signature Pending': 'Negotiation',
    'Meeting|Agreement Signing Meeting|Legal Clause Dispute':          'Negotiation',
    'Meeting|Agreement Signing Meeting|Refused to Sign':               'Negotiation',
    'Meeting|Agreement Signing Meeting|Stamp Duty Discussion':         'Negotiation',

    // ─── MEETING: Home Loan / Bank Coordination Meeting ────────────────────
    'Meeting|Home Loan / Bank Coordination Meeting|Loan Sanctioned':   'Negotiation',
    'Meeting|Home Loan / Bank Coordination Meeting|Documents Submitted to Bank': 'Negotiation',
    'Meeting|Home Loan / Bank Coordination Meeting|Loan Rejected':     'Negotiation',
    'Meeting|Home Loan / Bank Coordination Meeting|In-Principle Approval Done': 'Negotiation',
    'Meeting|Home Loan / Bank Coordination Meeting|Awaiting CIBIL Check': 'Negotiation',
    'Meeting|Home Loan / Bank Coordination Meeting|Trying Another Bank': 'Negotiation',

    // ─── MEETING: Investor / Bulk Deal Meeting ─────────────────────────────
    'Meeting|Investor / Bulk Deal Meeting|Multi-Unit Deal Agreed':     'Negotiation',
    'Meeting|Investor / Bulk Deal Meeting|Wants Detailed ROI Sheet':   'Opportunity',
    'Meeting|Investor / Bulk Deal Meeting|Shortlisted 3 Units – Decision Pending': 'Negotiation',
    'Meeting|Investor / Bulk Deal Meeting|ROI Not Satisfactory':        'Prospect',
    'Meeting|Investor / Bulk Deal Meeting|Will Bring CA / Advisor Next Time': 'Opportunity',
    'Meeting|Investor / Bulk Deal Meeting|Wants Exclusive Pre-Launch Price': 'Opportunity',

    // ─── MEETING: Vastu / Architecture Consultation ────────────────────────
    'Meeting|Vastu / Architecture Consultation Meeting|Vastu Expert Approved Property': 'Opportunity',
    'Meeting|Vastu / Architecture Consultation Meeting|Vastu Expert Rejected – Client Listening': 'Prospect',
    'Meeting|Vastu / Architecture Consultation Meeting|Another Unit Requested (Vastu Complaint)': 'Opportunity',
    'Meeting|Vastu / Architecture Consultation Meeting|Modifications Feasible per Architect': 'Opportunity',

    // ─── MEETING: NRI Client Meeting ───────────────────────────────────────
    'Meeting|NRI Client Meeting|Booking Confirmed – POA Given':        'Negotiation',
    'Meeting|NRI Client Meeting|POA Authority Setup in Progress':      'Negotiation',
    'Meeting|NRI Client Meeting|Comparing 3 Projects – India Trip Limited': 'Opportunity',
    'Meeting|NRI Client Meeting|Wants USD-equivalent Pricing':         'Negotiation',
    'Meeting|NRI Client Meeting|Decision at Next India Trip':          'Prospect',
    'Meeting|NRI Client Meeting|Investing in Dubai Instead':           'Closed (Lost)',

    // ─── MEETING: Post-Complaint Resolution Meeting ────────────────────────
    'Meeting|Post-Complaint Resolution Meeting|Issue Resolved – Client Happy': 'Negotiation',
    'Meeting|Post-Complaint Resolution Meeting|Client Still Angry – Threat of Legal': 'Negotiation',
    'Meeting|Post-Complaint Resolution Meeting|Compensation Agreed':   'Negotiation',
    'Meeting|Post-Complaint Resolution Meeting|Client Cancelling Deal': 'Closed (Lost)',
    'Meeting|Post-Complaint Resolution Meeting|Referral Despite Complaint': 'Prospect',

    // ─── MEETING: Channel Partner / Broker Meeting ─────────────────────────
    'Meeting|Channel Partner / Broker Meeting|CP Committed to Push Project': 'Prospect',
    'Meeting|Channel Partner / Broker Meeting|Co-Brokerage Agreement Signed': 'Prospect',
    'Meeting|Channel Partner / Broker Meeting|CP Already Tied with Competitor': 'Incoming',
    'Meeting|Channel Partner / Broker Meeting|CP Brought 3 Leads Same Day': 'Prospect',
    'Meeting|Channel Partner / Broker Meeting|Commission Rate Negotiated': 'Prospect',

    // ─── TASK: Document Preparation ────────────────────────────────────────
    'Task|Document Preparation|All Documents Ready':                   'Negotiation',
    'Task|Document Preparation|Partial – 2 More Pending':              'Negotiation',
    'Task|Document Preparation|Client Not Sharing':                    'Negotiation',
    'Task|Document Preparation|Documents Sent for Verification':       'Negotiation',

    // ─── TASK: Legal / Title Verification ──────────────────────────────────
    'Task|Legal / Title Verification|Title Clear':                     'Negotiation',
    'Task|Legal / Title Verification|Minor Encumbrance – Resolvable':  'Negotiation',
    'Task|Legal / Title Verification|Title Dispute Found':             'Closed (Lost)',
    'Task|Legal / Title Verification|Additional Documents Requested from Owner': 'Negotiation',

    // ─── TASK: Loan File Processing ────────────────────────────────────────
    'Task|Loan File Processing|File Submitted':                        'Negotiation',
    'Task|Loan File Processing|Sanction Letter Received':              'Negotiation',
    'Task|Loan File Processing|File Rejected – Reapplication':         'Negotiation',
    'Task|Loan File Processing|Additional Documents Requested by Bank': 'Negotiation',

    // ─── TASK: Inventory Blocking / Holding ────────────────────────────────
    'Task|Inventory Blocking / Holding|Unit Blocked Successfully':     'Negotiation',
    'Task|Inventory Blocking / Holding|Unit Available to Others – Token Not Paid': 'Opportunity',
    'Task|Inventory Blocking / Holding|Extension Given for 48 Hours':  'Negotiation',
    'Task|Inventory Blocking / Holding|Unit Released – Client Not Committed': 'Opportunity',

    // ─── TASK: Agreement Draft Preparation ─────────────────────────────────
    'Task|Agreement Draft Preparation|Draft Ready – Sent to Client':   'Negotiation',
    'Task|Agreement Draft Preparation|Client Requested Changes':       'Negotiation',
    'Task|Agreement Draft Preparation|Legal Issue in Draft':           'Negotiation',
    'Task|Agreement Draft Preparation|Final Version Approved':         'Negotiation',

    // ─── TASK: Stamp Duty / Registration Coordination ──────────────────────
    'Task|Stamp Duty / Registration Coordination|Registration Date Confirmed': 'Negotiation',
    'Task|Stamp Duty / Registration Coordination|Awaiting State Limit Slots': 'Negotiation',
    'Task|Stamp Duty / Registration Coordination|Stamp Duty Paid':     'Negotiation',
    'Task|Stamp Duty / Registration Coordination|Client Postponing Registry': 'Negotiation',
    'Task|Stamp Duty / Registration Coordination|Registration Completed': 'Closed (Won)',

    // ─── TASK: CRM Data / Reporting Task ───────────────────────────────────
    'Task|CRM Data / Reporting Task|Completed On-Time':                'Prospect',
    'Task|CRM Data / Reporting Task|Delayed':                          'Prospect',
    'Task|CRM Data / Reporting Task|Incomplete':                       'Prospect',

    // ─── TASK: Follow-up / Reminder Set ────────────────────────────────────
    'Task|Follow-up / Reminder Set|Follow-up Scheduled':              'Prospect',
    'Task|Follow-up / Reminder Set|Not Scheduled':                     'Prospect',

    // ─── TASK: Snag List / Possession Inspection ───────────────────────────
    'Task|Snag List / Possession Inspection Task|Snag List Cleared':   'Negotiation',
    'Task|Snag List / Possession Inspection Task|8+ Issues – Developer Working': 'Negotiation',
    'Task|Snag List / Possession Inspection Task|Major Civil Defects':  'Negotiation',
    'Task|Snag List / Possession Inspection Task|Possession Given':    'Closed (Won)',
};

/**
 * Build a flat list of all outcome mappings from activityMasterFields.
/**
 * REQUIRED_FORMS_MAP — Enterprise Real Estate CRM
 * Key: "ActivityType|Purpose|OutcomeLabel"
 * Value: array of form names required for that outcome
 *
 * This is the SOURCE OF TRUTH for required forms.
 * Even if localStorage/DB is stale, this map is merged at render time.
 */
export const REQUIRED_FORMS_MAP = {
    // ─── CALL ───────────────────────────────────────────────────────────────
    'Call|Requirement Gathering|Requirements Shared':         ['Requirement Form'],
    'Call|Requirement Gathering|Partial Info':                ['Requirement Form'],
    'Call|Requirement Gathering|Refused to Share':            ['Requirement Form'],
    'Call|Requirement Gathering|Rescheduled':                 ['Requirement Form'],
    'Call|Follow-up|Negotiation Mode':                        ['Offer Form'],
    'Call|Follow-up|Ready for Visit':                         ['Site Visit Form'],
    'Call|Negotiation|Offer Accepted':                        ['Booking Form', 'KYC Form'],
    'Call|Negotiation|Offer Rejected':                        ['Offer Form'],
    'Call|Negotiation|Counter Offer Made':                    ['Offer Form'],
    'Call|Negotiation|Decision Pending':                      ['Offer Form'],
    'Call|Post-Visit Feedback|Liked Property':                ['Site Visit Form'],
    'Call|Post-Visit Feedback|Disliked - Price':              ['Quotation Form'],
    'Call|Post-Visit Feedback|Disliked - Location':           ['Site Visit Form'],
    'Call|Post-Visit Feedback|Booking Request':               ['Booking Form', 'KYC Form'],
    'Call|Payment Reminder|Payment Promised':                 ['Booking Form', 'KYC Form'],
    'Call|Payment Reminder|Already Paid':                     ['Booking Form', 'KYC Form'],
    'Call|Payment Reminder|Dispute':                          ['Offer Form'],
    'Call|Payment Reminder|Extension Requested':              ['Booking Form', 'KYC Form'],
    'Call|Token / Booking Confirmation Call|Token Amount Confirmed': ['Booking Form', 'KYC Form'],
    'Call|Token / Booking Confirmation Call|Cheque Ready – Date Confirmed': ['Booking Form', 'KYC Form'],
    'Call|Token / Booking Confirmation Call|Transfer in Process': ['Offer Form'],
    'Call|Token / Booking Confirmation Call|Wants Agreement First': ['Offer Form'],
    'Call|Token / Booking Confirmation Call|Price Renegotiation Before Token': ['Offer Form'],
    'Call|Owner / Landlord Call|Owner Agreed to Price':       ['Offer Form'],
    'Call|Owner / Landlord Call|Owner Reduced Price':         ['Quotation Form'],
    'Call|Owner / Landlord Call|Owner Wants 15 Days to Decide': ['Offer Form'],
    'Call|Owner / Landlord Call|Owner Wants All-Cash Payment Only': ['Offer Form'],
    'Call|Owner / Landlord Call|Owner Ready for Token':       ['Booking Form', 'KYC Form'],
    'Call|Agreement / Registry Reminder Call|Agreement Date Fixed': ['Booking Form', 'KYC Form'],
    'Call|Agreement / Registry Reminder Call|Client Delaying Signing': ['Booking Form', 'KYC Form'],
    'Call|Agreement / Registry Reminder Call|Documents Ready': ['Booking Form', 'KYC Form'],
    'Call|Agreement / Registry Reminder Call|Lawyer Query from Client': ['Booking Form', 'KYC Form'],
    'Call|Agreement / Registry Reminder Call|Re-negotiation on Terms': ['Offer Form'],
    'Call|Loan / Finance Discussion Call|Self-Funded / Cash Ready': ['Booking Form'],
    'Call|Loan / Finance Discussion Call|Loan Pre-approved':  ['Booking Form'],
    'Call|Loan / Finance Discussion Call|Loan Applied – Awaiting Approval': ['Requirement Form'],
    'Call|Loan / Finance Discussion Call|Needs Loan Assistance from Us': ['Requirement Form'],
    'Call|Site Visit Confirmation Call|Confirmed – Will Come': ['Site Visit Form'],
    'Call|Site Visit Confirmation Call|Coming with Family Now': ['Site Visit Form'],

    // ─── EMAIL ──────────────────────────────────────────────────────────────
    'Email|Quotation / Price Sheet Send|Accepted Price – Wants to Meet': ['Quotation Form'],
    'Email|Quotation / Price Sheet Send|Counter-Offered in Reply': ['Offer Form'],
    'Email|Quotation / Price Sheet Send|Too High – Replied Negatively': ['Quotation Form'],
    'Email|Quotation / Price Sheet Send|No Response After Price': ['Quotation Form'],
    'Email|Quotation / Price Sheet Send|Wants Legal Charges Clarification': ['Offer Form'],
    'Email|Legal Document / Agreement Send|Signed – Returned via Email': ['Booking Form', 'KYC Form'],
    'Email|Legal Document / Agreement Send|Lawyer Reviewing': ['Booking Form', 'KYC Form'],
    'Email|Legal Document / Agreement Send|Queries Raised':   ['Offer Form'],
    'Email|Legal Document / Agreement Send|Rejected Agreement Terms': ['Offer Form'],
    'Email|Legal Document / Agreement Send|Requesting Amendments': ['Offer Form'],
    'Email|Welcome / Thank You Email|Raised Post-Booking Concern': ['Booking Form', 'KYC Form'],
    'Email|Payment Due Reminder|Payment Confirmed Reply':     ['Booking Form', 'KYC Form'],
    'Email|Payment Due Reminder|10 Day Extension Requested':  ['Booking Form', 'KYC Form'],
    'Email|Payment Due Reminder|Dispute on Amount':           ['Offer Form'],
    'Email|Payment Due Reminder|No Response':                 ['Booking Form', 'KYC Form'],
    'Email|Floor Plan / Site Map Share|Replied – Interested in Unit': ['Site Visit Form'],
    'Email|Floor Plan / Site Map Share|Too Expensive per Reply': ['Quotation Form'],

    // ─── SITE VISIT ─────────────────────────────────────────────────────────
    'Site Visit|First Visit (Solo)|Very Interested':          ['Site Visit Form'],
    'Site Visit|First Visit (Solo)|Somewhat Interested':      ['Site Visit Form'],
    'Site Visit|First Visit (Solo)|Price Issue':              ['Quotation Form'],
    'Site Visit|First Visit (Solo)|Not Interested':           ['Site Visit Form'],
    'Site Visit|Re-Visit (With Family)|Shortlisted':          ['Site Visit Form'],
    'Site Visit|Re-Visit (With Family)|Family Liked':         ['Site Visit Form'],
    'Site Visit|Re-Visit (With Family)|Family Disliked':      ['Site Visit Form'],
    'Site Visit|Re-Visit (With Family)|Need Consensus':       ['Site Visit Form'],
    'Site Visit|Unit Selection|Unit Blocked':                 ['Booking Form', 'KYC Form'],
    'Site Visit|Unit Selection|Changed Preference':           ['Site Visit Form'],
    'Site Visit|Unit Selection|Thinking':                     ['Site Visit Form'],
    'Site Visit|Competitor Comparison|Favors Us':             ['Site Visit Form'],
    'Site Visit|Virtual Tour / Video Call Visit|Liked – Wants Physical Visit Now': ['Site Visit Form'],
    'Site Visit|Virtual Tour / Video Call Visit|Needs More Areas Shown': ['Site Visit Form'],
    'Site Visit|Developer / Builder Showroom Visit|Very Impressed with Sample Flat': ['Site Visit Form'],
    'Site Visit|Developer / Builder Showroom Visit|Wants Second Visit with Spouse': ['Site Visit Form'],
    'Site Visit|Developer / Builder Showroom Visit|Ready to Block Unit Today': ['Booking Form', 'KYC Form'],
    'Site Visit|Developer / Builder Showroom Visit|Requested Legal Documents': ['Offer Form'],
    'Site Visit|Construction Site Visit|Satisfied with Progress': ['Site Visit Form'],
    'Site Visit|Construction Site Visit|Appreciated Build Quality': ['Site Visit Form'],
    'Site Visit|Possession / Ready-to-Move Visit|Fully Satisfied – Ready to Register': ['Booking Form', 'KYC Form'],
    'Site Visit|Possession / Ready-to-Move Visit|Minor Snags – Acceptable': ['Offer Form'],
    'Site Visit|Possession / Ready-to-Move Visit|Snagging List Submitted': ['Site Visit Form'],
    'Site Visit|Neighborhood / Locality Tour|Loved the Locality': ['Site Visit Form'],
    'Site Visit|Neighborhood / Locality Tour|School / Hospital Proximity Liked': ['Site Visit Form'],
    'Site Visit|Resale Property Inspection|Ready to Make an Offer': ['Offer Form'],
    'Site Visit|Resale Property Inspection|Price Negotiation After Inspection': ['Offer Form'],
    'Site Visit|Resale Property Inspection|Title / Legal Check Requested': ['Offer Form'],
    'Site Visit|Pre-Launch / Soft Launch Visit|Booked at Pre-Launch Price': ['Booking Form', 'KYC Form'],
    'Site Visit|Pre-Launch / Soft Launch Visit|Interested – Will Decide at Launch': ['Site Visit Form'],

    // ─── MEETING ────────────────────────────────────────────────────────────
    'Meeting|Initial Consultation|Qualified':                 ['Requirement Form'],
    'Meeting|Initial Consultation|Need More Time':            ['Requirement Form'],
    'Meeting|Project Presentation|Impressed':                 ['Meetings Form'],
    'Meeting|Project Presentation|Requested Site Visit':      ['Site Visit Form'],
    'Meeting|Price Negotiation|Deal Closed':                  ['Booking Form', 'KYC Form'],
    'Meeting|Price Negotiation|Discount Approved':            ['Offer Form'],
    'Meeting|Price Negotiation|Stalemate':                    ['Offer Form'],
    'Meeting|Price Negotiation|Walk-away':                    ['Offer Form'],
    'Meeting|Document Collection|All Collected':              ['Booking Form', 'KYC Form'],
    'Meeting|Document Collection|Partial':                    ['Booking Form'],
    'Meeting|Closing / Agreement Signing|Agreement Signed':   ['Booking Form', 'KYC Form'],
    'Meeting|Closing / Agreement Signing|Partial Signing':    ['Booking Form'],
    'Meeting|Requirement Deep Dive|Requirements Finalized':   ['Requirement Form'],
    'Meeting|Requirement Deep Dive|Budget Revised':           ['Quotation Form'],

    // ─── TASK ───────────────────────────────────────────────────────────────
    'Task|Document Collection|All Documents Received':        ['Booking Form', 'KYC Form'],
    'Task|Document Collection|Partial – Following Up':        ['Booking Form'],
    'Task|Send Quotation|Quotation Sent':                     ['Quotation Form'],
    'Task|Send Quotation|Revised Quotation Sent':             ['Quotation Form'],
    'Task|Agreement Drafting|Draft Ready for Review':         ['Booking Form'],
    'Task|Agreement Drafting|Agreement Signed':               ['Booking Form', 'KYC Form'],

    // ─── WHATSAPP ───────────────────────────────────────────────────────────
    'WhatsApp|Requirement Collection|Requirements Shared via Chat': ['Requirement Form'],
    'WhatsApp|Brochure / Price Share|Price Accepted – Wants to Visit': ['Site Visit Form'],
    'WhatsApp|Negotiation Chat|Offer Accepted on Chat':       ['Booking Form', 'KYC Form'],
    'WhatsApp|Negotiation Chat|Counter-Offer Sent':           ['Offer Form'],
    'WhatsApp|Booking Confirmation|Payment Screenshot Shared': ['Booking Form', 'KYC Form'],
};

/**
 * Build a flat list of all outcome mappings from activityMasterFields.
 * Used by the Rule Table to display all rows.
 *
 * @returns {Array} [{ activityType, purpose, outcome, stage, score, probability }]
 */
export const flattenOutcomeMappings = (activityMasterFields = {}) => {
    const rows = [];
    const activities = activityMasterFields?.activities || [];
    for (const act of activities) {
        for (const purp of (act.purposes || [])) {
            for (const out of (purp.outcomes || [])) {
                const mapKey = `${act.name}|${purp.name}|${out.label}`;

                // ── Stage: User configuration (out.stage) wins over default STAGE_MAP ──────
                const stageName = out.stage || STAGE_MAP[mapKey] || 'Incoming';

                // ── Forms: REQUIRED_FORMS_MAP merges with stored (same pattern) ─
                const storedForms = Array.isArray(out.requiredForms)
                    ? out.requiredForms
                    : (out.requiredForm ? [out.requiredForm] : []);
                const mappedForms = REQUIRED_FORMS_MAP[mapKey] || [];
                const requiredForms = storedForms.length > 0 ? storedForms : mappedForms;

                const fallbackStatus = act.name === 'Call' ? 'Connected' : (act.name === 'Email' ? 'Sent' : 'Conducted');
                rows.push({
                    activityType: act.name,
                    purpose: purp.name,
                    outcome: out.label,
                    status: out.status || fallbackStatus,
                    stage: stageName,
                    score: out.score || 0,
                    probability: getStageProbability(stageName),
                    requiredForms: requiredForms,
                    scoreModifier: out.scoreModifier || 0,
                    ruleId: out.ruleId || `${act.name}-${purp.name}-${out.label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                });
            }
        }
    }
    return rows;
};

