import Deal from '../../models/Deal.js';
import Lead from '../../models/Lead.js';
import Lookup from '../../models/Lookup.js';
import SystemSetting from '../modules/systemSettings/system.model.js';
import AuditLog from '../../models/AuditLog.js';
import { createNotification } from '../../controllers/notification.controller.js';
import StageTransitionEngine from './StageTransitionEngine.js';

class DealSyncEngine {
    async syncLeadToDeal(leadId, newStageName, triggeredByUserId = null, visitedProperties = []) {
        try {
            console.log(`[DealSyncEngine] Evaluating sync for Lead: ${leadId} -> ${newStageName}`);
            
            if (!visitedProperties || visitedProperties.length === 0) {
                console.log(`[DealSyncEngine] No specific visited properties. Deal sync skipped to preserve specific unit logic.`);
                return;
            }

            const lead = await Lead.findById(leadId).lean();
            if (!lead) return;

            let deals = await Deal.find({ leadId: leadId });
            if (deals.length === 0 && lead.contactDetails) {
                deals = await Deal.find({
                    $or: [
                        { buyer: lead.contactDetails },
                        { associatedContact: lead.contactDetails }
                    ]
                });
            }

            if (deals.length === 0) {
                console.log(`[DealSyncEngine] No active deals found for Lead: ${leadId}. Sync skipped.`);
                return;
            }

            // Iterate over each visited property to apply unit-specific outcome logic
            for (const vp of visitedProperties) {
                if (!vp.project) continue;

                // Find matching deal
                // We attempt to match by project name or ID, and if property (unit) is given, match that too.
                const matchingDeals = deals.filter(d => {
                    const projectMatches = (d.projectName && d.projectName.toLowerCase() === vp.project.toLowerCase()) || 
                                           (d.project && String(d.project) === String(vp.project));
                    if (!projectMatches) return false;
                    
                    if (vp.property) {
                        return (d.unitNumber && String(d.unitNumber).toLowerCase() === String(vp.property).toLowerCase()) ||
                               (d.unitNo && String(d.unitNo).toLowerCase() === String(vp.property).toLowerCase());
                    }
                    return true; // Match if project matches and no specific unit is provided in visit
                });

                if (matchingDeals.length === 0) {
                    console.log(`[DealSyncEngine] No Deal found matching project: ${vp.project}, unit: ${vp.property}`);
                    continue;
                }

                // Resolve the stage based on the specific result of this unit
                // We use 'Site Visit' as a generic activity type here to force the rule engine, 
                // since both Meeting and Site Visit outcome rules map similarly in the rule engine.
                const transitionEvaluation = await StageTransitionEngine.resolveTransition('Site Visit', vp.result || '', '', '');
                
                if (!transitionEvaluation || !transitionEvaluation.rule) {
                    console.log(`[DealSyncEngine] No transition rule found for result: ${vp.result}`);
                    continue;
                }

                const targetDealStageStr = transitionEvaluation.rule.newStage;

                // Resolve Lookup
                let targetStageVal = targetDealStageStr;
                const lookup = await Lookup.findOne({ lookup_type: { $regex: /^stage$/i }, lookup_value: { $regex: new RegExp(`^${targetDealStageStr}$`, 'i') } });
                if (lookup) {
                    targetStageVal = lookup.lookup_value;
                }

                for (const deal of matchingDeals) {
                    const oldStage = deal.stage;
                    const currentStageStr = (typeof oldStage === 'object' && oldStage ? oldStage.lookup_value : oldStage) || '';
                    
                    if (currentStageStr.toString().toLowerCase() === targetStageVal.toLowerCase()) {
                        continue; 
                    }

                    deal.stage = targetStageVal;
                    deal.stageChangedAt = new Date();
                    deal.stageSyncReason = `Auto-synced from specific unit outcome: ${vp.result}`;
                    
                    await deal.save();

                    // Audit Log for Deal
                    await AuditLog.logEntityUpdate(
                        'deal_synced',
                        'deal',
                        deal._id,
                        deal.projectName || 'Deal',
                        triggeredByUserId,
                        { fromStage: currentStageStr, toStage: targetStageVal, reason: deal.stageSyncReason },
                        `Deal stage auto-synced to ${targetStageVal} due to unit outcome "${vp.result}".`
                    );
                    
                    // Notify Deal Owner
                    if (deal.owner) {
                        const ownerId = deal.owner._id || deal.owner;
                        if (ownerId.toString() !== (triggeredByUserId || '').toString()) {
                            await createNotification(
                                ownerId,
                                'system',
                                '🔄 Deal Auto-Synced',
                                `Deal for ${deal.projectName || 'client'} synced to ${targetStageVal} based on unit-specific outcome.`,
                                `/deals/${deal._id}`,
                                { dealId: deal._id }
                            );
                        }
                    }
                }
            }

        } catch (error) {
            console.error('[DealSyncEngine] Failed to sync Lead to Deal:', error);
        }
    }
}

export default new DealSyncEngine();
