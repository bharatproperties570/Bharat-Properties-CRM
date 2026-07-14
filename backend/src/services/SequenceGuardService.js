/**
 * SequenceGuardService — Enterprise Activity Sequence Enforcement
 *
 * Real-estate grade protection layer that runs BEFORE stage transition evaluation.
 * It checks whether the current activity is appropriate given the lead's stage and history.
 *
 * Three enforcement modes (configured via SystemSetting 'sequenceConfig'):
 *   - 'off'   → Disabled. All activities pass through.
 *   - 'warn'  → Fires warning in response but does NOT block. Frontend shows alert.
 *   - 'block' → Returns { blocked: true } — frontend must acknowledge before proceeding.
 *
 * Three Guard Types:
 *   1. TERMINAL_REENTRY  — Any qualifying activity on Closed (Lost/Unqualified) lead
 *   2. STAGE_SKIP        — Activity implies stage jump of 2+ levels
 *   3. ACTIVITY_REGRESSION — Activity type is typical for a much earlier stage
 *
 * @module SequenceGuardService
 */

import SystemSetting from '../modules/systemSettings/system.model.js';
import Lead from '../../models/Lead.js';
import Lookup from '../../models/Lookup.js';

// ─── Stage Rank Map ────────────────────────────────────────────────────────────
const STAGE_RANK = {
    'Incoming':             0,
    'Prospect':             1,
    'Opportunity':          2,
    'Negotiation':          3,
    'Closed (Won)':         4,
    'Closed (Lost)':        4,
    'Closed (Unqualified)': 4,
};
const getStageRank = (stage) => STAGE_RANK[stage] ?? -1;
const isTerminal   = (stage) => stage?.startsWith('Closed');

// ─── Activity → Minimum Stage Affinity ────────────────────────────────────────
// Maps each activity type to the minimum pipeline rank it typically belongs to.
const ACTIVITY_STAGE_AFFINITY = {
    'Call':                   0,
    'Email':                  0,
    'WhatsApp':               0,
    'SMS':                    0,
    'Introduction / Call':    0,
    'Meeting':                1,
    'Requirement Gathering':  1,
    'Follow-up Call':         1,
    'Site Visit':             2,
    'Property Presentation':  2,
    'Quotation Sharing':      2,
    'Negotiation Call':       3,
    'Offer Discussion':       3,
    'Legal Document Review':  3,
    'Token Discussion':       3,
};

const getActivityAffinity = (activityType) => {
    if (!activityType) return -1;
    const normalized = activityType.trim();
    if (ACTIVITY_STAGE_AFFINITY[normalized] !== undefined) return ACTIVITY_STAGE_AFFINITY[normalized];
    const lower = normalized.toLowerCase();
    for (const [key, rank] of Object.entries(ACTIVITY_STAGE_AFFINITY)) {
        if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return rank;
    }
    return -1;
};

// ─── Config Cache (60s TTL) ────────────────────────────────────────────────────
let _configCache   = null;
let _cacheExpiry   = 0;
const CONFIG_TTL   = 60_000;

const loadSequenceConfig = async () => {
    if (_configCache && Date.now() < _cacheExpiry) return _configCache;
    const setting = await SystemSetting.findOne({ key: 'sequenceConfig' }).lean();
    if (setting?.value) {
        _configCache  = setting.value;
        _cacheExpiry  = Date.now() + CONFIG_TTL;
        return _configCache;
    }
    return {
        enforcementMode: 'warn',
        sequence: [
            { stage: 'Incoming',    order: 0, requiredActivity: null },
            { stage: 'Prospect',    order: 1, requiredActivity: 'Call' },
            { stage: 'Opportunity', order: 2, requiredActivity: 'Site Visit' },
            { stage: 'Negotiation', order: 3, requiredActivity: 'Meeting' },
        ]
    };
};

// Called by system-setting save route to bust cache
export const invalidateSequenceGuardCache = () => {
    _configCache = null;
    _cacheExpiry = 0;
};

// ─── Main Evaluation ───────────────────────────────────────────────────────────
/**
 * @param {string}  leadId         - MongoDB Lead _id
 * @param {string}  activityType   - e.g. 'Site Visit'
 * @param {string}  computedStage  - Stage engine has computed after this activity
 * @returns {Promise<{ passed, mode, warnings, blocked }>}
 */
export const evaluateSequenceGuard = async (leadId, activityType, computedStage) => {
    const warnings = [];

    try {
        const config = await loadSequenceConfig();
        const mode   = config.enforcementMode || 'off';

        if (mode === 'off') return { passed: true, mode, warnings: [], blocked: false };

        let lead;
        try {
            lead = await Lead.findById(leadId).populate('stage', 'lookup_value').select('stage').lean();
        } catch (populateError) {
            // Fallback for legacy leads where stage is stored as a direct string instead of ObjectId
            lead = await Lead.findById(leadId).select('stage').lean();
        }
        if (!lead) return { passed: true, mode, warnings: [], blocked: false };

        // Handle both populated lookup and string literal
        const currentStage = lead.stage?.lookup_value || (typeof lead.stage === 'string' ? lead.stage : 'Incoming');
        const currentRank    = getStageRank(currentStage);
        const computedRank   = getStageRank(computedStage);
        const activityAffinity = getActivityAffinity(activityType);

        // GUARD 1: Terminal Re-entry
        if (isTerminal(currentStage)) {
            warnings.push({
                code:         'TERMINAL_REENTRY',
                message:      `Lead is ${currentStage}. This activity will attempt to re-open a closed lead. Confirm this is intentional.`,
                severity:     mode === 'block' ? 'block' : 'warn',
                currentStage,
                activityType
            });
        }

        // GUARD 2: Stage Skip (computed stage jumps 2+ levels from current)
        if (!isTerminal(currentStage) && computedStage && computedRank - currentRank >= 2) {
            const sequence = (config.sequence || []).sort((a, b) => a.order - b.order);
            const skippedStages = sequence
                .filter(s => { const r = getStageRank(s.stage); return r > currentRank && r < computedRank; })
                .map(s => s.stage);

            if (skippedStages.length > 0) {
                const requiredActivities = sequence
                    .filter(s => skippedStages.includes(s.stage) && s.requiredActivity)
                    .map(s => `${s.stage}: "${s.requiredActivity}"`);

                warnings.push({
                    code:         'STAGE_SKIP',
                    message:      `Stage jump: ${currentStage} → ${computedStage}. Skipped: ${skippedStages.join(', ')}.${requiredActivities.length ? ' Recommended activities: ' + requiredActivities.join('; ') : ''}`,
                    severity:     'warn', // Real estate is non-linear — never hard block a skip
                    skippedStages,
                    currentStage,
                    computedStage
                });
            }
        }

        // GUARD 3: Activity Regression (activity typical for earlier stage on advanced lead)
        if (activityAffinity !== -1 && activityAffinity < currentRank && !isTerminal(currentStage)) {
            const affStageName = Object.keys(STAGE_RANK).find(k => STAGE_RANK[k] === activityAffinity) || 'an earlier stage';
            warnings.push({
                code:         'ACTIVITY_REGRESSION',
                message:      `"${activityType}" is typically used at "${affStageName}" but this lead is at "${currentStage}". Confirm this is a re-engagement, not a data entry error.`,
                severity:     'warn',
                activityType,
                activityTypicalStage: affStageName,
                currentStage
            });
        }

        const blocked = mode === 'block' && warnings.some(w => w.severity === 'block');

        return { passed: warnings.length === 0, mode, warnings, blocked };

    } catch (err) {
        // Non-critical — never block activity completion because of guard failure
        console.error('[SequenceGuardService] Error (non-critical):', err.message);
        return { passed: true, mode: 'off', warnings: [], blocked: false };
    }
};
