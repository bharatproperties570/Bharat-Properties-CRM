import SystemSetting from '../modules/systemSettings/system.model.js';
import Lead from '../../models/Lead.js';
import Lookup from '../../models/Lookup.js';
import { DEFAULT_AGING_RULES } from '../../../src/utils/agingEngine.js';

/**
 * Enterprise-Grade Ageing & Decay Service
 * Automatically scans active leads/deals and applies Risk Flags, Score Penalties, and Auto-Stalls based on admin configuration.
 */
export const scanAndEnforce = async () => {
    try {
        console.log('[AgeingDecayService] Starting automated pipeline cleaning scan...');
        
        // 1. Fetch live aging rules from SystemSettings
        const setting = await SystemSetting.findOne({ key: 'agingRules' }).lean();
        const rules = setting?.value || DEFAULT_AGING_RULES;
        
        // Lookup Terminal Stages to skip them
        const terminalLookups = await Lookup.find({ type: 'stage', value: { $in: ['Closed (Won)', 'Closed (Lost)', 'Stalled'] } }).lean();
        const terminalStageIds = terminalLookups.map(l => l._id.toString());
        
        // Query active leads only
        // Some legacy leads might have stage as a string, but the query should exclude both forms if possible.
        const activeLeads = await Lead.find({
            $and: [
                { stage: { $nin: ['Closed (Won)', 'Closed (Lost)', 'Stalled'] } },
                { stage: { $nin: terminalStageIds } }
            ]
        }).populate('stage', 'lookup_value');

        let modifiedCount = 0;
        let stalledCount = 0;

        const now = new Date();

        for (const lead of activeLeads) {
            let needsSave = false;
            let currentStageLabel = typeof lead.stage === 'string' ? lead.stage : (lead.stage?.lookup_value || 'New');
            
            // Calculate aging days
            const createdAt = lead.createdAt || now;
            const stageChangedAt = lead.stageChangedAt || createdAt;
            const lastActivityAt = lead.lastActivityAt || lead.updatedAt || createdAt;

            const stageDays = Math.floor((now - new Date(stageChangedAt)) / 86400000);
            const activityGapDays = Math.floor((now - new Date(lastActivityAt)) / 86400000);

            // Initialize risk flags if missing
            if (!Array.isArray(lead.riskFlags)) {
                lead.riskFlags = [];
            }
            
            const existingFlags = lead.riskFlags.map(f => f.type);
            const addRiskFlag = (type, message, severity) => {
                if (!existingFlags.includes(type)) {
                    lead.riskFlags.push({ type, message, severity, dateAdded: new Date() });
                    needsSave = true;
                }
            };

            // Rule 1: Activity Gap
            const gapRule = rules.activityGapDays || DEFAULT_AGING_RULES.activityGapDays;
            if (activityGapDays > (gapRule.value || 7)) {
                if (gapRule.action === 'Risk Flag') {
                    addRiskFlag('activity_gap', `No activity for ${activityGapDays} days`, 'medium');
                } else if (gapRule.action === 'Score Penalty') {
                    if (lead.leadScore > 10) {
                        lead.leadScore -= 5;
                        addRiskFlag('activity_gap_penalty', `Score penalized -5 due to inactivity (${activityGapDays} days)`, 'medium');
                        needsSave = true;
                    }
                }
            }

            // Rule 2: Negotiation Stalled (Deal Death Enhancement)
            if (currentStageLabel === 'Negotiation') {
                const maxRule = rules.negotiationMaxDays || DEFAULT_AGING_RULES.negotiationMaxDays;
                const stallRule = rules.negotiationStalledDays || DEFAULT_AGING_RULES.negotiationStalledDays;
                
                const maxDays = maxRule.value || 15;
                const stallDays = stallRule.value || 21;
                
                // Risk Flag
                if (stageDays > maxDays) {
                    addRiskFlag('negotiation_stale', `Negotiation prolonged for ${stageDays} days`, 'high');
                }

                // Auto Stall (Enterprise Enhancement)
                if (stageDays > stallDays && activityGapDays > 14) {
                    if (stallRule.action === 'Auto Stall') {
                        // Change stage to Stalled or Closed (Lost)
                        const stalledLookup = await Lookup.findOne({ type: 'stage', value: 'Stalled' }).lean();
                        if (stalledLookup) {
                            lead.stage = stalledLookup._id;
                        } else {
                            lead.stage = 'Stalled'; // Fallback
                        }
                        lead.stageChangedAt = new Date();
                        addRiskFlag('auto_stalled', `Automatically stalled after ${stageDays} days without progress`, 'critical');
                        stalledCount++;
                        needsSave = true;
                        console.log(`[AgeingDecayService] Auto-stalled lead ${lead._id}`);
                        // Do not continue here, so it proceeds to save() at the end
                    }
                }
            }

            // Rule 3: Opportunity Max Days
            if (currentStageLabel === 'Opportunity') {
                const oppDays = rules.opportunityMaxDays?.value || 21;
                if (stageDays > oppDays) {
                    addRiskFlag('opportunity_stale', `Opportunity stalled for ${stageDays} days`, 'high');
                }
            }

            // Rule 4: Prospect Max Days
            if (currentStageLabel === 'Prospect') {
                const proDays = rules.prospectMaxDays?.value || 30;
                if (stageDays > proDays) {
                    addRiskFlag('prospect_stale', `Prospect stale for ${stageDays} days`, 'medium');
                }
            }
            
            // Rule 5: Booked without Agreement
            if (currentStageLabel === 'Booked') {
                const bookDays = rules.bookedNoAgreementDays?.value || 10;
                if (stageDays > bookDays) {
                    addRiskFlag('booked_no_agreement', `Booked ${stageDays} days without agreement`, 'critical');
                }
            }

            try {
                if (needsSave) {
                    await lead.save();
                    modifiedCount++;
                }
            } catch (err) {
                console.error(`[AgeingDecayService] Failed to save lead ${lead._id}:`, err.message);
            }
        }

        console.log(`[AgeingDecayService] Scan complete. Modified ${modifiedCount} leads, Stalled ${stalledCount} leads.`);
        return { success: true, modifiedCount, stalledCount };

    } catch (error) {
        console.error('[AgeingDecayService] Error during scan:', error);
        return { success: false, error: error.message };
    }
};
